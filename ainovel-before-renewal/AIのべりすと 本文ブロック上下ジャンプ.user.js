

// ==UserScript==
// @name         AIのべりすと 本文ブロック上下ジャンプ
// @namespace    ainovel-block-jump
// @version      1.1.0
// @description  右上の上下ボタンで本文の前後ブロック先頭へジャンプします
// @match        https://ai-novel.com/*
// @match        https://*.ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // 設定
    // =========================================================

    const UP_BUTTON_ID =
        'ainovel-block-jump-up';

    const DOWN_BUTTON_ID =
        'ainovel-block-jump-down';

    const BUTTON_SIZE =
        46;

    const RIGHT =
        10;

    const TOP =
        10;

    const GAP =
        6;

    /*
     * 三角形サイズ
     *
     * 横幅 = 12 × 2 = 24px
     * 高さ = 16px
     */
    const TRIANGLE_HALF_WIDTH =
        12;

    const TRIANGLE_HEIGHT =
        16;


    // =========================================================
    // CSS
    // =========================================================

    const style =
        document.createElement(
            'style'
        );

    style.textContent = `

        /* =====================================================
           共通ボタン
           ===================================================== */

        #${UP_BUTTON_ID},
        #${DOWN_BUTTON_ID} {

            position:
                fixed !important;

            right:
                ${RIGHT}px !important;

            z-index:
                2147483647 !important;

            width:
                ${BUTTON_SIZE}px !important;

            height:
                ${BUTTON_SIZE}px !important;

            padding:
                0 !important;

            display:
                flex !important;

            align-items:
                center !important;

            justify-content:
                center !important;

            box-sizing:
                border-box !important;

            border:
                1px solid #777 !important;

            border-radius:
                9px !important;

            background:
                rgba(255,255,255,.96) !important;

            color:
                #222 !important;

            box-shadow:
                0 2px 10px
                rgba(0,0,0,.28) !important;

            cursor:
                pointer !important;

            user-select:
                none !important;

            -webkit-user-select:
                none !important;

            touch-action:
                manipulation !important;
        }


        /* =====================================================
           上ボタン位置
           ===================================================== */

        #${UP_BUTTON_ID} {

            top:
                ${TOP}px !important;

        }


        /* =====================================================
           下ボタン位置
           ===================================================== */

        #${DOWN_BUTTON_ID} {

            top:
                ${
                    TOP +
                    BUTTON_SIZE +
                    GAP
                }px !important;

        }


        /* =====================================================
           文字ではなくCSSで三角形を作る
           ===================================================== */

        #${UP_BUTTON_ID}::before,
        #${DOWN_BUTTON_ID}::before {

            content:
                "" !important;

            display:
                block !important;

            width:
                0 !important;

            height:
                0 !important;

            box-sizing:
                border-box !important;
        }


        /* =====================================================
           上向き三角
           ===================================================== */

        #${UP_BUTTON_ID}::before {

            border-left:
                ${TRIANGLE_HALF_WIDTH}px
                solid
                transparent !important;

            border-right:
                ${TRIANGLE_HALF_WIDTH}px
                solid
                transparent !important;

            border-bottom:
                ${TRIANGLE_HEIGHT}px
                solid
                #222 !important;

        }


        /* =====================================================
           下向き三角
           ===================================================== */

        #${DOWN_BUTTON_ID}::before {

            border-left:
                ${TRIANGLE_HALF_WIDTH}px
                solid
                transparent !important;

            border-right:
                ${TRIANGLE_HALF_WIDTH}px
                solid
                transparent !important;

            border-top:
                ${TRIANGLE_HEIGHT}px
                solid
                #222 !important;

        }


        /* =====================================================
           押した時
           ===================================================== */

        #${UP_BUTTON_ID}:active,
        #${DOWN_BUTTON_ID}:active {

            transform:
                scale(.94) !important;

            background:
                #e8e8e8 !important;

        }

    `;

    document.head.appendChild(
        style
    );


    // =========================================================
    // 本文コンテナ取得
    // =========================================================

    function getContainer() {

        return document.getElementById(
            'data_container'
        );

    }


    // =========================================================
    // 本文ブロック一覧
    // =========================================================

    function getBlocks() {

        const container =
            getContainer();


        if (!container) {

            return [];

        }


        /*
         * まず data_container 直下の
         * data_block を優先
         */
        let blocks =
            Array.from(
                container.querySelectorAll(
                    ':scope > .data_block'
                )
            );


        /*
         * AIのべりすとのDOM構造によって
         * 直下で取れない場合
         */
        if (!blocks.length) {

            blocks =
                Array.from(
                    container.querySelectorAll(
                        '.data_block'
                    )
                );

        }


        /*
         * data_blockが無い場合は
         * data_editを使用
         */
        if (!blocks.length) {

            blocks =
                Array.from(
                    container.querySelectorAll(
                        '.data_edit'
                    )
                );

        }


        /*
         * 非表示・空ブロックを除外
         */
        blocks =
            blocks.filter(

                function (
                    block
                ) {

                    if (
                        !block ||
                        !block.isConnected
                    ) {

                        return false;

                    }


                    const css =
                        window.getComputedStyle(
                            block
                        );


                    if (
                        css.display ===
                            'none' ||
                        css.visibility ===
                            'hidden'
                    ) {

                        return false;

                    }


                    const text =
                        (
                            block.innerText ||
                            block.textContent ||
                            ''
                        ).trim();


                    return !!text;

                }

            );


        return blocks;

    }


    // =========================================================
    // スクロール領域上端
    // =========================================================

    function getViewportTop() {

        const container =
            getContainer();


        if (!container) {

            return 0;

        }


        const css =
            window.getComputedStyle(
                container
            );


        const overflowY =
            css.overflowY;


        const containerScrollable =
            (
                overflowY ===
                    'auto' ||
                overflowY ===
                    'scroll'
            ) &&
            container.scrollHeight >
                container.clientHeight;


        /*
         * 全画面版では
         * data_container自体がスクロール領域
         */
        if (
            containerScrollable
        ) {

            return container
                .getBoundingClientRect()
                .top;

        }


        /*
         * 通常ページ
         */
        return 0;

    }


    // =========================================================
    // ブロック上端
    // =========================================================

    function blockTop(
        block
    ) {

        return block
            .getBoundingClientRect()
            .top;

    }


    // =========================================================
    // 前のブロック取得
    // =========================================================

    function findPreviousBlock() {

        const blocks =
            getBlocks();


        if (!blocks.length) {

            return null;

        }


        const viewportTop =
            getViewportTop();


        /*
         * 多少の誤差を吸収
         */
        const threshold =
            viewportTop +
            12;


        let candidate =
            null;


        for (
            const block
            of blocks
        ) {

            const top =
                blockTop(
                    block
                );


            /*
             * 現在の画面上端より上にある
             * 一番近いブロックを保存
             */
            if (
                top <
                viewportTop -
                12
            ) {

                candidate =
                    block;

                continue;

            }


            /*
             * これ以降は下側なので終了
             */
            if (
                top >=
                threshold
            ) {

                break;

            }

        }


        return candidate;

    }


    // =========================================================
    // 次のブロック取得
    // =========================================================

    function findNextBlock() {

        const blocks =
            getBlocks();


        if (!blocks.length) {

            return null;

        }


        const viewportTop =
            getViewportTop();


        const threshold =
            viewportTop +
            12;


        /*
         * 現在の画面上端より下にある
         * 最初のブロックを取得
         */
        for (
            const block
            of blocks
        ) {

            const top =
                blockTop(
                    block
                );


            if (
                top >
                threshold
            ) {

                return block;

            }

        }


        return null;

    }


    // =========================================================
    // ブロックへ移動
    // =========================================================

    function jumpToBlock(
        block
    ) {

        if (
            !block ||
            !block.isConnected
        ) {

            return;

        }


        block.scrollIntoView(
            {
                behavior:
                    'smooth',

                block:
                    'start',

                inline:
                    'nearest'
            }
        );

    }


    // =========================================================
    // 上へ
    // =========================================================

    function jumpUp() {

        const block =
            findPreviousBlock();


        if (
            block
        ) {

            jumpToBlock(
                block
            );

            return;

        }


        /*
         * 前が無ければ最初のブロックへ
         */
        const blocks =
            getBlocks();


        if (
            blocks.length
        ) {

            jumpToBlock(
                blocks[0]
            );

        }

    }


    // =========================================================
    // 下へ
    // =========================================================

    function jumpDown() {

        const block =
            findNextBlock();


        if (!block) {

            return;

        }


        jumpToBlock(
            block
        );

    }


    // =========================================================
    // ボタン作成
    // =========================================================

    function createButton(
        id,
        title,
        handler
    ) {

        const button =
            document.createElement(
                'button'
            );


        button.id =
            id;


        button.type =
            'button';


        /*
         * 文字の▲▼は使わない
         */
        button.textContent =
            '';


        button.title =
            title;


        button.setAttribute(
            'aria-label',
            title
        );


        button.addEventListener(

            'click',

            function (
                event
            ) {

                event.preventDefault();

                event.stopPropagation();


                handler();

            }

        );


        document.body.appendChild(
            button
        );

    }


    // =========================================================
    // ボタン設置
    // =========================================================

    function installButtons() {

        if (
            !document.body
        ) {

            return;

        }


        if (
            !document.getElementById(
                UP_BUTTON_ID
            )
        ) {

            createButton(

                UP_BUTTON_ID,

                'ひとつ前の本文ブロックへ',

                jumpUp

            );

        }


        if (
            !document.getElementById(
                DOWN_BUTTON_ID
            )
        ) {

            createButton(

                DOWN_BUTTON_ID,

                'ひとつ次の本文ブロックへ',

                jumpDown

            );

        }

    }


    // =========================================================
    // 起動
    // =========================================================

    installButtons();


    /*
     * AIのべりすと側のDOM再生成で
     * ボタンが消えても復活
     */
    const observer =
        new MutationObserver(

            function () {

                installButtons();

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

})();