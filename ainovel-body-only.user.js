// ==UserScript==
// @name         AIのべりすと 本文のみ表示
// @namespace    https://ai-novel.com/
// @version      1.3.0
// @description  切り替えボタンで、ヘッダー・サイドメニュー・入力欄などを隠して本文の欄だけを表示します。本文のみ表示のときは「最後のブロックで脚注を更新する」ボタンと、指示を打ち込む入力画面のボタンも出します
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ON_CLASS = 'nvbo-on';
  const BTN_ID = 'nvbo-btn';
  const UC_BTN_ID = 'nvbo-uc-btn';
  const UC_MSG_ID = 'nvbo-uc-msg';
  const IN_BTN_ID = 'nvbo-in-btn';
  const IN_PANEL_ID = 'nvbo-in-panel';
  const IN_TEXT_ID = 'nvbo-in-text';
  const STYLE_ID = 'nvbo-style';

  // 「最後のブロックで脚注を更新」スクリプトのボタンとメッセージ
  const TARGET_BTN_ID = 'anul-btn';
  const TARGET_MSG_ID = 'anul-msg';

  // のべりすとの指示入力欄と「続ける」ボタン
  const CHAT_FIELD_ID = 'chat_field';
  const CONTINUE_BTN_ID = 'getcontinuation_chat';

  // 本文のみ表示のときに隠すもの
  const HIDE_SELECTORS = [
    '.main_area > header',
    '.nv4_page_column > footer',
    '.container > aside',
    '.container > .fixed_bottom_right',
    '.container > .gui_modelname',
    '#nv4_readonly_banner',
    '#data_container_title',
    '#data_container_info',
    '#nv4_quota_notice',
    '#nv4-reading-controls'
  ];

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      HIDE_SELECTORS.map((s) => 'html.' + ON_CLASS + ' ' + s).join(',\n') +
      ' { display: none !important; }\n' +
      '#' + BTN_ID + ', #' + UC_BTN_ID + ', #' + IN_BTN_ID + ' {' +
      ' position: fixed; left: 8px; z-index: 99998;' +
      ' width: 40px; height: 40px; border-radius: 50%;' +
      ' border: 1px solid #999; background: rgba(255,255,255,0.85); color: #000;' +
      ' font-size: 20px; line-height: 38px; text-align: center; padding: 0;' +
      ' box-shadow: 0 1px 4px rgba(0,0,0,0.3); opacity: 0.7; }\n' +
      '#' + BTN_ID + ' { bottom: 8px; }\n' +
      '#' + UC_BTN_ID + ' { bottom: 56px; display: none; }\n' +
      '#' + IN_BTN_ID + ' { bottom: 104px; display: none; }\n' +
      'html.' + ON_CLASS + ' #' + UC_BTN_ID + ', html.' + ON_CLASS + ' #' + IN_BTN_ID + ' { display: block; }\n' +
      '#' + UC_MSG_ID + ' {' +
      ' position: fixed; left: 56px; bottom: 62px; z-index: 99998; display: none;' +
      ' max-width: 70vw; padding: 4px 8px; border-radius: 6px;' +
      ' background: rgba(255,255,255,0.9); font-size: 13px; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }\n' +
      'html.' + ON_CLASS + ' #' + UC_MSG_ID + '.has-text { display: block; }\n' +
      'html.' + ON_CLASS + ' #' + BTN_ID + ' { background: rgba(205,43,90,0.85); color: #fff; }\n' +
      '#' + IN_PANEL_ID + ' {' +
      ' position: fixed; left: 0; right: 0; bottom: 0; z-index: 99999; display: none;' +
      ' padding: 10px; background: #fff; color: #000;' +
      ' border-top: 2px solid #cd2b5a; box-shadow: 0 -2px 8px rgba(0,0,0,0.25); }\n' +
      '#' + IN_PANEL_ID + '.is-open { display: block; }\n' +
      '#' + IN_TEXT_ID + ' {' +
      ' width: 100%; box-sizing: border-box; min-height: 6em; font-size: 16px;' +
      ' padding: 8px; border: 1px solid #999; border-radius: 6px; resize: vertical; }\n' +
      '#' + IN_PANEL_ID + ' .nvbo-in-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }\n' +
      '#' + IN_PANEL_ID + ' .nvbo-in-row button {' +
      ' padding: 8px 16px; border-radius: 6px; font-size: 15px; border: 1px solid #999; }\n' +
      '#' + IN_PANEL_ID + ' .nvbo-in-send { background: #cd2b5a; color: #fff; border-color: #000; }\n' +
      '#' + IN_PANEL_ID + ' .nvbo-in-close { background: #eee; color: #000; }';
    document.head.appendChild(style);
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closePanel() {
    const panel = document.getElementById(IN_PANEL_ID);
    if (panel) panel.classList.remove('is-open');
  }

  function toggle() {
    const root = document.documentElement;
    root.classList.toggle(ON_CLASS);
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.title = root.classList.contains(ON_CLASS) ? '元の表示に戻す' : '本文のみ表示';
    if (!root.classList.contains(ON_CLASS)) closePanel();
  }

  function runUpdateAndCheck() {
    const target = document.getElementById(TARGET_BTN_ID);
    const msg = document.getElementById(UC_MSG_ID);
    if (!target) {
      if (msg) {
        msg.textContent = '「最後のブロックで脚注を更新」のスクリプトが見つかりません';
        msg.style.color = '#cc0000';
        msg.classList.add('has-text');
      }
      return;
    }
    if (target.disabled) return;
    target.click();
  }

  // 元のスクリプトのメッセージを、本文のみ表示のときも見えるように写す
  function syncMessage() {
    const src = document.getElementById(TARGET_MSG_ID);
    const msg = document.getElementById(UC_MSG_ID);
    if (!src || !msg) return;
    const text = src.textContent.trim();
    if (msg.textContent !== text) {
      msg.textContent = text;
      msg.style.color = src.style.color || '#444';
    }
    msg.classList.toggle('has-text', !!text);
  }

  // 指示を打ち込む画面を開く／閉じる（中身はのべりすとの入力欄と同じものにする）
  function togglePanel() {
    const panel = document.getElementById(IN_PANEL_ID);
    const text = document.getElementById(IN_TEXT_ID);
    const field = document.getElementById(CHAT_FIELD_ID);
    if (!panel || !text) return;
    if (panel.classList.contains('is-open')) {
      closePanel();
      return;
    }
    text.value = field ? field.value : '';
    panel.classList.add('is-open');
    text.focus();
  }

  function onPanelInput() {
    const text = document.getElementById(IN_TEXT_ID);
    const field = document.getElementById(CHAT_FIELD_ID);
    if (!text || !field) return;
    field.value = text.value;
    fireInput(field);
  }

  function sendContinue() {
    const text = document.getElementById(IN_TEXT_ID);
    const field = document.getElementById(CHAT_FIELD_ID);
    const cont = document.getElementById(CONTINUE_BTN_ID);
    if (!field || !cont) {
      alert('のべりすとの入力欄か「続ける」ボタンが見つかりません');
      return;
    }
    field.value = text ? text.value : field.value;
    fireInput(field);
    closePanel();
    cont.click();
  }

  function addPanel() {
    if (document.getElementById(IN_PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = IN_PANEL_ID;

    const text = document.createElement('textarea');
    text.id = IN_TEXT_ID;
    text.placeholder = '指示したい内容を入力';
    text.addEventListener('input', onPanelInput);
    panel.appendChild(text);

    const row = document.createElement('div');
    row.className = 'nvbo-in-row';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'nvbo-in-close';
    close.textContent = '閉じる';
    close.addEventListener('click', closePanel);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'nvbo-in-send';
    send.textContent = '続ける';
    send.addEventListener('click', sendContinue);

    row.appendChild(close);
    row.appendChild(send);
    panel.appendChild(row);
    document.body.appendChild(panel);
  }

  function addButtons() {
    if (!document.getElementById('data_container')) return;
    if (!document.getElementById(BTN_ID)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.textContent = '📖';
      btn.title = '本文のみ表示';
      btn.addEventListener('click', toggle);
      document.body.appendChild(btn);
    }
    if (!document.getElementById(UC_BTN_ID)) {
      const ub = document.createElement('button');
      ub.type = 'button';
      ub.id = UC_BTN_ID;
      ub.textContent = '🔄';
      ub.title = '最後のブロックで脚注を更新する';
      ub.addEventListener('click', runUpdateAndCheck);
      document.body.appendChild(ub);

      const msg = document.createElement('div');
      msg.id = UC_MSG_ID;
      document.body.appendChild(msg);
    }
    if (!document.getElementById(IN_BTN_ID)) {
      const ib = document.createElement('button');
      ib.type = 'button';
      ib.id = IN_BTN_ID;
      ib.textContent = '✏️';
      ib.title = '指示を打ち込む';
      ib.addEventListener('click', togglePanel);
      document.body.appendChild(ib);
    }
    addPanel();
    syncMessage();
  }

  addStyle();
  addButtons();
  new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
