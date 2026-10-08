// ==UserScript==
// @name         Claude 生成の先頭に戻るボタン
// @namespace    local.claude.jumptohead
// @version      1.1.0
// @description  押すとClaudeの最新の返事の先頭へ戻ります。もう一度押すとひとつ前の返事の先頭へ戻ります。縦書き表示パネルを開いているときは、縦書きの画面の中で返事の先頭（右端）へ戻ります
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

        buttonId: 'cjh-button',

        /*
         * ボタンの絵文字
         */
        icon: '🔝',

        /*
         * ボタンの位置（縦向きのとき）
         * 左下の「Aa」ボタン（下から146px）の上に置いています。
         * 数字を大きくすると上へ、小さくすると下へ動きます。
         */
        left: '12px',
        bottom: '198px',

        /*
         * スマホを横向きにしたときの位置
         * 「Aa」ボタン（下から94px）の上に置いています。
         */
        bottomLandscape: '146px',

        /*
         * true … スマホ・タブレットのときだけ横向きの位置を使う
         */
        landscapeOnlyTouch: true,

        /*
         * 戻ったとき、画面の上からこれだけ(px)すき間をあける
         * （上のタイトルバーに先頭が隠れないように）
         */
        topOffset: 64,

        /*
         * 縦書き表示パネルで戻ったとき、画面の右端からあけるすき間(px)
         * 0 … 縦書きパネルの「目次」で飛んだときと同じ位置
         */
        tategakiOffset: 0,

        /*
         * true … するするスクロール / false … 一瞬で移動
         */
        smooth: true,

        /*
         * true … 横画面で入力欄が隠れるときにこのボタンも隠す
         */
        hideWithInput: true
    };

    /*
     * Claudeの返事の入れ物（Claude側の画面変更で変わる可能性あり）
     */
    const RESPONSE_SELECTORS = [
        '[data-is-streaming]',
        '.font-claude-response',
        '.font-claude-message'
    ];

    /*
     * 「Claude 縦書き表示パネル」の部品
     */
    const TATEGAKI = {
        overlayId: 'claude-tategaki-overlay',
        scrollerId: 'claude-tategaki-scroller',
        emptyClass: 'tg-no-message',
        aiSelector: '.tg-msg.tg-ai'
    };


    // =========================================================
    // 通知
    // =========================================================

    function toast(message) {

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
                background: '#245e43',
                color: '#fff',
                fontSize: '14px',
                textAlign: 'center',
                boxShadow: '0 3px 14px rgba(0,0,0,.3)'
            });

            document.body.appendChild(box);
        }

        box.textContent = message;
        box.hidden = false;

        clearTimeout(toast.timer);

        toast.timer = setTimeout(function () {
            box.hidden = true;
        }, 2200);
    }


    // =========================================================
    // 返事を探す（ふつうの横書きの画面）
    // =========================================================

    /*
     * 見つかった入れ物のうち、いちばん外側だけを使う
     */
    function findResponses() {

        for (const selector of RESPONSE_SELECTORS) {

            const all = Array.from(document.querySelectorAll(selector))
                .filter(function (el) {
                    return el.getClientRects().length > 0;
                });

            if (!all.length) {
                continue;
            }

            return all.filter(function (el) {
                return !all.some(function (other) {
                    return other !== el && other.contains(el);
                });
            });
        }

        return [];
    }


    // =========================================================
    // スクロールしている場所を探す（ふつうの横書きの画面）
    // =========================================================

    function isDocScroller(el) {
        return (
            el === document.scrollingElement ||
            el === document.documentElement ||
            el === document.body
        );
    }


    function findScroller(el) {

        let node = el && el.parentElement;

        while (node && !isDocScroller(node)) {

            const oy = getComputedStyle(node).overflowY;

            if (
                (oy === 'auto' || oy === 'scroll') &&
                node.scrollHeight > node.clientHeight + 1
            ) {
                return node;
            }

            node = node.parentElement;
        }

        return document.scrollingElement || document.documentElement;
    }


    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }


    // =========================================================
    // 「どこまで読んだか」を1本の数直線にそろえる
    // =========================================================
    //
    // ふつうの画面も縦書きの画面も、
    //   current … 今の位置（読み進めるほど大きい）
    //   targets … 各返事の先頭に合わせたときの位置
    //   size    … 画面に見えている幅（縦書きは横幅、ふつうは高さ）
    //   go(pos) … その位置へ動かす
    // にそろえて、同じやり方で「どこへ戻るか」を決めます。
    //
    // 位置は、実際にスクロールできる範囲に収めます。
    // （最後の返事が短いと、その先頭を画面の端まで持っていけないため。
    //   収めないと、何回押しても同じ返事から先へ戻れなくなります）

    /*
     * 縦書き表示パネルが開いていて、中身が出ているとき
     */
    function tategakiView() {

        const overlay = document.getElementById(TATEGAKI.overlayId);
        const scroller = document.getElementById(TATEGAKI.scrollerId);

        if (
            !overlay ||
            !scroller ||
            overlay.classList.contains(TATEGAKI.emptyClass) ||
            scroller.clientWidth === 0
        ) {
            return null;
        }

        const messages = Array.from(
            scroller.querySelectorAll(TATEGAKI.aiSelector)
        ).filter(function (el) {
            return el.getClientRects().length > 0;
        });

        /*
         * 縦書き（右から左へ読む）では、scrollLeft は
         * 最初が0で、読み進めるほどマイナスになります。
         * なので「-scrollLeft」を読んだ量として使います。
         */
        const current = -scroller.scrollLeft;
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);

        const box = scroller.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(scroller).paddingRight) || 0;
        const edge = box.right - pad - CONFIG.tategakiOffset;

        const targets = messages.map(function (el) {
            // 返事の右端（先頭）を画面の右端に合わせる位置
            const shift = el.getBoundingClientRect().right - edge;
            return clamp(current - shift, 0, max);
        });

        return {
            current: current,
            size: scroller.clientWidth,
            targets: targets,
            go: function (pos) {
                scroller.scrollTo({
                    left: -pos,
                    behavior: CONFIG.smooth ? 'smooth' : 'auto'
                });
            }
        };
    }


    /*
     * ふつうの横書きの画面
     */
    function normalView() {

        const responses = findResponses();

        if (!responses.length) {
            return null;
        }

        const scroller = findScroller(responses[responses.length - 1]);

        const current = scroller.scrollTop;
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

        const top = isDocScroller(scroller)
            ? 0
            : scroller.getBoundingClientRect().top;

        const targets = responses.map(function (el) {
            return clamp(
                current + el.getBoundingClientRect().top - top - CONFIG.topOffset,
                0,
                max
            );
        });

        return {
            current: current,
            size: scroller.clientHeight,
            targets: targets,
            go: function (pos) {
                scroller.scrollTo({
                    top: pos,
                    behavior: CONFIG.smooth ? 'smooth' : 'auto'
                });
            }
        };
    }


    // =========================================================
    // 先頭へ戻る
    // =========================================================

    /*
     * ・最新の返事の先頭より先にいる → 最新の返事の先頭へ
     * ・最新の返事の先頭が画面の途中に見えている → そこへ合わせる
     * ・もう先頭にいる → ひとつ前の返事の先頭へ
     *
     * 縦書き表示パネルが開いているときは、縦書きの画面の中で動きます。
     */
    function jump() {

        const view = tategakiView() || normalView();

        if (!view || !view.targets.length) {
            toast('返事が見つからなかったよ');
            return;
        }

        const current = view.current;
        const targets = view.targets;
        const latest = targets[targets.length - 1];

        let goal = null;

        if (latest > current + 10 && latest < current + view.size) {

            goal = latest;

        } else {

            for (let i = targets.length - 1; i >= 0; i--) {
                if (targets[i] < current - 10) {
                    goal = targets[i];
                    break;
                }
            }
        }

        if (goal === null) {
            toast('これより前に返事はないよ');
            return;
        }

        view.go(goal);
    }


    // =========================================================
    // スタイル（横画面で入力欄と一緒に隠す）
    // =========================================================

    function ensureStyle() {

        if (!CONFIG.hideWithInput || ensureStyle.done) {
            return;
        }

        const css =
            'html.cls-hide #' + CONFIG.buttonId + '{display:none !important;}';

        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(css);
            document.adoptedStyleSheets =
                document.adoptedStyleSheets.concat([sheet]);
        } catch (_) {
            const style = document.createElement('style');
            style.textContent = css;
            document.documentElement.appendChild(style);
        }

        ensureStyle.done = true;
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

        ensureStyle();

        if (document.getElementById(CONFIG.buttonId)) {
            applyPosition();
            return;
        }

        const button = document.createElement('button');

        button.id = CONFIG.buttonId;
        button.type = 'button';
        button.title = '生成の先頭に戻る';
        button.textContent = CONFIG.icon;

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
            'font-size:20px',
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
            jump();
        });

        document.body.appendChild(button);

        applyPosition();
    }


    // =========================================================
    // 起動
    // =========================================================

    installButton();

    /*
     * Claudeは画面を組み替えるので、消えたら作り直します
     */
    setInterval(installButton, 2000);

})();
