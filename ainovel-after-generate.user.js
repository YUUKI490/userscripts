// ==UserScript==
// @name         AIのべりすと 生成後の自動処理
// @namespace    yuuki490-ainovel
// @version      1.0
// @description  生成完了時、途中で切れていれば「続ける」を押す。ちゃんと終わっていれば脚注まとめ係のプチボットを動かし、脚注の差し替えと洗脳状態の保存を行う
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 設定 ===================== */
  // この文字で終わっていれば「ちゃんと終わった」とみなす
  const END_CHARS = '。．.，,！？!?‼⁉」』）)】〕〉》］]｝}"”’\'―〜~♪♡❤★☆';
  // 途中切れで続けて自動で押す回数の上限
  const MAX_AUTO = 3;
  // 生成完了から「続ける」を押すまでの待ち時間（ミリ秒）
  const DELAY = 800;
  // 生成中かどうかを確認する間隔（ミリ秒）
  const CHECK_INTERVAL = 300;
  // 自動で動かすプチボットの名前（この文字が名前に入っているプチボットを使う）
  const BOT_NAME = '脚注まとめ係';
  // プチボットの出力を待つ最大時間（ミリ秒）
  const BOT_TIMEOUT = 180000;
  // 脚注の最大文字数
  const AN_MAX = 6000;

  const CONTINUE_SELECTOR = '#getcontinuation_chat';
  const LOADING_ID = 'loading_anim';
  const KEY_BRAINWASH = 'ainovel_brainwash_states';      // QuickPasteが読む共通の一覧
  const KEY_BRAINWASH_WORK = 'ainovel_brainwash_states:'; // 作品ごとの一覧（後ろに作品名）
  const KEY_AN_BACKUP = 'ainovel_an_backup:';             // 反映前の脚注の控え（後ろに作品名）
  const UNDO_ID = 'aag_undo_btn';
  const TOAST_ID = 'aag_toast';

  /* ===================== 状態 ===================== */
  let wasGenerating = false;
  let autoCount = 0;
  let busy = false;            // プチボット処理中
  let ignoreUntilIdle = false; // プチボット処理直後、くるくるが消えるまで生成完了を無視する

  /* ===================== 小物 ===================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function lsGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (_) {} }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (_) {} }

  function workName() {
    const el = document.getElementById('data_title');
    const t = el ? (el.innerText || el.textContent || '').trim() : '';
    return t || '【無題】';
  }

  function normalizeName(s) { return String(s || '').replace(/[\s　・]/g, ''); }

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

  function lastChar(text) {
    const chars = Array.from(text);
    return chars.length ? chars[chars.length - 1] : '';
  }

  function onFinished() {
    const info = getLastBlockInfo();
    if (!info || !info.isAssistant || !info.text) { autoCount = 0; return; }

    const c = lastChar(info.text);
    const complete = END_CHARS.includes(c);
    const field = document.getElementById('chat_field');
    const fieldHasText = field && field.value.trim() !== '';

    // 途中で切れている → もう一度「続ける」
    if (!complete && autoCount < MAX_AUTO && !fieldHasText) {
      setTimeout(() => {
        if (isGenerating() || busy) return;
        const btn = document.querySelector(CONTINUE_SELECTOR);
        if (!btn) return;
        autoCount++;
        console.log('[生成後の自動処理] 最後の文字「' + c + '」なので続けるよ（' + autoCount + '回目）');
        btn.click();
      }, DELAY);
      return;
    }

    // ちゃんと終わった（または続けるのをあきらめた）→ 脚注まとめ係
    autoCount = 0;
    setTimeout(() => { runFootnote(); }, 1500);
  }

  /* ===================== プチボット ===================== */
  function getBotName(i) {
    const input = document.getElementById('petitbot_name' + i);
    const disp = document.getElementById('petitbot_name_display' + i);
    return ((input && input.value) || (disp && disp.textContent) || '').trim();
  }

  function findBot() {
    for (let i = 0; i < 100; i++) {
      if (!document.getElementById('petitbotarea' + i)) continue;
      if (getBotName(i).includes(BOT_NAME)) return i;
    }
    return -1;
  }

  async function runBot(i) {
    const out = document.getElementById('petitbot_output_assistant');
    const info = document.getElementById('petitbot_output_info');
    if (!out) throw new Error('プチボットの出力欄が見つからないよ');
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
    execBtn.click();

    const start = Date.now();
    while (true) {
      await sleep(500);
      if ((info && info.textContent !== beforeInfo) || out.value !== beforeVal) break;
      if (Date.now() - start > BOT_TIMEOUT) throw new Error('プチボットの出力が返ってこなかったよ');
    }

    let last = out.value;
    let lastChange = Date.now();
    while (true) {
      await sleep(500);
      if (out.value !== last) {
        last = out.value;
        lastChange = Date.now();
      } else if (info && !info.textContent.includes('生成中') && Date.now() - lastChange >= 1500) {
        break;
      } else if (!info && last.trim() && Date.now() - lastChange >= 3000) {
        break;
      }
      if (Date.now() - start > BOT_TIMEOUT) throw new Error('プチボットの出力が終わらなかったよ');
    }
    return out.value.trim();
  }

  /* ===================== 出力の読み取り ===================== */
  const SEP_RE = /^\s*[-－]{3,}\s*$/;

  function splitOutput(text) {
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex((l) => SEP_RE.test(l));
    if (idx < 0) return { upper: text, lower: '' };
    return { upper: lines.slice(0, idx).join('\n'), lower: lines.slice(idx + 1).join('\n') };
  }

  // [〜] の段落を種類つきで取り出す。段落以外の文字もそのまま残す
  function tokenize(text) {
    const tokens = [];
    const re = /\[[^\[\]]*\]/g;
    let pos = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > pos) tokens.push({ type: 'text', text: text.slice(pos, m.index) });
      tokens.push(classify(m[0]));
      pos = m.index + m[0].length;
    }
    if (pos < text.length) tokens.push({ type: 'text', text: text.slice(pos) });
    return tokens;
  }

  function classify(block) {
    if (/^\[場面：/.test(block)) return { type: 'scene', text: block };
    // 人物は全角の「：」のみ（[ジャンル:〜] のような半角のタグは触らない）
    const m = block.match(/^\[([^\[\]：:\n]{1,30})：/);
    if (m) return { type: 'person', name: m[1].trim(), key: normalizeName(m[1]), text: block };
    return { type: 'other', text: block };
  }

  function parseNew(upper) {
    let scene = null;
    const persons = [];
    tokenize(upper).forEach((t) => {
      if (t.type === 'scene' && !scene) scene = t.text;
      if (t.type === 'person') persons.push(t);
    });
    return { scene, persons };
  }

  function parseStates(lower) {
    const list = [];
    lower.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      const i = line.indexOf('=');
      if (i < 1) return;
      const name = line.slice(0, i).trim();
      const state = line.slice(i + 1).trim();
      if (name && state) list.push({ name, state });
    });
    return list;
  }

  /* ===================== 脚注の差し替え ===================== */
  function mergeAuthorsNote(current, fresh) {
    const tokens = tokenize(current);
    const newMap = new Map();
    fresh.persons.forEach((p) => newMap.set(p.key, p));
    const used = new Set();
    let sceneDone = false;
    const out = [];
    const stat = { replaced: 0, added: 0 };

    tokens.forEach((t) => {
      if (t.type === 'scene') {
        if (!fresh.scene) { out.push(t); return; }
        if (sceneDone) return; // 古い場面が2つ以上あれば1つにまとめる
        out.push({ type: 'scene', text: fresh.scene });
        sceneDone = true;
        return;
      }
      if (t.type === 'person' && newMap.has(t.key)) {
        if (used.has(t.key)) return; // 同じ人の古い段落が重なっていたら消す
        out.push({ type: 'person', key: t.key, text: newMap.get(t.key).text });
        used.add(t.key);
        stat.replaced++;
        return;
      }
      out.push(t);
    });

    // 場面がまだなければ、最初の人物段落の前（人物もいなければ最後）に入れる
    if (fresh.scene && !sceneDone) {
      const at = out.findIndex((t) => t.type === 'person');
      const tok = { type: 'scene', text: fresh.scene };
      if (at < 0) out.push(tok); else out.splice(at, 0, tok);
    }

    // 新しく増えた人は、最後の人物段落のすぐ後ろ（いなければ場面の後ろ、それもなければ最後）
    const added = fresh.persons.filter((p) => !used.has(p.key));
    if (added.length) {
      let at = -1;
      out.forEach((t, i) => { if (t.type === 'person') at = i; });
      if (at < 0) out.forEach((t, i) => { if (t.type === 'scene') at = i; });
      const toks = added.map((p) => ({ type: 'person', key: p.key, text: p.text }));
      if (at < 0) out.push(...toks); else out.splice(at + 1, 0, ...toks);
      stat.added = added.length;
    }

    // 元からある部分の改行はそのまま。新しく入れた段落の前だけ1行空ける
    let result = '';
    let prevBlock = false;
    out.forEach((t) => {
      if (t.type === 'text') { result += t.text; prevBlock = false; return; }
      if (prevBlock) result += '\n\n';
      result += t.text;
      prevBlock = true;
    });
    result = result.replace(/\n{3,}/g, '\n\n').trim();
    return { text: result, stat };
  }

  function writeAuthorsNote(text) {
    const an = document.getElementById('authorsnote');
    if (!an) throw new Error('脚注欄が見つからないよ');
    an.value = text;
    fireInput(an);
    if (typeof window.CopyContent === 'function') {
      try { window.CopyContent(); } catch (_) {}
    }
  }

  /* ===================== 洗脳状態の保存 ===================== */
  function mergeStates(raw, list) {
    const lines = (raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l) => {
      const i = l.indexOf('=');
      return i < 1 ? { raw: l } : { name: l.slice(0, i).trim(), state: l.slice(i + 1).trim() };
    });
    list.forEach((s) => {
      const key = normalizeName(s.name);
      const hit = rows.find((r) => r.name && normalizeName(r.name) === key);
      if (hit) hit.state = s.state; else rows.push({ name: s.name, state: s.state });
    });
    return rows.map((r) => (r.name ? r.name + '=' + r.state : r.raw)).join('\n');
  }

  function saveStates(list) {
    if (!list.length) return;
    const key = KEY_BRAINWASH_WORK + workName();
    const merged = mergeStates(lsGet(key), list);
    lsSet(key, merged);
    lsSet(KEY_BRAINWASH, merged); // QuickPaste用
  }

  // 作品を切り替えたら、その作品の一覧を共通の一覧へ写す
  let lastWork = null;
  function syncWork() {
    const w = workName();
    if (w === lastWork) return;
    lastWork = w;
    const saved = lsGet(KEY_BRAINWASH_WORK + w);
    if (saved !== null) lsSet(KEY_BRAINWASH, saved);
    updateUndoButton();
  }

  /* ===================== 脚注を戻す ===================== */
  function updateUndoButton() {
    const btn = document.getElementById(UNDO_ID);
    if (!btn) return;
    btn.disabled = lsGet(KEY_AN_BACKUP + workName()) === null;
    btn.style.opacity = btn.disabled ? '.4' : '1';
  }

  function ensureUndoButton() {
    if (document.getElementById(UNDO_ID)) return;
    const an = document.getElementById('authorsnote');
    if (!an) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = UNDO_ID;
    btn.textContent = '↩ 脚注を戻す';
    btn.title = '自動で差し替える前の脚注に戻す';
    btn.style.cssText = 'display:block;margin:6px 0;padding:6px 12px;border:1px solid #888;border-radius:8px;background:#f2f2f2;color:#222;font-size:14px;cursor:pointer;';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = KEY_AN_BACKUP + workName();
      const backup = lsGet(key);
      if (backup === null) { toast('戻せる脚注がないよ'); return; }
      try {
        writeAuthorsNote(backup);
        lsDel(key);
        updateUndoButton();
        toast('脚注を差し替え前に戻したよ', 'rgba(45,138,52,.95)');
      } catch (err) {
        toast(err.message || String(err), 'rgba(204,0,0,.95)');
      }
    });
    const anchor = document.getElementById('authorsnote_tokens_disp') || an;
    anchor.insertAdjacentElement('afterend', btn);
    updateUndoButton();
  }

  /* ===================== 全体の流れ ===================== */
  async function runFootnote() {
    if (busy) return;
    const idx = findBot();
    if (idx < 0) return; // この作品に脚注まとめ係がなければ何もしない
    const sel = document.getElementById('petitbot_output' + idx);
    if (!sel || sel.value !== 'output_petitbot') {
      toast('「' + BOT_NAME + '」の出力先を「プチボット専用欄」にしてね', 'rgba(204,0,0,.95)');
      return;
    }
    const an = document.getElementById('authorsnote');
    if (!an) return;

    busy = true;
    toast('脚注まとめ係を実行中…');
    try {
      const result = await runBot(idx);
      if (!result) throw new Error('プチボットの出力が空だったよ');

      const { upper, lower } = splitOutput(result);
      const fresh = parseNew(upper);
      if (!fresh.scene && !fresh.persons.length) throw new Error('脚注にする段落が見つからなかったよ');

      const before = an.value;
      const merged = mergeAuthorsNote(before, fresh);
      lsSet(KEY_AN_BACKUP + workName(), before);
      writeAuthorsNote(merged.text);
      updateUndoButton();

      const states = parseStates(lower);
      saveStates(states);

      let msg = '脚注を更新したよ（差し替え' + merged.stat.replaced + '人・追加' + merged.stat.added + '人';
      if (states.length) msg += '・洗脳状態' + states.length + '人を保存';
      msg += '）';
      if (Array.from(merged.text).length > AN_MAX) {
        toast(msg + '　※脚注が' + AN_MAX + '字を超えてるよ', 'rgba(230,120,0,.95)');
      } else {
        toast(msg, 'rgba(45,138,52,.95)');
      }
    } catch (e) {
      toast(e.message || String(e), 'rgba(204,0,0,.95)');
    } finally {
      busy = false;
      ignoreUntilIdle = true;
    }
  }

  /* ===================== 見張り ===================== */
  setInterval(() => {
    const now = isGenerating();
    if (busy) { wasGenerating = false; return; }
    if (ignoreUntilIdle) {
      if (!now) ignoreUntilIdle = false;
      wasGenerating = false;
      return;
    }
    if (now && !wasGenerating) {
      wasGenerating = true;
    } else if (!now && wasGenerating) {
      wasGenerating = false;
      onFinished();
    }
  }, CHECK_INTERVAL);

  setInterval(() => { syncWork(); ensureUndoButton(); }, 2000);
  syncWork();
  ensureUndoButton();
})();
