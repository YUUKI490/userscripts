// ==UserScript==
// @name         AIのべりすと 3章まとめ
// @namespace    yuuki490-ainovel
// @version      1.4
// @description  仮ボタン「章」を押すと、本文の最新章から直近3章を判定し、脚注作成プロンプトの章番号を差し替えて指示欄に入れ「続ける」を押す。生成されたAIブロックを読んで確認画面を出し、OKで脚注を差し替え（場面は差し替え、同じ名前の人物は差し替え、新しい人物は追加、出てこなかった人物はそのまま）。あらすじと区切り線の下の汚染一覧はGM_setValueに保存して脚注には入れない。反映前の脚注は3回分GM_setValueに控える。最後にAIブロックと指示ブロックを消す。章ボタンを長押しすると、プロンプト（先頭の下の部分）を作品ごとに書き換えてGM_setValueに保存できる
// @match        https://ai-novel.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 設定 ===================== */
  // 指示欄に入れるプロンプトの先頭（共通・固定）。{START} と {END} が章番号に置き換わる
  const PROMPT_HEAD = 'ここで本文の続きは書かず、本文の第{START}章から第{END}章までを読み、オーサーズノート（脚注）に貼るためのまとめを書いてください。出力したものはそのまま脚注として使います。';
  // 先頭の下に続く部分。章ボタンを長押しすると作品ごとに書き換えられる（GM_setValueに保存）。未設定の作品ではこれを使う
  const DEFAULT_PROMPT_BODY = `【書くもの】
1. 第{START}章から第{END}章までのあらすじを1段落。「[第{START}章〜第{END}章のあらすじ：」で書き始める。章ごとに分けず、3章分の流れをひとつの文章として古い順にまとめる。誰が汚染されたか、誰が何に気づいたか、どんな計画が立てられたか、浄刃を誰の剣で誰に使ったかを必ず残す。
2. 場面の段落を1つ。「[場面：」で書き始める。第{END}章末尾の時点の日数と時間帯、場所、その場にいる主要人物、今まさに起きていることを書く。続けて、これから誰が何をする予定かを書く。
3. 第{START}章から第{END}章に登場した主要人物ごとに1段落。「[人物名：」で書き始める。今の現在地、負傷・拘束・汚染の状態、この3章での主な言動と変化、今の心情、口調を書く。
4. 人物の段落のあとに区切り線「-----------」を1行書き、その下に「人物名=状態」の形で汚染の一覧を書く。状態は「汚染」「汚染なし」「判断できない」のどれかだけにする。

【この作品の決まり】
・日数は「怪人騒動何日目」で書く。雨宮澄が神社の石段で白峰凛花と出会い、初めて浄刃を使った日を1日目とし、本文で日付が変わったと書かれていない限り日数を進めない。
・泥王と七濁は汚れの怪人であり、汚染ではない。状態は「汚染する側の怪人である」と書き、一覧には書かない。
・汚染された経緯を書くときは、誰がどの濁りで仕掛けたかと、本人がどの本音を核にされたかを分けて書く。
・汚染している人物は、段階（濁り・染み・沈み）と、誰の指示に従っているかと、雨宮澄や五華への態度も書く。
・浄刃を使った場合は、雨宮澄が誰の剣に手を重ね、誰を浄化したかを書く。
・誰かが違和感や疑いを抱いた場合は、何がどう不自然だったかを具体的に書く。雨宮澄が浄眼で見たもの（黒い糸の有無や濃さ、目の奥の濁り）は必ず残す。
・泥王や七濁が立てた計画、次の標的、予定は短くても必ず残す。

【書き方】
・本文に書かれている事実だけを使い、推測やまだ書かれていない先の展開は書かない。
・「誘った」「予告した」ことと「実際にやった」ことを区別する。
・人物の状態は「負傷も拘束もなく、汚染されていない」「負傷も拘束もないが、汚染（沈み）している」「負傷はないが、〇〇に拘束されている」の形で、今の状態として書く。
・各段落は箇条書きや体言止めの羅列にせず、読点でつないだ文章で書く。
・セリフや本文の言い回しはそのまま写さず、短く要約する。
・あらすじの段落は400字程度、場面の段落は150字程度、人物の段落は150字程度までにする。
・各段落は半角の [ と ] で囲み、段落の間は1行空ける。
・前置き、見出し、説明、あとがきは一切書かない。最初の文字は「[第{START}章〜第{END}章のあらすじ：」にする。`;

  // まとめる章の数
  const CHAPTER_SPAN = 3;
  // 古い脚注を控える回数
  const HISTORY_MAX = 3;
  // 生成の開始・終了を待つ最大時間（ミリ秒）
  const GEN_START_TIMEOUT = 30000;
  const GEN_TIMEOUT = 600000;
  // 生成完了後、本文の最後のブロックが落ち着くまで待つ時間（ミリ秒）
  const SETTLE_MS = 1500;
  const SETTLE_TIMEOUT = 15000;
  // 脚注の最大文字数
  const AN_MAX = 6000;

  const LOADING_ID = 'loading_anim';
  const OPEN_BTN_ID = 'ainovel-chapter-summary-btn';
  const OVERLAY_ID = 'ainovel-chapter-summary-overlay';
  const TOAST_ID = 'aag_toast';
  // 実行中は body に付ける。生成後の自動処理（ainovel-after-generate）はこれを見て生成完了を無視する
  const BUSY_ATTR = 'data-ainovel-footnote-busy';

  // GM_setValue のキー（後ろに作品名）
  const GM_SYNOPSIS = 'ainovel_chapter_synopsis:';   // あらすじ（章範囲ごと）
  const GM_STATES = 'ainovel_chapter_states:';       // 区切り線の下の汚染一覧
  const GM_HISTORY = 'ainovel_chapter_an_history:';  // 反映前の脚注（3回分）
  const GM_PROMPT = 'ainovel_chapter_prompt:';        // 作品ごとのプロンプト（先頭の下の部分）
  // 章ボタンを長押しと判定する時間（ミリ秒）
  const LONG_PRESS_MS = 600;
  // QuickPaste・キャラ画像が読む共通の洗脳状態一覧（localStorage）
  const LS_BRAINWASH = 'ainovel_brainwash_states';
  const LS_BRAINWASH_WORK = 'ainovel_brainwash_states:';

  /* ===================== 状態 ===================== */
  let busy = false;

  /* ===================== 小物 ===================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function gmGet(key, def) { try { return GM_getValue(key, def); } catch (_) { return def; } }
  function gmSet(key, val) { try { GM_setValue(key, val); } catch (_) {} }
  function lsGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (_) {} }

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

  function isVisible(el) {
    if (!el) return false;
    const css = window.getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  }

  function isGenerating() { return isVisible(document.getElementById(LOADING_ID)); }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ===================== 見た目 ===================== */
  const style = document.createElement('style');
  style.textContent = `
    #${OPEN_BTN_ID} { position:fixed; left:8px; bottom:360px; z-index:99980; width:48px; height:48px; border-radius:50%; border:1px solid #000; background:#6a2d5c; color:#fff; font-size:20px; font-family:serif; line-height:1; padding:0; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.4); opacity:.85; }
    #${OPEN_BTN_ID}.cs-busy { opacity:.5; cursor:default; }
    #${OVERLAY_ID} { position:fixed; inset:0; z-index:99990; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; font-family:sans-serif; }
    #${OVERLAY_ID} .cs-panel { background:#fff; color:#222; width:min(96vw,760px); max-height:92vh; overflow:auto; border-radius:12px; padding:14px 16px; box-shadow:0 4px 20px rgba(0,0,0,.5); font-size:14px; }
    #${OVERLAY_ID} h3 { margin:10px 0 4px; font-size:15px; }
    #${OVERLAY_ID} .cs-box { white-space:pre-wrap; background:#f4f4f4; border:1px solid #ccc; border-radius:8px; padding:8px; max-height:160px; overflow:auto; line-height:1.5; }
    #${OVERLAY_ID} textarea.cs-note { width:100%; box-sizing:border-box; min-height:220px; font-size:13px; line-height:1.5; padding:8px; border:1px solid #888; border-radius:8px; }
    #${OVERLAY_ID} .cs-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:12px; }
    #${OVERLAY_ID} button { padding:8px 16px; border-radius:8px; border:1px solid #666; font-size:14px; cursor:pointer; }
    #${OVERLAY_ID} .cs-ok { background:#2d6a4f; color:#fff; }
    #${OVERLAY_ID} .cs-cancel { background:#eee; color:#222; }
    #${OVERLAY_ID} .cs-small { color:#666; font-size:12px; }
    #${OVERLAY_ID} textarea.cs-prompt { width:100%; box-sizing:border-box; min-height:50vh; font-size:13px; line-height:1.5; padding:8px; border:1px solid #888; border-radius:8px; }
    #${OVERLAY_ID} .cs-reset { background:#eee; color:#222; margin-right:auto; }
  `;
  document.head.appendChild(style);

  /* ===================== 本文ブロック ===================== */
  function getBlocks() {
    return Array.from(document.querySelectorAll('#data_container .data_block'));
  }

  function blockCategory(block) {
    const cat = block.querySelector('.category');
    const c = cat && cat.getAttribute('data-category');
    if (c) return c;
    const edit = block.querySelector('.data_edit');
    if (!edit) return '';
    if (edit.classList.contains('assistant')) return 'assistant';
    if (edit.classList.contains('user')) return 'user';
    return 'plaintext';
  }

  function blockText(block) {
    const edit = block.querySelector('.data_edit');
    if (!edit) return '';
    const raw = edit.getAttribute('data-raw-markdown');
    return raw !== null ? raw : (edit.innerText || edit.textContent || '');
  }

  /* ===================== 章番号 ===================== */
  const KANJI_DIGITS = '〇一二三四五六七八九';
  const CHAPTER_RE = /第([0-9０-９〇零一二三四五六七八九十百]+)(?:[.．・][0-9０-９〇一二三四五六七八九]+)?章/g;

  function kanjiToNum(k) {
    if (/^[〇零一二三四五六七八九]+$/.test(k) && k.length > 1) {
      return Number(Array.from(k).map((c) => (c === '零' ? 0 : KANJI_DIGITS.indexOf(c))).join(''));
    }
    let total = 0;
    let cur = 0;
    for (const c of k) {
      if (c === '百') { total += (cur || 1) * 100; cur = 0; }
      else if (c === '十') { total += (cur || 1) * 10; cur = 0; }
      else if (c === '零') { cur = 0; }
      else {
        const d = KANJI_DIGITS.indexOf(c);
        if (d < 0) return NaN;
        cur = d;
      }
    }
    return total + cur;
  }

  function chapterNum(raw) {
    if (/^[0-9０-９]+$/.test(raw)) return Number(raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
    return kanjiToNum(raw);
  }

  // 本文の全ブロックから「第〇章」を拾い、一番大きい章番号を返す
  function findLatestChapter() {
    let latest = 0;
    getBlocks().forEach((block) => {
      const text = blockText(block);
      let m;
      CHAPTER_RE.lastIndex = 0;
      while ((m = CHAPTER_RE.exec(text)) !== null) {
        const n = chapterNum(m[1]);
        if (!Number.isNaN(n) && n > latest) latest = n;
      }
    });
    return latest;
  }

  /* ===================== 生成 ===================== */
  async function sendPrompt(prompt) {
    const field = document.getElementById('chat_field');
    const btn = document.getElementById('getcontinuation_chat');
    if (!field || !btn) throw new Error('指示欄か「続ける」ボタンが見つからないよ');
    field.value = prompt;
    fireInput(field);
    await sleep(200);
    btn.click();

    // 生成が始まるのを待つ
    const start = Date.now();
    while (!isGenerating()) {
      if (Date.now() - start > GEN_START_TIMEOUT) throw new Error('生成が始まらなかったよ');
      await sleep(300);
    }
    // 指示欄にプロンプトが残っていれば消す
    if (field.value === prompt) { field.value = ''; fireInput(field); }

    // 生成が終わるのを待つ
    const genStart = Date.now();
    while (isGenerating()) {
      if (Date.now() - genStart > GEN_TIMEOUT) throw new Error('生成が終わらなかったよ');
      await sleep(500);
    }

    // 最後のブロックがAIのブロックになり、中身が落ち着くまで待つ
    const settleStart = Date.now();
    let prev = null;
    let stableSince = Date.now();
    while (Date.now() - settleStart < SETTLE_TIMEOUT) {
      await sleep(300);
      const blocks = getBlocks();
      const last = blocks[blocks.length - 1];
      const sig = last ? blockCategory(last) + '|' + blockText(last) : '';
      if (sig !== prev) { prev = sig; stableSince = Date.now(); continue; }
      if (last && blockCategory(last) === 'assistant' && blockText(last).trim() && Date.now() - stableSince >= SETTLE_MS) {
        return blocks.length - 1;
      }
    }
    throw new Error('本文の最後がAIのブロックにならなかったよ');
  }

  /* ===================== 出力の読み取り ===================== */
  // 区切り線：ハイフン・ダッシュ・長音・罫線のどれかが3つ以上だけの行
  const SEP_RE = /^\s*[-－―ー‐–—─━]{3,}\s*$/;

  // 前置き（「このリクエストに応じて〜」や罫線）を飛ばし、最初の [ から読む
  function stripPreamble(text) {
    const i = text.indexOf('[');
    return i < 0 ? text : text.slice(i);
  }

  function splitOutput(text) {
    const lines = text.split(/\r?\n/);
    const idx = lines.findIndex((l) => SEP_RE.test(l));
    if (idx < 0) return { upper: text, lower: '' };
    return { upper: lines.slice(0, idx).join('\n'), lower: lines.slice(idx + 1).join('\n') };
  }

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
    if (/^\[第.{1,20}?あらすじ：/.test(block)) return { type: 'synopsis', text: block };
    if (/^\[場面：/.test(block)) return { type: 'scene', text: block };
    // 人物は全角の「：」のみ（[ジャンル:〜] のような半角のタグは触らない）
    const m = block.match(/^\[([^\[\]：:\n]{1,30})：/);
    if (m) return { type: 'person', name: m[1].trim(), key: normalizeName(m[1]), text: block };
    return { type: 'other', text: block };
  }

  function parseNew(upper) {
    let synopsis = null;
    let scene = null;
    const persons = [];
    tokenize(upper).forEach((t) => {
      if (t.type === 'synopsis' && !synopsis) synopsis = t.text;
      if (t.type === 'scene' && !scene) scene = t.text;
      if (t.type === 'person') persons.push(t);
    });
    return { synopsis, scene, persons };
  }

  // 状態の末尾に付くゴミ（AIが最後に吐く「};」など）を落とす
  const STATE_JUNK_RE = /[\s\]\}\)）\];；。、.]+$/;
  // 「人物名=状態」の行。「=」は半角でも全角でもよい
  const STATE_LINE_RE = /^\[?\s*([^\[\]=＝：:\n]{1,30})\s*[=＝]\s*([^\n]+?)\s*\]?\s*$/;

  function parseStateLines(text) {
    const list = [];
    text.split(/\r?\n/).forEach((raw) => {
      const m = raw.trim().match(STATE_LINE_RE);
      if (!m) return;
      const name = m[1].trim();
      const state = m[2].replace(STATE_JUNK_RE, '').trim();
      if (name && state) list.push({ name, state });
    });
    return list;
  }

  // 区切り線の下から一覧を読む。区切り線がなかったり下が空のときは、段落の外にある「名前=状態」の行を拾う
  function parseStates(lower, upper) {
    let list = parseStateLines(lower);
    if (!list.length && upper) {
      const outside = tokenize(upper).filter((t) => t.type === 'text').map((t) => t.text).join('\n');
      list = parseStateLines(outside);
    }
    return list;
  }

  /* ===================== 脚注の差し替え ===================== */
  // あらすじは脚注に入れない。場面は差し替え。同じ名前の人物は差し替え、新しい人物は追加。ほかはそのまま
  function mergeAuthorsNote(current, fresh) {
    const tokens = tokenize(current);
    const newMap = new Map();
    fresh.persons.forEach((p) => newMap.set(p.key, p));
    const used = new Set();
    let sceneDone = false;
    const out = [];
    const stat = { replaced: [], added: [] };

    tokens.forEach((t) => {
      if (t.type === 'synopsis') return; // 古いあらすじが脚注に残っていれば外す
      if (t.type === 'scene') {
        if (!fresh.scene) { out.push(t); return; }
        if (sceneDone) return;
        out.push({ type: 'scene', text: fresh.scene });
        sceneDone = true;
        return;
      }
      if (t.type === 'person' && newMap.has(t.key)) {
        if (used.has(t.key)) return;
        out.push({ type: 'person', key: t.key, text: newMap.get(t.key).text });
        used.add(t.key);
        stat.replaced.push(newMap.get(t.key).name);
        return;
      }
      out.push(t);
    });

    if (fresh.scene && !sceneDone) {
      const at = out.findIndex((t) => t.type === 'person');
      const tok = { type: 'scene', text: fresh.scene };
      if (at < 0) out.push(tok); else out.splice(at, 0, tok);
    }

    const added = fresh.persons.filter((p) => !used.has(p.key));
    if (added.length) {
      let at = -1;
      out.forEach((t, i) => { if (t.type === 'person') at = i; });
      if (at < 0) out.forEach((t, i) => { if (t.type === 'scene') at = i; });
      const toks = added.map((p) => ({ type: 'person', key: p.key, text: p.text }));
      if (at < 0) out.push(...toks); else out.splice(at + 1, 0, ...toks);
      stat.added = added.map((p) => p.name);
    }

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

  /* ===================== GM_setValue への保存 ===================== */
  function saveSynopsis(start, end, text) {
    if (!text) return;
    const key = GM_SYNOPSIS + workName();
    const list = gmGet(key, []);
    const label = '第' + start + '章〜第' + end + '章';
    const hit = list.find((x) => x.range === label);
    if (hit) { hit.text = text; hit.time = Date.now(); }
    else list.push({ range: label, start, end, text, time: Date.now() });
    gmSet(key, list);
  }

  function saveHistory(before, start, end) {
    const key = GM_HISTORY + workName();
    const list = gmGet(key, []);
    list.push({ time: Date.now(), range: '第' + start + '章〜第' + end + '章', text: before });
    while (list.length > HISTORY_MAX) list.shift();
    gmSet(key, list);
  }

  // キャラクターブックのタグ（例：「白峰 凛花 白峰凛花 リンカ」）からフルネームに直す
  function canonicalName(name) {
    const key = normalizeName(name);
    if (!key) return name;
    const inputs = document.querySelectorAll('input.witags, input[id^="witag"]');
    for (const input of inputs) {
      const tokens = String(input.value || '').split(/[\s　]+/).filter(Boolean);
      if (!tokens.length) continue;
      if (!tokens.some((t) => normalizeName(t) === key)) continue;
      return tokens.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a));
    }
    return name;
  }

  function sameName(a, b) {
    const x = normalizeName(a);
    const y = normalizeName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x));
  }

  function isUndecided(state) { return /判断できない|不明/.test(state || ''); }

  function mergeStates(raw, list) {
    const lines = (raw || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l) => {
      const i = l.indexOf('=');
      return i < 1 ? { raw: l } : { name: l.slice(0, i).trim(), state: l.slice(i + 1).trim() };
    });
    list.forEach((s) => {
      const name = canonicalName(s.name);
      const hit = rows.find((r) => r.name && sameName(r.name, name));
      if (hit) {
        // すでに「汚染」「汚染なし」など決まった状態がある人は、「判断できない」で上書きしない
        if (!(isUndecided(s.state) && hit.state && !isUndecided(hit.state))) hit.state = s.state;
        if (normalizeName(name).length > normalizeName(hit.name).length) hit.name = name;
      } else {
        rows.push({ name: name, state: s.state });
      }
    });
    return rows.map((r) => (r.name ? r.name + '=' + r.state : r.raw)).join('\n');
  }

  function saveStates(list) {
    if (!list.length) return;
    const w = workName();
    const merged = mergeStates(gmGet(GM_STATES + w, ''), list);
    gmSet(GM_STATES + w, merged);
    // QuickPaste・キャラ画像が読む共通一覧にも写す
    lsSet(LS_BRAINWASH_WORK + w, merged);
    lsSet(LS_BRAINWASH, merged);
  }

  /* ===================== ブロックの削除 ===================== */
  async function clickDialogOkIfShown() {
    const start = Date.now();
    while (Date.now() - start < 1500) {
      const dlg = document.getElementById('dialog_box');
      if (dlg && (dlg.open || isVisible(dlg))) {
        const ok = document.getElementById('dialog_btn_ok');
        if (ok) { ok.click(); return true; }
      }
      await sleep(100);
    }
    return false;
  }

  async function deleteBlock(index) {
    const blocks = getBlocks();
    const block = blocks[index];
    if (!block) return false;
    const trash = block.querySelector('.icon_trash_witag');
    if (!trash) return false;
    const before = blocks.length;
    trash.click();
    await clickDialogOkIfShown();
    const start = Date.now();
    while (getBlocks().length >= before) {
      if (Date.now() - start > 5000) return false;
      await sleep(200);
    }
    return true;
  }

  /* ===================== 確認画面 ===================== */
  function showConfirm(info) {
    return new Promise((resolve) => {
      const old = document.getElementById(OVERLAY_ID);
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      const rep = info.stat.replaced.length ? info.stat.replaced.join('、') : 'なし';
      const add = info.stat.added.length ? info.stat.added.join('、') : 'なし';
      overlay.innerHTML = `
        <div class="cs-panel">
          <h3>3章まとめの確認（${escapeHtml(info.range)}）</h3>
          <div class="cs-small">OKを押すと、脚注を下の内容に差し替えて、あらすじと汚染一覧を保存し、AIブロックと指示ブロックを消すよ。キャンセルなら何もしない（AIブロックは残る）</div>
          <h3>あらすじ（脚注には入れず保存だけ）</h3>
          <div class="cs-box">${escapeHtml(info.synopsis || '（見つからなかった）')}</div>
          <h3>汚染一覧（脚注には入れず保存だけ）</h3>
          <div class="cs-box">${escapeHtml(info.states.length ? info.states.map((s) => s.name + '=' + s.state).join('\n') : '（見つからなかった）')}</div>
          <h3>人物</h3>
          <div class="cs-box">差し替え：${escapeHtml(rep)}\n追加：${escapeHtml(add)}</div>
          <h3>差し替え後の脚注（直してOKしてもいいよ）</h3>
          <textarea class="cs-note"></textarea>
          <div class="cs-small cs-count"></div>
          <div class="cs-actions">
            <button type="button" class="cs-cancel">キャンセル</button>
            <button type="button" class="cs-ok">OK（脚注を差し替える）</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const ta = overlay.querySelector('textarea.cs-note');
      const count = overlay.querySelector('.cs-count');
      ta.value = info.merged;
      const updateCount = () => {
        const n = Array.from(ta.value).length;
        count.textContent = n + ' / ' + AN_MAX + '字' + (n > AN_MAX ? '　※脚注の上限を超えてるよ' : '');
        count.style.color = n > AN_MAX ? '#c00' : '#666';
      };
      ta.addEventListener('input', updateCount);
      updateCount();
      overlay.querySelector('.cs-ok').addEventListener('click', () => { overlay.remove(); resolve(ta.value); });
      overlay.querySelector('.cs-cancel').addEventListener('click', () => { overlay.remove(); resolve(null); });
    });
  }

  /* ===================== 作品ごとのプロンプト ===================== */
  function loadPromptBody() {
    const saved = gmGet(GM_PROMPT + workName(), '');
    return typeof saved === 'string' && saved.trim() ? saved : DEFAULT_PROMPT_BODY;
  }

  function buildPrompt(start, end) {
    return (PROMPT_HEAD + '\n\n' + loadPromptBody())
      .replace(/\{START\}/g, String(start))
      .replace(/\{END\}/g, String(end));
  }

  // 章ボタンの長押しで開く編集画面。保存は作品名ごと
  function showPromptEditor() {
    const old = document.getElementById(OVERLAY_ID);
    if (old) old.remove();
    const w = workName();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="cs-panel">
        <h3>3章まとめのプロンプト（${escapeHtml(w)}）</h3>
        <div class="cs-small">この作品で使う部分だけ編集できるよ。先頭の「ここで本文の続きは書かず〜」は共通で固定。{START} と {END} は章番号に置き換わる</div>
        <div class="cs-box" style="margin-top:6px;">${escapeHtml(PROMPT_HEAD)}</div>
        <textarea class="cs-prompt"></textarea>
        <div class="cs-small cs-count"></div>
        <div class="cs-actions">
          <button type="button" class="cs-reset">初期値に戻す</button>
          <button type="button" class="cs-cancel">キャンセル</button>
          <button type="button" class="cs-ok">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const ta = overlay.querySelector('textarea.cs-prompt');
    const count = overlay.querySelector('.cs-count');
    ta.value = loadPromptBody();
    const updateCount = () => {
      const saved = gmGet(GM_PROMPT + w, '');
      count.textContent = Array.from(ta.value).length + '字' + (saved ? '（この作品用に保存済み）' : '（初期値）');
    };
    ta.addEventListener('input', updateCount);
    updateCount();
    overlay.querySelector('.cs-reset').addEventListener('click', () => { ta.value = DEFAULT_PROMPT_BODY; updateCount(); });
    overlay.querySelector('.cs-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.cs-ok').addEventListener('click', () => {
      const v = ta.value.trim();
      if (!v) { toast('プロンプトが空だよ', 'rgba(204,0,0,.95)'); return; }
      if (v === DEFAULT_PROMPT_BODY.trim()) gmSet(GM_PROMPT + w, '');
      else gmSet(GM_PROMPT + w, ta.value);
      overlay.remove();
      toast('「' + w + '」のプロンプトを保存したよ', 'rgba(45,138,52,.95)');
    });
  }

  /* ===================== 全体の流れ ===================== */
  async function run() {
    if (busy) { toast('3章まとめを実行中だよ'); return; }
    if (isGenerating()) { toast('本文の生成が終わってから押してね'); return; }
    if (document.body.hasAttribute(BUSY_ATTR)) { toast('脚注まとめが動いてるから待ってね'); return; }
    const an = document.getElementById('authorsnote');
    if (!an) { toast('脚注欄が見つからないよ', 'rgba(204,0,0,.95)'); return; }

    const end = findLatestChapter();
    if (!end) { toast('本文に「第〇章」が見つからないよ', 'rgba(204,0,0,.95)'); return; }
    const start = Math.max(1, end - CHAPTER_SPAN + 1);
    const range = '第' + start + '章〜第' + end + '章';
    const prompt = buildPrompt(start, end);

    busy = true;
    document.body.setAttribute(BUSY_ATTR, '1');
    const openBtn = document.getElementById(OPEN_BTN_ID);
    if (openBtn) openBtn.classList.add('cs-busy');
    toast(range + 'のまとめを生成中…');
    try {
      const aiIndex = await sendPrompt(prompt);
      const blocks = getBlocks();
      const aiBlock = blocks[aiIndex];
      const userIndex = aiIndex - 1;
      const userBlock = blocks[userIndex];
      const hasUserBlock = userBlock && blockCategory(userBlock) === 'user';

      const output = stripPreamble(blockText(aiBlock));
      const { upper, lower } = splitOutput(output);
      const fresh = parseNew(upper);
      if (!fresh.scene && !fresh.persons.length) throw new Error('脚注にする段落が見つからなかったよ（AIブロックは残してある）');
      const states = parseStates(lower, upper);

      const before = an.value;
      const merged = mergeAuthorsNote(before, fresh);

      const decided = await showConfirm({ range, synopsis: fresh.synopsis, states, stat: merged.stat, merged: merged.text });
      if (decided === null) { toast('キャンセルしたよ（AIブロックは残してある）'); return; }

      saveHistory(before, start, end);
      writeAuthorsNote(decided);
      saveSynopsis(start, end, fresh.synopsis);
      saveStates(states);

      // 後ろから消す（先にAIブロック、次に指示ブロック）
      const okAi = await deleteBlock(aiIndex);
      const okUser = hasUserBlock ? await deleteBlock(userIndex) : false;

      let msg = '脚注を更新したよ（差し替え' + merged.stat.replaced.length + '人・追加' + merged.stat.added.length + '人';
      if (states.length) msg += '・汚染一覧' + states.length + '人を保存';
      msg += '）';
      if (!okAi || (hasUserBlock && !okUser)) msg += '　※ブロックの削除が一部できなかったよ';
      toast(msg, Array.from(decided).length > AN_MAX ? 'rgba(230,120,0,.95)' : 'rgba(45,138,52,.95)');
    } catch (e) {
      toast(e.message || String(e), 'rgba(204,0,0,.95)');
    } finally {
      const t = Date.now();
      while (isGenerating() && Date.now() - t < 10000) await sleep(300);
      busy = false;
      document.body.removeAttribute(BUSY_ATTR);
      if (openBtn) openBtn.classList.remove('cs-busy');
    }
  }

  /* ===================== 仮ボタン ===================== */
  function ensureOpenButton() {
    if (!document.getElementById('data_container') || document.getElementById(OPEN_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = OPEN_BTN_ID;
    btn.title = '直近3章のまとめを生成して脚注を更新';
    btn.textContent = '章';
    // 短く押す→実行、長押し→プロンプトの編集
    let pressTimer = null;
    let longPressed = false;
    const startPress = (e) => {
      if (e.type === 'pointerdown' && e.button !== 0) return;
      longPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { longPressed = true; showPromptEditor(); }, LONG_PRESS_MS);
    };
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    btn.addEventListener('pointerdown', startPress);
    btn.addEventListener('pointerup', cancelPress);
    btn.addEventListener('pointerleave', cancelPress);
    btn.addEventListener('pointercancel', cancelPress);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (longPressed) { longPressed = false; return; }
      run();
    });
    document.body.appendChild(btn);
  }

  setInterval(ensureOpenButton, 2000);
  ensureOpenButton();
})();
