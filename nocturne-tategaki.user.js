// ==UserScript==
// @name         ノクターン縦書きビューア
// @namespace    yuuki490
// @version      1.1
// @description  目次ページ・各話ページで本文を縦書き表示する
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
  // 半角の数字2桁・!?などを縦中横に
  function tcy(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      if (n.parentNode.closest('rt')) return;
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
    #tv-overlay{position:fixed;inset:0;z-index:2147483000;background:#fbf8f0;color:#222;display:flex;flex-direction:column;}
    #tv-bar{display:flex;gap:6px;align-items:center;padding:6px 8px;background:#333;color:#fff;font-size:13px;}
    #tv-bar button{padding:6px 10px;font-size:13px;border:none;border-radius:6px;background:#555;color:#fff;}
    #tv-bar select{flex:1;min-width:0;font-size:13px;padding:4px;}
    #tv-scroll{flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;
      writing-mode:vertical-rl;-webkit-writing-mode:vertical-rl;}
    #tv-text{writing-mode:vertical-rl;-webkit-writing-mode:vertical-rl;height:100%;box-sizing:border-box;
      padding:24px 20px;font-family:"Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif;font-size:18px;line-height:1.8;
      text-orientation:mixed;}
    #tv-text p{margin:0;}
    #tv-text .tv-title{font-size:1.3em;margin:0 0 0 2em;}
    #tv-text .tv-sub{color:#666;font-size:.9em;}
    #tv-text .tv-sep{margin:0 1.5em;border-right:1px solid #bbb;}
    #tv-text .tv-tcy{text-combine-upright:all;-webkit-text-combine:horizontal;}
    #tv-text rt{font-size:.5em;}
    #tv-open{position:fixed;right:12px;bottom:120px;z-index:99999;padding:10px 14px;font-size:14px;border-radius:8px;
      border:none;background:#2c3e50;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);}
    @media (prefers-color-scheme: dark){#tv-overlay{background:#1e1e1e;color:#ddd;}#tv-text .tv-sub{color:#999;}}
  `;
  document.head.appendChild(css);

  let list = null;
  let cur = 0;
  let overlay, scroller, textBox, select;

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
      </div>
      <div id="tv-scroll"><div id="tv-text"></div></div>`;
    document.body.appendChild(overlay);
    scroller = overlay.querySelector('#tv-scroll');
    textBox = overlay.querySelector('#tv-text');
    select = overlay.querySelector('#tv-select');

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
