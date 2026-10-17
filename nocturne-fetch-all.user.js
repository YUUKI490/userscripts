// ==UserScript==
// @name         ノクターン本文まとめ取得
// @namespace    yuuki490
// @version      1.0
// @description  作品の目次ページから各話の本文を順番に取得して1つのtxtで保存する
// @match        https://novel18.syosetu.com/*
// @match        https://ncode.syosetu.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 目次ページ以外では動かさない
  if (!document.querySelector('.p-eplist, .index_box')) return;

  const WAIT_MS = 1500; // 各話取得の間隔（サーバーに優しく）

  // ---------- 目次の収集（ページ分割にも対応） ----------
  function parseIndex(doc) {
    const items = [];
    const root = doc.querySelector('.p-eplist') || doc.querySelector('.index_box');
    if (!root) return items;
    root.querySelectorAll('.p-eplist__chapter-title, .chapter_title, .p-eplist__sublist, .novel_sublist2').forEach(el => {
      if (el.classList.contains('p-eplist__chapter-title') || el.classList.contains('chapter_title')) {
        items.push({ type: 'chapter', title: el.textContent.trim() });
      } else {
        const a = el.querySelector('a');
        if (a) items.push({ type: 'episode', title: a.textContent.trim(), url: new URL(a.getAttribute('href'), location.href).href });
      }
    });
    return items;
  }

  function nextIndexUrl(doc) {
    const a = doc.querySelector('a.c-pager__item--next, .novelview_pager a[href*="?p="]:last-child');
    if (!a) return null;
    // 旧レイアウトの「次へ」判定
    if (!a.classList.contains('c-pager__item--next') && !/次/.test(a.textContent)) return null;
    return new URL(a.getAttribute('href'), location.href).href;
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function collectIndex() {
    let items = parseIndex(document);
    let next = nextIndexUrl(document);
    while (next) {
      await sleep(WAIT_MS);
      const doc = await fetchDoc(next);
      items = items.concat(parseIndex(doc));
      next = nextIndexUrl(doc);
    }
    return items;
  }

  // ---------- 本文の変換 ----------
  function nodeToText(el) {
    const clone = el.cloneNode(true);
    // ルビは「漢字《かんじ》」形式にする
    clone.querySelectorAll('ruby').forEach(r => {
      const rt = Array.from(r.querySelectorAll('rt')).map(x => x.textContent).join('');
      r.querySelectorAll('rt, rp').forEach(x => x.remove());
      r.replaceWith(document.createTextNode(r.textContent + (rt ? '《' + rt + '》' : '')));
    });
    clone.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    const ps = clone.querySelectorAll('p');
    if (ps.length) return Array.from(ps).map(p => p.textContent).join('\n');
    return clone.textContent;
  }

  function parseEpisode(doc) {
    const title = (doc.querySelector('.p-novel__title, .novel_subtitle') || {}).textContent || '';
    const preface = doc.querySelector('.p-novel__text--preface, #novel_p');
    const body = doc.querySelector('.js-novel-text:not(.p-novel__text--preface):not(.p-novel__text--afterword), #novel_honbun');
    const after = doc.querySelector('.p-novel__text--afterword, #novel_a');
    let text = '';
    if (preface) text += nodeToText(preface) + '\n\n----\n\n';
    if (body) text += nodeToText(body);
    if (after) text += '\n\n----\n\n' + nodeToText(after);
    return { title: title.trim(), text: text.replace(/\n{4,}/g, '\n\n\n') };
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ---------- 実行 ----------
  async function run(btn) {
    btn.disabled = true;
    const workTitle = (document.querySelector('.p-novel__title, .novel_title') || {}).textContent?.trim() || document.title;
    const author = (document.querySelector('.p-novel__author, .novel_writername') || {}).textContent?.trim() || '';
    const out = [workTitle, author, '', ''];

    try {
      btn.textContent = '目次取得中…';
      const items = await collectIndex();
      const episodes = items.filter(i => i.type === 'episode');
      let done = 0;

      for (const item of items) {
        if (item.type === 'chapter') {
          out.push('【' + item.title + '】', '');
          continue;
        }
        btn.textContent = `取得中 ${done + 1}/${episodes.length}`;
        let ep = null;
        for (let attempt = 0; attempt < 2 && !ep; attempt++) {
          try {
            ep = parseEpisode(await fetchDoc(item.url));
          } catch (e) {
            if (attempt === 1) throw new Error(item.title + ' の取得に失敗: ' + e.message);
            await sleep(WAIT_MS * 2);
          }
        }
        out.push('■ ' + (ep.title || item.title), '', ep.text, '', '');
        done++;
        await sleep(WAIT_MS);
      }
      btn.textContent = '完了（保存中）';
    } catch (e) {
      alert(e.message + '\nここまでの分を保存します。');
    }

    const blob = new Blob([out.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = workTitle.replace(/[\\/:*?"<>|]/g, '_') + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    btn.textContent = '本文取得';
    btn.disabled = false;
  }

  // ---------- ボタン ----------
  const btn = document.createElement('button');
  btn.textContent = '本文取得';
  Object.assign(btn.style, {
    position: 'fixed', right: '12px', bottom: '70px', zIndex: 99999,
    padding: '10px 14px', fontSize: '14px', borderRadius: '8px',
    border: 'none', background: '#c0392b', color: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.3)'
  });
  btn.addEventListener('click', () => run(btn));
  document.body.appendChild(btn);
})();
