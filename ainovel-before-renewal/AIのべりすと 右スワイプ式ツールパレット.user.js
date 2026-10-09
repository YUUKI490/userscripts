
// ==UserScript==
// @name         AIのべりすと 右スワイプ式ツールパレット
// @namespace    ainovel-right-tool-palette
// @version      1.6.0
// @description  右端スワイプで各種ユーザースクリプト機能をまとめて呼び出すパレット
// @match        https://ai-novel.com/*
// @match        https://*.ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // ID
    // =========================================================

    const HANDLE_ID =
        'ainovel-tool-palette-handle';

    const PALETTE_ID =
        'ainovel-tool-palette';

    const OPEN_CLASS =
        'ainovel-tool-palette-open';

    const HIDDEN_CLASS =
        'ainovel-tool-original-hidden';


    // =========================================================
    // 操作対象
    // =========================================================

    const TOOLS = [

        {
            key: 'up',
            icon: '▲',
            label: '前のブロック',

            ids: [
                'ainovel-block-jump-up'
            ]
        },

        {
            key: 'down',
            icon: '▼',
            label: '次のブロック',

            ids: [
                'ainovel-block-jump-down'
            ]
        },

        {
            key: 'book',
            icon: '📚',
            label: 'キャラブック',

            ids: [
                'ainovel-wi-bulk-open'
            ],

            textCandidates: [
                'キャラブック一括登録'
            ]
        },

        {
            key: 'image',
            icon: '🖼',
            label: 'キャラ画像',

            ids: [
                'ainovel-character-settings-open-stable',
                'ainovel-character-settings-open',
                'chatgpt-character-settings-button'
            ],

            textCandidates: [
                'キャラ画像設定'
            ]
        },

        {
            key: 'grok',
            icon: '📋',
            label: 'Grokへ差分',
            /*
             * 清書指示＋ANスクリプトを優先し、
             * 無ければ従来のGrok文章コピーaへ
             */
            ids: [
                'ainovel_android_seisho_copy',
                'ainovel_android_prompt_copy',
                'ainovel-grok-copy',
                'grok-copy-button',
                'ainovel-grok-copy-button'
            ],
            textCandidates: [
                'Grok用コピー',
                'Grokコピー'
            ]
        },
        {
            key: 'grokLast',
            icon: '📄',
            label: '最後のブロック',
            ids: [
                'ainovel_android_seisho_copy_last',
                'ainovel_android_prompt_copy_last'
            ],
            textCandidates: [
                '最後のブロックをGrokへ'
            ]
        },
        {
            /*
             * 清書の送り先（Grok / Claude）切替。
             * 押しても閉じず、アイコンと文字が今の送り先に変わります。
             */
            key: 'target',
            icon: '🤖',
            label: '送り先',
            ids: [
                'ainovel_android_seisho_target_button'
            ],
            textCandidates: []
        },
        {
            key: 'cb',
            icon: '📖',
            label: 'キャラブック更新',
            ids: [
                'ainovel_cbupdate_novel_btn'
            ],
            textCandidates: [
                'CB更新'
            ]
        },
        {
            key: 'an',
            icon: '📥',
            label: 'ANを置換',

            ids: [
                'ainovel_android_seisho_import_note',
                'ainovel_android_prompt_import_note',
                'ainovel-an-replace',
                'an-replace-button',
                'ainovel-an-replace-button'
            ],

            textCandidates: [
                'ANを置換'
            ]
        },

        {
            key: 'text',
            icon: '📖',
            label: '本文だけ',

            ids: [
                'qp-full-main'
            ],

            textCandidates: [
                '本文だけ'
            ]
        },

        {
            key: 'tate',
            icon: '📜',
            label: '縦書き',

            ids: [
                'ainovel-tategaki-open'
            ],

            textCandidates: []
        },

        {
            key: 'state',
            icon: '👁',
            label: '状態確認',

            ids: [
                'ainovel-state-view'
            ],

            textCandidates: [
                '状態確認'
            ]
        }

    ];


    // =========================================================
    // CSS
    // =========================================================

    const style =
        document.createElement(
            'style'
        );

    style.textContent = `

        /* =====================================================
           元ボタンを非表示
           visibility:hidden にするので
           元のイベント自体は残る
           ===================================================== */

        .${HIDDEN_CLASS} {
            visibility: hidden !important;
            pointer-events: none !important;
        }


        /* =====================================================
           右端の取っ手
           ===================================================== */

        #${HANDLE_ID} {

            position:
                fixed !important;

            right:
                0 !important;

            top:
                50% !important;

            transform:
                translateY(-50%) !important;

            width:
                22px !important;

            height:
                86px !important;

            z-index:
                2147483646 !important;

            border:
                1px solid
                rgba(100,100,100,.8) !important;

            border-right:
                0 !important;

            border-radius:
                12px 0 0 12px !important;

            background:
                rgba(255,255,255,.94) !important;

            box-shadow:
                -2px 2px 8px
                rgba(0,0,0,.22) !important;

            display:
                flex !important;

            align-items:
                center !important;

            justify-content:
                center !important;

            color:
                #333 !important;

            font-size:
                17px !important;

            font-weight:
                bold !important;

            padding:
                0 !important;

            user-select:
                none !important;

            -webkit-user-select:
                none !important;

            -webkit-touch-callout:
                none !important;

            touch-action:
                none !important;

            cursor:
                pointer !important;
        }


        /* =====================================================
           パレット本体
           ===================================================== */

        #${PALETTE_ID} {

            position:
                fixed !important;

            right:
                0 !important;

            top:
                50% !important;

            transform:
                translate(
                    calc(100% + 12px),
                    -50%
                ) !important;

            z-index:
                2147483645 !important;

            width:
                180px !important;

            padding:
                10px !important;

            box-sizing:
                border-box !important;

            background:
                rgba(255,255,255,.97) !important;

            border:
                1px solid
                rgba(110,110,110,.8) !important;

            border-right:
                0 !important;

            border-radius:
                15px 0 0 15px !important;

            box-shadow:
                -4px 3px 16px
                rgba(0,0,0,.28) !important;

            transition:
                transform .22s ease !important;

            touch-action:
                pan-y !important;

            user-select:
                none !important;

            -webkit-user-select:
                none !important;
        }


        #${PALETTE_ID} {
            max-height: 88vh !important;
            max-height: 88dvh !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
        }

        /* 送り忘れ警告中のキャラブック更新 */
        .ainovel-tool-palette-button.alert {
            background: #fde8d4 !important;
            border-color: #e67e22 !important;
            color: #a04000 !important;
            font-weight: bold !important;
        }

        #${HANDLE_ID}.alert {
            background: #e67e22 !important;
            color: #fff !important;
        }

        #${PALETTE_ID}.${OPEN_CLASS} {

            transform:
                translate(
                    0,
                    -50%
                ) !important;
        }


        /* =====================================================
           タイトル
           ===================================================== */

        .ainovel-tool-palette-title {

            font-size:
                13px !important;

            font-weight:
                bold !important;

            color:
                #555 !important;

            padding:
                3px 5px 8px 5px !important;

            text-align:
                center !important;
        }


        /* =====================================================
           パレットボタン
           ===================================================== */

        .ainovel-tool-palette-button {

            width:
                100% !important;

            min-height:
                46px !important;

            margin:
                0 0 7px 0 !important;

            padding:
                6px 8px !important;

            display:
                flex !important;

            align-items:
                center !important;

            gap:
                10px !important;

            border:
                1px solid
                #999 !important;

            border-radius:
                9px !important;

            background:
                #ffffff !important;

            color:
                #222 !important;

            box-shadow:
                0 1px 5px
                rgba(0,0,0,.12) !important;

            font-size:
                14px !important;

            text-align:
                left !important;

            cursor:
                pointer !important;

            touch-action:
                manipulation !important;
        }


        .ainovel-tool-palette-button:last-child {

            margin-bottom:
                0 !important;
        }


        .ainovel-tool-palette-button:active {

            transform:
                scale(.97) !important;

            background:
                #eeeeee !important;
        }


        .ainovel-tool-palette-button.missing {

            opacity:
                .38 !important;
        }


        .ainovel-tool-palette-icon {

            width:
                30px !important;

            min-width:
                30px !important;

            text-align:
                center !important;

            font-size:
                21px !important;

            line-height:
                1 !important;
        }


        .ainovel-tool-palette-label {

            flex:
                1 !important;

            white-space:
                nowrap !important;
        }


        /* =====================================================
           CSS三角形
           ▲▼の大きさを完全一致
           ===================================================== */

        .ainovel-palette-triangle {

            width:
                0 !important;

            height:
                0 !important;

            display:
                block !important;

            margin:
                auto !important;

            border-left:
                9px solid
                transparent !important;

            border-right:
                9px solid
                transparent !important;
        }


        .ainovel-palette-triangle.up {

            border-bottom:
                13px solid
                #222 !important;
        }


        .ainovel-palette-triangle.down {

            border-top:
                13px solid
                #222 !important;
        }

    `;

    document.head.appendChild(
        style
    );


    // =========================================================
    // 文字検索
    // =========================================================

    function findByText(
        candidates
    ) {

        if (
            !candidates ||
            !candidates.length
        ) {

            return null;

        }


        const elements =
            Array.from(
                document.querySelectorAll(
                    [
                        'button',
                        'input[type="button"]',
                        'input[type="submit"]'
                    ].join(',')
                )
            );


        for (
            const element
            of elements
        ) {

            /*
             * パレット自身は絶対に対象にしない
             */
            if (
                element.id ===
                    HANDLE_ID ||
                element.closest(
                    '#' + PALETTE_ID
                )
            ) {

                continue;

            }


            /*
             * 表示文字だけではなく
             * title / aria-label / value も全部検索
             *
             * 例：
             * 表示文字 = 📋
             * title = Grok用コピー
             *
             * のようなボタンにも対応
             */
            const texts = [

                element.textContent || '',

                element.value || '',

                element.title || '',

                element.getAttribute(
                    'aria-label'
                ) || ''

            ];


            const haystack =
                texts
                    .join(' ')
                    .trim();


            for (
                const candidate
                of candidates
            ) {

                if (
                    haystack.includes(
                        candidate
                    )
                ) {

                    return element;

                }

            }

        }


        return null;

    }


    // =========================================================
    // 元ボタン取得
    // =========================================================

    function findOriginalButton(
        tool
    ) {

        /*
         * まずID完全一致
         */
        for (
            const id
            of tool.ids || []
        ) {

            const element =
                document.getElementById(
                    id
                );


            if (
                element &&
                element.id !==
                    HANDLE_ID &&
                !element.closest(
                    '#' + PALETTE_ID
                )
            ) {

                return element;

            }

        }


        /*
         * IDで見つからない場合
         * 文字/title/aria-label検索
         */
        return findByText(
            tool.textCandidates
        );

    }


    // =========================================================
    // 元ボタン非表示
    // =========================================================

    function hideOriginalButtons() {

        for (
            const tool
            of TOOLS
        ) {

            /*
             * ひとつの項目に複数の元ボタンが
             * ある場合があるので、候補IDを
             * ぜんぶ隠します
             */
            const targets = [];


            for (
                const id
                of tool.ids || []
            ) {

                const found =
                    document.getElementById(
                        id
                    );


                if (found) {

                    targets.push(
                        found
                    );

                }

            }


            /*
             * IDで一つも見つからないときだけ
             * 文字検索に頼ります
             */
            if (!targets.length) {

                const byText =
                    findByText(
                        tool.textCandidates
                    );


                if (byText) {

                    targets.push(
                        byText
                    );

                }

            }


            for (
                const element
                of targets
            ) {

                /*
                 * パレット自身は除外
                 */
                if (
                    element.id ===
                        HANDLE_ID ||
                    element.closest(
                        '#' + PALETTE_ID
                    )
                ) {

                    continue;

                }


                element.classList.add(
                    HIDDEN_CLASS
                );

            }

        }

    }


    // =========================================================
    // 代理クリック
    // =========================================================

    function runTool(
        tool
    ) {

        const target =
            findOriginalButton(
                tool
            );


        if (!target) {

            showTemporaryMessage(
                tool.label +
                ' の元ボタンが見つかりません'
            );

            return;

        }


        /*
         * visibility:hidden でも
         * JSの .click() は実行可能
         */
        target.click();


        /*
         * 送り先切替は、変わったのが見えるように閉じずに表示を更新
         */
        if (tool.key === 'target') {

            setTimeout(updatePaletteButtons, 50);

            return;

        }


        /*
         * ▲▼だけは連続で押すことが多いので
         * パレットを閉じない
         */
        if (
            tool.key !== 'up' &&
            tool.key !== 'down'
        ) {

            closePalette();

        }

    }


    // =========================================================
    // 一時メッセージ
    // =========================================================

    let messageTimer =
        null;


    function showTemporaryMessage(
        text
    ) {

        let box =
            document.getElementById(
                'ainovel-tool-palette-message'
            );


        if (!box) {

            box =
                document.createElement(
                    'div'
                );


            box.id =
                'ainovel-tool-palette-message';


            Object.assign(
                box.style,
                {
                    position:
                        'fixed',

                    right:
                        '20px',

                    top:
                        '18px',

                    zIndex:
                        '2147483647',

                    padding:
                        '9px 12px',

                    borderRadius:
                        '8px',

                    background:
                        'rgba(30,30,30,.92)',

                    color:
                        '#fff',

                    fontSize:
                        '13px',

                    boxShadow:
                        '0 2px 10px rgba(0,0,0,.3)'
                }
            );


            document.body.appendChild(
                box
            );

        }


        box.textContent =
            text;


        box.style.display =
            'block';


        if (
            messageTimer
        ) {

            clearTimeout(
                messageTimer
            );

        }


        messageTimer =
            setTimeout(
                function () {

                    box.style.display =
                        'none';

                },
                1800
            );

    }


    // =========================================================
    // 開閉
    // =========================================================

    function getPalette() {

        return document.getElementById(
            PALETTE_ID
        );

    }


    function getHandle() {

        return document.getElementById(
            HANDLE_ID
        );

    }


    function isOpen() {

        const palette =
            getPalette();


        return !!(
            palette &&
            palette.classList.contains(
                OPEN_CLASS
            )
        );

    }


    function openPalette() {

        const palette =
            getPalette();

        const handle =
            getHandle();


        if (!palette) {

            return;

        }


        palette.classList.add(
            OPEN_CLASS
        );


        if (handle) {

            handle.textContent =
                '▶';

        }


        updatePaletteButtons();

    }


    function closePalette() {

        const palette =
            getPalette();

        const handle =
            getHandle();


        if (!palette) {

            return;

        }


        palette.classList.remove(
            OPEN_CLASS
        );


        if (handle) {

            handle.textContent =
                '◀';

        }

    }


    function togglePalette() {

        if (
            isOpen()
        ) {

            closePalette();

        }
        else {

            openPalette();

        }

    }


    // =========================================================
    // パレットボタン状態
    // =========================================================

    function updatePaletteButtons() {

        const palette =
            getPalette();


        if (!palette) {

            return;

        }


        for (
            const tool
            of TOOLS
        ) {

            const button =
                palette.querySelector(
                    `[data-tool="${tool.key}"]`
                );


            if (!button) {

                continue;

            }


            const target =
                findOriginalButton(
                    tool
                );


            button.classList.toggle(
                'missing',
                !target
            );


            button.title =
                target
                    ? tool.label
                    : tool.label +
                      '：元ボタン未検出';


            /*
             * 送り先：元ボタンのアイコンと名前をそのまま映します
             */
            if (tool.key === 'target' && target) {

                const iconBox =
                    button.querySelector('.ainovel-tool-palette-icon');

                const labelBox =
                    button.querySelector('.ainovel-tool-palette-label');

                const icon =
                    String(target.textContent || '').trim() || tool.icon;

                const name =
                    (String(target.title || '').match(/送り先:\s*([^（(]+)/) || [])[1];

                const text =
                    '送り先：' + (name ? name.trim() : '?');

                if (iconBox && iconBox.textContent !== icon) {
                    iconBox.textContent = icon;
                }

                if (labelBox && labelBox.textContent !== text) {
                    labelBox.textContent = text;
                }
            }


            /*
             * キャラブック更新の送り忘れ警告
             * （元ボタンの文字に⚠が付いているとき）
             */
            if (tool.key === 'cb') {

                const alert =
                    !!(
                        target &&
                        String(target.textContent || '').includes('⚠')
                    );

                button.classList.toggle('alert', alert);

                const label =
                    button.querySelector('.ainovel-tool-palette-label');

                if (label) {
                    label.textContent =
                        tool.label + (alert ? '⚠' : '');
                }

                const handle = getHandle();

                if (handle) {
                    handle.classList.toggle('alert', alert);
                }
            }

        }

    }


    // =========================================================
    // パレット作成
    // =========================================================

    function createPalette() {

        if (
            document.getElementById(
                PALETTE_ID
            )
        ) {

            return;

        }


        // -----------------------------------------------------
        // パレット
        // -----------------------------------------------------

        const palette =
            document.createElement(
                'div'
            );


        palette.id =
            PALETTE_ID;


        const title =
            document.createElement(
                'div'
            );


        title.className =
            'ainovel-tool-palette-title';


        title.textContent =
            'ツール';


        palette.appendChild(
            title
        );


        for (
            const tool
            of TOOLS
        ) {

            const button =
                document.createElement(
                    'button'
                );


            button.type =
                'button';


            button.className =
                'ainovel-tool-palette-button';


            button.dataset.tool =
                tool.key;


            // -------------------------------------------------
            // アイコン
            // -------------------------------------------------

            const icon =
                document.createElement(
                    'span'
                );


            icon.className =
                'ainovel-tool-palette-icon';


            /*
             * ▲▼だけCSS三角形
             */
            if (
                tool.key === 'up' ||
                tool.key === 'down'
            ) {

                const triangle =
                    document.createElement(
                        'span'
                    );


                triangle.className =
                    'ainovel-palette-triangle ' +
                    (
                        tool.key === 'up'
                            ? 'up'
                            : 'down'
                    );


                icon.appendChild(
                    triangle
                );

            }
            else {

                icon.textContent =
                    tool.icon;

            }


            // -------------------------------------------------
            // ラベル
            // -------------------------------------------------

            const label =
                document.createElement(
                    'span'
                );


            label.className =
                'ainovel-tool-palette-label';


            label.textContent =
                tool.label;


            button.appendChild(
                icon
            );


            button.appendChild(
                label
            );


            // -------------------------------------------------
            // クリック
            // -------------------------------------------------

            button.addEventListener(
                'click',
                function (
                    event
                ) {

                    event.preventDefault();

                    event.stopPropagation();


                    runTool(
                        tool
                    );

                }
            );


            palette.appendChild(
                button
            );

        }


        document.body.appendChild(
            palette
        );


        // -----------------------------------------------------
        // 取っ手
        // -----------------------------------------------------

        const handle =
            document.createElement(
                'button'
            );


        handle.id =
            HANDLE_ID;


        handle.type =
            'button';


        handle.textContent =
            '◀';


        handle.title =
            'ツールパレット';


        handle.setAttribute(
            'aria-label',
            'ツールパレット'
        );


        document.body.appendChild(
            handle
        );


        handle.addEventListener(
            'click',
            function (
                event
            ) {

                event.preventDefault();

                event.stopPropagation();


                togglePalette();

            }
        );


        setupSwipe(
            handle,
            palette
        );


        updatePaletteButtons();

    }


    // =========================================================
    // 取っ手 / パレット上のスワイプ
    // =========================================================

    function setupSwipe(
        handle,
        palette
    ) {

        let startX =
            0;

        let startY =
            0;

        let tracking =
            false;


        function pointerDown(
            event
        ) {

            tracking =
                true;


            startX =
                event.clientX;


            startY =
                event.clientY;

        }


        function pointerUp(
            event
        ) {

            if (
                !tracking
            ) {

                return;

            }


            tracking =
                false;


            const dx =
                event.clientX -
                startX;


            const dy =
                event.clientY -
                startY;


            /*
             * 縦移動の方が大きければ
             * スクロール扱い
             */
            if (
                Math.abs(
                    dy
                ) >
                Math.abs(
                    dx
                )
            ) {

                return;

            }


            /*
             * 左へ45px以上
             */
            if (
                dx <
                -45
            ) {

                openPalette();

                return;

            }


            /*
             * 右へ45px以上
             */
            if (
                dx >
                45
            ) {

                closePalette();

            }

        }


        handle.addEventListener(
            'pointerdown',
            pointerDown
        );


        handle.addEventListener(
            'pointerup',
            pointerUp
        );


        palette.addEventListener(
            'pointerdown',
            pointerDown
        );


        palette.addEventListener(
            'pointerup',
            pointerUp
        );

    }


    // =========================================================
    // 右端からのスワイプ検出
    // =========================================================

    let edgeStartX =
        0;

    let edgeStartY =
        0;

    let edgeTracking =
        false;


    document.addEventListener(
        'touchstart',
        function (
            event
        ) {

            if (
                !event.touches ||
                !event.touches.length
            ) {

                return;

            }


            const touch =
                event.touches[0];


            /*
             * 右端28px以内から開始した場合だけ
             */
            if (
                touch.clientX <
                window.innerWidth -
                28
            ) {

                edgeTracking =
                    false;

                return;

            }


            edgeTracking =
                true;


            edgeStartX =
                touch.clientX;


            edgeStartY =
                touch.clientY;

        },
        {
            passive:
                true
        }
    );


    document.addEventListener(
        'touchend',
        function (
            event
        ) {

            if (
                !edgeTracking
            ) {

                return;

            }


            edgeTracking =
                false;


            if (
                !event.changedTouches ||
                !event.changedTouches.length
            ) {

                return;

            }


            const touch =
                event.changedTouches[0];


            const dx =
                touch.clientX -
                edgeStartX;


            const dy =
                touch.clientY -
                edgeStartY;


            /*
             * 縦方向の方が大きいなら
             * 通常スクロール扱い
             */
            if (
                Math.abs(
                    dy
                ) >
                Math.abs(
                    dx
                )
            ) {

                return;

            }


            /*
             * 左スワイプ
             */
            if (
                dx <
                -45
            ) {

                openPalette();

            }

        },
        {
            passive:
                true
        }
    );


    // =========================================================
    // DOM監視
    // =========================================================

    let scheduled =
        false;


    function refresh() {

        scheduled =
            false;


        createPalette();

        hideOriginalButtons();

        updatePaletteButtons();

    }


    function scheduleRefresh() {

        if (
            scheduled
        ) {

            return;

        }


        scheduled =
            true;


        setTimeout(
            refresh,
            150
        );

    }


    const observer =
        new MutationObserver(
            function () {

                scheduleRefresh();

            }
        );


    observer.observe(
        document.documentElement,
        {
            childList:
                true,

            subtree:
                true
        }
    );


    // =========================================================
    // 起動
    // =========================================================

    createPalette();

    hideOriginalButtons();

    updatePaletteButtons();


    /*
     * 他ユーザースクリプトが
     * 後からボタンを生成しても対応
     */
    setInterval(
        function () {

            hideOriginalButtons();

            updatePaletteButtons();

        },
        1000
    );

})();