// ==UserScript==
// @name         AIのべりすと 指示清書（プチボット）
// @namespace    https://ai-novel.com/
// @version      1.4.0
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

  // プチボットの保存処理を呼ぶ（リモート保存のときも元のプロンプトが保存されるように）
  function persistPetitbots() {
    try {
      if (typeof window.HandlePetitbotEditorPersist === 'function') window.HandlePetitbotEditorPersist(true);
      else if (typeof window.PersistPetitbotCurrentMode === 'function') window.PersistPetitbotCurrentMode();
    } catch (e) { /* 何もしない */ }
  }

  // 目印がそろっているプロンプトを控えておき、目印が消えていたら控えから戻す
  function ensureTemplate(promptEl, botName, marks) {
    const key = 'ainovel-petitbot-template:' + botName;
    const ok = (s) => marks.every((m) => s.includes(m));
    if (ok(promptEl.value)) {
      try { localStorage.setItem(key, promptEl.value); } catch (e) { /* 何もしない */ }
      return true;
    }
    let saved = null;
    try { saved = localStorage.getItem(key); } catch (e) { /* 何もしない */ }
    if (saved && ok(saved)) {
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

  // tempText を渡すと、実行ボタンを押す一瞬だけプロンプトを差し替えて、押した直後に元へ戻す
  // （変更イベントを出さないので、差し替えた中身が保存されない）
  async function runBot(i, promptEl, tempText) {
    const out = document.getElementById('petitbot_output_assistant');
    const info = document.getElementById('petitbot_output_info');
    if (!out) throw new Error('プチボットの出力欄が見つかりません');

    // 前のプチボットの処理が落ち着くまで少し待ち、実行ボタンが押せる状態になるのを待つ
    await sleep(1500);
    const area = document.getElementById('petitbotarea' + i);
    const execBtn = area && area.querySelector('.btn-petitbot-chat');
    if (!execBtn) throw new Error('プチボットの実行ボタンが見つかりません');
    const waitStart = Date.now();
    while (execBtn.disabled || execBtn.getAttribute('aria-disabled') === 'true') {
      if (Date.now() - waitStart > 30000) throw new Error('プチボットの実行ボタンが押せる状態になりません');
      await sleep(500);
    }
    const beforeInfo = info ? info.textContent : '';
    const beforeVal = out.value;
    const livePrompt = document.getElementById('petitbot_prompt' + i) || promptEl;
    if (livePrompt && tempText != null) {
      const orig = livePrompt.value;
      livePrompt.value = tempText;
      try { execBtn.click(); } finally { livePrompt.value = orig; }
    } else {
      execBtn.click();
    }

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
      } else if (info) {
        // 出力情報から「生成中」が消え、出力が少し止まったら完了
        if (!info.textContent.includes('生成中') && info.textContent !== beforeInfo && Date.now() - lastChange >= 1500) break;
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
      if (!promptEl || !ensureTemplate(promptEl, getBotName(idx), [PLACEHOLDER])) {
        throw new Error('プロンプトに目印「' + PLACEHOLDER + '」がありません');
      }

      setStatus('指示を清書中…');
      originalPrompt = promptEl.value;
      const filled = originalPrompt.replace(PLACEHOLDER, instruction);

      let result;
      try {
        result = await runBot(idx, promptEl, filled);
      } finally {
        promptEl.value = originalPrompt;
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
