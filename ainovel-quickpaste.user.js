// ==UserScript==
// @name         AIのべりすと QuickPaste
// @namespace    ainovelist-quickpaste
// @version      2.6
// @description  TXTのキャラ・用語一覧から、単体または複数の名前を入力欄へ挿入します。洗脳状態のキャラは色分け表示します。一覧の「本文から追加」でプチボット「新キャラ抽出」に本文を読ませ、辞書にない人物・用語を確認してから追加できます（TXT保存も可）
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
    /* 本文から追加：プチボットの名前に含まれる文字と、プロンプトの目印 */
    const EXTRACT_BOT_NAME = '新キャラ抽出';
    const EXTRACT_PLACEHOLDER = '（ここに登録済み一覧を貼り付ける）';
    const BOT_WAIT_TIMEOUT = 180000;
    const BOT_STABLE_MS = 4000;
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
        #qp_extract { margin-left:auto; border:1px solid #2d6a4f; border-radius:8px; background:#e6f4ea; color:#1b4332; font-size:.8rem; font-weight:700; padding:5px 10px; cursor:pointer; }
        #qp_extract:disabled { opacity:.5; }
        #qp_ex_overlay { position:fixed; inset:0; z-index:1000000; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box; }
        #qp_ex_box { width:min(520px,100%); max-height:88vh; display:flex; flex-direction:column; gap:8px; padding:12px; box-sizing:border-box; color:#222; background:#fff; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.45); font-family:sans-serif; }
        #qp_ex_box .qp_ex_title { font-weight:700; }
        #qp_ex_box .qp_ex_small { font-size:.78rem; color:#666; }
        #qp_ex_box textarea { flex:1; min-height:200px; width:100%; box-sizing:border-box; resize:none; border:1px solid #999; border-radius:10px; padding:8px; font-size:15px; line-height:1.6; }
        #qp_ex_box .qp_ex_row { display:flex; gap:7px; }
        #qp_ex_box .qp_ex_row button { flex:1; border:1px solid #888; border-radius:9px; background:#f2f2f2; color:#222; padding:10px 8px; font-size:15px; font-weight:700; cursor:pointer; }
        #qp_ex_box .qp_ex_add { background:#2196f3; border-color:#1976d2; color:#fff; }
        #qp_toast { position:fixed; left:50%; bottom:70px; transform:translateX(-50%); z-index:1000001; max-width:90vw; padding:8px 14px; border-radius:10px; color:#fff; font-size:14px; font-family:sans-serif; box-shadow:0 2px 10px rgba(0,0,0,.4); pointer-events:none; transition:opacity .3s; background:rgba(40,40,40,.92); }
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

    /* 清書補助パネルが開いていれば「起きること」欄、入力パネル（AIブロック追加）が開いていれば「書く場面」欄、どちらも閉じていれば今まで通りの入力欄 */
    function getInsertTarget() {
        const helperField = document.querySelector('#aib_overlay.aib-open #aib_helper.aib-open #aib_h_events');
        const panelField = document.querySelector('#aib_overlay.aib-open #aib_scene');
        return helperField || panelField || document.querySelector(TARGET_SELECTOR);
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
        const extract = document.createElement('button');
        extract.type = 'button';
        extract.id = 'qp_extract';
        extract.textContent = '本文から追加';
        extract.title = 'プチボット「' + EXTRACT_BOT_NAME + '」に本文を読ませて、辞書にない名前を探す';
        extract.addEventListener('click', () => extractFromStory(extract));
        header.append(title, extract, close);

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

    /* ===================== 本文から追加（プチボット） ===================== */
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let extracting = false;

    function toast(msg, color) {
        let el = document.getElementById('qp_toast');
        if (!el) { el = document.createElement('div'); el.id = 'qp_toast'; document.body.appendChild(el); }
        el.textContent = msg;
        el.style.background = color || 'rgba(40,40,40,.92)';
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = '0'; }, 4000);
    }

    function fireInput(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function persistPetitbots() {
        try {
            if (typeof window.HandlePetitbotEditorPersist === 'function') window.HandlePetitbotEditorPersist(true);
            else if (typeof window.PersistPetitbotCurrentMode === 'function') window.PersistPetitbotCurrentMode();
        } catch (_) {}
    }

    /* 目印がそろっているプロンプトを控えておき、目印が消えていたら控えから戻します */
    function ensureTemplate(promptEl, botName) {
        const key = 'ainovel-petitbot-template:' + botName;
        if (promptEl.value.includes(EXTRACT_PLACEHOLDER)) {
            try { localStorage.setItem(key, promptEl.value); } catch (_) {}
            return true;
        }
        let saved = null;
        try { saved = localStorage.getItem(key); } catch (_) {}
        if (saved && saved.includes(EXTRACT_PLACEHOLDER)) {
            promptEl.value = saved;
            fireInput(promptEl);
            persistPetitbots();
            return true;
        }
        return false;
    }

    function getBotName(i) {
        const input = document.getElementById('petitbot_name' + i);
        const disp = document.getElementById('petitbot_name_display' + i);
        return ((input && input.value) || (disp && disp.textContent) || '').trim();
    }
    function findBot(keyword) {
        for (let i = 0; i < 100; i++) {
            if (!document.getElementById('petitbotarea' + i)) continue;
            if (getBotName(i).includes(keyword)) return i;
        }
        return -1;
    }

    /* 実行ボタンを押す一瞬だけプロンプトを差し替えて、押した直後に元へ戻します（差し替えた中身は保存されません） */
    async function runBot(i, promptEl, tempText) {
        const out = document.getElementById('petitbot_output_assistant');
        const info = document.getElementById('petitbot_output_info');
        if (!out) throw new Error('プチボットの出力欄が見つからないよ');
        await sleep(1500);
        const area = document.getElementById('petitbotarea' + i);
        const execBtn = area && area.querySelector('.btn-petitbot-chat');
        if (!execBtn) throw new Error('プチボットの実行ボタンが見つからないよ');
        const waitStart = Date.now();
        while (execBtn.disabled || execBtn.getAttribute('aria-disabled') === 'true') {
            if (Date.now() - waitStart > 30000) throw new Error('プチボットの実行ボタンが押せる状態にならないよ');
            await sleep(500);
        }
        const beforeInfo = info ? info.textContent : '';
        const beforeVal = out.value;
        const livePrompt = document.getElementById('petitbot_prompt' + i) || promptEl;
        const orig = livePrompt.value;
        livePrompt.value = tempText;
        try { execBtn.click(); } finally { livePrompt.value = orig; }

        const start = Date.now();
        while (true) {
            await sleep(500);
            if ((info && info.textContent !== beforeInfo) || out.value !== beforeVal) break;
            if (Date.now() - start > BOT_WAIT_TIMEOUT) throw new Error('プチボットの出力が返ってこなかったよ');
        }
        let last = out.value;
        let lastChange = Date.now();
        while (true) {
            await sleep(500);
            if (out.value !== last) {
                last = out.value;
                lastChange = Date.now();
            } else if (info) {
                if (!info.textContent.includes('生成中') && info.textContent !== beforeInfo && Date.now() - lastChange >= 1500) break;
            } else if (last.trim() && Date.now() - lastChange >= BOT_STABLE_MS) {
                break;
            }
            if (Date.now() - start > BOT_WAIT_TIMEOUT) throw new Error('プチボットの出力が終わらなかったよ');
        }
        return out.value.trim();
    }

    /* プチボットの出力から「名前(説明)」の行だけ拾い、辞書にある名前は除きます */
    function pickNewEntries(output, existing) {
        const have = new Set(existing.map(item => normalizeName(item.name)));
        const seen = new Set();
        const lines = [];
        output.split(/\r?\n/).forEach(raw => {
            let line = raw.trim().replace(/^[・\-－−•*\d.、\s]+/, '').replace(/（/g, '(').replace(/）/g, ')');
            if (!line || /^なし$/.test(line) || /^[【\[]/.test(line)) return;
            const open = line.indexOf('(');
            const close = line.lastIndexOf(')');
            const name = (open > 0 && close > open ? line.slice(0, open) : line).trim();
            const desc = open > 0 && close > open ? line.slice(open + 1, close).trim() : '';
            if (!name || name.length > 30) return;
            const key = normalizeName(name);
            if (have.has(key) || seen.has(key)) return;
            seen.add(key);
            lines.push(desc ? `${name}(${desc})` : name);
        });
        return lines;
    }

    function downloadText(text, filename) {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || 'quickpaste.txt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function mergedText(addLines) {
        const base = loadText().replace(/\s+$/, '');
        return (base ? base + '\n' : '') + addLines.join('\n') + '\n';
    }

    function showExtractConfirm(lines) {
        document.querySelector('#qp_ex_overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'qp_ex_overlay';
        const box = document.createElement('div');
        box.id = 'qp_ex_box';
        const title = document.createElement('div');
        title.className = 'qp_ex_title';
        title.textContent = `本文から見つかった新しい名前（${lines.length}件）`;
        const small = document.createElement('div');
        small.className = 'qp_ex_small';
        small.textContent = '1行1つ「名前(簡易説明)」。要らない行は消して、説明は直してOK。「追加」で辞書の末尾に入ります。「TXTで保存」は追加後の辞書をファイルにします（元のTXTは変わらないので、読み直すと追加分が消えます）';
        const ta = document.createElement('textarea');
        ta.value = lines.join('\n');
        const row = document.createElement('div');
        row.className = 'qp_ex_row';
        const getLines = () => ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const add = document.createElement('button');
        add.type = 'button'; add.className = 'qp_ex_add'; add.textContent = '辞書に追加';
        add.addEventListener('click', () => {
            const ls = getLines();
            if (!ls.length) { toast('追加する行がないよ'); return; }
            saveText(mergedText(ls), loadFileName());
            overlay.remove();
            toast(`${ls.length}件を辞書に追加したよ`, 'rgba(45,138,52,.95)');
            showMenu();
        });
        const save = document.createElement('button');
        save.type = 'button'; save.textContent = 'TXTで保存';
        save.addEventListener('click', () => {
            const ls = getLines();
            downloadText(mergedText(ls), loadFileName() || 'quickpaste.txt');
        });
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.textContent = 'キャンセル';
        cancel.addEventListener('click', () => overlay.remove());
        row.append(add, save, cancel);
        box.append(title, small, ta, row);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    async function extractFromStory(button) {
        if (extracting) return;
        extracting = true;
        if (button) button.disabled = true;
        let promptEl = null;
        let originalPrompt = null;
        try {
            const loading = document.getElementById('loading_anim');
            if (loading && window.getComputedStyle(loading).display !== 'none') throw new Error('本文の生成が終わってから押してね');
            const idx = findBot(EXTRACT_BOT_NAME);
            if (idx < 0) throw new Error('「' + EXTRACT_BOT_NAME + '」のプチボットが見つからないよ');
            const sel = document.getElementById('petitbot_output' + idx);
            if (!sel || sel.value !== 'output_petitbot') throw new Error('プチボットの出力先を「プチボット専用欄」にしてね');
            promptEl = document.getElementById('petitbot_prompt' + idx);
            if (!promptEl || !ensureTemplate(promptEl, getBotName(idx))) throw new Error('プロンプトに目印「' + EXTRACT_PLACEHOLDER + '」がないよ');

            const existing = parseCharacters(loadText());
            const listText = existing.length ? existing.map(item => item.name).join('、') : '（まだなし）';
            toast('本文から新しい名前を探してるよ…');
            originalPrompt = promptEl.value;
            const filled = originalPrompt.replace(EXTRACT_PLACEHOLDER, listText);
            let result;
            try { result = await runBot(idx, promptEl, filled); } finally { promptEl.value = originalPrompt; originalPrompt = null; }
            const lines = pickNewEntries(result || '', existing);
            if (!lines.length) { toast('新しい名前は見つからなかったよ'); return; }
            showExtractConfirm(lines);
        } catch (e) {
            toast(e.message || String(e), 'rgba(204,0,0,.95)');
        } finally {
            if (originalPrompt !== null && promptEl) promptEl.value = originalPrompt;
            if (button) button.disabled = false;
            extracting = false;
        }
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
