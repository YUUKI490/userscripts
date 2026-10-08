// ==UserScript==
// @name         AIのべりすと AIブロック追加
// @namespace    yuuki490-ainovel
// @version      1.1
// @description  ツールパレットのボタンで、一番下にユーザーブロック＋AIブロックをセットで作る
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'ainovel-add-ai-block-btn';

  // 後片付け：サイトが普段ブロック追加後に呼んでいる処理をまとめて呼ぶ
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

  // 作戦A：サイト内部の関数でブロックを作る（cat は 'User' か 'Assistant'）
  function createBySite(cat) {
    if (typeof window.createDataBlockElement !== 'function') return null;
    const el = window.createDataBlockElement(0, [{ cat: cat, text: '' }]);
    return el && el.nodeType === 1 ? el : null;
  }

  // 作戦B：既存の同じ種類のブロックをコピーして中身を空にする（cls は 'user' か 'assistant'）
  function createByClone(container, cls) {
    const edits = container.querySelectorAll('.data_edit.' + cls);
    if (!edits.length) return null;
    const src = edits[edits.length - 1].closest('.data_block');
    if (!src) return null;
    const el = src.cloneNode(true);
    el.querySelectorAll('.data_edit').forEach((ed) => {
      ed.innerHTML = '';
      ed.setAttribute('data-raw-markdown', '');
      ed.removeAttribute('data-nv4-core-listeners-bound');
      ed.removeAttribute('data-paste-overflow-bound');
    });
    const cc = el.querySelector('.label_charcount');
    if (cc) cc.textContent = '0字';
    return el;
  }

  function makeBlock(container, cat, cls) {
    let el = null;
    try { el = createBySite(cat); } catch (e) { console.warn('[AIブロック追加] 作戦A失敗', e); }
    if (!el) el = createByClone(container, cls);
    return el;
  }

  function addBlocks() {
    const container = document.getElementById('data_container');
    if (!container) { alert('本文の欄が見つからなかったよ'); return; }

    const userEl = makeBlock(container, 'User', 'user');
    const aiEl = makeBlock(container, 'Assistant', 'assistant');
    if (!userEl || !aiEl) { alert('ブロックを作れなかったよ（コピー元のブロックもなし）'); return; }

    container.appendChild(userEl);
    container.appendChild(aiEl);
    afterInsert(container);

    setTimeout(() => {
      aiEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
      const ed = userEl.querySelector('.data_edit');
      if (ed) ed.focus();
    }, 30);
  }

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
      addBlocks();
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
