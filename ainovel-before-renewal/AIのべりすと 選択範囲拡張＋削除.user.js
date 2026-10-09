// ==UserScript==
// @name         AIのべりすと 選択範囲拡張＋削除
// @namespace    ainovel-selection-expand
// @version      2.0
// @description  AIのべりすとの本文で選択範囲を上下に拡張し、選択文章を削除できます
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';


    // ==================================================
    // 設定
    // ==================================================

    const PANEL_ID =
        'ainovel-selection-expand-panel';

    const DATA_CONTAINER_ID =
        'data_container';


    // ==================================================
    // 状態
    // ==================================================

    let savedRange = null;

    let operating = false;

    let selectionTimer = null;


    // ==================================================
    // CSS
    // ==================================================

    const style =
        document.createElement('style');

    style.textContent = `

        #${PANEL_ID} {

            position: fixed;

            right: 12px;
            bottom: 155px;

            z-index: 2147483647;

            display: none;

            flex-wrap: wrap;

            width: 230px;

            gap: 5px;

            padding: 6px;

            box-sizing: border-box;

            border:
                1px solid
                rgba(100,100,100,0.75);

            border-radius: 10px;

            background:
                rgba(245,245,245,0.97);

            box-shadow:
                0 2px 12px
                rgba(0,0,0,0.30);

            user-select: none;
            -webkit-user-select: none;

            -webkit-touch-callout: none;

        }


        #${PANEL_ID}.visible {

            display: flex;

        }


        .ainovel-selection-action {

            flex: 1 1 auto;

            min-width: 40px;
            height: 40px;

            padding:
                0
                8px;

            display: flex;

            align-items: center;
            justify-content: center;

            box-sizing: border-box;

            border:
                1px solid
                rgba(100,100,100,0.8);

            border-radius: 7px;

            background:
                rgba(255,255,255,0.98);

            color: #222;

            font-size: 14px;
            font-weight: bold;

            cursor: pointer;

            user-select: none;
            -webkit-user-select: none;

            -webkit-touch-callout: none;

            touch-action: none;

        }


        .ainovel-selection-action.pressed {

            transform: scale(0.95);

            background:
                rgba(225,225,225,0.98);

        }


        .ainovel-selection-delete {

            color: #c62828;

            border-color:
                rgba(190,50,50,0.70);

            background:
                rgba(255,240,240,0.98);

        }


        .ainovel-selection-delete.pressed {

            background:
                rgba(255,215,215,0.98);

        }

    `;

    document.head.appendChild(style);


    // ==================================================
    // パネル作成
    // ==================================================

    const panel =
        document.createElement('div');

    panel.id =
        PANEL_ID;

    document.body.appendChild(panel);


    // ==================================================
    // ボタン作成
    // ==================================================

    function createActionButton(
        text,
        className
    ) {

        const button =
            document.createElement('div');

        button.className =
            'ainovel-selection-action' +
            (
                className
                    ? ' ' + className
                    : ''
            );

        button.textContent =
            text;

        button.setAttribute(
            'role',
            'button'
        );

        panel.appendChild(
            button
        );


        return button;

    }


    const up1Button =
        createActionButton(
            '↑1'
        );


    const up5Button =
        createActionButton(
            '↑5'
        );


    const down1Button =
        createActionButton(
            '↓1'
        );


    const downAllButton =
        createActionButton(
            '↓全部'
        );


    const deleteButton =
        createActionButton(
            'DELETE',
            'ainovel-selection-delete'
        );


    // ==================================================
    // 本文取得
    // ==================================================

    function getContainer() {

        return document.getElementById(
            DATA_CONTAINER_ID
        );

    }


    // ==================================================
    // 本文内か判定
    // ==================================================

    function isInsideContainer(node) {

        const container =
            getContainer();


        if (
            !container ||
            !node
        ) {

            return false;

        }


        let target =
            node;


        if (
            target.nodeType ===
            Node.TEXT_NODE
        ) {

            target =
                target.parentNode;

        }


        if (!target) {

            return false;

        }


        return (
            target === container ||
            container.contains(target)
        );

    }


    // ==================================================
    // パネル表示
    // ==================================================

    function showPanel() {

        panel.classList.add(
            'visible'
        );

    }


    function hidePanel() {

        panel.classList.remove(
            'visible'
        );

    }


    // ==================================================
    // 選択範囲保存
    // ==================================================

    function captureSelection() {

        if (operating) {

            return false;

        }


        const selection =
            document.getSelection();


        if (
            !selection ||
            selection.rangeCount === 0 ||
            selection.isCollapsed
        ) {

            return false;

        }


        const range =
            selection.getRangeAt(0);


        if (
            !isInsideContainer(
                range.startContainer
            ) ||
            !isInsideContainer(
                range.endContainer
            )
        ) {

            return false;

        }


        savedRange =
            range.cloneRange();


        showPanel();


        return true;

    }


    // ==================================================
    // 保存した選択を復元
    // ==================================================

    function restoreSelection() {

        if (!savedRange) {

            return false;

        }


        if (
            !savedRange.startContainer ||
            !savedRange.endContainer ||
            !savedRange.startContainer.isConnected ||
            !savedRange.endContainer.isConnected
        ) {

            savedRange = null;

            hidePanel();

            return false;

        }


        const selection =
            document.getSelection();


        if (!selection) {

            return false;

        }


        try {

            selection.removeAllRanges();

            selection.addRange(
                savedRange.cloneRange()
            );


            return true;

        } catch (error) {

            console.warn(
                '[Selection Expand] restore error:',
                error
            );


            return false;

        }

    }


    // ==================================================
    // 子ノード位置
    // ==================================================

    function getNodeIndex(node) {

        if (
            !node ||
            !node.parentNode
        ) {

            return -1;

        }


        return Array.prototype.indexOf.call(
            node.parentNode.childNodes,
            node
        );

    }


    // ==================================================
    // ノード直後の位置
    // ==================================================

    function getPositionAfterNode(node) {

        if (
            !node ||
            !node.parentNode
        ) {

            return null;

        }


        const index =
            getNodeIndex(
                node
            );


        if (index < 0) {

            return null;

        }


        return {

            container:
                node.parentNode,

            offset:
                index + 1

        };

    }


    // ==================================================
    // ノード直前の位置
    // ==================================================

    function getPositionBeforeNode(node) {

        if (
            !node ||
            !node.parentNode
        ) {

            return null;

        }


        const index =
            getNodeIndex(
                node
            );


        if (index < 0) {

            return null;

        }


        return {

            container:
                node.parentNode,

            offset:
                index

        };

    }


    // ==================================================
    // 比較用Range
    // ==================================================

    function makeCollapsedRange(
        container,
        offset
    ) {

        try {

            const range =
                document.createRange();


            range.setStart(
                container,
                offset
            );


            range.collapse(
                true
            );


            return range;

        } catch (error) {

            return null;

        }

    }


    // ==================================================
    // A <= B
    // ==================================================

    function isBeforeOrEqual(
        position,
        targetContainer,
        targetOffset
    ) {

        const a =
            makeCollapsedRange(
                position.container,
                position.offset
            );


        const b =
            makeCollapsedRange(
                targetContainer,
                targetOffset
            );


        if (
            !a ||
            !b
        ) {

            return false;

        }


        try {

            return (
                a.compareBoundaryPoints(
                    Range.START_TO_START,
                    b
                ) <= 0
            );

        } catch (error) {

            return false;

        }

    }


    // ==================================================
    // 行頭一覧
    // ==================================================

    function getLineStarts(
        container
    ) {

        const positions = [];


        // 本文の最初
        positions.push({

            container:
                container,

            offset:
                0

        });


        const brList =
            container.querySelectorAll(
                'br'
            );


        for (
            const br of brList
        ) {

            const position =
                getPositionAfterNode(
                    br
                );


            if (position) {

                positions.push(
                    position
                );

            }

        }


        return positions;

    }


    // ==================================================
    // 行末一覧
    //
    // 各BRの直前
    // 最終行は本文末尾
    // ==================================================

    function getLineEnds(
        container
    ) {

        const positions = [];


        const brList =
            container.querySelectorAll(
                'br'
            );


        for (
            const br of brList
        ) {

            const position =
                getPositionBeforeNode(
                    br
                );


            if (position) {

                positions.push(
                    position
                );

            }

        }


        positions.push({

            container:
                container,

            offset:
                container.childNodes.length

        });


        return positions;

    }


    // ==================================================
    // 現在の開始行
    // ==================================================

    function findStartLineIndex(
        positions,
        startContainer,
        startOffset
    ) {

        let index = 0;


        for (
            let i = 0;
            i < positions.length;
            i++
        ) {

            if (
                isBeforeOrEqual(
                    positions[i],
                    startContainer,
                    startOffset
                )
            ) {

                index = i;

            } else {

                break;

            }

        }


        return index;

    }


    // ==================================================
    // 現在の終了行
    // ==================================================

    function findEndLineIndex(
        lineStarts,
        endContainer,
        endOffset
    ) {

        let index = 0;


        for (
            let i = 0;
            i < lineStarts.length;
            i++
        ) {

            if (
                isBeforeOrEqual(
                    lineStarts[i],
                    endContainer,
                    endOffset
                )
            ) {

                index = i;

            } else {

                break;

            }

        }


        return index;

    }


    // ==================================================
    // 上へ指定行数拡張
    // ==================================================

    function expandUp(
        count
    ) {

        if (!savedRange) {

            return;

        }


        const container =
            getContainer();


        if (!container) {

            return;

        }


        const positions =
            getLineStarts(
                container
            );


        if (
            positions.length === 0
        ) {

            return;

        }


        const currentLine =
            findStartLineIndex(
                positions,
                savedRange.startContainer,
                savedRange.startOffset
            );


        let targetLine =
            currentLine - count;


        if (
            targetLine < 0
        ) {

            targetLine = 0;

        }


        const target =
            positions[
                targetLine
            ];


        const newRange =
            savedRange.cloneRange();


        try {

            newRange.setStart(
                target.container,
                target.offset
            );


            savedRange =
                newRange.cloneRange();


            restoreSelection();


        } catch (error) {

            console.warn(
                '[Selection Expand] expandUp error:',
                error
            );

        }

    }


    // ==================================================
    // 下へ1行拡張
    // ==================================================

    function expandDownOne() {

        if (!savedRange) {

            return;

        }


        const container =
            getContainer();


        if (!container) {

            return;

        }


        const lineStarts =
            getLineStarts(
                container
            );


        const lineEnds =
            getLineEnds(
                container
            );


        if (
            lineStarts.length === 0 ||
            lineEnds.length === 0
        ) {

            return;

        }


        const currentLine =
            findEndLineIndex(
                lineStarts,
                savedRange.endContainer,
                savedRange.endOffset
            );


        let targetLine =
            currentLine + 1;


        if (
            targetLine >=
            lineEnds.length
        ) {

            targetLine =
                lineEnds.length - 1;

        }


        const target =
            lineEnds[
                targetLine
            ];


        const newRange =
            savedRange.cloneRange();


        try {

            newRange.setEnd(
                target.container,
                target.offset
            );


            savedRange =
                newRange.cloneRange();


            restoreSelection();


        } catch (error) {

            console.warn(
                '[Selection Expand] expandDown error:',
                error
            );

        }

    }


    // ==================================================
    // ここから本文末尾まで選択
    // ==================================================

    function expandDownAll() {

        if (!savedRange) {

            return;

        }


        const container =
            getContainer();


        if (!container) {

            return;

        }


        const newRange =
            savedRange.cloneRange();


        try {

            /*
             * 選択開始位置はそのまま。
             * 終了位置だけ本文の最後へ。
             */

            newRange.setEnd(
                container,
                container.childNodes.length
            );


            savedRange =
                newRange.cloneRange();


            restoreSelection();


        } catch (error) {

            console.warn(
                '[Selection Expand] downAll error:',
                error
            );

        }

    }


    // ==================================================
    // 入力変更をAIのべりすと側へ通知
    // ==================================================

    function notifyTextChanged(
        container
    ) {

        try {

            container.dispatchEvent(
                new InputEvent(
                    'input',
                    {
                        bubbles: true,
                        inputType:
                            'deleteContentBackward',
                        data: null
                    }
                )
            );

        } catch (error) {

            container.dispatchEvent(
                new Event(
                    'input',
                    {
                        bubbles: true
                    }
                )
            );

        }


        try {

            container.dispatchEvent(
                new Event(
                    'change',
                    {
                        bubbles: true
                    }
                )
            );

        } catch (error) {
            // 無視
        }

    }


    // ==================================================
    // DELETE
    // ==================================================

    function deleteSelection() {

        if (!savedRange) {

            return;

        }


        const container =
            getContainer();


        if (!container) {

            return;

        }


        /*
         * まず保存してある選択を復元
         */

        restoreSelection();


        const selection =
            document.getSelection();


        if (
            !selection ||
            selection.rangeCount === 0
        ) {

            return;

        }


        let deletionSucceeded =
            false;


        /*
         * contenteditableでは
         * execCommand('delete') のほうが
         * サイト側の編集処理に伝わりやすい場合がある
         */

        try {

            deletionSucceeded =
                document.execCommand(
                    'delete',
                    false,
                    null
                );

        } catch (error) {

            deletionSucceeded =
                false;

        }


        /*
         * execCommandが使えなかった場合
         */

        if (!deletionSucceeded) {

            try {

                const range =
                    selection.getRangeAt(0);


                range.deleteContents();


                range.collapse(
                    true
                );


                selection.removeAllRanges();

                selection.addRange(
                    range
                );


                deletionSucceeded =
                    true;


            } catch (error) {

                console.warn(
                    '[Selection Expand] delete error:',
                    error
                );

            }

        }


        if (
            deletionSucceeded
        ) {

            notifyTextChanged(
                container
            );

        }


        /*
         * 削除後は古いRangeを捨てる
         */

        savedRange = null;

        hidePanel();

    }


    // ==================================================
    // ボタン共通処理
    // ==================================================

    function setupButton(
        button,
        action
    ) {

        let actionExecuted =
            false;


        function begin(
            event
        ) {

            if (event) {

                event.preventDefault();

                event.stopPropagation();

            }


            operating =
                true;


            actionExecuted =
                false;


            button.classList.add(
                'pressed'
            );


            /*
             * Android Firefoxで
             * ボタン操作時に選択が消えても復元
             */

            restoreSelection();

        }


        function execute(
            event
        ) {

            if (event) {

                event.preventDefault();

                event.stopPropagation();

            }


            if (
                actionExecuted
            ) {

                return;

            }


            actionExecuted =
                true;


            button.classList.remove(
                'pressed'
            );


            /*
             * 保存Rangeを使って処理
             */

            action();


            /*
             * DELETE以外なら選択状態を維持
             */

            if (
                action !==
                deleteSelection
            ) {

                setTimeout(
                    function () {

                        restoreSelection();

                    },
                    0
                );


                setTimeout(
                    function () {

                        restoreSelection();

                    },
                    80
                );

            }


            setTimeout(
                function () {

                    operating =
                        false;

                },
                120
            );

        }


        function cancel(
            event
        ) {

            if (event) {

                event.preventDefault();

                event.stopPropagation();

            }


            button.classList.remove(
                'pressed'
            );


            restoreSelection();


            setTimeout(
                function () {

                    operating =
                        false;

                },
                100
            );

        }


        // ----------------------------------------------
        // Pointer
        // ----------------------------------------------

        button.addEventListener(
            'pointerdown',
            begin,
            {
                passive: false
            }
        );


        button.addEventListener(
            'pointerup',
            execute,
            {
                passive: false
            }
        );


        button.addEventListener(
            'pointercancel',
            cancel,
            {
                passive: false
            }
        );


        // ----------------------------------------------
        // Android Firefox補助
        // ----------------------------------------------

        button.addEventListener(
            'touchstart',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

            },
            {
                passive: false
            }
        );


        button.addEventListener(
            'touchend',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

            },
            {
                passive: false
            }
        );


        // ----------------------------------------------
        // Mouse補助
        // ----------------------------------------------

        button.addEventListener(
            'mousedown',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

            }
        );


        button.addEventListener(
            'mouseup',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

            }
        );


        // ----------------------------------------------
        // click無効化
        // ----------------------------------------------

        button.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                if (
                    action !==
                    deleteSelection
                ) {

                    restoreSelection();

                }

            }
        );

    }


    // ==================================================
    // 各ボタン
    // ==================================================

    setupButton(
        up1Button,
        function () {

            expandUp(
                1
            );

        }
    );


    setupButton(
        up5Button,
        function () {

            expandUp(
                5
            );

        }
    );


    setupButton(
        down1Button,
        function () {

            expandDownOne();

        }
    );


    setupButton(
        downAllButton,
        function () {

            expandDownAll();

        }
    );


    setupButton(
        deleteButton,
        deleteSelection
    );


    // ==================================================
    // selectionchange
    // ==================================================

    document.addEventListener(
        'selectionchange',
        function () {

            /*
             * ボタン操作中は
             * Androidが一瞬選択を解除しても
             * savedRangeを捨てない
             */

            if (operating) {

                return;

            }


            if (
                selectionTimer
            ) {

                clearTimeout(
                    selectionTimer
                );

            }


            selectionTimer =
                setTimeout(
                    function () {

                        selectionTimer =
                            null;


                        const selection =
                            document.getSelection();


                        if (
                            !selection ||
                            selection.rangeCount === 0 ||
                            selection.isCollapsed
                        ) {

                            /*
                             * Androidでは選択ハンドル操作中に
                             * 一瞬collapsedになる場合があるため、
                             * savedRangeは即消さない。
                             */

                            return;

                        }


                        captureSelection();

                    },
                    100
                );

        }
    );


    // ==================================================
    // 本文側で選択終了
    // ==================================================

    document.addEventListener(
        'pointerup',
        function (event) {

            if (
                panel.contains(
                    event.target
                )
            ) {

                return;

            }


            if (operating) {

                return;

            }


            setTimeout(
                function () {

                    captureSelection();

                },
                150
            );

        }
    );


    // ==================================================
    // パネル操作では選択を解除させない
    // ==================================================

    panel.addEventListener(
        'pointerdown',
        function (event) {

            event.stopPropagation();

        }
    );


    // ==================================================
    // 本文DOM再生成対策
    // ==================================================

    const observer =
        new MutationObserver(
            function () {

                if (!savedRange) {

                    return;

                }


                if (
                    !savedRange.startContainer.isConnected ||
                    !savedRange.endContainer.isConnected
                ) {

                    savedRange =
                        null;

                    hidePanel();

                }

            }
        );


    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );


    console.log(
        '[AIのべりすと 選択範囲拡張＋削除] v2.0 loaded'
    );

})();