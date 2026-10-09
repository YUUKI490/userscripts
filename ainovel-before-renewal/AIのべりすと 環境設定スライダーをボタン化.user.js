// ==UserScript==
// @name         AIのべりすと 環境設定スライダーをボタン化
// @namespace    ainovel-visual-buttons
// @version      1.0
// @description  本文サイズ・字間・行間のスライダーをボタン操作に変更
// @match        https://ai-novel.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --------------------------------------------------
    // 設定
    // --------------------------------------------------

    const SETTINGS = [
        {
            id: 'vis_fontsize',
            step: 1,
            label: '本文の大きさ'
        },
        {
            id: 'vis_fontkerning',
            step: 1,
            label: '字間の広さ'
        },
        {
            id: 'vis_fontleading',
            step: 1,
            label: '行間の広さ'
        }
    ];


    // --------------------------------------------------
    // CSS
    // --------------------------------------------------

    const style = document.createElement('style');

    style.textContent = `
        .qp-visual-button-area {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            margin: 4px 0 10px 0;
        }

        .qp-visual-btn {
            min-width: 52px;
            height: 38px;

            border: 1px solid #888;
            border-radius: 7px;

            background: rgba(255,255,255,0.12);
            color: inherit;

            font-size: 21px;
            font-weight: bold;

            cursor: pointer;

            display: flex;
            align-items: center;
            justify-content: center;

            user-select: none;
        }

        .qp-visual-btn:hover {
            background: rgba(128,128,128,0.25);
        }

        .qp-visual-btn:active {
            transform: translateY(1px);
        }

        .qp-visual-value {
            flex: 1;

            min-width: 70px;
            height: 38px;

            border: 1px solid #888;
            border-radius: 7px;

            display: flex;
            align-items: center;
            justify-content: center;

            font-size: 18px;
            font-weight: bold;

            background: rgba(128,128,128,0.10);

            user-select: none;
        }

        /*
         * 元のスライダーだけ非表示
         */
        input.qp-slider-hidden {
            display: none !important;
        }
    `;

    document.head.appendChild(style);


    // --------------------------------------------------
    // 元サイトに変更を伝える
    // --------------------------------------------------

    function notifyChange(slider) {

        /*
         * inputイベント
         */
        slider.dispatchEvent(
            new Event('input', {
                bubbles: true
            })
        );

        /*
         * changeイベント
         */
        slider.dispatchEvent(
            new Event('change', {
                bubbles: true
            })
        );

        /*
         * AIのべりすと側のVisualChangeが存在すれば実行
         */
        if (typeof window.VisualChange === 'function') {

            try {
                window.VisualChange();
            } catch (e) {
                console.warn(
                    '[Visual Buttons] VisualChange error:',
                    e
                );
            }
        }
    }


    // --------------------------------------------------
    // 表示値を取得
    // --------------------------------------------------

    function getDisplayValue(id, rawValue) {

        const value = Number(rawValue);

        /*
         * 本文サイズ
         *
         * 47 = 1.175
         * なので、おそらく /40
         */
        if (id === 'vis_fontsize') {

            return (value / 40)
                .toFixed(3)
                .replace(/0+$/, '')
                .replace(/\.$/, '');
        }


        /*
         * 行間
         *
         * 19 = 1.9
         */
        if (id === 'vis_fontleading') {

            return (value / 10)
                .toFixed(1);
        }


        /*
         * 字間
         */
        if (id === 'vis_fontkerning') {

            return String(value);
        }


        return String(value);
    }


    // --------------------------------------------------
    // 1個のスライダーをボタン化
    // --------------------------------------------------

    function convertSlider(setting) {

        const slider =
            document.getElementById(setting.id);

        if (!slider) {
            return false;
        }


        /*
         * 二重生成防止
         */
        if (
            slider.dataset.qpButtonConverted === '1'
        ) {
            return true;
        }

        slider.dataset.qpButtonConverted = '1';


        const row =
            slider.closest('.option-row');

        if (!row) {
            return false;
        }


        // ----------------------------------------------
        // 元の数値表示も隠す
        // ----------------------------------------------

        const originalDisp =
            document.getElementById(
                setting.id + '_disp'
            );

        if (originalDisp) {
            originalDisp.style.display = 'none';
        }


        // ----------------------------------------------
        // 元スライダー非表示
        // ----------------------------------------------

        slider.classList.add(
            'qp-slider-hidden'
        );


        // ----------------------------------------------
        // 新UI
        // ----------------------------------------------

        const area =
            document.createElement('div');

        area.className =
            'qp-visual-button-area';


        const minus =
            document.createElement('button');

        minus.type = 'button';
        minus.className =
            'qp-visual-btn';

        minus.textContent = '－';


        const valueDisplay =
            document.createElement('div');

        valueDisplay.className =
            'qp-visual-value';


        const plus =
            document.createElement('button');

        plus.type = 'button';
        plus.className =
            'qp-visual-btn';

        plus.textContent = '＋';


        area.appendChild(minus);
        area.appendChild(valueDisplay);
        area.appendChild(plus);

        row.appendChild(area);


        // ----------------------------------------------
        // 表示更新
        // ----------------------------------------------

        function updateDisplay() {

            valueDisplay.textContent =
                getDisplayValue(
                    setting.id,
                    slider.value
                );
        }


        // ----------------------------------------------
        // 値変更
        // ----------------------------------------------

        function changeValue(direction) {

            const current =
                Number(slider.value);

            const min =
                Number(slider.min);

            const max =
                Number(slider.max);

            let next =
                current +
                (
                    setting.step *
                    direction
                );


            if (next < min) {
                next = min;
            }

            if (next > max) {
                next = max;
            }


            slider.value = next;


            notifyChange(slider);

            updateDisplay();
        }


        minus.addEventListener(
            'click',
            function () {
                changeValue(-1);
            }
        );


        plus.addEventListener(
            'click',
            function () {
                changeValue(1);
            }
        );


        /*
         * サイト側から値が変更された場合にも同期
         */
        slider.addEventListener(
            'input',
            updateDisplay
        );

        slider.addEventListener(
            'change',
            updateDisplay
        );


        updateDisplay();

        return true;
    }


    // --------------------------------------------------
    // 全部変換
    // --------------------------------------------------

    function setup() {

        let complete = true;

        for (
            const setting of SETTINGS
        ) {

            if (
                !convertSlider(setting)
            ) {
                complete = false;
            }
        }


        return complete;
    }


    // --------------------------------------------------
    // ページ読み込み待ち
    // --------------------------------------------------

    let retryCount = 0;

    const timer =
        setInterval(function () {

            retryCount++;


            if (setup()) {

                clearInterval(timer);

                console.log(
                    '[Visual Buttons] setup complete'
                );

                return;
            }


            /*
             * 最大30秒
             */
            if (retryCount >= 60) {

                clearInterval(timer);

                console.warn(
                    '[Visual Buttons] sliders not found'
                );
            }

        }, 500);


})();
