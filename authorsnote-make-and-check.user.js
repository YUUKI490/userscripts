// ==UserScript==
// @name         AIのべりすと 脚注作成＋校正
// @namespace    https://ai-novel.com/
// @version      1.1.0
// @description  脚注まとめ係のプチボットで脚注を作り、脚注チェック係で校正して、確認画面で選んだ修正を反映してから脚注欄に貼り付けます
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定 =====
  // プチボットの名称に含まれる文字で探します
  const AN_BOT_NAME = 'オーサーズノートを作る';
  const CHECK_BOT_NAME = '脚注チェック';
  // 脚注チェック係のプロンプトに書いておく目印（ここに脚注が差し込まれます）
  const PLACEHOLDER = '（ここに脚注を貼り付ける）';
  // 出力を待つ最大時間（ミリ秒）
  const WAIT_TIMEOUT = 180000;
  // 出力がこの時間変化しなければ完了とみなす（ミリ秒）
  const STABLE_MS = 4000;
  // ================

  const BTN_ID = 'anmc-btn';
  const MSG_ID = 'anmc-msg';
  const MODAL_ID = 'anmc-modal';
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

  function checkOutputTarget(i) {
    const sel = document.getElementById('petitbot_output' + i);
    return sel && sel.value === 'output_petitbot';
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

    // 出力が始まるまで待つ
    const start = Date.now();
    while (true) {
      await sleep(500);
      const changed = (info && info.textContent !== beforeInfo) || out.value !== beforeVal;
      if (changed) break;
      if (Date.now() - start > WAIT_TIMEOUT) throw new Error('プチボットの出力が返ってきませんでした');
    }

    // 出力が止まるまで待つ
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

  function parseFixes(text) {
    const fixes = [];
    if (!text || text.trim() === 'なし') return fixes;
    text.split('\n').forEach((line) => {
      const m = line.trim().match(/^誤[：:]\s*(.*?)\s*[｜|]\s*正[：:]?\s*(.*)$/);
      if (m && m[1]) fixes.push({ wrong: m[1], right: m[2] });
    });
    return fixes;
  }

  // 読点（、）を無視して探し、元の文字列での範囲を返す
  function findIgnoringComma(haystack, needle) {
    const strip = (s) => {
      let out = '';
      const map = [];
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '、') continue;
        out += s[i];
        map.push(i);
      }
      return { out, map };
    };
    const h = strip(haystack);
    const n = strip(needle).out;
    if (!n) return null;
    const idx = h.out.indexOf(n);
    if (idx < 0) return null;
    return { start: h.map[idx], end: h.map[idx + n.length - 1] + 1 };
  }

  function applyFixes(text, fixes) {
    let result = text;
    fixes.forEach((f) => {
      const pos = findIgnoringComma(result, f.wrong);
      if (pos) result = result.slice(0, pos.start) + f.right + result.slice(pos.end);
    });
    return result;
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

  function el(tag, style, text) {
    const e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (text != null) e.textContent = text;
    return e;
  }

  function showConfirm(draft, fixes) {
    return new Promise((resolve) => {
      const old = document.getElementById(MODAL_ID);
      if (old) old.remove();

      const overlay = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;');
      overlay.id = MODAL_ID;
      const box = el('div', 'background:#fff;color:#000;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;border-radius:10px;padding:16px;font-size:15px;line-height:1.6;');
      overlay.appendChild(box);

      box.appendChild(el('div', 'font-weight:bold;font-size:17px;margin-bottom:8px;', '脚注の校正結果'));

      const items = fixes.map((f) => ({ fix: f, found: !!findIgnoringComma(draft, f.wrong), cb: null }));

      if (items.length === 0) {
        box.appendChild(el('div', 'margin-bottom:12px;', '修正点はありませんでした。'));
      } else {
        box.appendChild(el('div', 'margin-bottom:8px;color:#555;', '反映する修正にチェックを入れてください。'));
        items.forEach((it) => {
          const row = el('label', 'display:block;border:1px solid #ddd;border-radius:8px;padding:8px;margin-bottom:8px;' + (it.found ? '' : 'opacity:0.5;'));
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = it.found;
          cb.disabled = !it.found;
          cb.style.marginRight = '6px';
          it.cb = cb;
          row.appendChild(cb);
          row.appendChild(el('span', 'font-size:13px;color:#777;', it.found ? '' : '（脚注の中に見つからないため反映できません）'));
          row.appendChild(el('div', 'color:#cc0000;', '誤：' + it.fix.wrong));
          row.appendChild(el('div', 'color:#2d8a34;', '正：' + (it.fix.right || '（削除）')));
          box.appendChild(row);
        });
      }

      const btns = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;');
      const cancel = el('button', 'padding:8px 14px;border-radius:6px;border:1px solid #999;background:#eee;color:#000;', 'キャンセル');
      const ok = el('button', 'padding:8px 14px;border-radius:6px;border:1px solid #000;background:#cd2b5a;color:#fff;', '反映して脚注に貼る');
      cancel.type = 'button';
      ok.type = 'button';
      btns.appendChild(cancel);
      btns.appendChild(ok);
      box.appendChild(btns);

      cancel.addEventListener('click', () => { overlay.remove(); resolve(null); });
      ok.addEventListener('click', () => {
        const chosen = items.filter((it) => it.cb && it.cb.checked).map((it) => it.fix);
        overlay.remove();
        resolve(chosen);
      });

      document.body.appendChild(overlay);
    });
  }

  async function main() {
    if (running) return;
    running = true;
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.disabled = true;

    let checkIdx = -1;
    let originalPrompt = null;

    try {
      const anIdx = findBot(AN_BOT_NAME);
      checkIdx = findBot(CHECK_BOT_NAME);
      if (anIdx < 0) throw new Error('「' + AN_BOT_NAME + '」のプチボットが見つかりません');
      if (checkIdx < 0) throw new Error('「' + CHECK_BOT_NAME + '」のプチボットが見つかりません');
      if (!checkOutputTarget(anIdx) || !checkOutputTarget(checkIdx)) {
        throw new Error('2つのプチボットの出力先を「プチボット専用欄」にしてください');
      }
      const promptEl = document.getElementById('petitbot_prompt' + checkIdx);
      if (!promptEl || !ensureTemplate(promptEl, getBotName(checkIdx), [PLACEHOLDER])) {
        throw new Error('脚注チェック係のプロンプトに「' + PLACEHOLDER + '」がありません');
      }

      setStatus('脚注を作成中…');
      const draft = await runBot(anIdx);
      if (!draft) throw new Error('脚注の作成結果が空でした');

      setStatus('脚注を校正中…');
      originalPrompt = promptEl.value;
      promptEl.value = originalPrompt.replace(PLACEHOLDER, draft);
      fireInput(promptEl);
      let checkResult;
      try {
        checkResult = await runBot(checkIdx);
      } finally {
        promptEl.value = originalPrompt;
        fireInput(promptEl);
        persistPetitbots();
        originalPrompt = null;
      }

      setStatus('確認画面を表示中…');
      const fixes = parseFixes(checkResult);
      const chosen = await showConfirm(draft, fixes);
      if (chosen === null) {
        setStatus('キャンセルしました（脚注は変更していません）', '#777');
        return;
      }
      pasteToAuthorsNote(applyFixes(draft, chosen));
      setStatus('脚注に貼り付けました（修正' + chosen.length + '件）', '#2d8a34');
    } catch (e) {
      setStatus(e.message || String(e), '#cc0000');
    } finally {
      if (originalPrompt !== null && checkIdx >= 0) {
        const promptEl = document.getElementById('petitbot_prompt' + checkIdx);
        if (promptEl) { promptEl.value = originalPrompt; fireInput(promptEl); persistPetitbots(); }
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
    btn.textContent = '脚注を作成して校正する';
    btn.style.marginTop = '8px';
    btn.addEventListener('click', main);

    const msg = document.createElement('div');
    msg.id = MSG_ID;
    msg.style.fontSize = '14px';
    msg.style.marginTop = '4px';

    const anchor = document.getElementById('pb2an-msg') ||
      document.getElementById('petitbot_output_apply_feedback') || applyBtn;
    anchor.insertAdjacentElement('afterend', btn);
    btn.insertAdjacentElement('afterend', msg);
  }

  addButton();
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
})();
