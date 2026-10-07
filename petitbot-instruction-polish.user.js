// ==UserScript==
// @name         AIのべりすと 指示清書（プチボット）
// @namespace    https://ai-novel.com/
// @version      1.0.0
// @description  入力欄に書いたざっくりした作成指示をプチボット（指示清書係）で清書し、入力欄に書き戻します。送信はしません
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定 =====
  // プチボットの名称に含まれる文字で探します
  const BOT_NAME = '指示清書';
  // プロンプトに書いておく目印（ここに入力欄の指示が差し込まれます）
  const PLACEHOLDER = '（ここに作成指示を貼り付ける）';
  // 出力を待つ最大時間（ミリ秒）
  const WAIT_TIMEOUT = 180000;
  // 出力がこの時間変化しなければ完了とみなす（ミリ秒）
  const STABLE_MS = 4000;
  // ================

  const BTN_ID = 'ipol-btn';
  const MSG_ID = 'ipol-msg';
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

  async function main() {
    if (running) return;
    running = true;
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.disabled = true;

    let promptEl = null;
    let originalPrompt = null;

    try {
      const field = document.getElementById('chat_field');
      if (!field) throw new Error('入力欄が見つかりません');
      const instruction = field.value.trim();
      if (!instruction) throw new Error('入力欄に指示を書いてください');

      const idx = findBot(BOT_NAME);
      if (idx < 0) throw new Error('「' + BOT_NAME + '」のプチボットが見つかりません');
      const sel = document.getElementById('petitbot_output' + idx);
      if (!sel || sel.value !== 'output_petitbot') {
        throw new Error('プチボットの出力先を「プチボット専用欄」にしてください');
      }
      promptEl = document.getElementById('petitbot_prompt' + idx);
      if (!promptEl || !promptEl.value.includes(PLACEHOLDER)) {
        throw new Error('プロンプトに目印「' + PLACEHOLDER + '」がありません');
      }

      setStatus('指示を清書中…');
      originalPrompt = promptEl.value;
      promptEl.value = originalPrompt.replace(PLACEHOLDER, instruction);
      fireInput(promptEl);

      let result;
      try {
        result = await runBot(idx);
      } finally {
        promptEl.value = originalPrompt;
        fireInput(promptEl);
        originalPrompt = null;
      }
      if (!result) throw new Error('清書の結果が空でした');

      field.value = result;
      fireInput(field);
      setStatus('清書した指示を入力欄に入れました', '#2d8a34');
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
    const contBtn = document.getElementById('getcontinuation_chat');
    if (!contBtn) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'btn-square';
    btn.textContent = '✍️ 指示を清書';
    btn.addEventListener('click', main);

    const msg = document.createElement('div');
    msg.id = MSG_ID;
    msg.style.fontSize = '14px';
    msg.style.margin = '4px 0';

    contBtn.insertAdjacentElement('beforebegin', btn);
    btn.insertAdjacentElement('afterend', msg);
  }

  addButton();
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
})();
