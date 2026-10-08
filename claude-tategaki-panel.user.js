// ==UserScript==
// @name         Claude 縦書き表示パネル
// @namespace    claude-tategaki-panel
// @version      2.11.0
// @description  claude.aiの会話（あなたのメッセージとClaudeの返事）を全部、縦書きにして画面にかぶせて表示します。生成中もリアルタイムで流れます。キャラ画像スクリプトの顔もセリフの頭に表示します。画面左の「縦／横」ボタンでオン・オフでき、状態は覚えておきます。会話の全文はclaude.aiから直接取得するので、長い会話でも抜けずに最初から表示します（非公式の内部APIを使用）
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
         * 文字の大きさ(px)と行間。
         * 「Claude 文字サイズ変更」の「縦書きの文字」で変えたときは、そちらが優先されます
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
         * あなたのメッセージの文字色
         */
        userColor: '#5a6a8a',

        /*
         * 会話が変わってから表示を作り直すまでの待ち時間(ms)。
         * 生成中はこの間隔で流れていきます
         */
        renderDelay: 300,

        /*
         * 見えている間、会話が変わっていないか確かめる間隔(ms)
         */
        pollInterval: 1500,

        /*
         * いちばん最後（最新）を見ているとみなす余白(px)。
         * この範囲にいるときは、会話が増えたら最新へ追従します
         */
        followMargin: 60,

        /*
         * 生成が終わってから、会話の全文を取り直すまでの待ち時間(ms)
         */
        refetchDelay: 1500,

        /*
         * キャラ画像（顔）の大きさ(px)。
         * 0 にすると、キャラ画像スクリプトで設定した大きさに合わせます
         */
        faceSize: 0,

        /*
         * 顔画像とセリフのすき間(px)
         */
        faceGap: 6,

        /*
         * 段落と段落のすき間(px)。地の文・セリフ・見出しなど、
         * どの段落のあいだも同じだけ空けます。0 にするとすき間なし。
         * 「Claude 文字サイズ変更」の「縦書きの段落の間隔」で変えたときは、そちらが優先されます
         */
        paragraphGap: 12,

        /*
         * 顔画像つきのセリフで、行頭の名前を消して顔画像の上に表示するか。
         * false にすると、今まで通り「名前「セリフ」」のまま表示します
         */
        showFaceName: true,

        /*
         * 顔画像の上に出す名前の文字の大きさ(px)
         */
        faceNameSize: 12,

        /*
         * 画面のいちばん上と、文字（名前）のあいだの余白(px)
         */
        topPadding: 6,

        /*
         * オン・オフボタンの位置（画面の左端からと、上からの割合）
         */
        toggleLeft: 6,
        toggleTop: '45%'
    };


    // =========================================================
    // ID・クラス
    // =========================================================

    const OVERLAY_ID = 'claude-tategaki-overlay';
    const SCROLLER_ID = 'claude-tategaki-scroller';
    const TOGGLE_ID = 'claude-tategaki-toggle';

    /*
     * オン・オフを、ページを開き直しても覚えておくためのキー
     */
    const STORAGE_KEY = 'claude-tategaki-enabled';

    const EMPTY_CLASS = 'tg-no-message';


    /*
     * 会話のメッセージの入れ物
     */
    const USER_SELECTOR = '[data-testid="user-message"]';

    /*
     * Claudeの返事は、今の画面では「生成中かどうか」の目印
     * （data-is-streaming）がついた入れ物に入っています。
     * 前の画面の作り（font-claude-response など）にも対応しておきます
     */
    const MESSAGE_SELECTORS = [
        USER_SELECTOR,
        '[data-is-streaming]',
        '.font-claude-response',
        '.font-claude-message'
    ].join(', ');

    /*
     * Claudeの返事の中の、本文（マークダウン）部分
     */
    const MARKDOWN_SELECTORS = '.standard-markdown, .progressive-markdown';


    /*
     * キャラ画像スクリプト（Claude版）が使うクラス
     */
    const SPEECH_BLOCK_CLASS = 'cc-speech-block';
    const INLINE_ICON_CLASS = 'cc-inline-icon';


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
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            /* 他のユーザースクリプトのボタンや大きい入力画面（2147483640〜）より下 */
            z-index: 2147483600 !important;
            background: ${CONFIG.background} !important;
            color: ${CONFIG.color} !important;
            box-sizing: border-box !important;
        }

        /* メッセージが1つも無い画面（新しいチャット、設定など）では出さない */
        #${OVERLAY_ID}.${EMPTY_CLASS} {
            display: none !important;
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
            font-size: var(--tg-font-size, ${CONFIG.fontSize}px) !important;
            line-height: ${CONFIG.lineHeight} !important;
            letter-spacing: 0.02em !important;

            -webkit-text-size-adjust: none !important;
            text-size-adjust: none !important;

            line-break: strict !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;

            padding: ${CONFIG.topPadding}px 1.6em 1.6em 1.6em !important;
            box-sizing: border-box !important;
            text-align: start !important;
        }

        /* 1つのメッセージ */
        #${SCROLLER_ID} .tg-msg {
            margin: 0 !important;
            padding: 0 !important;
        }

        /* メッセージとメッセージのあいだ */
        #${SCROLLER_ID} .tg-msg + .tg-msg {
            margin-right: 1.4em !important;
        }

        #${SCROLLER_ID} .tg-user {
            color: ${CONFIG.userColor} !important;
        }

        #${SCROLLER_ID} .tg-line,
        #${SCROLLER_ID} .tg-empty,
        #${SCROLLER_ID} .tg-face-text {
            margin: 0 !important;
            padding: 0 !important;
            font-size: var(--tg-font-size, ${CONFIG.fontSize}px) !important;
            line-height: ${CONFIG.lineHeight} !important;
            font-family: ${CONFIG.fontFamily} !important;
        }

        #${SCROLLER_ID} .tg-line span,
        #${SCROLLER_ID} .tg-line ruby {
            font-size: inherit !important;
            line-height: inherit !important;
        }

        #${SCROLLER_ID} .tg-head {
            font-weight: bold !important;
        }

        /* 顔画像がある会話では、顔のない行も含めて全部の行を
           顔の高さぶん下げて、行頭（上）をそろえます */
        #${SCROLLER_ID}.tg-has-face .tg-line {
            padding-top: calc(var(--tg-name-h, 0px) + var(--tg-face-size, 32px) + ${CONFIG.faceGap}px) !important;
        }

        /* 顔画像の上に出す名前（横書きで、顔のまん中にそろえます）。
           行の文字サイズ・行間を受け継ぐ指定に負けないように、詳しめに指定します */
        #${SCROLLER_ID} .tg-line span.tg-face-name {
            position: absolute !important;
            top: 0 !important;
            right: 50% !important;
            transform: translateX(50%) !important;
            writing-mode: horizontal-tb !important;
            -webkit-writing-mode: horizontal-tb !important;
            white-space: nowrap !important;
            font-size: ${CONFIG.faceNameSize}px !important;
            line-height: var(--tg-name-h, 0px) !important;
            height: var(--tg-name-h, 0px) !important;
            letter-spacing: 0 !important;
            font-weight: bold !important;
            color: inherit !important;
            opacity: 0.85 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* 顔画像つきのセリフ：
           顔の下にセリフを置き、セリフの列のまん中に顔をそろえます */
        #${SCROLLER_ID} .tg-face {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            min-width: var(--tg-face-size, 32px) !important;
        }

        /* 段落と段落のあいだを空ける（地の文・セリフ・見出し、どれも同じ） */
        #${SCROLLER_ID} .tg-msg > .tg-line + .tg-line {
            margin-right: var(--tg-para-gap, ${CONFIG.paragraphGap}px) !important;
        }

        #${SCROLLER_ID} .tg-face-img {
            position: absolute !important;
            top: var(--tg-name-h, 0px) !important;
            right: 50% !important;
            transform: translateX(50%) !important;
            width: var(--tg-face-size, 32px) !important;
            height: var(--tg-face-size, 32px) !important;
            display: block !important;
            background-size: cover !important;
            background-position: center !important;
            background-repeat: no-repeat !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
        }

        /* 全文の部分と、ページから拾った最新の部分 */
        #${SCROLLER_ID} .tg-part {
            margin: 0 !important;
            padding: 0 !important;
        }

        #${SCROLLER_ID} .tg-base:not(:empty) + .tg-tail > .tg-msg:first-child {
            margin-right: 1.4em !important;
        }

        #${SCROLLER_ID} .tg-tcy {
            text-combine-upright: all !important;
            -webkit-text-combine: horizontal !important;
        }

        #${SCROLLER_ID} .tg-line rt {
            font-size: 0.5em !important;
        }

        /* コードは縦書きだと読めないので、横書きの箱で挟みます */
        #${SCROLLER_ID} .tg-code {
            writing-mode: horizontal-tb !important;
            -webkit-writing-mode: horizontal-tb !important;
            white-space: pre !important;
            font-family: ui-monospace, Menlo, Consolas, monospace !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
            letter-spacing: 0 !important;
            width: min(80vw, 520px) !important;
            max-height: 100% !important;
            overflow: auto !important;
            margin: 0 0.6em !important;
            padding: 8px !important;
            background: rgba(0, 0, 0, 0.05) !important;
            border-radius: 6px !important;
            box-sizing: border-box !important;
        }

        /* 区切り線 */
        #${SCROLLER_ID} .tg-hr {
            border: none !important;
            border-right: 1px solid rgba(0, 0, 0, 0.2) !important;
            margin: 0 0.8em !important;
            padding: 0 !important;
        }

        /* オン・オフボタン（縦書きパネルや他のボタンより上） */
        #${TOGGLE_ID} {
            position: fixed !important;
            left: ${CONFIG.toggleLeft}px !important;
            top: ${CONFIG.toggleTop} !important;
            z-index: 2147483641 !important;
            width: 40px !important;
            height: 40px !important;
            border: none !important;
            border-radius: 50% !important;
            background: rgba(0, 0, 0, 0.55) !important;
            color: #ffffff !important;
            font-size: 16px !important;
            font-family: ${CONFIG.fontFamily} !important;
            line-height: 40px !important;
            padding: 0 !important;
            text-align: center !important;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3) !important;
        }
    `;

    document.head.appendChild(style);


    // =========================================================
    // 顔画像
    // =========================================================

    function urlFromBackground(background) {

        const match = String(background || '')
            .match(/url\(\s*(['"]?)(.*?)\1\s*\)/);

        return match ? match[2] : '';
    }


    /*
     * 行頭のセリフの顔（段落の ::before に背景画像として出ています）
     */
    function speechBlockFace(paragraph) {

        if (!paragraph.classList.contains(SPEECH_BLOCK_CLASS)) {
            return '';
        }

        const css = window.getComputedStyle(paragraph, '::before');

        if (!css || css.content === 'none' || css.display === 'none') {
            return '';
        }

        return urlFromBackground(css.backgroundImage);
    }


    /*
     * 段落の途中のセリフの顔（span の背景画像）
     */
    function inlineIconFace(icon) {

        const css = window.getComputedStyle(icon);

        if (css.display === 'none' || css.visibility === 'hidden') {
            return '';
        }

        return urlFromBackground(icon.style.backgroundImage || css.backgroundImage);
    }


    function faceMark(url, faces) {

        const mark = FACE_MARK_START + faces.length + FACE_MARK_END;

        faces.push(url);

        return mark;
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
                .getPropertyValue('--cc-size')
        );

        return value > 0 ? value : 32;
    }


    // =========================================================
    // 会話の読み取り
    // =========================================================

    /*
     * いちばん外側の入れ物だけを残します
     */
    function outermost(list) {

        return list.filter(function (el) {
            return !list.some(function (other) {
                return other !== el && other.contains(el);
            });
        });
    }


    function isSkipped(element) {

        const tag = element.tagName;

        if (
            tag === 'BUTTON' ||
            tag === 'svg' ||
            tag === 'SVG' ||
            tag === 'STYLE' ||
            tag === 'SCRIPT' ||
            tag === 'NOSCRIPT' ||
            tag === 'TEXTAREA' ||
            tag === 'INPUT'
        ) {
            return true;
        }

        if (element.id === OVERLAY_ID) {
            return true;
        }

        return false;
    }


    /*
     * 段落などの中身を、改行と顔画像の目印つきの文字列にします。
     * skipLists が true のときは、中に入っているリスト（入れ子）を飛ばします
     */
    function inlineText(node, faces, skipLists) {

        let text = '';

        node.childNodes.forEach(function (child) {

            if (child.nodeType === 3) {
                text += child.data;
                return;
            }

            if (child.nodeType !== 1 || isSkipped(child)) {
                return;
            }

            if (child.classList.contains(INLINE_ICON_CLASS)) {

                const url = inlineIconFace(child);

                if (url) {
                    text += faceMark(url, faces);
                }

                return;
            }

            const tag = child.tagName;

            if (tag === 'BR') {
                text += '\n';
                return;
            }

            if (skipLists && (tag === 'UL' || tag === 'OL')) {
                return;
            }

            text += inlineText(child, faces, skipLists);
        });

        return text.replace(/\u00a0/g, ' ');
    }


    /*
     * 文字列を行に分けて items に足します
     */
    function pushLines(items, text, kind) {

        String(text)
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .forEach(function (line) {
                items.push({ type: kind || 'line', text: line });
            });
    }


    /*
     * メッセージの中を、行・見出し・コード・区切り線の並びにします
     */
    function walkBlocks(element, items, faces) {

        let pending = '';

        const flush = function () {

            if (pending.trim()) {
                pushLines(items, pending.replace(/^\n+|\n+$/g, ''));
            }

            pending = '';
        };

        element.childNodes.forEach(function (child) {

            if (child.nodeType === 3) {
                pending += child.data;
                return;
            }

            if (child.nodeType !== 1 || isSkipped(child)) {
                return;
            }

            const tag = child.tagName;

            if (tag === 'P') {

                flush();

                let text = inlineText(child, faces, false);

                const url = speechBlockFace(child);

                if (url) {
                    text = faceMark(url, faces) + text;
                }

                pushLines(items, text);
                return;
            }

            if (/^H[1-6]$/.test(tag)) {

                flush();
                pushLines(items, inlineText(child, faces, false), 'head');
                return;
            }

            if (tag === 'LI') {

                flush();

                const parent = child.parentElement;
                let prefix = '・';

                if (parent && parent.tagName === 'OL') {

                    const index =
                        Array.from(parent.children).indexOf(child) +
                        (parseInt(parent.getAttribute('start'), 10) || 1);

                    prefix = index + '．';
                }

                // 段落（p）が入っているリストは、中の段落ごとに処理
                if (child.querySelector(':scope > p')) {

                    const first = items.length;

                    walkBlocks(child, items, faces);

                    if (items[first] && items[first].type === 'line') {
                        items[first].text = prefix + items[first].text;
                    }

                    return;
                }

                pushLines(items, prefix + inlineText(child, faces, true));

                child
                    .querySelectorAll(':scope > ul, :scope > ol')
                    .forEach(function (list) {
                        walkBlocks(list, items, faces);
                    });

                return;
            }

            if (tag === 'PRE') {

                flush();
                items.push({ type: 'code', text: child.innerText || child.textContent || '' });
                return;
            }

            if (tag === 'TABLE') {

                flush();

                child.querySelectorAll('tr').forEach(function (row) {

                    const cells = Array.from(row.children).map(function (cell) {
                        return inlineText(cell, faces, false).replace(/\n/g, ' ').trim();
                    });

                    pushLines(items, cells.join('｜'));
                });

                return;
            }

            if (tag === 'HR') {

                flush();
                items.push({ type: 'hr' });
                return;
            }

            if (/^(SPAN|STRONG|B|EM|I|A|CODE|MARK|SMALL|SUB|SUP|S|U|BR)$/.test(tag)) {

                if (tag === 'BR') {
                    pending += '\n';
                } else if (child.classList.contains(INLINE_ICON_CLASS)) {
                    const url = inlineIconFace(child);
                    if (url) {
                        pending += faceMark(url, faces);
                    }
                } else {
                    pending += inlineText(child, faces, false);
                }

                return;
            }

            // それ以外（div、ul、ol、blockquote など）は中を見る
            flush();
            walkBlocks(child, items, faces);
        });

        flush();
    }


    /*
     * 会話を全部読み取ります。
     * 戻り値は [{ role: 'user' | 'ai', items: [...] }, ...] と faces
     */
    /*
     * 今ページに出ているメッセージの入れ物（古い順）
     */
    function getMessageRoots() {

        return outermost(
            Array.from(document.querySelectorAll(MESSAGE_SELECTORS))
                .filter(function (el) {
                    return (
                        !el.closest('#' + OVERLAY_ID) &&
                        el.getClientRects().length > 0
                    );
                })
        );
    }


    function readConversation() {

        const faces = [];

        const roots = getMessageRoots();

        const messages = [];

        roots.forEach(function (root) {

            const role = root.matches(USER_SELECTOR) ? 'user' : 'ai';
            const items = [];

            if (role === 'ai') {

                const blocks = outermost(
                    Array.from(root.querySelectorAll(MARKDOWN_SELECTORS))
                );

                // 本文がまだ無い返事（考え中の表示だけ）は出さない
                blocks.forEach(function (block) {
                    walkBlocks(block, items, faces);
                });

            } else {
                walkBlocks(root, items, faces);
            }

            // 前後の空行を落とす
            while (items.length && items[0].type === 'line' && !items[0].text.trim()) {
                items.shift();
            }

            while (
                items.length &&
                items[items.length - 1].type === 'line' &&
                !items[items.length - 1].text.trim()
            ) {
                items.pop();
            }

            if (items.length) {
                messages.push({ role: role, items: items });
            }
        });

        return { messages: messages, faces: faces };
    }


    // =========================================================
    // 縦書き用の整形
    // =========================================================

    function escapeHtml(text) {

        return String(text)
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

        html = html.replace(
            /\[\[rb:\s*(.+?)\s*&gt;\s*(.+?)\s*\]\]/g,
            function (all, base, reading) {
                return ruby(base, reading);
            }
        );

        html = html.replace(
            /[｜|]([^｜|《》]+?)《([^《》]+?)》/g,
            function (all, base, reading) {
                return ruby(base, reading);
            }
        );

        html = html.replace(
            /([\u4E00-\u9FFF\u3400-\u4DBF々〆ヶ]+)《([^《》]+?)》/g,
            function (all, base, reading) {
                return ruby(base, reading);
            }
        );

        return html;
    }


    function buildItemHtml(item, faces) {

        if (item.type === 'code') {
            return '<div class="tg-code">' + escapeHtml(item.text) + '</div>';
        }

        if (item.type === 'hr') {
            return '<div class="tg-hr"></div>';
        }

        let face = null;

        let plain = item.text.replace(FACE_MARK_RE, function (all, index) {

            if (face === null && faces[Number(index)]) {
                face = faces[Number(index)];
            }

            return '';
        });

        if (!plain.trim() && face === null) {
            return '<div class="tg-empty">\u3000</div>';
        }

        const extra = item.type === 'head' ? ' tg-head' : '';

        if (face !== null) {

            /*
             * 行頭の「名前「」の名前を取り出して、顔画像の上に出します
             */
            let nameHtml = '';

            if (CONFIG.showFaceName) {

                const speaker = splitSpeaker(plain, face);

                if (speaker) {
                    plain = speaker.rest;
                    nameHtml =
                        '<span class="tg-face-name">' + escapeHtml(speaker.name) + '</span>';
                }
            }

            return (
                '<div class="tg-line tg-face' + extra + '">' +
                nameHtml +
                '<span class="tg-face-img ' + faceClass(face) + '"></span>' +
                '<div class="tg-face-text">' + formatLine(plain) + '</div>' +
                '</div>'
            );
        }

        return '<div class="tg-line' + extra + '">' + formatLine(plain) + '</div>';
    }


    /*
     * 顔画像は、画像ごとに1回だけスタイルに登録して、クラス名で表示します。
     * （同じ画像を何十回も img に書くと、画像の中身（長い文字列）が
     *   そのぶん何十個も作られてメモリを食うため）
     */
    const faceClassMap = new Map();
    let faceStyle = null;


    function faceClass(url) {

        if (!faceClassMap.has(url)) {

            const index = faceClassMap.size;

            faceClassMap.set(url, index);

            if (!faceStyle || !document.head.contains(faceStyle)) {
                faceStyle = document.createElement('style');
                faceStyle.id = 'claude-tategaki-face-style';
                document.head.appendChild(faceStyle);
            }

            faceStyle.appendChild(document.createTextNode(
                '#' + SCROLLER_ID + ' .tg-fi-' + index +
                '{background-image:url("' + String(url).replace(/"/g, '%22') + '") !important;}\n'
            ));
        }

        return 'tg-fi-' + faceClassMap.get(url);
    }


    /*
     * 行が「名前「…」」で始まっていて、その名前の顔画像がこの画像なら、
     * 名前と残りに分けます（名前は、キャラ画像スクリプトの登録から探します）
     */
    function splitSpeaker(text, url) {

        const names = getFaceTable().list
            .filter(function (c) {
                return c.url === url;
            })
            .map(function (c) {
                return c.name;
            });

        const trimmed = text.replace(/^[\s\u3000]+/, '');

        for (const name of names) {

            if (
                trimmed.startsWith(name) &&
                CC_OPENERS.includes(trimmed.charAt(name.length))
            ) {
                return { name: name, rest: trimmed.slice(name.length) };
            }
        }

        return null;
    }


    function buildHtml(data) {

        return data.messages
            .map(function (message) {

                return (
                    '<div class="tg-msg tg-' + message.role + '">' +
                    message.items
                        .map(function (item) {
                            return buildItemHtml(item, data.faces);
                        })
                        .join('') +
                    '</div>'
                );
            })
            .join('');
    }


    // =========================================================
    // 会話の全文の取得（claude.aiの非公式の内部API）
    // =========================================================

    /*
     * claude.aiは長い会話だと、画面から遠いメッセージをページから外します。
     * そのままだと縦書きに抜けが出るので、会話の全文はclaude.aiから直接もらい、
     * 書いている途中の返事など、まだ全文に入っていない分だけページから拾います。
     */

    let api = {
        conversation: null,   // 取得した会話のID
        messages: null,       // [{ role, text }]（古い順）
        version: 0,           // 取得するたびに増える
        loading: false,
        failed: false,
        lastFetch: 0
    };

    let orgIdCache = null;


    function getCookie(name) {

        const match = document.cookie.match(
            new RegExp('(?:^|; )' + name + '=([^;]*)')
        );

        return match ? decodeURIComponent(match[1]) : null;
    }


    async function getOrgId() {

        if (orgIdCache) {
            return orgIdCache;
        }

        const fromCookie = getCookie('lastActiveOrg');

        if (fromCookie) {
            orgIdCache = fromCookie;
            return orgIdCache;
        }

        const response = await fetch('/api/organizations', { credentials: 'include' });

        if (!response.ok) {
            throw new Error('organizations ' + response.status);
        }

        const orgs = await response.json();

        if (!Array.isArray(orgs) || !orgs.length) {
            throw new Error('no organization');
        }

        const chatOrg =
            orgs.find(function (o) {
                return (o.capabilities || []).includes('chat');
            }) || orgs[0];

        orgIdCache = chatOrg.uuid;

        return orgIdCache;
    }


    /*
     * 今開いているチャットのID（チャット画面でなければ null）
     */
    function currentConversationId() {

        const match = location.pathname.match(/\/chat\/([0-9a-f-]{36})/i);

        return match ? match[1] : null;
    }


    /*
     * メッセージの本文（考え中の内容やツールの記録は除く）
     */
    function messageText(message) {

        if (Array.isArray(message.content) && message.content.length) {

            const parts = message.content
                .filter(function (block) {
                    return block && block.type === 'text' && typeof block.text === 'string';
                })
                .map(function (block) {
                    return block.text;
                });

            if (parts.length) {
                return parts.join('\n\n');
            }
        }

        return typeof message.text === 'string' ? message.text : '';
    }


    /*
     * 編集や再生成で枝分かれしている会話から、今表示している流れだけを取り出します
     */
    function currentBranch(data) {

        const list = Array.isArray(data.chat_messages) ? data.chat_messages : [];

        const byId = new Map();

        list.forEach(function (m) {
            byId.set(m.uuid, m);
        });

        const leaf = data.current_leaf_message_uuid;

        if (leaf && byId.has(leaf)) {

            const chain = [];
            const seen = new Set();

            let node = byId.get(leaf);

            while (node && !seen.has(node.uuid)) {
                seen.add(node.uuid);
                chain.push(node);
                node = byId.get(node.parent_message_uuid);
            }

            return chain.reverse();
        }

        return list.slice().sort(function (a, b) {
            return (a.index || 0) - (b.index || 0);
        });
    }


    async function fetchConversation() {

        const id = currentConversationId();

        if (!id) {
            api.conversation = null;
            api.messages = null;
            return;
        }

        if (api.loading) {
            return;
        }

        api.loading = true;
        api.lastFetch = Date.now();

        try {

            const org = await getOrgId();

            const response = await fetch(
                '/api/organizations/' + org +
                '/chat_conversations/' + id +
                '?tree=True&rendering_mode=messages&render_all_tools=true',
                { credentials: 'include' }
            );

            if (!response.ok) {
                throw new Error('conversation ' + response.status);
            }

            const data = await response.json();

            // 取得中に別のチャットへ移っていたら捨てる
            if (currentConversationId() !== id) {
                return;
            }

            const messages = currentBranch(data)
                .map(function (m) {
                    return {
                        role: m.sender === 'human' ? 'user' : 'ai',
                        text: messageText(m)
                    };
                })
                .filter(function (m) {
                    return m.text.trim();
                });

            const isFirst = api.conversation !== id || !api.messages;

            api.conversation = id;
            api.messages = messages;
            api.version++;
            api.failed = false;

            // 前に会話が増えるので、読んでいたところがずれないように
            if (!isFirst) {
                keepFromEnd = true;
            }

            lastBase = null;
            lastTail = null;
            render(false);

        } catch (error) {

            console.warn('[縦書き] 会話の全文を取得できませんでした', error);

            api.failed = true;

        } finally {

            api.loading = false;
        }
    }


    // =========================================================
    // 顔画像（全文用：キャラ画像スクリプトの登録データを読みます）
    // =========================================================

    const CC_MAP_KEY = 'claude_character_image_map';
    const CC_SETTINGS_KEY = 'claude_character_image_settings';
    const CC_OPENERS = ['「', '『', '“', '"'];
    const CC_BOUNDARY = /[\s。、！？!?」』）)…―：:]/;

    let faceTable = { at: 0, list: [], inline: true, key: '' };


    /*
     * キャラ画像スクリプトのスタイルから、番号 → 画像URL を集めます
     */
    function collectFaceUrls() {

        const urls = {};

        const scan = function (sheet) {

            let rules;

            try {
                rules = sheet.cssRules;
            } catch (_) {
                return;
            }

            if (!rules) {
                return;
            }

            Array.from(rules).forEach(function (rule) {

                const selector = rule.selectorText || '';
                const match = selector.match(/cc-inline-icon\[data-cc-id="(\d+)"\]/);

                if (!match || !rule.style) {
                    return;
                }

                const url = urlFromBackground(rule.style.backgroundImage);

                if (url) {
                    urls[match[1]] = url;
                }
            });
        };

        try {
            (document.adoptedStyleSheets || []).forEach(scan);
        } catch (_) {
        }

        Array.from(document.styleSheets).forEach(scan);

        return urls;
    }


    /*
     * 名前と画像の一覧（名前の長い順）。数秒ごとに読み直します
     */
    function getFaceTable() {

        if (Date.now() - faceTable.at < 3000) {
            return faceTable;
        }

        let map = {};
        let inline = true;

        try {
            map = JSON.parse(localStorage.getItem(CC_MAP_KEY) || '{}') || {};
        } catch (_) {
        }

        try {
            const settings = JSON.parse(localStorage.getItem(CC_SETTINGS_KEY) || '{}') || {};
            if (settings.inline === false) {
                inline = false;
            }
        } catch (_) {
        }

        // キャラ画像スクリプトと同じ順番・同じ番号の付け方
        const names = Object.keys(map).sort(function (a, b) {
            return b.length - a.length;
        });

        const urls = collectFaceUrls();

        const list = [];

        names.forEach(function (name, index) {

            const url = urls[String(index)];

            if (url) {
                list.push({ name: name, url: url });
            }
        });

        const key = inline + '|' + list.map(function (c) {
            return c.name + '=' + c.url.length + c.url.slice(-16);
        }).join(',');

        faceTable = { at: Date.now(), list: list, inline: inline, key: key };

        return faceTable;
    }


    /*
     * 行に出てくるキャラの顔を探します（行頭のセリフを優先、次に行の途中）
     */
    function findFaceInLine(text, table) {

        if (!table.list.length) {
            return '';
        }

        const lead = text.length - text.trimStart().length;

        for (let i = 0; i < text.length; i++) {

            if (!CC_OPENERS.includes(text[i])) {
                continue;
            }

            for (const c of table.list) {

                const start = i - c.name.length;

                if (start < 0 || text.slice(start, i) !== c.name) {
                    continue;
                }

                if (start > 0 && !CC_BOUNDARY.test(text[start - 1])) {
                    continue;
                }

                if (start === lead || table.inline) {
                    return c.url;
                }

                break;
            }
        }

        return '';
    }


    // =========================================================
    // マークダウン → 縦書きの行
    // =========================================================

    function stripInline(text) {

        return text
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2')
            .replace(/\\([\\`*_{}\[\]()#+\-.!|>~])/g, '$1');
    }


    function markdownToItems(text, faces, table) {

        const items = [];
        const lines = String(text).replace(/\r\n?/g, '\n').split('\n');

        let inCode = false;
        let code = [];

        const pushLine = function (body, kind, prefix) {

            const plain = stripInline(body);
            const url = findFaceInLine(plain, table);

            items.push({
                type: kind || 'line',
                text: (url ? faceMark(url, faces) : '') + (prefix || '') + plain
            });
        };

        lines.forEach(function (raw) {

            if (/^\s*(```|~~~)/.test(raw)) {

                if (inCode) {
                    items.push({ type: 'code', text: code.join('\n') });
                    code = [];
                    inCode = false;
                } else {
                    inCode = true;
                }

                return;
            }

            if (inCode) {
                code.push(raw);
                return;
            }

            const line = raw.replace(/\s+$/, '');

            if (!line.trim()) {
                return;
            }

            if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
                items.push({ type: 'hr' });
                return;
            }

            const head = line.match(/^\s*#{1,6}\s+(.*)$/);

            if (head) {
                pushLine(head[1], 'head');
                return;
            }

            if (/^\s*\|.*\|\s*$/.test(line)) {

                // 表の区切り行は飛ばす
                if (/^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/.test(line)) {
                    return;
                }

                const cells = line
                    .trim()
                    .replace(/^\||\|$/g, '')
                    .split('|')
                    .map(function (cell) {
                        return stripInline(cell.trim());
                    });

                pushLine(cells.join('｜'));
                return;
            }

            const quote = line.replace(/^\s*(>\s?)+/, '');

            const list = quote.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);

            if (list) {

                const depth = Math.floor(list[1].replace(/\t/g, '  ').length / 2);
                const mark = /^\d/.test(list[2]) ? list[2].replace(/[.)]$/, '') + '．' : '・';

                pushLine(list[3], 'line', '\u3000'.repeat(depth) + mark);
                return;
            }

            pushLine(quote);
        });

        if (inCode && code.length) {
            items.push({ type: 'code', text: code.join('\n') });
        }

        return items;
    }


    // =========================================================
    // 全文とページの組み合わせ
    // =========================================================

    let baseCache = { key: '', messages: [], faces: [], html: '' };


    /*
     * 文字だけを取り出した「見分け用」の文字列
     * （記号・数字・空白などの違いを気にせずに同じメッセージか見分けます）
     */
    function fingerprint(text) {
        return String(text)
            .replace(/[^\p{L}]/gu, '')
            .slice(0, 40);
    }


    /*
     * 見分け用の文字列が同じメッセージを指しているか
     * （片方が途中までしか無いときは、短いほうが先頭に一致すればOK）
     */
    function samePrint(a, b) {

        if (a === b) {
            return !!a;
        }

        const shorter = a.length < b.length ? a : b;
        const longer = a.length < b.length ? b : a;

        return shorter.length >= 8 && longer.startsWith(shorter);
    }


    function domMessageText(root) {

        if (root.matches(USER_SELECTOR)) {
            return root.innerText || root.textContent || '';
        }

        const blocks = outermost(Array.from(root.querySelectorAll(MARKDOWN_SELECTORS)));

        if (blocks.length) {
            return blocks.map(function (block) {
                return block.innerText || block.textContent || '';
            }).join('\n');
        }

        return root.innerText || root.textContent || '';
    }


    /*
     * 全文をもとにした部分（取得し直すか、顔の登録が変わったときだけ作り直す）
     */
    function getBase(drop) {

        drop = drop || 0;

        const table = getFaceTable();
        const key = api.conversation + '|' + api.version + '|' + table.key + '|' + drop;

        if (baseCache.key === key) {
            return baseCache;
        }

        const faces = [];

        const messages = api.messages
            .slice(0, Math.max(0, api.messages.length - drop))
            .map(function (m) {
                return { role: m.role, items: markdownToItems(m.text, faces, table) };
            })
            .filter(function (m) {
                return m.items.length;
            });

        baseCache = {
            key: key,
            messages: messages,
            faces: faces,
            html: buildHtml({ messages: messages, faces: faces })
        };

        return baseCache;
    }


    /*
     * ページのメッセージが、全文のメッセージと同じものか
     * （Claudeの返事は、本文のかたまりごとにも見比べます。
     *   考え中の表示などが先頭に混ざっていても見つけられるように）
     */
    function rootMatches(root, message) {

        if (!root || !message) {
            return false;
        }

        const role = root.matches(USER_SELECTOR) ? 'user' : 'ai';

        if (role !== message.role) {
            return false;
        }

        const print = fingerprint(message.text);

        if (samePrint(fingerprint(domMessageText(root)), print)) {
            return true;
        }

        if (role === 'ai') {

            const blocks = outermost(Array.from(root.querySelectorAll(MARKDOWN_SELECTORS)));

            return blocks.some(function (block) {
                return samePrint(fingerprint(block.innerText || block.textContent || ''), print);
            });
        }

        return false;
    }


    /*
     * 今まさに書いている途中の返事が、ページのメッセージの何番目か（無ければ -1）
     */
    function streamingRootIndex(roots) {

        const el = document.querySelector('[data-is-streaming="true"]');

        if (!el) {
            return -1;
        }

        for (let i = roots.length - 1; i >= 0; i--) {

            const root = roots[i];

            if (root === el || root.contains(el) || el.contains(root)) {
                return i;
            }
        }

        return -1;
    }


    /*
     * 全文にまだ入っていない、ページの最後のほうのメッセージ
     * （書いている途中の返事、送ったばかりのメッセージなど）
     *
     * 戻り値の drop は「全文の最後から外す数」です。
     * （生成の途中で全文を取ってしまったときや、再生成したときに、
     *   全文に入っている書きかけ・古い返事を外して、ページの返事に置き換えます）
     */
    function pageTail() {

        const roots = getMessageRoots();
        const list = api.messages;

        if (!roots.length || !list.length) {
            return { roots: [], matched: false, drop: 0 };
        }

        const n = list.length;
        const last = list[n - 1];

        // ---- 生成中：書いている途中の返事を目印にする ----

        const s = streamingRootIndex(roots);

        if (s >= 0) {

            const userIndex =
                s - 1 >= 0 && roots[s - 1].matches(USER_SELECTOR) ? s - 1 : -1;

            if (userIndex >= 0) {

                const userRoot = roots[userIndex];

                // 送ったメッセージまでは全文に入っている
                if (last.role === 'user' && rootMatches(userRoot, last)) {
                    return { roots: roots.slice(s), matched: true, drop: 0 };
                }

                // 送ったメッセージと、書きかけ（または再生成前の古い返事）が全文に入っている
                if (
                    n >= 2 &&
                    last.role === 'ai' &&
                    rootMatches(userRoot, list[n - 2]) &&
                    !rootMatches(roots[userIndex - 1], last)
                ) {
                    return { roots: roots.slice(s), matched: true, drop: 1 };
                }

                // いつもの形：全文は前の返事まで。送ったメッセージから後ろを足す
                return { roots: roots.slice(userIndex), matched: true, drop: 0 };
            }

            // 直前が自分のメッセージでないとき
            if (last.role === 'ai' && rootMatches(roots[s], last)) {
                return { roots: roots.slice(s), matched: true, drop: 1 };
            }

            return { roots: roots.slice(s), matched: true, drop: 0 };
        }

        // ---- 生成していないとき：全文の最後と同じメッセージを探す ----

        for (let i = roots.length - 1; i >= 0; i--) {

            if (rootMatches(roots[i], last)) {
                return { roots: roots.slice(i + 1), matched: true, drop: 0 };
            }
        }

        return { roots: [], matched: false, drop: 0 };
    }


    function readRootItems(root, faces) {

        const items = [];

        if (!root.matches(USER_SELECTOR)) {

            const blocks = outermost(Array.from(root.querySelectorAll(MARKDOWN_SELECTORS)));

            blocks.forEach(function (block) {
                walkBlocks(block, items, faces);
            });

            /*
             * 本文のかたまりが見つからないとき（書いている途中で
             * Claude側の入れ物の名前が違うときなど）は、返事全体から読みます
             */
            if (!blocks.length) {
                walkBlocks(root, items, faces);
            }

            return trimItems(items);
        }

        walkBlocks(root, items, faces);

        return trimItems(items);
    }


    function trimItems(items) {

        while (items.length && items[0].type === 'line' && !items[0].text.trim()) {
            items.shift();
        }

        while (
            items.length &&
            items[items.length - 1].type === 'line' &&
            !items[items.length - 1].text.trim()
        ) {
            items.pop();
        }

        return items;
    }


    let tailMismatchSince = 0;


    /*
     * 表示する会話を組み立てます。
     * 全文が取れていれば「全文 ＋ ページの最後の新しい分」、
     * 取れていなければ、今まで通りページに出ている分だけ
     */
    function composeConversation() {

        const id = currentConversationId();

        if (!id || !api.messages || api.conversation !== id) {

            const page = readConversation();

            return {
                baseHtml: '',
                baseCount: 0,
                tail: page.messages,
                faces: page.faces
            };
        }

        const tail = pageTail();

        const base = getBase(tail.drop);
        const faces = base.faces.slice();
        const messages = [];

        tail.roots.forEach(function (root) {

            const items = readRootItems(root, faces);

            if (items.length) {
                messages.push({
                    role: root.matches(USER_SELECTOR) ? 'user' : 'ai',
                    items: items
                });
            }
        });

        /*
         * ページの最新と全文の最後が合わないまま（編集・再生成・別の端末で続きを書いたなど）
         * しばらく経ったら、全文を取り直す
         */
        if (!tail.matched && !isStreaming() && getMessageRoots().length) {

            if (!tailMismatchSince) {
                tailMismatchSince = Date.now();
            } else if (
                Date.now() - tailMismatchSince > 4000 &&
                Date.now() - api.lastFetch > 15000
            ) {
                tailMismatchSince = 0;
                fetchConversation();
            }

        } else {
            tailMismatchSince = 0;
        }

        return {
            baseHtml: base.html,
            baseCount: base.messages.length,
            tail: messages,
            faces: faces
        };
    }


    function isStreaming() {
        return !!document.querySelector('[data-is-streaming="true"]');
    }


    /*
     * 全文に合わせて位置を保つための目印（取得し直したときに使います）
     */
    let keepFromEnd = false;


    // =========================================================
    // パネル
    // =========================================================

    let overlay = null;
    let scroller = null;

    let lastBase = null;
    let lastTail = null;
    let wasEmpty = true;
    let closed = !loadEnabled();

    let renderTimer = null;


    function buildPanel() {

        if (overlay && document.body.contains(overlay)) {
            return;
        }

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.classList.add(EMPTY_CLASS);

        scroller = document.createElement('div');
        scroller.id = SCROLLER_ID;

        keepHeight();

        // 全文の部分（めったに変わらない）と、ページから拾う最新の部分（生成中に変わる）を分けて、
        // 生成中は最新の部分だけ作り直します
        scroller.innerHTML =
            '<div class="tg-part tg-base"></div>' +
            '<div class="tg-part tg-tail"></div>';

        overlay.appendChild(scroller);

        document.body.appendChild(overlay);

        lastBase = null;
            lastTail = null;
        wasEmpty = true;
    }


    function isShown() {
        return (
            !closed &&
            overlay &&
            document.body.contains(overlay) &&
            !overlay.classList.contains(EMPTY_CLASS)
        );
    }


    /*
     * 縦書き（右から左）では、いちばん左がいちばん最後（最新）です
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

        if (closed) {
            return;
        }

        buildPanel();

        const data = composeConversation();
        const empty = data.baseCount + data.tail.length === 0;

        // メッセージが無い画面では引っ込める
        overlay.classList.toggle(EMPTY_CLASS, empty);

        if (empty) {
            wasEmpty = true;
            return;
        }

        // 引っ込んでいた状態から出てきたときは最新から
        if (wasEmpty) {
            wasEmpty = false;
            force = true;
        }

        const baseHtml = data.baseHtml;
        const tailHtml = buildHtml({ messages: data.tail, faces: data.faces });

        if (!force && baseHtml === lastBase && tailHtml === lastTail) {
            return;
        }

        const follow = force || isAtEnd();

        /*
         * いつもは「いちばん前（右端）からの位置」を保ちます。
         * 全文を取得して前に会話が増えたときは
         * 「いちばん最後（左端）からの位置」を保って、
         * 読んでいたところがずれないようにします
         */
        const fromStart = scroller.scrollLeft;
        const fromEnd = maxScroll() - Math.abs(scroller.scrollLeft);
        const anchorEnd = keepFromEnd;
        keepFromEnd = false;

        const baseEl = scroller.querySelector('.tg-base');
        const tailEl = scroller.querySelector('.tg-tail');

        scroller.style.setProperty('--tg-face-size', faceSize() + 'px');
        scroller.style.setProperty(
            '--tg-name-h',
            CONFIG.showFaceName &&
                (baseHtml.indexOf('tg-face-name') >= 0 || tailHtml.indexOf('tg-face-name') >= 0)
                ? Math.round(CONFIG.faceNameSize * 1.5) + 'px'
                : '0px'
        );
        scroller.classList.toggle('tg-has-face', data.faces.length > 0);

        if (baseHtml !== lastBase) {
            baseEl.innerHTML = baseHtml;
        }

        if (tailHtml !== lastTail) {
            tailEl.innerHTML = tailHtml;
        }

        lastBase = baseHtml;
        lastTail = tailHtml;

        requestAnimationFrame(function () {

            if (follow) {
                scrollToEnd();
            } else if (anchorEnd) {
                scroller.scrollLeft = -Math.max(0, maxScroll() - fromEnd);
            } else {
                scroller.scrollLeft = fromStart;
            }
        });
    }


    /*
     * 作り直しの予約。
     * 生成中は変化が止まらないので、待ち時間ごとに必ず1回は作り直します
     */
    function scheduleRender() {

        if (closed || renderTimer) {
            return;
        }

        renderTimer = setTimeout(function () {
            renderTimer = null;
            render(false);
        }, CONFIG.renderDelay);
    }


    function saveEnabled(on) {

        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (_) {
        }
    }


    /*
     * はじめて使うときはオン
     */
    function loadEnabled() {

        try {
            return localStorage.getItem(STORAGE_KEY) !== '0';
        } catch (_) {
            return true;
        }
    }


    /*
     * オフ：縦書きパネルを外して横書きに戻ります
     */
    function closePanel() {

        closed = true;
        saveEnabled(false);

        clearTimeout(renderTimer);
        renderTimer = null;

        if (overlay) {
            overlay.remove();
        }

        overlay = null;
        scroller = null;

        updateToggle();
        ensureTocButton();
    }


    /*
     * オン：縦書きパネルを出して、最新から表示します
     */
    function openPanel() {

        closed = false;
        saveEnabled(true);

        buildPanel();
        render(true);

        // 閉じている間に別のチャットへ移っていたら、全文を取り直す
        if (currentConversationId() && api.conversation !== currentConversationId()) {
            fetchConversation();
        }

        updateToggle();
        ensureTocButton();
    }


    // =========================================================
    // キーボードが出ても縦書きの高さを変えない
    // =========================================================

    /*
     * スマホでキーボードが出ると画面の高さが縮んで、縦書きが短く組み直されてしまいます。
     * キーボードが出ていないときの高さを覚えておき、キーボードで大きく縮んだときは
     * その高さのままにします（アドレスバーの出し入れくらいの小さな変化はそのまま合わせます）
     */
    const KEYBOARD_MIN = 150;

    let fullHeight = window.innerHeight;
    let lastWidth = window.innerWidth;


    function keepHeight() {

        const width = window.innerWidth;
        const height = window.innerHeight;

        // 画面の向きが変わったら、覚えている高さを取り直す
        if (Math.abs(width - lastWidth) > 40) {
            lastWidth = width;
            fullHeight = height;
        } else if (height >= fullHeight - KEYBOARD_MIN) {
            // キーボードではない（アドレスバーなど）小さな変化は、そのまま合わせる
            fullHeight = height;
        }

        if (!overlay) {
            return;
        }

        if (height < fullHeight - KEYBOARD_MIN) {
            // キーボードが出ている：キーボードが出る前の高さのまま
            overlay.style.setProperty('height', fullHeight + 'px', 'important');
            overlay.style.setProperty('bottom', 'auto', 'important');
        } else {
            overlay.style.removeProperty('height');
            overlay.style.removeProperty('bottom');
        }
    }


    window.addEventListener('resize', keepHeight);

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', keepHeight);
    }


    // =========================================================
    // 目次（生成の先頭へジャンプ）
    // =========================================================

    /*
     * Claudeの返事（生成）ごとの先頭を一覧にして、選ぶとそこへ移動します。
     * 開くのは「Claude ボタンまとめメニュー」の「目次」から
     * （縦書き中だけ、隠しボタン #claude-tategaki-toc が置かれます）
     */
    const TOC_BUTTON_ID = 'claude-tategaki-toc';
    const TOC_PANEL_ID = 'claude-tategaki-toc-panel';

    const tocStyle = document.createElement('style');

    tocStyle.textContent = `

        #${TOC_PANEL_ID} {
            position: fixed !important;
            right: 12px !important;
            left: 12px !important;
            top: 12px !important;
            bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
            /* 縦書きパネルより上 */
            z-index: 2147483642 !important;
            display: flex !important;
            flex-direction: column !important;
            max-width: 520px !important;
            margin: 0 auto !important;
            border-radius: 14px !important;
            background: #2b2a27 !important;
            color: #f3f1ec !important;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45) !important;
            font-family: system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif !important;
            overflow: hidden !important;
        }

        #${TOC_PANEL_ID} .toc-head {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 12px 14px !important;
            font-size: 16px !important;
            font-weight: bold !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
        }

        #${TOC_PANEL_ID} .toc-close {
            border: none !important;
            background: rgba(255, 255, 255, 0.12) !important;
            color: #f3f1ec !important;
            border-radius: 8px !important;
            padding: 6px 12px !important;
            font-size: 14px !important;
        }

        #${TOC_PANEL_ID} .toc-list {
            flex: 1 1 auto !important;
            overflow-y: auto !important;
            padding: 6px !important;
        }

        #${TOC_PANEL_ID} .toc-item {
            display: block !important;
            width: 100% !important;
            padding: 10px 12px !important;
            margin: 0 0 4px 0 !important;
            border: none !important;
            border-radius: 10px !important;
            background: transparent !important;
            color: inherit !important;
            text-align: left !important;
            box-sizing: border-box !important;
        }

        #${TOC_PANEL_ID} .toc-item:active {
            background: rgba(255, 255, 255, 0.12) !important;
        }

        #${TOC_PANEL_ID} .toc-item.toc-current {
            background: rgba(208, 119, 47, 0.35) !important;
        }

        #${TOC_PANEL_ID} .toc-no {
            display: inline-block !important;
            min-width: 2.6em !important;
            color: #d0772f !important;
            font-weight: bold !important;
            font-size: 13px !important;
        }

        #${TOC_PANEL_ID} .toc-user {
            display: block !important;
            margin-top: 2px !important;
            font-size: 12px !important;
            color: #b9b4aa !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }

        #${TOC_PANEL_ID} .toc-text {
            display: block !important;
            margin-top: 2px !important;
            font-size: 14px !important;
            line-height: 1.4 !important;
            overflow: hidden !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
        }

        #${TOC_PANEL_ID} .toc-empty {
            padding: 16px !important;
            color: #b9b4aa !important;
            font-size: 14px !important;
        }
    `;

    document.head.appendChild(tocStyle);


    /*
     * 縦書きの1つのメッセージの、最初の行の文字（ルビの読みは除く）
     */
    function firstLineText(message, max) {

        const line = message.querySelector('.tg-line');

        if (!line) {
            return '';
        }

        const clone = line.cloneNode(true);

        clone.querySelectorAll('rt, .tg-face-name').forEach(function (el) {
            el.remove();
        });

        const nameEl = line.querySelector('.tg-face-name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        let text = (clone.textContent || '').replace(/\s+/g, ' ').trim();

        if (name) {
            text = name + text;
        }

        return text.length > max ? text.slice(0, max) + '…' : text;
    }


    /*
     * 今、縦書きの画面のいちばん右（読んでいるところ）にある返事
     */
    function currentAiMessage(list) {

        if (!scroller) {
            return null;
        }

        const box = scroller.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(scroller).paddingRight) || 0;

        for (const message of list) {
            if (message.getBoundingClientRect().left < box.right - pad) {
                return message;
            }
        }

        return null;
    }


    /*
     * その返事の先頭が、縦書きの画面の右端に来るように移動します
     */
    function jumpToMessage(message) {

        if (!scroller || !message) {
            return;
        }

        const box = scroller.getBoundingClientRect();
        const rect = message.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(scroller).paddingRight) || 0;

        scroller.scrollLeft += rect.right - (box.right - pad);
    }


    function closeToc() {

        const panel = document.getElementById(TOC_PANEL_ID);

        if (panel) {
            panel.remove();
        }
    }


    function openToc() {

        closeToc();

        if (closed || !scroller) {
            return;
        }

        const allMessages = Array.from(scroller.querySelectorAll('.tg-msg'));
        const ais = allMessages.filter(function (m) {
            return m.classList.contains('tg-ai');
        });
        const current = currentAiMessage(ais);

        const panel = document.createElement('div');
        panel.id = TOC_PANEL_ID;

        const head = document.createElement('div');
        head.className = 'toc-head';

        const title = document.createElement('span');
        title.textContent = '目次（生成の先頭）';

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'toc-close';
        close.textContent = '閉じる';
        close.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeToc();
        });

        head.appendChild(title);
        head.appendChild(close);

        const list = document.createElement('div');
        list.className = 'toc-list';

        let currentItem = null;

        ais.forEach(function (message, index) {

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'toc-item';

            const no = document.createElement('span');
            no.className = 'toc-no';
            no.textContent = (index + 1) + '.';

            item.appendChild(no);

            // その返事の前の、あなたのメッセージ
            const prev = allMessages[allMessages.indexOf(message) - 1];

            if (prev && prev.classList.contains('tg-user')) {

                const user = document.createElement('span');
                user.className = 'toc-user';
                user.textContent = 'あなた：' + firstLineText(prev, 40);

                item.appendChild(user);
            }

            const text = document.createElement('span');
            text.className = 'toc-text';
            text.textContent = firstLineText(message, 60) || '（本文なし）';

            item.appendChild(text);

            if (message === current) {
                item.classList.add('toc-current');
                currentItem = item;
            }

            item.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                closeToc();
                jumpToMessage(message);
            });

            list.appendChild(item);
        });

        if (!ais.length) {

            const empty = document.createElement('div');
            empty.className = 'toc-empty';
            empty.textContent = 'まだ返事がありません';

            list.appendChild(empty);
        }

        panel.appendChild(head);
        panel.appendChild(list);

        document.body.appendChild(panel);

        // 今読んでいるところを、一覧のまん中あたりに
        const target = currentItem || list.lastElementChild;

        if (target && target.scrollIntoView) {
            target.scrollIntoView({ block: 'center' });
        }
    }


    /*
     * 目次の外を押したら閉じる
     */
    document.addEventListener('pointerdown', function (event) {

        const panel = document.getElementById(TOC_PANEL_ID);

        if (!panel) {
            return;
        }

        const target = event.target;

        if (target && target.closest && target.closest('#' + TOC_PANEL_ID)) {
            return;
        }

        closeToc();

    }, true);


    /*
     * 縦書き中だけ、ボタンまとめメニューから押される隠しボタンを置きます
     */
    function ensureTocButton() {

        let button = document.getElementById(TOC_BUTTON_ID);

        if (closed) {

            if (button) {
                button.remove();
            }

            closeToc();
            return;
        }

        if (!button) {

            button = document.createElement('button');
            button.id = TOC_BUTTON_ID;
            button.type = 'button';
            button.textContent = '目次';
            button.style.setProperty('display', 'none', 'important');

            button.addEventListener('click', function (event) {
                event.preventDefault();

                if (document.getElementById(TOC_PANEL_ID)) {
                    closeToc();
                } else {
                    openToc();
                }
            });

            document.body.appendChild(button);
        }
    }


    // =========================================================
    // オン・オフボタン
    // =========================================================

    function ensureToggle() {

        let button = document.getElementById(TOGGLE_ID);

        if (!button) {

            button = document.createElement('button');
            button.id = TOGGLE_ID;
            button.type = 'button';

            button.addEventListener('click', function (event) {

                event.preventDefault();
                event.stopPropagation();

                if (closed) {
                    openPanel();
                } else {
                    closePanel();
                }
            });

            document.body.appendChild(button);
        }

        updateToggle();
        ensureTocButton();
    }


    /*
     * ボタンには「押すとどうなるか」を出します
     * （縦書き中は「横」、横書き中は「縦」）
     */
    function updateToggle() {

        const button = document.getElementById(TOGGLE_ID);

        if (!button) {
            return;
        }

        const text = closed ? '縦' : '横';

        if (button.textContent !== text) {
            button.textContent = text;
        }

        button.setAttribute(
            'aria-label',
            closed ? '縦書きにする' : '横書きに戻す'
        );
    }


    // =========================================================
    // 会話の変化を見張る
    // =========================================================

    const observer = new MutationObserver(function (mutations) {

        // 縦書きパネル自身とオン・オフボタンの書き換えは無視
        const toggle = document.getElementById(TOGGLE_ID);

        const outside = mutations.some(function (m) {
            return (
                (!overlay || !overlay.contains(m.target)) &&
                (!toggle || !toggle.contains(m.target))
            );
        });

        if (outside) {
            scheduleRender();
        }
    });


    let lastUrl = location.href;


    // =========================================================
    // 開始
    // =========================================================

    function init() {

        ensureToggle();

        if (!closed) {
            buildPanel();
        }

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        render(true);

        fetchConversation();

        let wasStreaming = isStreaming();

        setInterval(function () {

            ensureToggle();

            if (closed) {
                return;
            }

            // 別のチャットに移ったら、全文を取り直して最新から表示し直す
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                lastBase = null;
            lastTail = null;
                wasEmpty = true;
                tailMismatchSince = 0;
                fetchConversation();
            }

            // 生成が終わったら、少し待ってから全文を取り直す
            const streaming = isStreaming();

            if (wasStreaming && !streaming) {
                setTimeout(fetchConversation, CONFIG.refetchDelay);
            }

            wasStreaming = streaming;

            render(false);

        }, CONFIG.pollInterval);
    }


    init();

})();
