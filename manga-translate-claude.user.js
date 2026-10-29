// ==UserScript==
// @name         漫画吹き出し翻訳（Claude API）
// @namespace    yuuki490-manga-translate
// @version      1.1.0
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
  const MIN_W = 250;        // これより小さい画像（サムネなど）にはボタンを出さない
  const MIN_H = 250;
  const MAX_SIDE = 1568;    // ふつうの画像をAPIに送るときの長辺（px）
  const TALL_RATIO = 1.6;   // 高さが幅のこの倍を超える縦長画像は分割して送る
  const PIECE_W = 1000;     // 分割するときの幅（px）
  const PIECE_RATIO = 1.5;  // 分割した1枚の高さ＝幅×この値
  const OVERLAP = 0.15;     // 分割した画像どうしの重なり（1枚の高さに対する割合）
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
      background:#fff !important;color:#000 !important;-webkit-text-fill-color:#000 !important;
      opacity:1 !important;filter:none !important;text-shadow:none !important;
      border-radius:10px;padding:3px 5px;box-sizing:border-box;overflow:hidden;
      font-family:"Hiragino Maru Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-weight:bold;
      line-height:1.25;overflow-wrap:anywhere;box-shadow:0 0 0 1px rgba(0,0,0,.35);}
    .mt-box span{color:#000 !important;-webkit-text-fill-color:#000 !important;}
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
      const { pieces, W, H } = await loadImage(src);
      let done = 0;
      if (pieces.length > 1) L.btn.textContent = `翻訳中… 0/${pieces.length}`;
      const results = await Promise.allSettled(pieces.map(p =>
        callClaude(key, p).then(r => {
          done++;
          if (pieces.length > 1) L.btn.textContent = `翻訳中… ${done}/${pieces.length}`;
          return r;
        })
      ));

      const boxes = [];
      const errors = [];
      results.forEach((res, i) => {
        if (res.status === 'rejected') { errors.push(res.reason); return; }
        const p = pieces[i];
        for (const b of res.value) {
          const box = toBox(b, p, W, H);
          if (box) boxes.push(box);
        }
      });
      if (errors.length === pieces.length) throw errors[0];

      L.src = src;
      renderBoxes(L, boxes);
      L.state = 'done';
      L.btn.textContent = boxes.length ? '原文を表示' : '文字なし';
      if (errors.length) {
        alert(`一部の翻訳に失敗しました（${errors.length}/${pieces.length}）：\n` + (errors[0].message || errors[0]));
      }
    } catch (err) {
      console.error('[漫画翻訳]', err);
      L.state = 'idle';
      L.btn.textContent = '翻訳';
      alert('翻訳に失敗しました：\n' + (err && err.message ? err.message : err));
    }
  }

  // ---------- 画像の取得・縮小・分割 ----------
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

  function drawPiece(bmp, sy, sh, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }

  // 返り値：pieces = [{ data, top, w, h }]（top・w・h は縮小後の全体画像W×Hでの位置とサイズ）
  async function loadImage(src) {
    const blob = (src.startsWith('data:') || src.startsWith('blob:'))
      ? await (await fetch(src)).blob()
      : await gmFetchBlob(src);
    const bmp = await createImageBitmap(blob);
    try {
      if (bmp.height <= bmp.width * TALL_RATIO) {
        const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
        const W = Math.round(bmp.width * s);
        const H = Math.round(bmp.height * s);
        return { W, H, pieces: [{ data: drawPiece(bmp, 0, bmp.height, W, H), top: 0, w: W, h: H, own: [0, H] }] };
      }
      // 縦長画像は幅をそろえて上から順に分割（少し重ねる）
      const s = Math.min(1, PIECE_W / bmp.width);
      const W = Math.round(bmp.width * s);
      const H = Math.round(bmp.height * s);
      const ph = Math.round(W * PIECE_RATIO);
      const ov = Math.round(ph * OVERLAP);
      const tops = [];
      for (let y = 0; ; y += ph - ov) {
        if (y + ph >= H) { tops.push(Math.max(0, H - ph)); break; }
        tops.push(y);
      }
      const pieces = tops.map((top, i) => {
        // この1枚が受け持つ範囲（重なりは半分ずつ分け合う）
        const ownTop = i === 0 ? 0 : Math.round((tops[i - 1] + ph + top) / 2);
        const ownBottom = i === tops.length - 1 ? H : Math.round((top + ph + tops[i + 1]) / 2);
        return { data: drawPiece(bmp, top / s, ph / s, W, ph), top, w: W, h: ph, own: [ownTop, ownBottom] };
      });
      return { W, H, pieces };
    } finally {
      if (bmp.close) bmp.close();
    }
  }

  // APIの座標（1枚ごとのピクセル）を、全体画像に対する％に直す
  function toBox(b, p, W, H) {
    if (!b || !Array.isArray(b.box) || b.box.length < 4 || !b.ja) return null;
    let [x1, y1, x2, y2] = b.box.map(Number);
    if ([x1, y1, x2, y2].some(v => !isFinite(v))) return null;
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    x1 = Math.max(0, Math.min(p.w, x1)); x2 = Math.max(0, Math.min(p.w, x2));
    y1 = Math.max(0, Math.min(p.h, y1)); y2 = Math.max(0, Math.min(p.h, y2));
    const cy = p.top + (y1 + y2) / 2;
    if (cy < p.own[0] || cy >= p.own[1]) return null; // 重なり部分は片方だけ使う
    return {
      left: x1 / W * 100,
      top: (p.top + y1) / H * 100,
      width: (x2 - x1) / W * 100,
      height: (y2 - y1) / H * 100,
      ja: String(b.ja),
      original: b.original ? String(b.original) : ''
    };
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
                description: '[左, 上, 右, 下]。画像の左上を(0,0)としたピクセル座標'
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

  function makePrompt(w, h) {
    return `この画像は幅${w}px、高さ${h}pxです。漫画（またはイラスト）の吹き出し・ナレーション枠・画像に書かれたセリフなど、読むべきテキストをすべて見つけて、自然な日本語に翻訳してください。
- 読む順番（コマ順、各コマの中は上から順）に並べる
- box は画像の左上を(0,0)としたピクセル座標 [左, 上, 右, 下]。その文章の文字が実際に書かれている範囲を、できるだけ正確に指定する
- 1つの吹き出し（ひとかたまりの文章）は1項目にまとめる
- 画像の上下の端で文字が途中で切れている文章は、読める部分だけで無理に訳さず省いてよい
- 訳は日本の漫画のセリフらしい自然な口調にする。キャラの性格や話し方、前後の流れに合わせる。人名や固有名詞はカタカナにする。（ ）で囲まれた心の声は（ ）のまま訳す
- 背景に描かれた効果音は訳さなくてよい
- 結果は必ず report_translations ツールで返す（ツールが使えない場合は {"bubbles":[{"box":[左,上,右,下],"original":"…","ja":"…"}]} の形のJSONだけを返す）`;
  }

  function callClaude(key, p) {
    const body = {
      model: MODEL,
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: 'auto' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } },
          { type: 'text', text: makePrompt(p.w, p.h) }
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
        timeout: 180000,
        onload: r => {
          let j;
          try { j = JSON.parse(r.responseText); }
          catch (e) { return reject(new Error('APIの応答を読めませんでした（HTTP ' + r.status + '）')); }
          if (r.status !== 200) {
            return reject(new Error((j.error && j.error.message) || ('HTTP ' + r.status)));
          }
          const t = (j.content || []).find(c => c.type === 'tool_use');
          if (t && t.input && Array.isArray(t.input.bubbles)) return resolve(t.input.bubbles);
          // ツールを使わず文章でJSONを返してきた場合の受け取り
          const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const o = JSON.parse(m[0]);
              if (Array.isArray(o.bubbles)) return resolve(o.bubbles);
            } catch (e) { /* 下でエラーにする */ }
          }
          if (/^\s*(\[\s*\]|文字はありません|テキストはありません)/.test(text)) return resolve([]);
          reject(new Error('翻訳結果が返ってきませんでした' + (j.stop_reason ? '（' + j.stop_reason + '）' : '')));
        },
        onerror: () => reject(new Error('APIに接続できませんでした')),
        ontimeout: () => reject(new Error('APIの応答がタイムアウトしました'))
      });
    });
  }

  // ---------- 訳を重ねて表示 ----------
  function renderBoxes(L, boxes) {
    L.layer.querySelectorAll('.mt-box').forEach(b => b.remove());
    L.layer.classList.remove('mt-hide');
    for (const b of boxes) {
      const d = document.createElement('div');
      d.className = 'mt-box';
      d.style.left = b.left + '%';
      d.style.top = b.top + '%';
      // 幅は文字の範囲を最低限にして、短いセリフが縦に並ばないよう必要なら広げる
      d.style.minWidth = Math.max(b.width, 4) + '%';
      d.style.maxWidth = Math.max(b.width, 45) + '%';
      d.dataset.h = Math.max(b.height, 2) + '%';
      d.style.minHeight = d.dataset.h;
      d.title = b.original;
      const sp = document.createElement('span');
      sp.textContent = b.ja;
      d.appendChild(sp);
      L.layer.insertBefore(d, L.btn);
    }
    fitAll(L);
  }

  function fitAll(L) {
    const lw = L.layer.clientWidth || 1;
    L.layer.querySelectorAll('.mt-box').forEach(d => {
      const sp = d.firstChild;
      if (!sp) return;
      // 元の文字の範囲の面積から文字の大きさを決める
      const bw = parseFloat(d.style.minWidth) / 100 * lw;
      const bh = d.offsetHeight || 20;
      const len = Math.max(1, sp.textContent.length);
      const fs = Math.min(22, Math.max(10, Math.floor(Math.sqrt(bw * bh / len) * 0.95)));
      d.style.fontSize = fs + 'px';
    });
  }
})();
