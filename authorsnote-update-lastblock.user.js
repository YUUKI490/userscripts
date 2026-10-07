// ==UserScript==
// @name         AIのべりすと 最後のブロックで脚注を更新
// @namespace    https://ai-novel.com/
// @version      1.0.0
// @description  今の脚注と本文の最後のブロックの書き出しをプチボット（脚注更新係）に渡して、更新した脚注を脚注欄に貼り付けます
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定 =====
  // プチボットの名称に含まれる文字で探します
  const BOT_NAME = '脚注を更新';
  // プロンプトに書いておく目印
  const PH_AN = '（ここに今の脚注を貼り付ける）';
  const PH_START = '（ここに最後のブロックの書き出しを入れる）';
  // 脚注が空のときに差し込む文
  const EMPTY_AN = '（まだ脚注はありません。最後のブロックから新しく作ってください）';
  // 最後のブロックの書き出しとして渡す文字数
  const START_LEN = 30;
  // 出力を待つ最大時間（ミリ秒）
  const WAIT_TIMEOUT = 180000;
  // 出力がこの時間変化しなければ完了とみなす（ミリ秒）
  const STABLE_MS = 4000;
  // ================

  const BTN_ID = 'anul-btn';
  const MSG_ID = 'anul-msg';
  let running = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setStatus(text, color) {
    const msg = document.getElementById(MSG_ID);
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = color || '#444';
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

  // 本文の最後のブロック（テキストかAIの出力）の書き出しを取り出す
  function getLastBlockStart() {
    const blocks = document.querySelectorAll('#data_container .data_block');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const cat = blocks[i].querySelector('.category');
      const type = cat ? cat.getAttribute('data-category') : '';
      if (type !== 'assistant' && type !== 'plaintext') continue;
      const edit = blocks[i].querySelector('.data_edit');
      if (!edit) continue;
      const raw = edit.getAttribute('data-raw-markdown') || edit.innerText || '';
      const firstLine = raw.split('\n').map((s) => s.trim()).find((s) => s);
      if (firstLine) return firstLine.slice(0, START_LEN);
    }
    return '';
  }

  async function runBot(i) {
    const out = document.getElementById('petitbot_output_assistant');
    const info = document.getElementById('petitbot_output_info');
    const area = document.getElementById('petitbotarea' + i);
    const execBtn = area && area.querySelector('.btn-petitbot-chat');
    if (!out || !execBtn) throw new Error('プチボットの実行ボタンか出力欄が見つかりません');

    const beforeInfo = info ? info.textContent : '';
    const beforeVal = out.value;
    execBtn.click();

    const start = Date.now();
    while (true) {
      await sleep(500);
      const changed = (info && info.textContent !== beforeInfo) || out.value !== beforeVal;
      if (changed) break;
      if (Date.now() - start > WAIT_TIMEOUT) throw new Error('プチボットの出力が返ってきませんでした');
    }

    let last = out.value;
    let lastChange = Date.now();
    while (true) {
      await sleep(500);
      if (out.value !== last) {
        last = out.value;
        lastChange = Date.now();
      } else if (last.trim() && Date.now() - lastChange >= STABLE_MS) {
        break;
      }
      if (Date.now() - start > WAIT_TIMEOUT) throw new Error('プチボットの出力が終わりませんでした');
    }
    return out.value.trim();
  }

  function pasteToAuthorsNote(text) {
    const an = document.getElementById('authorsnote');
    if (!an) throw new Error('脚注欄が見つかりません');
    an.value = text;
    fireInput(an);
    if (typeof window.CopyContent === 'function') {
      try { window.CopyContent(); } catch (e) { /* 何もしない */ }
    }
  }

  async function main() {
    if (running) return;
    running = true;
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.disabled = true;

    let promptEl = null;
    let originalPrompt = null;

    try {
      const idx = findBot(BOT_NAME);
      if (idx < 0) throw new Error('「' + BOT_NAME + '」のプチボットが見つかりません');
      const sel = document.getElementById('petitbot_output' + idx);
      if (!sel || sel.value !== 'output_petitbot') {
        throw new Error('プチボットの出力先を「プチボット専用欄」にしてください');
      }
      promptEl = document.getElementById('petitbot_prompt' + idx);
      if (!promptEl || !promptEl.value.includes(PH_AN) || !promptEl.value.includes(PH_START)) {
        throw new Error('プロンプトに目印（' + PH_AN + '／' + PH_START + '）がありません');
      }
      const an = document.getElementById('authorsnote');
      if (!an) throw new Error('脚注欄が見つかりません');

      const startText = getLastBlockStart();
      if (!startText) throw new Error('本文の最後のブロックが見つかりません');
      const currentAn = an.value.trim() || EMPTY_AN;

      setStatus('脚注を更新中…');
      originalPrompt = promptEl.value;
      promptEl.value = originalPrompt.replace(PH_START, startText).replace(PH_AN, currentAn);
      fireInput(promptEl);

      let result;
      try {
        result = await runBot(idx);
      } finally {
        promptEl.value = originalPrompt;
        fireInput(promptEl);
        originalPrompt = null;
      }
      if (!result) throw new Error('更新結果が空でした');

      pasteToAuthorsNote(result);
      setStatus('脚注を更新しました', '#2d8a34');
    } catch (e) {
      setStatus(e.message || String(e), '#cc0000');
    } finally {
      if (originalPrompt !== null && promptEl) {
        promptEl.value = originalPrompt;
        fireInput(promptEl);
      }
      if (btn) btn.disabled = false;
      running = false;
    }
  }

  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const applyBtn = document.getElementById('petitbot_output_apply');
    if (!applyBtn) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = applyBtn.className;
    btn.textContent = '最後のブロックで脚注を更新する';
    btn.style.marginTop = '8px';
    btn.addEventListener('click', main);

    const msg = document.createElement('div');
    msg.id = MSG_ID;
    msg.style.fontSize = '14px';
    msg.style.marginTop = '4px';

    const anchor = document.getElementById('anmc-msg') || document.getElementById('pb2an-msg') ||
      document.getElementById('petitbot_output_apply_feedback') || applyBtn;
    anchor.insertAdjacentElement('afterend', btn);
    btn.insertAdjacentElement('afterend', msg);
  }

  addButton();
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
})();
