// ==UserScript==
// @name         Claude ボタンまとめメニュー
// @namespace    claude-button-menu
// @version      1.5.0
// @description  claude.aiに並んでいる各ユーザースクリプトのボタンを右下の1つにまとめます。押すと一覧が出て、選んだ機能を呼び出します
// @match        https://claude.ai/*
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
         * まとめボタンの位置（右からと下からのpx）と大きさ。
         * 下からの位置は、スマホの画面下のバー（ジェスチャーバーなど）の
         * 上からはかります
         */
        right: 12,
        bottom: 12,
        size: 44,

        /*
         * ボタンの色（他のボタンとそろえたオレンジ）
         */
        color: '#d0772f',
        colorPressed: '#8a4a16'
    };


    /*
     * メニューに並べる機能（上から順に表示）。
     * 元のボタンが見つからない機能は、メニューに出ません。
     * 要らない機能は、その行のかたまりを消せば外せます。
     *
     * press:
     *   'click' … 普通に押す
     *   'short' … 長押し対応ボタンを短く押す
     *   'long'  … 長押し対応ボタンを長押しする
     */
    const TOOLS = [
        {
            target: '#claude-tategaki-toggle',
            icon: '📜',
            label: function (button) {
                return button.textContent.trim() === '縦'
                    ? '縦書きにする'
                    : '横書きに戻す';
            },
            press: 'click'
        },
        {
            target: '#claude-tategaki-toc',
            icon: '📑',
            label: '目次（生成の先頭へ）',
            press: 'click'
        },
        {
            target: '#cjh-button',
            icon: '🔝',
            label: '生成の先頭に戻る',
            press: 'click'
        },
        {
            target: '#cfs-button',
            icon: 'Aa',
            label: '文字サイズ',
            press: 'click'
        },
        {
            target: '#cu-usage-btn',
            icon: '📊',
            label: '使用量',
            press: 'click'
        },
        {
            target: '#claude-textviewer-button',
            icon: '📖',
            label: '辞書から貼り付け',
            press: 'short'
        },
        {
            target: '#claude-textviewer-button',
            icon: '📂',
            label: '辞書を読み込む',
            press: 'long'
        },
        {
            target: '#cc-fab',
            icon: '🖼️',
            label: 'キャラ画像の設定',
            press: 'click'
        }
    ];


    /*
     * 「辞書」ボタンの長押しと判定される時間(ms)より少し長く
     */
    const LONG_PRESS_MS = 700;


    // =========================================================
    // ID
    // =========================================================

    const BUTTON_ID = 'cbm-button';
    const MENU_ID = 'cbm-menu';


    // =========================================================
    // CSS
    // =========================================================

    const hiddenTargets = Array.from(
        new Set(TOOLS.map(function (tool) {
            return tool.target;
        }))
    );

    const style = document.createElement('style');

    style.textContent = `

        /* まとめた元のボタンは見えなくする
           （消すと元のスクリプトが作り直すので、見えなくするだけ。
             メニューからの呼び出しはそのまま効きます） */
        ${hiddenTargets.join(',\n        ')} {
            visibility: hidden !important;
            pointer-events: none !important;
        }

        #${BUTTON_ID} {
            position: fixed !important;
            right: ${CONFIG.right}px !important;
            bottom: calc(${CONFIG.bottom}px + env(safe-area-inset-bottom, 0px)) !important;
            /* 縦書きパネルより上、大きい入力画面や各設定パネルより下 */
            z-index: 2147483641 !important;
            width: ${CONFIG.size}px !important;
            height: ${CONFIG.size}px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: none !important;
            border-radius: 50% !important;
            background: ${CONFIG.color} !important;
            color: #ffffff !important;
            font-size: 20px !important;
            line-height: 1 !important;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4) !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            -webkit-touch-callout: none !important;
            touch-action: manipulation !important;
            cursor: pointer !important;
            transition: opacity .25s !important;
        }

        /* スクロール中は☰を透明にする（メニューを開いている間はそのまま） */
        html.cbm-scrolling #${BUTTON_ID}:not(.cbm-open) {
            opacity: 0 !important;
            pointer-events: none !important;
        }

        #${BUTTON_ID}:active,
        #${BUTTON_ID}.cbm-open {
            background: ${CONFIG.colorPressed} !important;
        }

        #${MENU_ID} {
            position: fixed !important;
            right: ${CONFIG.right}px !important;
            bottom: calc(${CONFIG.bottom + CONFIG.size + 10}px + env(safe-area-inset-bottom, 0px)) !important;
            z-index: 2147483641 !important;
            display: none;
            min-width: 210px !important;
            max-height: calc(100vh - ${CONFIG.bottom + CONFIG.size + 30}px) !important;
            max-height: calc(100dvh - ${CONFIG.bottom + CONFIG.size + 30}px) !important;
            overflow-y: auto !important;
            padding: 6px !important;
            border-radius: 14px !important;
            background: #2b2a27 !important;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45) !important;
            box-sizing: border-box !important;
            font-family: system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif !important;
        }

        #${MENU_ID}.cbm-open {
            display: block !important;
        }

        #${MENU_ID} .cbm-item {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            width: 100% !important;
            min-height: 46px !important;
            padding: 8px 12px !important;
            border: none !important;
            border-radius: 10px !important;
            background: transparent !important;
            color: #f3f1ec !important;
            font-size: 15px !important;
            line-height: 1.3 !important;
            text-align: left !important;
            box-sizing: border-box !important;
            cursor: pointer !important;
        }

        #${MENU_ID} .cbm-item:active {
            background: rgba(255, 255, 255, 0.12) !important;
        }

        #${MENU_ID} .cbm-icon {
            flex: 0 0 auto !important;
            width: 34px !important;
            height: 34px !important;
            border-radius: 50% !important;
            background: ${CONFIG.color} !important;
            color: #ffffff !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 16px !important;
            font-weight: bold !important;
        }

        #${MENU_ID} .cbm-empty {
            color: #aaaaaa !important;
            font-size: 14px !important;
            padding: 10px 12px !important;
        }
    `;

    document.head.appendChild(style);


    // =========================================================
    // 元のボタンを押す
    // =========================================================

    function pointer(type, target) {

        let event;

        try {
            event = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                pointerType: 'touch',
                isPrimary: true
            });
        } catch (_) {
            event = new Event(type, { bubbles: true, cancelable: true });
        }

        target.dispatchEvent(event);
    }


    function pressTarget(tool, button) {

        if (tool.press === 'short') {
            pointer('pointerdown', button);
            pointer('pointerup', button);
            return;
        }

        if (tool.press === 'long') {

            pointer('pointerdown', button);

            setTimeout(function () {
                pointer('pointerup', button);
            }, LONG_PRESS_MS);

            return;
        }

        button.click();
    }


    // =========================================================
    // メニュー
    // =========================================================

    function isMenuOpen() {

        const menu = document.getElementById(MENU_ID);

        return !!(menu && menu.classList.contains('cbm-open'));
    }


    function closeMenu() {

        const menu = document.getElementById(MENU_ID);
        const button = document.getElementById(BUTTON_ID);

        if (menu) {
            menu.classList.remove('cbm-open');
        }

        if (button) {
            button.classList.remove('cbm-open');
        }
    }


    function openMenu() {

        const menu = document.getElementById(MENU_ID);
        const button = document.getElementById(BUTTON_ID);

        if (!menu || !button) {
            return;
        }

        buildMenuItems(menu);

        menu.classList.add('cbm-open');
        button.classList.add('cbm-open');
    }


    /*
     * 開くたびに、今ある元のボタンだけで一覧を作り直します
     */
    function buildMenuItems(menu) {

        menu.textContent = '';

        let count = 0;

        TOOLS.forEach(function (tool) {

            const target = document.querySelector(tool.target);

            if (!target) {
                return;
            }

            const label =
                typeof tool.label === 'function'
                    ? tool.label(target)
                    : tool.label;

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'cbm-item';

            const icon = document.createElement('span');
            icon.className = 'cbm-icon';
            icon.textContent = tool.icon;

            const text = document.createElement('span');
            text.textContent = label;

            item.appendChild(icon);
            item.appendChild(text);

            /*
             * PCで押したときに入力欄のカーソルを外さない
             */
            item.addEventListener('mousedown', function (event) {
                event.preventDefault();
            });

            item.addEventListener('click', function (event) {

                event.preventDefault();
                event.stopPropagation();

                closeMenu();

                const current = document.querySelector(tool.target);

                if (current) {
                    pressTarget(tool, current);
                }
            });

            menu.appendChild(item);
            count++;
        });

        if (!count) {

            const empty = document.createElement('div');
            empty.className = 'cbm-empty';
            empty.textContent = '使える機能が見つかりません';

            menu.appendChild(empty);
        }
    }


    /*
     * スマホで☰を押したとき、裏の入力欄が「入力中」のまま残っていると
     * キーボードが出てきてしまうので、入力中を解除します
     */
    let lastPointerType = '';


    function releaseInputFocus() {

        const active = document.activeElement;

        if (!active || active === document.body) {
            return;
        }

        if (
            active.isContentEditable ||
            active.tagName === 'TEXTAREA' ||
            (active.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|reset|file|range|color)$/i.test(active.type))
        ) {
            active.blur();
        }
    }


    function ensureUI() {

        if (!document.body) {
            return;
        }

        if (!document.getElementById(BUTTON_ID)) {

            const button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.textContent = '☰';
            button.setAttribute('aria-label', 'ボタンまとめメニュー');

            button.addEventListener('pointerdown', function (event) {
                lastPointerType = event.pointerType || '';
            });

            button.addEventListener('mousedown', function (event) {
                event.preventDefault();
            });

            button.addEventListener('contextmenu', function (event) {
                event.preventDefault();
            });

            button.addEventListener('click', function (event) {

                event.preventDefault();
                event.stopPropagation();

                // 指で押したとき（スマホ）は、キーボードが出ないように入力中を解除
                // （PCのマウスでは、今まで通り入力欄のカーソルを残します）
                if (lastPointerType !== 'mouse') {
                    releaseInputFocus();
                }

                if (isMenuOpen()) {
                    closeMenu();
                } else {
                    openMenu();
                }
            });

            document.body.appendChild(button);
        }

        if (!document.getElementById(MENU_ID)) {

            const menu = document.createElement('div');
            menu.id = MENU_ID;

            document.body.appendChild(menu);
        }
    }


    /*
     * メニューの外を押したら閉じる
     */
    document.addEventListener('pointerdown', function (event) {

        if (!isMenuOpen()) {
            return;
        }

        const target = event.target;

        if (
            target &&
            target.closest &&
            target.closest('#' + MENU_ID + ', #' + BUTTON_ID)
        ) {
            return;
        }

        closeMenu();

    }, true);


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

    const SCROLLING_CLASS = 'cbm-scrolling';

    let cbmTouching = false;
    let cbmLastTouch = 0;
    let cbmShowTimer = null;

    function cbmMarkTouch() {
        cbmLastTouch = Date.now();
    }

    document.addEventListener('touchstart', function () {
        cbmTouching = true;
        cbmMarkTouch();
    }, { capture: true, passive: true });

    document.addEventListener('touchend', function () {
        cbmTouching = false;
        cbmMarkTouch();
    }, { capture: true, passive: true });

    document.addEventListener('touchcancel', function () {
        cbmTouching = false;
        cbmMarkTouch();
    }, { capture: true, passive: true });

    /* PCのマウスホイール */
    document.addEventListener('wheel', cbmMarkTouch, { capture: true, passive: true });

    document.addEventListener('scroll', function (event) {

        const target = event.target;

        /* ボタン自身のメニューなどの中のスクロールでは隠さない */
        if (
            target &&
            target.closest &&
            target.closest('#cbm-menu')
        ) {
            return;
        }

        if (!cbmTouching && Date.now() - cbmLastTouch > SCROLL_HIDE.flingTime) {
            return;
        }

        document.documentElement.classList.add(SCROLLING_CLASS);

        clearTimeout(cbmShowTimer);

        cbmShowTimer = setTimeout(function () {
            document.documentElement.classList.remove(SCROLLING_CLASS);
        }, SCROLL_HIDE.showDelay);

    }, { capture: true, passive: true });


    // =========================================================
    // 開始
    // =========================================================

    ensureUI();

    setInterval(ensureUI, 1000);

})();
