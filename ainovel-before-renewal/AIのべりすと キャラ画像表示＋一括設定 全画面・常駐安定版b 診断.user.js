
// ==UserScript==
// @name         AIのべりすと キャラ画像表示＋一括設定 全画面・常駐安定版b 診断
// @namespace    ainovel-character-images
// @version      2.5.0-debug
// @description  名前=画像ファイル名 でセリフ前にキャラ画像を表示。セリフ段落を字下げして2行目以降も画像の横に並べます。洗脳状態のキャラは別画像へ自動で差し替えます。
// @match        https://ai-novel.com/*
// @match        https://*.ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DB_NAME = 'ainovel_character_image_db';
    const DB_VERSION = 1;
    const STORE_IMAGES = 'images';

    const MAP_STORAGE_KEY =
        'ainovel_character_image_map';

    const DISPLAY_SETTINGS_STORAGE_KEY =
        'ainovel_character_image_display_settings';

    const DEFAULT_ICON_SIZE = 32;
    const DEFAULT_ICON_GAP = 6;

    /*
     * true にすると、セリフの段落全体を字下げして
     * アイコンを左の余白に置き、2行目以降も
     * 画像の横に並べます。
     * false で元の行内表示に戻ります。
     */
    const SIDE_LAYOUT = true;

    /*
     * true の間だけ画面左上に診断パネルを出します
     */
    const DEBUG_PANEL = false;

    let lastLayoutError = '';

    const SETTINGS_BUTTON_ID =
        'ainovel-character-settings-open-stable';

    const SETTINGS_OVERLAY_ID =
        'ainovel-character-settings-overlay-stable';

    const INLINE_IMAGE_CLASS =
        'ainovel-character-inline-image';

    const LINE_CLASS =
        'ainovel-character-line';

    const LINE_WRAP_CLASS =
        'ainovel-character-line-wrap';

    let db = null;
    let characterMap = {};

    let iconSize = DEFAULT_ICON_SIZE;
    let iconGap = DEFAULT_ICON_GAP;

    let processing = false;
    let updateRequested = false;
    let updateTimer = null;

    let observedContainer = null;
    let textObserver = null;
    let rootObserver = null;

    const selectedFiles = new Map();
    const objectUrlCache = new Map();


    // =========================================================
    // 🧠 洗脳状態による画像切り替え
    // =========================================================

    const BRAINWASH = {

        /*
         * false にすると常に通常画像を使います
         */
        enabled: true,

        /*
         * Grok文章コピー側が書き出す共有キー
         */
        storageKey: 'ainovel_brainwash_states',

        /*
         * 洗脳時に使う対応表の接尾辞。
         *
         *   雷花=raika.png
         *   雷花_洗脳=raika_bw.png
         *
         * のように登録しておくと、
         * 一覧に載っている間だけ後者が使われます。
         */
        suffix: '_洗脳',

        /*
         * 共有値の変更を見に行く間隔(ms)
         */
        pollInterval: 1000
    };


    let brainwashedNames = new Set();

    let lastStatesRaw = null;


    function readStatesRaw() {

        try {

            return String(
                localStorage.getItem(
                    BRAINWASH.storageKey
                ) || ''
            );

        } catch (_) {

            return '';
        }
    }


    /*
     * 「雷花=洗脳状態」形式の行から
     * 名前だけを集めます。
     * 「洗脳状態なし」の行は無視されます。
     */
    function parseStates(
        raw
    ) {

        const set = new Set();


        String(raw || '')
            .split(/\r?\n/)
            .forEach(function (rawLine) {

                const line = rawLine.trim();

                if (!line) {
                    return;
                }


                const separator =
                    line.indexOf('=');

                if (separator < 1) {
                    return;
                }


                const name =
                    line
                        .slice(0, separator)
                        .trim();

                if (name) {
                    set.add(name);
                }
            });


        return set;
    }


    /*
     * 洗脳中で、かつ洗脳用の画像が
     * 登録されている場合だけ差し替えます。
     * 未登録なら通常画像のままです。
     */
    function resolveFilename(
        name
    ) {

        if (
            BRAINWASH.enabled &&
            brainwashedNames.has(name)
        ) {

            const alternate =
                characterMap[
                    name + BRAINWASH.suffix
                ];

            if (alternate) {
                return alternate;
            }
        }


        return characterMap[name];
    }


    function refreshStates(
        force
    ) {

        const raw = readStatesRaw();


        if (
            !force &&
            raw === lastStatesRaw
        ) {

            return false;
        }


        lastStatesRaw = raw;

        brainwashedNames = parseStates(raw);


        console.log(
            '[CharImage] 洗脳状態を更新:',
            Array.from(brainwashedNames).join(', ') || 'なし'
        );


        return true;
    }


    function startStatesWatcher() {

        refreshStates(true);


        setInterval(function () {

            if (refreshStates(false)) {

                /*
                 * ファイル名が変わるので
                 * 既存の画像も貼り直されます
                 */
                scheduleUpdate();
            }

        }, BRAINWASH.pollInterval);
    }

    try {

        window.__ainovelCharacterImages =
            (
                Number(
                    window.__ainovelCharacterImages
                ) || 0
            ) + 1;

    }
    catch (_) {}


    const style = document.createElement('style');

    style.textContent = `

        .${INLINE_IMAGE_CLASS} {

            display: inline-block !important;

            width:
                var(
                    --ainovel-character-icon-size,
                    ${DEFAULT_ICON_SIZE}px
                ) !important;

            height:
                var(
                    --ainovel-character-icon-size,
                    ${DEFAULT_ICON_SIZE}px
                ) !important;

            min-width:
                var(
                    --ainovel-character-icon-size,
                    ${DEFAULT_ICON_SIZE}px
                ) !important;

            margin-right:
                var(
                    --ainovel-character-icon-gap,
                    ${DEFAULT_ICON_GAP}px
                ) !important;

            vertical-align:
                middle !important;

            background-size:
                cover !important;

            background-position:
                center !important;

            background-repeat:
                no-repeat !important;

            border-radius:
                0 !important;

            box-sizing:
                border-box !important;

            border:
                1px solid
                rgba(255,255,255,0.8) !important;

            box-shadow:
                0 1px 4px
                rgba(0,0,0,0.35) !important;

            user-select:
                none !important;

            -webkit-user-select:
                none !important;

            pointer-events:
                none !important;

            flex:
                0 0 auto !important;
        }


        .${LINE_CLASS},
        .${LINE_WRAP_CLASS} {

            position:
                relative !important;

            padding-left:
                calc(
                    var(
                        --ainovel-character-icon-size,
                        ${DEFAULT_ICON_SIZE}px
                    )
                    +
                    var(
                        --ainovel-character-icon-gap,
                        ${DEFAULT_ICON_GAP}px
                    )
                ) !important;

            min-height:
                var(
                    --ainovel-character-icon-size,
                    ${DEFAULT_ICON_SIZE}px
                ) !important;
        }


        .${LINE_WRAP_CLASS} {

            display:
                inline-block !important;

            max-width:
                100% !important;

            box-sizing:
                border-box !important;

            vertical-align:
                top !important;
        }


        .${LINE_CLASS}
        .${INLINE_IMAGE_CLASS},

        .${LINE_WRAP_CLASS}
        .${INLINE_IMAGE_CLASS} {

            position:
                absolute !important;

            left:
                0 !important;

            top:
                0.1em !important;

            margin-right:
                0 !important;

            vertical-align:
                top !important;
        }


        body.qp-full-active
        #data_container
        .${INLINE_IMAGE_CLASS},

        body.qp-text-mode
        #data_container
        .${INLINE_IMAGE_CLASS},

        #data_container
        .${INLINE_IMAGE_CLASS} {

            display:
                inline-block !important;

            visibility:
                visible !important;

            opacity:
                1 !important;
        }


        #${SETTINGS_BUTTON_ID} {

            position:
                fixed !important;

            right:
                12px !important;

            bottom:
                188px !important;

            z-index:
                2147483644 !important;

            width:
                46px !important;

            height:
                46px !important;

            padding:
                0 !important;

            display:
                flex !important;

            align-items:
                center !important;

            justify-content:
                center !important;

            border:
                1px solid
                #666 !important;

            border-radius:
                9px !important;

            background:
                rgba(255,255,255,0.96) !important;

            color:
                #222 !important;

            font-size:
                22px !important;

            box-shadow:
                0 2px 10px
                rgba(0,0,0,.24) !important;

            cursor:
                pointer !important;

            user-select:
                none !important;

            -webkit-user-select:
                none !important;

            touch-action:
                manipulation !important;
        }


        #${SETTINGS_OVERLAY_ID} {

            position:
                fixed !important;

            inset:
                0 !important;

            z-index:
                2147483647 !important;

            display:
                flex !important;

            align-items:
                center !important;

            justify-content:
                center !important;

            padding:
                10px !important;

            box-sizing:
                border-box !important;

            background:
                rgba(0,0,0,.55) !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-panel {

            width:
                min(620px, 100%) !important;

            max-height:
                94dvh !important;

            overflow-y:
                auto !important;

            box-sizing:
                border-box !important;

            padding:
                14px !important;

            border-radius:
                12px !important;

            background:
                #fff !important;

            color:
                #222 !important;

            box-shadow:
                0 8px 30px
                rgba(0,0,0,.4) !important;

            font-family:
                sans-serif !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-header {

            display:
                flex !important;

            align-items:
                center !important;

            justify-content:
                space-between !important;

            gap:
                8px !important;

            margin-bottom:
                12px !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-header strong {

            font-size:
                18px !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-close {

            width:
                42px !important;

            height:
                42px !important;

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
                20px !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-section {

            margin:
                14px 0 18px !important;

            padding-top:
                12px !important;

            border-top:
                1px solid
                #ddd !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-label {

            display:
                block !important;

            margin-bottom:
                7px !important;

            font-weight:
                bold !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-description {

            margin-bottom:
                8px !important;

            color:
                #555 !important;

            font-size:
                13px !important;

            line-height:
                1.5 !important;
        }


        #${SETTINGS_OVERLAY_ID}
        textarea {

            width:
                100% !important;

            min-height:
                180px !important;

            box-sizing:
                border-box !important;

            padding:
                10px !important;

            border:
                1px solid
                #999 !important;

            border-radius:
                8px !important;

            background:
                #fff !important;

            color:
                #111 !important;

            -webkit-text-fill-color:
                #111 !important;

            caret-color:
                #111 !important;

            font-size:
                15px !important;

            line-height:
                1.5 !important;

            resize:
                vertical !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-row {

            display:
                flex !important;

            gap:
                8px !important;

            flex-wrap:
                wrap !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-action {

            flex:
                1 1 auto !important;

            min-height:
                42px !important;

            padding:
                8px 12px !important;

            border:
                1px solid
                #777 !important;

            border-radius:
                8px !important;

            background:
                #f3f3f3 !important;

            color:
                #222 !important;

            font-size:
                14px !important;

            font-weight:
                bold !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-main {

            background:
                #e9f7ef !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-status {

            margin-top:
                8px !important;

            font-size:
                13px !important;

            line-height:
                1.5 !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-register-list {

            display:
                flex !important;

            flex-direction:
                column !important;

            gap:
                7px !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-register-item {

            display:
                flex !important;

            align-items:
                center !important;

            gap:
                8px !important;

            padding:
                7px !important;

            border:
                1px solid
                #ddd !important;

            border-radius:
                8px !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-preview {

            width:
                40px !important;

            height:
                40px !important;

            flex:
                0 0 40px !important;

            border-radius:
                50% !important;

            background-size:
                cover !important;

            background-position:
                center !important;

            border:
                1px solid
                #bbb !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-register-text {

            flex:
                1 !important;

            min-width:
                0 !important;

            overflow-wrap:
                anywhere !important;

            font-size:
                13px !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-delete {

            flex:
                0 0 auto !important;

            padding:
                7px 9px !important;

            border:
                1px solid
                #b77 !important;

            border-radius:
                7px !important;

            background:
                #fff0f0 !important;

            color:
                #9b1c1c !important;
        }


        #${SETTINGS_OVERLAY_ID}
        input[type="range"] {

            width:
                100% !important;
        }


        #${SETTINGS_OVERLAY_ID}
        .ainovel-character-value {

            margin-top:
                4px !important;

            text-align:
                center !important;

            font-weight:
                bold !important;
        }

    `;

    document.head.appendChild(
        style
    );


    function loadJson(
        key,
        fallback
    ) {

        try {

            const raw =
                localStorage.getItem(
                    key
                );


            if (!raw) {

                return fallback;

            }


            return JSON.parse(
                raw
            );

        }

        catch (_) {

            return fallback;

        }

    }


    function saveJson(
        key,
        value
    ) {

        localStorage.setItem(

            key,

            JSON.stringify(
                value
            )

        );

    }


    function loadCharacterMap() {

        const loaded =
            loadJson(
                MAP_STORAGE_KEY,
                {}
            );


        characterMap =
            loaded &&
            typeof loaded ===
                'object'

                ? loaded
                : {};

    }


    function loadDisplaySettings() {

        const loaded =
            loadJson(
                DISPLAY_SETTINGS_STORAGE_KEY,
                {}
            );


        const size =
            Number(
                loaded.iconSize
            );


        const gap =
            Number(
                loaded.iconGap
            );


        iconSize =
            Number.isFinite(
                size
            )

                ? Math.max(
                    20,
                    Math.min(
                        120,
                        size
                    )
                )

                : DEFAULT_ICON_SIZE;


        iconGap =
            Number.isFinite(
                gap
            )

                ? Math.max(
                    0,
                    Math.min(
                        40,
                        gap
                    )
                )

                : DEFAULT_ICON_GAP;


        applyDisplaySettings();

    }


    function saveDisplaySettings() {

        saveJson(

            DISPLAY_SETTINGS_STORAGE_KEY,

            {
                iconSize,
                iconGap
            }

        );


        applyDisplaySettings();

    }


    function applyDisplaySettings() {

        document.documentElement
            .style
            .setProperty(
                '--ainovel-character-icon-size',
                iconSize + 'px'
            );


        document.documentElement
            .style
            .setProperty(
                '--ainovel-character-icon-gap',
                iconGap + 'px'
            );

    }


    function openDatabase() {

        return new Promise(

            function (
                resolve,
                reject
            ) {

                const request =
                    indexedDB.open(
                        DB_NAME,
                        DB_VERSION
                    );


                request.onupgradeneeded =
                    function (event) {

                        const database =
                            event.target.result;


                        if (
                            !database
                                .objectStoreNames
                                .contains(
                                    STORE_IMAGES
                                )
                        ) {

                            database
                                .createObjectStore(
                                    STORE_IMAGES
                                );

                        }

                    };


                request.onsuccess =
                    function () {

                        db =
                            request.result;

                        resolve(
                            db
                        );

                    };


                request.onerror =
                    function () {

                        reject(
                            request.error ||
                            new Error(
                                'IndexedDBを開けませんでした'
                            )
                        );

                    };

            }

        );

    }


    function putImage(
        filename,
        file
    ) {

        return new Promise(

            function (
                resolve,
                reject
            ) {

                if (!db) {

                    reject(
                        new Error(
                            '画像DBが開かれていません'
                        )
                    );

                    return;

                }


                const tx =
                    db.transaction(
                        STORE_IMAGES,
                        'readwrite'
                    );


                const store =
                    tx.objectStore(
                        STORE_IMAGES
                    );


                store.put(
                    file,
                    filename
                );


                tx.oncomplete =
                    function () {

                        revokeCachedUrl(
                            filename
                        );

                        resolve();

                    };


                tx.onerror =
                    function () {

                        reject(
                            tx.error ||
                            new Error(
                                '画像を保存できませんでした'
                            )
                        );

                    };

            }

        );

    }


    function getImage(
        filename
    ) {

        return new Promise(

            function (
                resolve,
                reject
            ) {

                if (!db) {

                    resolve(
                        null
                    );

                    return;

                }


                const tx =
                    db.transaction(
                        STORE_IMAGES,
                        'readonly'
                    );


                const store =
                    tx.objectStore(
                        STORE_IMAGES
                    );


                const request =
                    store.get(
                        filename
                    );


                request.onsuccess =
                    function () {

                        resolve(
                            request.result ||
                            null
                        );

                    };


                request.onerror =
                    function () {

                        reject(
                            request.error ||
                            new Error(
                                '画像を読み込めませんでした'
                            )
                        );

                    };

            }

        );

    }


    function deleteImage(
        filename
    ) {

        return new Promise(

            function (
                resolve,
                reject
            ) {

                if (!db) {

                    resolve();

                    return;

                }


                const tx =
                    db.transaction(
                        STORE_IMAGES,
                        'readwrite'
                    );


                tx.objectStore(
                    STORE_IMAGES
                ).delete(
                    filename
                );


                tx.oncomplete =
                    function () {

                        revokeCachedUrl(
                            filename
                        );

                        resolve();

                    };


                tx.onerror =
                    function () {

                        reject(
                            tx.error ||
                            new Error(
                                '画像を削除できませんでした'
                            )
                        );

                    };

            }

        );

    }


    function revokeCachedUrl(
        filename
    ) {

        const url =
            objectUrlCache.get(
                filename
            );


        if (url) {

            try {

                URL.revokeObjectURL(
                    url
                );

            }

            catch (_) {}


            objectUrlCache.delete(
                filename
            );

        }

    }


    async function getImageUrl(
        filename
    ) {

        if (
            objectUrlCache.has(
                filename
            )
        ) {

            return objectUrlCache.get(
                filename
            );

        }


        const file =
            await getImage(
                filename
            );


        if (!file) {

            return '';

        }


        const url =
            URL.createObjectURL(
                file
            );


        objectUrlCache.set(
            filename,
            url
        );


        return url;

    }


    function parseMapping(
        text
    ) {

        const result = {};

        const errors = [];


        String(
            text || ''
        )
            .split(
                /\r?\n/
            )
            .forEach(

                function (
                    rawLine,
                    index
                ) {

                    const line =
                        rawLine.trim();


                    if (
                        !line ||
                        line.startsWith(
                            '#'
                        )
                    ) {

                        return;

                    }


                    const separator =
                        line.indexOf(
                            '='
                        );


                    if (
                        separator < 1
                    ) {

                        errors.push(
                            `${index + 1}行目: 名前=画像ファイル名 の形式ではありません`
                        );

                        return;

                    }


                    const name =
                        line
                            .slice(
                                0,
                                separator
                            )
                            .trim();


                    const filename =
                        line
                            .slice(
                                separator + 1
                            )
                            .trim();


                    if (
                        !name ||
                        !filename
                    ) {

                        errors.push(
                            `${index + 1}行目: 名前またはファイル名が空です`
                        );

                        return;

                    }


                    result[
                        name
                    ] =
                        filename;

                }

            );


        return {
            result,
            errors
        };

    }


    function mappingText() {

        return Object
            .entries(
                characterMap
            )
            .map(

                function (
                    [
                        name,
                        filename
                    ]
                ) {

                    return `${name}=${filename}`;

                }

            )
            .join(
                '\n'
            );

    }


    function removeAllInlineImages() {

        document
            .querySelectorAll(
                '.' +
                INLINE_IMAGE_CLASS
            )
            .forEach(

                function (
                    element
                ) {

                    element.remove();

                }

            );

        document
            .querySelectorAll(
                '.' +
                LINE_WRAP_CLASS
            )
            .forEach(

                function (
                    wrapper
                ) {

                    unwrapLine(
                        wrapper
                    );

                }

            );

        document
            .querySelectorAll(
                '.' +
                LINE_CLASS
            )
            .forEach(

                function (
                    element
                ) {

                    element
                        .classList
                        .remove(
                            LINE_CLASS
                        );

                }

            );

    }


    function getTextNodes(
        container
    ) {

        const nodes = [];


        const walker =
            document.createTreeWalker(

                container,

                NodeFilter.SHOW_TEXT,

                {

                    acceptNode(
                        node
                    ) {

                        if (
                            !node.nodeValue ||
                            !node
                                .nodeValue
                                .trim()
                        ) {

                            return NodeFilter
                                .FILTER_REJECT;

                        }


                        const parent =
                            node.parentElement;


                        if (!parent) {

                            return NodeFilter
                                .FILTER_REJECT;

                        }


                        if (
                            parent.closest(
                                '.' +
                                INLINE_IMAGE_CLASS
                            )
                        ) {

                            return NodeFilter
                                .FILTER_REJECT;

                        }


                        if (
                            parent.closest(
                                'script,style,textarea,input,select,button'
                            )
                        ) {

                            return NodeFilter
                                .FILTER_REJECT;

                        }


                        if (
                            !parent.closest(
                                '.data_edit'
                            )
                        ) {

                            return NodeFilter
                                .FILTER_REJECT;

                        }


                        return NodeFilter
                            .FILTER_ACCEPT;

                    }

                }

            );


        let node;


        while (
            (
                node =
                    walker.nextNode()
            )
        ) {

            nodes.push(
                node
            );

        }


        return nodes;

    }


    function isCorrectImageBefore(
        textNode,
        characterName,
        filename
    ) {

        const previous =
            textNode
                .previousSibling;


        return !!(

            previous &&

            previous.nodeType ===
                Node.ELEMENT_NODE &&

            previous
                .classList
                .contains(
                    INLINE_IMAGE_CLASS
                ) &&

            previous
                .dataset
                .character ===
                characterName &&

            previous
                .dataset
                .filename ===
                filename

        );

    }


    async function createInlineImage(
        name,
        filename
    ) {

        const url =
            await getImageUrl(
                filename
            );


        if (!url) {

            return null;

        }


        const image =
            document.createElement(
                'span'
            );


        image.className =
            INLINE_IMAGE_CLASS;


        image.dataset.character =
            name;


        image.dataset.filename =
            filename;


        image.setAttribute(
            'contenteditable',
            'false'
        );


        image.setAttribute(
            'aria-hidden',
            'true'
        );


        image.style.backgroundImage =
            `url("${url}")`;


        return image;

    }


    /*
     * アイコンを置いた段落を探して字下げ用の
     * クラスを付けます。
     * 段落ごとの要素が見つからない場合や、
     * 1つの要素に複数行が入っている場合は
     * 何もせず、従来の行内表示のままにします。
     */
    function markLineBlock(
        image,
        name
    ) {

        if (!SIDE_LAYOUT) {

            return false;

        }


        const root =
            document.getElementById(
                'data_container'
            );


        let element =
            image.parentElement;


        while (
            element &&
            element !== root
        ) {

            const display =
                window
                    .getComputedStyle(
                        element
                    )
                    .display;


            if (
                display !== 'inline' &&
                display !== 'inline-block'
            ) {

                break;

            }


            element =
                element.parentElement;

        }


        if (
            !element ||
            element === root ||
            !root
        ) {

            return false;

        }


        /*
         * <br> で複数行が詰め込まれている
         * 要素は対象外
         */
        if (
            element.querySelector('br')
        ) {

            return false;

        }


        const text =
            (element.textContent || '')
                .replace(/\u3000/g, ' ')
                .trim();


        /*
         * その段落がこのセリフで始まる
         * ときだけ字下げします
         */
        if (
            text.indexOf(
                name + '「'
            ) !== 0
        ) {

            return false;

        }


        element.classList.add(
            LINE_CLASS
        );


        return true;

    }


    /*
     * 段落ごとの要素が無い（改行文字で1行に
     * なっているだけの）ページ向けに、
     * セリフ1行分を span で包んで
     * 字下げできる箱にします。
     *
     * 戻り値は「行の続き」のテキストノード。
     * 包めなかったときは undefined。
     */
    function wrapLine(
        image
    ) {

        if (!SIDE_LAYOUT) {

            return undefined;

        }


        const parent =
            image.parentNode;


        if (!parent) {

            return undefined;

        }


        const members = [image];

        let tail = null;

        let node = image.nextSibling;


        while (node) {

            if (
                node.nodeType ===
                Node.TEXT_NODE
            ) {

                const value =
                    node.nodeValue || '';


                const index =
                    value.indexOf('\n');


                if (index === 0) {

                    tail = node;

                    break;

                }


                if (index > 0) {

                    tail =
                        node.splitText(
                            index
                        );


                    members.push(node);

                    break;

                }


                members.push(node);

            }

            else if (
                node.nodeType ===
                Node.ELEMENT_NODE
            ) {

                const isBreak =
                    node.tagName === 'BR';


                const isIcon =
                    node.classList &&
                    node.classList.contains(
                        INLINE_IMAGE_CLASS
                    );


                const display =
                    window
                        .getComputedStyle(
                            node
                        )
                        .display;


                if (
                    isBreak ||
                    isIcon ||
                    (
                        display !== 'inline' &&
                        display !== 'inline-block'
                    )
                ) {

                    break;

                }


                members.push(node);

            }


            node = node.nextSibling;

        }


        const wrapper =
            document.createElement('span');


        wrapper.className =
            LINE_WRAP_CLASS;


        parent.insertBefore(
            wrapper,
            image
        );


        members.forEach(

            function (
                member
            ) {

                wrapper.appendChild(
                    member
                );

            }

        );


        return (
            tail &&
            tail.nodeType ===
                Node.TEXT_NODE
        )

            ? tail

            : null;

    }


    function unwrapLine(
        wrapper
    ) {

        const parent =
            wrapper.parentNode;


        if (!parent) {

            return;

        }


        while (wrapper.firstChild) {

            parent.insertBefore(

                wrapper.firstChild,

                wrapper

            );

        }


        wrapper.remove();

    }


    /*
     * すでに置かれているアイコンも含めて、
     * その行にレイアウトを適用します。
     * 戻り値は「行の続き」のノード、
     * 何もしなかったときは undefined。
     */
    function applyLineLayout(
        image,
        name
    ) {

        if (!SIDE_LAYOUT) {

            return undefined;

        }


        /*
         * すでに適用済みなら触らない
         */
        if (
            image.closest(
                '.' + LINE_WRAP_CLASS
            ) ||
            image.closest(
                '.' + LINE_CLASS
            )
        ) {

            return undefined;

        }


        try {

            if (
                markLineBlock(
                    image,
                    name
                )
            ) {

                return undefined;

            }


            return wrapLine(
                image
            );

        }

        catch (error) {

            lastLayoutError =
                String(
                    error &&
                    error.message ||
                    error
                );


            return undefined;

        }

    }


    function updateDebugPanel() {

        if (!DEBUG_PANEL) {

            return;

        }


        let panel =
            document.getElementById(
                'ainovel-character-debug'
            );


        if (!panel) {

            panel =
                document.createElement('div');


            panel.id =
                'ainovel-character-debug';


            panel.style.cssText = [
                'position:fixed',
                'top:64px',
                'left:4px',
                'z-index:2147483646',
                'max-width:66vw',
                'padding:6px 8px',
                'background:rgba(0,0,0,0.78)',
                'color:#fff',
                'font:10px/1.4 monospace',
                'white-space:pre-wrap',
                'word-break:break-all',
                'border-radius:6px',
                'pointer-events:none'
            ].join(';');


            document.body.appendChild(panel);

        }


        const icons =
            document.querySelectorAll(
                '.' + INLINE_IMAGE_CLASS
            );


        const wraps =
            document.querySelectorAll(
                '.' + LINE_WRAP_CLASS
            );


        const blocks =
            document.querySelectorAll(
                '.' + LINE_CLASS
            );


        let bare = 0;


        icons.forEach(

            function (
                element
            ) {

                if (
                    !element.closest(
                        '.' + LINE_WRAP_CLASS
                    ) &&
                    !element.closest(
                        '.' + LINE_CLASS
                    )
                ) {

                    bare++;

                }

            }

        );


        const lines = [
            'icon=' + icons.length +
            ' wrap=' + wraps.length +
            ' block=' + blocks.length +
            ' bare=' + bare,

            'instances=' +
            (
                window.__ainovelCharacterImages ||
                '?'
            )
        ];


        const icon = icons[0];


        if (icon) {

            const chain = [];

            let element =
                icon.parentElement;


            for (
                let i = 0;
                i < 4 && element;
                i++
            ) {

                const name =
                    String(
                        element.className || ''
                    )
                        .split(' ')[0];


                chain.push(
                    element.tagName +
                    (name ? '.' + name : '') +
                    '[' +
                    window
                        .getComputedStyle(element)
                        .display +
                    ']'
                );


                element =
                    element.parentElement;

            }


            lines.push(
                chain.join(' < ')
            );


            lines.push(
                'ws=' +
                window
                    .getComputedStyle(
                        icon.parentElement
                    )
                    .whiteSpace
            );


            const iconStyle =
                window.getComputedStyle(icon);


            lines.push(
                'icon pos=' +
                iconStyle.position +
                ' size=' +
                iconStyle.width
            );


            const wrap =
                icon.closest(
                    '.' + LINE_WRAP_CLASS
                );


            if (wrap) {

                const wrapStyle =
                    window.getComputedStyle(wrap);


                lines.push(
                    'wrap disp=' +
                    wrapStyle.display +
                    ' pad=' +
                    wrapStyle.paddingLeft +
                    ' pos=' +
                    wrapStyle.position +
                    ' w=' +
                    Math.round(
                        wrap.getBoundingClientRect()
                            .width
                    )
                );

            }

            else {

                lines.push('wrap: none');


                const next =
                    icon.nextSibling;


                lines.push(
                    'next=' +
                    (
                        next
                            ? (
                                next.nodeType === 3
                                    ? 'text:' +
                                      JSON.stringify(
                                          String(
                                              next.nodeValue || ''
                                          ).slice(0, 24)
                                      )
                                    : next.tagName
                            )
                            : 'null'
                    )
                );

            }

        }


        lines.push(
            'err=' +
            (lastLayoutError || 'none')
        );


        panel.textContent =
            lines.join('\n');

    }


    function cleanupLineBlocks(
        container
    ) {

        const scope =
            container ||
            document;


        scope
            .querySelectorAll(
                '.' + LINE_CLASS
            )
            .forEach(

                function (
                    element
                ) {

                    if (
                        !element
                            .querySelector(
                                '.' +
                                INLINE_IMAGE_CLASS
                            )
                    ) {

                        element
                            .classList
                            .remove(
                                LINE_CLASS
                            );

                    }

                }

            );


        scope
            .querySelectorAll(
                '.' + LINE_WRAP_CLASS
            )
            .forEach(

                function (
                    wrapper
                ) {

                    if (
                        !wrapper
                            .querySelector(
                                '.' +
                                INLINE_IMAGE_CLASS
                            )
                    ) {

                        unwrapLine(
                            wrapper
                        );

                    }

                }

            );

    }


    async function processTextNode(
        originalNode
    ) {

        if (
            !originalNode ||
            !originalNode.parentNode
        ) {

            return;

        }


        let currentNode =
            originalNode;


        while (
            currentNode &&
            currentNode.nodeType ===
                Node.TEXT_NODE &&
            currentNode.parentNode
        ) {

            const text =
                currentNode.nodeValue ||
                '';


            let bestMatch =
                null;


            for (
                const [
                    name,
                    filename
                ]
                of Object.entries(
                    characterMap
                )
            ) {

                const target =
                    name +
                    '「';


                const index =
                    text.indexOf(
                        target
                    );


                if (
                    index === -1
                ) {

                    continue;

                }


                if (
                    bestMatch ===
                        null ||
                    index <
                        bestMatch.index
                ) {

                    bestMatch = {
                        name,
                        filename,
                        index
                    };

                }

            }


            if (!bestMatch) {

                break;

            }


            /*
             * 洗脳中なら洗脳用の画像へ差し替え
             */
            bestMatch.filename =
                resolveFilename(
                    bestMatch.name
                ) ||
                bestMatch.filename;


            let nameNode;


            if (
                bestMatch.index ===
                    0
            ) {

                nameNode =
                    currentNode;

            }

            else {

                nameNode =
                    currentNode
                        .splitText(
                            bestMatch.index
                        );

            }


            if (
                !nameNode.parentNode
            ) {

                break;

            }


            const skipLength =
                bestMatch.name.length +
                1;


            if (
                isCorrectImageBefore(

                    nameNode,

                    bestMatch.name,

                    bestMatch.filename

                )
            ) {

                /*
                 * アイコンは既にあるが、まだ
                 * 行の字下げが済んでいない場合
                 * （旧版が先に挿した行など）
                 */
                const existingTail =
                    applyLineLayout(

                        nameNode.previousSibling,

                        bestMatch.name

                    );


                if (
                    existingTail !== undefined
                ) {

                    currentNode =
                        existingTail;


                    continue;

                }


                if (
                    nameNode
                        .nodeValue
                        .length >
                    skipLength
                ) {

                    currentNode =
                        nameNode
                            .splitText(
                                skipLength
                            );


                    continue;

                }


                break;

            }


            const previous =
                nameNode
                    .previousSibling;


            if (
                previous &&

                previous.nodeType ===
                    Node.ELEMENT_NODE &&

                previous
                    .classList
                    .contains(
                        INLINE_IMAGE_CLASS
                    )
            ) {

                previous.remove();

            }


            const image =
                await createInlineImage(

                    bestMatch.name,

                    bestMatch.filename

                );


            if (
                image &&
                nameNode.parentNode
            ) {

                nameNode
                    .parentNode
                    .insertBefore(

                        image,

                        nameNode

                    );


                const tail =
                    applyLineLayout(

                        image,

                        bestMatch.name

                    );


                if (
                    tail !== undefined
                ) {

                    /*
                     * 1行分を包み終えたので
                     * 続きから探し直します
                     */
                    currentNode = tail;

                    continue;

                }

            }


            if (
                nameNode
                    .nodeValue
                    .length >
                skipLength
            ) {

                currentNode =
                    nameNode
                        .splitText(
                            skipLength
                        );

            }

            else {

                break;

            }

        }

    }


    async function processContainer(
        container
    ) {

        if (
            !container ||
            !container.isConnected
        ) {

            return;

        }


        const textNodes =
            getTextNodes(
                container
            );


        for (
            const node
            of textNodes
        ) {

            if (
                !container.isConnected
            ) {

                break;

            }


            await processTextNode(
                node
            );

        }


        cleanupLineBlocks(
            container
        );


        updateDebugPanel();

    }


    async function processAll() {

        if (processing) {

            updateRequested =
                true;

            return;

        }


        const container =
            document.getElementById(
                'data_container'
            );


        if (!container) {

            return;

        }


        processing =
            true;


        updateRequested =
            false;


        try {

            await processContainer(
                container
            );

        }

        catch (error) {

            console.error(
                '[Character Images] render error:',
                error
            );

        }

        finally {

            processing =
                false;


            if (
                updateRequested
            ) {

                scheduleUpdate(
                    60
                );

            }

        }

    }


    function scheduleUpdate(
        delay = 100
    ) {

        updateRequested =
            true;


        if (processing) {

            return;

        }


        if (updateTimer) {

            clearTimeout(
                updateTimer
            );

        }


        updateTimer =
            setTimeout(

                function () {

                    updateTimer =
                        null;


                    processAll();

                },

                delay

            );

    }


    function disconnectTextObserver() {

        if (
            textObserver
        ) {

            textObserver.disconnect();

            textObserver =
                null;

        }


        observedContainer =
            null;

    }


    function bindTextObserver() {

        const container =
            document.getElementById(
                'data_container'
            );


        if (!container) {

            disconnectTextObserver();

            return false;

        }


        if (
            observedContainer ===
                container &&
            textObserver
        ) {

            return true;

        }


        disconnectTextObserver();


        observedContainer =
            container;


        textObserver =
            new MutationObserver(

                function (
                    mutations
                ) {

                    let relevant =
                        false;


                    for (
                        const mutation
                        of mutations
                    ) {

                        if (
                            mutation.type ===
                                'characterData'
                        ) {

                            relevant =
                                true;

                            break;

                        }


                        if (
                            mutation.type ===
                                'childList'
                        ) {

                            const added =
                                Array.from(
                                    mutation
                                        .addedNodes
                                );


                            const removed =
                                Array.from(
                                    mutation
                                        .removedNodes
                                );


                            const onlyOurAddedImages =
                                added.length >
                                    0 &&

                                added.every(

                                    function (
                                        node
                                    ) {

                                        return (

                                            node.nodeType ===
                                                Node.ELEMENT_NODE &&

                                            node
                                                .classList
                                                .contains(
                                                    INLINE_IMAGE_CLASS
                                                )

                                        );

                                    }

                                );


                            if (
                                !onlyOurAddedImages ||
                                removed.length >
                                    0
                            ) {

                                relevant =
                                    true;

                                break;

                            }

                        }

                    }


                    if (
                        relevant
                    ) {

                        scheduleUpdate(
                            80
                        );

                    }

                }

            );


        textObserver.observe(

            container,

            {
                subtree:
                    true,

                childList:
                    true,

                characterData:
                    true
            }

        );


        scheduleUpdate(
            0
        );


        return true;

    }


    function setupRootObserver() {

        if (
            rootObserver
        ) {

            return;

        }


        rootObserver =
            new MutationObserver(

                function () {

                    const current =
                        document.getElementById(
                            'data_container'
                        );


                    if (
                        current !==
                        observedContainer
                    ) {

                        bindTextObserver();

                    }

                }

            );


        rootObserver.observe(

            document.documentElement,

            {
                subtree:
                    true,

                childList:
                    true
            }

        );

    }


    function ensureSettingsButton() {

        if (
            document.getElementById(
                SETTINGS_BUTTON_ID
            )
        ) {

            return;

        }


        const button =
            document.createElement(
                'button'
            );


        button.id =
            SETTINGS_BUTTON_ID;


        button.type =
            'button';


        button.textContent =
            '🖼';


        button.title =
            'キャラ画像設定';


        button.setAttribute(
            'aria-label',
            'キャラ画像設定'
        );


        button.addEventListener(
            'click',
            openSettings
        );


        document.body.appendChild(
            button
        );

    }


    async function renderRegisteredList(
        container
    ) {

        container.replaceChildren();


        const entries =
            Object.entries(
                characterMap
            );


        if (
            !entries.length
        ) {

            container.textContent =
                '登録なし';

            return;

        }


        for (
            const [
                name,
                filename
            ]
            of entries
        ) {

            const row =
                document.createElement(
                    'div'
                );


            row.className =
                'ainovel-character-register-item';


            const preview =
                document.createElement(
                    'div'
                );


            preview.className =
                'ainovel-character-preview';


            try {

                const url =
                    await getImageUrl(
                        filename
                    );


                if (url) {

                    preview
                        .style
                        .backgroundImage =
                        `url("${url}")`;

                }

            }

            catch (_) {}


            const text =
                document.createElement(
                    'div'
                );


            text.className =
                'ainovel-character-register-text';


            const file =
                await getImage(
                    filename
                )
                    .catch(

                        function () {

                            return null;

                        }

                    );


            text.textContent =
                `${name} = ${filename}` +

                (
                    file
                        ? ''
                        : '（画像未登録）'
                );


            const remove =
                document.createElement(
                    'button'
                );


            remove.type =
                'button';


            remove.className =
                'ainovel-character-delete';


            remove.textContent =
                '削除';


            remove.addEventListener(

                'click',

                async function () {

                    delete characterMap[
                        name
                    ];


                    saveJson(
                        MAP_STORAGE_KEY,
                        characterMap
                    );


                    if (
                        !Object
                            .values(
                                characterMap
                            )
                            .includes(
                                filename
                            )
                    ) {

                        await deleteImage(
                            filename
                        )
                            .catch(
                                function () {}
                            );

                    }


                    removeAllInlineImages();


                    await renderRegisteredList(
                        container
                    );


                    scheduleUpdate(
                        0
                    );

                }

            );


            row.append(
                preview,
                text,
                remove
            );


            container.appendChild(
                row
            );

        }

    }


    function openSettings() {

        if (
            document.getElementById(
                SETTINGS_OVERLAY_ID
            )
        ) {

            return;

        }


        const overlay =
            document.createElement(
                'div'
            );


        overlay.id =
            SETTINGS_OVERLAY_ID;


        const panel =
            document.createElement(
                'div'
            );


        panel.className =
            'ainovel-character-panel';


        const header =
            document.createElement(
                'div'
            );


        header.className =
            'ainovel-character-header';


        const title =
            document.createElement(
                'strong'
            );


        title.textContent =
            'キャラ画像設定';


        const close =
            document.createElement(
                'button'
            );


        close.type =
            'button';


        close.className =
            'ainovel-character-close';


        close.textContent =
            '×';


        close.addEventListener(

            'click',

            function () {

                overlay.remove();

            }

        );


        header.append(
            title,
            close
        );


        const displaySection =
            document.createElement(
                'div'
            );


        displaySection.className =
            'ainovel-character-section';


        const displayLabel =
            document.createElement(
                'div'
            );


        displayLabel.className =
            'ainovel-character-label';


        displayLabel.textContent =
            '表示設定';


        const sizeText =
            document.createElement(
                'div'
            );


        sizeText.className =
            'ainovel-character-description';


        sizeText.textContent =
            '画像サイズ';


        const sizeRange =
            document.createElement(
                'input'
            );


        sizeRange.type =
            'range';


        sizeRange.min =
            '20';


        sizeRange.max =
            '120';


        sizeRange.step =
            '1';


        sizeRange.value =
            String(
                iconSize
            );


        const sizeValue =
            document.createElement(
                'div'
            );


        sizeValue.className =
            'ainovel-character-value';


        sizeValue.textContent =
            iconSize +
            'px';


        sizeRange.addEventListener(

            'input',

            function () {

                iconSize =
                    Number(
                        sizeRange.value
                    );


                sizeValue.textContent =
                    iconSize +
                    'px';


                saveDisplaySettings();

            }

        );


        const gapText =
            document.createElement(
                'div'
            );


        gapText.className =
            'ainovel-character-description';


        gapText.textContent =
            '画像と名前の間隔';


        const gapRange =
            document.createElement(
                'input'
            );


        gapRange.type =
            'range';


        gapRange.min =
            '0';


        gapRange.max =
            '40';


        gapRange.step =
            '1';


        gapRange.value =
            String(
                iconGap
            );


        const gapValue =
            document.createElement(
                'div'
            );


        gapValue.className =
            'ainovel-character-value';


        gapValue.textContent =
            iconGap +
            'px';


        gapRange.addEventListener(

            'input',

            function () {

                iconGap =
                    Number(
                        gapRange.value
                    );


                gapValue.textContent =
                    iconGap +
                    'px';


                saveDisplaySettings();

            }

        );


        displaySection.append(
            displayLabel,
            sizeText,
            sizeRange,
            sizeValue,
            gapText,
            gapRange,
            gapValue
        );


        const fileSection =
            document.createElement(
                'div'
            );


        fileSection.className =
            'ainovel-character-section';


        const fileLabel =
            document.createElement(
                'div'
            );


        fileLabel.className =
            'ainovel-character-label';


        fileLabel.textContent =
            '① キャラ画像を選択';


        const fileDescription =
            document.createElement(
                'div'
            );


        fileDescription.className =
            'ainovel-character-description';


        fileDescription.textContent =
            'JPG / PNG / WebPなどをまとめて選択できます。';


        const fileInput =
            document.createElement(
                'input'
            );


        fileInput.type =
            'file';


        fileInput.accept =
            'image/*';


        fileInput.multiple =
            true;


        fileInput.hidden =
            true;


        const fileButton =
            document.createElement(
                'button'
            );


        fileButton.type =
            'button';


        fileButton.className =
            'ainovel-character-action';


        fileButton.textContent =
            '画像をまとめて選択';


        const fileStatus =
            document.createElement(
                'div'
            );


        fileStatus.className =
            'ainovel-character-status';


        fileStatus.textContent =
            `選択中：${selectedFiles.size}枚`;


        fileButton.addEventListener(

            'click',

            function () {

                fileInput.click();

            }

        );


        fileInput.addEventListener(

            'change',

            function () {

                for (
                    const file
                    of fileInput.files
                ) {

                    selectedFiles.set(
                        file.name,
                        file
                    );

                }


                fileStatus.textContent =
                    `選択中：${selectedFiles.size}枚`;

            }

        );


        fileSection.append(
            fileLabel,
            fileDescription,
            fileButton,
            fileInput,
            fileStatus
        );


        const mapSection =
            document.createElement(
                'div'
            );


        mapSection.className =
            'ainovel-character-section';


        const mapLabel =
            document.createElement(
                'div'
            );


        mapLabel.className =
            'ainovel-character-label';


        mapLabel.textContent =
            '② 名前と画像を貼り付け';


        const mapDescription =
            document.createElement(
                'div'
            );


        mapDescription.className =
            'ainovel-character-description';


        mapDescription.innerHTML =
            '1行につき <b>名前=画像ファイル名</b><br>' +
            '例：<br>' +
            'ミラ=mira.jpg<br>' +
            'アイリ=airi.jpg<br>' +
            'ルカ=luka.jpg';


        const mapArea =
            document.createElement(
                'textarea'
            );


        mapArea.value =
            mappingText();


        mapArea.placeholder =
`ミラ=mira.jpg
アイリ=airi.jpg
ルカ=luka.jpg`;


        const mapRow =
            document.createElement(
                'div'
            );


        mapRow.className =
            'ainovel-character-row';


        const apply =
            document.createElement(
                'button'
            );


        apply.type =
            'button';


        apply.className =
            'ainovel-character-action ainovel-character-main';


        apply.textContent =
            '一括反映';


        const result =
            document.createElement(
                'div'
            );


        result.className =
            'ainovel-character-status';


        mapRow.append(
            apply
        );


        mapSection.append(
            mapLabel,
            mapDescription,
            mapArea,
            mapRow,
            result
        );


        const listSection =
            document.createElement(
                'div'
            );


        listSection.className =
            'ainovel-character-section';


        const listLabel =
            document.createElement(
                'div'
            );


        listLabel.className =
            'ainovel-character-label';


        listLabel.textContent =
            '登録済みキャラクター';


        const list =
            document.createElement(
                'div'
            );


        list.className =
            'ainovel-character-register-list';


        listSection.append(
            listLabel,
            list
        );


        apply.addEventListener(

            'click',

            async function () {

                const parsed =
                    parseMapping(
                        mapArea.value
                    );


                if (
                    parsed
                        .errors
                        .length
                ) {

                    result.textContent =
                        parsed
                            .errors
                            .join(
                                '\n'
                            );


                    result.style.color =
                        '#a93232';


                    return;

                }


                let savedImages =
                    0;


                for (
                    const file
                    of selectedFiles
                        .values()
                ) {

                    try {

                        await putImage(
                            file.name,
                            file
                        );


                        savedImages++;

                    }

                    catch (error) {

                        console.error(
                            '[Character Images] image save error:',
                            error
                        );

                    }

                }


                characterMap =
                    parsed.result;


                saveJson(
                    MAP_STORAGE_KEY,
                    characterMap
                );


                removeAllInlineImages();


                result.style.color =
                    '#245e43';


                result.textContent =
                    `反映しました：${Object.keys(characterMap).length}人 / 画像${savedImages}枚保存`;


                await renderRegisteredList(
                    list
                );


                scheduleUpdate(
                    0
                );

            }

        );


        panel.append(
            header,
            displaySection,
            fileSection,
            mapSection,
            listSection
        );


        overlay.appendChild(
            panel
        );


        document.body.appendChild(
            overlay
        );


        overlay.addEventListener(

            'click',

            function (
                event
            ) {

                if (
                    event.target ===
                    overlay
                ) {

                    overlay.remove();

                }

            }

        );


        renderRegisteredList(
            list
        );

    }


    function startWatchdog() {

        setInterval(

            function () {

                bindTextObserver();


                if (
                    Object.keys(
                        characterMap
                    ).length
                ) {

                    scheduleUpdate(
                        0
                    );

                }


                ensureSettingsButton();

            },

            1500

        );

    }


    async function initialize() {

        try {

            await openDatabase();

        }

        catch (error) {

            console.error(
                '[Character Images] IndexedDB error:',
                error
            );


            return;

        }


        loadCharacterMap();


        loadDisplaySettings();


        ensureSettingsButton();


        setupRootObserver();


        bindTextObserver();


        startWatchdog();


        startStatesWatcher();


        scheduleUpdate(
            0
        );


        console.log(
            '[Character Images] stable fullscreen version ready'
        );

    }


    window.addEventListener(

        'beforeunload',

        function () {

            for (
                const url
                of objectUrlCache
                    .values()
            ) {

                try {

                    URL.revokeObjectURL(
                        url
                    );

                }

                catch (_) {}

            }


            objectUrlCache.clear();

        }

    );


    initialize();

})();