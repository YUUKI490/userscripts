// ==UserScript==
// @name         AIのべりすと キャラ画像
// @namespace    yuuki490-ainovel
// @version      1.0
// @description  縦書き表示のパネルで、セリフの頭にキャラの顔画像を表示する。洗脳中のキャラは「名前_洗脳」の画像に差し替える。画像の登録は画面の仮ボタン（顔）から。前のキャラ画像スクリプトで登録した画像と対応表をそのまま使う
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 設定 ===================== */
  // 前のキャラ画像スクリプトと同じ保存場所（登録済みの画像をそのまま使う）
  const DB_NAME = 'ainovel_character_image_db';
  const DB_VERSION = 1;
  const STORE_IMAGES = 'images';
  const KEY_MAP = 'ainovel_character_image_map';               // { 名前: ファイル名 }
  const KEY_DISPLAY = 'ainovel_character_image_display_settings'; // { iconSize, iconGap }
  const KEY_BRAINWASH = 'ainovel_brainwash_states';             // 名前=状態

  const BRAINWASH_SUFFIX = '_洗脳';
  const DEFAULT_SIZE = 32;
  const DEFAULT_GAP = 6;
  const POLL_INTERVAL = 1000;

  const SCROLLER_ID = 'ainovel-tategaki-scroller'; // 縦書き表示のパネル
  const OPEN_BTN_ID = 'ainovel-char-image-btn';
  const SETTINGS_ID = 'ainovel-char-image-settings';
  const ON_CLASS = 'cimg-on';
  const FACE_CLASS = 'cimg-face';

  /* ===================== 見た目 ===================== */
  const style = document.createElement('style');
  style.textContent = `
    #${OPEN_BTN_ID} { position:fixed; left:8px; bottom:240px; z-index:99980; width:48px; height:48px; border-radius:50%; border:1px solid #000; background:#6a4c93; color:#fff; font-size:20px; line-height:1; padding:0; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.4); opacity:.85; }

    /* 縦書きパネル：顔のある本文では全部の行を顔の高さぶん下げて、行頭をそろえる */
    #${SCROLLER_ID}.${ON_CLASS} .tg-line { position:relative !important; padding-top:calc(var(--cimg-size, 32px) + var(--cimg-gap, 6px)) !important; }
    #${SCROLLER_ID} .${FACE_CLASS} { position:absolute !important; top:0 !important; right:50% !important; transform:translateX(50%) !important; width:var(--cimg-size, 32px) !important; height:var(--cimg-size, 32px) !important; object-fit:cover !important; margin:0 !important; padding:0 !important; border:none !important; border-radius:4px; }

    #${SETTINGS_ID} { position:fixed; inset:0; z-index:99992; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:10px; box-sizing:border-box; font-family:sans-serif; }
    #${SETTINGS_ID} .cs-box { width:min(560px,100%); max-height:92vh; overflow-y:auto; background:#fff; color:#222; border-radius:12px; padding:12px; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; }
    #${SETTINGS_ID} .cs-head { display:flex; align-items:center; justify-content:space-between; font-weight:700; }
    #${SETTINGS_ID} .cs-close { border:0; background:transparent; font-size:1.5rem; color:#555; cursor:pointer; padding:0 8px; }
    #${SETTINGS_ID} .cs-label { font-size:.8rem; font-weight:700; color:#555; }
    #${SETTINGS_ID} textarea { width:100%; min-height:160px; box-sizing:border-box; border:1px solid #999; border-radius:8px; padding:8px; font-size:15px; line-height:1.5; }
    #${SETTINGS_ID} .cs-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    #${SETTINGS_ID} .cs-btn { border:1px solid #888; border-radius:8px; background:#f2f2f2; color:#222; padding:8px 12px; font-size:15px; font-weight:700; cursor:pointer; }
    #${SETTINGS_ID} .cs-save { background:#2196f3; border-color:#1976d2; color:#fff; flex:1; }
    #${SETTINGS_ID} input[type=number] { width:70px; font-size:15px; padding:4px; }
    #${SETTINGS_ID} .cs-list { display:flex; flex-direction:column; gap:4px; }
    #${SETTINGS_ID} .cs-item { display:flex; align-items:center; gap:8px; border-bottom:1px solid #eee; padding:3px 0; font-size:14px; }
    #${SETTINGS_ID} .cs-item img { width:36px; height:36px; object-fit:cover; border-radius:4px; background:#eee; }
    #${SETTINGS_ID} .cs-item .cs-name { flex:1; word-break:break-all; }
    #${SETTINGS_ID} .cs-del { border:0; background:transparent; color:#c00; font-size:18px; cursor:pointer; }
    #${SETTINGS_ID} .cs-msg { font-size:13px; color:#c00; white-space:pre-wrap; }
    #${SETTINGS_ID} .cs-ok { color:#2d8a34; }
  `;
  document.head.appendChild(style);

  /* ===================== 保存 ===================== */
  function loadJson(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
  }
  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  let characterMap = {};
  let iconSize = DEFAULT_SIZE;
  let iconGap = DEFAULT_GAP;

  function loadMap() {
    const m = loadJson(KEY_MAP, {});
    characterMap = m && typeof m === 'object' ? m : {};
  }
  function loadDisplay() {
    const d = loadJson(KEY_DISPLAY, {});
    const s = Number(d.iconSize);
    const g = Number(d.iconGap);
    iconSize = Number.isFinite(s) ? Math.max(20, Math.min(120, s)) : DEFAULT_SIZE;
    iconGap = Number.isFinite(g) ? Math.max(0, Math.min(40, g)) : DEFAULT_GAP;
  }

  /* ===================== 画像DB ===================== */
  let db = null;
  const urlCache = new Map();

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_IMAGES)) d.createObjectStore(STORE_IMAGES);
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error || new Error('画像の保存場所を開けなかったよ'));
    });
  }

  function dbRequest(mode, fn) {
    return new Promise((resolve, reject) => {
      if (!db) { resolve(null); return; }
      const tx = db.transaction(STORE_IMAGES, mode);
      const store = tx.objectStore(STORE_IMAGES);
      const req = fn(store);
      let result = null;
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  const getImage = (filename) => dbRequest('readonly', (s) => s.get(filename));
  const putImage = (filename, file) => dbRequest('readwrite', (s) => { s.put(file, filename); return null; });
  const deleteImage = (filename) => dbRequest('readwrite', (s) => { s.delete(filename); return null; });
  const listImages = () => dbRequest('readonly', (s) => s.getAllKeys());

  function revokeUrl(filename) {
    const u = urlCache.get(filename);
    if (u) { URL.revokeObjectURL(u); urlCache.delete(filename); }
  }

  async function getImageUrl(filename) {
    if (urlCache.has(filename)) return urlCache.get(filename);
    const blob = await getImage(filename).catch(() => null);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(filename, url);
    return url;
  }

  /* ===================== 洗脳状態 ===================== */
  const normalizeName = (s) => String(s || '').replace(/[\s　・]/g, '');
  function sameName(a, b) {
    const x = normalizeName(a);
    const y = normalizeName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x));
  }

  let brainwashed = [];
  let lastStatesRaw = null;

  // 「なし」「判断できない」の人は洗脳中にしない
  function refreshStates() {
    let raw = '';
    try { raw = localStorage.getItem(KEY_BRAINWASH) || ''; } catch (_) {}
    if (raw === lastStatesRaw) return false;
    lastStatesRaw = raw;
    brainwashed = [];
    raw.split(/\r?\n/).forEach((l) => {
      const line = l.trim();
      const i = line.indexOf('=');
      if (i < 1) return;
      const name = line.slice(0, i).trim();
      const state = line.slice(i + 1).trim();
      if (name && state && !/なし|判断できない/.test(state)) brainwashed.push(name);
    });
    return true;
  }

  /* ===================== 名前から画像を決める ===================== */
  // 対応表から、セリフの名前に合う名前を探す（完全一致を優先、なければ一部一致で一番長いもの）
  function findKey(name) {
    if (characterMap[name] && !name.endsWith(BRAINWASH_SUFFIX)) return name;
    const keys = Object.keys(characterMap).filter((k) => !k.endsWith(BRAINWASH_SUFFIX));
    const exact = keys.find((k) => normalizeName(k) === normalizeName(name));
    if (exact) return exact;
    const hits = keys.filter((k) => sameName(k, name));
    if (!hits.length) return null;
    return hits.reduce((a, b) => (normalizeName(b).length > normalizeName(a).length ? b : a));
  }

  function resolveFilename(name) {
    const key = findKey(name);
    if (!key) return null;
    const bw = characterMap[key + BRAINWASH_SUFFIX];
    // 洗脳状態一覧はフルネーム、セリフは下の名前（1文字のこともある）なので、フルネームの終わりが一致すれば同じ人とみなす
    const matches = (n) => sameName(n, key) || sameName(n, name) ||
      normalizeName(n).endsWith(normalizeName(key)) || normalizeName(n).endsWith(normalizeName(name));
    if (bw && brainwashed.some(matches)) return bw;
    return characterMap[key];
  }

  // 行の頭の「名前「」から名前を取り出す
  function speakerOf(text) {
    const m = String(text || '').match(/^[\s　]*([^\s　「『（(]{1,20})[「『]/);
    return m ? m[1] : null;
  }

  /* ===================== 縦書きパネルに顔を入れる ===================== */
  let applying = false;
  let applyAgain = false;

  async function applyFaces() {
    const scroller = document.getElementById(SCROLLER_ID);
    if (!scroller) return;
    if (applying) { applyAgain = true; return; }
    applying = true;
    try {
      const max = () => Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const atEnd = Math.abs(scroller.scrollLeft) >= max() - 60;

      scroller.style.setProperty('--cimg-size', iconSize + 'px');
      scroller.style.setProperty('--cimg-gap', iconGap + 'px');

      const jobs = [];
      scroller.querySelectorAll('.tg-line').forEach((line) => {
        const old = line.querySelector('.' + FACE_CLASS);
        const name = speakerOf(line.textContent);
        const filename = name ? resolveFilename(name) : null;
        if (!filename) { if (old) old.remove(); return; }
        if (old && old.dataset.file === filename) return;
        jobs.push({ line, old, filename });
      });

      const hasFace = jobs.length > 0 || !!scroller.querySelector('.' + FACE_CLASS);
      scroller.classList.toggle(ON_CLASS, hasFace);

      for (const job of jobs) {
        const url = await getImageUrl(job.filename);
        if (!url || !job.line.isConnected) continue;
        const img = job.old || document.createElement('img');
        img.className = FACE_CLASS;
        img.alt = '';
        img.dataset.file = job.filename;
        img.src = url;
        if (!job.old) job.line.insertBefore(img, job.line.firstChild);
      }
      scroller.classList.toggle(ON_CLASS, !!scroller.querySelector('.' + FACE_CLASS));

      if (atEnd) requestAnimationFrame(() => { scroller.scrollLeft = -max(); });
    } finally {
      applying = false;
      if (applyAgain) { applyAgain = false; applyFaces(); }
    }
  }

  // 縦書き表示が本文を作り直したら顔を入れ直す
  let watched = null;
  const observer = new MutationObserver(() => applyFaces());
  function watchScroller() {
    const s = document.getElementById(SCROLLER_ID);
    if (!s || s === watched) return;
    observer.disconnect();
    observer.observe(s, { childList: true });
    watched = s;
    applyFaces();
  }

  function refreshAll() {
    const s = document.getElementById(SCROLLER_ID);
    if (s) s.querySelectorAll('.' + FACE_CLASS).forEach((img) => { delete img.dataset.file; });
    applyFaces();
  }

  /* ===================== 登録画面 ===================== */
  function parseMapping(text) {
    const result = {};
    const errors = [];
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const sep = line.indexOf('=');
      if (sep < 1) { errors.push((i + 1) + '行目：「名前=画像ファイル名」の形じゃないよ'); return; }
      const name = line.slice(0, sep).trim();
      const file = line.slice(sep + 1).trim();
      if (!name || !file) { errors.push((i + 1) + '行目：名前かファイル名が空だよ'); return; }
      result[name] = file;
    });
    return { result, errors };
  }

  const mappingText = () => Object.entries(characterMap).map(([k, v]) => k + '=' + v).join('\n');

  function escapeHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function renderList(box) {
    const list = box.querySelector('.cs-list');
    list.innerHTML = '';
    const files = ((await listImages().catch(() => [])) || []).map(String).sort();
    const used = new Set(Object.values(characterMap));
    const missing = [...used].filter((f) => !files.includes(f));
    if (!files.length) list.innerHTML = '<div class="cs-item">登録されている画像はまだないよ</div>';
    for (const f of files) {
      const item = document.createElement('div');
      item.className = 'cs-item';
      item.innerHTML = '<img alt=""><span class="cs-name"></span><button type="button" class="cs-del" title="この画像を消す">✕</button>';
      item.querySelector('.cs-name').textContent = f + (used.has(f) ? '' : '（対応表で未使用）');
      getImageUrl(f).then((u) => { if (u) item.querySelector('img').src = u; });
      item.querySelector('.cs-del').addEventListener('click', async () => {
        await deleteImage(f).catch(() => {});
        revokeUrl(f);
        renderList(box);
        refreshAll();
      });
      list.appendChild(item);
    }
    const msg = box.querySelector('.cs-missing');
    msg.textContent = missing.length ? '対応表にあるけど画像が登録されていないファイル：\n' + missing.join('\n') : '';
  }

  function openSettings() {
    if (document.getElementById(SETTINGS_ID)) return;
    loadMap();
    loadDisplay();
    const overlay = document.createElement('div');
    overlay.id = SETTINGS_ID;
    overlay.innerHTML = `
      <div class="cs-box">
        <div class="cs-head"><span>キャラ画像の設定</span><button type="button" class="cs-close">×</button></div>
        <div class="cs-label">画像を登録（まとめて選べるよ。ファイル名で保存されます）</div>
        <div class="cs-row"><input type="file" accept="image/*" multiple class="cs-file"></div>
        <div class="cs-label">対応表（1行に「名前=画像ファイル名」。洗脳中の画像は「名前_洗脳=ファイル名」）</div>
        <textarea class="cs-map" placeholder="焔=homura.png&#10;焔_洗脳=homura_bw.png"></textarea>
        <div class="cs-row">
          <span class="cs-label">顔の大きさ</span><input type="number" class="cs-size" min="20" max="120"><span class="cs-label">px</span>
          <span class="cs-label">すき間</span><input type="number" class="cs-gap" min="0" max="40"><span class="cs-label">px</span>
        </div>
        <div class="cs-row"><button type="button" class="cs-btn cs-save">保存</button></div>
        <div class="cs-msg cs-result"></div>
        <div class="cs-label">登録済みの画像</div>
        <div class="cs-msg cs-missing"></div>
        <div class="cs-list"></div>
      </div>`;
    document.body.appendChild(overlay);
    const box = overlay.querySelector('.cs-box');
    const mapField = box.querySelector('.cs-map');
    const sizeField = box.querySelector('.cs-size');
    const gapField = box.querySelector('.cs-gap');
    const result = box.querySelector('.cs-result');
    mapField.value = mappingText();
    sizeField.value = iconSize;
    gapField.value = iconGap;

    const close = () => overlay.remove();
    box.querySelector('.cs-close').addEventListener('click', close);

    box.querySelector('.cs-file').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        await putImage(f.name, f).catch(() => {});
        revokeUrl(f.name);
      }
      e.target.value = '';
      result.className = 'cs-msg cs-result cs-ok';
      result.textContent = files.length + '枚の画像を登録したよ';
      renderList(box);
      refreshAll();
    });

    box.querySelector('.cs-save').addEventListener('click', () => {
      const { result: map, errors } = parseMapping(mapField.value);
      if (errors.length) {
        result.className = 'cs-msg cs-result';
        result.textContent = errors.join('\n');
        return;
      }
      characterMap = map;
      saveJson(KEY_MAP, map);
      const s = Number(sizeField.value);
      const g = Number(gapField.value);
      iconSize = Number.isFinite(s) ? Math.max(20, Math.min(120, s)) : DEFAULT_SIZE;
      iconGap = Number.isFinite(g) ? Math.max(0, Math.min(40, g)) : DEFAULT_GAP;
      saveJson(KEY_DISPLAY, { iconSize, iconGap });
      result.className = 'cs-msg cs-result cs-ok';
      result.textContent = '保存したよ（対応表 ' + Object.keys(map).length + '件）';
      renderList(box);
      refreshAll();
    });

    renderList(box);
  }

  /* ===================== 仮ボタン（パレットを作り直すまでの間） ===================== */
  function ensureOpenButton() {
    if (!document.getElementById('data_container') || document.getElementById(OPEN_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = OPEN_BTN_ID;
    btn.title = 'キャラ画像の設定';
    btn.textContent = '顔';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); });
    document.body.appendChild(btn);
  }

  /* ===================== 開始 ===================== */
  loadMap();
  loadDisplay();
  refreshStates();
  openDb().catch((e) => console.warn('[キャラ画像]', e)).then(() => applyFaces());

  setInterval(() => {
    ensureOpenButton();
    watchScroller();
    if (refreshStates()) refreshAll();
  }, POLL_INTERVAL);
  ensureOpenButton();
  watchScroller();
})();
