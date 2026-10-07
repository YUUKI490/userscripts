// ==UserScript==
// @name         DOM保存ボタン
// @namespace    https://github.com/YUUKI490/userscripts
// @version      1.1.0
// @description  今表示しているページのHTML（DOM）をテキストファイルに保存するボタンを出す
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @noframes
// @downloadURL  https://raw.githubusercontent.com/YUUKI490/userscripts/main/dom-saver.user.js
// @updateURL    https://raw.githubusercontent.com/YUUKI490/userscripts/main/dom-saver.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'yk-dom-saver-btn';
  if (document.getElementById(BTN_ID)) return;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function makeFileName() {
    const d = new Date();
    const stamp =
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    let title = (document.title || location.hostname || 'page')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .trim()
      .slice(0, 40);
    if (!title) title = 'page';
    return title + '_' + stamp + '.txt';
  }

  function saveDom() {
    const btn = document.getElementById(BTN_ID);
    // 保存するHTMLにボタン自身が入らないように一時的に外す
    if (btn) btn.remove();

    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    if (btn) document.body.appendChild(btn);

    const blob = new Blob([html], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = makeFileName();
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    if (btn) {
      const old = btn.textContent;
      btn.textContent = '保存した';
      setTimeout(() => { btn.textContent = old; }, 1500);
    }
  }

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = 'DOM保存 v1.1';
  Object.assign(btn.style, {
    position: 'fixed',
    left: '8px',
    bottom: '80px',
    zIndex: '2147483647',
    padding: '6px 10px',
    fontSize: '13px',
    lineHeight: '1.2',
    color: '#fff',
    background: 'rgba(40, 40, 40, 0.85)',
    border: '1px solid #888',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'sans-serif',
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveDom();
  });

  document.body.appendChild(btn);
})();
