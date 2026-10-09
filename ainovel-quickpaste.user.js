
// ==UserScript==
// @name         AIのべりすと QuickPaste
// @namespace    ainovelist-quickpaste
// @version      2.4.0
// @description  TXTのキャラ・用語一覧から、単体または複数の名前を入力欄へ挿入します。洗脳状態のキャラは色分け表示します
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const KEY_TEXT = 'ainovelist_charlist_text';
    const KEY_FILE = 'ainovelist_charlist_filename';
    const KEY_HIGHLIGHTS = 'ainovelist_quickpaste_highlights';
    /* Grok文章コピー側が localStorage に書き出す洗脳状態一覧（雷花=洗脳状態 形式） */
    const KEY_BRAINWASH = 'ainovel_brainwash_states';
    const TARGET_SELECTOR = '#chat_field';
    const DEFAULT_SEPARATOR = 'と';

    let selected = new Set();
    let separator = DEFAULT_SEPARATOR;
    let ending = '';
    let lastSelectionStart = null;
    let lastSelectionEnd = null;
    let currentCharacters = [];
    let currentBox = null;
    const checkNodes = new Map();

    const style = document.createElement('style');
    style.textContent = `
        #qp_overlay { position:fixed; inset:0; z-index:999999; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box; }
        #qp_box { width:min(520px,100%); max-height:88vh; display:flex; flex-direction:column; overflow:hidden; color:#222; background:#fff; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.45); font-family:sans-serif; }
        #qp_header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 14px; border-bottom:1px solid #ddd; font-weight:700; }
        #qp_filename { margin-left:8px; color:#777; font-size:.72rem; font-weight:400; }
        #qp_close { border:0; background:transparent; color:#555; font-size:1.5rem; cursor:pointer; padding:2px 8px; }
        #qp_list { flex:1; overflow-y:auto; padding:12px; }
        .qp_row { display:flex; align-items:stretch; gap:6px; margin-bottom:9px; }
        .qp_check { width:24px; margin:0; flex:none; }
        .qp_order { flex:none; width:20px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#fff; background:#2d509e; border-radius:50%; height:20px; align-self:center; visibility:hidden; }
        .qp_item { flex:1; min-width:0; padding:10px 12px; text-align:left; border:1px solid #aaa; border-radius:9px; background:#f4f4f4; color:#171717; cursor:pointer; }
        .qp_item.qp_highlight { background:#fff3c4; border:2px solid #ff9800; }
        .qp_item.qp_brainwashed { background:#f3e5ff; border:2px solid #9c27b0; }
        .qp_item.qp_brainwashed .qp_name { color:#6a1b9a; }
        .qp_item.qp_highlight.qp_brainwashed { background:linear-gradient(90deg,#fff3c4,#f3e5ff); border-color:#9c27b0; }
        .qp_state { display:inline-block; margin-left:6px; padding:1px 7px; font-size:.7rem; font-weight:700; color:#fff; background:#9c27b0; border-radius:10px; vertical-align:middle; }
        .qp_name { display:block; font-size:1.05rem; font-weight:700; }
        .qp_description { display:block; margin-top:3px; color:#666; font-size:.82rem; }
        #qp_empty { padding:22px 8px; color:#888; text-align:center; }
        #qp_tools { flex:none; padding:10px 12px; border-top:1px solid #ccc; background:#eaf5ff; }
        #qp_preview { max-height:3.2em; overflow:auto; margin-bottom:7px; word-break:break-all; font-size:.9rem; }
        .qp_label { margin:7px 0 4px; font-size:.78rem; font-weight:700; }
        .qp_choices { display:flex; gap:5px; overflow-x:auto; padding-bottom:3px; }
        .qp_choice { flex:none; border:1px solid #888; border-radius:7px; background:#fff; color:#222; padding:5px 10px; cursor:pointer; }
        .qp_choice.qp_active { border-color:#1976d2; background:#2196f3; color:#fff; font-weight:700; }
        .qp_actions { display:flex; gap:7px; margin-top:10px; }
        .qp_action { border:0; border-radius:8px; padding:9px 11px; cursor:pointer; font-weight:700; }
        #qp_paste { flex:1; background:#2196f3; color:#fff; }
        #qp_clear { background:#eee; color:#222; }
        #qp_clear_highlights { background:#ffe0b2; color:#222; }
        .qp_page_button { margin-left:4px; }
        @media (max-width:450px) { #qp_box { max-height:92vh; } #qp_list { padding:8px; } .qp_item { padding:9px; } }
    `;
    document.head.appendChild(style);

    function loadText() { return localStorage.getItem(KEY_TEXT) || ''; }
    function loadFileName() { return localStorage.getItem(KEY_FILE) || ''; }
    function saveText(text, filename) {
        localStorage.setItem(KEY_TEXT, text);
        localStorage.setItem(KEY_FILE, filename || '');
    }
    function loadHighlights() {
        try { return new Set(JSON.parse(localStorage.getItem(KEY_HIGHLIGHTS) || '[]')); }
        catch (_) { return new Set(); }
    }
    function saveHighlights(values) {
        localStorage.setItem(KEY_HIGHLIGHTS, JSON.stringify([...values]));
    }

    /* 洗脳状態一覧から「=」より左の名前だけを集めます（「洗脳状態なし」の行は捨てます） */
    function loadBrainwashed() {
        const set = new Set();
        let raw = '';
        try { raw = localStorage.getItem(KEY_BRAINWASH) || ''; } catch (_) { return set; }
        raw.split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.trim();
            const separator = line.indexOf('=');
            if (separator < 1) return;
            const name = line.slice(0, separator).trim();
            const state = line.slice(separator + 1).trim();
            if (name && state && !/なし/.test(state)) set.add(name);
        });
        return set;
    }

    /*
     * 一覧側がフルネーム、洗脳状態側が下の名前だけでも一致させます。
     * 空白・全角空白・「・」を除いた上で、完全一致 または 片方がもう片方を含めば一致。
     * 1文字だけの名前は誤爆しやすいので完全一致のみ。
     */
    function normalizeName(name) { return String(name || '').replace(/[\s\u3000・]/g, ''); }
    function matchBrainwashed(fullName, brainwashed) {
        const full = normalizeName(fullName);
        if (!full) return false;
        for (const raw of brainwashed) {
            const short = normalizeName(raw);
            if (!short) continue;
            if (short === full) return true;
            if (short.length >= 2 && (full.includes(short) || short.includes(full))) return true;
        }
        return false;
    }

    function parseCharacters(text) {
        return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
            const open = line.indexOf('(');
            const close = line.lastIndexOf(')');
            if (open > 0 && close > open) {
                return { name: line.slice(0, open).trim(), description: line.slice(open + 1, close).trim() };
            }
            return { name: line, description: '' };
        }).filter(item => item.name);
    }

    function characterKey(item) { return `${item.name}\u001f${item.description}`; }

    function rememberSelection() {
        const target = document.querySelector(TARGET_SELECTOR);
        if (!target || document.activeElement !== target) return;
        lastSelectionStart = target.selectionStart;
        lastSelectionEnd = target.selectionEnd;
    }

    /* 入力パネル（AIブロック追加）が開いているときはパネルのユーザー欄、閉じているときは今まで通りの入力欄 */
    function getInsertTarget() {
        const panelField = document.querySelector('#aib_overlay.aib-open #aib_user');
        return panelField || document.querySelector(TARGET_SELECTOR);
    }

    function insertIntoChat(text) {
        const target = getInsertTarget();
        if (!target) {
            navigator.clipboard?.writeText(text).catch(() => {});
            alert('入力欄が見つからないため、可能であればクリップボードへコピーしました。');
            return false;
        }
        /* 常に文末へ追記します（カーソル位置は使いません） */
        const length = target.value.length;
        target.setRangeText(text, length, length, 'end');
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.focus();
        lastSelectionStart = target.selectionStart;
        lastSelectionEnd = target.selectionEnd;
        return true;
    }

    function combinedText(characters) {
        const byKey = new Map(characters.map(item => [characterKey(item), item.name]));
        const names = [...selected].map(key => byKey.get(key)).filter(Boolean);
        return names.length ? names.join(separator) + ending : '';
    }

    /* チェックした順番の番号バッジを更新します */
    function refreshOrderBadges() {
        const order = [...selected];
        checkNodes.forEach((node, key) => {
            const index = order.indexOf(key);
            node.badge.textContent = index >= 0 ? String(index + 1) : '';
            node.badge.style.visibility = index >= 0 ? 'visible' : 'hidden';
        });
    }

    /* 一覧を作り直さずにツール欄だけ差し替えます（スクロール位置が保たれます） */
    function refreshTools() {
        if (!currentBox) return;
        currentBox.querySelector('#qp_tools')?.remove();
        if (selected.size) currentBox.appendChild(makeTools(currentCharacters));
        refreshOrderBadges();
    }

    function makeChoice(label, value, current, onChoose) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `qp_choice${value === current ? ' qp_active' : ''}`;
        button.textContent = label;
        button.addEventListener('click', () => onChoose(value));
        return button;
    }

    function showMenu() {
        document.querySelector('#qp_overlay')?.remove();
        const characters = parseCharacters(loadText());
        const validKeys = new Set(characters.map(characterKey));
        selected = new Set([...selected].filter(key => validKeys.has(key)));
        const highlights = loadHighlights();
        const brainwashed = loadBrainwashed();
        currentCharacters = characters;
        checkNodes.clear();

        const overlay = document.createElement('div');
        overlay.id = 'qp_overlay';
        const box = document.createElement('div');
        box.id = 'qp_box';
        currentBox = box;
        const header = document.createElement('div');
        header.id = 'qp_header';
        const title = document.createElement('div');
        title.textContent = 'キャラ一覧';
        const filename = loadFileName();
        if (filename) {
            const name = document.createElement('span');
            name.id = 'qp_filename';
            name.textContent = filename;
            title.appendChild(name);
        }
        const close = document.createElement('button');
        close.type = 'button';
        close.id = 'qp_close';
        close.textContent = '×';
        close.addEventListener('click', () => overlay.remove());
        header.append(title, close);

        const list = document.createElement('div');
        list.id = 'qp_list';
        if (!characters.length) {
            const empty = document.createElement('div');
            empty.id = 'qp_empty';
            empty.textContent = 'まだ一覧がありません。「読込」からTXTファイルを選択してください。';
            list.appendChild(empty);
        }
        characters.forEach(item => {
            const key = characterKey(item);
            const row = document.createElement('div');
            row.className = 'qp_row';
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.className = 'qp_check';
            check.checked = selected.has(key);
            const badge = document.createElement('span');
            badge.className = 'qp_order';
            check.addEventListener('change', () => {
                check.checked ? selected.add(key) : selected.delete(key);
                refreshTools();
            });
            const button = document.createElement('button');
            button.type = 'button';
            const isBrainwashed = matchBrainwashed(item.name, brainwashed);
            button.className = `qp_item${highlights.has(key) ? ' qp_highlight' : ''}${isBrainwashed ? ' qp_brainwashed' : ''}`;
            const name = document.createElement('span');
            name.className = 'qp_name';
            name.textContent = item.name;
            if (isBrainwashed) {
                const state = document.createElement('span');
                state.className = 'qp_state';
                state.textContent = '洗脳中';
                name.appendChild(state);
            }
            button.appendChild(name);
            if (item.description) {
                const description = document.createElement('span');
                description.className = 'qp_description';
                description.textContent = item.description;
                button.appendChild(description);
            }
            let holdTimer = null;
            let held = false;
            button.addEventListener('click', event => {
                if (held) {
                    event.preventDefault();
                    held = false;
                    return;
                }
                if (insertIntoChat(item.name)) {
                    selected.clear(); separator = DEFAULT_SEPARATOR; ending = ''; overlay.remove();
                }
            });
            button.addEventListener('contextmenu', event => {
                event.preventDefault();
                highlights.has(key) ? highlights.delete(key) : highlights.add(key);
                saveHighlights(highlights);
                button.classList.toggle('qp_highlight', highlights.has(key));
            });
            const cancelHold = () => { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; };
            button.addEventListener('pointerdown', () => {
                held = false;
                holdTimer = setTimeout(() => {
                    held = true;
                    highlights.has(key) ? highlights.delete(key) : highlights.add(key);
                    saveHighlights(highlights);
                    button.classList.toggle('qp_highlight', highlights.has(key));
                }, 550);
            });
            button.addEventListener('pointerup', event => { cancelHold(); if (held) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
            button.addEventListener('pointercancel', cancelHold);
            button.addEventListener('pointerleave', cancelHold);
            checkNodes.set(key, { check, badge });
            row.append(check, badge, button);
            list.appendChild(row);
        });

        box.append(header, list);
        if (selected.size) box.appendChild(makeTools(characters));
        overlay.appendChild(box);
        overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        refreshOrderBadges();
    }

    function makeTools(characters) {
        const tools = document.createElement('div');
        tools.id = 'qp_tools';
        const preview = document.createElement('div');
        preview.id = 'qp_preview';
        preview.textContent = `選択中：${selected.size}件（チェック順）　${combinedText(characters)}`;
        tools.appendChild(preview);

        const sepLabel = document.createElement('div');
        sepLabel.className = 'qp_label'; sepLabel.textContent = '名前の間';
        const sepChoices = document.createElement('div');
        sepChoices.className = 'qp_choices';
        ['、', 'と', 'や', 'の', 'が', 'は', 'を', 'に', 'へ', 'も', '・', ' '].forEach(value => {
            sepChoices.appendChild(makeChoice(value === ' ' ? '空白' : value, value, separator, next => { separator = next; refreshTools(); }));
        });
        tools.append(sepLabel, sepChoices);

        const endLabel = document.createElement('div');
        endLabel.className = 'qp_label'; endLabel.textContent = '最後';
        const endChoices = document.createElement('div');
        endChoices.className = 'qp_choices';
        ['', 'は', 'が', 'を', 'に', 'へ', 'と', 'も', 'の', 'で', 'から', 'まで'].forEach(value => {
            endChoices.appendChild(makeChoice(value || 'なし', value, ending, next => { ending = next; refreshTools(); }));
        });
        tools.append(endLabel, endChoices);

        const actions = document.createElement('div');
        actions.className = 'qp_actions';
        const paste = document.createElement('button');
        paste.type = 'button'; paste.id = 'qp_paste'; paste.className = 'qp_action'; paste.textContent = '選択したワードを貼り付け';
        paste.addEventListener('click', () => {
            const text = combinedText(characters);
            if (text && insertIntoChat(text)) { selected.clear(); separator = DEFAULT_SEPARATOR; ending = ''; document.querySelector('#qp_overlay')?.remove(); }
        });
        const clear = document.createElement('button');
        clear.type = 'button'; clear.id = 'qp_clear'; clear.className = 'qp_action'; clear.textContent = '解除';
        clear.addEventListener('click', () => {
            selected.clear(); separator = DEFAULT_SEPARATOR; ending = '';
            checkNodes.forEach(node => { node.check.checked = false; });
            refreshTools();
        });
        actions.append(paste, clear);
        tools.appendChild(actions);
        return tools;
    }

    function triggerFileLoad() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.txt,text/plain'; input.hidden = true;
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) { input.remove(); return; }
            const reader = new FileReader();
            reader.onload = () => {
                const text = String(reader.result || '');
                const count = parseCharacters(text).length;
                saveText(text, file.name);
                selected.clear();
                alert(`「${file.name}」を${count}件として読み込みました。`);
                input.remove();
            };
            reader.onerror = () => { alert('ファイルの読み込みに失敗しました。'); input.remove(); };
            reader.readAsText(file, 'utf-8');
        });
        document.body.appendChild(input);
        input.click();
    }

    function makePageButton(id, label, handler) {
        const button = document.createElement('input');
        button.type = 'button'; button.id = id; button.value = label;
        button.className = 'btn-square retryoptions_btn qp_page_button';
        button.addEventListener('click', handler);
        return button;
    }

    function setup(container) {
        if (container.querySelector('#qp_show_btn')) return;
        const undo = container.querySelector('#undo');
        const redo = container.querySelector('#redo');
        if (undo) undo.style.display = 'none';
        if (redo) redo.style.display = 'none';
        const show = makePageButton('qp_show_btn', 'キャラ一覧', showMenu);
        const load = makePageButton('qp_load_btn', '読込', triggerFileLoad);
        (undo || container.lastElementChild)?.insertAdjacentElement('afterend', show) || container.appendChild(show);
        show.insertAdjacentElement('afterend', load);
    }

    function init() {
        const target = document.querySelector(TARGET_SELECTOR);
        if (target) {
            ['focus', 'click', 'keyup', 'select', 'input'].forEach(type => target.addEventListener(type, rememberSelection));
        }
        const found = document.querySelector('#retryoptions');
        if (found) setup(found);
        const observer = new MutationObserver(() => {
            const container = document.querySelector('#retryoptions');
            if (container) setup(container);
        });
        observer.observe(document.body, { childList:true, subtree:true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
    else init();
})();
