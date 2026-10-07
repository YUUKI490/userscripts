// ==UserScript==
// @name         AIのべりすと 本文のみ表示
// @namespace    https://ai-novel.com/
// @version      1.2.0
// @description  切り替えボタンで、ヘッダー・サイドメニュー・入力欄などを隠して本文の欄だけを表示します。本文のみ表示のときは「最後のブロックで脚注を更新する」ボタンも出します
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
  const STYLE_ID = 'nvbo-style';

  // 「最後のブロックで脚注を更新」スクリプトのボタンとメッセージ
  const TARGET_BTN_ID = 'anul-btn';
  const TARGET_MSG_ID = 'anul-msg';

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
      '#' + BTN_ID + ', #' + UC_BTN_ID + ' {' +
      ' position: fixed; left: 8px; z-index: 99998;' +
      ' width: 40px; height: 40px; border-radius: 50%;' +
      ' border: 1px solid #999; background: rgba(255,255,255,0.85); color: #000;' +
      ' font-size: 20px; line-height: 38px; text-align: center; padding: 0;' +
      ' box-shadow: 0 1px 4px rgba(0,0,0,0.3); opacity: 0.7; }\n' +
      '#' + BTN_ID + ' { bottom: 8px; }\n' +
      '#' + UC_BTN_ID + ' { bottom: 56px; display: none; }\n' +
      'html.' + ON_CLASS + ' #' + UC_BTN_ID + ' { display: block; }\n' +
      '#' + UC_MSG_ID + ' {' +
      ' position: fixed; left: 56px; bottom: 62px; z-index: 99998; display: none;' +
      ' max-width: 70vw; padding: 4px 8px; border-radius: 6px;' +
      ' background: rgba(255,255,255,0.9); font-size: 13px; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }\n' +
      'html.' + ON_CLASS + ' #' + UC_MSG_ID + '.has-text { display: block; }\n' +
      'html.' + ON_CLASS + ' #' + BTN_ID + ' { background: rgba(205,43,90,0.85); color: #fff; }';
    document.head.appendChild(style);
  }

  function toggle() {
    const root = document.documentElement;
    root.classList.toggle(ON_CLASS);
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.title = root.classList.contains(ON_CLASS) ? '元の表示に戻す' : '本文のみ表示';
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
    syncMessage();
  }

  addStyle();
  addButtons();
  new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
