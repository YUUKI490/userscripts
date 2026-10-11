// ==UserScript==
// @name         AIのべりすと 生成後の自動処理
// @namespace    yuuki490-ainovel
// @version      1.5
// @description  生成完了時、途中で切れていれば「続ける」を押す（最初の生成も含めて2回まで。それでも切れていれば最後の行を消す）。脚注まとめ係の実行は「脚注まとめ」（ainovel-footnote.user.js）のボタンに分離した
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 設定 ===================== */
  // この文字で終わっていれば「ちゃんと終わった」とみなす
  const END_CHARS = '。．.，,！？!?‼⁉」』）)】〕〉》］]｝}"”’\'―〜~♪♡❤★☆';
  // 生成の回数の上限（最初の生成も含む）。この回数まで途中切れなら「続ける」を押す
  const MAX_GENERATIONS = 2;
  // 生成完了から「続ける」を押すまでの待ち時間（ミリ秒）
  const DELAY = 800;
  // 生成中かどうかを確認する間隔（ミリ秒）
  const CHECK_INTERVAL = 300;
  // 生成完了後、本文の最後のブロックが落ち着くまで待つ時間（ミリ秒）
  const SETTLE_MS = 1200;
  const SETTLE_TIMEOUT = 10000;

  const CONTINUE_SELECTOR = '#getcontinuation_chat';
  const LOADING_ID = 'loading_anim';
  const TOAST_ID = 'aag_toast';
  // 脚注まとめ（ainovel-footnote.user.js）がプチボットを動かしている間は、その生成完了を無視する
  const FOOTNOTE_BUSY_ATTR = 'data-ainovel-footnote-busy';

  /* ===================== 状態 ===================== */
  let wasGenerating = false;
  let autoCount = 0;
  let settling = false;        // 生成完了後、本文が落ち着くのを待っている

  /* ===================== 小物 ===================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(msg, color) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:99995;max-width:90vw;padding:8px 14px;border-radius:10px;color:#fff;font-size:14px;font-family:sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4);pointer-events:none;transition:opacity .3s;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = color || 'rgba(40,40,40,.92)';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 4000);
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const footnoteBusy = () => document.body.hasAttribute(FOOTNOTE_BUSY_ATTR);

  /* ===================== 本文の生成 ===================== */
  function isGenerating() {
    const el = document.getElementById(LOADING_ID);
    if (!el) return false;
    const css = window.getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  }

  function getLastBlockInfo() {
    const container = document.getElementById('data_container');
    if (!container) return null;
    const blocks = container.querySelectorAll('.data_block');
    if (!blocks.length) return null;
    const edit = blocks[blocks.length - 1].querySelector('.data_edit');
    if (!edit) return null;
    return {
      isAssistant: edit.classList.contains('assistant'),
      text: (edit.innerText || edit.textContent || '').replace(/\s+$/, ''),
    };
  }

  // 「」『』（）が閉じていなければ、セリフの途中で切れているとみなす
  const BRACKETS = [['「', '」'], ['『', '』'], ['（', '）'], ['(', ')']];
  function hasOpenBracket(text) {
    return BRACKETS.some(([open, close]) => text.lastIndexOf(open) > text.lastIndexOf(close));
  }

  function lastChar(text) {
    const chars = Array.from(text);
    return chars.length ? chars[chars.length - 1] : '';
  }

  // 生成が終わった直後は、AIのブロックがまだ本文に入っていないことがあるので、
  // 最後のブロックがAIのブロックになり、中身の変化が止まるまで待つ
  async function waitSettled() {
    const start = Date.now();
    let prev = null;
    let stableSince = Date.now();
    let info = null;
    while (Date.now() - start < SETTLE_TIMEOUT) {
      await sleep(300);
      if (isGenerating()) return null; // 次の生成が始まった
      info = getLastBlockInfo();
      const sig = info ? (info.isAssistant ? 'A' : 'X') + info.text : '';
      if (sig !== prev) {
        prev = sig;
        stableSince = Date.now();
      } else if (info && info.isAssistant && info.text && Date.now() - stableSince >= SETTLE_MS) {
        return info;
      }
    }
    console.log('[生成後の自動処理] 本文の最後がAIのブロックにならなかったので何もしないよ');
    return null;
  }

  async function onFinished() {
    if (settling) return;
    settling = true;
    let info;
    try { info = await waitSettled(); } finally { settling = false; }
    if (!info) { autoCount = 0; return; }

    const c = lastChar(info.text);
    const complete = END_CHARS.includes(c) && !hasOpenBracket(info.text);
    const field = document.getElementById('chat_field');
    const fieldHasText = field && field.value.trim() !== '';

    // 途中で切れている → もう一度「続ける」（最初の生成も含めて MAX_GENERATIONS 回まで）
    if (!complete && autoCount + 1 < MAX_GENERATIONS && !fieldHasText) {
      setTimeout(() => {
        if (isGenerating() || footnoteBusy()) return;
        const btn = document.querySelector(CONTINUE_SELECTOR);
        if (!btn) return;
        autoCount++;
        console.log('[生成後の自動処理] 最後の文字「' + c + '」なので続けるよ（' + (autoCount + 1) + '回目の生成）');
        btn.click();
      }, DELAY);
      return;
    }

    // 上限まで生成しても途中で切れていたら、最後の行を消す
    if (!complete && autoCount + 1 >= MAX_GENERATIONS) {
      const removed = deleteLastLine();
      if (removed) {
        const shown = Array.from(removed).length > 30 ? Array.from(removed).slice(0, 30).join('') + '…' : removed;
        toast('途中で切れていた最後の行を消したよ：' + shown, 'rgba(230,120,0,.95)');
      }
    }

    autoCount = 0;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 本文の最後のAIブロックから、最後の行を消す。消した行を返す（消せなければ空文字）
  function deleteLastLine() {
    const container = document.getElementById('data_container');
    if (!container) return '';
    const blocks = container.querySelectorAll('.data_block');
    if (!blocks.length) return '';
    const block = blocks[blocks.length - 1];
    const edit = block.querySelector('.data_edit');
    if (!edit || !edit.classList.contains('assistant')) return '';

    const raw = edit.getAttribute('data-raw-markdown') ?? (edit.innerText || '');
    const trimmed = raw.replace(/\s+$/, '');
    const idx = trimmed.lastIndexOf('\n');
    if (idx < 0) return ''; // 1行しかないときはブロックが空になるので消さない
    const removed = trimmed.slice(idx + 1).trim();
    const next = trimmed.slice(0, idx).replace(/\s+$/, '');

    edit.setAttribute('data-raw-markdown', next);
    edit.innerHTML = escapeHtml(next).replace(/\n/g, '<br>');
    const cc = block.querySelector('.label_charcount');
    if (cc) cc.textContent = Array.from(next).length + '字';

    const calls = [
      () => fireInput(edit),
      () => window.VisualChange && window.VisualChange(),
      () => window.CopyContent && window.CopyContent(),
      () => window.syncDOMToStorageDebounced && window.syncDOMToStorageDebounced(null),
    ];
    calls.forEach((fn) => { try { fn(); } catch (e) { console.warn('[生成後の自動処理]', e); } });
    return removed;
  }

  /* ===================== 見張り ===================== */
  setInterval(() => {
    const now = isGenerating();
    // 脚注まとめがプチボットを動かしている間の生成は本文の生成ではないので無視する
    if (footnoteBusy()) { wasGenerating = false; return; }
    if (now && !wasGenerating) {
      wasGenerating = true;
    } else if (!now && wasGenerating) {
      wasGenerating = false;
      onFinished();
    }
  }, CHECK_INTERVAL);
})();
