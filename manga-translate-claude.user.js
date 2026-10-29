// ==UserScript==
// @name         漫画吹き出し翻訳（Claude API）
// @namespace    yuuki490-manga-translate
// @version      1.0.0
// @description  有効にしたサイトの漫画画像の吹き出しをClaude APIで日本語に訳して、画像の上に重ねて表示します
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.anthropic.com
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const MODEL = 'claude-sonnet-5-5';
  const MIN_W = 250;      // これより小さい画像（サムネなど）にはボタンを出さない
  const MIN_H = 250;
  const MAX_SIDE = 1568;  // APIに送るときの画像の長辺（px）
  const host = location.hostname;

  // ---------- 設定（サイトごとの有効化・APIキー） ----------
  const getSites = () => GM_getValue('sites', []);
  const isEnabled = () => getSites().includes(host);

  GM_registerMenuCommand(isEnabled() ? `「${host}」で無効にする` : `「${host}」で有効にする`, () => {
    const s = getSites();
    GM_setValue('sites', isEnabled() ? s.filter(h => h !== host) : s.concat(host));
    location.reload();
  });
  GM_registerMenuCommand('APIキーを設定', setKey);

  function setKey() {
    const k = prompt('Claude APIキー（sk-ant-…）を入力してください', GM_getValue('apiKey', ''));
    if (k !== null) GM_setValue('apiKey', k.trim());
    return GM_getValue('apiKey', '');
  }

  if (!isEnabled()) return;

  // ---------- 見た目 ----------
  const style = document.createElement('style');
  style.textContent = `
    .mt-layer{position:absolute;z-index:2147483000;pointer-events:none;}
    .mt-btn{position:absolute;top:6px;right:6px;pointer-events:auto;font:bold 14px/1 sans-serif;
      padding:8px 12px;border:none;border-radius:16px;background:rgba(0,0,0,.65);color:#fff;cursor:pointer;}
    .mt-box{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;
      background:#fff;color:#000;border-radius:10px;padding:2px 4px;box-sizing:border-box;overflow:hidden;
      font-family:"Hiragino Maru Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-weight:bold;
      line-height:1.25;overflow-wrap:anywhere;box-shadow:0 0 0 1px rgba(0,0,0,.25);}
    .mt-hide .mt-box{display:none;}
  `;
  document.head.appendChild(style);

  // ---------- 画像ごとのレイヤー管理 ----------
  const layers = new Map(); // img -> { layer, btn, state, src, w, h }
  const srcOf = img => img.currentSrc || img.src;

  function attach(img) {
    if (layers.has(img)) return;
    if (img.naturalWidth < MIN_W || img.naturalHeight < MIN_H) return;
    if (img.getBoundingClientRect().width < 150) return;

    const layer = document.createElement('div');
    layer.className = 'mt-layer';
    const btn = document.createElement('button');
    btn.className = 'mt-btn';
    btn.textContent = '翻訳';
    layer.appendChild(btn);
    document.body.appendChild(layer);

    const L = { layer, btn, state: 'idle', src: srcOf(img), w: 0, h: 0 };
    layers.set(img, L);
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      onClick(img, L);
    });
    place(img, L);
  }

  function place(img, L) {
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) { L.layer.style.display = 'none'; return; }
    L.layer.style.display = '';
    L.layer.style.left = (r.left + window.scrollX) + 'px';
    L.layer.style.top = (r.top + window.scrollY) + 'px';
    L.layer.style.width = r.width + 'px';
    L.layer.style.height = r.height + 'px';
    if (L.w !== r.width || L.h !== r.height) {
      L.w = r.width;
      L.h = r.height;
      fitAll(L);
    }
  }

  function resetLayer(L) {
    L.layer.querySelectorAll('.mt-box').forEach(b => b.remove());
    L.layer.classList.remove('mt-hide');
    L.state = 'idle';
    L.btn.textContent = '翻訳';
  }

  function scan() {
    document.querySelectorAll('img').forEach(img => {
      if (img.complete && img.naturalWidth) attach(img);
      else if (!img.dataset.mtWait) {
        img.dataset.mtWait = '1';
        img.addEventListener('load', () => attach(img), { once: true });
      }
    });
    layers.forEach((L, img) => {
      if (!document.contains(img)) {
        L.layer.remove();
        layers.delete(img);
        return;
      }
      const cur = srcOf(img);
      if (L.src !== cur && L.state !== 'busy') {
        L.src = cur;
        resetLayer(L);
      }
      place(img, L);
    });
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; scan(); });
  }

  scan();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  setInterval(scan, 1000);

  // ---------- ボタン ----------
  async function onClick(img, L) {
    if (L.state === 'busy') return;
    if (L.state === 'done') {
      L.layer.classList.toggle('mt-hide');
      L.btn.textContent = L.layer.classList.contains('mt-hide') ? '訳を表示' : '原文を表示';
      return;
    }
    let key = GM_getValue('apiKey', '');
    if (!key) key = setKey();
    if (!key) return;

    L.state = 'busy';
    L.btn.textContent = '翻訳中…';
    const src = srcOf(img);
    try {
      const { data, type } = await loadImage(src);
      const bubbles = await callClaude(key, data, type);
      L.src = src;
      renderBoxes(L, bubbles);
      L.state = 'done';
      L.btn.textContent = bubbles.length ? '原文を表示' : '文字なし';
    } catch (err) {
      console.error('[漫画翻訳]', err);
      L.state = 'idle';
      L.btn.textContent = '翻訳';
      alert('翻訳に失敗しました：\n' + (err && err.message ? err.message : err));
    }
  }

  // ---------- 画像の取得と縮小 ----------
  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        headers: { Referer: location.href },
        timeout: 60000,
        onload: r => (r.status >= 200 && r.status < 300 && r.response)
          ? resolve(r.response)
          : reject(new Error('画像の取得に失敗しました（HTTP ' + r.status + '）')),
        onerror: () => reject(new Error('画像の取得に失敗しました（通信エラー）')),
        ontimeout: () => reject(new Error('画像の取得がタイムアウトしました'))
      });
    });
  }

  async function loadImage(src) {
    const blob = (src.startsWith('data:') || src.startsWith('blob:'))
      ? await (await fetch(src)).blob()
      : await gmFetchBlob(src);
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return { data: c.toDataURL('image/jpeg', 0.9).split(',')[1], type: 'image/jpeg' };
  }

  // ---------- Claude API ----------
  const TOOL = {
    name: 'report_translations',
    description: '漫画ページ内の吹き出し・テキストの位置と日本語訳を報告する',
    input_schema: {
      type: 'object',
      properties: {
        bubbles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              box: {
                type: 'array',
                items: { type: 'number' },
                description: '[左, 上, 右, 下]。画像の幅と高さをそれぞれ1000とした座標'
              },
              original: { type: 'string', description: '元の文章' },
              ja: { type: 'string', description: '日本語訳' }
            },
            required: ['box', 'ja']
          }
        }
      },
      required: ['bubbles']
    }
  };

  const PROMPT = `この漫画ページの吹き出し・ナレーション枠など、読むべきテキストをすべて見つけて、自然な日本語に翻訳してください。
- 読む順番（コマ順、各コマの中は上から順）に並べる
- box は画像全体の幅と高さをそれぞれ1000としたときの [左, 上, 右, 下]。その吹き出しの文字が書かれている範囲を、吹き出しの白い部分からはみ出さないように指定する
- 1つの吹き出しは1項目にまとめる
- 訳は日本の漫画のセリフらしい自然な口調にする。キャラの性格や話し方、前後の流れに合わせる。人名や固有名詞はカタカナにする
- 背景に描かれた効果音は訳さなくてよい
- 結果は必ず report_translations ツールで返す`;

  function callClaude(key, data, type) {
    const body = {
      model: MODEL,
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: type, data } },
          { type: 'text', text: PROMPT }
        ]
      }]
    };
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        data: JSON.stringify(body),
        timeout: 120000,
        onload: r => {
          let j;
          try { j = JSON.parse(r.responseText); }
          catch (e) { return reject(new Error('APIの応答を読めませんでした（HTTP ' + r.status + '）')); }
          if (r.status !== 200) {
            return reject(new Error((j.error && j.error.message) || ('HTTP ' + r.status)));
          }
          const t = (j.content || []).find(c => c.type === 'tool_use');
          if (!t) {
            return reject(new Error('翻訳結果が返ってきませんでした' + (j.stop_reason ? '（' + j.stop_reason + '）' : '')));
          }
          resolve(Array.isArray(t.input.bubbles) ? t.input.bubbles : []);
        },
        onerror: () => reject(new Error('APIに接続できませんでした')),
        ontimeout: () => reject(new Error('APIの応答がタイムアウトしました'))
      });
    });
  }

  // ---------- 訳を重ねて表示 ----------
  function renderBoxes(L, bubbles) {
    L.layer.querySelectorAll('.mt-box').forEach(b => b.remove());
    L.layer.classList.remove('mt-hide');
    for (const b of bubbles) {
      if (!Array.isArray(b.box) || b.box.length < 4 || !b.ja) continue;
      let [x1, y1, x2, y2] = b.box.map(Number);
      if (x2 < x1) [x1, x2] = [x2, x1];
      if (y2 < y1) [y1, y2] = [y2, y1];
      const w = Math.max(x2 - x1, 40);
      const h = Math.max(y2 - y1, 25);

      const d = document.createElement('div');
      d.className = 'mt-box';
      d.style.left = (x1 / 10) + '%';
      d.style.top = (y1 / 10) + '%';
      d.style.width = (w / 10) + '%';
      d.dataset.h = (h / 10) + '%';
      d.style.height = d.dataset.h;
      d.title = b.original || '';
      const sp = document.createElement('span');
      sp.textContent = b.ja;
      d.appendChild(sp);
      L.layer.insertBefore(d, L.btn);
    }
    fitAll(L);
  }

  function fitAll(L) {
    L.layer.querySelectorAll('.mt-box').forEach(d => {
      const sp = d.firstChild;
      if (!sp) return;
      d.style.height = d.dataset.h;
      const len = Math.max(1, sp.textContent.length);
      let fs = Math.min(24, Math.max(8, Math.floor(Math.sqrt(d.clientWidth * d.clientHeight / len) * 0.9)));
      d.style.fontSize = fs + 'px';
      while (fs > 8 && (sp.offsetHeight > d.clientHeight - 4 || sp.offsetWidth > d.clientWidth)) {
        fs -= 1;
        d.style.fontSize = fs + 'px';
      }
      if (sp.offsetHeight > d.clientHeight - 4) d.style.height = 'auto';
    });
  }
})();
