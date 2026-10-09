
// ==UserScript==
// @name         AIのべりすと 本文＆指示入力 全画面 + QuickPaste + 生成状態カラーa
// @namespace    quickpaste
// @version      6.3.1
// @description  本文全画面、指示入力、QuickPaste補助。生成中ピンク、生成完了後黄色、ユーザー操作のスクロールで白に戻します。
// @match        https://ai-novel.com/*
// @match        https://*.ai-novel.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // ID / CLASS
    // =========================================================

    const MAIN_BUTTON_ID = 'qp-full-main';
    const SWITCH_BUTTON_ID = 'qp-full-switch';

    const FAKE_INPUT_ID = 'qp-full-input';
    const FAKE_SEND_ID = 'qp-full-send';

    const INPUT_PANEL_ID = 'qp-full-input-panel';

    const ASSIST_AREA_ID = 'qp-full-assist-area';
    const CHAR_BUTTON_ID = 'qp-full-char-button';
    const LOAD_BUTTON_ID = 'qp-full-load-button';
    const TEMPLATE_BUTTON_ID = 'qp-full-template-button';

    /*
     * 定型文の保存先（localStorage）
     */
    const TEMPLATE_KEY = 'qp_full_template_text';

    /*
     * 初期の定型文。
     * ボタンを長押しするとその場で書き換えられます。
     */
    const DEFAULT_TEMPLATE_TEXT = '（ここに定型文を入れてください）';

    /*
     * 定型文ボタンの位置。
     * 画面の下からの距離と、右からの距離です。
     *
     * bottom を 10px にすると
     * 「📖 本文だけ」と同じ高さに並びます。
     * もっと下げたいときは数字を小さく、
     * 上げたいときは大きくしてください。
     */
    const TEMPLATE_BUTTON_BOTTOM = '10px';
    const TEMPLATE_BUTTON_RIGHT = '8px';

    const ACTIVE_CLASS = 'qp-full-active';
    const TEXT_MODE_CLASS = 'qp-text-mode';
    const INPUT_MODE_CLASS = 'qp-input-mode';

    const GENERATING_CLASS = 'qp-generating';
    const GENERATED_CLASS = 'qp-generated';


    // =========================================================
    // 色
    // =========================================================

    const NORMAL_COLOR = '#ffffff';

    // 生成中
    const GENERATING_COLOR = '#ffc1d6';

    // 生成終了
    const GENERATED_COLOR = '#fff3a3';


    // =========================================================
    // 状態
    // =========================================================

    let enabled = false;
    let mode = 'text';

    let wasGenerating = false;

    let loadingObserver = null;
    let observedLoadingElement = null;

    let bodyObserver = null;

    let observedScrollContainer = null;

    /*
     * ユーザーが実際に指で触っているか
     */
    let userScrollArmed = false;


    // =========================================================
    // CSS
    // =========================================================

    const style = document.createElement('style');

    style.textContent = `

        /* =====================================================
           下部固定ボタン
           ===================================================== */

        #${MAIN_BUTTON_ID},
        #${SWITCH_BUTTON_ID} {

            position: fixed !important;
            bottom: 10px !important;

            z-index: 2147483647 !important;

            height: 42px !important;
            min-width: 100px !important;

            padding: 6px 12px !important;

            box-sizing: border-box !important;

            border: 1px solid #888 !important;
            border-radius: 9px !important;

            background: rgba(255,255,255,.97) !important;
            color: #222 !important;

            font-size: 13px !important;
            font-weight: bold !important;

            box-shadow:
                0 2px 10px
                rgba(0,0,0,.30) !important;

            cursor: pointer !important;

            user-select: none !important;
            -webkit-user-select: none !important;

            touch-action: manipulation !important;
        }


        #${MAIN_BUTTON_ID} {

            right: 8px !important;

        }


        #${SWITCH_BUTTON_ID} {

            left: 8px !important;
            display: none;

        }


        body.${ACTIVE_CLASS}
        #${SWITCH_BUTTON_ID} {

            display: block !important;

        }


        /* =====================================================
           背景レイヤー
           ===================================================== */

        body.${ACTIVE_CLASS}::after {

            content: "" !important;

            position: fixed !important;

            inset: 0 !important;

            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;

            background:
                ${NORMAL_COLOR} !important;

            z-index: 2147483600 !important;

            pointer-events: none !important;

            transition:
                background-color
                .18s ease !important;
        }


        /*
         * 生成中
         */
        body.${ACTIVE_CLASS}.${GENERATING_CLASS}::after {

            background:
                ${GENERATING_COLOR} !important;

        }


        /*
         * 生成終了後
         */
        body.${ACTIVE_CLASS}.${GENERATED_CLASS}::after {

            background:
                ${GENERATED_COLOR} !important;

        }


        /* =====================================================
           背面スクロール停止
           ===================================================== */

        html.${ACTIVE_CLASS},
        body.${ACTIVE_CLASS} {

            overflow: hidden !important;

            overscroll-behavior:
                none !important;

        }


        /* =====================================================
           DOMを移動させずレイアウトだけ解除
           ===================================================== */

        body.${ACTIVE_CLASS}
        .container,

        body.${ACTIVE_CLASS}
        .nv4_page_column,

        body.${ACTIVE_CLASS}
        .main_area,

        body.${ACTIVE_CLASS}
        main {

            transform: none !important;
            translate: none !important;
            scale: none !important;
            rotate: none !important;

            filter: none !important;

            perspective: none !important;

            contain: none !important;

            clip: auto !important;
            clip-path: none !important;

            overflow: visible !important;

            position: static !important;

            width: auto !important;
            height: auto !important;

            min-width: 0 !important;

            max-width: none !important;
            max-height: none !important;

            margin: 0 !important;
            padding: 0 !important;
        }


        /* =====================================================
           本文全画面
           ===================================================== */

        body.${ACTIVE_CLASS}.${TEXT_MODE_CLASS}
        #data_container {

            display: block !important;

            position: fixed !important;

            inset: 0 !important;

            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;

            z-index: 2147483620 !important;

            width: 100vw !important;

            height: 100vh !important;
            height: 100dvh !important;

            max-width: none !important;
            max-height: none !important;

            margin: 0 !important;

            padding:
                2px
                2px
                62px
                2px !important;

            box-sizing: border-box !important;

            overflow-x: hidden !important;
            overflow-y: auto !important;

            -webkit-overflow-scrolling:
                touch !important;

            overscroll-behavior:
                contain !important;

            background:
                ${NORMAL_COLOR} !important;

            transition:
                background-color
                .18s ease !important;
        }


        /* =====================================================
           生成中：濃いピンク
           ===================================================== */

        body.${ACTIVE_CLASS}.${GENERATING_CLASS}.${TEXT_MODE_CLASS}
        #data_container {

            background:
                ${GENERATING_COLOR} !important;

        }


        body.${ACTIVE_CLASS}.${GENERATING_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_block,

        body.${ACTIVE_CLASS}.${GENERATING_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit_shell,

        body.${ACTIVE_CLASS}.${GENERATING_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit {

            background-color:
                transparent !important;

        }


        /* =====================================================
           生成完了：黄色
           ===================================================== */

        body.${ACTIVE_CLASS}.${GENERATED_CLASS}.${TEXT_MODE_CLASS}
        #data_container {

            background:
                ${GENERATED_COLOR} !important;

        }


        body.${ACTIVE_CLASS}.${GENERATED_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_block,

        body.${ACTIVE_CLASS}.${GENERATED_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit_shell,

        body.${ACTIVE_CLASS}.${GENERATED_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit {

            background-color:
                transparent !important;

        }


        /* =====================================================
           本文内部
           ===================================================== */

        body.${ACTIVE_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_block,

        body.${ACTIVE_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit_shell,

        body.${ACTIVE_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit,

        body.${ACTIVE_CLASS}.${TEXT_MODE_CLASS}
        #data_container .data_edit_preview {

            width: 100% !important;

            max-width: none !important;

            margin-left: 0 !important;
            margin-right: 0 !important;

            box-sizing: border-box !important;

        }


        /* =====================================================
           指示入力パネル
           ===================================================== */

        #${INPUT_PANEL_ID} {

            display: none;

            position: fixed !important;

            inset: 0 !important;

            z-index: 2147483630 !important;

            width: 100vw !important;

            height: 100vh !important;
            height: 100dvh !important;

            padding:
                10px
                8px
                64px
                8px !important;

            box-sizing: border-box !important;

            background:
                ${NORMAL_COLOR} !important;

            transition:
                background-color
                .18s ease !important;
        }


        body.${ACTIVE_CLASS}.${INPUT_MODE_CLASS}
        #${INPUT_PANEL_ID} {

            display: flex !important;

            flex-direction:
                column !important;

            gap: 10px !important;

        }


        body.${ACTIVE_CLASS}.${GENERATING_CLASS}
        #${INPUT_PANEL_ID} {

            background:
                ${GENERATING_COLOR} !important;

        }


        body.${ACTIVE_CLASS}.${GENERATED_CLASS}
        #${INPUT_PANEL_ID} {

            background:
                ${GENERATED_COLOR} !important;

        }


        /* =====================================================
           指示入力欄
           ===================================================== */

        #${FAKE_INPUT_ID} {

            display: block !important;

            width: 100% !important;

            min-width: 0 !important;

            flex: 1 !important;

            padding: 14px !important;

            box-sizing: border-box !important;

            resize: none !important;

            border: 1px solid #999 !important;
            border-radius: 10px !important;

            background: #fff !important;

            color: #111 !important;

            -webkit-text-fill-color:
                #111 !important;

            caret-color:
                #111 !important;

            font-size: 18px !important;

            line-height: 1.65 !important;
        }


        #${FAKE_INPUT_ID}:focus {

            outline:
                2px solid
                rgba(60,120,220,.40) !important;

        }


        /* =====================================================
           入力補助
           ===================================================== */

        #${ASSIST_AREA_ID} {

            display: flex !important;

            gap: 8px !important;

            width: 100% !important;

            flex: none !important;
        }


        #${CHAR_BUTTON_ID},
        #${LOAD_BUTTON_ID} {

            flex: 1 !important;

            height: 44px !important;

            box-sizing: border-box !important;

            border:
                1px solid
                #888 !important;

            border-radius:
                8px !important;

            background:
                #f3f3f3 !important;

            color:
                #222 !important;

            font-size:
                15px !important;

            font-weight:
                bold !important;

            cursor:
                pointer !important;
        }


        /* =====================================================
           定型文ボタン（右下）
           ===================================================== */

        #${TEMPLATE_BUTTON_ID} {

            display: none;

            position: fixed !important;

            right: ${TEMPLATE_BUTTON_RIGHT} !important;
            bottom: ${TEMPLATE_BUTTON_BOTTOM} !important;

            z-index: 2147483647 !important;

            height: 42px !important;
            min-width: 100px !important;

            padding: 6px 12px !important;

            box-sizing: border-box !important;

            border: 1px solid #888 !important;
            border-radius: 9px !important;

            background: rgba(255,255,255,.97) !important;
            color: #222 !important;

            font-size: 13px !important;
            font-weight: bold !important;

            box-shadow:
                0 2px 10px
                rgba(0,0,0,.30) !important;

            cursor: pointer !important;

            user-select: none !important;
            -webkit-user-select: none !important;

            touch-action: manipulation !important;
        }


        body.${ACTIVE_CLASS}.${INPUT_MODE_CLASS}
        #${TEMPLATE_BUTTON_ID} {

            display: block !important;

        }


        #${TEMPLATE_BUTTON_ID}:active {

            transform:
                scale(.98);

        }


        #${CHAR_BUTTON_ID}:active,
        #${LOAD_BUTTON_ID}:active {

            transform:
                scale(.98);

            background:
                #e4e4e4 !important;

        }


        /* =====================================================
           続ける
           ===================================================== */

        #${FAKE_SEND_ID} {

            width: 100% !important;

            height: 54px !important;

            flex: none !important;

            border:
                1px solid
                #000 !important;

            border-radius:
                9px !important;

            background:
                #cd2b5a !important;

            color:
                #fff !important;

            font-size:
                18px !important;

            font-weight:
                bold !important;

            cursor:
                pointer !important;

        }


        #${FAKE_SEND_ID}:active {

            transform:
                scale(.98);

        }


        /* =====================================================
           QuickPaste最前面
           ===================================================== */

        #qp_overlay {

            z-index:
                2147483646 !important;

        }

    `;


    document.head.appendChild(
        style
    );


    // =========================================================
    // 二重実行防止
    // =========================================================

    if (
        document.getElementById(
            MAIN_BUTTON_ID
        )
    ) {

        return;

    }


    // =========================================================
    // 本文ボタン
    // =========================================================

    const mainButton =
        document.createElement(
            'button'
        );


    mainButton.id =
        MAIN_BUTTON_ID;


    mainButton.type =
        'button';


    mainButton.textContent =
        '📖 本文だけ';


    document.body.appendChild(
        mainButton
    );


    // =========================================================
    // 指示入力切替
    // =========================================================

    const switchButton =
        document.createElement(
            'button'
        );


    switchButton.id =
        SWITCH_BUTTON_ID;


    switchButton.type =
        'button';


    switchButton.textContent =
        '✍ 指示入力';


    document.body.appendChild(
        switchButton
    );


    // =========================================================
    // 定型文ボタン
    // =========================================================

    const templateButton =
        document.createElement(
            'button'
        );


    templateButton.id =
        TEMPLATE_BUTTON_ID;


    templateButton.type =
        'button';


    templateButton.textContent =
        '📋 定型文';


    templateButton.title =
        '長押しで定型文を編集';


    document.body.appendChild(
        templateButton
    );


    // =========================================================
    // 指示パネル
    // =========================================================

    const inputPanel =
        document.createElement(
            'div'
        );


    inputPanel.id =
        INPUT_PANEL_ID;


    const fakeInput =
        document.createElement(
            'textarea'
        );


    fakeInput.id =
        FAKE_INPUT_ID;


    fakeInput.placeholder =
        '指示したい内容を入力';


    // =========================================================
    // 入力補助
    // =========================================================

    const assistArea =
        document.createElement(
            'div'
        );


    assistArea.id =
        ASSIST_AREA_ID;


    const charButton =
        document.createElement(
            'button'
        );


    charButton.id =
        CHAR_BUTTON_ID;


    charButton.type =
        'button';


    charButton.textContent =
        'キャラ一覧';


    const loadButton =
        document.createElement(
            'button'
        );


    loadButton.id =
        LOAD_BUTTON_ID;


    loadButton.type =
        'button';


    loadButton.textContent =
        '読込';


    assistArea.appendChild(
        charButton
    );


    assistArea.appendChild(
        loadButton
    );


    // =========================================================
    // 続ける
    // =========================================================

    const fakeSend =
        document.createElement(
            'button'
        );


    fakeSend.id =
        FAKE_SEND_ID;


    fakeSend.type =
        'button';


    fakeSend.textContent =
        '続ける';


    inputPanel.appendChild(
        fakeInput
    );


    inputPanel.appendChild(
        assistArea
    );


    inputPanel.appendChild(
        fakeSend
    );


    document.body.appendChild(
        inputPanel
    );


    // =========================================================
    // 本物 → 全画面入力
    // =========================================================

    function syncRealToFake() {

        const realInput =
            document.getElementById(
                'chat_field'
            );


        if (!realInput) {

            return false;

        }


        fakeInput.value =
            realInput.value || '';


        return true;

    }


    // =========================================================
    // 全画面入力 → 本物
    // =========================================================

    function syncFakeToReal() {

        const realInput =
            document.getElementById(
                'chat_field'
            );


        if (!realInput) {

            return false;

        }


        realInput.value =
            fakeInput.value;


        try {

            realInput.dispatchEvent(

                new InputEvent(
                    'input',
                    {
                        bubbles: true,

                        inputType:
                            'insertText',

                        data:
                            null
                    }
                )

            );

        }

        catch (_) {

            realInput.dispatchEvent(

                new Event(
                    'input',
                    {
                        bubbles:
                            true
                    }
                )

            );

        }


        realInput.dispatchEvent(

            new Event(
                'change',
                {
                    bubbles:
                        true
                }
            )

        );


        return true;

    }


    // =========================================================
    // 本文画面
    // =========================================================

    function showText() {

        if (!enabled) {

            return;

        }


        mode =
            'text';


        document.body.classList.remove(
            INPUT_MODE_CLASS
        );


        document.body.classList.add(
            TEXT_MODE_CLASS
        );


        switchButton.textContent =
            '✍ 指示入力';


        setupUserScrollReset();

    }


    // =========================================================
    // 指示入力画面
    // =========================================================

    function showInput() {

        if (!enabled) {

            return;

        }


        syncRealToFake();


        mode =
            'input';


        document.body.classList.remove(
            TEXT_MODE_CLASS
        );


        document.body.classList.add(
            INPUT_MODE_CLASS
        );


        switchButton.textContent =
            '📖 本文へ';

    }


    // =========================================================
    // 黄色解除
    // =========================================================

    function clearGeneratedColor() {

        document.body.classList.remove(
            GENERATED_CLASS
        );


        userScrollArmed =
            false;

    }


    // =========================================================
    // 生成開始
    // =========================================================

    function enterGeneratingState() {

        wasGenerating =
            true;


        userScrollArmed =
            false;


        document.body.classList.remove(
            GENERATED_CLASS
        );


        document.body.classList.add(
            GENERATING_CLASS
        );

    }


    // =========================================================
    // 生成終了
    // =========================================================

    function enterGeneratedState() {

        document.body.classList.remove(
            GENERATING_CLASS
        );


        document.body.classList.add(
            GENERATED_CLASS
        );


        userScrollArmed =
            false;


        setupUserScrollReset();

    }


    // =========================================================
    // loading_anim状態確認
    // =========================================================

    function updateGeneratingState() {

        const loading =
            document.getElementById(
                'loading_anim'
            );


        if (!loading) {

            return;

        }


        const css =
            window.getComputedStyle(
                loading
            );


        const visible =
            (
                css.display !==
                    'none' &&

                css.visibility !==
                    'hidden' &&

                css.opacity !==
                    '0'
            );


        /*
         * 生成開始
         */
        if (visible) {

            if (
                !document.body
                    .classList
                    .contains(
                        GENERATING_CLASS
                    )
            ) {

                enterGeneratingState();

            }

        }


        /*
         * 生成終了
         */
        else {

            if (
                document.body
                    .classList
                    .contains(
                        GENERATING_CLASS
                    )
            ) {

                document.body.classList.remove(
                    GENERATING_CLASS
                );

            }


            /*
             * 本当に一度生成状態になった後だけ
             * 黄色へ
             */
            if (
                wasGenerating
            ) {

                wasGenerating =
                    false;


                enterGeneratedState();

            }

        }

    }


    // =========================================================
    // loading_anim監視
    // =========================================================

    function setupLoadingObserver() {

        const loading =
            document.getElementById(
                'loading_anim'
            );


        if (!loading) {

            return false;

        }


        /*
         * 同じ要素をすでに監視中
         */
        if (
            observedLoadingElement ===
                loading &&
            loadingObserver
        ) {

            return true;

        }


        if (
            loadingObserver
        ) {

            loadingObserver.disconnect();

        }


        observedLoadingElement =
            loading;


        loadingObserver =
            new MutationObserver(

                function () {

                    updateGeneratingState();

                }

            );


        loadingObserver.observe(

            loading,

            {
                attributes:
                    true,

                attributeFilter: [
                    'style',
                    'class',
                    'hidden'
                ]
            }

        );


        updateGeneratingState();


        return true;

    }


    // =========================================================
    // ユーザー操作だけで黄色を解除
    // =========================================================

    function setupUserScrollReset() {

        const container =
            document.getElementById(
                'data_container'
            );


        if (!container) {

            return;

        }


        /*
         * 同じ本文欄へ重複登録しない
         */
        if (
            observedScrollContainer ===
            container
        ) {

            return;

        }


        observedScrollContainer =
            container;


        // -----------------------------------------------------
        // Android / タッチ操作
        // -----------------------------------------------------

        container.addEventListener(

            'touchstart',

            function () {

                if (
                    document.body
                        .classList
                        .contains(
                            GENERATED_CLASS
                        )
                ) {

                    /*
                     * 指を触れただけではまだ白にしない
                     */
                    userScrollArmed =
                        true;

                }

            },

            {
                passive:
                    true
            }

        );


        container.addEventListener(

            'touchmove',

            function () {

                /*
                 * 黄色状態かつ、
                 * 実際にユーザーが指を置いて動かした時だけ解除
                 */
                if (
                    userScrollArmed &&
                    document.body
                        .classList
                        .contains(
                            GENERATED_CLASS
                        )
                ) {

                    clearGeneratedColor();

                }

            },

            {
                passive:
                    true
            }

        );


        container.addEventListener(

            'touchend',

            function () {

                userScrollArmed =
                    false;

            },

            {
                passive:
                    true
            }

        );


        container.addEventListener(

            'touchcancel',

            function () {

                userScrollArmed =
                    false;

            },

            {
                passive:
                    true
            }

        );


        // -----------------------------------------------------
        // PCマウスホイール
        // -----------------------------------------------------

        container.addEventListener(

            'wheel',

            function () {

                if (
                    document.body
                        .classList
                        .contains(
                            GENERATED_CLASS
                        )
                ) {

                    clearGeneratedColor();

                }

            },

            {
                passive:
                    true
            }

        );

    }


    // =========================================================
    // QuickPaste監視
    // =========================================================

    function setupQuickPasteObserver() {

        if (
            bodyObserver
        ) {

            return;

        }


        let overlayWasVisible =
            false;


        bodyObserver =
            new MutationObserver(

                function () {

                    const overlay =
                        document.getElementById(
                            'qp_overlay'
                        );


                    if (overlay) {

                        const css =
                            window.getComputedStyle(
                                overlay
                            );


                        const visible =
                            (
                                css.display !==
                                    'none' &&

                                css.visibility !==
                                    'hidden'
                            );


                        if (visible) {

                            overlayWasVisible =
                                true;

                        }


                        else if (
                            overlayWasVisible &&
                            enabled &&
                            mode ===
                                'input'
                        ) {

                            overlayWasVisible =
                                false;


                            setTimeout(

                                function () {

                                    syncRealToFake();

                                },

                                80

                            );

                        }


                        return;

                    }


                    if (
                        overlayWasVisible &&
                        enabled &&
                        mode ===
                            'input'
                    ) {

                        overlayWasVisible =
                            false;


                        setTimeout(

                            function () {

                                syncRealToFake();

                            },

                            80

                        );

                    }

                }

            );


        bodyObserver.observe(

            document.body,

            {
                childList:
                    true,

                subtree:
                    true,

                attributes:
                    true,

                attributeFilter: [
                    'style',
                    'class'
                ]
            }

        );

    }


    // =========================================================
    // 全画面ON
    // =========================================================

    function enableFullscreen() {

        const dataContainer =
            document.getElementById(
                'data_container'
            );


        if (!dataContainer) {

            alert(
                '本文が見つかりません。'
            );

            return;

        }


        enabled =
            true;


        document.documentElement
            .classList
            .add(
                ACTIVE_CLASS
            );


        document.body
            .classList
            .add(
                ACTIVE_CLASS
            );


        mainButton.textContent =
            '↩ 元に戻す';


        showText();


        setupUserScrollReset();


        updateGeneratingState();

    }


    // =========================================================
    // 全画面OFF
    // =========================================================

    function disableFullscreen() {

        if (!enabled) {

            return;

        }


        if (
            mode ===
                'input'
        ) {

            syncFakeToReal();

        }


        enabled =
            false;


        mode =
            'text';


        userScrollArmed =
            false;


        document.documentElement
            .classList
            .remove(
                ACTIVE_CLASS
            );


        document.body
            .classList
            .remove(
                ACTIVE_CLASS,
                TEXT_MODE_CLASS,
                INPUT_MODE_CLASS
            );


        mainButton.textContent =
            '📖 本文だけ';


        switchButton.textContent =
            '✍ 指示入力';

    }


    // =========================================================
    // 指示送信
    // =========================================================

    function sendInstruction() {

        if (
            !fakeInput
                .value
                .trim()
        ) {

            fakeInput.focus();

            return;

        }


        if (
            !syncFakeToReal()
        ) {

            alert(
                '本物の指示入力欄が見つかりません。'
            );

            return;

        }


        const realButton =
            document.getElementById(
                'getcontinuation_chat'
            );


        if (!realButton) {

            alert(
                '本物の「続ける」が見つかりません。'
            );

            return;

        }


        /*
         * 前回の黄色を解除
         */
        clearGeneratedColor();


        try {

            if (
                typeof window.CopyContent ===
                    'function'
            ) {

                window.CopyContent();

            }

        }

        catch (error) {

            console.warn(
                'CopyContent:',
                error
            );

        }


        /*
         * 本物の続ける
         */
        realButton.click();


        /*
         * loading_animが表示されるまで
         * 少し時間差があるため数回確認
         */
        setTimeout(
            updateGeneratingState,
            30
        );


        setTimeout(
            updateGeneratingState,
            100
        );


        setTimeout(
            updateGeneratingState,
            250
        );


        setTimeout(
            updateGeneratingState,
            500
        );


        /*
         * 本文へ戻る
         */
        setTimeout(

            function () {

                if (
                    enabled
                ) {

                    showText();

                }

            },

            180

        );

    }


    // =========================================================
    // 本文だけ / 戻す
    // =========================================================

    mainButton.addEventListener(

        'click',

        function (
            event
        ) {

            event.preventDefault();

            event.stopPropagation();


            if (
                enabled
            ) {

                disableFullscreen();

            }

            else {

                enableFullscreen();

            }

        }

    );


    // =========================================================
    // 定型文の読み書き
    // =========================================================

    function loadTemplateText() {

        try {

            const saved =
                localStorage.getItem(
                    TEMPLATE_KEY
                );


            if (
                saved !== null
            ) {

                return saved;

            }

        }

        catch (_) {
        }


        return DEFAULT_TEMPLATE_TEXT;

    }


    function saveTemplateText(
        text
    ) {

        try {

            localStorage.setItem(
                TEMPLATE_KEY,
                text
            );

        }

        catch (_) {
        }

    }


    /*
     * いま書いてある指示の下に
     * 空行を1行はさんで定型文を足します
     */
    function appendTemplate() {

        const template =
            loadTemplateText();


        if (!template) {

            return;

        }


        const current =
            fakeInput.value;


        /*
         * 末尾の改行は数え直すので
         * いったん削っておきます
         */
        const body =
            current.replace(
                /\s+$/,
                ''
            );


        fakeInput.value =
            body
                ? body +
                  '\n\n' +
                  template
                : template;


        /*
         * カーソルを末尾へ
         */
        const end =
            fakeInput.value.length;


        fakeInput.focus();


        try {

            fakeInput.setSelectionRange(
                end,
                end
            );

        }

        catch (_) {
        }


        fakeInput.scrollTop =
            fakeInput.scrollHeight;


        syncFakeToReal();

    }


    function editTemplate() {

        const next =
            prompt(
                '定型文を入力してください',
                loadTemplateText()
            );


        if (
            next === null
        ) {

            return;

        }


        saveTemplateText(
            next
        );

    }


    // =========================================================
    // 定型文ボタンの操作
    // =========================================================

    let templateHoldTimer = null;
    let templateHeld = false;


    function cancelTemplateHold() {

        if (
            templateHoldTimer
        ) {

            clearTimeout(
                templateHoldTimer
            );

        }


        templateHoldTimer = null;

    }


    templateButton.addEventListener(

        'pointerdown',

        function () {

            templateHeld = false;


            templateHoldTimer =
                setTimeout(

                    function () {

                        templateHeld = true;


                        editTemplate();

                    },

                    550

                );

        }

    );


    templateButton.addEventListener(
        'pointerup',
        cancelTemplateHold
    );


    templateButton.addEventListener(
        'pointercancel',
        cancelTemplateHold
    );


    templateButton.addEventListener(
        'pointerleave',
        cancelTemplateHold
    );


    templateButton.addEventListener(

        'contextmenu',

        function (
            event
        ) {

            event.preventDefault();


            cancelTemplateHold();


            templateHeld = true;


            editTemplate();

        }

    );


    templateButton.addEventListener(

        'click',

        function (
            event
        ) {

            event.preventDefault();

            event.stopPropagation();


            if (
                templateHeld
            ) {

                templateHeld = false;


                return;

            }


            appendTemplate();

        }

    );


    // =========================================================
    // 本文 ⇔ 指示入力
    // =========================================================

    switchButton.addEventListener(

        'click',

        function (
            event
        ) {

            event.preventDefault();

            event.stopPropagation();


            if (!enabled) {

                return;

            }


            if (
                mode ===
                    'text'
            ) {

                showInput();

            }

            else {

                syncFakeToReal();

                showText();

            }

        }

    );


    // =========================================================
    // キャラ一覧
    // =========================================================

    charButton.addEventListener(

        'click',

        function (
            event
        ) {

            event.preventDefault();

            event.stopPropagation();


            syncFakeToReal();


            const originalButton =
                document.getElementById(
                    'qp_show_btn'
                );


            if (!originalButton) {

                alert(
                    'QuickPasteの「キャラ一覧」が見つかりません。\n' +
                    'QuickPaste用ユーザースクリプトが有効か確認してください。'
                );

                return;

            }


            originalButton.click();

        }

    );


    // =========================================================
    // 読込
    // =========================================================

    loadButton.addEventListener(

        'click',

        function (
            event
        ) {

            event.preventDefault();

            event.stopPropagation();


            syncFakeToReal();


            const originalButton =
                document.getElementById(
                    'qp_load_btn'
                );


            if (!originalButton) {

                alert(
                    'QuickPasteの「読込」が見つかりません。\n' +
                    'QuickPaste用ユーザースクリプトが有効か確認してください。'
                );

                return;

            }


            originalButton.click();

        }

    );


    // =========================================================
    // 続ける
    // =========================================================

    fakeSend.addEventListener(

        'click',

        function (
            event
        ) {

            event.preventDefault();

            event.stopPropagation();


            sendInstruction();

        }

    );


    // =========================================================
    // 本物入力 → 全画面入力同期
    // =========================================================

    function bindRealInput() {

        const realInput =
            document.getElementById(
                'chat_field'
            );


        if (!realInput) {

            return;

        }


        if (
            realInput.dataset
                .qpFullSyncBound ===
                '1'
        ) {

            return;

        }


        realInput.dataset
            .qpFullSyncBound =
            '1';


        realInput.addEventListener(

            'input',

            function () {

                if (
                    enabled &&
                    mode ===
                        'input' &&
                    document.activeElement !==
                        fakeInput
                ) {

                    syncRealToFake();

                }

            }

        );

    }


    // =========================================================
    // ESC
    // =========================================================

    document.addEventListener(

        'keydown',

        function (
            event
        ) {

            if (
                enabled &&
                event.key ===
                    'Escape'
            ) {

                disableFullscreen();

            }

        }

    );


    // =========================================================
    // 初期化
    // =========================================================

    bindRealInput();

    setupLoadingObserver();

    setupQuickPasteObserver();

    setupUserScrollReset();


    // =========================================================
    // 常駐チェック
    //
    // AIのべりすと側でDOMが差し替わった時の保険
    // =========================================================

    setInterval(

        function () {

            bindRealInput();


            /*
             * data_containerが差し替わったら
             * タッチ監視も張り直す
             */
            const currentContainer =
                document.getElementById(
                    'data_container'
                );


            if (
                currentContainer !==
                    observedScrollContainer
            ) {

                observedScrollContainer =
                    null;


                setupUserScrollReset();

            }


            /*
             * loading_animが差し替わったら
             * Observerも張り直す
             */
            const currentLoading =
                document.getElementById(
                    'loading_anim'
                );


            if (
                currentLoading !==
                    observedLoadingElement
            ) {

                observedLoadingElement =
                    null;


                setupLoadingObserver();

            }


            /*
             * 生成状態も念のため再確認
             */
            updateGeneratingState();

        },

        1000

    );

})();