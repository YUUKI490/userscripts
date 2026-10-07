// ==UserScript==
// @name         AIのべりすと プチボット出力→脚注貼り付け
// @namespace    https://ai-novel.com/
// @version      1.0.0
// @description  プチボット専用出力欄のAI出力を、脚注（オーサーズノート）欄に貼り付けるボタンを追加します
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'pb2an-btn';
  const MSG_ID = 'pb2an-msg';

  function showMessage(text, ok) {
    const msg = document.getElementById(MSG_ID);
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = ok ? '#2d8a34' : '#cc0000';
    clearTimeout(showMessage._t);
    showMessage._t = setTimeout(() => { msg.textContent = ''; }, 3000);
  }

  function pasteToAuthorsNote() {
    const output = document.getElementById('petitbot_output_assistant');
    const an = document.getElementById('authorsnote');
    if (!output || !an) {
      showMessage('出力欄か脚注欄が見つかりません', false);
      return;
    }
    const text = output.value.trim();
    if (!text) {
      showMessage('プチボットの出力が空です', false);
      return;
    }

    an.value = text;
    an.dispatchEvent(new Event('input', { bubbles: true }));
    an.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof window.CopyContent === 'function') {
      try { window.CopyContent(); } catch (e) { /* 何もしない */ }
    }
    showMessage('脚注に貼り付けました', true);
  }

  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const applyBtn = document.getElementById('petitbot_output_apply');
    if (!applyBtn) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = applyBtn.className;
    btn.textContent = 'この出力結果を脚注に貼り付ける';
    btn.style.marginTop = '8px';
    btn.addEventListener('click', pasteToAuthorsNote);

    const msg = document.createElement('div');
    msg.id = MSG_ID;
    msg.style.fontSize = '14px';
    msg.style.marginTop = '4px';

    const anchor = document.getElementById('petitbot_output_apply_feedback') || applyBtn;
    anchor.insertAdjacentElement('afterend', btn);
    btn.insertAdjacentElement('afterend', msg);
  }

  addButton();
  const observer = new MutationObserver(addButton);
  observer.observe(document.body, { childList: true, subtree: true });
})();
