// ==UserScript==
// @name         ChatGPT キャラ画像表示＋一括設定
// @namespace    chatgpt-character-images
// @version      1.0.0
// @description  chatgpt.comのチャット本文の「名前「セリフ」」の前にキャラ画像を表示。名前=ファイル名の一括登録対応。（Claude版 1.3.0 からの移植）
// @author       Claude
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ===== ボタンの位置 =====
    /*
     * 🖼ボタンの位置です。
     * bottom を大きくすると上へ、小さくすると下へ動きます。
     * ChatGPTの入力欄と重なるときは bottom を大きくしてください。
     */
    const FAB = {
        bottom: 146,  // 下からの位置(px)
        right: 12,    // 右からの位置(px)
        size: 44      // ボタンの大きさ(px)
    };

    // ===== 定数 =====
    const DEFAULTS = {
        size: 32,          // 画像サイズ(px)
        gap: 6,            // 画像と文字の間隔(px)
        shape: 'round',    // round / rounded / square
        valign: 'center',  // center / top
        align: true,       // 地の文もセリフの位置にそろえる
        inline: true       // 段落の途中・リスト内のセリフにも表示
    };

    /*
     * 保存場所の名前はClaude版と同じにしています
     * （あとでChatGPT版の縦書き表示パネルがこの登録を読むため）。
     * ※サイトが違うので、登録内容そのものはClaude版とは別々です
     */
    const SETTINGS_KEY = 'claude_character_image_settings';
    const MAP_KEY = 'claude_character_image_map';
    const DB_NAME = 'claude_character_image_db';
    const DB_VERSION = 1;
    const STORE = 'images';
    const MAX_IMAGE_EDGE = 800; // 保存時に短辺をこのサイズまで縮小（軽量化）

    /*
     * ChatGPTの画面でメッセージ本文が入っている場所
     * （ChatGPT側の画面変更で変わる可能性あり）
     *
     * ChatGPTの返事 … マークダウン本文の入れ物
     *   （考え中の表示も同じ入れ物を使うので、薄い文字のもの＝考え中は除く）
     * あなたのメッセージ … 吹き出し
     */
    const ASSISTANT_ROOT = '[data-markdown-text-style="assistant-message"]:not([data-markdown-text-tone])';
    const USER_ROOT = '[data-user-message-bubble="true"]';
    const ROOT_SELECTORS = ASSISTANT_ROOT + ',' + USER_ROOT;

    /*
     * あなたのメッセージの本文（改行がそのまま入った1つの箱）
     */
    const USER_TEXT = '.whitespace-pre-wrap';

    const OPENERS = ['「', '『', '“', '"'];
    const BOUNDARY = /[\s。、！？!?」』）)…―：:]/;

    let settings = Object.assign({}, DEFAULTS);
    let characterMap = {};   // 名前 -> ファイル名
    let characters = [];     // [{ name, filename, id }]（名前の長い順）
    let db = null;
    let observer = null;
    let updateTimer = null;
    let urlMode = 'data';
    let imageOk = true;
    let generation = 0;
    const imageCache = new Map();   // ファイル名 -> dataURL
    const blobUrlCache = new Map(); // ファイル名 -> blob URL（CSPでdata:が使えない時用）
    const selectedFiles = new Map();

    // ===== スタイル（CSPに強い adoptedStyleSheets を優先） =====
    const BASE_CSS = `
        :root {
            --cc-size: ${DEFAULTS.size}px;
            --cc-gap: ${DEFAULTS.gap}px;
            --cc-radius: 50%;
        }

        /* 段落の先頭がセリフのとき：段落の左に画像 */
        p.cc-speech-block {
            position: relative !important;
            padding-left: calc(var(--cc-size) + var(--cc-gap)) !important;
        }
        p.cc-speech-block::before {
            content: "";
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: var(--cc-size);
            height: var(--cc-size);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            border-radius: var(--cc-radius);
            border: 1px solid rgba(255,255,255,0.8);
            box-shadow: 0 1px 4px rgba(0,0,0,0.35);
            box-sizing: border-box;
            pointer-events: none;
        }
        html:not(.cc-valign-top) p.cc-speech-block {
            padding-top: max(0px, calc((var(--cc-size) - 1lh) / 2)) !important;
            padding-bottom: max(0px, calc((var(--cc-size) - 1lh) / 2)) !important;
        }
        html.cc-valign-top p.cc-speech-block {
            min-height: var(--cc-size);
        }
        html.cc-valign-top p.cc-speech-block::before {
            top: 0;
            transform: none;
        }

        /* 地の文もそろえる */
        html.cc-align-on .cc-align-host {
            padding-left: calc(var(--cc-size) + var(--cc-gap)) !important;
            box-sizing: border-box;
        }
        html.cc-align-on .cc-align-host p.cc-speech-block {
            margin-left: calc(-1 * (var(--cc-size) + var(--cc-gap))) !important;
        }

        /* 段落の途中・リスト内・あなたのメッセージのセリフ用 */
        .cc-inline-icon {
            display: inline-block;
            width: var(--cc-size);
            height: var(--cc-size);
            margin-right: var(--cc-gap);
            vertical-align: middle;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            border-radius: var(--cc-radius);
            border: 1px solid rgba(255,255,255,0.8);
            box-shadow: 0 1px 4px rgba(0,0,0,0.35);
            box-sizing: border-box;
            user-select: none;
            pointer-events: none;
        }

        /* ===== 設定UI ===== */
        #cc-fab {
            position: fixed;
            right: ${FAB.right}px;
            bottom: ${FAB.bottom}px;
            z-index: 2147483640;
            width: ${FAB.size}px;
            height: ${FAB.size}px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 50%;
            background: #d0772f;
            color: #fff;
            font-size: 20px;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.4);
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
            touch-action: manipulation;
        }
        #cc-fab:active { background: #8a4a16; }

        #cc-panel {
            position: fixed;
            right: ${FAB.right}px;
            bottom: ${FAB.bottom + FAB.size + 64}px;
            z-index: 2147483645;
            width: min(420px, calc(100vw - 24px));
            max-height: calc(100vh - ${FAB.bottom + FAB.size + 64 + 12}px);
            overflow: auto;
            display: none;
            padding: 14px 14px 20px;
            border-radius: 16px;
            background: rgba(30, 26, 24, 0.97);
            color: #f7f3ef;
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 16px 40px rgba(0,0,0,0.45);
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            font-size: 14px;
            line-height: 1.5;
        }
        #cc-panel.active { display: block; }
        #cc-panel * { box-sizing: border-box; }

        .cc-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 14px;
        }
        .cc-title { font-size: 17px; font-weight: 700; }

        .cc-sub, .cc-main, .cc-delete {
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-family: inherit;
        }
        .cc-sub, .cc-delete {
            border: 1px solid rgba(255,255,255,0.18);
            background: rgba(255,255,255,0.08);
            color: inherit;
            padding: 8px 12px;
        }
        .cc-sub.cc-wide { width: 100%; margin-top: 8px; padding: 10px; }
        .cc-main {
            width: 100%;
            margin-top: 10px;
            padding: 12px 10px;
            border: none;
            background: #d97757;
            color: #fff;
            font-weight: 700;
        }

        .cc-section { margin-bottom: 18px; }
        .cc-section-title { margin-bottom: 6px; font-size: 14px; font-weight: 700; }
        .cc-desc { margin-bottom: 10px; font-size: 12px; line-height: 1.6; opacity: 0.78; white-space: pre-wrap; }

        .cc-input {
            width: 100%;
            padding: 9px 10px;
            border: 1px solid rgba(255,255,255,0.18);
            border-radius: 8px;
            background: rgba(255,255,255,0.06);
            color: inherit;
            font-size: 14px;
            font-family: inherit;
        }
        .cc-input option { color: #000; }
        #cc-map-input { min-height: 150px; resize: vertical; line-height: 1.6; }

        .cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cc-field { display: flex; flex-direction: column; gap: 6px; }
        .cc-range { width: 100%; accent-color: #d97757; margin: 4px 0; }
        .cc-slider-label { margin-top: 12px; font-size: 12px; opacity: 0.85; }
        .cc-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 4px; }
        .cc-step { padding: 6px 0 !important; }
        .cc-check { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; cursor: pointer; }

        .cc-preview {
            display: flex;
            align-items: center;
            margin-top: 10px;
            min-height: 64px;
            padding: 10px;
            border-radius: 8px;
            background: rgba(255,255,255,0.06);
        }
        #cc-preview-icon {
            display: inline-block;
            flex: 0 0 auto;
            width: var(--cc-size);
            height: var(--cc-size);
            margin-right: var(--cc-gap);
            border-radius: var(--cc-radius);
            background: rgba(217,119,87,0.5);
            border: 1px solid rgba(255,255,255,0.2);
        }

        #cc-file-status { margin-top: 8px; font-size: 12px; }
        .cc-box {
            display: none;
            margin-top: 8px;
            padding: 10px;
            border-radius: 8px;
            background: rgba(255,255,255,0.06);
            font-size: 12px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .cc-warning {
            display: none;
            margin-bottom: 12px;
            padding: 10px;
            border-radius: 8px;
            background: rgba(255,170,0,0.15);
            border: 1px solid rgba(255,170,0,0.4);
            font-size: 12px;
            line-height: 1.6;
        }

        #cc-list { display: flex; flex-direction: column; gap: 8px; }
        .cc-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 8px;
        }
        .cc-item-preview {
            width: 38px;
            height: 38px;
            min-width: 38px;
            border-radius: 50%;
            background-color: rgba(255,255,255,0.08);
            background-size: cover;
            background-position: center;
            border: 1px solid rgba(255,255,255,0.18);
        }
        .cc-item-info { flex: 1; min-width: 0; }
        .cc-item-name { font-weight: 700; }
        .cc-item-file {
            font-size: 12px;
            opacity: 0.7;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;

    function createSheetHolder() {
        const holder = { sheet: null, el: null };
        try {
            holder.sheet = new CSSStyleSheet();
        } catch (error) {
            holder.el = document.createElement('style');
        }
        return holder;
    }

    function setSheetText(holder, text) {
        if (holder.sheet) holder.sheet.replaceSync(text);
        else holder.el.textContent = text;
    }

    const baseSheet = createSheetHolder();
    const imageSheet = createSheetHolder();
    setSheetText(baseSheet, BASE_CSS);

    function ensureSheets() {
        const holders = [baseSheet, imageSheet];
        if (holders.every(function (h) { return h.sheet; })) {
            try {
                const current = document.adoptedStyleSheets;
                if (!current.includes(baseSheet.sheet) || !current.includes(imageSheet.sheet)) {
                    document.adoptedStyleSheets = current
                        .filter(function (s) { return s !== baseSheet.sheet && s !== imageSheet.sheet; })
                        .concat([baseSheet.sheet, imageSheet.sheet]);
                }
                return;
            } catch (error) {
                // adoptedStyleSheetsが使えない環境 → <style>要素に切り替え
                holders.forEach(function (h) {
                    const text = Array.from(h.sheet.cssRules).map(function (r) { return r.cssText; }).join('\n');
                    h.sheet = null;
                    h.el = document.createElement('style');
                    h.el.textContent = text;
                });
            }
        }
        holders.forEach(function (h) {
            if (h.el && !h.el.isConnected) document.documentElement.appendChild(h.el);
        });
    }

    // ===== DOMヘルパー =====
    function h(tag, props) {
        const el = document.createElement(tag);
        if (props) {
            for (const key of Object.keys(props)) {
                const value = props[key];
                if (value == null) continue;
                if (key === 'class') el.className = value;
                else if (key === 'text') el.textContent = value;
                else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
                else el.setAttribute(key, value);
            }
        }
        for (let i = 2; i < arguments.length; i++) {
            const child = arguments[i];
            if (child == null) continue;
            if (Array.isArray(child)) child.forEach(function (c) { if (c != null) el.append(c); });
            else el.append(child);
        }
        return el;
    }

    // ===== IndexedDB =====
    function openDatabase() {
        return new Promise(function (resolve, reject) {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function (event) {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
            };
            request.onsuccess = function () { db = request.result; resolve(); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function dbRequest(mode, action) {
        return new Promise(function (resolve, reject) {
            const store = db.transaction(STORE, mode).objectStore(STORE);
            const request = action(store);
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error); };
        });
    }

    function saveImage(filename, dataUrl) { return dbRequest('readwrite', function (s) { return s.put(dataUrl, filename); }); }
    function getImage(filename) { return dbRequest('readonly', function (s) { return s.get(filename); }).then(function (r) { return r || null; }); }
    function deleteImage(filename) { return dbRequest('readwrite', function (s) { return s.delete(filename); }).catch(function () {}); }
    function getAllKeys() { return dbRequest('readonly', function (s) { return s.getAllKeys(); }).then(function (k) { return k.map(String); }); }

    // ===== 画像処理 =====
    function readAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(file);
        });
    }

    // 画像を縮小してdataURL化（URLを経由しないのでCSPの影響を受けにくい）
    async function fileToDataUrl(file) {
        try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, MAX_IMAGE_EDGE / Math.min(bitmap.width, bitmap.height));
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
            if (bitmap.close) bitmap.close();
            const webp = canvas.toDataURL('image/webp', 0.9);
            if (webp.startsWith('data:image/webp')) return webp;
            return canvas.toDataURL('image/png');
        } catch (error) {
            return readAsDataUrl(file);
        }
    }

    function dataUrlToBlobUrl(dataUrl) {
        const comma = dataUrl.indexOf(',');
        const head = dataUrl.slice(0, comma);
        const mime = (head.match(/^data:([^;,]+)/) || [])[1] || 'image/png';
        const binary = atob(dataUrl.slice(comma + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
    }

    function testLoad(src) {
        return new Promise(function (resolve) {
            const image = new Image();
            const timer = setTimeout(function () { resolve(false); }, 3000);
            image.onload = function () { clearTimeout(timer); resolve(true); };
            image.onerror = function () { clearTimeout(timer); resolve(false); };
            image.src = src;
        });
    }

    // このページで data: と blob: のどちらの画像が表示できるか調べる
    async function detectUrlMode() {
        const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        if (await testLoad(gif)) { urlMode = 'data'; return true; }
        const blobUrl = dataUrlToBlobUrl(gif);
        const ok = await testLoad(blobUrl);
        URL.revokeObjectURL(blobUrl);
        urlMode = ok ? 'blob' : 'data';
        return ok;
    }

    function displayUrl(filename) {
        const dataUrl = imageCache.get(filename);
        if (!dataUrl) return null;
        if (urlMode === 'data') return dataUrl;
        if (!blobUrlCache.has(filename)) blobUrlCache.set(filename, dataUrlToBlobUrl(dataUrl));
        return blobUrlCache.get(filename);
    }

    function forgetImage(filename) {
        imageCache.delete(filename);
        if (blobUrlCache.has(filename)) {
            URL.revokeObjectURL(blobUrlCache.get(filename));
            blobUrlCache.delete(filename);
        }
    }

    // ===== 保存データ =====
    function loadMap() {
        try {
            characterMap = JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {};
        } catch (error) {
            characterMap = {};
        }
    }

    function saveMap() {
        localStorage.setItem(MAP_KEY, JSON.stringify(characterMap));
    }

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.round(number)));
    }

    function sanitizeSettings(raw) {
        raw = raw || {};
        return {
            size: clampNumber(raw.size, 16, 400, DEFAULTS.size),
            gap: clampNumber(raw.gap, 0, 100, DEFAULTS.gap),
            shape: ['round', 'rounded', 'square'].includes(raw.shape) ? raw.shape : DEFAULTS.shape,
            valign: ['center', 'top'].includes(raw.valign) ? raw.valign : DEFAULTS.valign,
            align: typeof raw.align === 'boolean' ? raw.align : DEFAULTS.align,
            inline: typeof raw.inline === 'boolean' ? raw.inline : DEFAULTS.inline
        };
    }

    function loadSettings() {
        try {
            settings = sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
        } catch (error) {
            settings = Object.assign({}, DEFAULTS);
        }
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function applyDisplaySettings() {
        const root = document.documentElement;
        root.style.setProperty('--cc-size', settings.size + 'px');
        root.style.setProperty('--cc-gap', settings.gap + 'px');
        root.style.setProperty('--cc-radius',
            settings.shape === 'square' ? '0px' : settings.shape === 'rounded' ? '8px' : '50%');
        root.classList.toggle('cc-align-on', settings.align);
        root.classList.toggle('cc-valign-top', settings.valign === 'top');

        const set = function (id, prop, value) {
            const el = document.getElementById(id);
            if (el) el[prop] = value;
        };
        set('cc-size', 'value', String(settings.size));
        set('cc-gap', 'value', String(settings.gap));
        set('cc-size-range', 'value', String(settings.size));
        set('cc-gap-range', 'value', String(settings.gap));
        set('cc-shape', 'value', settings.shape);
        set('cc-valign', 'value', settings.valign);
        set('cc-align', 'checked', settings.align);
        set('cc-inline', 'checked', settings.inline);
    }

    function updateSettingsFromUI() {
        const get = function (id) { return document.getElementById(id); };
        if (!get('cc-size')) return;
        const previousInline = settings.inline;
        settings = sanitizeSettings({
            size: get('cc-size').value,
            gap: get('cc-gap').value,
            shape: get('cc-shape').value,
            valign: get('cc-valign').value,
            align: get('cc-align').checked,
            inline: get('cc-inline').checked
        });
        applyDisplaySettings();
        saveSettings();
        if (previousInline !== settings.inline) {
            clearAll();
            scheduleUpdate();
        }
    }

    // ===== キャラ一覧の再構築 =====
    async function rebuildCharacters() {
        const names = Object.keys(characterMap).sort(function (a, b) { return b.length - a.length; });
        characters = [];
        for (let i = 0; i < names.length; i++) {
            const filename = characterMap[names[i]];
            if (!imageCache.has(filename)) {
                const dataUrl = await getImage(filename);
                if (dataUrl) imageCache.set(filename, dataUrl);
            }
            if (imageCache.has(filename)) {
                characters.push({ name: names[i], filename: filename, id: String(i) });
            }
        }
        const rules = characters.map(function (c) {
            const url = displayUrl(c.filename);
            if (!url) return '';
            return 'p.cc-speech-block[data-cc-id="' + c.id + '"]::before,' +
                '.cc-inline-icon[data-cc-id="' + c.id + '"]{background-image:url("' + url + '");}';
        }).join('\n');
        setSheetText(imageSheet, rules);
    }

    // ===== 本文の処理 =====
    function findOccurrences(text) {
        const hits = [];
        for (let i = 0; i < text.length; i++) {
            if (!OPENERS.includes(text[i])) continue;
            for (const c of characters) {
                const start = i - c.name.length;
                if (start < 0) continue;
                if (text.slice(start, i) !== c.name) continue;
                if (start > 0 && !BOUNDARY.test(text[start - 1])) continue;
                hits.push({ index: start, character: c });
                break;
            }
        }
        return hits;
    }

    /*
     * この段落に直接属するテキストだけ集める。
     * blockSelector … 段落とみなす入れ物（返事は p, li、あなたのメッセージは本文の箱）
     */
    function collectTextNodes(block, blockSelector) {
        const nodes = [];
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('pre, code, .cc-inline-icon, #cc-panel')) return NodeFilter.FILTER_REJECT;
                if (parent.closest(blockSelector) !== block) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node;
        while ((node = walker.nextNode())) nodes.push(node);
        return nodes;
    }

    /*
     * 段落の先頭がセリフかどうか。
     * ChatGPTは文章を細かい span に分けて表示するので、
     * 段落全体の文字をつなげてから調べます
     */
    function processParagraph(p, nodes) {
        const text = nodes.map(function (n) { return n.nodeValue; }).join('');
        const lead = text.length - text.trimStart().length;
        const hit = findOccurrences(text).find(function (o) { return o.index === lead; });

        if (hit) {
            p.classList.add('cc-speech-block');
            if (p.dataset.ccId !== hit.character.id) p.dataset.ccId = hit.character.id;

            // 段落の途中の処理で同じセリフに二重に画像を付けないように、位置を返す
            let offset = 0;
            for (const node of nodes) {
                const length = node.nodeValue.length;
                if (lead < offset + length) {
                    return { node: node, index: lead - offset };
                }
                offset += length;
            }
            return null;
        }

        if (p.classList.contains('cc-speech-block')) {
            p.classList.remove('cc-speech-block');
            delete p.dataset.ccId;
        }
        return null;
    }

    function processInline(nodes, skip) {
        for (const node of nodes) {
            if (!node.parentNode) continue;
            const hits = findOccurrences(node.nodeValue);
            for (let k = hits.length - 1; k >= 0; k--) {
                const hit = hits[k];
                if (skip && node === skip.node && hit.index === skip.index) continue;

                let target = node;
                let split = false;
                if (hit.index > 0) {
                    target = node.splitText(hit.index);
                    split = true;
                }
                const prev = target.previousSibling;
                if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.classList.contains('cc-inline-icon')) {
                    if (prev.dataset.ccId !== hit.character.id) prev.dataset.ccId = hit.character.id;
                    continue;
                }
                const icon = document.createElement('span');
                icon.className = 'cc-inline-icon';
                icon.dataset.ccId = hit.character.id;
                if (split) icon.dataset.ccSplit = '1';
                icon.setAttribute('aria-hidden', 'true');
                icon.setAttribute('contenteditable', 'false');
                target.parentNode.insertBefore(icon, target);
            }
        }
    }

    function getRoots() {
        const all = Array.from(document.querySelectorAll(ROOT_SELECTORS));
        return all.filter(function (el) {
            return !all.some(function (other) { return other !== el && other.contains(el); });
        });
    }

    /*
     * ChatGPTが返事を書いている途中かどうか（停止ボタンが出ているか）
     */
    function isGenerating() {
        return !!document.querySelector(
            'button[aria-label="停止"],' +
            'button[aria-label="Stop streaming"],' +
            '[data-testid="stop-button"]'
        );
    }

    /*
     * 生成中・非表示のメッセージには触らない
     */
    function isStreaming(root) {
        if (root.closest('[data-talvt-turn-state="in_progress"], [hidden], [inert]')) return true;
        if (root.closest('[data-d-streaming-reveal]') || root.querySelector('[data-d-streaming-reveal]')) return true;

        // 生成中は、いちばん最後のやりとりには触らない
        if (isGenerating()) {
            const turns = document.querySelectorAll('[data-turn-key]');
            const last = turns[turns.length - 1];
            if (last && last.contains(root)) return true;
        }
        return false;
    }

    function processBlock(block, blockSelector, allowLead) {
        if (block.closest('pre, code')) return;
        const signature = generation + ':' + block.textContent;
        if (block.__ccSignature === signature) return;

        const nodes = collectTextNodes(block, blockSelector);
        const skip = allowLead && block.tagName === 'P' ? processParagraph(block, nodes) : null;
        if (settings.inline) processInline(nodes, skip);
        block.__ccSignature = signature;
    }

    function processAll() {
        ensureSheets();
        if (!document.getElementById('cc-fab') && document.body) createUI();
        if (characters.length === 0) return;

        for (const root of getRoots()) {
            if (root.closest('#cc-panel')) continue;
            if (isStreaming(root)) continue;

            if (root.matches(USER_ROOT)) {
                // あなたのメッセージ：段落に分かれていないので、段落の途中と同じ表示にする
                root.querySelectorAll(USER_TEXT).forEach(function (block) {
                    processBlock(block, USER_TEXT, false);
                });
                continue;
            }

            root.classList.add('cc-align-host');

            root.querySelectorAll('p, li').forEach(function (block) {
                processBlock(block, 'p, li', true);
            });
        }
        if (observer) observer.takeRecords(); // 自分の変更で再実行しないように
    }

    function clearAll() {
        generation++;
        document.querySelectorAll('.cc-inline-icon').forEach(function (icon) {
            const prev = icon.previousSibling;
            const next = icon.nextSibling;
            const wasSplit = icon.dataset.ccSplit === '1';
            icon.remove();
            // 分割したテキストだけを元に戻す
            if (wasSplit && prev && next && prev.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
                prev.appendData(next.data);
                next.remove();
            }
        });
        document.querySelectorAll('.cc-speech-block').forEach(function (p) {
            p.classList.remove('cc-speech-block');
            delete p.dataset.ccId;
        });
        if (observer) observer.takeRecords();
    }

    function scheduleUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(function () {
            updateTimer = null;
            try {
                processAll();
            } catch (error) {
                console.error('[ChatGPT Character Images]', error);
            }
        }, 200);
    }

    function setupObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (m) {
                const target = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                return !(target && target.closest && target.closest('#cc-panel, #cc-fab'));
            });
            if (relevant) scheduleUpdate();
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-talvt-turn-state', 'data-d-streaming-reveal', 'hidden', 'aria-label']
        });

        /*
         * ChatGPTは画面の外に出たメッセージを外して、戻ってきたら作り直すので、
         * 念のため定期的にも確かめます（処理済みの段落は飛ばすので軽いです）
         */
        setInterval(scheduleUpdate, 2000);
    }

    // ===== ファイル選択 =====
    function normalizeFilename(filename) {
        return String(filename || '').trim().toLowerCase().replace(/\u3000/g, ' ');
    }

    function getFilenameBase(filename) {
        return normalizeFilename(filename).replace(/\.(jpe?g|png|webp|gif)$/i, '');
    }

    function findSelectedFile(requested) {
        requested = String(requested || '').trim();
        if (selectedFiles.has(requested)) return selectedFiles.get(requested);
        const norm = normalizeFilename(requested);
        for (const [name, file] of selectedFiles) if (normalizeFilename(name) === norm) return file;
        const base = getFilenameBase(requested);
        for (const [name, file] of selectedFiles) if (getFilenameBase(name) === base) return file;
        return null;
    }

    async function findStoredFilename(requested) {
        if (await getImage(requested)) return requested;
        const keys = await getAllKeys();
        const norm = normalizeFilename(requested);
        const base = getFilenameBase(requested);
        return keys.find(function (k) { return normalizeFilename(k) === norm; }) ||
            keys.find(function (k) { return getFilenameBase(k) === base; }) ||
            null;
    }

    function isImageFile(file) {
        return /^image\//.test(file.type || '') || /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');
    }

    // accept を付けると端末によっては写真ピッカーが開いて
    // ファイル名が数字に置き換わるので、付けずに開いて後から画像だけ拾う
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
        selectedFiles.clear();
        for (const file of fileInput.files) {
            if (isImageFile(file)) selectedFiles.set(file.name, file);
        }
        fileInput.value = '';
        updateFileStatus();
    });

    // 1人ずつ登録用（ファイル名に関係なく、選んだ画像をそのキャラに結びつける）
    const singleInput = document.createElement('input');
    singleInput.type = 'file';
    singleInput.style.display = 'none';
    let singleTargetName = null;
    singleInput.addEventListener('change', async function () {
        const file = singleInput.files[0];
        const name = singleTargetName;
        singleInput.value = '';
        singleTargetName = null;
        if (!file || !name) return;
        if (!isImageFile(file)) {
            showResult('⚠ 画像ファイル（JPG / PNG / WebP / GIF）を選んでね。');
            return;
        }
        try {
            await registerSingle(name, file);
        } catch (error) {
            console.error('[ChatGPT Character Images]', error);
            showResult('⚠ 保存中にエラーが出ちゃった：' + (error && error.message ? error.message : error));
        }
    });

    function pickImageFor(name) {
        singleTargetName = name;
        if (!singleInput.isConnected) document.documentElement.appendChild(singleInput);
        singleInput.click();
    }

    async function registerSingle(name, file) {
        const key = 'char:' + name;
        const oldFilename = characterMap[name];
        const dataUrl = await fileToDataUrl(file);
        await saveImage(key, dataUrl);
        forgetImage(key);
        imageCache.set(key, dataUrl);
        characterMap[name] = key;
        saveMap();
        if (oldFilename && oldFilename !== key && !Object.values(characterMap).includes(oldFilename)) {
            await deleteImage(oldFilename);
            forgetImage(oldFilename);
        }
        await rebuildCharacters();
        renderList();
        clearAll();
        scheduleUpdate();
        showResult('✓ ' + name + ' の画像を登録しました。');
    }

    function showResult(text) {
        const box = document.getElementById('cc-result');
        if (!box) return;
        box.style.display = 'block';
        box.textContent = text;
    }

    function updateFileStatus() {
        const status = document.getElementById('cc-file-status');
        const box = document.getElementById('cc-selected-files');
        if (status) status.textContent = '選択中：' + selectedFiles.size + '枚';
        if (!box) return;
        if (selectedFiles.size === 0) {
            box.style.display = 'none';
            box.textContent = '';
            return;
        }
        box.style.display = 'block';
        box.textContent = '認識したファイル名：\n' +
            Array.from(selectedFiles.keys()).map(function (n) { return '・' + n; }).join('\n');
    }

    function parseMapText(text) {
        const result = [];
        text.split(/\r?\n/).forEach(function (raw, i) {
            const line = raw.trim();
            if (!line) return;
            const separator = line.indexOf('=');
            if (separator === -1) {
                result.push({ error: (i + 1) + '行目：「=」がありません。' });
                return;
            }
            const name = line.slice(0, separator).trim();
            const filename = line.slice(separator + 1).trim();
            if (!name || !filename) {
                result.push({ error: (i + 1) + '行目：名前またはファイル名が空です。' });
                return;
            }
            result.push({ name: name, filename: filename });
        });
        return result;
    }

    async function applyBulkSettings() {
        const textarea = document.getElementById('cc-map-input');
        const resultBox = document.getElementById('cc-result');
        const button = document.getElementById('cc-apply');
        if (!textarea || !resultBox) return;
        if (button) { button.disabled = true; button.textContent = '反映中…'; }

        const messages = [];
        let successCount = 0;
        try {
            for (const entry of parseMapText(textarea.value)) {
                if (entry.error) {
                    messages.push('⚠ ' + entry.error);
                    continue;
                }
                const file = findSelectedFile(entry.filename);
                let actualFilename;

                if (file) {
                    actualFilename = file.name;
                    const dataUrl = await fileToDataUrl(file);
                    await saveImage(actualFilename, dataUrl);
                    forgetImage(actualFilename);
                    imageCache.set(actualFilename, dataUrl);
                } else {
                    actualFilename = await findStoredFilename(entry.filename);
                    if (!actualFilename) {
                        messages.push('⚠ ' + entry.name + '：' + entry.filename + ' が見つかりません');
                        continue;
                    }
                }

                characterMap[entry.name] = actualFilename;
                successCount++;
                if (actualFilename !== entry.filename) {
                    messages.push('✓ ' + entry.name + '：' + entry.filename + ' → ' + actualFilename);
                }
            }
            saveMap();
            await rebuildCharacters();
        } catch (error) {
            console.error('[ChatGPT Character Images]', error);
            messages.push('⚠ 保存中にエラーが出ちゃった：' + (error && error.message ? error.message : error));
        } finally {
            if (button) { button.disabled = false; button.textContent = '一括反映'; }
        }

        messages.unshift('✓ ' + successCount + '件を反映しました。');
        resultBox.style.display = 'block';
        resultBox.textContent = messages.join('\n');
        renderList();
        clearAll();
        scheduleUpdate();
    }

    function renderList() {
        const list = document.getElementById('cc-list');
        if (!list) return;
        list.replaceChildren();
        const entries = Object.entries(characterMap);
        if (entries.length === 0) {
            list.append(h('div', { text: 'まだ登録されていません。', style: 'opacity:0.7' }));
            return;
        }
        for (const [name, filename] of entries) {
            const url = displayUrl(filename);
            const preview = h('div', { class: 'cc-item-preview' });
            if (url) preview.style.backgroundImage = 'url("' + url + '")';

            const changeButton = h('button', {
                type: 'button',
                class: 'cc-delete',
                text: '画像変更',
                onclick: function () { pickImageFor(name); }
            });

            const deleteButton = h('button', {
                type: 'button',
                class: 'cc-delete',
                text: '削除',
                onclick: async function () {
                    delete characterMap[name];
                    saveMap();
                    if (!Object.values(characterMap).includes(filename)) {
                        await deleteImage(filename);
                        forgetImage(filename);
                    }
                    await rebuildCharacters();
                    renderList();
                    clearAll();
                    scheduleUpdate();
                }
            });

            list.append(h('div', { class: 'cc-item' },
                preview,
                h('div', { class: 'cc-item-info' },
                    h('div', { class: 'cc-item-name', text: name }),
                    h('div', {
                        class: 'cc-item-file',
                        text: (filename.startsWith('char:') ? '個別登録の画像' : filename) + (url ? ' ✓' : ' ⚠ 画像データなし')
                    })
                ),
                changeButton,
                deleteButton
            ));
        }
    }

    // ===== 設定UI =====
    function section(title, description) {
        const children = Array.prototype.slice.call(arguments, 2);
        return h('div', { class: 'cc-section' },
            h('div', { class: 'cc-section-title', text: title }),
            description ? h('div', { class: 'cc-desc', text: description }) : null,
            children
        );
    }

    function field(labelText, control) {
        return h('div', { class: 'cc-field' },
            h('label', { for: control.id, text: labelText }),
            control
        );
    }

    function createUI() {
        if (document.getElementById('cc-fab')) return;
        if (!fileInput.isConnected) document.documentElement.appendChild(fileInput);
        if (!singleInput.isConnected) document.documentElement.appendChild(singleInput);

        const singleNameInput = h('input', { type: 'text', id: 'cc-single-name', class: 'cc-input', placeholder: 'キャラ名（例：ミラ）' });

        const onChange = updateSettingsFromUI;
        const sizeInput = h('input', { type: 'number', id: 'cc-size', class: 'cc-input', min: '16', max: '400', step: '1', oninput: onChange, onchange: onChange });
        const gapInput = h('input', { type: 'number', id: 'cc-gap', class: 'cc-input', min: '0', max: '100', step: '1', oninput: onChange, onchange: onChange });
        const sizeRange = h('input', {
            type: 'range', id: 'cc-size-range', class: 'cc-range', min: '16', max: '400', step: '1',
            oninput: function () { sizeInput.value = sizeRange.value; onChange(); }
        });
        const gapRange = h('input', {
            type: 'range', id: 'cc-gap-range', class: 'cc-range', min: '0', max: '100', step: '1',
            oninput: function () { gapInput.value = gapRange.value; onChange(); }
        });
        const sizeStep = function (delta) {
            return h('button', {
                type: 'button', class: 'cc-sub cc-step', text: (delta > 0 ? '+' : '−') + Math.abs(delta),
                onclick: function () {
                    sizeInput.value = String(clampNumber(Number(sizeInput.value) + delta, 16, 400, DEFAULTS.size));
                    onChange();
                }
            });
        };
        const shapeSelect = h('select', { id: 'cc-shape', class: 'cc-input', onchange: onChange },
            h('option', { value: 'round', text: '丸' }),
            h('option', { value: 'rounded', text: '角丸' }),
            h('option', { value: 'square', text: '四角' })
        );
        const valignSelect = h('select', { id: 'cc-valign', class: 'cc-input', onchange: onChange },
            h('option', { value: 'center', text: '中央' }),
            h('option', { value: 'top', text: '上（1行目）' })
        );
        const alignCheck = h('input', { type: 'checkbox', id: 'cc-align', onchange: onChange });
        const inlineCheck = h('input', { type: 'checkbox', id: 'cc-inline', onchange: onChange });

        const warning = h('div', {
            class: 'cc-warning',
            text: '⚠ このページでは画像の表示がブロックされてるかも…。画像が出なかったら教えてね。'
        });
        warning.style.display = imageOk ? 'none' : 'block';

        const panel = h('div', { id: 'cc-panel' },
            h('div', { class: 'cc-header' },
                h('div', { class: 'cc-title', text: 'キャラ画像設定' }),
                h('button', { type: 'button', class: 'cc-sub', text: '閉じる', onclick: function () { panel.classList.remove('active'); } })
            ),
            warning,
            section('表示設定', 'チャット本文に出す画像の見た目を変えられるよ。自動保存されるね♪',
                h('div', { class: 'cc-grid' },
                    field('画像サイズ（px）', sizeInput),
                    field('画像と文字の間隔（px）', gapInput),
                    field('画像の形', shapeSelect),
                    field('画像の縦位置', valignSelect)
                ),
                h('div', { class: 'cc-slider-label', text: '画像サイズ（スライダー）' }),
                sizeRange,
                h('div', { class: 'cc-steps' }, sizeStep(-10), sizeStep(-1), sizeStep(1), sizeStep(10)),
                h('div', { class: 'cc-slider-label', text: '間隔（スライダー）' }),
                gapRange,
                h('label', { class: 'cc-check' }, alignCheck, '地の文もセリフの位置にそろえる'),
                h('label', { class: 'cc-check' }, inlineCheck, '段落の途中・リスト内のセリフにも表示'),
                h('div', { class: 'cc-preview' },
                    h('span', { id: 'cc-preview-icon' }),
                    h('span', { text: 'キャラ名「セリフ……」' })
                ),
                h('button', {
                    type: 'button',
                    class: 'cc-sub cc-wide',
                    text: '表示設定を初期値に戻す',
                    onclick: function () {
                        const previousInline = settings.inline;
                        settings = Object.assign({}, DEFAULTS);
                        applyDisplaySettings();
                        saveSettings();
                        if (previousInline !== settings.inline) { clearAll(); scheduleUpdate(); }
                    }
                })
            ),
            section('かんたん登録（1人ずつ）', 'キャラ名を入れて画像を選ぶだけ！ファイル名は関係ないから、名前が数字になっちゃう端末でもOKだよ♪',
                singleNameInput,
                h('button', {
                    type: 'button',
                    class: 'cc-main',
                    text: '画像を選んで登録',
                    onclick: function () {
                        const name = singleNameInput.value.trim();
                        if (!name) {
                            showResult('⚠ 先にキャラ名を入れてね。');
                            return;
                        }
                        pickImageFor(name);
                    }
                })
            ),
            section('① まとめて登録：キャラ画像を選択', 'JPG / PNG / WebP / GIF をまとめて選べるよ。保存するときに軽く縮小するね。',
                h('button', { type: 'button', class: 'cc-sub cc-wide', text: '画像をまとめて選択', onclick: function () { fileInput.click(); } }),
                h('div', { id: 'cc-file-status', text: '選択中：0枚' }),
                h('div', { id: 'cc-selected-files', class: 'cc-box' })
            ),
            section('② まとめて登録：名前と画像を貼り付け', '1行につき「名前=画像ファイル名」\n例：ミラ=mira.png',
                h('textarea', { id: 'cc-map-input', class: 'cc-input', placeholder: 'ミラ=mira.png\nレン=ren.jpg' }),
                h('button', { type: 'button', class: 'cc-main', id: 'cc-apply', text: '一括反映', onclick: applyBulkSettings }),
                h('div', { id: 'cc-result', class: 'cc-box' })
            ),
            section('登録済みキャラクター', null,
                h('div', { id: 'cc-list' })
            )
        );

        const fab = h('button', {
            id: 'cc-fab',
            type: 'button',
            title: 'キャラ画像設定',
            text: '🖼',
            onclick: function () {
                panel.classList.toggle('active');
                applyDisplaySettings();
                updateFileStatus();
                renderList();
            }
        });
        // 長押しメニューを出さない
        fab.addEventListener('contextmenu', function (event) { event.preventDefault(); });

        document.body.append(fab, panel);
        applyDisplaySettings();
    }

    // ===== 起動 =====
    async function initialize() {
        try {
            await openDatabase();
        } catch (error) {
            console.error('[ChatGPT Character Images] IndexedDB error:', error);
            return;
        }
        loadSettings();
        loadMap();
        imageOk = await detectUrlMode();
        await rebuildCharacters();
        ensureSheets();
        applyDisplaySettings();

        let retry = 0;
        const timer = setInterval(function () {
            retry++;
            if (document.body) {
                clearInterval(timer);
                createUI();
                setupObserver();
                scheduleUpdate();
                console.log('[ChatGPT Character Images] ready (image mode: ' + urlMode + ')');
            }
            if (retry >= 60) clearInterval(timer);
        }, 300);
    }

    initialize();
})();
