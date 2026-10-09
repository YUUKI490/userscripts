
// ==UserScript==
// @name         AIのべりすと キャラブック一括登録
// @namespace    ainovel-character-book-bulk
// @version      1.0.0
// @description  テキスト貼り付け・TXT読込からキャラクターブックを一括追加
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

    const BUTTON_ID =
        'ainovel-wi-bulk-open';

    const OVERLAY_ID =
        'ainovel-wi-bulk-overlay';

    const PANEL_ID =
        'ainovel-wi-bulk-panel';

    const TEXTAREA_ID =
        'ainovel-wi-bulk-textarea';

    const RESULT_ID =
        'ainovel-wi-bulk-result';

    const FILE_INPUT_ID =
        'ainovel-wi-bulk-file';

    const REGISTER_BUTTON_ID =
        'ainovel-wi-bulk-register';

    const CLOSE_BUTTON_ID =
        'ainovel-wi-bulk-close';

    const FILE_BUTTON_ID =
        'ainovel-wi-bulk-file-button';


    // =========================================================
    // CSS
    // =========================================================

    const style =
        document.createElement('style');

    style.textContent = `

        #${BUTTON_ID} {
            position: fixed !important;
            right: 12px !important;
            bottom: 238px !important;

            width: 46px !important;
            height: 46px !important;

            z-index: 2147483646 !important;

            border: 1px solid #777 !important;
            border-radius: 9px !important;

            background: rgba(255,255,255,.96) !important;
            color: #222 !important;

            font-size: 21px !important;

            box-shadow:
                0 2px 10px rgba(0,0,0,.28) !important;

            display: flex !important;
            align-items: center !important;
            justify-content: center !important;

            padding: 0 !important;

            cursor: pointer !important;

            user-select: none !important;
            -webkit-user-select: none !important;

            touch-action: manipulation !important;
        }


        #${BUTTON_ID}:active {
            transform: scale(.94) !important;
            background: #e8e8e8 !important;
        }


        #${OVERLAY_ID} {
            position: fixed !important;

            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;

            z-index: 2147483647 !important;

            background:
                rgba(0,0,0,.55) !important;

            display: none;

            align-items: center !important;
            justify-content: center !important;

            padding: 14px !important;

            box-sizing: border-box !important;
        }


        #${OVERLAY_ID}.active {
            display: flex !important;
        }


        #${PANEL_ID} {
            width: min(94vw, 720px) !important;
            max-height: 92vh !important;

            background: #fff !important;
            color: #222 !important;

            border-radius: 14px !important;

            box-shadow:
                0 6px 30px rgba(0,0,0,.35) !important;

            padding: 16px !important;

            box-sizing: border-box !important;

            overflow-y: auto !important;

            font-size: 15px !important;
        }


        #${PANEL_ID} * {
            box-sizing: border-box !important;
        }


        .ainovel-wi-bulk-title {
            font-size: 20px !important;
            font-weight: bold !important;

            margin-bottom: 12px !important;
        }


        .ainovel-wi-bulk-desc {
            font-size: 13px !important;
            line-height: 1.55 !important;

            margin-bottom: 10px !important;

            color: #555 !important;
        }


        #${TEXTAREA_ID} {
            width: 100% !important;
            min-height: 320px !important;

            padding: 10px !important;

            resize: vertical !important;

            border: 1px solid #999 !important;
            border-radius: 8px !important;

            background: #fff !important;
            color: #111 !important;

            font-size: 15px !important;
            line-height: 1.5 !important;

            font-family:
                sans-serif !important;
        }


        .ainovel-wi-bulk-buttons {
            display: flex !important;
            gap: 8px !important;

            flex-wrap: wrap !important;

            margin-top: 12px !important;
        }


        .ainovel-wi-bulk-buttons button {
            min-height: 42px !important;

            padding: 8px 14px !important;

            border: 1px solid #777 !important;
            border-radius: 8px !important;

            background: #f6f6f6 !important;
            color: #222 !important;

            font-size: 15px !important;
            font-weight: bold !important;

            cursor: pointer !important;
        }


        #${REGISTER_BUTTON_ID} {
            background:
                #dff3e3 !important;
        }


        #${CLOSE_BUTTON_ID} {
            margin-left: auto !important;
        }


        #${RESULT_ID} {
            display: none;

            margin-top: 12px !important;

            padding: 10px !important;

            border-radius: 8px !important;

            background: #f4f4f4 !important;

            line-height: 1.55 !important;

            white-space: pre-wrap !important;

            word-break: break-word !important;
        }


        #${RESULT_ID}.show {
            display: block !important;
        }


        #${FILE_INPUT_ID} {
            display: none !important;
        }

    `;

    document.head.appendChild(style);


    // =========================================================
    // ユーティリティ
    // =========================================================

    function wait(ms) {
        return new Promise(
            resolve => setTimeout(resolve, ms)
        );
    }


    function setNativeValue(
        element,
        value
    ) {

        if (!element) {
            return;
        }

        const prototype =
            Object.getPrototypeOf(element);

        const descriptor =
            Object.getOwnPropertyDescriptor(
                prototype,
                'value'
            );

        if (
            descriptor &&
            descriptor.set
        ) {

            descriptor.set.call(
                element,
                value
            );

        }
        else {

            element.value =
                value;

        }


        element.dispatchEvent(
            new Event(
                'input',
                {
                    bubbles: true
                }
            )
        );


        element.dispatchEvent(
            new Event(
                'change',
                {
                    bubbles: true
                }
            )
        );

    }


    // =========================================================
    // 入力形式解析
    // =========================================================

    function parseCharacters(
        text
    ) {

        const normalized =
            String(
                text || ''
            )
            .replace(
                /\r\n/g,
                '\n'
            )
            .replace(
                /\r/g,
                '\n'
            );


        const rawBlocks =
            normalized
                .split(
                    /^\s*===CHARACTER===\s*$/mi
                )
                .map(
                    block => block.trim()
                )
                .filter(Boolean);


        const results =
            [];


        for (
            let index = 0;
            index < rawBlocks.length;
            index++
        ) {

            const block =
                rawBlocks[index];


            const lines =
                block.split('\n');


            let tag =
                '';

            let entry =
                '';

            let readingEntry =
                false;


            for (
                let i = 0;
                i < lines.length;
                i++
            ) {

                const line =
                    lines[i];


                if (
                    /^TAG\s*=/i.test(
                        line
                    )
                ) {

                    tag =
                        line.replace(
                            /^TAG\s*=/i,
                            ''
                        ).trim();

                    readingEntry =
                        false;

                    continue;

                }


                if (
                    /^ENTRY\s*=/i.test(
                        line
                    )
                ) {

                    entry =
                        line.replace(
                            /^ENTRY\s*=/i,
                            ''
                        );

                    readingEntry =
                        true;

                    continue;

                }


                if (
                    readingEntry
                ) {

                    entry +=
                        (
                            entry
                                ? '\n'
                                : ''
                        ) +
                        line;

                }

            }


            entry =
                entry.trim();


            if (
                !tag &&
                !entry
            ) {

                continue;

            }


            results.push({
                index:
                    index + 1,

                tag:
                    tag,

                entry:
                    entry
            });

        }


        return results;

    }


    // =========================================================
    // 現在使用中のキャラブック番号
    // =========================================================

    function getUsedIndexes() {

        const areas =
            Array.from(
                document.querySelectorAll(
                    '[id^="wiarea"]'
                )
            );


        const indexes =
            [];


        for (
            const area
            of areas
        ) {

            const match =
                area.id.match(
                    /^wiarea(\d+)$/
                );


            if (!match) {
                continue;
            }


            const index =
                Number(
                    match[1]
                );


            const tagInput =
                document.getElementById(
                    'witag' +
                    index
                );


            const entryInput =
                document.getElementById(
                    'wientry' +
                    index
                );


            if (
                !tagInput ||
                !entryInput
            ) {

                continue;

            }


            const visible =
                window
                    .getComputedStyle(
                        area
                    )
                    .display !==
                'none';


            const hasContent =
                !!(
                    tagInput.value.trim() ||
                    entryInput.value.trim()
                );


            /*
             * 表示中 または 内容ありなら
             * 使用スロットと判断
             */
            if (
                visible ||
                hasContent
            ) {

                indexes.push(
                    index
                );

            }

        }


        indexes.sort(
            (a, b) =>
                a - b
        );


        return indexes;

    }


    // =========================================================
    // 次の空き番号取得
    // =========================================================

    function findFirstUnusedIndex() {

        const areas =
            Array.from(
                document.querySelectorAll(
                    '[id^="wiarea"]'
                )
            );


        const indexes =
            areas
                .map(
                    area => {

                        const match =
                            area.id.match(
                                /^wiarea(\d+)$/
                            );

                        return match
                            ? Number(match[1])
                            : null;

                    }
                )
                .filter(
                    value =>
                        value !== null
                )
                .sort(
                    (a, b) =>
                        a - b
                );


        for (
            const index
            of indexes
        ) {

            const area =
                document.getElementById(
                    'wiarea' +
                    index
                );


            const tag =
                document.getElementById(
                    'witag' +
                    index
                );


            const entry =
                document.getElementById(
                    'wientry' +
                    index
                );


            if (
                !area ||
                !tag ||
                !entry
            ) {

                continue;

            }


            const visible =
                window
                    .getComputedStyle(
                        area
                    )
                    .display !==
                'none';


            const empty =
                !tag.value.trim() &&
                !entry.value.trim();


            if (
                !visible &&
                empty
            ) {

                return index;

            }

        }


        return null;

    }


    // =========================================================
    // 最後の使用番号
    // =========================================================

    function getLastUsedIndex() {

        const used =
            getUsedIndexes();


        if (!used.length) {

            return 0;

        }


        return used[
            used.length - 1
        ];

    }


    // =========================================================
    // 新規スロット作成
    // =========================================================

    async function createNewSlot() {

        const beforeUnused =
            findFirstUnusedIndex();


        /*
         * 未使用スロットが既に見えている場合でも
         * AIのべりすと本来の追加処理を使う
         */
        const lastUsed =
            getLastUsedIndex();


        if (
            typeof window.InsertWI !==
            'function'
        ) {

            throw new Error(
                'InsertWI() が見つかりません。'
            );

        }


        window.InsertWI(
            lastUsed
        );


        /*
         * DOM / UI更新待ち
         */
        await wait(
            100
        );


        /*
         * InsertWI後、
         * 新しく表示された空きスロットを探す
         */
        const areas =
            Array.from(
                document.querySelectorAll(
                    '[id^="wiarea"]'
                )
            );


        const candidates =
            [];


        for (
            const area
            of areas
        ) {

            const match =
                area.id.match(
                    /^wiarea(\d+)$/
                );


            if (!match) {
                continue;
            }


            const index =
                Number(
                    match[1]
                );


            const tag =
                document.getElementById(
                    'witag' +
                    index
                );


            const entry =
                document.getElementById(
                    'wientry' +
                    index
                );


            if (
                !tag ||
                !entry
            ) {

                continue;

            }


            const visible =
                window
                    .getComputedStyle(
                        area
                    )
                    .display !==
                'none';


            const empty =
                !tag.value.trim() &&
                !entry.value.trim();


            if (
                visible &&
                empty
            ) {

                candidates.push(
                    index
                );

            }

        }


        candidates.sort(
            (a, b) =>
                a - b
        );


        /*
         * 追加前に非表示だった番号を優先
         */
        if (
            beforeUnused !== null &&
            candidates.includes(
                beforeUnused
            )
        ) {

            return beforeUnused;

        }


        /*
         * 基本は最後の使用番号より後
         */
        const after =
            candidates.find(
                index =>
                    index > lastUsed
            );


        if (
            after !== undefined
        ) {

            return after;

        }


        /*
         * 最後の保険
         */
        if (
            candidates.length
        ) {

            return candidates[
                candidates.length - 1
            ];

        }


        throw new Error(
            '新しいキャラブックスロットを特定できませんでした。'
        );

    }


    // =========================================================
    // 1件登録
    // =========================================================

    async function registerOne(
        character
    ) {

        if (
            !character.tag
        ) {

            throw new Error(
                'TAGが空です'
            );

        }


        if (
            !character.entry
        ) {

            throw new Error(
                'ENTRYが空です'
            );

        }


        if (
            character.tag.length >
            500
        ) {

            throw new Error(
                'TAGが500文字を超えています'
            );

        }


        if (
            character.entry.length >
            3000
        ) {

            throw new Error(
                'ENTRYが3000文字を超えています'
            );

        }


        const index =
            await createNewSlot();


        const tagInput =
            document.getElementById(
                'witag' +
                index
            );


        const entryInput =
            document.getElementById(
                'wientry' +
                index
            );


        if (
            !tagInput ||
            !entryInput
        ) {

            throw new Error(
                '入力欄が見つかりません'
            );

        }


        setNativeValue(
            tagInput,
            character.tag
        );


        setNativeValue(
            entryInput,
            character.entry
        );


        /*
         * AIのべりすと側の保存処理
         */
        if (
            typeof window.WriteWIIntoStorage ===
            'function'
        ) {

            window.WriteWIIntoStorage();

        }


        await wait(
            80
        );


        return index;

    }


    // =========================================================
    // 一括登録
    // =========================================================

    async function registerAll() {

        const textarea =
            document.getElementById(
                TEXTAREA_ID
            );


        const result =
            document.getElementById(
                RESULT_ID
            );


        if (
            !textarea ||
            !result
        ) {

            return;

        }


        const characters =
            parseCharacters(
                textarea.value
            );


        result.classList.add(
            'show'
        );


        if (
            !characters.length
        ) {

            result.textContent =
                '登録データが見つかりません。\n\n' +
                '===CHARACTER===\n' +
                'TAG=キャラ名 タグ\n' +
                'ENTRY=説明本文\n\n' +
                'の形式で入力してください。';

            return;

        }


        const button =
            document.getElementById(
                REGISTER_BUTTON_ID
            );


        if (button) {

            button.disabled =
                true;

            button.textContent =
                '登録中…';

        }


        const messages =
            [];


        let success =
            0;

        let failed =
            0;


        result.textContent =
            `登録予定：${characters.length}件\n登録を開始します…`;


        for (
            let i = 0;
            i < characters.length;
            i++
        ) {

            const character =
                characters[i];


            try {

                const index =
                    await registerOne(
                        character
                    );


                success++;


                messages.push(
                    `✓ ${i + 1}件目 → WI ${index}：${character.tag}`
                );

            }
            catch (
                error
            ) {

                failed++;


                messages.push(
                    `✗ ${i + 1}件目：${error.message}`
                );

            }


            result.textContent =
                `登録予定：${characters.length}件\n` +
                `成功：${success}件\n` +
                `失敗：${failed}件\n\n` +
                messages.join(
                    '\n'
                );


            /*
             * 連続操作を少しゆっくりにして
             * AIのべりすと側の処理時間を確保
             */
            await wait(
                120
            );

        }


        if (button) {

            button.disabled =
                false;

            button.textContent =
                '一括登録';

        }


        /*
         * 最後にもう一度保存処理
         */
        if (
            typeof window.WriteWIIntoStorage ===
            'function'
        ) {

            try {

                window.WriteWIIntoStorage();

            }
            catch (
                error
            ) {

                console.warn(
                    '[WI Bulk] final save error',
                    error
                );

            }

        }


        result.textContent =
            `完了しました。\n\n` +
            `登録予定：${characters.length}件\n` +
            `成功：${success}件\n` +
            `失敗：${failed}件\n\n` +
            messages.join(
                '\n'
            );

    }


    // =========================================================
    // TXT読み込み
    // =========================================================

    function readFile(
        file
    ) {

        return new Promise(
            function (
                resolve,
                reject
            ) {

                const reader =
                    new FileReader();


                reader.onload =
                    function () {

                        resolve(
                            String(
                                reader.result ||
                                ''
                            )
                        );

                    };


                reader.onerror =
                    function () {

                        reject(
                            reader.error
                        );

                    };


                reader.readAsText(
                    file,
                    'UTF-8'
                );

            }
        );

    }


    // =========================================================
    // UI作成
    // =========================================================

    function createUI() {

        if (
            document.getElementById(
                BUTTON_ID
            )
        ) {

            return;

        }


        // -----------------------------------------------------
        // 開くボタン
        // -----------------------------------------------------

        const openButton =
            document.createElement(
                'button'
            );


        openButton.id =
            BUTTON_ID;

        openButton.type =
            'button';

        openButton.textContent =
            '📚';

        openButton.title =
            'キャラブック一括登録';


        document.body.appendChild(
            openButton
        );


        // -----------------------------------------------------
        // オーバーレイ
        // -----------------------------------------------------

        const overlay =
            document.createElement(
                'div'
            );


        overlay.id =
            OVERLAY_ID;


        const panel =
            document.createElement(
                'div'
            );


        panel.id =
            PANEL_ID;


        panel.innerHTML = `

            <div class="ainovel-wi-bulk-title">
                📚 キャラブック一括登録
            </div>

            <div class="ainovel-wi-bulk-desc">

                形式：

                <br><br>

                <b>===CHARACTER===</b><br>
                <b>TAG=</b>紅林焔 焔 紅林<br>
                <b>ENTRY=</b>紅林焔：キャラクター説明……

                <br><br>

                ENTRYは複数行対応です。
                次の ===CHARACTER=== まで本文として読み込みます。

            </div>

            <textarea
                id="${TEXTAREA_ID}"
                placeholder="===CHARACTER===
TAG=紅林焔 焔 紅林
ENTRY=紅林焔：キャラクター説明……

===CHARACTER===
TAG=蒼海静流 静流 蒼海
ENTRY=蒼海静流：キャラクター説明……"
            ></textarea>

            <input
                type="file"
                id="${FILE_INPUT_ID}"
                accept=".txt,text/plain"
            >

            <div class="ainovel-wi-bulk-buttons">

                <button
                    type="button"
                    id="${FILE_BUTTON_ID}"
                >
                    TXTを選択
                </button>

                <button
                    type="button"
                    id="${REGISTER_BUTTON_ID}"
                >
                    一括登録
                </button>

                <button
                    type="button"
                    id="${CLOSE_BUTTON_ID}"
                >
                    閉じる
                </button>

            </div>

            <div
                id="${RESULT_ID}"
            ></div>

        `;


        overlay.appendChild(
            panel
        );


        document.body.appendChild(
            overlay
        );


        // -----------------------------------------------------
        // 開く
        // -----------------------------------------------------

        openButton.addEventListener(
            'click',
            function () {

                overlay.classList.add(
                    'active'
                );

            }
        );


        // -----------------------------------------------------
        // 閉じる
        // -----------------------------------------------------

        panel
            .querySelector(
                '#' +
                CLOSE_BUTTON_ID
            )
            .addEventListener(
                'click',
                function () {

                    overlay.classList.remove(
                        'active'
                    );

                }
            );


        // -----------------------------------------------------
        // 外側タップ
        // -----------------------------------------------------

        overlay.addEventListener(
            'click',
            function (
                event
            ) {

                if (
                    event.target ===
                    overlay
                ) {

                    overlay.classList.remove(
                        'active'
                    );

                }

            }
        );


        // -----------------------------------------------------
        // TXTボタン
        // -----------------------------------------------------

        const fileInput =
            panel.querySelector(
                '#' +
                FILE_INPUT_ID
            );


        panel
            .querySelector(
                '#' +
                FILE_BUTTON_ID
            )
            .addEventListener(
                'click',
                function () {

                    fileInput.click();

                }
            );


        fileInput.addEventListener(
            'change',
            async function () {

                const file =
                    fileInput.files &&
                    fileInput.files[0];


                if (!file) {

                    return;

                }


                try {

                    const text =
                        await readFile(
                            file
                        );


                    const textarea =
                        document.getElementById(
                            TEXTAREA_ID
                        );


                    if (textarea) {

                        textarea.value =
                            text;

                    }


                    const result =
                        document.getElementById(
                            RESULT_ID
                        );


                    if (result) {

                        const parsed =
                            parseCharacters(
                                text
                            );


                        result.classList.add(
                            'show'
                        );


                        result.textContent =
                            `TXTを読み込みました。\n` +
                            `検出：${parsed.length}件`;

                    }

                }
                catch (
                    error
                ) {

                    const result =
                        document.getElementById(
                            RESULT_ID
                        );


                    if (result) {

                        result.classList.add(
                            'show'
                        );


                        result.textContent =
                            'TXTの読み込みに失敗しました。\n' +
                            error.message;

                    }

                }

            }
        );


        // -----------------------------------------------------
        // 一括登録
        // -----------------------------------------------------

        panel
            .querySelector(
                '#' +
                REGISTER_BUTTON_ID
            )
            .addEventListener(
                'click',
                registerAll
            );

    }


    // =========================================================
    // 起動
    // =========================================================

    createUI();


    /*
     * ページ側のDOM再生成で消えた場合の復帰
     */
    const observer =
        new MutationObserver(
            function () {

                if (
                    !document.getElementById(
                        BUTTON_ID
                    )
                ) {

                    createUI();

                }

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
