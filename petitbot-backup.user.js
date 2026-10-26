// ==UserScript==
// @name         AIのべりすと プチボット控え
// @namespace    yuuki490-ainovel
// @version      1.0
// @description  プチボット（名前・説明・プロンプト・出力先）をViolentmonkey側に控えておき、新しい作品でまとめて書き込む。プチボット設定欄の上に「控える」「書き込む」「一覧」ボタンを出す。書き込みは同じ名前のプチボットがあれば上書き、なければ空き枠か新しい枠に入れる
// @match        https://ai-novel.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const KEY_BOTS = 'ainovel_petitbot_backup'; // [{ name, overview, prompt, selector }]
  const BAR_ID = 'pbb_bar';
  const LIST_ID = 'pbb_list';
  const TOAST_ID = 'pbb_toast';

  /* ===================== 見た目 ===================== */
  const style = document.createElement('style');
  style.textContent = `
    #${BAR_ID} { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:6px 0 10px; font-family:sans-serif; }
    #${BAR_ID} button { border:1px solid #888; border-radius:8px; background:#f2f2f2; color:#222; padding:6px 12px; font-size:13px; font-weight:700; cursor:pointer; }
    #${BAR_ID} button.pbb_write { background:#1d5c8a; border-color:#1d5c8a; color:#fff; }
    #${BAR_ID} button:disabled { opacity:.5; }
    #${BAR_ID} .pbb_count { font-size:12px; color:#666; }
    #${LIST_ID} { display:none; width:100%; box-sizing:border-box; border:1px solid #ccc; border-radius:10px; background:#fff; color:#222; padding:8px; font-size:13px; }
    #${LIST_ID}.pbb_open { display:block; }
    #${LIST_ID} .pbb_row { display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid #eee; }
    #${LIST_ID} .pbb_row:last-child { border-bottom:none; }
    #${LIST_ID} .pbb_name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
    #${LIST_ID} .pbb_meta { flex:none; color:#777; font-size:11px; }
    #${LIST_ID} .pbb_del { flex:none; border:1px solid #c62828; border-radius:6px; background:#fbe9e7; color:#b71c1c; padding:2px 8px; font-size:12px; cursor:pointer; }
    #${LIST_ID} .pbb_none { color:#888; padding:6px 0; }
    #${TOAST_ID} { position:fixed; left:50%; bottom:70px; transform:translateX(-50%); z-index:99995; max-width:90vw; padding:8px 14px; border-radius:10px; color:#fff; font-size:14px; font-family:sans-serif; box-shadow:0 2px 10px rgba(0,0,0,.4); pointer-events:none; transition:opacity .3s; background:rgba(40,40,40,.92); }
  `;
  document.head.appendChild(style);

  /* ===================== 小物 ===================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(msg, color) {
    let el = document.getElementById(TOAST_ID);
    if (!el) { el = document.createElement('div'); el.id = TOAST_ID; document.body.appendChild(el); }
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

  function loadBots() {
    try {
      const v = GM_getValue(KEY_BOTS, []);
      return Array.isArray(v) ? v.filter((b) => b && typeof b.name === 'string' && b.name.trim()) : [];
    } catch (_) { return []; }
  }
  function saveBots(bots) {
    try { GM_setValue(KEY_BOTS, bots); } catch (e) { toast('控えを保存できなかったよ', 'rgba(204,0,0,.95)'); console.warn(e); }
  }

  /* ===================== 画面のプチボット ===================== */
  function areaIndexes() {
    const out = [];
    for (let i = 0; i < 100; i++) if (document.getElementById('petitbotarea' + i)) out.push(i);
    return out;
  }
  const el = (id, i) => document.getElementById(id + i);

  function readBot(i) {
    const name = el('petitbot_name', i);
    const overview = el('petitbot_overview', i);
    const prompt = el('petitbot_prompt', i);
    const sel = el('petitbot_output', i);
    return {
      name: (name ? name.value : '').trim(),
      overview: overview ? overview.value : '',
      prompt: prompt ? prompt.value : '',
      selector: sel ? sel.value : 'output_petitbot',
    };
  }

  function writeBot(i, bot) {
    const name = el('petitbot_name', i);
    const overview = el('petitbot_overview', i);
    const prompt = el('petitbot_prompt', i);
    const sel = el('petitbot_output', i);
    if (!name || !prompt) return false;
    name.value = bot.name; fireInput(name);
    if (overview) { overview.value = bot.overview || ''; fireInput(overview); }
    prompt.value = bot.prompt || ''; fireInput(prompt);
    if (sel && bot.selector) { sel.value = bot.selector; fireInput(sel); }
    const disp = el('petitbot_name_display', i);
    if (disp && !disp.textContent.trim()) disp.textContent = bot.name;
    return true;
  }

  function persist() {
    try {
      if (typeof W.HandlePetitbotEditorPersist === 'function') W.HandlePetitbotEditorPersist(true);
      else if (typeof W.PersistPetitbotCurrentMode === 'function') W.PersistPetitbotCurrentMode();
    } catch (e) { console.warn('[プチボット控え] 保存の呼び出しに失敗', e); }
  }

  // 空の枠（名前もプロンプトも空）を探す
  function findEmptyIndex() {
    return areaIndexes().find((i) => { const b = readBot(i); return !b.name && !b.prompt.trim(); });
  }

  // サイトの「＋」で枠を増やし、増えた空の枠の番号を返す
  async function addArea() {
    const before = areaIndexes();
    const last = before.length ? before[before.length - 1] : -1;
    if (typeof W.InsertPetitbot === 'function') {
      W.InsertPetitbot(last < 0 ? 0 : last);
    } else {
      const btn = last >= 0 && document.querySelector('#petitbotarea' + last + ' .icon_plus');
      if (!btn) throw new Error('プチボットを増やすボタンが見つからないよ');
      btn.closest('button').click();
    }
    const start = Date.now();
    while (areaIndexes().length <= before.length) {
      if (Date.now() - start > 5000) throw new Error('プチボットの枠を増やせなかったよ');
      await sleep(150);
    }
    const idx = findEmptyIndex();
    if (idx === undefined) throw new Error('増やした枠が見つからないよ');
    return idx;
  }

  /* ===================== 控える／書き込む ===================== */
  function backupNow() {
    const idxs = areaIndexes();
    if (!idxs.length) { toast('プチボットの設定欄が見つからないよ', 'rgba(204,0,0,.95)'); return; }
    const current = idxs.map(readBot).filter((b) => b.name && b.prompt.trim());
    if (!current.length) { toast('名前とプロンプトが入っているプチボットがないよ'); return; }
    const bots = loadBots();
    let added = 0, updated = 0;
    current.forEach((b) => {
      const k = bots.findIndex((x) => x.name === b.name);
      if (k >= 0) { bots[k] = b; updated++; } else { bots.push(b); added++; }
    });
    saveBots(bots);
    renderList();
    toast(`控えたよ（新しく${added}件、上書き${updated}件、合計${bots.length}件）`, 'rgba(45,138,52,.95)');
  }

  async function writeAll(button) {
    const bots = loadBots();
    if (!bots.length) { toast('控えがないよ。先に「控える」を押してね'); return; }
    if (!areaIndexes().length) { toast('プチボットの設定欄が見つからないよ', 'rgba(204,0,0,.95)'); return; }
    if (!confirm(`控えてある${bots.length}件のプチボットをこの作品に書き込むよ。同じ名前のものは上書き。いい？`)) return;
    button.disabled = true;
    let written = 0;
    try {
      for (const bot of bots) {
        let idx = areaIndexes().find((i) => readBot(i).name === bot.name);
        if (idx === undefined) idx = findEmptyIndex();
        if (idx === undefined) idx = await addArea();
        if (writeBot(idx, bot)) written++;
        await sleep(100);
      }
      persist();
      toast(`${written}件を書き込んだよ。保存されたか、プチボットの欄を見てね`, 'rgba(45,138,52,.95)');
    } catch (e) {
      persist();
      toast(e.message || String(e), 'rgba(204,0,0,.95)');
    } finally {
      button.disabled = false;
    }
  }

  /* ===================== 一覧 ===================== */
  function renderList() {
    const list = document.getElementById(LIST_ID);
    const count = document.querySelector('#' + BAR_ID + ' .pbb_count');
    if (!list) return;
    const bots = loadBots();
    if (count) count.textContent = `控え：${bots.length}件`;
    list.innerHTML = '';
    if (!bots.length) {
      const none = document.createElement('div');
      none.className = 'pbb_none';
      none.textContent = 'まだ控えがないよ';
      list.appendChild(none);
      return;
    }
    bots.forEach((b, k) => {
      const row = document.createElement('div');
      row.className = 'pbb_row';
      const name = document.createElement('span');
      name.className = 'pbb_name';
      name.textContent = b.name;
      name.title = (b.overview ? b.overview + '\n\n' : '') + b.prompt;
      const meta = document.createElement('span');
      meta.className = 'pbb_meta';
      meta.textContent = `${Array.from(b.prompt || '').length}字・${b.selector === 'output_assistant' ? '本文' : '専用欄'}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'pbb_del';
      del.textContent = '消す';
      del.addEventListener('click', () => {
        if (!confirm(`控えから「${b.name}」を消すよ。いい？`)) return;
        const arr = loadBots();
        arr.splice(k, 1);
        saveBots(arr);
        renderList();
      });
      row.append(name, meta, del);
      list.appendChild(row);
    });
  }

  /* ===================== ボタン ===================== */
  function ensureBar() {
    const content = document.getElementById('side_menu-petitbot-content');
    if (!content || document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    const backup = document.createElement('button');
    backup.type = 'button';
    backup.textContent = '控える';
    backup.title = 'この作品のプチボットをViolentmonkey側に控える（同じ名前は上書き）';
    backup.addEventListener('click', backupNow);
    const write = document.createElement('button');
    write.type = 'button';
    write.className = 'pbb_write';
    write.textContent = '書き込む';
    write.title = '控えてあるプチボットをこの作品に書き込む';
    write.addEventListener('click', () => writeAll(write));
    const show = document.createElement('button');
    show.type = 'button';
    show.textContent = '一覧';
    const count = document.createElement('span');
    count.className = 'pbb_count';
    const list = document.createElement('div');
    list.id = LIST_ID;
    show.addEventListener('click', () => { renderList(); list.classList.toggle('pbb_open'); });
    bar.append(backup, write, show, count, list);
    content.insertBefore(bar, content.firstChild);
    renderList();
  }

  ensureBar();
  setInterval(ensureBar, 2000);
})();
