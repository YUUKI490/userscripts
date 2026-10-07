// ==UserScript==
// @name         AIのべりすと 本文のみ表示
// @namespace    https://ai-novel.com/
// @version      1.0.0
// @description  切り替えボタンで、ヘッダー・サイドメニュー・入力欄などを隠して本文の欄だけを表示します
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ON_CLASS = 'nvbo-on';
  const BTN_ID = 'nvbo-btn';
  const STYLE_ID = 'nvbo-style';

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
      '#' + BTN_ID + ' {' +
      ' position: fixed; left: 8px; bottom: 8px; z-index: 99998;' +
      ' width: 40px; height: 40px; border-radius: 50%;' +
      ' border: 1px solid #999; background: rgba(255,255,255,0.85); color: #000;' +
      ' font-size: 20px; line-height: 38px; text-align: center; padding: 0;' +
      ' box-shadow: 0 1px 4px rgba(0,0,0,0.3); opacity: 0.7; }\n' +
      'html.' + ON_CLASS + ' #' + BTN_ID + ' { background: rgba(205,43,90,0.85); color: #fff; }';
    document.head.appendChild(style);
  }

  function toggle() {
    const root = document.documentElement;
    root.classList.toggle(ON_CLASS);
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.title = root.classList.contains(ON_CLASS) ? '元の表示に戻す' : '本文のみ表示';
  }

  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    if (!document.getElementById('data_container')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.textContent = '📖';
    btn.title = '本文のみ表示';
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);
  }

  addStyle();
  addButton();
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
})();
