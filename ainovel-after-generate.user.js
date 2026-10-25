// ==UserScript==
// @name         AIのべりすと 生成後の自動処理
// @namespace    yuuki490-ainovel
// @version      1.6
// @description  生成完了時、途中で切れていれば「続ける」を押す（最初の生成も含めて設定した回数まで。それでも切れていれば最後の行を消す）。画面の仮ボタン（連）でON/OFFと回数を変えられる（保存される）。脚注まとめ係の実行は「脚注まとめ」（ainovel-footnote.user.js）のボタンに分離した
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 設定 ===================== */
  // この文字で終わっていれば「ちゃんと終わった」とみなす
  const END_CHARS = '。．.，,！？!?‼⁉」』）)】〕〉》］]｝}"”’\'―〜~♪♡❤★☆';
  // 生成の回数の上限（最初の生成も含む）の初期値。この回数まで途中切れなら「続ける」を押す。仮ボタン（連）で変えられる
  const DEFAULT_MAX_GENERATIONS = 2;
  const GEN_MIN = 1, GEN_MAX = 10;
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
  const OPEN_BTN_ID = 'ainovel-after-generate-btn';
  const BOX_ID = 'ainovel-after-generate-box';
  const KEY_SETTING = 'ainovel_after_generate_setting'; // { enabled, max }

  /* ===================== 状態 ===================== */
  let wasGenerating = false;
  let autoCount = 0;
  let settling = false;        // 生成完了後、本文が落ち着くのを待っている
  let setting = loadSetting();

  function loadSetting() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(KEY_SETTING) || '{}') || {}; } catch (_) {}
    const m = Number(v.max);
    return {
      enabled: v.enabled !== false,
      max: Number.isFinite(m) ? Math.min(GEN_MAX, Math.max(GEN_MIN, Math.round(m))) : DEFAULT_MAX_GENERATIONS,
    };
  }
  function saveSetting() { try { localStorage.setItem(KEY_SETTING, JSON.stringify(setting)); } catch (_) {} }

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

    // OFFのときは何もしない
    if (!setting.enabled) { autoCount = 0; return; }

    // 途中で切れている → もう一度「続ける」（最初の生成も含めて setting.max 回まで）
    if (!complete && autoCount + 1 < setting.max && !fieldHasText) {
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
    if (!complete && autoCount + 1 >= setting.max) {
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

  /* ===================== 仮ボタン（連）と設定パネル ===================== */
  const style = document.createElement('style');
  style.textContent = `
    #${OPEN_BTN_ID} { position:fixed; left:8px; bottom:420px; z-index:99980; width:48px; height:48px; border-radius:50%; border:1px solid #000; background:#1d5c8a; color:#fff; font-size:20px; font-family:serif; line-height:1; padding:0; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.4); opacity:.85; }
    #${OPEN_BTN_ID}.aag-off { background:#777; opacity:.6; }
    #${OPEN_BTN_ID} .aag-num { position:absolute; right:-4px; top:-4px; min-width:18px; height:18px; border-radius:9px; background:#fff; color:#1d5c8a; font-size:12px; font-family:sans-serif; font-weight:700; line-height:18px; text-align:center; padding:0 3px; box-sizing:border-box; }
    #${BOX_ID} { display:none; position:fixed; left:64px; bottom:412px; z-index:99981; background:#fff; color:#222; border:1px solid #ccc; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.25); padding:10px 12px; font-family:sans-serif; font-size:14px; }
    #${BOX_ID}.aag-open { display:block; }
    #${BOX_ID} .aag-row { display:flex; align-items:center; gap:8px; margin:4px 0; }
    #${BOX_ID} .aag-name { width:5em; font-weight:700; }
    #${BOX_ID} .aag-val { min-width:3.5em; text-align:center; }
    #${BOX_ID} button { height:36px; border:1px solid #888; border-radius:8px; background:#f2f2f2; color:#222; font-size:16px; cursor:pointer; padding:0 10px; }
    #${BOX_ID} button[data-k="num"] { width:40px; font-size:18px; padding:0; }
    #${BOX_ID} button.aag-on { background:#1d5c8a; color:#fff; border-color:#1d5c8a; }
  `;
  document.head.appendChild(style);

  function applySetting() {
    const btn = document.getElementById(OPEN_BTN_ID);
    const box = document.getElementById(BOX_ID);
    if (btn) {
      btn.classList.toggle('aag-off', !setting.enabled);
      btn.querySelector('.aag-num').textContent = String(setting.max);
      btn.title = '生成後の自動続行：' + (setting.enabled ? 'ON（' + setting.max + '回まで）' : 'OFF');
    }
    if (box) {
      const sw = box.querySelector('[data-k="sw"]');
      sw.textContent = setting.enabled ? 'ON' : 'OFF';
      sw.classList.toggle('aag-on', setting.enabled);
      box.querySelector('.aag-val').textContent = setting.max + '回';
    }
  }

  function ensureButton() {
    if (!document.getElementById('data_container') || document.getElementById(OPEN_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = OPEN_BTN_ID;
    btn.innerHTML = '連<span class="aag-num"></span>';
    const box = document.createElement('div');
    box.id = BOX_ID;
    box.innerHTML = `
      <div class="aag-row"><span class="aag-name">自動続行</span><button type="button" data-k="sw"></button></div>
      <div class="aag-row"><span class="aag-name">回数</span><button type="button" data-k="num" data-d="-1">−</button><span class="aag-val"></span><button type="button" data-k="num" data-d="1">＋</button></div>`;
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.toggle('aag-open'); });
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      if (b.dataset.k === 'sw') setting.enabled = !setting.enabled;
      else setting.max = Math.min(GEN_MAX, Math.max(GEN_MIN, setting.max + Number(b.dataset.d)));
      saveSetting();
      applySetting();
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target) && !btn.contains(e.target)) box.classList.remove('aag-open'); });
    document.body.appendChild(btn);
    document.body.appendChild(box);
    applySetting();
  }

  setInterval(ensureButton, 1500);
  ensureButton();

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
