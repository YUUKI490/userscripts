// ==UserScript==
// @name         pixiv小説 縦書きビューア
// @namespace    yuuki490
// @version      1.2
// @description  pixivの小説ページを開くと自動で縦書き表示する（シリーズの前後移動・背景色・文字色・文字サイズ設定つき）
// @match        https://www.pixiv.net/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 共通 ----------
  function currentNovelId() {
    if (location.pathname !== '/novel/show.php') return null;
    return new URLSearchParams(location.search).get('id');
  }
  async function getJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j.error) throw new Error(j.message || 'APIエラー');
    return j.body;
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---------- 作品・シリーズ情報 ----------
  async function loadNovel(id) {
    const b = await getJson('/ajax/novel/' + id);
    return {
      id: String(b.id),
      title: b.title || '',
      caption: b.description || '',
      content: b.content || '',
      series: b.seriesNavData || null,
    };
  }

  // シリーズの話一覧。取れなければその話だけのリストにする
  async function loadList(novel) {
    if (!novel.series || !novel.series.seriesId) {
      return [{ id: novel.id, title: novel.title }];
    }
    try {
      const b = await getJson('/ajax/novel/series/' + novel.series.seriesId + '/content_titles');
      const list = (b || []).filter(x => x.available !== false).map(x => ({ id: String(x.id), title: x.title }));
      if (list.length) return list;
    } catch (e) { /* 下の前後リンク方式へ */ }
    const list = [];
    if (novel.series.prev) list.push({ id: String(novel.series.prev.id), title: novel.series.prev.title });
    list.push({ id: novel.id, title: novel.title });
    if (novel.series.next) list.push({ id: String(novel.series.next.id), title: novel.series.next.title });
    return list;
  }

  // ---------- 本文変換（pixiv記法→HTML） ----------
  function lineToHtml(line) {
    let h = esc(line);
    // [[rb:漢字 > かんじ]]
    h = h.replace(/\[\[rb:(.+?)\s*&gt;\s*(.+?)\]\]/g, '<ruby>$1<rt>$2</rt></ruby>');
    // [[jumpuri:表示 > URL]] → 表示文字だけ
    h = h.replace(/\[\[jumpuri:(.+?)\s*&gt;\s*.+?\]\]/g, '$1');
    // 画像・ページジャンプは表示しない
    h = h.replace(/\[(pixivimage|uploadedimage|jump):[^\]]*\]/g, '');
    return h;
  }

  function contentToNode(content) {
    const box = document.createElement('div');
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    for (const raw of lines) {
      if (/^\s*\[newpage\]\s*$/.test(raw)) { html += '<div class="tv-sep"></div>'; continue; }
      const ch = raw.match(/^\s*\[chapter:(.*)\]\s*$/);
      if (ch) { html += '<h3 class="tv-chapter">' + lineToHtml(ch[1]) + '</h3>'; continue; }
      const h = lineToHtml(raw);
      html += '<p>' + (h.trim() ? h : '&#8203;') + '</p>';
    }
    box.innerHTML = html;
    tcy(box);
    return box;
  }

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

  function buildEpisode(novel) {
    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.className = 'tv-title';
    h.textContent = novel.title;
    wrap.appendChild(h);
    wrap.appendChild(contentToNode(novel.content));
    return wrap;
  }

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
    #tv-text .tv-chapter{font-size:1.15em;margin:0 1em;}
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
      border:none;background:#2c3e50;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:none;}
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

    select.addEventListener('change', () => show(parseInt(select.value, 10)));
    overlay.querySelector('#tv-close').onclick = closeOverlay;
    overlay.querySelector('#tv-next').onclick = () => { if (cur < list.length - 1) show(cur + 1); };
    overlay.querySelector('#tv-prev').onclick = () => { if (cur > 0) show(cur - 1); };

    // PCのホイールで横スクロール
    scroller.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { scroller.scrollLeft -= e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }

  function fillSelect() {
    select.innerHTML = '';
    list.forEach((ep, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = ep.title;
      select.appendChild(o);
    });
  }

  function closeOverlay() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  async function show(i, preloaded) {
    cur = i;
    select.value = i;
    textBox.innerHTML = '<p>読み込み中…</p>';
    try {
      const novel = preloaded || await loadNovel(list[i].id);
      textBox.innerHTML = '';
      textBox.appendChild(buildEpisode(novel));
    } catch (e) {
      textBox.innerHTML = '<p>読み込みに失敗しました（' + esc(e.message) + '）</p>';
    }
    scrollToStart();
  }

  async function open(btn) {
    const id = currentNovelId();
    if (!id) return;
    btn.disabled = true;
    btn.textContent = '読込中…';
    let novel;
    try {
      novel = await loadNovel(id);
      list = await loadList(novel);
    } catch (e) {
      alert('読み込みに失敗: ' + e.message);
      btn.disabled = false;
      btn.textContent = '縦書きで読む';
      return;
    }
    btn.disabled = false;
    btn.textContent = '縦書きで読む';
    if (!overlay) buildOverlay();
    fillSelect();
    let start = list.findIndex(ep => ep.id === novel.id);
    if (start < 0) { list = [{ id: novel.id, title: novel.title }]; fillSelect(); start = 0; }
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    show(start, novel);
  }

  const btn = document.createElement('button');
  btn.id = 'tv-open';
  btn.textContent = '縦書きで読む';
  btn.addEventListener('click', () => open(btn));
  document.body.appendChild(btn);

  // pixivはページ遷移してもリロードしないので、URLを見てボタンの表示を切り替える
  // 小説ページを開いたら自動で縦書き表示にする（閉じたあとはボタンで開き直せる）
  let lastHref = '';
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const id = currentNovelId();
    btn.style.display = id ? 'block' : 'none';
    if (id && !btn.disabled) open(btn);
  }, 500);
})();
