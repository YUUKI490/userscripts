// ==UserScript==
// @name         AIのべりすと AIブロック追加
// @namespace    yuuki490-ainovel
// @version      2.7.1
// @description  画面の仮ボタン（➕）で入力パネルを開き、ユーザーブロック＋AIブロック（書き出し入り）を作って「続ける」を押す。ユーザー欄・AI欄それぞれにテンプレ3つ。テンプレの {章} を章番号に置き換える（次の章／現在の章の続き／断章）。「書く場面」欄の中身を {場面}（または【書く場面】の下）に差し込む。場面欄の「書く」で清書補助パネルを開き、視点（プルダウン）・主に喋る（タップで選ぶ）・冒頭・終わり・配分・やらないこと・起きることを埋めて「清書」を押すと、プチボット「指示清書」に通した結果を場面欄に入れる
// @match        https://ai-novel.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // サイト側の関数を呼ぶための窓口（GM_系を使うとwindowが別物になることがあるため）
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const BTN_ID = 'ainovel-add-ai-block-btn';
  const KEY_TEMPLATES = 'ainovel_aiblock_templates';
  const KEY_USER_TEMPLATES = 'ainovel_aiblock_user_templates';
  const CONTINUE_SELECTOR = '#getcontinuation_chat';
  const QP_SHOW_SELECTOR = '#qp_show_btn';
  const QP_LOAD_SELECTOR = '#qp_load_btn';
  const KEY_CHAPTER_MODE = 'ainovel_aiblock_chapter_mode';
  const CHAPTER_MARK = '{章}';
  const SCENE_MARK = '{場面}';
  const SCENE_HEAD = '【書く場面】';
  // 清書補助
  const KEY_HELPER = 'ainovel_aiblock_helper';          // 補助パネルの欄の中身（GM_setValue）
  const KEY_CHARLIST = 'ainovelist_charlist_text';      // QuickPasteが読み込んだ辞書（localStorage）
  const BOT_NAME = '指示清書';                            // プチボットの名前に含まれる文字
  const PLACEHOLDER = '（ここに作成指示を貼り付ける）';   // プチボットのプロンプトの目印
  const BOT_WAIT_TIMEOUT = 180000;
  const BOT_STABLE_MS = 4000;
  // 辞書の説明にこの言葉が入っていれば人物らしいとみなし、プルダウンの上に並べる
  const PERSON_RE = /主人公|ヒロイン|女性|男性|女の子|男の子|少女|少年|歳|才|年生|姉|妹|兄|弟|母|父|娘|息子|先生|教師|生徒|部長|会長|メイド|騎士|聖女|勇者|魔王|王女|王子|女王|国王|巫女|隊員|隊長|幹部|社長|店長|友人|親友|幼馴染|クラスメイト|同級生|先輩|後輩|彼女|彼氏|妻|夫|人間|女|男/;
  const CHAPTER_MODES = [
    { id: 'next', label: '次章' },
    { id: 'cont', label: '続き' },
    { id: 'side', label: '断章' },
  ];

  /* ---------- 見た目 ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #aib_overlay { position:fixed; inset:0; z-index:99990; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; padding:10px; box-sizing:border-box; }
    #aib_overlay.aib-open { display:flex; }
    #aib_box { width:min(560px,100%); height:min(92vh,760px); display:flex; flex-direction:column; gap:8px; padding:10px; box-sizing:border-box; background:#fff; color:#222; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.45); font-family:sans-serif; position:relative; }
    #aib_head { display:flex; align-items:center; justify-content:space-between; font-weight:700; font-size:.9rem; }
    #aib_close { border:0; background:transparent; color:#555; font-size:1.5rem; cursor:pointer; padding:0 8px; line-height:1; }
    .aib_label { font-size:.75rem; font-weight:700; color:#555; margin-bottom:2px; }
    .aib_area { flex:1; display:flex; flex-direction:column; min-height:0; }
    .aib_area textarea { flex:1; width:100%; box-sizing:border-box; resize:none; border:1px solid #999; border-radius:10px; padding:8px; font-size:16px; line-height:1.6; color:#222; background:#fafafa; }
    #aib_scene_area { flex:1.2; }
    #aib_scene_area textarea { background:#fffbe6; }
    #aib_user_area { flex:1; }
    .aib_row { display:flex; gap:7px; align-items:stretch; }
    .aib_btn { border:1px solid #888; border-radius:9px; background:#f2f2f2; color:#222; padding:10px 12px; font-size:15px; font-weight:700; cursor:pointer; }
    #aib_mode { margin-left:auto; min-width:64px; background:#fff3c4; border-color:#c9a400; }
    #aib_continue { min-width:110px; background:rgb(205,43,90); border-color:#000; color:#fff; font-size:18px; }
    .aib_tpl { flex:1; font-size:20px; }
    .aib_tpl_gear { flex:none; width:52px; border-radius:50%; font-size:20px; padding:0; }
    #aib_settings { position:absolute; inset:0; background:#fff; border-radius:12px; padding:10px; box-sizing:border-box; display:none; flex-direction:column; gap:8px; }
    #aib_settings.aib-open { display:flex; }
    #aib_settings textarea { flex:1; width:100%; box-sizing:border-box; resize:none; border:1px solid #999; border-radius:10px; padding:8px; font-size:16px; line-height:1.5; }
    .aib_set_item { flex:1; display:flex; flex-direction:column; min-height:0; }
    .aib_set_title { font-weight:700; font-size:.9rem; }
    #aib_set_save { flex:1; background:#2196f3; border-color:#1976d2; color:#fff; }
    #aib_scene_head { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:2px; }
    #aib_scene_head .aib_label { margin:0; }
    #aib_write { border:1px solid #c9a400; border-radius:8px; background:#fff3c4; color:#222; padding:4px 12px; font-size:13px; font-weight:700; cursor:pointer; }
    #aib_helper { position:absolute; inset:0; background:#fff; border-radius:12px; padding:10px; box-sizing:border-box; display:none; flex-direction:column; gap:6px; }
    #aib_helper.aib-open { display:flex; }
    #aib_helper .aib_h_row { display:flex; align-items:center; gap:6px; }
    #aib_helper .aib_h_name { flex:none; width:7.5em; font-size:.75rem; font-weight:700; color:#555; }
    #aib_helper input, #aib_helper select { flex:1; min-width:0; box-sizing:border-box; border:1px solid #999; border-radius:8px; padding:6px 8px; font-size:15px; color:#222; background:#fafafa; }
    #aib_h_speakers { flex:1; display:flex; flex-wrap:wrap; gap:4px; max-height:5.2em; overflow-y:auto; border:1px solid #999; border-radius:8px; padding:4px; background:#fafafa; }
    #aib_h_speakers button { border:1px solid #aaa; border-radius:12px; background:#fff; color:#222; padding:3px 9px; font-size:13px; cursor:pointer; }
    #aib_h_speakers button.aib-on { background:#2196f3; border-color:#1976d2; color:#fff; font-weight:700; }
    #aib_h_speakers .aib_h_none { color:#888; font-size:.8rem; padding:3px 4px; }
    #aib_h_events_area { flex:1; display:flex; flex-direction:column; min-height:0; }
    #aib_h_events_area textarea { flex:1; width:100%; box-sizing:border-box; resize:none; border:1px solid #999; border-radius:10px; padding:8px; font-size:16px; line-height:1.6; color:#222; background:#fffbe6; }
    #aib_h_polish { flex:1; background:rgb(205,43,90); border-color:#000; color:#fff; }
    #aib_h_polish:disabled { opacity:.5; }
    #aib_h_status { font-size:.8rem; color:#444; min-height:1.2em; }
  `;
  document.head.appendChild(style);

  /* ---------- テンプレ保存 ---------- */
  // 保存先はViolentmonkey側（GM_setValue）。のべりすと本体のlocalStorageの容量を使わない
  // 初回だけ、前の版がlocalStorageに保存していた中身をコピーする（localStorage側は控えとして残す）
  function migrateFromLocalStorage() {
    [KEY_TEMPLATES, KEY_USER_TEMPLATES, KEY_CHAPTER_MODE].forEach((key) => {
      try {
        if (GM_getValue(key) !== undefined) return;
        const old = localStorage.getItem(key);
        if (old === null) return;
        if (key === KEY_CHAPTER_MODE) { GM_setValue(key, old); return; }
        const arr = JSON.parse(old);
        if (Array.isArray(arr)) GM_setValue(key, arr);
      } catch (e) { console.warn('[AIブロック追加] 引っ越し失敗', key, e); }
    });
  }
  migrateFromLocalStorage();

  function loadTemplates(key) {
    try {
      const arr = GM_getValue(key, []);
      return [0, 1, 2].map((i) => (Array.isArray(arr) && typeof arr[i] === 'string' ? arr[i] : ''));
    } catch (_) { return ['', '', '']; }
  }
  function saveTemplates(key, arr) {
    try { GM_setValue(key, arr.slice()); } catch (e) { alert('テンプレを保存できなかったよ'); console.warn(e); }
  }

  /* ---------- ブロック作成 ---------- */
  function afterInsert(container) {
    container.querySelectorAll('.data_block').forEach((b, i) => b.setAttribute('data-index', String(i)));
    const calls = [
      () => W.AttachListeners && W.AttachListeners(),
      () => W.ApplyIconRules && W.ApplyIconRules(),
      () => W.VisualChange && W.VisualChange(),
      () => W.CopyContent && W.CopyContent(),
      () => W.syncDOMToStorageDebounced && W.syncDOMToStorageDebounced(null),
    ];
    calls.forEach((fn) => { try { fn(); } catch (e) { console.warn('[AIブロック追加]', e); } });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 作戦A：サイト内部の関数でブロックを作る（cat は 'User' か 'Assistant'）
  function createBySite(cat, text) {
    if (typeof W.createDataBlockElement !== 'function') return null;
    const el = W.createDataBlockElement(0, [{ cat: cat, text: text }]);
    return el && el.nodeType === 1 ? el : null;
  }

  // 作戦B：既存の同じ種類のブロックをコピーして中身を差し替える（cls は 'user' か 'assistant'）
  function createByClone(container, cls, text) {
    const edits = container.querySelectorAll('.data_edit.' + cls);
    if (!edits.length) return null;
    const src = edits[edits.length - 1].closest('.data_block');
    if (!src) return null;
    const el = src.cloneNode(true);
    el.querySelectorAll('.data_edit').forEach((ed, i) => {
      ed.innerHTML = i === 0 ? escapeHtml(text).replace(/\n/g, '<br>') : '';
      ed.setAttribute('data-raw-markdown', i === 0 ? text : '');
      ed.removeAttribute('data-nv4-core-listeners-bound');
      ed.removeAttribute('data-paste-overflow-bound');
    });
    const cc = el.querySelector('.label_charcount');
    if (cc) cc.textContent = Array.from(text).length + '字';
    return el;
  }

  function makeBlock(container, cat, cls, text) {
    let el = null;
    try { el = createBySite(cat, text); } catch (e) { console.warn('[AIブロック追加] 作戦A失敗', e); }
    if (!el) el = createByClone(container, cls, text);
    return el;
  }

  function addBlocks(userText, aiText) {
    const container = document.getElementById('data_container');
    if (!container) { alert('本文の欄が見つからなかったよ'); return false; }
    const userEl = makeBlock(container, 'User', 'user', userText);
    const aiEl = makeBlock(container, 'Assistant', 'assistant', aiText);
    if (!userEl || !aiEl) { alert('ブロックを作れなかったよ（コピー元のブロックもなし）'); return false; }
    container.appendChild(userEl);
    container.appendChild(aiEl);
    afterInsert(container);
    setTimeout(() => aiEl.scrollIntoView({ behavior: 'smooth', block: 'end' }), 30);
    return true;
  }

  /* ---------- 場面の差し込み ---------- */
  // {場面} があればそこに、なければ【書く場面】の行の下に、場面欄の中身を入れる
  function insertScene(text, scene) {
    if (!scene) return text;
    if (text.includes(SCENE_MARK)) return text.split(SCENE_MARK).join(scene);
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => l.trim() === SCENE_HEAD);
    if (idx < 0) return text;
    lines.splice(idx + 1, 0, scene);
    return lines.join('\n');
  }

  /* ---------- 章番号 ---------- */
  const KANJI_DIGITS = '〇一二三四五六七八九';

  function kanjiToNum(k) {
    if (!k) return NaN;
    if (/^[〇零一二三四五六七八九]+$/.test(k) && !/[十百]/.test(k) && k.length > 1) {
      return Number(Array.from(k).map((c) => (c === '零' ? 0 : KANJI_DIGITS.indexOf(c))).join(''));
    }
    let total = 0;
    let cur = 0;
    for (const c of k) {
      if (c === '百') { total += (cur || 1) * 100; cur = 0; }
      else if (c === '十') { total += (cur || 1) * 10; cur = 0; }
      else if (c === '零') { cur = 0; }
      else {
        const d = KANJI_DIGITS.indexOf(c);
        if (d < 0) return NaN;
        cur = d;
      }
    }
    return total + cur;
  }

  function numToKanji(n) {
    if (n === 0) return '〇';
    let out = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;
    if (h) out += (h > 1 ? KANJI_DIGITS[h] : '') + '百';
    if (t) out += (t > 1 ? KANJI_DIGITS[t] : '') + '十';
    if (o) out += KANJI_DIGITS[o];
    return out;
  }

  const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[．・]/g, '.');
  const toFull = (s) => s.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/\./g, '．');

  // 本文を下から見て、一番新しい「第〇章」を探す
  const CHAPTER_RE = /第([0-9０-９〇零一二三四五六七八九十百]+)(?:[.．・]([0-9０-９〇一二三四五六七八九]+))?章([^\n]*)/g;

  function findLatestChapter() {
    const blocks = document.querySelectorAll('#data_container .data_block');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const edit = blocks[i].querySelector('.data_edit');
      if (!edit) continue;
      const text = edit.getAttribute('data-raw-markdown') || edit.innerText || '';
      let m;
      let last = null;
      CHAPTER_RE.lastIndex = 0;
      while ((m = CHAPTER_RE.exec(text)) !== null) last = m;
      if (!last) continue;
      const [, intRaw, decRaw, rest] = last;
      const style = /[０-９]/.test(intRaw) ? 'full' : /[0-9]/.test(intRaw) ? 'half' : 'kanji';
      const toNum = (r) => (style === 'kanji' ? kanjiToNum(r) : Number(toHalf(r)));
      const main = toNum(intRaw);
      const sub = decRaw ? toNum(decRaw) : null;
      if (Number.isNaN(main)) continue;
      const title = rest.replace(/^[\s　]+/, '').replace(/[\s　]*[（(]続き[）)][\s　]*$/, '').trim();
      return { main, sub, style, title };
    }
    return null;
  }

  function formatNum(n, style) {
    if (style === 'kanji') return numToKanji(n);
    return style === 'full' ? toFull(String(n)) : String(n);
  }

  function formatChapter(main, sub, style) {
    let s = formatNum(main, style);
    if (sub !== null && sub !== undefined) {
      s += (style === 'kanji' ? '・' : style === 'full' ? '．' : '.') + formatNum(sub, style);
    }
    return '第' + s + '章';
  }

  function chapterText(mode) {
    const latest = findLatestChapter();
    if (!latest) {
      if (mode === 'side') return formatChapter(0, 5, 'half');
      if (mode === 'cont') return '';
      return formatChapter(1, null, 'half');
    }
    const { main, sub, style, title } = latest;
    if (mode === 'next') return formatChapter(main + 1, null, style);
    if (mode === 'cont') return formatChapter(main, sub, style) + (title ? '　' + title : '') + '（続き）';
    // 断章：第5章 → 第5.5章、第5.5章 → 第5.6章
    return formatChapter(main, sub === null ? 5 : sub + 1, style);
  }

  function loadMode() {
    try {
      const v = GM_getValue(KEY_CHAPTER_MODE);
      return CHAPTER_MODES.some((m) => m.id === v) ? v : 'next';
    } catch (_) { return 'next'; }
  }
  function saveMode(v) {
    try { GM_setValue(KEY_CHAPTER_MODE, v); } catch (_) {}
  }

  /* ---------- パネル ---------- */
  let overlay = null;
  let sceneField = null;
  let userField = null;
  let aiField = null;
  let settings = null;
  let setTitle = null;
  let setFields = [];
  let settingsKey = KEY_TEMPLATES; // 設定画面で編集中のテンプレ（AI用かユーザー用か）
  let modeBtn = null;
  let chapterMode = loadMode();
  let lastChapter = null;     // AI欄に入れた章の文字（モード切り替え時に差し替える）
  let lastChapterUser = null; // ユーザー欄に入れた章の文字
  let lastUserTpl = null;     // 最後に押したユーザーテンプレの番号
  let lastAiTpl = null;       // 最後に押したAIテンプレの番号
  let refillPending = false;  // 「続ける」のあと、次にパネルを開いたときにテンプレを入れ直す

  function buildPanel() {
    overlay = document.createElement('div');
    overlay.id = 'aib_overlay';
    overlay.innerHTML = `
      <div id="aib_box">
        <div id="aib_head"><span>ユーザー＋AI追加</span><button type="button" id="aib_close">×</button></div>
        <div class="aib_area" id="aib_scene_area">
          <div id="aib_scene_head"><div class="aib_label">書く場面（{場面} か【書く場面】の下に入る）</div><button type="button" id="aib_write">書く</button></div>
          <textarea id="aib_scene"></textarea>
        </div>
        <div class="aib_area" id="aib_user_area">
          <div class="aib_label">ユーザー</div>
          <textarea id="aib_user"></textarea>
        </div>
        <div class="aib_row">
          <button type="button" class="aib_btn aib_tpl" data-kind="user" data-i="0">1</button>
          <button type="button" class="aib_btn aib_tpl" data-kind="user" data-i="1">2</button>
          <button type="button" class="aib_btn aib_tpl" data-kind="user" data-i="2">3</button>
          <button type="button" class="aib_btn aib_tpl_gear" id="aib_utpl_set">⚙</button>
        </div>
        <div class="aib_row">
          <button type="button" class="aib_btn" id="aib_qp_show">QP辞書</button>
          <button type="button" class="aib_btn" id="aib_qp_load">QP読込</button>
          <button type="button" class="aib_btn" id="aib_mode"></button>
          <button type="button" class="aib_btn" id="aib_continue">続ける</button>
        </div>
        <div class="aib_area">
          <div class="aib_label">AI</div>
          <textarea id="aib_ai"></textarea>
        </div>
        <div class="aib_row">
          <button type="button" class="aib_btn aib_tpl" data-kind="ai" data-i="0">1</button>
          <button type="button" class="aib_btn aib_tpl" data-kind="ai" data-i="1">2</button>
          <button type="button" class="aib_btn aib_tpl" data-kind="ai" data-i="2">3</button>
          <button type="button" class="aib_btn aib_tpl_gear" id="aib_tpl_set">⚙</button>
        </div>
        <div id="aib_helper">
          <div id="aib_head"><span>清書補助</span><button type="button" id="aib_h_close">×</button></div>
          <div class="aib_h_row"><span class="aib_h_name">視点</span><select id="aib_h_pov"></select></div>
          <div class="aib_h_row"><span class="aib_h_name">主に喋る</span><div id="aib_h_speakers"></div></div>
          <div class="aib_h_row"><span class="aib_h_name">冒頭はここから</span><input type="text" id="aib_h_start"></div>
          <div class="aib_h_row"><span class="aib_h_name">最後はこの状態</span><input type="text" id="aib_h_end"></div>
          <div class="aib_h_row"><span class="aib_h_name">配分</span><input type="text" id="aib_h_ratio" placeholder="会話多め／前半〜後半〜"></div>
          <div class="aib_h_row"><span class="aib_h_name">やらないこと</span><input type="text" id="aib_h_avoid"></div>
          <div id="aib_h_events_area">
            <div class="aib_label">起きること（1行1つ。QP辞書からも貼れる）</div>
            <textarea id="aib_h_events"></textarea>
          </div>
          <div id="aib_h_status"></div>
          <div class="aib_row">
            <button type="button" class="aib_btn" id="aib_h_qp">QP辞書</button>
            <button type="button" class="aib_btn" id="aib_h_polish">清書 → 場面欄へ</button>
          </div>
        </div>
        <div id="aib_settings">
          <div class="aib_set_title" id="aib_set_title">テンプレ設定</div>
          <div class="aib_set_item"><div class="aib_label">テンプレ1</div><textarea data-i="0"></textarea></div>
          <div class="aib_set_item"><div class="aib_label">テンプレ2</div><textarea data-i="1"></textarea></div>
          <div class="aib_set_item"><div class="aib_label">テンプレ3</div><textarea data-i="2"></textarea></div>
          <div class="aib_row">
            <button type="button" class="aib_btn" id="aib_set_save">保存</button>
            <button type="button" class="aib_btn" id="aib_set_cancel">キャンセル</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    sceneField = overlay.querySelector('#aib_scene');
    userField = overlay.querySelector('#aib_user');
    aiField = overlay.querySelector('#aib_ai');
    settings = overlay.querySelector('#aib_settings');
    setTitle = overlay.querySelector('#aib_set_title');
    setFields = Array.from(settings.querySelectorAll('textarea'));

    overlay.querySelector('#aib_close').addEventListener('click', closePanel);

    overlay.querySelector('#aib_qp_show').addEventListener('click', () => {
      const b = document.querySelector(QP_SHOW_SELECTOR);
      if (b) b.click(); else alert('QuickPasteの「キャラ一覧」ボタンが見つからなかったよ');
    });
    overlay.querySelector('#aib_qp_load').addEventListener('click', () => {
      const b = document.querySelector(QP_LOAD_SELECTOR);
      if (b) b.click(); else alert('QuickPasteの「読込」ボタンが見つからなかったよ');
    });

    overlay.querySelector('#aib_continue').addEventListener('click', onContinue);

    overlay.querySelectorAll('.aib_tpl').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyTemplate(btn.dataset.kind === 'user', Number(btn.dataset.i));
      });
    });

    modeBtn = overlay.querySelector('#aib_mode');
    updateModeButton();
    modeBtn.addEventListener('click', () => {
      const i = CHAPTER_MODES.findIndex((m) => m.id === chapterMode);
      chapterMode = CHAPTER_MODES[(i + 1) % CHAPTER_MODES.length].id;
      saveMode(chapterMode);
      updateModeButton();
      // すでに欄へ入れた章があれば、新しいモードのものに差し替える
      lastChapter = swapChapter(aiField, lastChapter);
      lastChapterUser = swapChapter(userField, lastChapterUser);
    });

    overlay.querySelector('#aib_tpl_set').addEventListener('click', () => openSettings(KEY_TEMPLATES, 'AIテンプレ設定'));
    overlay.querySelector('#aib_utpl_set').addEventListener('click', () => openSettings(KEY_USER_TEMPLATES, 'ユーザーテンプレ設定'));
    overlay.querySelector('#aib_set_save').addEventListener('click', () => {
      const t = ['', '', ''];
      setFields.forEach((f) => { t[Number(f.dataset.i)] = f.value; });
      saveTemplates(settingsKey, t);
      settings.classList.remove('aib-open');
    });
    overlay.querySelector('#aib_set_cancel').addEventListener('click', () => {
      settings.classList.remove('aib-open');
    });

    // 清書補助
    helper = overlay.querySelector('#aib_helper');
    helperFields = {
      pov: overlay.querySelector('#aib_h_pov'),
      speakers: overlay.querySelector('#aib_h_speakers'),
      start: overlay.querySelector('#aib_h_start'),
      end: overlay.querySelector('#aib_h_end'),
      ratio: overlay.querySelector('#aib_h_ratio'),
      avoid: overlay.querySelector('#aib_h_avoid'),
      events: overlay.querySelector('#aib_h_events'),
      status: overlay.querySelector('#aib_h_status'),
      polish: overlay.querySelector('#aib_h_polish'),
    };
    overlay.querySelector('#aib_write').addEventListener('click', openHelper);
    overlay.querySelector('#aib_h_close').addEventListener('click', () => { saveHelper(); helper.classList.remove('aib-open'); });
    overlay.querySelector('#aib_h_qp').addEventListener('click', () => {
      const b = document.querySelector(QP_SHOW_SELECTOR);
      if (b) b.click(); else alert('QuickPasteの「キャラ一覧」ボタンが見つからなかったよ');
    });
    helperFields.speakers.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-name]');
      if (!b) return;
      b.classList.toggle('aib-on');
      saveHelper();
    });
    ['pov', 'start', 'end', 'ratio', 'avoid', 'events'].forEach((k) => helperFields[k].addEventListener('change', saveHelper));
    helperFields.polish.addEventListener('click', polishToScene);
  }

  /* ---------- 清書補助 ---------- */
  let helper = null;
  let helperFields = null;
  let polishing = false;

  function loadHelper() {
    try {
      const v = GM_getValue(KEY_HELPER, {});
      return v && typeof v === 'object' ? v : {};
    } catch (_) { return {}; }
  }
  function saveHelper() {
    if (!helperFields) return;
    const f = helperFields;
    const v = {
      pov: f.pov.value,
      speakers: Array.from(f.speakers.querySelectorAll('button.aib-on')).map((b) => b.dataset.name),
      start: f.start.value, end: f.end.value, ratio: f.ratio.value, avoid: f.avoid.value, events: f.events.value,
    };
    try { GM_setValue(KEY_HELPER, v); } catch (_) {}
  }

  // QuickPasteの辞書（名前(説明) の1行1項目）から名前を読む。人物らしいものを先に並べる
  function loadCharacters() {
    let text = '';
    try { text = localStorage.getItem(KEY_CHARLIST) || ''; } catch (_) {}
    const persons = [];
    const others = [];
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const open = line.indexOf('(');
      const close = line.lastIndexOf(')');
      const name = open > 0 && close > open ? line.slice(0, open).trim() : line;
      const desc = open > 0 && close > open ? line.slice(open + 1, close) : '';
      if (!name) return;
      (PERSON_RE.test(desc) ? persons : others).push(name);
    });
    return persons.concat(others);
  }

  function openHelper() {
    const saved = loadHelper();
    const names = loadCharacters();
    const f = helperFields;

    f.pov.innerHTML = '<option value="">（なし）</option>' + names.map((n) => '<option>' + escapeHtml(n) + '</option>').join('');
    if (saved.pov && names.includes(saved.pov)) f.pov.value = saved.pov;

    const on = new Set(Array.isArray(saved.speakers) ? saved.speakers : []);
    f.speakers.innerHTML = names.length
      ? names.map((n) => '<button type="button" data-name="' + escapeHtml(n).replace(/"/g, '&quot;') + '"' + (on.has(n) ? ' class="aib-on"' : '') + '>' + escapeHtml(n) + '</button>').join('')
      : '<span class="aib_h_none">QuickPasteの辞書がまだ読み込まれてないよ（QP読込）</span>';

    f.start.value = saved.start || '';
    f.end.value = saved.end || '';
    f.ratio.value = saved.ratio || '';
    f.avoid.value = saved.avoid || '';
    f.events.value = saved.events || '';
    f.status.textContent = '';
    helper.classList.add('aib-open');
  }

  // 埋めた欄だけを「項目：中身」の箇条書きにする
  function buildBulletText() {
    const f = helperFields;
    const lines = [];
    const speakers = Array.from(f.speakers.querySelectorAll('button.aib-on')).map((b) => b.dataset.name);
    if (f.pov.value) lines.push('視点：' + f.pov.value);
    if (speakers.length) lines.push('主に喋る：' + speakers.join('、'));
    if (f.start.value.trim()) lines.push('冒頭はここから：' + f.start.value.trim());
    if (f.end.value.trim()) lines.push('最後はこの状態で終わる：' + f.end.value.trim());
    if (f.ratio.value.trim()) lines.push('配分：' + f.ratio.value.trim());
    if (f.avoid.value.trim()) lines.push('やらないこと：' + f.avoid.value.trim());
    const events = f.events.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/^[・\-－−•*]/.test(l) ? '・' + l.replace(/^[・\-－−•*]\s*/, '') : '・' + l));
    if (events.length) lines.push('起きること：', ...events);
    return lines.join('\n');
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function setStatus(text, color) {
    if (!helperFields) return;
    helperFields.status.textContent = text;
    helperFields.status.style.color = color || '#444';
  }

  function persistPetitbots() {
    try {
      if (typeof W.HandlePetitbotEditorPersist === 'function') W.HandlePetitbotEditorPersist(true);
      else if (typeof W.PersistPetitbotCurrentMode === 'function') W.PersistPetitbotCurrentMode();
    } catch (_) {}
  }

  // 目印がそろっているプロンプトを控えておき、目印が消えていたら控えから戻す
  function ensureTemplate(promptEl, botName) {
    const key = 'ainovel-petitbot-template:' + botName;
    if (promptEl.value.includes(PLACEHOLDER)) {
      try { localStorage.setItem(key, promptEl.value); } catch (_) {}
      return true;
    }
    let saved = null;
    try { saved = localStorage.getItem(key); } catch (_) {}
    if (saved && saved.includes(PLACEHOLDER)) {
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

  // 実行ボタンを押す一瞬だけプロンプトを差し替えて、押した直後に元へ戻す（差し替えた中身は保存されない）
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

  // 先頭にある【書く場面】の行（と、その前後の空行）を取る
  function stripSceneHead(text) {
    const lines = text.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    if (lines.length && lines[0].trim().replace(/[\s　:：]+$/, '') === SCENE_HEAD) lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
    return lines.join('\n').trim();
  }

  async function polishToScene() {
    if (polishing) return;
    const bullets = buildBulletText();
    if (!bullets) { setStatus('どれか1つは埋めてね', '#cc0000'); return; }
    saveHelper();
    polishing = true;
    helperFields.polish.disabled = true;
    let promptEl = null;
    let originalPrompt = null;
    try {
      const idx = findBot(BOT_NAME);
      if (idx < 0) throw new Error('「' + BOT_NAME + '」のプチボットが見つからないよ');
      const sel = document.getElementById('petitbot_output' + idx);
      if (!sel || sel.value !== 'output_petitbot') throw new Error('プチボットの出力先を「プチボット専用欄」にしてね');
      promptEl = document.getElementById('petitbot_prompt' + idx);
      if (!promptEl || !ensureTemplate(promptEl, getBotName(idx))) throw new Error('プロンプトに目印「' + PLACEHOLDER + '」がないよ');

      setStatus('清書中…');
      originalPrompt = promptEl.value;
      const filled = originalPrompt.replace(PLACEHOLDER, bullets);
      let result;
      try { result = await runBot(idx, promptEl, filled); } finally { promptEl.value = originalPrompt; originalPrompt = null; }
      if (!result) throw new Error('清書の結果が空だったよ');
      // 先頭の【書く場面】の見出しは取る（テンプレ側の【書く場面】の下に入るので二重になる）
      result = stripSceneHead(result);

      sceneField.value = result;
      fireInput(sceneField);
      // 起きることだけ空にして、視点などは次回のために残す
      helperFields.events.value = '';
      saveHelper();
      setStatus('場面欄に入れたよ', '#2d8a34');
      helper.classList.remove('aib-open');
    } catch (e) {
      setStatus(e.message || String(e), '#cc0000');
    } finally {
      if (originalPrompt !== null && promptEl) promptEl.value = originalPrompt;
      helperFields.polish.disabled = false;
      polishing = false;
    }
  }

  // テンプレを欄に入れる（{章} はその時点の本文から計算する）
  function applyTemplate(isUser, i) {
    let t = loadTemplates(isUser ? KEY_USER_TEMPLATES : KEY_TEMPLATES)[i];
    let ch = null;
    if (t.includes(CHAPTER_MARK)) {
      ch = chapterText(chapterMode);
      t = t.split(CHAPTER_MARK).join(ch);
    }
    if (isUser) {
      lastUserTpl = i;
      lastChapterUser = ch;
      userField.value = t;
    } else {
      lastAiTpl = i;
      lastChapter = ch;
      aiField.value = t;
    }
  }

  function swapChapter(field, last) {
    if (last === null || last === '' || !field.value.includes(last)) return last;
    const next = chapterText(chapterMode);
    field.value = field.value.replace(last, next);
    return next;
  }

  function openSettings(key, title) {
    settingsKey = key;
    setTitle.textContent = title;
    const t = loadTemplates(key);
    setFields.forEach((f) => { f.value = t[Number(f.dataset.i)]; });
    settings.classList.add('aib-open');
  }

  function updateModeButton() {
    if (!modeBtn) return;
    const m = CHAPTER_MODES.find((x) => x.id === chapterMode) || CHAPTER_MODES[0];
    modeBtn.textContent = m.label;
    modeBtn.title = '章番号の入れ方（押すと 次章 → 続き → 断章 の順に切り替え）';
  }

  function openPanel() {
    if (!overlay) buildPanel();
    settings.classList.remove('aib-open');
    helper.classList.remove('aib-open');
    // 前回「続ける」の前に押していたテンプレを入れ直す（章番号は生成後の本文で計算し直す）
    if (refillPending) {
      refillPending = false;
      if (lastUserTpl !== null) applyTemplate(true, lastUserTpl);
      if (lastAiTpl !== null) applyTemplate(false, lastAiTpl);
    }
    overlay.classList.add('aib-open');
  }

  function closePanel() {
    if (overlay) overlay.classList.remove('aib-open');
  }

  function onContinue() {
    const scene = sceneField.value.trim();
    const userText = insertScene(userField.value, scene);
    const aiText = insertScene(aiField.value, scene);
    if (!addBlocks(userText, aiText)) return;
    sceneField.value = '';
    userField.value = '';
    aiField.value = '';
    lastChapter = null;
    lastChapterUser = null;
    refillPending = true;
    closePanel();
    // サイト側の保存が追いつくのを少し待ってから「続ける」を押す
    setTimeout(() => {
      const b = document.querySelector(CONTINUE_SELECTOR);
      if (b) b.click(); else alert('「続ける」ボタンが見つからなかったよ');
    }, 500);
  }

  /* ---------- 仮ボタン（パレットを作り直すまでの間） ---------- */
  const tmpStyle = document.createElement('style');
  tmpStyle.textContent = `
    #${BTN_ID} { position:fixed; left:8px; bottom:120px; z-index:99980; width:48px; height:48px; border-radius:50%; border:1px solid #000; background:rgb(205,43,90); color:#fff; font-size:24px; line-height:1; padding:0; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.4); opacity:.85; }
  `;
  document.head.appendChild(tmpStyle);

  function ensureButton() {
    if (!document.getElementById('data_container') || document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.title = 'ユーザー＋AIブロック追加';
    btn.textContent = '➕';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
    document.body.appendChild(btn);
  }

  ensureButton();
  new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
})();
