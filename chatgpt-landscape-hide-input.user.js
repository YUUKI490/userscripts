// ==UserScript==
// @name         ChatGPT 横画面で入力欄を隠す
// @namespace    local.chatgpt.landscapereader
// @version      1.0.0
// @description  スマホを横向きにしているとき、チャットを一番下までスクロールしたときだけ入力欄と📖・🖼ボタンを表示します（Claude版 1.1.0 からの移植）
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // 設定
    // =========================================================

    const CONFIG = {

        /*
         * true … スマホ・タブレット（指で操作する端末）のときだけ動く
         * false … PCの横長画面でも動く
         */
        onlyTouch: true,

        /*
         * 隠れているとき、一番下からこの距離(px)以内まで来たら表示
         */
        showDistance: 40,

        /*
         * 表示中、「入力欄の高さ＋この距離(px)」より上へ戻ったら隠す
         * 小さくすると少し上に戻っただけで隠れます
         */
        hideExtra: 150,

        /*
         * 表示したときに一番下までスクロールし直して、
         * 最後の行が入力欄に隠れないようにする
         */
        scrollToBottomOnShow: true,

        /*
         * true にすると左上に状態を表示します（うまく動かないとき用）
         */
        debug: false,

        /*
         * 入力欄と一緒に隠すボタン
         * （📖辞書ボタン・🖼キャラ画像ボタン）
         */
        hideButtons: [
            '#claude-textviewer-button',
            '#cc-fab'
        ],

        /*
         * これが開いている間は隠さない
         * （辞書の一覧・キャラ画像設定パネル）
         */
        keepIfOpen: [
            '#claude-textviewer-panel',
            '#cc-panel.active'
        ]
    };

    /*
     * ChatGPTのメッセージの入れ物（ChatGPT側の画面変更で変わる可能性あり）
     */
    const MESSAGE_SELECTOR = [
        '[data-user-message-bubble="true"]',
        '[data-markdown-text-style="assistant-message"]'
    ].join(',');

    /*
     * ChatGPTの会話がスクロールする場所と、入力欄のまわり
     */
    const THREAD_SCROLLER = '[data-app-action-timeline-scroll]';
    const COMPOSER_AREA = '[data-thread-scroll-footer="true"]';

    /*
     * ここの中のスクロールは見張らない（自作パネルなど）
     */
    const IGNORE_SCROLL = '#claude-textviewer-panel, #cc-panel, pre, code';

    const MARK = 'data-cls-input';
    const HIDE_CLASS = 'cls-hide';


    // =========================================================
    // スタイル
    // =========================================================

    const CSS =
        ['html.' + HIDE_CLASS + ' [' + MARK + ']']
            .concat(CONFIG.hideButtons.map(function (s) {
                return 'html.' + HIDE_CLASS + ' ' + s;
            }))
            .join(',') +
        '{display:none !important;}';

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
    // 状態
    // =========================================================

    const landscape = window.matchMedia('(orientation: landscape)');
    const touch = window.matchMedia('(pointer: coarse)');

    let hidden = false;
    let lastTop = null;
    let inputHeight = 120;
    let container = null;
    let wrapper = null;


    function enabled() {
        return landscape.matches && (!CONFIG.onlyTouch || touch.matches);
    }


    function setHidden(value) {

        if (hidden === value) {
            return;
        }

        hidden = value;

        document.documentElement.classList.toggle(HIDE_CLASS, value);
    }


    // =========================================================
    // スクロールしている場所
    // =========================================================

    function docScroller() {
        return document.scrollingElement || document.documentElement;
    }


    function isDocScroller(el) {
        return (
            el === document.scrollingElement ||
            el === document.documentElement ||
            el === document.body
        );
    }


    function canScroll(el) {
        return el && el.isConnected && el.scrollHeight > el.clientHeight + 1;
    }


    /*
     * 実際にスクロールされた場所が本文の箱ならそれを見張る
     */
    function scrollerFromEvent(target) {

        const el = target === document ? docScroller() : target;

        if (!(el instanceof Element)) {
            return null;
        }

        if (!isDocScroller(el) && el.closest(IGNORE_SCROLL)) {
            return null;
        }

        if (!canScroll(el)) {
            return null;
        }

        if (!isDocScroller(el) && !el.querySelector(MESSAGE_SELECTOR)) {
            return null;
        }

        return el;
    }


    /*
     * まだスクロールしていないとき用の推測
     */
    function findContainer() {

        if (canScroll(container)) {
            return container;
        }

        const thread = document.querySelector(THREAD_SCROLLER);

        if (canScroll(thread)) {
            setContainer(thread);
            return thread;
        }

        const messages = document.querySelectorAll(MESSAGE_SELECTOR);
        const last = messages[messages.length - 1];

        let el = last && last.parentElement;

        while (el && !isDocScroller(el)) {

            const oy = getComputedStyle(el).overflowY;

            if (
                (oy === 'auto' || oy === 'scroll') &&
                el.scrollHeight > el.clientHeight + 50
            ) {
                setContainer(el);
                return el;
            }

            el = el.parentElement;
        }

        setContainer(docScroller());

        return container;
    }


    function setContainer(el) {

        if (el !== container) {
            lastTop = null;
        }

        container = el;
    }


    function distanceOf(sc) {
        return Math.max(0, sc.scrollHeight - sc.scrollTop - sc.clientHeight);
    }


    // =========================================================
    // 入力欄を探して印をつける
    // =========================================================

    function findEditor() {

        return (
            document.querySelector('div.ProseMirror[contenteditable="true"]') ||
            document.querySelector('[contenteditable="true"]')
        );
    }


    /*
     * 入力欄のまわり（下に貼りついている部分）ごと隠します。
     * 見つからなければ form を使います。
     */
    function findWrapper(editor) {

        return (
            editor.closest(COMPOSER_AREA) ||
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

        document.querySelectorAll('[' + MARK + ']').forEach(function (el) {
            el.removeAttribute(MARK);
        });

        wrapper = findWrapper(editor);

        if (wrapper) {
            wrapper.setAttribute(MARK, '');
        }

        return wrapper;
    }


    // =========================================================
    // 隠す・出すの判定
    // =========================================================

    function mustKeep(w) {

        const active = document.activeElement;

        if (w && active && w.contains(active)) {
            return true;
        }

        return CONFIG.keepIfOpen.some(function (s) {
            return document.querySelector(s);
        });
    }


    function isStreaming() {
        return !!document.querySelector(
            '[data-talvt-turn-state="in_progress"],' +
            'button[aria-label="停止"],' +
            'button[aria-label="Stop streaming"],' +
            '[data-testid="stop-button"]'
        );
    }


    function check(fromScroll) {

        ensureStyle();

        const w = markInput();

        if (!enabled()) {
            setHidden(false);
            lastTop = null;
            showDebug(null, 0);
            return;
        }

        const sc = findContainer();

        const top = sc.scrollTop;
        const distance = distanceOf(sc);
        const scrolledUp = lastTop !== null && top < lastTop - 2;

        lastTop = top;

        showDebug(sc, distance);

        if (mustKeep(w)) {
            setHidden(false);
            return;
        }

        if (hidden) {

            if (distance <= CONFIG.showDistance) {

                setHidden(false);

                if (CONFIG.scrollToBottomOnShow) {
                    requestAnimationFrame(function () {
                        sc.scrollTop = sc.scrollHeight;
                        lastTop = sc.scrollTop;
                    });
                }
            }

            return;
        }

        if (w && w.offsetHeight) {
            inputHeight = w.offsetHeight;
        }

        if (distance > inputHeight + CONFIG.hideExtra) {

            /*
             * 上へスクロールしたときだけ隠す。
             * 自動チェックでは、実際のスクロール場所が分かっていて
             * 生成中でないときだけ隠す。
             */
            if (fromScroll ? scrolledUp : (confirmed && !isStreaming())) {
                setHidden(true);
            }
        }
    }


    // =========================================================
    // デバッグ表示
    // =========================================================

    let debugBox = null;

    function showDebug(sc, distance) {

        if (!CONFIG.debug) {
            return;
        }

        if (!debugBox || !debugBox.isConnected) {

            debugBox = document.createElement('div');

            Object.assign(debugBox.style, {
                position: 'fixed',
                left: '4px',
                top: '4px',
                zIndex: 2147483647,
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,.7)',
                color: '#fff',
                font: '11px/1.4 monospace',
                pointerEvents: 'none',
                whiteSpace: 'pre'
            });

            document.body.appendChild(debugBox);
        }

        const name = !sc ? '-' :
            isDocScroller(sc) ? 'document' :
            sc.tagName.toLowerCase() + '.' +
            String(sc.className || '').split(/\s+/).slice(0, 2).join('.');

        debugBox.textContent =
            (enabled() ? '横' : '縦') +
            ' / ' + (hidden ? '隠し中' : '表示中') +
            ' / 下まで ' + Math.round(distance) + 'px' +
            '\n箱: ' + name + (confirmed ? ' ✓' : ' ?') +
            '\n入力欄: ' + (wrapper ? wrapper.tagName.toLowerCase() : 'なし');
    }


    // =========================================================
    // 起動
    // =========================================================

    /*
     * 実際にスクロールした場所が分かったら true
     */
    let confirmed = false;
    let scrollTicking = false;

    document.addEventListener('scroll', function (event) {

        const s = scrollerFromEvent(event.target);

        if (!s) {
            return;
        }

        setContainer(s);
        confirmed = true;

        if (scrollTicking) {
            return;
        }

        scrollTicking = true;

        requestAnimationFrame(function () {
            scrollTicking = false;
            check(true);
        });

    }, { capture: true, passive: true });


    function onChange() {
        lastTop = null;
        setTimeout(function () { check(false); }, 150);
    }

    [landscape, touch].forEach(function (mq) {
        if (mq.addEventListener) {
            mq.addEventListener('change', onChange);
        } else if (mq.addListener) {
            mq.addListener(onChange);
        }
    });

    window.addEventListener('resize', onChange);

    document.addEventListener('focusout', function () {
        setTimeout(function () { check(false); }, 100);
    });

    document.addEventListener('focusin', function () {
        check(false);
    });

    /*
     * チャットを切り替えたら見張る場所を探し直す
     */
    let lastUrl = location.href;

    setInterval(function () {

        if (location.href !== lastUrl) {
            lastUrl = location.href;
            container = null;
            confirmed = false;
            lastTop = null;
            setHidden(false);
        }

        check(false);

    }, 600);

    /*
     * 入力欄が作り直されたらすぐに印をつけ直す
     */
    let markTicking = false;

    const observer = new MutationObserver(function () {

        if (markTicking || !hidden) {
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

    check(false);

})();
