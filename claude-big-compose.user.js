// ==UserScript==
// @name         Claude 大きい入力画面（辞書つき）
// @namespace    local.claude.bigcompose
// @version      1.4.0
// @description  ✏️ボタンで画面いっぱいの入力画面を開き、辞書から名前を貼り付けながら書いてそのままClaudeに送信できます。横画面のときは元の入力欄を隠します
// @match        https://claude.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // 設定
    // =========================================================

    const CONFIG = {

        /*
         * ✏️ボタンの位置（縦向きのとき）
         * 左下の角に置いています（右下の☰ボタンと左右対称）。
         */
        portrait: { left: '12px', right: '', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' },

        /*
         * ✏️ボタンの位置（横向きのとき）
         * 縦向きと同じ、左下の角です。
         */
        landscape: { left: '12px', right: '', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' },

        /*
         * true … 縦向きのときも✏️ボタンを出す
         */
        showInPortrait: true,

        /*
         * true … 横向きのとき、Claudeの元の入力欄を隠す
         */
        hideInputInLandscape: true,

        /*
         * true … スマホ・タブレットのときだけ「横向き」あつかいにする
         */
        landscapeOnlyTouch: true,

        /*
         * 入力画面の文字の大きさ(px)と行間
         * （16px未満にするとiPhoneで勝手に拡大されることがあります）
         */
        fontSize: 17,
        lineHeight: 1.7,

        /*
         * 辞書から貼り付けたら辞書の一覧を閉じるか
         * false にすると一覧を開いたまま続けて貼れます
         */
        closeDictAfterInsert: true,

        /*
         * 辞書の一覧を閉じたあと、すぐ続きを打てるように
         * キーボードを出し直すか
         */
        keyboardAfterDict: true
    };

    const IDS = {
        open: 'ccm-open',
        overlay: 'ccm-overlay',
        dict: 'ccm-dict',
        toast: 'ccm-toast'
    };

    const KEYS = {
        draft: 'ccm_draft',
        dictText: 'ccm_dict_text',
        dictName: 'ccm_dict_name'
    };

    const MARK = 'data-ccm-input';
    const HIDE_INPUT_CLASS = 'ccm-hide-input';
    const OPEN_CLASS = 'ccm-open-now';

    const EDITOR_SELECTOR = 'div.ProseMirror[contenteditable="true"]';

    const MESSAGE_SELECTOR = [
        '[data-testid="user-message"]',
        '.font-claude-response',
        '.font-claude-message',
        '.standard-markdown',
        '.progressive-markdown'
    ].join(',');


    // =========================================================
    // 保存
    // =========================================================

    function load(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (_) {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v;
        }
    }

    function save(key, value) {
        try {
            GM_setValue(key, value);
        } catch (_) {
            localStorage.setItem(key, value);
        }
    }


    // =========================================================
    // 小物
    // =========================================================

    function el(tag, style, text) {
        const node = document.createElement(tag);
        if (style) {
            Object.assign(node.style, style);
        }
        if (text != null) {
            node.textContent = text;
        }
        return node;
    }

    function wait(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function toast(message, error) {

        let box = document.getElementById(IDS.toast);

        if (!box) {
            box = el('div', {
                position: 'fixed',
                left: '12px',
                right: '12px',
                top: '12px',
                zIndex: 2147483647,
                padding: '11px',
                borderRadius: '9px',
                color: '#fff',
                fontSize: '14px',
                textAlign: 'center',
                boxShadow: '0 3px 14px rgba(0,0,0,.3)',
                pointerEvents: 'none'
            });
            box.id = IDS.toast;
            document.body.appendChild(box);
        }

        box.style.background = error ? '#a93232' : '#245e43';
        box.textContent = message;
        box.hidden = false;

        clearTimeout(toast.timer);
        toast.timer = setTimeout(function () { box.hidden = true; }, 2800);
    }


    // =========================================================
    // 向き
    // =========================================================

    const landscapeQuery = window.matchMedia('(orientation: landscape)');
    const touchQuery = window.matchMedia('(pointer: coarse)');

    function isLandscape() {
        return (
            landscapeQuery.matches &&
            (!CONFIG.landscapeOnlyTouch || touchQuery.matches)
        );
    }


    // =========================================================
    // スタイル
    // =========================================================

    const CSS =
        /* 横向きのとき元の入力欄を隠す */
        'html.' + HIDE_INPUT_CLASS + ' [' + MARK + ']{display:none !important;}' +

        /* 横画面スクリプトがボタンを隠すときは✏️も隠す（一番下以外） */
        'html.cls-hide #' + IDS.open + '{display:none !important;}' +

        /* 入力画面を開いている間は✏️を隠す */
        'html.' + OPEN_CLASS + ' #' + IDS.open + '{display:none !important;}' +

        /* スクロール中は✏️を透明にする */
        'html.ccm-scrolling #' + IDS.open + '{opacity:0 !important;pointer-events:none !important;}';

    let sheet = null;
    let styleEl = null;

    function ensureStyle() {

        if (!sheet && !styleEl) {
            try {
                sheet = new CSSStyleSheet();
                sheet.replaceSync(CSS);
            } catch (_) {
                sheet = null;
                styleEl = document.createElement('style');
                styleEl.textContent = CSS;
            }
        }

        if (sheet) {
            try {
                if (!document.adoptedStyleSheets.includes(sheet)) {
                    document.adoptedStyleSheets =
                        document.adoptedStyleSheets.concat([sheet]);
                }
                return;
            } catch (_) {
                sheet = null;
                styleEl = document.createElement('style');
                styleEl.textContent = CSS;
            }
        }

        if (styleEl && !styleEl.isConnected) {
            document.documentElement.appendChild(styleEl);
        }
    }


    // =========================================================
    // Claudeの入力欄
    // =========================================================

    let wrapper = null;
    let sending = false;

    function findEditor() {
        return document.querySelector(EDITOR_SELECTOR);
    }

    function isDocScroller(node) {
        return (
            node === document.scrollingElement ||
            node === document.documentElement ||
            node === document.body
        );
    }

    /*
     * 入力欄のまわり（下に貼りついている部分）ごと隠すための箱を探す
     */
    function findWrapper(editor) {

        let pick = null;
        let node = editor.parentElement;

        while (node && !isDocScroller(node)) {

            const pos = getComputedStyle(node).position;

            if (
                (pos === 'sticky' || pos === 'fixed') &&
                !node.querySelector(MESSAGE_SELECTOR)
            ) {
                pick = node;
            }

            node = node.parentElement;
        }

        return (
            pick ||
            editor.closest('fieldset') ||
            editor.closest('form') ||
            editor.parentElement
        );
    }

    function markInput() {

        const editor = findEditor();

        if (!editor) {
            return null;
        }

        if (wrapper && wrapper.isConnected && wrapper.contains(editor)) {
            if (!wrapper.hasAttribute(MARK)) {
                wrapper.setAttribute(MARK, '');
            }
            return wrapper;
        }

        document.querySelectorAll('[' + MARK + ']').forEach(function (n) {
            n.removeAttribute(MARK);
        });

        wrapper = findWrapper(editor);

        if (wrapper) {
            wrapper.setAttribute(MARK, '');
        }

        return wrapper;
    }

    function applyInputHiding() {
        document.documentElement.classList.toggle(
            HIDE_INPUT_CLASS,
            CONFIG.hideInputInLandscape && isLandscape() && !sending
        );
    }


    // =========================================================
    // ✏️ボタン
    // =========================================================

    function applyOpenPosition() {

        const button = document.getElementById(IDS.open);

        if (!button) {
            return;
        }

        const land = isLandscape();
        const pos = land ? CONFIG.landscape : CONFIG.portrait;

        button.style.left = pos.left || '';
        button.style.right = pos.right || '';
        button.style.bottom = pos.bottom;

        button.style.visibility =
            (!land && !CONFIG.showInPortrait) ? 'hidden' : '';
    }

    function installOpenButton() {

        if (!document.body || document.getElementById(IDS.open)) {
            applyOpenPosition();
            return;
        }

        const button = el('button', null, '✏️');

        button.id = IDS.open;
        button.type = 'button';
        button.title = '大きい入力画面を開く';

        button.style.cssText = [
            'position:fixed',
            'z-index:2147483640',
            'width:44px',
            'height:44px',
            'padding:0',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'border:none',
            'border-radius:50%',
            'background:#d0772f',
            'color:#fff',
            'font-size:20px',
            'line-height:1',
            'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
            'user-select:none',
            '-webkit-user-select:none',
            '-webkit-touch-callout:none',
            'touch-action:manipulation',
            'transition:opacity .25s'
        ].join(';');

        button.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        button.addEventListener('mousedown', function (e) { e.preventDefault(); });

        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openOverlay();
        });

        document.body.appendChild(button);

        applyOpenPosition();
    }


    // =========================================================
    // 辞書
    // =========================================================

    /*
     * 1行ずつ「名前(説明)」として読みます。
     * 半角の( と全角の（ のどちらでもOK。
     */
    function parseEntries(text) {

        return String(text || '')
            .split('\n')
            .map(function (line) { return line.trim(); })
            .filter(Boolean)
            .map(function (line) {
                const m = line.match(/^(.*?)[(（](.*?)[)）]?\s*$/);
                if (m && m[1].trim()) {
                    return { name: m[1].trim(), note: m[2].trim() };
                }
                return { name: line, note: '' };
            });
    }

    function decode(buffer) {
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch (_) {
        }
        try {
            return new TextDecoder('shift_jis').decode(buffer);
        } catch (_) {
        }
        return new TextDecoder('utf-8').decode(buffer);
    }

    function pickDictFile(after) {

        const input = document.createElement('input');

        input.type = 'file';
        input.accept = '.txt,text/plain';
        input.style.display = 'none';

        input.addEventListener('change', function () {

            const file = input.files && input.files[0];

            input.remove();

            if (!file) {
                return;
            }

            const reader = new FileReader();

            reader.onload = function () {

                const text = decode(reader.result)
                    .replace(/^\uFEFF/, '')
                    .replace(/\r\n?/g, '\n');

                save(KEYS.dictText, text);
                save(KEYS.dictName, file.name);

                toast('「' + file.name + '」を読み込んだよ（' +
                    parseEntries(text).length + '件）');

                if (after) {
                    after();
                }
            };

            reader.onerror = function () {
                toast('ファイルを読み込めなかったよ', true);
            };

            reader.readAsArrayBuffer(file);
        });

        document.body.appendChild(input);
        input.click();
    }


    // =========================================================
    // 入力画面
    // =========================================================

    let overlay = null;
    let textarea = null;
    let counter = null;
    let draftTimer = null;

    /*
     * 辞書を開く前のカーソル位置（キーボードを閉じても覚えておく）
     */
    let savedCaret = null;

    const BTN = {
        height: '38px',
        padding: '0 12px',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '9px',
        background: 'rgba(255,255,255,0.1)',
        color: '#f7f3ef',
        fontSize: '14px',
        fontWeight: 'bold',
        flex: '0 0 auto',
        touchAction: 'manipulation'
    };

    function makeButton(label, extra, onClick) {

        const b = el('button', Object.assign({}, BTN, extra || {}), label);

        b.type = 'button';

        /*
         * 押してもテキスト欄のカーソルを外さない（PC向け）
         */
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });

        return b;
    }

    function updateCounter() {
        if (counter && textarea) {
            counter.textContent = textarea.value.length + '字';
        }
    }

    function saveDraftSoon() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(function () {
            if (textarea) {
                save(KEYS.draft, textarea.value);
            }
        }, 400);
    }

    /*
     * キーボードが出ても下が隠れないように、
     * 実際に見えている範囲に入力画面を合わせる
     */
    function fitOverlay() {

        if (!overlay) {
            return;
        }

        const vv = window.visualViewport;

        if (!vv) {
            Object.assign(overlay.style, {
                top: '0', left: '0', width: '100%', height: '100%'
            });
            return;
        }

        Object.assign(overlay.style, {
            top: vv.offsetTop + 'px',
            left: vv.offsetLeft + 'px',
            width: vv.width + 'px',
            height: vv.height + 'px'
        });
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', fitOverlay);
        window.visualViewport.addEventListener('scroll', fitOverlay);
    }

    function buildOverlay() {

        overlay = el('div', {
            position: 'fixed',
            zIndex: 2147483646,
            display: 'flex',
            flexDirection: 'column',
            background: '#1e1a18',
            color: '#f7f3ef',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)'
        });

        overlay.id = IDS.overlay;

        /*
         * 上のバー（キーボードに隠れないように上に置く）
         */
        const bar = el('div', {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            overflowX: 'auto',
            flex: '0 0 auto'
        });

        const closeBtn = makeButton('✕', { width: '38px', padding: '0' }, closeOverlay);

        const dictBtn = makeButton('📖 辞書', null, toggleDict);

        const clearBtn = makeButton('🗑', { width: '38px', padding: '0' }, function () {
            if (!textarea.value) {
                return;
            }
            if (window.confirm('書いた文章をぜんぶ消す？')) {
                textarea.value = '';
                save(KEYS.draft, '');
                updateCounter();
                textarea.focus();
            }
        });

        counter = el('div', {
            flex: '1',
            minWidth: '48px',
            textAlign: 'right',
            fontSize: '12px',
            opacity: '0.7',
            whiteSpace: 'nowrap'
        });

        const sendBtn = makeButton('送信 ➤', {
            background: '#d97757',
            border: 'none',
            color: '#fff'
        }, sendToClaude);

        sendBtn.id = 'ccm-send';

        bar.append(closeBtn, dictBtn, clearBtn, counter, sendBtn);

        /*
         * 本文を書く場所
         */
        const body = el('div', {
            position: 'relative',
            flex: '1',
            minHeight: '0',
            display: 'flex'
        });

        textarea = el('textarea', {
            flex: '1',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            color: '#f7f3ef',
            fontSize: CONFIG.fontSize + 'px',
            lineHeight: String(CONFIG.lineHeight),
            fontFamily: 'inherit'
        });

        textarea.placeholder = 'ここに書いてね…';

        textarea.addEventListener('input', function () {
            updateCounter();
            saveDraftSoon();
        });

        /*
         * PC用：Ctrl+Enter（Macは⌘+Enter）で送信、Escで閉じる
         */
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendToClaude();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeOverlay();
            }
        });

        body.append(textarea);

        overlay.append(bar, body);

        document.body.appendChild(overlay);
    }

    function openOverlay() {

        if (!overlay || !overlay.isConnected) {
            buildOverlay();
        }

        let draft = String(load(KEYS.draft, '') || '');

        /*
         * 下書きが空で、Claudeの入力欄に書きかけがあれば引き継ぐ
         */
        if (!draft) {
            const editor = findEditor();
            const existing = editor ? editor.innerText.replace(/\n+$/, '') : '';
            if (existing.trim()) {
                draft = existing;
            }
        }

        textarea.value = draft;
        savedCaret = null;

        overlay.style.display = 'flex';
        document.documentElement.classList.add(OPEN_CLASS);

        fitOverlay();
        updateCounter();

        textarea.focus();

        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
    }

    function closeOverlay() {

        if (!overlay) {
            return;
        }

        if (textarea) {
            save(KEYS.draft, textarea.value);
        }

        closeDict();

        if (textarea) {
            textarea.blur();
        }

        overlay.style.display = 'none';
        document.documentElement.classList.remove(OPEN_CLASS);
    }


    // =========================================================
    // 入力画面の中の辞書一覧
    // =========================================================

    /*
     * 今のカーソル位置を覚えてからキーボードを閉じる
     */
    function rememberCaretAndHideKeyboard() {

        if (!textarea) {
            return;
        }

        if (document.activeElement === textarea || savedCaret === null) {
            const len = textarea.value.length;
            savedCaret = {
                start: textarea.selectionStart != null ? textarea.selectionStart : len,
                end: textarea.selectionEnd != null ? textarea.selectionEnd : len
            };
        }

        textarea.blur();

        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
    }

    /*
     * 辞書を閉じたあと、覚えておいた位置でキーボードを出し直す
     */
    function backToTyping() {

        if (!textarea || !CONFIG.keyboardAfterDict) {
            return;
        }

        textarea.focus();

        if (savedCaret) {
            textarea.setSelectionRange(savedCaret.start, savedCaret.end);
        }
    }

    function closeDict() {
        const panel = document.getElementById(IDS.dict);
        if (panel) {
            panel.remove();
            return true;
        }
        return false;
    }

    function toggleDict() {

        if (closeDict()) {
            backToTyping();
            return;
        }

        rememberCaretAndHideKeyboard();

        const entries = parseEntries(load(KEYS.dictText, ''));

        /*
         * まだ読み込んでいなければファイル選択へ
         */
        if (!entries.length) {
            pickDictFile(openDict);
            return;
        }

        openDict();
    }

    function openDict() {

        closeDict();

        const entries = parseEntries(load(KEYS.dictText, ''));

        /*
         * 入力画面の本文エリアいっぱいに広げる
         * （キーボードが閉じると入力画面も画面いっぱいに戻ります）
         */
        const panel = el('div', {
            position: 'absolute',
            left: '6px',
            right: '6px',
            top: '6px',
            bottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
            zIndex: '2',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px',
            borderRadius: '10px',
            background: '#fff',
            color: '#222',
            boxShadow: '0 4px 20px rgba(0,0,0,.45)',
            boxSizing: 'border-box'
        });

        panel.id = IDS.dict;

        const head = el('div', {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px'
        });

        const title = el('div', {
            flex: '1',
            minWidth: '0',
            fontWeight: 'bold',
            fontSize: '13px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        }, '📖 ' + String(load(KEYS.dictName, '') || '辞書') +
            '（' + entries.length + '件）');

        const lightBtn = {
            height: '36px',
            padding: '0 12px',
            border: '1px solid #999',
            borderRadius: '7px',
            background: '#eee',
            color: '#222',
            fontSize: '13px',
            fontWeight: 'bold',
            flex: '0 0 auto'
        };

        const loadBtn = el('button', lightBtn, '読込');
        loadBtn.type = 'button';
        loadBtn.addEventListener('click', function () {
            pickDictFile(openDict);
        });

        const close = el('button', lightBtn, '閉じる');
        close.type = 'button';
        close.addEventListener('mousedown', function (e) { e.preventDefault(); });
        close.addEventListener('click', function () {
            closeDict();
            backToTyping();
        });

        head.append(title, loadBtn, close);

        const list = el('div', {
            flex: '1',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            display: 'grid',
            gridTemplateColumns: '1fr',  // 1人1行（縦1列）
            gridAutoRows: 'max-content', // 中身に合わせた高さにする（説明文が隠れないように）
            alignContent: 'start',
            gap: '6px'
        });

        if (!entries.length) {
            list.append(el('div', { padding: '10px', color: '#777', fontSize: '13px' },
                '「読込」から辞書ファイル（名前(説明) の形式）を選んでね'));
        }

        entries.forEach(function (entry) {

            const item = el('button', {
                display: 'block',
                width: '100%',
                minHeight: '62px',
                textAlign: 'left',
                padding: '12px 14px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                background: '#f7f7f7',
                color: '#222',
                whiteSpace: 'normal',
                touchAction: 'manipulation'
            });

            item.type = 'button';

            item.append(el('div', { fontSize: '18px', fontWeight: 'bold' }, entry.name));

            if (entry.note) {
                item.append(el('div', {
                    marginTop: '4px',
                    fontSize: '14px',
                    color: '#777',
                    lineHeight: '1.5',
                    // 説明文は折り返して2行まで（はみ出す分は「…」）
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-all',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: '2',
                    overflow: 'hidden'
                }, entry.note));
            }

            item.addEventListener('mousedown', function (e) { e.preventDefault(); });

            item.addEventListener('click', function (e) {

                e.preventDefault();
                e.stopPropagation();

                insertIntoTextarea(entry.name);

                if (CONFIG.closeDictAfterInsert) {
                    closeDict();
                    backToTyping();
                }
            });

            list.append(item);
        });

        panel.append(head, list);

        textarea.parentElement.append(panel);
    }

    /*
     * 覚えておいたカーソル位置に貼り付け
     */
    function insertIntoTextarea(text) {

        const len = textarea.value.length;
        const start = savedCaret ? savedCaret.start : len;
        const end = savedCaret ? savedCaret.end : start;

        textarea.setRangeText(text, start, end, 'end');

        const pos = start + text.length;

        /*
         * 続けて貼ったときに後ろへつながるように
         */
        savedCaret = { start: pos, end: pos };

        updateCounter();
        saveDraftSoon();

        toast('「' + text + '」を貼り付けたよ');
    }


    // =========================================================
    // Claudeへ送信
    // =========================================================

    function isGenerating() {
        return !!(
            document.querySelector('[data-is-streaming="true"]') ||
            document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"]')
        );
    }

    function findSendButton() {

        const selectors = [
            'button[aria-label="Send message"]',
            'button[aria-label*="送信"]',
            'button[aria-label*="Send"]'
        ];

        for (const s of selectors) {
            const scoped = wrapper && wrapper.querySelector(s);
            if (scoped) {
                return scoped;
            }
            const any = document.querySelector(s);
            if (any) {
                return any;
            }
        }

        return null;
    }

    function editorText(editor) {
        return (editor.innerText || '').replace(/\s+/g, '');
    }

    /*
     * Claudeの入力欄の中身を入れ替える。
     * まず「貼り付け」として入れて（改行がきれいに残る）、
     * ダメなら文字入力として入れます。
     */
    async function putIntoEditor(editor, text) {

        editor.focus();

        const selectAll = function () {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);
        };

        selectAll();

        let handled = false;

        try {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const ev = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(ev);
            handled = ev.defaultPrevented;
        } catch (_) {
            handled = false;
        }

        await wait(80);

        const want = text.replace(/\s+/g, '');

        if (!handled || editorText(editor) !== want) {

            selectAll();

            try {
                document.execCommand('insertText', false, text);
            } catch (_) {
            }

            await wait(80);
        }

        return editorText(editor).length > 0;
    }

    async function sendToClaude() {

        if (sending) {
            return;
        }

        const text = textarea.value.replace(/\s+$/, '');

        if (!text.trim()) {
            toast('まだ何も書いてないよ', true);
            return;
        }

        if (isGenerating()) {
            toast('Claudeが返事を書いてる途中だよ。終わってから送ってね', true);
            return;
        }

        const editor = findEditor();

        if (!editor) {
            toast('Claudeの入力欄が見つからなかったよ', true);
            return;
        }

        save(KEYS.draft, textarea.value);

        /*
         * 隠している入力欄を一時的に出す（隠れたままだと入力できない）
         */
        sending = true;
        applyInputHiding();
        document.documentElement.classList.remove('cls-hide');

        closeDict();
        textarea.blur();

        const sendBtnInOverlay = document.getElementById('ccm-send');
        if (sendBtnInOverlay) {
            sendBtnInOverlay.textContent = '送信中…';
        }

        let ok = false;

        try {

            const filled = await putIntoEditor(editor, text);

            if (!filled) {
                throw new Error('fill');
            }

            /*
             * 送信ボタンが押せるようになるまで待って押す
             */
            let button = null;

            for (let i = 0; i < 30; i++) {
                button = findSendButton();
                if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
                    break;
                }
                await wait(100);
            }

            if (!button || button.disabled) {
                throw new Error('button');
            }

            button.click();

            /*
             * 入力欄が空になったら送信成功
             */
            for (let i = 0; i < 40; i++) {
                await wait(100);
                const current = findEditor();
                if (!current || !editorText(current)) {
                    ok = true;
                    break;
                }
            }

        } catch (_) {
            ok = false;
        }

        if (sendBtnInOverlay) {
            sendBtnInOverlay.textContent = '送信 ➤';
        }

        if (ok) {

            textarea.value = '';
            save(KEYS.draft, '');
            savedCaret = null;
            updateCounter();

            sending = false;
            applyInputHiding();

            closeOverlay();

            toast('送信したよ！');

        } else {

            /*
             * うまく送れなかったときは、入力欄を出したままにして
             * 自分で送信ボタンを押せるようにする
             */
            closeOverlay();

            toast('入力欄には入れたけど送信できなかったよ。送信ボタンを押してね', true);

            setTimeout(function () {
                sending = false;
                applyInputHiding();
            }, 60000);
        }
    }


    // =========================================================
    // スクロール中はボタンを透明にする
    // =========================================================
    //
    // 指でスクロールしている間（はじいた後の惰性スクロールも）はボタンを透明にして、
    // 止まってから少したったら元に戻します。
    // Claudeが生成中に自動でスクロールするときは透明にしません。

    const SCROLL_HIDE = {
        /* 止まってから出てくるまでの時間(ms) */
        showDelay: 800,
        /* 指を離してからこの時間(ms)までのスクロールは「指で動かした」あつかい */
        flingTime: 2500
    };

    const SCROLLING_CLASS = 'ccm-scrolling';

    let ccmTouching = false;
    let ccmLastTouch = 0;
    let ccmShowTimer = null;

    function ccmMarkTouch() {
        ccmLastTouch = Date.now();
    }

    document.addEventListener('touchstart', function () {
        ccmTouching = true;
        ccmMarkTouch();
    }, { capture: true, passive: true });

    document.addEventListener('touchend', function () {
        ccmTouching = false;
        ccmMarkTouch();
    }, { capture: true, passive: true });

    document.addEventListener('touchcancel', function () {
        ccmTouching = false;
        ccmMarkTouch();
    }, { capture: true, passive: true });

    /* PCのマウスホイール */
    document.addEventListener('wheel', ccmMarkTouch, { capture: true, passive: true });

    document.addEventListener('scroll', function (event) {

        const target = event.target;

        /* ボタン自身のメニューなどの中のスクロールでは隠さない */
        if (
            target &&
            target.closest &&
            target.closest('#ccm-overlay')
        ) {
            return;
        }

        if (!ccmTouching && Date.now() - ccmLastTouch > SCROLL_HIDE.flingTime) {
            return;
        }

        document.documentElement.classList.add(SCROLLING_CLASS);

        clearTimeout(ccmShowTimer);

        ccmShowTimer = setTimeout(function () {
            document.documentElement.classList.remove(SCROLLING_CLASS);
        }, SCROLL_HIDE.showDelay);

    }, { capture: true, passive: true });


    // =========================================================
    // 起動
    // =========================================================

    function tick() {
        ensureStyle();
        markInput();
        applyInputHiding();
        installOpenButton();
    }

    function onOrientation() {
        applyInputHiding();
        applyOpenPosition();
        fitOverlay();
    }

    [landscapeQuery, touchQuery].forEach(function (mq) {
        if (mq.addEventListener) {
            mq.addEventListener('change', onOrientation);
        } else if (mq.addListener) {
            mq.addListener(onOrientation);
        }
    });

    window.addEventListener('resize', onOrientation);

    /*
     * 入力欄が作り直されたらすぐに印をつけ直す
     */
    let markTicking = false;

    const observer = new MutationObserver(function () {

        if (markTicking) {
            return;
        }

        markTicking = true;

        requestAnimationFrame(function () {
            markTicking = false;
            markInput();
        });
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    tick();

    setInterval(tick, 1000);

})();
