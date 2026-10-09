// ==UserScript==
// @name         AIのべりすと 途中切れ自動続行
// @namespace    yuuki490-ainovel
// @version      1.0
// @description  生成完了時、本文の最後の文字が句読点や記号でなければ、もう一度「続ける」を押す
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- 設定 ---------- */
  // この文字で終わっていれば「ちゃんと終わった」とみなす
  const END_CHARS = '。．.、，,！？!?‼⁉」』）)】〕〉》］]｝}"”’\'…‥―〜~♪♡❤★☆';
  // 続けて自動で押す回数の上限（止まらなくなるのを防ぐ）
  const MAX_AUTO = 3;
  // 生成完了から「続ける」を押すまでの待ち時間（ミリ秒）
  const DELAY = 800;
  // 生成中かどうかを確認する間隔（ミリ秒）
  const CHECK_INTERVAL = 300;

  const CONTINUE_SELECTOR = '#getcontinuation_chat';
  const LOADING_ID = 'loading_anim';

  let wasGenerating = false;
  let autoCount = 0;

  /* ---------- 生成中かどうか ---------- */
  function isGenerating() {
    const el = document.getElementById(LOADING_ID);
    if (!el) return false;
    const css = window.getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  }

  /* ---------- 本文の最後のブロック ---------- */
  function getLastBlockInfo() {
    const container = document.getElementById('data_container');
    if (!container) return null;
    const blocks = container.querySelectorAll('.data_block');
    if (!blocks.length) return null;
    const last = blocks[blocks.length - 1];
    const edit = last.querySelector('.data_edit');
    if (!edit) return null;
    return {
      isAssistant: edit.classList.contains('assistant'),
      text: (edit.innerText || edit.textContent || '').replace(/\s+$/, ''),
    };
  }

  function lastChar(text) {
    const chars = Array.from(text);
    return chars.length ? chars[chars.length - 1] : '';
  }

  /* ---------- 生成完了時の判定 ---------- */
  function onFinished() {
    const info = getLastBlockInfo();
    if (!info || !info.isAssistant || !info.text) { autoCount = 0; return; }

    const c = lastChar(info.text);
    if (END_CHARS.includes(c)) { autoCount = 0; return; }

    if (autoCount >= MAX_AUTO) {
      console.log('[途中切れ自動続行] 上限に達したので止めたよ');
      autoCount = 0;
      return;
    }

    // 指示入力欄に何か書いてあるときは、それが送られてしまうので押さない
    const field = document.getElementById('chat_field');
    if (field && field.value.trim() !== '') { autoCount = 0; return; }

    setTimeout(() => {
      if (isGenerating()) return;
      const btn = document.querySelector(CONTINUE_SELECTOR);
      if (!btn) return;
      autoCount++;
      console.log('[途中切れ自動続行] 最後の文字「' + c + '」なので続けるよ（' + autoCount + '回目）');
      btn.click();
    }, DELAY);
  }

  /* ---------- 見張り ---------- */
  setInterval(() => {
    const now = isGenerating();
    if (now && !wasGenerating) {
      wasGenerating = true;
    } else if (!now && wasGenerating) {
      wasGenerating = false;
      onFinished();
    }
  }, CHECK_INTERVAL);
})();
