// ==UserScript==
// @name         AIのべりすと 縦書き表示
// @namespace    yuuki490-ainovel
// @version      1.0
// @description  本文（ユーザーのブロックを除く）を縦書きにして、画面にかぶせるパネルで表示する。生成が終わると自動で更新。パネルからAIブロック追加の入力パネルを開ける。開くのは画面の仮ボタン（縦）から
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
  const AIB_BTN_ID = 'ainovel-add-ai-block-btn'; // AIブロック追加の仮ボタン

  /* ===================== 見た目 ===================== */
  const style = document.createElement('style');
  style.textContent = `
    #${OPEN_BTN_ID} { position:fixed; left:8px; bottom:180px; z-index:99980; width:48px; height:48px; border-radius:50%; border:1px solid #000; background:#3d3d3d; color:#fff; font-size:20px; font-family:serif; line-height:1; padding:0; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.4); opacity:.85; }

    #${OVERLAY_ID} { display:none; position:fixed; inset:0; width:100vw; height:100vh; height:100dvh; z-index:99985; background:${CONFIG.background}; color:${CONFIG.color}; box-sizing:border-box; }
    body.${OPEN_CLASS} #${OVERLAY_ID} { display:block; }
    body.${OPEN_CLASS} { overflow:hidden !important; }

    #${SCROLLER_ID} {
      position:absolute; inset:0; overflow-x:auto; overflow-y:hidden; -webkit-overflow-scrolling:touch;
      writing-mode:vertical-rl; -webkit-writing-mode:vertical-rl; text-orientation:mixed;
      font-family:${CONFIG.fontFamily}; font-size:${CONFIG.fontSize}px; line-height:${CONFIG.lineHeight}; letter-spacing:.02em;
      -webkit-text-size-adjust:none; text-size-adjust:none;
      line-break:strict; word-break:normal; overflow-wrap:anywhere;
      padding:2.2em 1.6em 1.6em 1.6em; box-sizing:border-box; text-align:start;
    }
    #${SCROLLER_ID} .tg-line, #${SCROLLER_ID} .tg-empty { margin:0; padding:0; font-size:${CONFIG.fontSize}px; line-height:${CONFIG.lineHeight}; font-family:${CONFIG.fontFamily}; }
    #${SCROLLER_ID} .tg-tcy { text-combine-upright:all; -webkit-text-combine:horizontal; }
    #${SCROLLER_ID} rt { font-size:.5em; }
    #${SCROLLER_ID} .tg-none { writing-mode:horizontal-tb; color:#999; font-size:15px; padding:24px; }

    #${CLOSE_ID} { position:absolute; top:8px; left:8px; z-index:1; width:40px; height:40px; border:none; border-radius:50%; background:rgba(0,0,0,.08); color:#444; font-size:20px; line-height:40px; padding:0; text-align:center; cursor:pointer; }
    #${INPUT_ID} { position:absolute; left:12px; bottom:calc(12px + env(safe-area-inset-bottom, 0px)); z-index:1; height:42px; min-width:100px; padding:6px 14px; border:none; border-radius:21px; background:rgba(0,0,0,.62); color:#fff; font-size:15px; line-height:30px; writing-mode:horizontal-tb; box-sizing:border-box; cursor:pointer; }
  `;
  document.head.appendChild(style);

  /* ===================== 本文の読み取り ===================== */
  // ユーザーのブロックは除き、テキストとAIのブロックだけを読む
  function readNovelText() {
    const root = document.getElementById('data_container');
    if (!root) return '';
    const parts = [];
    root.querySelectorAll('.data_edit.plaintext, .data_edit.assistant').forEach((edit) => {
      const raw = edit.getAttribute('data-raw-markdown');
      const text = (raw !== null ? raw : (edit.innerText || '')).replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/\n+$/, '');
      if (text.trim()) parts.push(text);
    });
    return cleanText(parts.join('\n'));
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

  function buildHtml(text) {
    if (!text) return '<div class="tg-none">表示できる本文がありません</div>';
    return text.split('\n').map((line) => (
      line.trim() ? '<div class="tg-line">' + formatLine(line) + '</div>' : '<div class="tg-empty">　</div>'
    )).join('');
  }

  /* ===================== パネル ===================== */
  let overlay = null;
  let scroller = null;
  let lastText = null;
  let renderTimer = null;

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

    overlay.appendChild(scroller);
    overlay.appendChild(close);
    overlay.appendChild(input);
    document.body.appendChild(overlay);
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

  watchContainer();
  ensureOpenButton();
  restoreOpen();
})();
