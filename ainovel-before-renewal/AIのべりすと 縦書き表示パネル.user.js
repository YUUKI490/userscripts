// ==UserScript==
// @name         AIのべりすと 縦書き表示パネル
// @namespace    ainovel-tategaki-panel
// @version      1.4.1
// @description  本文（指示ブロックを除く）を縦書きにして、画面にかぶせるパネルで表示します。縦書きモードは閉じるまで続き、指示入力中だけ横書きの入力画面が前に出ます。キャラ画像スクリプトの顔画像もセリフの頭に表示します。生成が終わると自動で更新されます。開くのは右スワイプ式ツールパレットの「縦書き」から
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
         * 文字の大きさ(px)と行間
         */
        fontSize: 19,
        lineHeight: 1.9,

        /*
         * 書体（上から順に、端末にあるものが使われます）
         */
        fontFamily:
            '"Noto Serif JP", "Noto Serif CJK JP", "Source Han Serif JP", ' +
            '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", serif',

        /*
         * 色
         */
        background: '#fbf8f0',
        color: '#222222',

        /*
         * 本文が変わってから表示を作り直すまでの待ち時間(ms)
         */
        renderDelay: 300,

        /*
         * 縦書きが見えている間、本文が変わっていないか確かめる間隔(ms)。
         * 本文欄の変化を見張るだけでは拾えない更新があるための保険です
         */
        pollInterval: 1500,

        /*
         * いちばん最後（最新）を見ているとみなす余白(px)。
         * この範囲にいるときは、本文が増えたら最新へ追従します
         */
        followMargin: 60,

        /*
         * キャラ画像（顔）の大きさ(px)。
         * 0 にすると、キャラ画像スクリプトで設定した大きさに合わせます
         */
        faceSize: 0,

        /*
         * 顔画像とセリフのすき間(px)
         */
        faceGap: 6
    };


    // =========================================================
    // ID
    // =========================================================

    /*
     * ツールパレットから押される隠しボタン
     */
    const OPEN_BUTTON_ID = 'ainovel-tategaki-open';

    const OVERLAY_ID = 'ainovel-tategaki-overlay';
    const SCROLLER_ID = 'ainovel-tategaki-scroller';
    const CLOSE_ID = 'ainovel-tategaki-close';
    const INPUT_ID = 'ainovel-tategaki-input';

    const OPEN_CLASS = 'ainovel-tategaki-open';

    /*
     * 縦書きモードのオン・オフを、ページを開き直しても覚えておくためのキー
     */
    const STORAGE_KEY = 'ainovel-tategaki-mode';


    /*
     * キャラ画像スクリプトが本文に差し込む顔画像のクラス
     */
    const FACE_IMAGE_CLASS = 'ainovel-character-inline-image';

    /*
     * 読み取った文字列の中で、顔画像の位置を示す目印
     */
    const FACE_MARK_START = '\uE000';
    const FACE_MARK_END = '\uE001';

    const FACE_MARK_RE = /\uE000(\d+)\uE001/g;


    // =========================================================
    // CSS
    // =========================================================

    const style = document.createElement('style');

    style.textContent = `

        #${OVERLAY_ID} {
            display: none;
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            /* ツールパレット（2147483645〜）より下、全画面本文より上 */
            z-index: 2147483644 !important;
            background: ${CONFIG.background} !important;
            color: ${CONFIG.color} !important;
            box-sizing: border-box !important;
        }

        body.${OPEN_CLASS} #${OVERLAY_ID} {
            display: block;
        }

        /* 縦書きモード中でも、全画面スクリプトの指示入力を開いている間は
           縦書きを引っ込めて、横書きの入力画面を出します */
        body.${OPEN_CLASS}.qp-full-active.qp-input-mode #${OVERLAY_ID} {
            display: none;
        }

        /* 縦書きを表示している間は、後ろの画面をスクロールさせない */
        body.${OPEN_CLASS}:not(.qp-input-mode) {
            overflow: hidden !important;
        }

        /* 縦書きを表示している間は、下に固定されている他スクリプトのボタンを隠す
           （visibility なので、パレットからの代理クリックはそのまま効きます）。
           指示入力中は隠しません */
        body.${OPEN_CLASS}:not(.qp-input-mode) #qp-full-main,
        body.${OPEN_CLASS}:not(.qp-input-mode) #qp-full-switch,
        body.${OPEN_CLASS}:not(.qp-input-mode) #qp-full-template-button,
        body.${OPEN_CLASS}:not(.qp-input-mode) #gendone-bar {
            visibility: hidden !important;
        }

        #${SCROLLER_ID} {
            position: absolute !important;
            inset: 0 !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch;

            writing-mode: vertical-rl !important;
            -webkit-writing-mode: vertical-rl !important;
            text-orientation: mixed !important;

            font-family: ${CONFIG.fontFamily} !important;
            font-size: ${CONFIG.fontSize}px !important;
            line-height: ${CONFIG.lineHeight} !important;
            letter-spacing: 0.02em !important;

            /* スマホのブラウザが文字サイズを勝手に調整しないように */
            -webkit-text-size-adjust: none !important;
            text-size-adjust: none !important;

            line-break: strict !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;

            padding: 2.2em 1.6em 1.6em 1.6em !important;
            box-sizing: border-box !important;
            text-align: start !important;
        }

        /* サイト側や他スクリプトの文字サイズ指定に負けないように、
           行ごとにも文字サイズと行間を直接指定します */
        #${SCROLLER_ID} .tg-line,
        #${SCROLLER_ID} .tg-empty,
        #${SCROLLER_ID} .tg-face-text {
            margin: 0 !important;
            padding: 0 !important;
            font-size: ${CONFIG.fontSize}px !important;
            line-height: ${CONFIG.lineHeight} !important;
            font-family: ${CONFIG.fontFamily} !important;
        }

        #${SCROLLER_ID} .tg-line span,
        #${SCROLLER_ID} .tg-line ruby {
            font-size: inherit !important;
            line-height: inherit !important;
        }

        /* 顔画像がある本文では、顔のない行も含めて全部の行を
           顔の高さぶん下げて、行頭（上）をそろえます */
        #${SCROLLER_ID}.tg-has-face .tg-line {
            padding-top: calc(var(--tg-face-size, 32px) + ${CONFIG.faceGap}px) !important;
        }

        /* 顔画像つきのセリフ：
           顔の下にセリフを置き、セリフの列のまん中に顔をそろえます
           （1列ならその列、2列なら列のあいだ、3列なら2列目がまん中） */
        #${SCROLLER_ID} .tg-face {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            min-width: var(--tg-face-size, 32px) !important;
        }

        #${SCROLLER_ID} .tg-face-text {
            margin: 0 !important;
            padding: 0 !important;
        }

        #${SCROLLER_ID} .tg-face-img {
            position: absolute !important;
            top: 0 !important;
            right: 50% !important;
            transform: translateX(50%) !important;
            width: var(--tg-face-size, 32px) !important;
            height: var(--tg-face-size, 32px) !important;
            object-fit: cover !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
        }

        #${SCROLLER_ID} .tg-tcy {
            text-combine-upright: all !important;
            -webkit-text-combine: horizontal !important;
        }

        #${SCROLLER_ID} .tg-line rt {
            font-size: 0.5em !important;
        }

        #${SCROLLER_ID} .tg-none {
            writing-mode: horizontal-tb !important;
            color: #999999 !important;
            font-size: 15px !important;
            padding: 24px !important;
        }

        /* 左下：横書きの指示入力を開くボタン */
        #${INPUT_ID} {
            position: absolute !important;
            left: 12px !important;
            bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
            z-index: 1 !important;
            height: 42px !important;
            min-width: 100px !important;
            padding: 6px 14px !important;
            border: none !important;
            border-radius: 21px !important;
            background: rgba(0, 0, 0, 0.62) !important;
            color: #ffffff !important;
            font-size: 15px !important;
            line-height: 30px !important;
            writing-mode: horizontal-tb !important;
            box-sizing: border-box !important;
        }

        #${CLOSE_ID} {
            position: absolute !important;
            top: 8px !important;
            left: 8px !important;
            z-index: 1 !important;
            width: 40px !important;
            height: 40px !important;
            border: none !important;
            border-radius: 50% !important;
            background: rgba(0, 0, 0, 0.08) !important;
            color: #444444 !important;
            font-size: 20px !important;
            line-height: 40px !important;
            padding: 0 !important;
            text-align: center !important;
        }
    `;

    document.head.appendChild(style);


    // =========================================================
    // 本文の読み取り
    // =========================================================

    /*
     * 要素の中身を、改行を保ったまま文字列にします。
     * キャラ画像スクリプトの顔画像は、目印に置き換えて faces に画像を記録します。
     * それ以外の画像は無視します。
     * チャットアイコン（novel1の1枚本文欄）で区切りを付けます。
     */
    function collectText(element, faces) {

        /*
         * 本文欄そのものが入力欄（textarea など）のときは、
         * 中の文字ではなく今の入力内容（value）を読みます
         */
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {

            const value = String(element.value || '')
                .replace(/\r\n?/g, '\n')
                .replace(/\u00a0/g, ' ');

            return value.trim() ? [value] : [];
        }

        const parts = [];

        let role = 'plaintext';
        let buffer = '';

        const flush = function () {

            const text = buffer
                .replace(/\r\n?/g, '\n')
                .replace(/\u00a0/g, ' ');

            if (text.trim() && role !== 'user') {
                parts.push(text);
            }

            buffer = '';
        };

        const walk = function (node) {

            node.childNodes.forEach(function (child) {

                if (child.nodeType === 3) {
                    buffer += child.data;
                    return;
                }

                if (child.nodeType !== 1) {
                    return;
                }

                const tag = child.tagName;

                if (tag === 'BR') {
                    buffer += '\n';
                    return;
                }

                /*
                 * キャラ画像スクリプトの顔画像
                 * （span の背景画像として表示されています）
                 */
                if (child.classList.contains(FACE_IMAGE_CLASS)) {

                    const src = faceImageUrl(child);
                    const css = window.getComputedStyle(child);

                    if (src && css.display !== 'none' && css.visibility !== 'hidden') {

                        buffer +=
                            FACE_MARK_START +
                            faces.length +
                            FACE_MARK_END;

                        faces.push(src);
                    }

                    return;
                }

                if (tag === 'IMG') {

                    if (child.classList.contains('chat_icon')) {

                        flush();

                        const alt = child.getAttribute('alt') || '';

                        role =
                            alt.indexOf('ユーザー') >= 0
                                ? 'user'
                                : 'assistant';
                    }

                    return;
                }

                if (tag === 'STYLE' || tag === 'SCRIPT') {
                    return;
                }

                if (tag === 'TEXTAREA' || tag === 'INPUT') {
                    buffer += child.value || '';
                    return;
                }

                const block = /^(DIV|P)$/.test(tag);

                if (block && buffer && !buffer.endsWith('\n')) {
                    buffer += '\n';
                }

                walk(child);

                if (block && !buffer.endsWith('\n')) {
                    buffer += '\n';
                }
            });
        };

        walk(element);
        flush();

        return parts;
    }


    /*
     * 顔画像のURLを取り出します。
     * img なら src、span などなら背景画像の url(...) から取ります。
     */
    function faceImageUrl(element) {

        if (element.tagName === 'IMG') {
            return element.currentSrc || element.src || '';
        }

        const background =
            element.style.backgroundImage ||
            window.getComputedStyle(element).backgroundImage ||
            '';

        const match = background.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);

        return match ? match[2] : '';
    }


    /*
     * 本文ブロック（指示ブロック .data_edit.user は除く）を読み取ります。
     * ブロックが無いとき（novel1の1枚本文欄）は1枚の入力欄から読みます。
     * 戻り値は { text, faces }（faces は顔画像のURL一覧）です。
     */
    function readNovelText() {

        const faces = [];

        const root = document.getElementById('data_container');

        if (!root) {
            return { text: '', faces: faces };
        }

        const blocks = Array.from(
            root.querySelectorAll(
                '.data_edit.plaintext, ' +
                '.data_edit.assistant, ' +
                '.data_edit.Assistant'
            )
        );

        let parts = [];

        if (blocks.length) {

            blocks.forEach(function (block) {

                const text = collectText(block, faces)
                    .join('\n')
                    .replace(/\n+$/, '');

                if (text.trim()) {
                    parts.push(text);
                }
            });

        } else {

            const editor =
                root.querySelector('#data_edit, .data_edit') ||
                document.getElementById('data_edit');

            if (editor) {
                parts = collectText(editor, faces);
            }
        }

        return {
            text: cleanText(parts.join('\n')),
            faces: faces
        };
    }


    /*
     * 表示に要らない部分を取り除きます。
     * ・@/* 〜 @*\/ で囲まれたコメント
     * ・@ で始まる行（@endpoint など）
     */
    function cleanText(text) {

        const lines = text
            .replace(/\r\n?/g, '\n')
            .split('\n');

        const out = [];

        let inComment = false;

        lines.forEach(function (line) {

            const head = line
                .replace(FACE_MARK_RE, '')
                .trim();

            if (head.startsWith('@/*')) {
                inComment = true;
                return;
            }

            if (head.startsWith('@*/')) {
                inComment = false;
                return;
            }

            if (inComment) {
                return;
            }

            if (head.startsWith('@')) {
                return;
            }

            out.push(line);
        });

        return out
            .join('\n')
            .replace(/^\n+/, '')
            .replace(/\n+$/, '');
    }


    // =========================================================
    // 縦書き用の整形
    // =========================================================

    function escapeHtml(text) {

        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }


    function ruby(base, reading) {
        return '<ruby>' + base + '<rt>' + reading + '</rt></ruby>';
    }


    /*
     * 1行を縦書き用のHTMLにします。
     * ・ルビ：[[rb:漢字 > かんじ]]、｜漢字《かんじ》、漢字《かんじ》
     * ・半角数字1〜2桁、!! !? などは縦中横
     * ・半角の ! ? 単体は全角に
     */
    function formatLine(raw) {

        let html = escapeHtml(raw);

        // 縦中横（ルビより先に。タグの中には数字や!?は入りません）
        html = html.replace(
            /(^|[^0-9A-Za-z.,])([0-9]{1,2})(?![0-9A-Za-z.,])/g,
            function (all, before, digits) {
                return before + '<span class="tg-tcy">' + digits + '</span>';
            }
        );

        html = html.replace(
            /[!?！？]{2}|[!?]/g,
            function (mark) {

                if (mark.length === 2) {

                    const half = mark
                        .replace(/！/g, '!')
                        .replace(/？/g, '?');

                    return '<span class="tg-tcy">' + half + '</span>';
                }

                return mark === '!' ? '！' : '？';
            }
        );

        // ルビ（pixiv形式）
        html = html.replace(
            /\[\[rb:\s*(.+?)\s*&gt;\s*(.+?)\s*\]\]/g,
            function (all, base, reading) {
                return ruby(base, reading);
            }
        );

        // ルビ（｜で始まる形式）
        html = html.replace(
            /[｜|]([^｜|《》]+?)《([^《》]+?)》/g,
            function (all, base, reading) {
                return ruby(base, reading);
            }
        );

        // ルビ（漢字に直接付ける形式）
        html = html.replace(
            /([\u4E00-\u9FFF\u3400-\u4DBF々〆ヶ]+)《([^《》]+?)》/g,
            function (all, base, reading) {
                return ruby(base, reading);
            }
        );

        return html;
    }


    function buildHtml(text, faces) {

        if (!text) {
            return '<div class="tg-none">表示できる本文がありません</div>';
        }

        return text
            .split('\n')
            .map(function (line) {

                /*
                 * 顔画像の目印があれば取り出して、行から消します
                 */
                let face = null;

                const plain = line.replace(FACE_MARK_RE, function (all, index) {

                    if (face === null && faces[Number(index)]) {
                        face = faces[Number(index)];
                    }

                    return '';
                });

                if (!plain.trim()) {

                    if (face === null) {
                        return '<div class="tg-empty">\u3000</div>';
                    }
                }

                if (face !== null) {

                    return (
                        '<div class="tg-line tg-face">' +
                        '<img class="tg-face-img" alt="" src="' + escapeHtml(face) + '">' +
                        '<div class="tg-face-text">' + formatLine(plain) + '</div>' +
                        '</div>'
                    );
                }

                return '<div class="tg-line">' + formatLine(plain) + '</div>';
            })
            .join('');
    }


    /*
     * 顔画像の大きさ(px)
     */
    function faceSize() {

        if (CONFIG.faceSize > 0) {
            return CONFIG.faceSize;
        }

        const value = parseFloat(
            window
                .getComputedStyle(document.documentElement)
                .getPropertyValue('--ainovel-character-icon-size')
        );

        return value > 0 ? value : 32;
    }


    // =========================================================
    // パネル
    // =========================================================

    let overlay = null;
    let scroller = null;

    let lastText = null;
    let renderTimer = null;


    function buildPanel() {

        if (overlay && document.body.contains(overlay)) {
            return;
        }

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        scroller = document.createElement('div');
        scroller.id = SCROLLER_ID;

        const close = document.createElement('button');
        close.id = CLOSE_ID;
        close.type = 'button';
        close.textContent = '✕';
        close.setAttribute('aria-label', '縦書きを閉じる');

        close.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
        });

        const input = document.createElement('button');
        input.id = INPUT_ID;
        input.type = 'button';
        input.textContent = '✍ 指示を書く';

        input.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openInstruction();
        });

        overlay.appendChild(scroller);
        overlay.appendChild(close);
        overlay.appendChild(input);

        document.body.appendChild(overlay);
    }


    function isOpen() {
        return document.body.classList.contains(OPEN_CLASS);
    }


    /*
     * 縦書きモード中で、しかも今は指示入力で引っ込んでいない
     * （実際に画面に見えている）かどうか
     */
    function isShown() {

        const body = document.body;

        return (
            isOpen() &&
            !(
                body.classList.contains('qp-full-active') &&
                body.classList.contains('qp-input-mode')
            )
        );
    }


    function saveMode(on) {

        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (_) {
        }
    }


    function loadMode() {

        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }


    /*
     * 縦書き（右から左）では、いちばん左がいちばん最後（最新）です。
     * 今のブラウザでは scrollLeft は 0（右端）からマイナス方向に増えます。
     */
    function maxScroll() {
        return Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    }


    function isAtEnd() {
        return Math.abs(scroller.scrollLeft) >= maxScroll() - CONFIG.followMargin;
    }


    function scrollToEnd() {
        scroller.scrollLeft = -maxScroll();
    }


    function render(force) {

        /*
         * 引っ込んでいる間は作り直さない
         * （見えていないと位置の計算ができないため。
         *   また表に出たときに最新から作り直します）
         */
        if (!isShown()) {
            return;
        }

        const data = readNovelText();

        /*
         * 洗脳状態で顔画像が差し替わったときも作り直すように、
         * 画像のURLも含めて比べます
         */
        const signature = data.text + '\n' + data.faces.join('\n');

        if (!force && signature === lastText) {
            return;
        }

        const follow = force || isAtEnd();
        const keep = scroller.scrollLeft;

        lastText = signature;

        scroller.style.setProperty('--tg-face-size', faceSize() + 'px');
        scroller.classList.toggle('tg-has-face', data.faces.length > 0);
        scroller.innerHTML = buildHtml(data.text, data.faces);

        requestAnimationFrame(function () {

            if (follow) {
                scrollToEnd();
            } else {
                scroller.scrollLeft = keep;
            }
        });
    }


    function scheduleRender() {

        if (!isShown()) {
            return;
        }

        clearTimeout(renderTimer);

        renderTimer = setTimeout(function () {
            render(false);
        }, CONFIG.renderDelay);
    }


    function openPanel() {

        buildPanel();

        document.body.classList.add(OPEN_CLASS);
        saveMode(true);

        wasShown = isShown();

        // 開いたときは最新（いちばん最後）を表示
        render(true);
    }


    function closePanel() {

        clearTimeout(renderTimer);

        document.body.classList.remove(OPEN_CLASS);
        saveMode(false);

        wasShown = false;
    }


    /*
     * 横書きの指示入力を開きます（縦書きモードはそのまま）。
     * 指示入力の画面が出ている間だけ縦書きが引っ込み、
     * 入力が終わって本文に戻ると縦書きがまた表示されます。
     * 「生成完了→Grok送信ボタン」の「✍ 指示を書く」があればそれを押し、
     * 無いときは全画面スクリプトの指示入力、それも無ければ本物の入力欄へ
     * （本物の入力欄のときだけは、縦書きを閉じます）。
     */
    function openInstruction() {

        const gendone = document.getElementById('gendone-send');

        if (gendone) {
            gendone.click();
            return;
        }

        const main = document.getElementById('qp-full-main');
        const sw = document.getElementById('qp-full-switch');

        if (main && sw) {

            if (!document.body.classList.contains('qp-full-active')) {
                main.click();
                setTimeout(function () {
                    sw.click();
                }, 250);
                return;
            }

            sw.click();
            return;
        }

        const real = document.getElementById('chat_field');

        if (real) {

            closePanel();

            real.scrollIntoView({ block: 'center' });

            try {
                real.focus();
            } catch (_) {
            }
        }
    }


    function togglePanel() {

        if (isOpen()) {
            closePanel();
        } else {
            openPanel();
        }
    }


    // =========================================================
    // ツールパレットから押される隠しボタン
    // =========================================================

    function ensureOpenButton() {

        if (document.getElementById(OPEN_BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');

        button.id = OPEN_BUTTON_ID;
        button.type = 'button';
        button.textContent = '縦書き';
        button.style.setProperty('display', 'none', 'important');

        button.addEventListener('click', function (event) {
            event.preventDefault();
            togglePanel();
        });

        document.body.appendChild(button);
    }


    // =========================================================
    // 本文の変化を見張る
    // =========================================================

    /*
     * 本文欄の変化（生成で本文が増えた・書き換えた・顔画像が差し替わった）を見て、
     * パネルを開いているときだけ表示を作り直します。
     * 全画面スクリプトなどで #data_container が差し替わることがあるので、
     * 定期的に見張り先を付け直します。
     */
    let watchedContainer = null;

    const contentObserver = new MutationObserver(function () {
        scheduleRender();
    });


    function watchContainer() {

        const container = document.getElementById('data_container');

        if (container === watchedContainer) {
            return;
        }

        contentObserver.disconnect();

        watchedContainer = container;

        if (container) {

            contentObserver.observe(container, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['src', 'style']
            });

            scheduleRender();
        }
    }


    /*
     * 生成状態の切り替わり（全画面スクリプトが body に付ける qp-generating）
     * でも念のため作り直します
     */
    let wasGenerating = false;
    let wasShown = false;

    const bodyObserver = new MutationObserver(function () {

        /*
         * 指示入力から本文に戻って縦書きが表に出たら、最新から作り直す
         */
        const shown = isShown();

        if (shown !== wasShown) {

            wasShown = shown;

            if (shown) {
                render(true);
            }
        }

        const generating =
            document.body.classList.contains('qp-generating');

        if (generating !== wasGenerating) {

            wasGenerating = generating;

            if (!generating) {
                scheduleRender();
            }
        }
    });


    // =========================================================
    // 開始
    // =========================================================

    function init() {

        ensureOpenButton();
        watchContainer();

        bodyObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        // 前回、縦書きモードのままだったら、また縦書きで開く
        if (loadMode()) {
            openPanel();
        }

        setInterval(function () {
            ensureOpenButton();
            watchContainer();
        }, 1000);

        /*
         * 見えている間は、定期的に本文を読み直して、
         * 変わっていたら作り直します（変わっていなければ何もしません）
         */
        setInterval(function () {

            if (isShown()) {
                render(false);
            }

        }, CONFIG.pollInterval);

        /*
         * 入力欄の内容が書き換わったときも作り直します
         */
        document.addEventListener('input', function (event) {

            const target = event.target;

            if (
                target &&
                target.closest &&
                target.closest('#data_container')
            ) {
                scheduleRender();
            }

        }, true);
    }


    init();

})();
