// ==UserScript==
// @name         ChatGPT テキストファイル表示ボタン
// @namespace    local.chatgpt.textviewer
// @version      1.0.0
// @description  長押しでQuickPaste辞書（名前(説明)形式のテキスト）を読み込み、短押しで一覧から選んだ名前をカーソル位置へ貼り付けます（Claude版 1.3.0 からの移植）
// @match        https://chatgpt.com/*
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
         * まとめメニューから呼び出せるように、IDはClaude版と同じです
         */
        buttonId: 'claude-textviewer-button',
        panelId: 'claude-textviewer-panel',

        /*
         * ボタンの位置（縦向きのとき）。
         * 数字を大きくすると上へ、小さくすると下へ動きます。
         */
        bottom: '198px',
        right: '12px',

        /*
         * スマホを横向きにしたときの位置。
         * 送信ボタンなどと重なったら数字を調整してください。
         */
        bottomLandscape: '94px',

        /*
         * true … スマホ・タブレットのときだけ横向きの位置を使う
         * false … PCの横長画面でも横向きの位置を使う
         */
        landscapeOnlyTouch: true,

        /*
         * ボタンの絵文字
         * loaded   … 辞書を読み込み済みのとき
         * unloaded … まだ読み込んでいないとき
         */
        iconLoaded: '📖',
        iconUnloaded: '📂',

        /*
         * 何ミリ秒押し続けたら長押し扱いにするか
         */
        holdTime: 550,

        /*
         * 貼り付けたら一覧を閉じるか。
         * false にすると開いたまま続けて貼れます。
         */
        closeAfterInsert: true
    };

    const KEYS = {
        text: 'textviewer_text',
        name: 'textviewer_name'
    };


    // =========================================================
    // 保存
    // =========================================================

    function load(key, fallback) {

        try {
            return GM_getValue(key, fallback);
        } catch (_) {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
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
    // 通知
    // =========================================================

    function toast(message, error = false) {

        let box = document.getElementById(CONFIG.buttonId + '-toast');

        if (!box) {

            box = document.createElement('div');
            box.id = CONFIG.buttonId + '-toast';

            Object.assign(box.style, {
                position: 'fixed',
                left: '12px',
                right: '12px',
                bottom: '20px',
                zIndex: 2147483647,
                padding: '11px',
                borderRadius: '9px',
                color: '#fff',
                fontSize: '14px',
                textAlign: 'center',
                boxShadow: '0 3px 14px rgba(0,0,0,.3)'
            });

            document.body.appendChild(box);
        }

        box.style.background = error ? '#a93232' : '#245e43';
        box.textContent = message;
        box.hidden = false;

        clearTimeout(toast.timer);

        toast.timer = setTimeout(function () {
            box.hidden = true;
        }, 3000);
    }


    // =========================================================
    // 辞書の読み取り
    // =========================================================

    /*
     * 1行ずつ「名前(説明)」として読みます。
     * 半角の( と全角の（ のどちらでもOK。
     * 括弧が無い行は行全体を名前にします。
     */
    function parseEntries(text) {

        return String(text || '')
            .split('\n')
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean)
            .map(function (line) {

                const m = line.match(/^(.*?)[(（](.*?)[)）]?\s*$/);

                if (m && m[1].trim()) {
                    return {
                        name: m[1].trim(),
                        note: m[2].trim()
                    };
                }

                return { name: line, note: '' };
            });
    }


    // =========================================================
    // ファイル読み込み
    // =========================================================

    /*
     * UTF-8で読めなければShift_JISで読み直します
     */
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


    function pickFile() {

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

                const text =
                    decode(reader.result)
                        .replace(/^\uFEFF/, '')
                        .replace(/\r\n?/g, '\n');

                save(KEYS.text, text);
                save(KEYS.name, file.name);

                updateButton();

                toast(
                    '「' + file.name + '」を読み込みました（' +
                    parseEntries(text).length + '件）'
                );
            };

            reader.onerror = function () {
                toast('ファイルを読み込めませんでした', true);
            };

            reader.readAsArrayBuffer(file);
        });

        document.body.appendChild(input);

        input.click();
    }


    // =========================================================
    // カーソル位置の記録
    // =========================================================

    /*
     * ボタンを押すと入力欄からカーソルが外れるので、
     * 入力欄の中でカーソルが動くたびに位置を覚えておきます。
     */
    let saved = null;


    function isTextField(el) {

        return (
            el instanceof HTMLTextAreaElement ||
            (
                el instanceof HTMLInputElement &&
                /^(text|search)$/i.test(el.type)
            )
        );
    }


    function editableOf(node) {

        const el =
            node && node.nodeType === 1
                ? node
                : node && node.parentElement;

        if (!el || el.closest('#' + CONFIG.panelId)) {
            return null;
        }

        return el.closest('[contenteditable="true"]');
    }


    document.addEventListener('selectionchange', function () {

        const active = document.activeElement;

        if (isTextField(active)) {

            saved = {
                el: active,
                start: active.selectionStart,
                end: active.selectionEnd
            };

            return;
        }

        const sel = window.getSelection();

        if (!sel || !sel.rangeCount) {
            return;
        }

        const range = sel.getRangeAt(0);

        const editor = editableOf(range.startContainer);

        if (editor) {
            saved = {
                el: editor,
                range: range.cloneRange()
            };
        }
    });


    /*
     * ChatGPTの入力欄
     */
    function findChatGPTEditor() {

        return (
            document.querySelector('div.ProseMirror[contenteditable="true"]') ||
            document.querySelector('[contenteditable="true"]')
        );
    }


    // =========================================================
    // カーソル位置へ貼り付け
    // =========================================================

    function insertAtCursor(text) {

        let target =
            saved && document.contains(saved.el)
                ? saved
                : null;

        /*
         * カーソル位置が分からないときは
         * ChatGPTの入力欄の末尾に入れます
         */
        if (!target) {

            const editor = findChatGPTEditor();

            if (!editor) {
                toast('入力欄が見つかりません', true);
                return false;
            }

            const range = document.createRange();

            range.selectNodeContents(editor);
            range.collapse(false);

            target = { el: editor, range: range };
        }

        const el = target.el;

        el.focus();

        let ok = false;

        if ('start' in target) {

            el.setSelectionRange(target.start, target.end);

            try {
                ok = document.execCommand('insertText', false, text);
            } catch (_) {
                ok = false;
            }

            if (!ok) {
                el.setRangeText(text, target.start, target.end, 'end');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                ok = true;
            }

            /*
             * 続けて貼ったときに後ろへつながるように
             */
            const pos = el.selectionEnd;

            saved = { el: el, start: pos, end: pos };

        } else {

            const sel = window.getSelection();

            sel.removeAllRanges();
            sel.addRange(target.range);

            try {
                ok = document.execCommand('insertText', false, text);
            } catch (_) {
                ok = false;
            }

            if (!ok) {

                const range = sel.getRangeAt(0);

                range.deleteContents();

                const node = document.createTextNode(text);

                range.insertNode(node);
                range.setStartAfter(node);
                range.collapse(true);

                sel.removeAllRanges();
                sel.addRange(range);

                el.dispatchEvent(new Event('input', { bubbles: true }));

                ok = true;
            }

            if (sel.rangeCount) {
                saved = {
                    el: el,
                    range: sel.getRangeAt(0).cloneRange()
                };
            }
        }

        return ok;
    }


    // =========================================================
    // 一覧パネル
    // =========================================================

    function closePanel() {

        const panel = document.getElementById(CONFIG.panelId);

        if (panel) {
            panel.remove();
            return true;
        }

        return false;
    }


    function openPanel() {

        const entries = parseEntries(load(KEYS.text, ''));

        if (!entries.length) {
            toast('まだ読み込んでいません。長押しでファイルを選んでね', true);
            return;
        }

        closePanel();

        const panel = document.createElement('div');

        panel.id = CONFIG.panelId;

        Object.assign(panel.style, {
            position: 'fixed',
            left: '8px',
            right: '8px',
            top: '8px',
            maxHeight: '60vh',
            zIndex: 2147483645,
            display: 'flex',
            flexDirection: 'column',
            padding: '10px',
            borderRadius: '10px',
            background: '#fff',
            color: '#222',
            boxShadow: '0 4px 20px rgba(0,0,0,.45)',
            boxSizing: 'border-box'
        });

        const header = document.createElement('div');

        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
        });

        const title = document.createElement('div');

        title.textContent =
            '📖 ' + String(load(KEYS.name, '') || '') +
            '（' + entries.length + '件）';

        Object.assign(title.style, {
            flex: '1',
            minWidth: '0',
            fontWeight: 'bold',
            fontSize: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        });

        const close = document.createElement('button');

        close.type = 'button';
        close.textContent = '閉じる';

        Object.assign(close.style, {
            padding: '8px 14px',
            border: '1px solid #777',
            borderRadius: '7px',
            background: '#eee',
            color: '#222',
            fontSize: '14px',
            fontWeight: 'bold'
        });

        close.addEventListener('click', closePanel);

        header.append(title, close);

        const list = document.createElement('div');

        Object.assign(list.style, {
            flex: '1',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
        });

        entries.forEach(function (entry) {

            const item = document.createElement('button');

            item.type = 'button';

            Object.assign(item.style, {
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 11px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                background: '#f7f7f7',
                color: '#222'
            });

            const name = document.createElement('div');

            name.textContent = entry.name;

            Object.assign(name.style, {
                fontSize: '15px',
                fontWeight: 'bold'
            });

            item.appendChild(name);

            if (entry.note) {

                const note = document.createElement('div');

                note.textContent = entry.note;

                Object.assign(note.style, {
                    marginTop: '2px',
                    fontSize: '12px',
                    color: '#777',
                    lineHeight: '1.4'
                });

                item.appendChild(note);
            }

            /*
             * 押した瞬間に入力欄からカーソルが
             * 外れないようにします（PC向け）
             */
            item.addEventListener('mousedown', function (event) {
                event.preventDefault();
            });

            item.addEventListener('click', function (event) {

                event.preventDefault();
                event.stopPropagation();

                if (insertAtCursor(entry.name)) {

                    toast('「' + entry.name + '」を貼り付けました');

                    if (CONFIG.closeAfterInsert) {
                        closePanel();
                    }
                }
            });

            list.appendChild(item);
        });

        panel.append(header, list);

        document.body.appendChild(panel);
    }


    // =========================================================
    // ボタンの位置（縦向き・横向き）
    // =========================================================

    const landscapeQuery = window.matchMedia('(orientation: landscape)');
    const touchQuery = window.matchMedia('(pointer: coarse)');


    function isLandscape() {
        return (
            landscapeQuery.matches &&
            (!CONFIG.landscapeOnlyTouch || touchQuery.matches)
        );
    }


    function applyPosition() {

        const button = document.getElementById(CONFIG.buttonId);

        if (!button) {
            return;
        }

        const bottom = isLandscape() ? CONFIG.bottomLandscape : CONFIG.bottom;

        if (button.style.bottom !== bottom) {
            button.style.bottom = bottom;
        }
    }


    [landscapeQuery, touchQuery].forEach(function (mq) {
        if (mq.addEventListener) {
            mq.addEventListener('change', applyPosition);
        } else if (mq.addListener) {
            mq.addListener(applyPosition);
        }
    });

    window.addEventListener('resize', applyPosition);


    // =========================================================
    // ボタン
    // =========================================================

    function updateButton() {

        const button = document.getElementById(CONFIG.buttonId);

        if (!button) {
            return;
        }

        button.textContent =
            load(KEYS.text, '')
                ? CONFIG.iconLoaded
                : CONFIG.iconUnloaded;
    }


    function installButton() {

        if (!document.body) {
            return;
        }

        if (document.getElementById(CONFIG.buttonId)) {
            applyPosition();
            return;
        }

        const button = document.createElement('button');

        button.id = CONFIG.buttonId;
        button.type = 'button';

        /*
         * 絵文字だけの丸いボタン
         */
        button.style.cssText = [
            'position:fixed',
            'bottom:' + CONFIG.bottom,
            'right:' + CONFIG.right,
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
            'touch-action:manipulation'
        ].join(';');

        /*
         * ファイル選択画面はブラウザの決まりで
         * 「指を離した瞬間」にしか開けないので、
         * 長さは押した時点から測り、判定は離したときに行います。
         * 長押しの時間を超えたら色を変えてお知らせします。
         */
        let downAt = 0;
        let holdTimer = null;

        const resetColor = function () {
            button.style.background = '#d0772f';
        };

        button.addEventListener('pointerdown', function () {

            downAt = Date.now();

            clearTimeout(holdTimer);

            holdTimer = setTimeout(function () {
                button.style.background = '#8a4a16';
            }, CONFIG.holdTime);
        });

        /*
         * PCで押したときに入力欄のカーソルを外さない
         */
        button.addEventListener('mousedown', function (event) {
            event.preventDefault();
        });

        button.addEventListener('pointerup', function (event) {

            event.preventDefault();
            event.stopPropagation();

            clearTimeout(holdTimer);
            resetColor();

            if (!downAt) {
                return;
            }

            const held = Date.now() - downAt;

            downAt = 0;

            if (held >= CONFIG.holdTime) {

                pickFile();

            } else if (!closePanel()) {

                /*
                 * 開いていれば閉じる、閉じていれば開く
                 */
                openPanel();
            }
        });

        const cancel = function () {
            downAt = 0;
            clearTimeout(holdTimer);
            resetColor();
        };

        button.addEventListener('pointercancel', cancel);
        button.addEventListener('pointerleave', cancel);

        /*
         * 長押しメニューを出さない
         */
        button.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });

        /*
         * クリックは pointerup で処理済みなので止めるだけ
         */
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        document.body.appendChild(button);

        updateButton();
        applyPosition();
    }


    // =========================================================
    // 起動
    // =========================================================

    installButton();

    /*
     * ChatGPTは画面を組み替えるので
     * ボタンが消えたら作り直します（向きの確認もここで）
     */
    setInterval(installButton, 2000);

})();
