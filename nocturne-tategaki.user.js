// ==UserScript==
// @name         ノクターン縦書きビューア
// @namespace    yuuki490
// @version      1.3
// @description  目次ページ・各話ページで本文を縦書き表示する（背景色・文字色・文字サイズ設定つき）
// @match        https://novel18.syosetu.com/*
// @match        https://ncode.syosetu.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const m = location.pathname.match(/^\/(n\w+)\/(?:(\d+)\/)?$/i);
  if (!m) return;
  const NCODE = m[1].toLowerCase();
  const START_EP = m[2] ? parseInt(m[2], 10) : null; // 各話ページならその話から

  // ---------- 共通 ----------
  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ---------- 目次 ----------
  function parseIndex(doc) {
    const list = [];
    let chapter = '';
    const root = doc.querySelector('.p-eplist') || doc.querySelector('.index_box');
    if (!root) return list;
    root.querySelectorAll('.p-eplist__chapter-title, .chapter_title, .p-eplist__sublist, .novel_sublist2').forEach(el => {
      if (el.classList.contains('p-eplist__chapter-title') || el.classList.contains('chapter_title')) {
        chapter = el.textContent.trim();
      } else {
        const a = el.querySelector('a');
        if (a) list.push({ title: a.textContent.trim(), chapter, url: new URL(a.getAttribute('href'), location.href).href });
      }
    });
    return list;
  }
  function nextIndexUrl(doc) {
    const a = doc.querySelector('a.c-pager__item--next');
    return a ? new URL(a.getAttribute('href'), location.href).href : null;
  }
  async function loadIndex() {
    let doc = START_EP ? await fetchDoc('/' + NCODE + '/') : document;
    let list = parseIndex(doc);
    let next = nextIndexUrl(doc);
    while (next) {
      await sleep(800);
      doc = await fetchDoc(next);
      list = list.concat(parseIndex(doc));
      next = nextIndexUrl(doc);
    }
    return list;
  }

  // ---------- 本文 ----------
  // 半角の数字2桁・!?などを縦中横に（あわせて三点リーダーを中央寄せ）
  function tcy(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      if (n.parentNode.closest('rt')) return;
      // 三点リーダー・二点リーダーを縦書き専用の字形に置き換えて真ん中にそろえる
      n.nodeValue = n.nodeValue.replace(/…/g, '\uFE19').replace(/‥/g, '\uFE30');
      const t = n.nodeValue;
      const re = /(?<![0-9A-Za-z])([0-9]{1,2}|[!?！？]{2})(?![0-9A-Za-z])/g;
      if (!re.test(t)) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, mm;
      while ((mm = re.exec(t))) {
        frag.appendChild(document.createTextNode(t.slice(last, mm.index)));
        const s = document.createElement('span');
        s.className = 'tv-tcy';
        s.textContent = mm[1].replace(/！/g, '!').replace(/？/g, '?');
        frag.appendChild(s);
        last = re.lastIndex;
      }
      frag.appendChild(document.createTextNode(t.slice(last)));
      n.replaceWith(frag);
    });
  }

  function extractBlock(el) {
    const box = document.createElement('div');
    el.querySelectorAll('p').forEach(p => {
      const np = document.createElement('p');
      np.innerHTML = p.innerHTML;
      np.querySelectorAll('a, img').forEach(x => x.remove());
      if (!np.textContent.trim()) np.innerHTML = '&#8203;'; // 空行を保つ
      box.appendChild(np);
    });
    tcy(box);
    return box;
  }

  async function loadEpisode(url) {
    const doc = await fetchDoc(url);
    const title = (doc.querySelector('.p-novel__title, .novel_subtitle') || {}).textContent || '';
    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.className = 'tv-title';
    h.textContent = title.trim();
    wrap.appendChild(h);
    const pre = doc.querySelector('.p-novel__text--preface');
    const body = doc.querySelector('.js-novel-text:not(.p-novel__text--preface):not(.p-novel__text--afterword)');
    const aft = doc.querySelector('.p-novel__text--afterword');
    if (pre) { const b = extractBlock(pre); b.className = 'tv-sub'; wrap.appendChild(b); wrap.appendChild(sep()); }
    if (body) wrap.appendChild(extractBlock(body));
    if (aft) { wrap.appendChild(sep()); const b = extractBlock(aft); b.className = 'tv-sub'; wrap.appendChild(b); }
    return wrap;
  }
  function sep() { const d = document.createElement('div'); d.className = 'tv-sep'; return d; }

  // ---------- 画面 ----------
  const css = document.createElement('style');
  css.textContent = `
    #tv-overlay{--tv-bg:#fbf8f0;--tv-fg:#222222;--tv-size:18px;
      position:fixed;inset:0;z-index:2147483000;background:var(--tv-bg);color:var(--tv-fg);display:flex;flex-direction:column;}
    #tv-bar{display:flex;gap:6px;align-items:center;padding:6px 8px;background:#333;color:#fff;font-size:13px;}
    #tv-bar button{padding:6px 10px;font-size:13px;border:none;border-radius:6px;background:#555;color:#fff;}
    #tv-bar select{flex:1;min-width:0;font-size:13px;padding:4px;}
    #tv-scroll{flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;
      writing-mode:vertical-rl;-webkit-writing-mode:vertical-rl;}
    #tv-text{writing-mode:vertical-rl;-webkit-writing-mode:vertical-rl;height:100%;box-sizing:border-box;
      padding:24px 20px;font-family:"Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif;font-size:var(--tv-size);line-height:1.8;
      text-orientation:mixed;}
    #tv-text p{margin:0;}
    #tv-text .tv-title{font-size:1.3em;margin:0 0 0 2em;}
    #tv-text .tv-sub{opacity:.65;font-size:.9em;}
    #tv-text .tv-sep{margin:0 1.5em;border-right:1px solid currentColor;opacity:.3;}
    #tv-text .tv-tcy{text-combine-upright:all;-webkit-text-combine:horizontal;}
    #tv-text rt{font-size:.5em;}
    #tv-settings{display:none;position:absolute;top:44px;left:8px;right:8px;z-index:2;background:#2b2b2b;color:#fff;
      border-radius:10px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,.4);font-size:14px;}
    #tv-settings.open{display:block;}
    #tv-settings .row{display:flex;align-items:center;gap:10px;margin:8px 0;}
    #tv-settings .row label{width:6em;flex-shrink:0;}
    #tv-settings input[type=color]{width:48px;height:32px;border:none;padding:0;background:none;}
    #tv-settings input[type=range]{flex:1;}
    #tv-settings .presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}
    #tv-settings .presets button{padding:6px 10px;border-radius:6px;border:1px solid #666;font-size:13px;}
    #tv-settings .foot{display:flex;justify-content:flex-end;gap:6px;margin-top:10px;}
    #tv-settings .foot button{padding:6px 12px;border:none;border-radius:6px;background:#555;color:#fff;font-size:13px;}
    #tv-open{position:fixed;right:12px;bottom:120px;z-index:99999;padding:10px 14px;font-size:14px;border-radius:8px;
      border:none;background:#2c3e50;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);}
  `;
  document.head.appendChild(css);

  let list = null;
  let cur = 0;
  let overlay, scroller, textBox, select;

  // ---------- 表示設定（背景色・文字色・文字サイズ） ----------
  const SET_KEY = 'tv-settings-v1';
  const DEFAULT_SET = { bg: '#fbf8f0', fg: '#222222', size: 18 };
  const PRESETS = [
    { name: '生成り', bg: '#fbf8f0', fg: '#222222' },
    { name: '白', bg: '#ffffff', fg: '#000000' },
    { name: 'セピア', bg: '#f1e7d0', fg: '#4a3b2a' },
    { name: '黒', bg: '#1e1e1e', fg: '#dddddd' },
    { name: '紺', bg: '#1b2333', fg: '#d6dce8' },
  ];
  function loadSet() {
    try {
      const v = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
      if (v) return Object.assign({}, DEFAULT_SET, v);
    } catch (e) {}
    return Object.assign({}, DEFAULT_SET);
  }
  function saveSet(v) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(v)); } catch (e) {}
  }
  let settings = loadSet();
  function applySet() {
    if (!overlay) return;
    overlay.style.setProperty('--tv-bg', settings.bg);
    overlay.style.setProperty('--tv-fg', settings.fg);
    overlay.style.setProperty('--tv-size', settings.size + 'px');
  }

  function buildSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = 'tv-settings';
    panel.innerHTML = `
      <div class="row"><label>背景色</label><input type="color" id="tv-set-bg"></div>
      <div class="row"><label>文字色</label><input type="color" id="tv-set-fg"></div>
      <div class="row"><label>文字サイズ</label><input type="range" id="tv-set-size" min="12" max="36" step="1"><span id="tv-set-size-val"></span></div>
      <div class="presets"></div>
      <div class="foot"><button id="tv-set-reset">初期値に戻す</button><button id="tv-set-close">閉じる</button></div>`;
    overlay.appendChild(panel);

    const bg = panel.querySelector('#tv-set-bg');
    const fg = panel.querySelector('#tv-set-fg');
    const size = panel.querySelector('#tv-set-size');
    const sizeVal = panel.querySelector('#tv-set-size-val');
    const sync = () => {
      bg.value = settings.bg;
      fg.value = settings.fg;
      size.value = settings.size;
      sizeVal.textContent = settings.size + 'px';
    };
    const update = () => { applySet(); saveSet(settings); sync(); };

    bg.addEventListener('input', () => { settings.bg = bg.value; update(); });
    fg.addEventListener('input', () => { settings.fg = fg.value; update(); });
    size.addEventListener('input', () => { settings.size = parseInt(size.value, 10); update(); });

    const presetBox = panel.querySelector('.presets');
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.style.background = p.bg;
      b.style.color = p.fg;
      b.addEventListener('click', () => { settings.bg = p.bg; settings.fg = p.fg; update(); });
      presetBox.appendChild(b);
    });
    panel.querySelector('#tv-set-reset').addEventListener('click', () => { settings = Object.assign({}, DEFAULT_SET); update(); });
    panel.querySelector('#tv-set-close').addEventListener('click', () => panel.classList.remove('open'));
    sync();
    return panel;
  }

  // 冒頭（右端）へスクロール
  // ブラウザによって右端が scrollLeft=0 の場合と最大値の場合があるので、
  // 大きい値を入れて「右端に張り付く方」に寄せる。レイアウト確定後にも念のため繰り返す。
  function scrollToStart() {
    const go = () => {
      scroller.scrollLeft = scroller.scrollWidth;
      if (scroller.scrollLeft < 0) scroller.scrollLeft = 0;
    };
    go();
    requestAnimationFrame(() => { go(); requestAnimationFrame(go); });
    setTimeout(go, 100);
    setTimeout(go, 400);
  }

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'tv-overlay';
    overlay.innerHTML = `
      <div id="tv-bar">
        <button id="tv-close">閉じる</button>
        <button id="tv-next">次話</button>
        <select id="tv-select"></select>
        <button id="tv-prev">前話</button>
        <button id="tv-set">設定</button>
      </div>
      <div id="tv-scroll"><div id="tv-text"></div></div>`;
    document.body.appendChild(overlay);
    scroller = overlay.querySelector('#tv-scroll');
    textBox = overlay.querySelector('#tv-text');
    select = overlay.querySelector('#tv-select');
    applySet();
    const settingsPanel = buildSettingsPanel();
    overlay.querySelector('#tv-set').onclick = () => settingsPanel.classList.toggle('open');

    list.forEach((ep, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = ep.title;
      select.appendChild(o);
    });
    select.addEventListener('change', () => show(parseInt(select.value, 10)));
    overlay.querySelector('#tv-close').onclick = () => { overlay.style.display = 'none'; document.body.style.overflow = ''; };
    overlay.querySelector('#tv-next').onclick = () => { if (cur < list.length - 1) show(cur + 1); };
    overlay.querySelector('#tv-prev').onclick = () => { if (cur > 0) show(cur - 1); };

    // PCのホイールで横スクロール
    scroller.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { scroller.scrollLeft -= e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }

  async function show(i) {
    cur = i;
    select.value = i;
    textBox.innerHTML = '<p>読み込み中…</p>';
    try {
      const content = await loadEpisode(list[i].url);
      textBox.innerHTML = '';
      textBox.appendChild(content);
    } catch (e) {
      textBox.innerHTML = '<p>読み込みに失敗しました（' + e.message + '）</p>';
    }
    scrollToStart();
  }

  async function open(btn) {
    if (!list) {
      btn.disabled = true;
      btn.textContent = '目次読込中…';
      try { list = await loadIndex(); } catch (e) { alert('目次の取得に失敗: ' + e.message); }
      btn.disabled = false;
      btn.textContent = '縦書きで読む';
      if (!list || !list.length) { list = null; return; }
      buildOverlay();
      let start = 0;
      if (START_EP) {
        const idx = list.findIndex(ep => new RegExp('/' + NCODE + '/' + START_EP + '/$', 'i').test(ep.url));
        if (idx >= 0) start = idx;
      }
      document.body.style.overflow = 'hidden';
      show(start);
      return;
    }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  const btn = document.createElement('button');
  btn.id = 'tv-open';
  btn.textContent = '縦書きで読む';
  btn.addEventListener('click', () => open(btn));
  document.body.appendChild(btn);
})();
