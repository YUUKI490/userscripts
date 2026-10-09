// ==UserScript==
// @name         AIのべりすと 生成完了→Grok送信ボタン
// @namespace    local.ainovel.gendone
// @version      2.1.0
// @description  本文生成が終わったら生成した本文の頭へ移動し、画面下のボタンから指示入力画面を開けます（全画面＋QuickPasteスクリプト対応）
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

    const CONFIG = {


        /*
         * 色分けスクリプトが生成中に body へ付けるクラス
         */
        generatingClass: 'qp-generating',

        /*
         * 生成状態を見に行く間隔(ms)
         */
        pollInterval: 400,

        /*
         * 確認ボタンを自動で消すまでの時間(ms)。
         * 0にすると消えません。
         */
        autoHide: 0,

        /*
         * 生成完了時に短く振動させる
         */
        vibrate: false,

        label: '✍ 指示を書く',

        /*
         * 生成が終わったら、生成した本文の頭へ移動する
         */
        scrollToGenerated: true,

        /*
         * true にすると、本文ではなく
         * その前の指示ブロックの頭へ移動します
         */
        includeInstruction: false,

        /*
         * 移動したとき、上に残す余白(px)
         */
        scrollOffset: 60,

        /*
         * 生成完了から移動するまでの待ち時間(ms)
         */
        scrollDelay: 350
    };


    // =========================================================
    // 状態
    // =========================================================

    let wasGenerating = false;

    let bar = null;

    let hideTimer = null;


    // =========================================================
    // 生成中かどうか
    // =========================================================

    /*
     * 全画面モードでは loading_anim を
     * 参照できないことがあるため、
     * 色分けスクリプトが body に付ける
     * qp-generating クラスも併せて見ます。
     * どちらかが生成中と言えば生成中とみなします。
     */

    function isGeneratingByLoader() {

        const loading =
            document.getElementById('loading_anim');

        if (!loading) {
            return null;
        }

        const css =
            window.getComputedStyle(loading);

        return (
            css.display !== 'none' &&
            css.visibility !== 'hidden' &&
            css.opacity !== '0'
        );
    }


    function isGeneratingByClass() {

        if (!document.body) {
            return null;
        }

        return document.body
            .classList
            .contains(CONFIG.generatingClass);
    }


    function isGenerating() {

        const byLoader = isGeneratingByLoader();
        const byClass = isGeneratingByClass();

        if (byLoader === null && byClass === null) {
            return false;
        }

        return (
            byLoader === true ||
            byClass === true
        );
    }


    // =========================================================
    // UI
    // =========================================================

    function buildBar() {

        const style = document.createElement('style');

        style.textContent = `
            #gendone-bar {
                position: fixed;
                left: 10px;
                right: 10px;
                bottom: 16px;
                /*
                 * 全画面モードの背景レイヤー(body::after)が
                 * 2147483600 なので、それより上に置きます。
                 */
                z-index: 2147483640;

                display: none;
                align-items: center;
                gap: 8px;

                padding: 10px 12px;
                border-radius: 10px;

                background: #1f8a4c;
                color: #fff;

                box-shadow: 0 3px 14px rgba(0,0,0,0.45);

                font-size: 15px;
                font-weight: bold;
            }

            #gendone-bar.show {
                display: flex;
            }

            #gendone-send {
                flex: 1;
                padding: 12px;

                border: none;
                border-radius: 7px;

                background: rgba(255,255,255,0.16);
                color: #fff;

                font-size: 15px;
                font-weight: bold;
            }

            #gendone-send:active {
                background: rgba(255,255,255,0.3);
            }

            #gendone-close {
                width: 42px;
                padding: 12px 0;

                border: none;
                border-radius: 7px;

                background: rgba(0,0,0,0.2);
                color: #fff;

                font-size: 15px;
            }
        `;

        document.head.appendChild(style);


        bar = document.createElement('div');
        bar.id = 'gendone-bar';

        const send = document.createElement('button');
        send.id = 'gendone-send';
        send.type = 'button';
        send.textContent = CONFIG.label;

        const close = document.createElement('button');
        close.id = 'gendone-close';
        close.type = 'button';
        close.textContent = '×';

        bar.appendChild(send);
        bar.appendChild(close);

        document.body.appendChild(bar);


        send.addEventListener('click', function () {
            openInstruction();
        });

        close.addEventListener('click', function () {
            hideBar();
        });
    }


    function showBar() {

        if (!bar) {
            return;
        }

        bar.classList.add('show');

        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }

        if (CONFIG.autoHide > 0) {
            hideTimer = setTimeout(hideBar, CONFIG.autoHide);
        }

        if (CONFIG.vibrate && navigator.vibrate) {
            try {
                navigator.vibrate(40);
            } catch (_) {
            }
        }
    }


    function hideBar() {

        if (!bar) {
            return;
        }

        bar.classList.remove('show');

        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }


    // =========================================================
    // 生成した本文の頭へ移動
    // =========================================================

    let snapshot = null;

    function storyBlocks() {
        const root = document.getElementById('data_container');
        return root
            ? Array.from(root.querySelectorAll('.data_edit'))
            : [];
    }

    function isUserBlock(node) {
        return node.classList.contains('user');
    }

    function takeSnapshot() {
        const nodes = storyBlocks();
        const last = nodes[nodes.length - 1];
        snapshot = {
            count: nodes.length,
            lastLength: last ? String(last.textContent || '').length : 0
        };
    }

    function scrollParentOf(node) {
        let el = node.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
            const css = getComputedStyle(el);
            if (
                /(auto|scroll)/.test(css.overflowY) &&
                el.scrollHeight > el.clientHeight + 1
            ) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    function scrollToRect(node, rect) {
        const parent = scrollParentOf(node);
        if (parent) {
            const base = parent.getBoundingClientRect().top;
            parent.scrollTo({
                top: parent.scrollTop + rect.top - base - CONFIG.scrollOffset,
                behavior: 'auto'
            });
        } else {
            window.scrollTo({
                top: window.scrollY + rect.top - CONFIG.scrollOffset,
                behavior: 'auto'
            });
        }
    }

    /*
     * 同じブロックに書き足された場合は、
     * 書き足しが始まった文字の位置を探します
     */
    function rectAtOffset(node, offset) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let passed = 0;
        let text;
        while ((text = walker.nextNode())) {
            const len = text.data.length;
            if (passed + len > offset) {
                const range = document.createRange();
                const at = Math.max(0, offset - passed);
                range.setStart(text, at);
                range.setEnd(text, Math.min(len, at + 1));
                const rect = range.getBoundingClientRect();
                if (rect && (rect.height || rect.width)) {
                    return rect;
                }
                break;
            }
            passed += len;
        }
        return null;
    }

    function scrollToGenerated() {
        if (!CONFIG.scrollToGenerated || !snapshot || isInputMode()) {
            return;
        }

        const nodes = storyBlocks();
        if (!nodes.length) {
            return;
        }

        const added = nodes.slice(snapshot.count);

        // 新しいブロックができた場合
        if (added.length) {
            const target = CONFIG.includeInstruction
                ? added[0]
                : (added.find(function (n) { return !isUserBlock(n); }) || added[0]);

            scrollToRect(target, target.getBoundingClientRect());
            return;
        }

        // 同じブロックへ書き足された場合
        const last = nodes[nodes.length - 1];
        const length = String(last.textContent || '').length;

        if (length > snapshot.lastLength) {
            const rect = rectAtOffset(last, snapshot.lastLength);
            scrollToRect(last, rect || last.getBoundingClientRect());
        }
    }


    // =========================================================
    // 指示入力画面を開く
    // =========================================================

    function isInputMode() {
        return !!(
            document.body &&
            document.body.classList.contains('qp-full-active') &&
            document.body.classList.contains('qp-input-mode')
        );
    }

    function focusFakeInput() {
        const input = document.getElementById('qp-full-input');
        if (!input) {
            return;
        }
        try {
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        } catch (_) {
        }
    }

    function switchToInput() {
        if (isInputMode()) {
            focusFakeInput();
            return true;
        }

        const sw = document.getElementById('qp-full-switch');
        if (!sw) {
            return false;
        }

        sw.click();
        setTimeout(focusFakeInput, 200);
        return true;
    }

    function openInstruction() {
        hideBar();

        const body = document.body;

        /*
         * 全画面スクリプトが動いている場合
         */
        if (document.getElementById('qp-full-main')) {

            if (!body.classList.contains('qp-full-active')) {
                // まず全画面をONにしてから指示入力へ
                document.getElementById('qp-full-main').click();
                setTimeout(switchToInput, 250);
                return;
            }

            if (switchToInput()) {
                return;
            }
        }

        /*
         * 全画面スクリプトが無いときは本物の入力欄へ
         */
        const real = document.getElementById('chat_field');
        if (real) {
            real.scrollIntoView({ block: 'center' });
            try {
                real.focus();
            } catch (_) {
            }
            return;
        }

        const send = document.getElementById('gendone-send');
        if (send) {
            send.textContent = '指示入力欄が見つかりません';
        }
    }


    // =========================================================
    // 監視
    // =========================================================

    function tick() {

        const now = isGenerating();

        /*
         * 指示入力画面を開いている間は
         * 「続ける」に被らないよう隠します
         */
        if (isInputMode()) {
            hideBar();
        }


        /*
         * 生成開始
         */
        if (now && !wasGenerating) {

            wasGenerating = true;

            takeSnapshot();

            hideBar();

            return;
        }


        /*
         * 生成完了
         */
        if (!now && wasGenerating) {

            wasGenerating = false;

            showBar();

            setTimeout(scrollToGenerated, CONFIG.scrollDelay);
        }
    }


    function start() {

        buildBar();

        setInterval(tick, CONFIG.pollInterval);

        console.log('[GenDone] 監視開始');
    }


    if (document.body) {
        start();
    } else {
        window.addEventListener('DOMContentLoaded', start);
    }

})();
