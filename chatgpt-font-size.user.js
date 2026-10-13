// ==UserScript==
// @name         ChatGPT 文字サイズ変更
// @namespace    local.chatgpt.fontsize
// @version      1.0.0
// @description  chatgpt.comのメッセージ本文の文字サイズ・行間と、入力欄の文字サイズ、縦書き表示パネルの文字サイズと段落の間隔を変更します（Claude版 1.3.0 からの移植）
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
         * まとめメニューから呼び出せるように、IDはClaude版と同じです
         */
        buttonId: 'cfs-button',
        panelId: 'cfs-panel',

        /*
         * 「Aa」ボタンの位置（縦向きのとき）
         * 数字を大きくすると上へ、小さくすると下へ動きます。
         */
        left: '12px',
        bottom: '146px',

        /*
         * スマホを横向きにしたときの位置
         */
        bottomLandscape: '94px',

        /*
         * true … スマホ・タブレットのときだけ横向きの位置を使う
         */
        landscapeOnlyTouch: true
    };

    /*
     * 保存の名前はClaude版と同じ（サイトが違うので設定は別々です）
     */
    const STORAGE_KEY = 'claude_fontsize_settings';

    /*
     * メッセージ本文の入れ物（ChatGPT側の画面変更で変わる可能性あり）
     * ・ChatGPTの返事の本文（考え中の薄い文字は除く）
     * ・あなたのメッセージの本文
     */
    const ROOTS = [
        '[data-markdown-text-style="assistant-message"]:not([data-markdown-text-tone])',
        '[data-user-message-bubble="true"] .whitespace-pre-wrap'
    ];

    const EDITOR = 'div.ProseMirror[contenteditable="true"]';

    /*
     * 縦書き表示パネルの本文の入れ物
     */
    const TATEGAKI = '#claude-tategaki-scroller';

    /*
     * 縦書き表示パネルの標準の文字サイズ（縦書きスクリプトの設定と同じ）
     */
    const TATEGAKI_DEFAULT = 19;

    /*
     * 縦書き表示パネルの、段落のあいだの標準の間隔（縦書きスクリプトの設定と同じ）
     */
    const TATEGAKI_GAP_DEFAULT = 12;

    /*
     * 調整できる項目
     */
    const ITEMS = [
        { key: 'text',  label: '本文の文字',   min: 10, max: 32,  step: 1,    unit: 'px' },
        { key: 'line',  label: '本文の行間',   min: 1.2, max: 2.8, step: 0.05, unit: '倍' },
        { key: 'input', label: '入力欄の文字', min: 10, max: 28,  step: 1,    unit: 'px' },
        { key: 'vtext', label: '縦書きの文字', min: 10, max: 40,  step: 1,    unit: 'px' },
        { key: 'vgap',  label: '縦書きの段落の間隔', min: 0, max: 60, step: 1, unit: 'px' }
    ];


    // =========================================================
    // 保存
    // =========================================================

    /*
     * null のときはChatGPT標準のまま
     */
    let state = { text: null, line: null, input: null, vtext: null, vgap: null };

    function loadState() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
            ITEMS.forEach(function (item) {
                const v = Number(raw[item.key]);
                state[item.key] =
                    raw[item.key] != null && Number.isFinite(v)
                        ? clamp(v, item)
                        : null;
            });
        } catch (_) {
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {
        }
    }

    function clamp(value, item) {
        const v = Math.min(item.max, Math.max(item.min, value));
        return Math.round(v / item.step) * item.step;
    }


    // =========================================================
    // 今の大きさを測る（標準のときの出発点）
    // =========================================================

    function sampleParagraph() {
        for (const root of ROOTS) {
            const p = document.querySelector(root + ' p');
            if (p) {
                return p;
            }
        }
        return null;
    }

    function measure(key) {

        if (key === 'vgap') {
            return TATEGAKI_GAP_DEFAULT;
        }

        if (key === 'vtext') {
            const tate = document.querySelector(TATEGAKI);
            if (tate) {
                return parseFloat(getComputedStyle(tate).fontSize) || TATEGAKI_DEFAULT;
            }
            return TATEGAKI_DEFAULT;
        }

        if (key === 'input') {
            const editor = document.querySelector(EDITOR);
            if (editor) {
                return parseFloat(getComputedStyle(editor).fontSize) || 16;
            }
            return 16;
        }

        const p = sampleParagraph();

        if (!p) {
            return key === 'line' ? 1.7 : 16;
        }

        const cs = getComputedStyle(p);
        const size = parseFloat(cs.fontSize) || 16;

        if (key === 'text') {
            return size;
        }

        const lh = parseFloat(cs.lineHeight);

        return Number.isFinite(lh) ? lh / size : 1.5;
    }

    function currentValue(item) {
        return state[item.key] != null
            ? state[item.key]
            : clamp(measure(item.key), item);
    }


    // =========================================================
    // スタイル
    // =========================================================

    function under(selectors) {
        const list = [];
        ROOTS.forEach(function (root) {
            selectors.forEach(function (s) {
                list.push(root + ' ' + s);
            });
        });
        return list.join(',');
    }

    function buildCss() {

        let css =
            'html.cls-hide #' + CONFIG.buttonId + '{display:none !important;}';

        if (state.text != null) {

            css +=
                ROOTS.join(',') +
                '{font-size:' + state.text + 'px !important;}' +

                under(['p', 'li', 'ul', 'ol', 'blockquote', 'td', 'th',
                       'strong', 'em', 'b', 'i', 'a', 'span']) +
                '{font-size:inherit !important;}' +

                under(['h1']) + '{font-size:1.45em !important;}' +
                under(['h2']) + '{font-size:1.3em !important;}' +
                under(['h3']) + '{font-size:1.15em !important;}' +
                under(['h4', 'h5', 'h6']) + '{font-size:1.05em !important;}' +
                under(['pre', 'code']) + '{font-size:0.88em !important;}' +
                under(['pre code']) + '{font-size:inherit !important;}';
        }

        if (state.line != null) {

            css +=
                ROOTS.join(',') + ',' +
                under(['p', 'li', 'blockquote']) +
                '{line-height:' + state.line + ' !important;}';
        }

        if (state.input != null) {

            css +=
                EDITOR + ',' + EDITOR + ' p' +
                '{font-size:' + state.input + 'px !important;}';
        }

        /*
         * 縦書き表示パネルは、この変数の大きさで表示されます
         */
        if (state.vtext != null) {

            css +=
                ':root{--tg-font-size:' + state.vtext + 'px;}';
        }

        /*
         * 縦書き表示パネルの、段落のあいだの間隔（地の文・セリフどれも同じ）
         */
        if (state.vgap != null) {

            css +=
                ':root{--tg-para-gap:' + state.vgap + 'px;}';
        }

        return css;
    }

    let sheet = null;
    let styleEl = null;

    function applyCss() {

        const css = buildCss();

        if (!sheet && !styleEl) {
            try {
                sheet = new CSSStyleSheet();
            } catch (_) {
                styleEl = document.createElement('style');
            }
        }

        if (sheet) {
            try {
                sheet.replaceSync(css);
                if (!document.adoptedStyleSheets.includes(sheet)) {
                    document.adoptedStyleSheets =
                        document.adoptedStyleSheets.concat([sheet]);
                }
                return;
            } catch (_) {
                sheet = null;
                styleEl = document.createElement('style');
            }
        }

        styleEl.textContent = css;

        if (!styleEl.isConnected) {
            document.documentElement.appendChild(styleEl);
        }
    }


    // =========================================================
    // パネル
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

    const BTN_STYLE = {
        padding: '6px 0',
        minWidth: '38px',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.1)',
        color: '#f7f3ef',
        fontSize: '15px',
        fontWeight: 'bold',
        touchAction: 'manipulation'
    };

    const refreshers = [];

    function formatValue(item, value) {
        return item.step < 1
            ? value.toFixed(2) + item.unit
            : Math.round(value) + item.unit;
    }

    function setValue(item, value) {
        state[item.key] = value == null ? null : clamp(value, item);
        saveState();
        applyCss();
        refreshers.forEach(function (f) { f(); });
    }

    function buildRow(item) {

        const row = el('div', { marginBottom: '14px' });

        const head = el('div', {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
            fontSize: '13px'
        });

        const label = el('span', { fontWeight: 'bold' }, item.label);
        const valueText = el('span', { opacity: '0.85' });

        head.append(label, valueText);

        const controls = el('div', {
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        });

        const minus = el('button', BTN_STYLE, '−');
        const plus = el('button', BTN_STYLE, '+');
        const reset = el('button', Object.assign({}, BTN_STYLE, {
            fontSize: '12px',
            padding: '7px 8px'
        }), '標準');

        [minus, plus, reset].forEach(function (b) { b.type = 'button'; });

        const range = el('input', {
            flex: '1',
            minWidth: '0',
            accentColor: '#d97757'
        });

        range.type = 'range';
        range.min = String(item.min);
        range.max = String(item.max);
        range.step = String(item.step);

        minus.addEventListener('click', function () {
            setValue(item, currentValue(item) - item.step);
        });

        plus.addEventListener('click', function () {
            setValue(item, currentValue(item) + item.step);
        });

        reset.addEventListener('click', function () {
            setValue(item, null);
        });

        range.addEventListener('input', function () {
            setValue(item, Number(range.value));
        });

        controls.append(minus, range, plus, reset);
        row.append(head, controls);

        refreshers.push(function () {
            const value = currentValue(item);
            range.value = String(value);
            valueText.textContent =
                state[item.key] == null
                    ? '標準（' + formatValue(item, value) + '）'
                    : formatValue(item, value);
        });

        return row;
    }

    function closePanel() {
        const panel = document.getElementById(CONFIG.panelId);
        if (panel) {
            panel.remove();
            return true;
        }
        return false;
    }

    function openPanel() {

        closePanel();
        refreshers.length = 0;

        const panel = el('div', {
            position: 'fixed',
            left: '8px',
            top: '8px',
            width: 'min(360px, calc(100vw - 16px))',
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
            zIndex: 2147483645,
            padding: '12px 14px',
            borderRadius: '14px',
            background: 'rgba(30,26,24,0.96)',
            color: '#f7f3ef',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box'
        });

        panel.id = CONFIG.panelId;

        const header = el('div', {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
        });

        const title = el('div', { fontSize: '16px', fontWeight: 'bold' }, '文字サイズ');

        const close = el('button', Object.assign({}, BTN_STYLE, {
            padding: '7px 12px',
            fontSize: '13px'
        }), '閉じる');

        close.type = 'button';
        close.addEventListener('click', closePanel);

        header.append(title, close);
        panel.append(header);

        ITEMS.forEach(function (item) {
            panel.append(buildRow(item));
        });

        const resetAll = el('button', Object.assign({}, BTN_STYLE, {
            width: '100%',
            padding: '10px',
            fontSize: '13px'
        }), 'ぜんぶ標準に戻す');

        resetAll.type = 'button';
        resetAll.addEventListener('click', function () {
            ITEMS.forEach(function (item) { state[item.key] = null; });
            saveState();
            applyCss();
            refreshers.forEach(function (f) { f(); });
        });

        panel.append(resetAll);

        document.body.appendChild(panel);

        refreshers.forEach(function (f) { f(); });
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

    function installButton() {

        if (!document.body) {
            return;
        }

        applyCss();

        if (document.getElementById(CONFIG.buttonId)) {
            applyPosition();
            return;
        }

        const button = el('button', null, 'Aa');

        button.id = CONFIG.buttonId;
        button.type = 'button';
        button.title = '文字サイズ';

        button.style.cssText = [
            'position:fixed',
            'left:' + CONFIG.left,
            'bottom:' + CONFIG.bottom,
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
            'font-size:16px',
            'font-weight:bold',
            'line-height:1',
            'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
            'user-select:none',
            '-webkit-user-select:none',
            '-webkit-touch-callout:none',
            'touch-action:manipulation'
        ].join(';');

        button.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });

        /*
         * PCで押したときに入力欄のカーソルを外さない
         */
        button.addEventListener('mousedown', function (event) {
            event.preventDefault();
        });

        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (!closePanel()) {
                openPanel();
            }
        });

        document.body.appendChild(button);

        applyPosition();
    }


    // =========================================================
    // 起動
    // =========================================================

    loadState();
    applyCss();
    installButton();

    /*
     * ChatGPTは画面を組み替えるので、消えたら作り直します
     */
    setInterval(installButton, 2000);

})();
