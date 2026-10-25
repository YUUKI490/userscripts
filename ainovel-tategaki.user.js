// ==UserScript==
// @name         AIのべりすと 縦書き表示
// @namespace    yuuki490-ainovel
// @version      1.6
// @description  本文（ユーザーのブロックを除く）を縦書きにして、画面にかぶせるパネルで表示する。生成が終わると自動で更新。パネルからAIブロック追加の入力パネルを開ける。文字の大きさと行間はパネルの⚙で変えられる。鈎括弧で始まる行は折り返した列を括弧1文字分下げる。生成直後に残る &color(){} の記法は表示しない。本文の生成中はパネルの背景をピンクにする。⚙の中の「最後の生成を消す」で最後のAIブロックとその前の指示ブロックを消せる。⚙の下の→で最後のAIブロックの先頭に飛ぶ。開くのは画面の仮ボタン（縦）から
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 設定 ===================== */
  const CONFIG = {
    fontSize: 19,      // 文字の大きさ(px)
    lineHeight: 1.9,   // 行間
    fontFamily: '"Noto Serif JP", "Noto Serif CJK JP", "Source Han Serif JP", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", serif',
    background: '#fbf8f0',
    generatingBackground: '#fde4ec', // 本文の生成中の背景色
    color: '#222222',
    renderDelay: 300,  // 本文が変わってから作り直すまでの待ち時間(ms)
    pollInterval: 1500, // 開いている間、本文が変わっていないか確かめる間隔(ms)
    followMargin: 60,  // 最新（左端）を見ているとみなす余白(px)
  };

  const OPEN_BTN_ID = 'ainovel-tategaki-btn';
  const OVERLAY_ID = 'ainovel-tategaki-overlay';
  const SCROLLER_ID = 'ainovel-tategaki-scroller';
  const CLOSE_ID = 'ainovel-tategaki-close';
  const INPUT_ID = 'ainovel-tategaki-input';
  const OPEN_CLASS = 'ainovel-tategaki-open';
  const KEY_OPEN = 'ainovel_tategaki_open';
  const KEY_VIEW = 'ainovel_tategaki_view'; // { fontSize, lineHeight }
  const SET_BTN_ID = 'ainovel-tategaki-setbtn';
  const SET_BOX_ID = 'ainovel-tategaki-setbox';
  const JUMP_BTN_ID = 'ainovel-tategaki-jump';
  const AI_HEAD_ID = 'ainovel-tategaki-ai-head';
  const AI_HEAD_MARK = '\u2063'; // 最後のAIブロックの先頭行に付ける見えない印
  const FONT_MIN = 12, FONT_MAX = 36, LH_MIN = 1.2, LH_MAX = 3.0;
  const AIB_BTN_ID = 'ainovel-add-ai-block-btn'; // AIブロック追加の仮ボタン
  const LOADING_ID = 'loading_anim'; // 生成中に表示されるアニメーション
  const GENERATING_CLASS = 'tg-generating';

  /* ===================== 見た目 ===================== */
  const style = document.createElement('style');
  style.textContent = `
    #${OPEN_BTN_ID} { position:fixed; left:8px; bottom:180px; z-index:99980; width:48px; height:48px; border-radius:50%; border:1px solid #000; background:#3d3d3d; color:#fff; font-size:20px; font-family:serif; line-height:1; padding:0; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.4); opacity:.85; }

    #${OVERLAY_ID} { display:none; position:fixed; inset:0; width:100vw; height:100vh; height:100dvh; z-index:99985; background:${CONFIG.background}; color:${CONFIG.color}; box-sizing:border-box; }
    body.${OPEN_CLASS} #${OVERLAY_ID} { display:block; }
    #${OVERLAY_ID}.tg-generating { background:${CONFIG.generatingBackground}; }
    body.${OPEN_CLASS} { overflow:hidden !important; }

    #${SCROLLER_ID} {
      position:absolute; inset:0; overflow-x:auto; overflow-y:hidden; -webkit-overflow-scrolling:touch;
      writing-mode:vertical-rl; -webkit-writing-mode:vertical-rl; text-orientation:mixed;
      font-family:${CONFIG.fontFamily}; font-size:var(--tg-font, ${CONFIG.fontSize}px); line-height:var(--tg-lh, ${CONFIG.lineHeight}); letter-spacing:.02em;
      -webkit-text-size-adjust:none; text-size-adjust:none;
      line-break:strict; word-break:normal; overflow-wrap:anywhere;
      padding:12px 1.6em 1.6em 60px; box-sizing:border-box; text-align:start;
    }
    #${SCROLLER_ID} .tg-line, #${SCROLLER_ID} .tg-empty { margin:0; padding:0; font-size:var(--tg-font, ${CONFIG.fontSize}px); line-height:var(--tg-lh, ${CONFIG.lineHeight}); font-family:${CONFIG.fontFamily}; }
    /* 鈎括弧で始まる行：折り返した列は括弧1文字分だけ下から始める（ぶら下げ）。--tg-hang はキャラ画像も読む */
    #${SCROLLER_ID} .tg-line.tg-hang { --tg-hang:1em; padding-top:var(--tg-hang); text-indent:calc(-1 * var(--tg-hang)); }
    #${SCROLLER_ID} .tg-tcy { text-combine-upright:all; -webkit-text-combine:horizontal; }
    #${SCROLLER_ID} rt { font-size:.5em; }
    #${SCROLLER_ID} .tg-none { writing-mode:horizontal-tb; color:#999; font-size:15px; padding:24px; }

    #${CLOSE_ID} { position:absolute; top:8px; left:8px; z-index:1; width:40px; height:40px; border:none; border-radius:50%; background:rgba(0,0,0,.08); color:#444; font-size:20px; line-height:40px; padding:0; text-align:center; cursor:pointer; }
    #${SET_BTN_ID} { position:absolute; top:56px; left:8px; z-index:1; width:40px; height:40px; border:none; border-radius:50%; background:rgba(0,0,0,.08); color:#444; font-size:20px; line-height:40px; padding:0; text-align:center; cursor:pointer; }
    #${JUMP_BTN_ID} { position:absolute; top:104px; left:8px; z-index:1; width:40px; height:40px; border:none; border-radius:50%; background:rgba(0,0,0,.08); color:#444; font-size:20px; line-height:40px; padding:0; text-align:center; cursor:pointer; }
    #${SET_BOX_ID} { display:none; position:absolute; top:152px; left:8px; z-index:2; writing-mode:horizontal-tb; background:#fff; color:#222; border:1px solid #ccc; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.25); padding:10px 12px; font-family:sans-serif; font-size:14px; }
    #${SET_BOX_ID}.tg-open { display:block; }
    #${SET_BOX_ID} .tg-row { display:flex; align-items:center; gap:8px; margin:4px 0; }
    #${SET_BOX_ID} .tg-name { width:5em; font-weight:700; }
    #${SET_BOX_ID} .tg-val { min-width:3.5em; text-align:center; }
    #${SET_BOX_ID} button { width:40px; height:36px; border:1px solid #888; border-radius:8px; background:#f2f2f2; color:#222; font-size:18px; cursor:pointer; padding:0; }
    #${SET_BOX_ID} button.tg-del { width:auto; padding:0 12px; font-size:14px; background:#fbe9e7; border-color:#c62828; color:#b71c1c; }
    #${SET_BOX_ID} button.tg-del:disabled { opacity:.4; }
    #${INPUT_ID} { position:absolute; left:12px; bottom:calc(12px + env(safe-area-inset-bottom, 0px)); z-index:1; height:42px; min-width:100px; padding:6px 14px; border:none; border-radius:21px; background:rgba(0,0,0,.62); color:#fff; font-size:15px; line-height:30px; writing-mode:horizontal-tb; box-sizing:border-box; cursor:pointer; }
  `;
  document.head.appendChild(style);

  /* ===================== 本文の読み取り ===================== */
  // ユーザーのブロックは除き、テキストとAIのブロックだけを読む
  function readNovelText() {
    const root = document.getElementById('data_container');
    if (!root) return '';
    const parts = [];
    let lastAi = -1;
    root.querySelectorAll('.data_edit.plaintext, .data_edit.assistant').forEach((edit) => {
      const raw = edit.getAttribute('data-raw-markdown');
      const text = cleanText(stripColor((raw !== null ? raw : (edit.innerText || '')).replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\n+$/, '')));
      if (!text.trim()) return;
      parts.push(text);
      if (edit.classList.contains('assistant')) lastAi = parts.length - 1;
    });
    // 最後のAIブロックの先頭行に印を付ける（→ボタンで飛ぶ先）
    if (lastAi >= 0) parts[lastAi] = AI_HEAD_MARK + parts[lastAi];
    return parts.join('\n');
  }

  // 生成直後の data-raw-markdown に残る &color(colorAIonce){文字}; の記法を、中の文字だけにする（終わりの ; も消す）
  function stripColor(text) {
    if (text.indexOf('&color(') === -1) return text;
    let prev;
    do {
      prev = text;
      text = text.replace(/&color\([^()]*\)\{([^{}]*)\};?/g, '$1');
    } while (text !== prev);
    // 閉じ括弧がまだ来ていない途中の記法は、頭の部分だけ消す
    return text.replace(/&color\([^()]*\)\{/g, '');
  }

  // @/* 〜 @*/ のコメントと、@ で始まる行は表示しない
  function cleanText(text) {
    const out = [];
    let inComment = false;
    text.split('\n').forEach((line) => {
      const head = line.trim();
      if (head.startsWith('@/*')) { inComment = true; return; }
      if (head.startsWith('@*/')) { inComment = false; return; }
      if (inComment || head.startsWith('@')) return;
      out.push(line);
    });
    return out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  }

  /* ===================== 縦書き用の整形 ===================== */
  function escapeHtml(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const ruby = (base, reading) => '<ruby>' + base + '<rt>' + reading + '</rt></ruby>';

  // ・半角数字1〜2桁、!! !? などは縦中横　・半角の ! ? 単体は全角に
  // ・ルビ：[[rb:漢字 > かんじ]]、｜漢字《かんじ》、漢字《かんじ》
  function formatLine(raw) {
    let html = escapeHtml(raw);
    html = html.replace(/(^|[^0-9A-Za-z.,])([0-9]{1,2})(?![0-9A-Za-z.,])/g, (all, before, d) => before + '<span class="tg-tcy">' + d + '</span>');
    html = html.replace(/[!?！？]{2}|[!?]/g, (m) => {
      if (m.length === 2) return '<span class="tg-tcy">' + m.replace(/！/g, '!').replace(/？/g, '?') + '</span>';
      return m === '!' ? '！' : '？';
    });
    html = html.replace(/\[\[rb:\s*(.+?)\s*&gt;\s*(.+?)\s*\]\]/g, (a, b, r) => ruby(b, r));
    html = html.replace(/[｜|]([^｜|《》]+?)《([^《》]+?)》/g, (a, b, r) => ruby(b, r));
    html = html.replace(/([一-鿿㐀-䶿々〆ヶ]+)《([^《》]+?)》/g, (a, b, r) => ruby(b, r));
    return html;
  }

  // 鈎括弧（「『（〈《【）で始まる行、または「名前「〜」」のように短い名前のあとに括弧が来る行
  const HANG_RE = /^[\s　]*(?:[^「『（〈《【\s　]{1,12})?[「『（〈《【]/;

  function buildHtml(text) {
    if (!text) return '<div class="tg-none">表示できる本文がありません</div>';
    return text.split('\n').map((line) => {
      let id = '';
      if (line.startsWith(AI_HEAD_MARK)) { line = line.slice(AI_HEAD_MARK.length); id = ' id="' + AI_HEAD_ID + '"'; }
      if (!line.trim()) return '<div class="tg-empty"' + id + '>　</div>';
      const cls = HANG_RE.test(line) ? 'tg-line tg-hang' : 'tg-line';
      return '<div class="' + cls + '"' + id + '>' + formatLine(line) + '</div>';
    }).join('');
  }

  /* ===================== パネル ===================== */
  let overlay = null;
  let scroller = null;
  let lastText = null;
  let renderTimer = null;

  /* ===================== 文字の大きさと行間 ===================== */
  let view = loadView();

  function loadView() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(KEY_VIEW) || '{}') || {}; } catch (_) {}
    const f = Number(v.fontSize);
    const l = Number(v.lineHeight);
    return {
      fontSize: Number.isFinite(f) ? Math.min(FONT_MAX, Math.max(FONT_MIN, f)) : CONFIG.fontSize,
      lineHeight: Number.isFinite(l) ? Math.min(LH_MAX, Math.max(LH_MIN, l)) : CONFIG.lineHeight,
    };
  }
  function saveView() { try { localStorage.setItem(KEY_VIEW, JSON.stringify(view)); } catch (_) {} }

  function applyView() {
    if (!scroller) return;
    scroller.style.setProperty('--tg-font', view.fontSize + 'px');
    scroller.style.setProperty('--tg-lh', String(view.lineHeight));
    const box = document.getElementById(SET_BOX_ID);
    if (box) {
      box.querySelector('[data-v="font"]').textContent = view.fontSize + 'px';
      box.querySelector('[data-v="lh"]').textContent = view.lineHeight.toFixed(1);
    }
  }

  function changeView(kind, dir) {
    if (kind === 'font') view.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, view.fontSize + dir));
    else view.lineHeight = Math.min(LH_MAX, Math.max(LH_MIN, Math.round((view.lineHeight + dir * 0.1) * 10) / 10));
    saveView();
    applyView();
    // キャラ画像なども入れ直せるように、本文を作り直す（読んでいた位置はそのまま）
    lastText = null;
    render(false);
  }

  function buildSettings() {
    const btn = document.createElement('button');
    btn.id = SET_BTN_ID;
    btn.type = 'button';
    btn.textContent = '⚙';
    btn.setAttribute('aria-label', '文字の大きさと行間');
    const box = document.createElement('div');
    box.id = SET_BOX_ID;
    box.innerHTML = `
      <div class="tg-row"><span class="tg-name">文字</span><button type="button" data-k="font" data-d="-1">−</button><span class="tg-val" data-v="font"></span><button type="button" data-k="font" data-d="1">＋</button></div>
      <div class="tg-row"><span class="tg-name">行間</span><button type="button" data-k="lh" data-d="-1">−</button><span class="tg-val" data-v="lh"></span><button type="button" data-k="lh" data-d="1">＋</button></div>
      <div class="tg-row"><span class="tg-name">最後の生成</span><button type="button" class="tg-del" data-k="del">消す（AI＋指示）</button></div>`;
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.toggle('tg-open'); });
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      if (b.dataset.k === 'del') { deleteLastGeneration(b); return; }
      changeView(b.dataset.k, Number(b.dataset.d));
    });
    return [btn, box];
  }

  /* ===================== 最後の生成（AIブロック＋指示ブロック）を消す ===================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getBlocks = () => Array.from(document.querySelectorAll('#data_container .data_block'));

  function blockCategory(block) {
    const cat = block.querySelector('.category');
    const c = cat && cat.getAttribute('data-category');
    if (c) return c;
    const edit = block.querySelector('.data_edit');
    if (!edit) return '';
    if (edit.classList.contains('assistant')) return 'assistant';
    if (edit.classList.contains('user')) return 'user';
    return 'plaintext';
  }

  function isVisible(el) {
    if (!el) return false;
    const css = window.getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  }

  async function clickDialogOkIfShown() {
    const start = Date.now();
    while (Date.now() - start < 1500) {
      const dlg = document.getElementById('dialog_box');
      if (dlg && (dlg.open || isVisible(dlg))) {
        const ok = document.getElementById('dialog_btn_ok');
        if (ok) { ok.click(); return true; }
      }
      await sleep(100);
    }
    return false;
  }

  // のべりすとのゴミ箱ボタンを押して、ブロックが減るまで待つ
  async function deleteBlock(index) {
    const blocks = getBlocks();
    const block = blocks[index];
    if (!block) return false;
    const trash = block.querySelector('.icon_trash_witag');
    if (!trash) return false;
    const before = blocks.length;
    trash.click();
    await clickDialogOkIfShown();
    const start = Date.now();
    while (getBlocks().length >= before) {
      if (Date.now() - start > 5000) return false;
      await sleep(200);
    }
    return true;
  }

  async function deleteLastGeneration(button) {
    if (isGenerating()) { alert('本文の生成が終わってから押してね'); return; }
    const blocks = getBlocks();
    const aiIndex = blocks.length - 1;
    if (aiIndex < 0 || blockCategory(blocks[aiIndex]) !== 'assistant') { alert('本文の最後がAIブロックじゃないので消さないよ'); return; }
    const userIndex = aiIndex - 1;
    const hasUser = userIndex >= 0 && blockCategory(blocks[userIndex]) === 'user';
    const edit = blocks[aiIndex].querySelector('.data_edit');
    const head = ((edit && edit.getAttribute('data-raw-markdown')) || '').trim().split('\n')[0];
    const shown = Array.from(head).slice(0, 30).join('');
    if (!confirm('最後のAIブロック' + (hasUser ? 'と、その前の指示ブロック' : '') + 'を消すよ。いい？\n\n' + shown + '…')) return;
    button.disabled = true;
    try {
      // 後ろから消す（先にAIブロック、次に指示ブロック）
      const okAi = await deleteBlock(aiIndex);
      const okUser = hasUser ? await deleteBlock(userIndex) : true;
      if (!okAi || !okUser) alert('ブロックの削除が一部できなかったよ');
    } finally {
      button.disabled = false;
      lastText = null;
      render(true);
    }
  }

  /* ===================== 最後のAIブロックの先頭に飛ぶ ===================== */
  function jumpToAiHead() {
    if (!scroller) return;
    const el = document.getElementById(AI_HEAD_ID);
    if (!el) return;
    // 縦書き（右から左）では block の先頭＝右端。その行が右端に来るように寄せる
    el.scrollIntoView({ block: 'start', inline: 'nearest' });
    scroller.scrollLeft = Math.min(0, scroller.scrollLeft + view.fontSize * 1.6);
  }

  function buildPanel() {
    if (overlay && document.body.contains(overlay)) return;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    scroller = document.createElement('div');
    scroller.id = SCROLLER_ID;

    const close = document.createElement('button');
    close.id = CLOSE_ID;
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', '縦書きを閉じる');
    close.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closePanel(); });

    const input = document.createElement('button');
    input.id = INPUT_ID;
    input.type = 'button';
    input.textContent = '✍ 入力';
    input.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const aib = document.getElementById(AIB_BTN_ID);
      if (aib) { aib.click(); return; }
      input.textContent = 'AIブロック追加が見つからないよ';
      setTimeout(() => { input.textContent = '✍ 入力'; }, 2500);
    });

    const [setBtn, setBox] = buildSettings();

    const jump = document.createElement('button');
    jump.id = JUMP_BTN_ID;
    jump.type = 'button';
    jump.textContent = '→';
    jump.title = '最後のAIブロックの先頭へ';
    jump.setAttribute('aria-label', '最後のAIブロックの先頭へ');
    jump.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); jumpToAiHead(); });

    overlay.appendChild(scroller);
    overlay.appendChild(close);
    overlay.appendChild(setBtn);
    overlay.appendChild(jump);
    overlay.appendChild(setBox);
    overlay.appendChild(input);
    document.body.appendChild(overlay);
    applyView();
  }

  const isOpen = () => document.body.classList.contains(OPEN_CLASS);

  // 縦書き（右から左）は左端が最新。scrollLeft は 0（右端）からマイナス方向に増える
  const maxScroll = () => Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const isAtEnd = () => Math.abs(scroller.scrollLeft) >= maxScroll() - CONFIG.followMargin;
  const scrollToEnd = () => { scroller.scrollLeft = -maxScroll(); };

  function render(force) {
    if (!isOpen() || !scroller) return;
    const text = readNovelText();
    if (!force && text === lastText) return;
    const follow = force || isAtEnd();
    const keep = scroller.scrollLeft;
    lastText = text;
    scroller.innerHTML = buildHtml(text);
    requestAnimationFrame(() => {
      if (follow) scrollToEnd(); else scroller.scrollLeft = keep;
    });
  }

  /* ===================== 生成中の背景色 ===================== */
  function isGenerating() {
    const el = document.getElementById(LOADING_ID);
    if (!el) return false;
    const css = window.getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  }

  function updateGenerating() {
    if (!overlay) return;
    overlay.classList.toggle(GENERATING_CLASS, isGenerating());
  }

  function scheduleRender() {
    if (!isOpen()) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => render(false), CONFIG.renderDelay);
  }

  function saveOpen(on) { try { localStorage.setItem(KEY_OPEN, on ? '1' : '0'); } catch (_) {} }
  function loadOpen() { try { return localStorage.getItem(KEY_OPEN) === '1'; } catch (_) { return false; } }

  function openPanel() {
    buildPanel();
    document.body.classList.add(OPEN_CLASS);
    saveOpen(true);
    updateGenerating();
    render(true);
  }

  function closePanel() {
    clearTimeout(renderTimer);
    document.body.classList.remove(OPEN_CLASS);
    saveOpen(false);
  }

  /* ===================== 仮ボタン（パレットを作り直すまでの間） ===================== */
  function ensureOpenButton() {
    if (!document.getElementById('data_container') || document.getElementById(OPEN_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = OPEN_BTN_ID;
    btn.title = '縦書きで表示';
    btn.textContent = '縦';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPanel(); });
    document.body.appendChild(btn);
  }

  /* ===================== 本文の変化を見張る ===================== */
  let watched = null;
  const observer = new MutationObserver(scheduleRender);

  function watchContainer() {
    const c = document.getElementById('data_container');
    if (!c || c === watched) return;
    observer.disconnect();
    observer.observe(c, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-raw-markdown'] });
    watched = c;
  }

  // 前回、縦書きを開いたまま終わっていたら、本文欄ができしだい開き直す
  let restored = false;
  function restoreOpen() {
    if (restored || !document.getElementById('data_container')) return;
    restored = true;
    if (loadOpen()) openPanel();
  }

  setInterval(() => {
    watchContainer();
    ensureOpenButton();
    restoreOpen();
    if (isOpen()) render(false);
  }, CONFIG.pollInterval);

  // 生成中かどうかは短い間隔で見て、背景色を切り替える
  setInterval(() => { if (isOpen()) updateGenerating(); }, 400);

  watchContainer();
  ensureOpenButton();
  restoreOpen();
})();
