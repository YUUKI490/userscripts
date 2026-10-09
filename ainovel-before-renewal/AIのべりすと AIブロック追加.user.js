// ==UserScript==
// @name         AIのべりすと AIブロック追加
// @namespace    yuuki490-ainovel
// @version      2.0
// @description  ツールパレットのボタンで入力パネルを開き、ユーザーブロック＋AIブロック（書き出し入り）を作って「続ける」を押す
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'ainovel-add-ai-block-btn';
  const KEY_TEMPLATES = 'ainovel_aiblock_templates';
  const CONTINUE_SELECTOR = '#getcontinuation_chat';
  const QP_SHOW_SELECTOR = '#qp_show_btn';
  const QP_LOAD_SELECTOR = '#qp_load_btn';

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
    #aib_user_area { flex:1.3; }
    .aib_row { display:flex; gap:7px; align-items:stretch; }
    .aib_btn { border:1px solid #888; border-radius:9px; background:#f2f2f2; color:#222; padding:10px 12px; font-size:15px; font-weight:700; cursor:pointer; }
    #aib_continue { margin-left:auto; min-width:110px; background:rgb(205,43,90); border-color:#000; color:#fff; font-size:18px; }
    .aib_tpl { flex:1; font-size:20px; }
    #aib_tpl_set { flex:none; width:52px; border-radius:50%; font-size:20px; padding:0; }
    #aib_settings { position:absolute; inset:0; background:#fff; border-radius:12px; padding:10px; box-sizing:border-box; display:none; flex-direction:column; gap:8px; }
    #aib_settings.aib-open { display:flex; }
    #aib_settings textarea { flex:1; width:100%; box-sizing:border-box; resize:none; border:1px solid #999; border-radius:10px; padding:8px; font-size:16px; line-height:1.5; }
    .aib_set_item { flex:1; display:flex; flex-direction:column; min-height:0; }
    .aib_set_title { font-weight:700; font-size:.9rem; }
    #aib_set_save { flex:1; background:#2196f3; border-color:#1976d2; color:#fff; }
  `;
  document.head.appendChild(style);

  /* ---------- テンプレ保存 ---------- */
  function loadTemplates() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY_TEMPLATES) || '[]');
      return [0, 1, 2].map((i) => (typeof arr[i] === 'string' ? arr[i] : ''));
    } catch (_) { return ['', '', '']; }
  }
  function saveTemplates(arr) {
    try { localStorage.setItem(KEY_TEMPLATES, JSON.stringify(arr)); } catch (_) {}
  }

  /* ---------- ブロック作成 ---------- */
  function afterInsert(container) {
    container.querySelectorAll('.data_block').forEach((b, i) => b.setAttribute('data-index', String(i)));
    const calls = [
      () => window.AttachListeners && window.AttachListeners(),
      () => window.ApplyIconRules && window.ApplyIconRules(),
      () => window.VisualChange && window.VisualChange(),
      () => window.CopyContent && window.CopyContent(),
      () => window.syncDOMToStorageDebounced && window.syncDOMToStorageDebounced(null),
    ];
    calls.forEach((fn) => { try { fn(); } catch (e) { console.warn('[AIブロック追加]', e); } });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 作戦A：サイト内部の関数でブロックを作る（cat は 'User' か 'Assistant'）
  function createBySite(cat, text) {
    if (typeof window.createDataBlockElement !== 'function') return null;
    const el = window.createDataBlockElement(0, [{ cat: cat, text: text }]);
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

  /* ---------- パネル ---------- */
  let overlay = null;
  let userField = null;
  let aiField = null;
  let settings = null;
  let setFields = [];

  function buildPanel() {
    overlay = document.createElement('div');
    overlay.id = 'aib_overlay';
    overlay.innerHTML = `
      <div id="aib_box">
        <div id="aib_head"><span>ユーザー＋AI追加</span><button type="button" id="aib_close">×</button></div>
        <div class="aib_area" id="aib_user_area">
          <div class="aib_label">ユーザー</div>
          <textarea id="aib_user"></textarea>
        </div>
        <div class="aib_row">
          <button type="button" class="aib_btn" id="aib_qp_show">QP辞書</button>
          <button type="button" class="aib_btn" id="aib_qp_load">QP読込</button>
          <button type="button" class="aib_btn" id="aib_continue">続ける</button>
        </div>
        <div class="aib_area">
          <div class="aib_label">AI</div>
          <textarea id="aib_ai"></textarea>
        </div>
        <div class="aib_row">
          <button type="button" class="aib_btn aib_tpl" data-i="0">1</button>
          <button type="button" class="aib_btn aib_tpl" data-i="1">2</button>
          <button type="button" class="aib_btn aib_tpl" data-i="2">3</button>
          <button type="button" class="aib_btn" id="aib_tpl_set">⚙</button>
        </div>
        <div id="aib_settings">
          <div class="aib_set_title">テンプレ設定</div>
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

    userField = overlay.querySelector('#aib_user');
    aiField = overlay.querySelector('#aib_ai');
    settings = overlay.querySelector('#aib_settings');
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
        const t = loadTemplates()[Number(btn.dataset.i)];
        aiField.value = t;
      });
    });

    overlay.querySelector('#aib_tpl_set').addEventListener('click', () => {
      const t = loadTemplates();
      setFields.forEach((f) => { f.value = t[Number(f.dataset.i)]; });
      settings.classList.add('aib-open');
    });
    overlay.querySelector('#aib_set_save').addEventListener('click', () => {
      const t = ['', '', ''];
      setFields.forEach((f) => { t[Number(f.dataset.i)] = f.value; });
      saveTemplates(t);
      settings.classList.remove('aib-open');
    });
    overlay.querySelector('#aib_set_cancel').addEventListener('click', () => {
      settings.classList.remove('aib-open');
    });
  }

  function openPanel() {
    if (!overlay) buildPanel();
    settings.classList.remove('aib-open');
    overlay.classList.add('aib-open');
  }

  function closePanel() {
    if (overlay) overlay.classList.remove('aib-open');
  }

  function onContinue() {
    if (!addBlocks(userField.value, aiField.value)) return;
    userField.value = '';
    aiField.value = '';
    closePanel();
    // サイト側の保存が追いつくのを少し待ってから「続ける」を押す
    setTimeout(() => {
      const b = document.querySelector(CONTINUE_SELECTOR);
      if (b) b.click(); else alert('「続ける」ボタンが見つからなかったよ');
    }, 500);
  }

  /* ---------- ツールパレットのボタン ---------- */
  function makeButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'ainovel-tool-palette-button';
    btn.dataset.tool = 'addAiBlock';
    btn.title = 'ユーザー＋AIブロック追加';
    btn.innerHTML =
      '<span class="ainovel-tool-palette-icon">➕</span>' +
      '<span class="ainovel-tool-palette-label">ユーザー＋AI追加</span>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
    return btn;
  }

  function ensureButton() {
    const palette = document.getElementById('ainovel-tool-palette');
    if (!palette || document.getElementById(BTN_ID)) return;
    palette.appendChild(makeButton());
  }

  ensureButton();
  new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
})();
