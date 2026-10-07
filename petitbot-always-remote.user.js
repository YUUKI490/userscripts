// ==UserScript==
// @name         AIのべりすと プチボット保存先を常にリモート
// @namespace    https://ai-novel.com/
// @version      1.0.0
// @description  プチボットの「現在の保存先」がローカルになっていたら、自動でリモートに切り替えます
// @match        https://ai-novel.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // 何ミリ秒ごとに保存先を確認するか
  const CHECK_MS = 1500;
  // 一度切り替えたあと、次に切り替えるまで待つ時間（ミリ秒）
  const COOLDOWN_MS = 5000;

  let lastClick = 0;

  function check() {
    const value = document.getElementById('petitbot_storage_mode_value');
    const remoteBtn = document.getElementById('petitbot_storage_remote_btn');
    if (!value || !remoteBtn) return;
    if (value.textContent.trim() !== 'ローカル') return;
    if (remoteBtn.disabled) return;
    if (Date.now() - lastClick < COOLDOWN_MS) return;
    lastClick = Date.now();
    remoteBtn.click();
  }

  check();
  setInterval(check, CHECK_MS);
})();
