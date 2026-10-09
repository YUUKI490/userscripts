// ==UserScript==
// @name         AIのべりすと キャラブック更新 Grok連携
// @namespace    local.ainovel.android.charabook
// @version      1.4.0
// @description  直近の本文とキャラクターブックをGrokへ送り、洗脳などで状態が変わったキャラの説明を更新案として受け取り、確認してから書き換えます（PC版2.1.0とプロンプト共通：非破壊の現在ブロック＋洗脳状態一覧の同送）
// @match        https://ai-novel.com/*
// @match        https://*.ai-novel.com/*
// @match        https://grok.com/*
// @match        https://*.grok.com/*
// @match        https://x.com/i/grok*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      trigger.macrodroid.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // ⚙ 設定
    // =========================================================

    const CONFIG = {

        // Grokへ送る本文ブロックの最大数（指示ブロックも含む）
        storyBlocks: 6,

        // Grokへ送る本文の最大文字数（新しい方から数えます）
        storyMaxChars: 8000,

        // 無効化されているキャラブック項目も送るか
        includeDisabled: false,

        // 説明欄の上限（AIのべりすと側は3000）
        entryLimit: 3000,

        // AIのべりすと側のボタンの高さ（清書スクリプトの右側ボタン群 78〜286px と重ならない位置）
        novelButtonBottom: '300px',

        // Grok側のボタンの高さ（清書スクリプトの「4ブロック送信」150px と重ならない位置）
        grokButtonBottom: '210px',

        // 古い転送を無視する時間(ms)
        maxAge: 3 * 60 * 1000
    };

    const MACRODROID = {
        enabled: true,
        // ⚠ 人に渡すときは消してください
        url: 'https://trigger.macrodroid.com/7f73ce22-8c4c-4f0c-a986-c685962a403c/grok_switch',
        backUrl: 'https://trigger.macrodroid.com/7f73ce22-8c4c-4f0c-a986-c685962a403c/ainovel_switch',
        delay: 300,
        timeout: 5000
    };

    const AUTO_SUBMIT = {
        enabled: true,
        delay: 800,
        verifyAfter: 1500
    };

    // =========================================================

    const P = 'ainovel_cbupdate_';

    const KEYS = {
        toGrok: P + 'to_grok',
        toNovel: P + 'to_novel',
        backup: P + 'backup',
        remind: P + 'remind'
    };

    const START = '<<<CB_START>>>';
    const END = '<<<CB_END>>>';
    const NO_CHANGE = '【変更なし】';

    const HOST = location.hostname;

    const IS_AI_NOVEL =
        HOST === 'ai-novel.com' ||
        HOST.endsWith('.ai-novel.com');

    const IS_GROK =
        HOST === 'grok.com' ||
        HOST.endsWith('.grok.com') ||
        (HOST === 'x.com' && location.pathname.startsWith('/i/grok'));

    const PAGE =
        typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;


    // =========================================================
    // 共通
    // =========================================================

    function load(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (_) {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v;
        }
    }

    function save(key, value) {
        try {
            GM_setValue(key, value);
        } catch (_) {
            localStorage.setItem(key, value);
        }
    }

    function makePayload(text) {
        return JSON.stringify({
            id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
            time: Date.now(),
            text: String(text || '')
        });
    }

    function parsePayload(raw) {
        try {
            const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!d || !d.id || !d.time || typeof d.text !== 'string') {
                return null;
            }
            if (Date.now() - Number(d.time) > CONFIG.maxAge) {
                return null;
            }
            return d;
        } catch (_) {
            return null;
        }
    }

    function el(tag, css, text) {
        const e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function toast(message, error) {
        const t = el(
            'div',
            [
                'position:fixed',
                'left:50%',
                'bottom:90px',
                'transform:translateX(-50%)',
                'z-index:2147483647',
                'max-width:88vw',
                'padding:10px 16px',
                'border-radius:18px',
                'font-size:14px',
                'color:#fff',
                'background:' + (error ? '#c0392b' : '#333'),
                'box-shadow:0 2px 10px rgba(0,0,0,.4)'
            ].join(';'),
            message
        );
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, error ? 4000 : 2500);
    }

    function pokeMacroDroid(url) {
        if (!MACRODROID.enabled || !url || typeof GM_xmlhttpRequest !== 'function') {
            return false;
        }
        setTimeout(function () {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: MACRODROID.timeout,
                    onerror: function (e) { console.warn('[CB MacroDroid]', e); }
                });
            } catch (e) {
                console.warn('[CB MacroDroid]', e);
            }
        }, MACRODROID.delay);
        return true;
    }

    function floatingButton(id, label, color, bottom, onClick) {
        if (document.getElementById(id)) return;
        const b = el(
            'button',
            [
                'position:fixed',
                'bottom:' + bottom,
                'right:12px',
                'z-index:2147483640',
                'padding:11px 15px',
                'border:none',
                'border-radius:22px',
                'background:' + color,
                'color:#fff',
                'font-size:13px',
                'font-weight:bold',
                'box-shadow:0 2px 10px rgba(0,0,0,.4)'
            ].join(';'),
            label
        );
        b.id = id;
        b.type = 'button';
        b.addEventListener('click', onClick);
        document.body.appendChild(b);
    }


    // =========================================================
    // 📖 AIのべりすと側：キャラブック読み書き
    // =========================================================

    function readCharaBook() {
        const list = [];
        for (let i = 0; i < 200; i++) {
            const tag = document.getElementById('witag' + i);
            const entry = document.getElementById('wientry' + i);
            if (!tag || !entry) continue;

            const tagText = String(tag.value || '').trim();
            const entryText = String(entry.value || '').trim();
            if (!tagText && !entryText) continue;

            const inv = document.getElementById('text-witag-invalid' + i);
            const disabled = !!(inv && inv.checked);

            list.push({ i: i, tag: tagText, entry: entryText, disabled: disabled });
        }
        return list;
    }

    function setNativeValue(field, value) {
        const proto = Object.getPrototypeOf(field);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) {
            desc.set.call(field, value);
        } else {
            field.value = value;
        }
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function persistCharaBook(field) {
        // ページ本来の保存関数
        try {
            if (typeof PAGE.WriteWIIntoStorage === 'function') {
                PAGE.WriteWIIntoStorage();
                return;
            }
        } catch (e) {
            console.warn('[CB] WriteWIIntoStorage', e);
        }
        // 保険：入力欄の onmouseout / onpointerout を発火
        try {
            field.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
        } catch (_) {
            field.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        }
    }

    function writeEntry(i, tag, entry) {
        const tagField = document.getElementById('witag' + i);
        const entryField = document.getElementById('wientry' + i);
        if (!tagField || !entryField) {
            throw new Error('キャラブック ' + i + ' 番の欄が見つかりません');
        }
        if (typeof tag === 'string') {
            setNativeValue(tagField, tag);
        }
        setNativeValue(entryField, entry);
        persistCharaBook(entryField);
    }

    /*
     * 直近の本文を集めます。
     * limit を渡すとその文字数まで（新しい方優先）に切ります。
     * 戻り値の fullLength は切る前の文字数です。
     */
    function readStory(limit) {
        const root = document.querySelector('#data_container');
        if (!root) throw new Error('本文欄が見つかりません');

        const nodes = Array.from(root.querySelectorAll('.data_edit'));
        const parts = [];

        for (let k = nodes.length - 1; k >= 0; k--) {
            if (parts.length >= CONFIG.storyBlocks) break;

            const n = nodes[k];
            let text = String(n.innerText || n.textContent || '')
                .replace(/\r\n?/g, '\n')
                .trim();
            if (!text) continue;

            if (n.classList.contains('user')) {
                text = '【ユーザーの指示】' + text;
            }
            parts.unshift(text);
        }

        if (!parts.length) throw new Error('本文が見つかりません');

        const full = parts.join('\n\n');
        let text = full;

        if (limit && full.length > limit) {
            text = full.slice(-limit);
        }

        return {
            text: text,
            fullLength: full.length,
            truncated: text.length < full.length
        };
    }

    function readBookText() {
        const book = readCharaBook().filter(function (b) {
            return CONFIG.includeDisabled || !b.disabled;
        });
        if (!book.length) throw new Error('キャラクターブックが空です');

        return book.map(function (b) {
            return '■番号:' + b.i + (b.disabled ? '（無効）' : '') +
                '\nタグ：' + b.tag +
                '\n説明：\n' + b.entry;
        }).join('\n\n');
    }

    /*
     * 清書スクリプトが localStorage（ai-novel.com）に出している、
     * 今の作品の洗脳状態一覧
     */
    function sharedStates() {
        try {
            return String(localStorage.getItem('ainovel_brainwash_states') || '').trim() || 'なし';
        } catch (_) {
            return 'なし';
        }
    }

    function buildPrompt(bookText, story, states) {
        return [
            'あなたは小説執筆ツール「AIのべりすと」のキャラクターブック管理係です。',
            '下の【直近の本文】を読み、キャラクターの「今の状態」が変わった人物だけ、【現在のキャラクターブック】の説明を更新してください。',
            '対象になる変化の例：洗脳・支配された、所属や忠誠の対象が変わった、口調・一人称・呼び方が変わった、価値観や他キャラとの関係が変わった、負傷・装備・能力の変化、洗脳や異常が解けた。',
            '',
            '【最重要ルール：既存部分を書き換えない】',
            '・元からある行やブロックは1文字も変更しない。語尾や時制も直さない。誤字があってもそのままにする。',
            '・今の状態は、説明の末尾へ [◯◯の現在:設定≡～] という専用ブロックを1つだけ足して、そこにまとめる。◯◯には最初のブロックと同じ名前を入れる。',
            '・すでに [◯◯の現在] ブロックがある場合は、そのブロックの中身だけを最新の状態へ差し替える。',
            '・以前の形式の [◯◯の現状] ブロックや [◯◯の洗脳前] ブロックがある場合だけは例外として、その内容を [◯◯の現在] へまとめ直し、古いブロックは削除する。',
            '・最初のブロック、[◯◯の容姿] [◯◯の関係] [◯◯の特徴] などのブロックへ今の状態を書き足さない。関係が変わった場合も [◯◯の関係] は触らず、[◯◯の現在] の中に書く。',
            '・[◯◯の口調] ブロックは書き換えない。一人称や語尾が変わった場合は、[◯◯の現在] の中へ「この状態のあいだだけ一人称は「～」になる」と書く。',
            '',
            '【[◯◯の現在] ブロックの書き方】',
            '・200文字以内にまとめる。',
            '・元の人物像と重複する内容（変化する前の性格や経歴など）は書かない。「洗脳前：」のような前置きも不要。',
            '・書く内容は、どんな状態か、誰に従っているか、どんな役割を信じているか、主要人物への態度がどう変わったか、何を拒み何を進んでするか、話し方の変化、自覚の有無。',
            '・その場面で起きた具体的な出来事、居場所、日付、一度きりの行動は書かない。それらはオーサーズ・ノートの担当なので、キャラクターブックには入れない。',
            '・本文に書かれていない設定は足さない。原因・正体・解除条件などが本文で判明していない場合は「不明」と明記する。',
            '・その状態でのセリフが本文にある場合のみ、[◯◯の現在] ブロックの直後へ、既存の会話例と同じ名前の書き方で「名前「セリフ」」の形を最大2行まで足す。',
            '・状態が解除された場合は、[◯◯の現在] ブロックと、その直後に足した状態中の会話例を削除し、元の説明だけに戻す。',
            '',
            '【[◯◯の現在] ブロックの記入例】',
            '[黒田典子の現在:設定≡改変の書で「小嶋悠輝のために在る寮監」に書き換えられている。小嶋悠輝を主として崇拝し、自分の務めだと信じていて自覚はない。他の生徒には従来どおり厳しいが、小嶋にだけは体調や生活を細かく気にかけ、小嶋の味方として寮を管理する。寮則違反の常連として手を焼いていた以前の態度は消えている。]',
            '黒田典子「お前のことは、私が見る。寮監として、当たり前だ」',
            '',
            '【洗脳状態の判断】',
            '・下の【現在の洗脳状態一覧】にいる人物は洗脳が確定している。',
            '・一覧にいない人物は、本文で洗脳や書き換えの完了がはっきり書かれている場合だけ洗脳済みとして扱う。途中、疑い、抵抗中の人物は洗脳済みにしない。',
            '・洗脳されていない人物（洗脳した側の人物など）に変化がある場合も [◯◯の現在] を使う。',
            '',
            '【その他のルール】',
            '・変化がない項目は出力しない。',
            '・番号は元の番号をそのまま使う。',
            '・タグは元のまま出力する。一般的な単語（主、彼女、少女、先輩 など）をタグへ足さない。',
            '・元の書式（[ ]で囲む、≡で区切る、空行で区切る）を保つ。',
            '・説明は1項目' + (CONFIG.entryLimit - 200) + '文字以内。',
            '・出力は必ず1つのコードブロックにまとめ、説明や前置きはコードブロックの外にも書かない。',
            '・誰も変化していなければ、コードブロックの中に ' + NO_CHANGE + ' とだけ書く。',
            '',
            '【出力形式】（番号の所には数字を入れる）',
            START,
            '【更新:番号】',
            'タグ：（タグ）',
            '説明：',
            '（新しい説明の全文）',
            '【/更新】',
            END,
            '',
            '【現在の洗脳状態一覧】',
            states,
            '',
            '【現在のキャラクターブック】',
            bookText,
            '',
            '【直近の本文】',
            story
        ].join('\n');
    }

    function sendToGrok() {
        let prompt;
        try {
            prompt = buildPrompt(
                readBookText(),
                readStory(CONFIG.storyMaxChars).text,
                sharedStates()
            );
        } catch (e) {
            toast(e.message, true);
            return;
        }
        save(KEYS.toGrok, makePayload(prompt));
        markSent();
        const moved = pokeMacroDroid(MACRODROID.url);
        toast(moved ? 'Grokへ送って切り替えます' : 'Grokへ送りました');
    }


    // =========================================================
    // ⏰ 送り忘れ警告
    // =========================================================

    /*
     * 最後に「Grokへ送る」を押したときの本文の総文字数を
     * 作品タイトルごとに記録しておき、
     * そこから REMIND.chars 文字以上増えたら知らせます。
     */
    const REMIND = {
        enabled: true,

        // この文字数ぶん本文が増えたら警告
        chars: 8000,

        // 「あとで」を押したら、さらに何文字増えるまで黙るか
        snoozeChars: 2000,

        // 確認の間隔(ms)
        interval: 5000,

        bannerId: P + 'remind_banner'
    };

    function novelTitle() {
        const t = document.getElementById('data_title');
        const text = t ? String(t.textContent || '').trim() : '';
        return text || '(無題)';
    }

    function totalStoryChars() {
        const root = document.querySelector('#data_container');
        if (!root) return -1;
        let n = 0;
        root.querySelectorAll('.data_edit').forEach(function (e) {
            n += String(e.textContent || '').replace(/\s+/g, '').length;
        });
        return n;
    }

    function loadRemindMap() {
        try {
            return JSON.parse(load(KEYS.remind, '') || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function saveRemindMap(map) {
        save(KEYS.remind, JSON.stringify(map));
    }

    function markSent() {
        const total = totalStoryChars();
        if (total < 0) return;
        const map = loadRemindMap();
        map[novelTitle()] = { sent: total, snooze: 0 };
        saveRemindMap(map);
        hideRemind();
    }

    function hideRemind() {
        const b = document.getElementById(REMIND.bannerId);
        if (b) b.remove();
        const btn = document.getElementById(P + 'novel_btn');
        if (btn) {
            btn.textContent = '📖CB更新';
            btn.style.background = '#cd2b5a';
        }
    }

    function showRemind(diff) {
        const btn = document.getElementById(P + 'novel_btn');
        if (btn) {
            btn.textContent = '📖CB更新⚠';
            btn.style.background = '#e67e22';
        }

        let banner = document.getElementById(REMIND.bannerId);
        if (!banner) {
            banner = el(
                'div',
                [
                    'position:fixed',
                    'left:12px',
                    'right:12px',
                    'top:12px',
                    'z-index:2147483645',
                    'padding:12px 14px',
                    'border-radius:14px',
                    'background:#e67e22',
                    'color:#fff',
                    'font-size:14px',
                    'box-shadow:0 2px 12px rgba(0,0,0,.4)'
                ].join(';')
            );
            banner.id = REMIND.bannerId;

            const msg = el('div', 'font-weight:bold;margin-bottom:8px');
            msg.className = P + 'remind_msg';

            const row = el('div', 'display:flex;gap:8px');
            const now = el('button', 'flex:1;padding:9px;border:none;border-radius:10px;font-weight:bold;background:#fff;color:#e67e22', '今Grokへ送る');
            now.type = 'button';
            now.addEventListener('click', sendToGrok);

            const later = el('button', 'flex:1;padding:9px;border:1px solid #fff;border-radius:10px;font-weight:bold;background:transparent;color:#fff', 'あとで');
            later.type = 'button';
            later.addEventListener('click', function () {
                const map = loadRemindMap();
                const key = novelTitle();
                if (map[key]) {
                    map[key].snooze = totalStoryChars() + REMIND.snoozeChars;
                    saveRemindMap(map);
                }
                banner.remove();
            });

            const done = el('button', 'flex:1;padding:9px;border:1px solid #fff;border-radius:10px;font-weight:bold;background:transparent;color:#fff', '反映済み');
            done.type = 'button';
            done.addEventListener('click', markSent);

            row.append(now, later, done);
            banner.append(msg, row);
            document.body.appendChild(banner);
        }

        banner.querySelector('.' + P + 'remind_msg').textContent =
            '⚠ キャラブックを' + diff.toLocaleString() + '文字ぶん更新してないよ！Grokへ送ってね';
    }

    function checkRemind() {
        if (!REMIND.enabled || document.hidden) return;

        const total = totalStoryChars();
        if (total < 0) return;

        const map = loadRemindMap();
        const key = novelTitle();

        // はじめて見る作品は、今の文字数を基準にします
        if (!map[key]) {
            map[key] = { sent: total, snooze: 0 };
            saveRemindMap(map);
            return;
        }

        // 本文を消して減ったときは基準も下げます
        if (total < map[key].sent) {
            map[key].sent = total;
            saveRemindMap(map);
        }

        const diff = total - map[key].sent;

        if (diff < REMIND.chars) {
            hideRemind();
            return;
        }

        if (map[key].snooze && total < map[key].snooze) {
            // あとで中：ボタンの色だけ変えておく
            const btn = document.getElementById(P + 'novel_btn');
            if (btn) {
                btn.textContent = '📖CB更新⚠';
                btn.style.background = '#e67e22';
            }
            return;
        }

        showRemind(diff);
    }


    // =========================================================
    // 🔍 Grokの返事を解析
    // =========================================================

    function parseUpdates(text) {
        let body = String(text || '');

        const s = body.lastIndexOf(START);
        if (s >= 0) {
            body = body.slice(s + START.length);
            const e = body.indexOf(END);
            if (e >= 0) body = body.slice(0, e);
        }

        const updates = [];
        const re = /【更新[:：]\s*(\d+)\s*】([\s\S]*?)【\/更新】/g;
        let m;

        while ((m = re.exec(body))) {
            const i = Number(m[1]);
            const inner = m[2];

            const tagMatch = inner.match(/タグ[:：][ \t]*(.*)/);
            const descIndex = inner.search(/説明[:：]/);

            let entry = descIndex >= 0
                ? inner.slice(descIndex).replace(/^説明[:：][ \t]*\n?/, '')
                : inner;

            entry = entry.replace(/\r\n?/g, '\n').trim();

            if (!entry) continue;

            updates.push({
                i: i,
                tag: tagMatch ? tagMatch[1].trim() : null,
                entry: entry
            });
        }

        return {
            updates: updates,
            noChange: !updates.length && body.includes(NO_CHANGE)
        };
    }


    /*
     * 状態ブロック（現在・以前の形式の現状・洗脳前）を取り除いた本文
     */
    function stripStateBlocks(text) {
        return String(text || '')
            .replace(/\[[^\[\]:]*の(現在|現状|洗脳前):[\s\S]*?\]/g, '');
    }

    /*
     * 会話例の行か（名前「…」）
     */
    function isDialogueLine(line) {
        return /^[^\s「\[]{1,12}「/.test(line);
    }

    /*
     * 更新案の簡易チェック。警告の配列を返します。
     *
     * 非破壊方式なので「元の行（状態ブロックと会話例を除く）が
     * 全部そのまま残っているか」を見ます。
     */
    function checkUpdate(u, before) {
        const warnings = [];
        const entry = u.entry;

        if (!/^\[/.test(entry)) {
            warnings.push('先頭が[で始まっていない');
        }
        const open = (entry.match(/\[/g) || []).length;
        const close = (entry.match(/\]/g) || []).length;
        if (open !== close) {
            warnings.push('[ ]の数が合わない（' + open + '/' + close + '）');
        }

        const nowBlocks = entry.match(/\[[^\[\]:]*の現在:/g) || [];
        if (nowBlocks.length > 1) {
            warnings.push('現在ブロックが' + nowBlocks.length + '個ある');
        }
        const nowBlock = entry.match(/\[[^\[\]:]*の現在:[\s\S]*?\]/);
        if (nowBlock && nowBlock[0].length > 260) {
            warnings.push('現在ブロックが長い（' + nowBlock[0].length + '文字）');
        }
        if (/\[[^\[\]:]*の(現状|洗脳前):/.test(entry)) {
            warnings.push('古い形式の現状・洗脳前ブロックが残っている');
        }

        if (before) {
            const kept = stripStateBlocks(entry);
            const changed = stripStateBlocks(before.entry)
                .split('\n')
                .map(function (line) { return line.trim(); })
                .filter(function (line) {
                    return line && !isDialogueLine(line) && kept.indexOf(line) < 0;
                });

            if (changed.length) {
                warnings.push(
                    '元の行が' + changed.length + '行書き換わっている（例：' +
                    changed[0].slice(0, 30) + (changed[0].length > 30 ? '…' : '') + '）'
                );
            }
        }

        return warnings;
    }


    // =========================================================
    // 🪟 AIのべりすと側：確認画面
    // =========================================================

    const PANEL_ID = P + 'panel';

    function closePanel() {
        const p = document.getElementById(PANEL_ID);
        if (p) p.remove();
    }

    function basePanel(title) {
        closePanel();

        const overlay = el(
            'div',
            [
                'position:fixed',
                'inset:0',
                'z-index:2147483646',
                'background:rgba(0,0,0,.55)',
                'display:flex',
                'align-items:flex-end',
                'justify-content:center'
            ].join(';')
        );
        overlay.id = PANEL_ID;

        const box = el(
            'div',
            [
                'width:100%',
                'max-width:720px',
                'max-height:92vh',
                'display:flex',
                'flex-direction:column',
                'background:#fff',
                'color:#222',
                'border-radius:16px 16px 0 0',
                'font-size:14px',
                'overflow:hidden'
            ].join(';')
        );

        const head = el(
            'div',
            'padding:12px 14px;font-weight:bold;font-size:16px;background:#cd2b5a;color:#fff',
            title
        );

        const body = el('div', 'padding:10px 12px;overflow-y:auto;flex:1');
        const foot = el('div', 'display:flex;gap:8px;padding:10px 12px;border-top:1px solid #ddd');

        box.append(head, body, foot);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        return { body: body, foot: foot };
    }

    function panelButton(label, color, onClick) {
        const b = el(
            'button',
            'flex:1;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:bold;color:#fff;background:' + color,
            label
        );
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    const textareaCss =
        'width:100%;box-sizing:border-box;min-height:140px;padding:8px;border:1px solid #bbb;border-radius:8px;font-size:13px;line-height:1.5;color:#222;background:#fff';

    function openReview(text) {
        const result = parseUpdates(text);

        if (result.noChange) {
            toast('Grok「変更なし」だって！');
            return;
        }
        if (!result.updates.length) {
            toast('更新案を読み取れませんでした', true);
            return;
        }

        const current = {};
        readCharaBook().forEach(function (b) { current[b.i] = b; });

        const ui = basePanel('キャラブック更新の確認（' + result.updates.length + '件）');
        const rows = [];

        result.updates.forEach(function (u) {
            const before = current[u.i];
            const exists = !!document.getElementById('wientry' + u.i);
            const warnings = checkUpdate(u, before);

            const card = el('div', 'border:1px solid ' + (warnings.length ? '#e67e22' : '#ddd') + ';border-radius:10px;padding:10px;margin-bottom:12px');

            const top = el('label', 'display:flex;align-items:center;gap:8px;font-weight:bold;margin-bottom:6px');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = exists && !warnings.length;
            check.disabled = !exists;
            check.style.cssText = 'width:20px;height:20px';
            top.append(
                check,
                el('span', '', '#' + u.i + '　' + (before ? before.tag : (exists ? '（空き枠）' : '（枠がありません）')))
            );

            const warnBox = warnings.length
                ? el('div', 'color:#b35400;font-size:12px;margin-bottom:6px', '⚠ ' + warnings.join(' ／ ') + '（確認してからチェックしてね）')
                : null;

            const tagInput = document.createElement('input');
            tagInput.type = 'text';
            tagInput.value = u.tag !== null ? u.tag : (before ? before.tag : '');
            tagInput.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;margin-bottom:6px;border:1px solid #bbb;border-radius:8px;font-size:13px;color:#222;background:#fff';

            const after = document.createElement('textarea');
            after.value = u.entry;
            after.style.cssText = textareaCss;

            const count = el('div', 'text-align:right;font-size:12px;margin-top:2px');
            const updateCount = function () {
                const n = after.value.length;
                count.textContent = n + ' / ' + CONFIG.entryLimit;
                count.style.color = n > CONFIG.entryLimit ? '#c0392b' : '#777';
            };
            after.addEventListener('input', updateCount);
            updateCount();

            card.append(top);
            if (warnBox) card.append(warnBox);

            if (before) {
                const details = document.createElement('details');
                details.style.cssText = 'margin-bottom:8px';
                const summary = el('summary', 'color:#2d509e;font-size:13px', '変更前を見る');
                const old = document.createElement('textarea');
                old.readOnly = true;
                old.value = before.entry;
                old.style.cssText = textareaCss + ';background:#f4f4f4;color:#555';
                details.append(summary, old);
                card.append(details);
            }

            card.append(
                el('div', 'font-size:12px;color:#777', 'タグ'),
                tagInput,
                el('div', 'font-size:12px;color:#777', '変更後（手直しOK）'),
                after,
                count
            );

            ui.body.appendChild(card);
            rows.push({ i: u.i, check: check, tag: tagInput, entry: after });
        });

        ui.foot.append(
            panelButton('閉じる', '#777', closePanel),
            panelButton('チェックしたものを適用', '#cd2b5a', function () {
                const targets = rows.filter(function (r) { return r.check.checked; });
                if (!targets.length) {
                    toast('適用するものが選ばれていません', true);
                    return;
                }
                const over = targets.find(function (r) { return r.entry.value.length > CONFIG.entryLimit; });
                if (over) {
                    toast('#' + over.i + ' が' + CONFIG.entryLimit + '文字を超えています', true);
                    return;
                }

                const latest = {};
                readCharaBook().forEach(function (b) { latest[b.i] = b; });

                const backup = targets.map(function (r) {
                    const b = latest[r.i];
                    return { i: r.i, tag: b ? b.tag : '', entry: b ? b.entry : '' };
                });

                try {
                    targets.forEach(function (r) {
                        writeEntry(r.i, r.tag.value.trim(), r.entry.value.trim());
                    });
                    save(KEYS.backup, JSON.stringify({ time: Date.now(), items: backup }));
                    closePanel();
                    toast(targets.length + '件書き換えました✨');
                } catch (e) {
                    toast(e.message, true);
                }
            })
        );
    }

    function openManualPaste() {
        const ui = basePanel('Grokの返事を貼り付け');
        const area = document.createElement('textarea');
        area.placeholder = 'Grokの出力（コードブロックの中身）をここに貼ってね';
        area.style.cssText = textareaCss + ';min-height:260px';
        ui.body.appendChild(area);
        ui.foot.append(
            panelButton('閉じる', '#777', closePanel),
            panelButton('読み込む', '#cd2b5a', function () {
                const text = area.value;
                closePanel();
                openReview(text);
            })
        );
    }

    function undoLast() {
        let data = null;
        try {
            data = JSON.parse(load(KEYS.backup, '') || 'null');
        } catch (_) {
            data = null;
        }
        if (!data || !data.items || !data.items.length) {
            toast('戻せる履歴がありません', true);
            return;
        }
        const names = data.items.map(function (x) { return '#' + x.i + ' ' + x.tag; }).join('\n');
        if (!confirm('直前の書き換えを元に戻しますか？\n\n' + names)) return;

        try {
            data.items.forEach(function (x) { writeEntry(x.i, x.tag, x.entry); });
            save(KEYS.backup, '');
            toast('元に戻しました');
        } catch (e) {
            toast(e.message, true);
        }
    }

    function openMenu() {
        const ui = basePanel('キャラブック更新');
        const col = el('div', 'display:flex;flex-direction:column;gap:10px');
        col.append(
            panelButton('本文とキャラブックをGrokへ送る', '#2f6fd0', function () {
                closePanel();
                sendToGrok();
            }),
            panelButton('Grokの返事を手動で貼る', '#cd2b5a', openManualPaste),
            panelButton('直前の書き換えを元に戻す', '#8e44ad', function () {
                closePanel();
                undoLast();
            })
        );
        ui.body.appendChild(col);
        ui.foot.append(panelButton('閉じる', '#777', closePanel));
    }


    // =========================================================
    // 📥 AIのべりすと側：受信
    // =========================================================

    let lastNovelId = '';

    function receiveOnNovel(raw) {
        const p = parsePayload(raw);
        if (!p || p.id === lastNovelId) return;
        lastNovelId = p.id;
        save(KEYS.toNovel, '');
        openReview(p.text);
    }

    function installNovel() {
        floatingButton(P + 'novel_btn', '📖CB更新', '#cd2b5a', CONFIG.novelButtonBottom, openMenu);

        if (typeof GM_addValueChangeListener === 'function') {
            GM_addValueChangeListener(KEYS.toNovel, function (_n, _o, v, remote) {
                if (remote) receiveOnNovel(v);
            });
        }
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) receiveOnNovel(load(KEYS.toNovel, ''));
        });
        receiveOnNovel(load(KEYS.toNovel, ''));

        setInterval(checkRemind, REMIND.interval);
        setTimeout(checkRemind, 1500);
    }


    // =========================================================
    // 🤖 Grok側：受信して入力・送信
    // =========================================================

    function isVisible(e) {
        if (!e) return false;
        const s = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }

    function findGrokEditor() {
        const selectors = [
            'textarea[placeholder]',
            'textarea',
            '[contenteditable="true"][data-lexical-editor="true"]',
            '[contenteditable="true"].ProseMirror',
            '[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"]'
        ];
        const found = [];
        selectors.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (e) {
                if (isVisible(e) && !found.includes(e)) found.push(e);
            });
        });
        found.sort(function (a, b) {
            return b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom;
        });
        return found[0] || null;
    }

    function fillEditor(editor, text) {
        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            editor.focus();
            setNativeValue(editor, text);
            return;
        }
        editor.focus();
        const sel = getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        let ok = false;
        try {
            ok = document.execCommand('insertText', false, text);
        } catch (_) {
            ok = false;
        }
        if (!ok) {
            editor.textContent = text;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        sel.removeAllRanges();
    }

    function editorText(editor) {
        return String('value' in editor ? editor.value : (editor.innerText || '')).trim();
    }

    function pressEnter(editor) {
        ['keydown', 'keypress', 'keyup'].forEach(function (type) {
            try {
                editor.dispatchEvent(new KeyboardEvent(type, {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                }));
            } catch (_) { }
        });
    }

    function findSendButton(editor) {
        const selectors = [
            'button[type="submit"]',
            'button[aria-label*="送信"]',
            'button[aria-label*="Submit" i]',
            'button[aria-label*="Send" i]',
            'button[data-testid*="send" i]'
        ];
        const scopes = [];
        const form = editor.closest ? editor.closest('form') : null;
        if (form) scopes.push(form);
        scopes.push(document);

        for (const scope of scopes) {
            for (const sel of selectors) {
                const list = Array.from(scope.querySelectorAll(sel)).filter(function (b) {
                    return !b.disabled && b.getAttribute('aria-disabled') !== 'true' && isVisible(b);
                });
                if (list.length) return list[list.length - 1];
            }
        }
        return null;
    }

    function submit(editor) {
        if (!AUTO_SUBMIT.enabled) return;
        setTimeout(function () {
            const before = editorText(editor);
            const button = findSendButton(editor);
            if (button) {
                try { button.click(); } catch (_) { pressEnter(editor); }
            } else {
                pressEnter(editor);
            }
            setTimeout(function () {
                const now = editorText(editor);
                if (now && now === before) pressEnter(editor);
            }, AUTO_SUBMIT.verifyAfter);
        }, AUTO_SUBMIT.delay);
    }

    let lastGrokId = '';
    let receiving = false;

    async function receiveOnGrok(raw) {
        const p = parsePayload(raw);
        if (!p || p.id === lastGrokId || receiving) return;
        receiving = true;

        let editor = null;
        for (let k = 0; k < 40 && !editor; k++) {
            editor = findGrokEditor();
            if (!editor) await new Promise(function (r) { setTimeout(r, 250); });
        }

        if (!editor) {
            receiving = false;
            toast('受信しましたがGrokの入力欄が見つかりません', true);
            return;
        }

        try {
            fillEditor(editor, p.text);
            lastGrokId = p.id;
            save(KEYS.toGrok, '');
            toast('キャラブック更新の依頼を入力しました');
            submit(editor);
        } catch (e) {
            toast(e.message || String(e), true);
        } finally {
            receiving = false;
        }
    }

    function grokAnswerText() {
        // コードブロック優先：印の入った最新のもの
        const blocks = Array.from(document.querySelectorAll('pre code, pre'))
            .map(function (n) { return String(n.innerText || n.textContent || '').trim(); })
            .filter(Boolean);

        for (let k = blocks.length - 1; k >= 0; k--) {
            const t = blocks[k];
            if (/【更新[:：]\s*\d+\s*】/.test(t) || t.includes(NO_CHANGE)) {
                return t;
            }
        }

        // 保険：ページ全体から最後の開始印以降
        const all = String(document.body.innerText || '');
        const s = all.lastIndexOf(START);
        return s >= 0 ? all.slice(s) : '';
    }

    /*
     * Grokが回答を生成中か（停止ボタンが見えていれば生成中）
     */
    function isGrokGenerating() {
        const selectors = [
            'button[aria-label*="停止"]',
            'button[aria-label*="Stop" i]',
            'button[data-testid*="stop" i]'
        ];
        for (const sel of selectors) {
            const list = document.querySelectorAll(sel);
            for (const e of list) {
                if (isVisible(e)) return true;
            }
        }
        return false;
    }

    function sendBackToNovel() {
        if (isGrokGenerating()) {
            toast('Grokがまだ生成中です。終わってから押してね', true);
            return;
        }

        const text = grokAnswerText();
        const result = parseUpdates(text);

        if (!result.updates.length && !result.noChange) {
            toast('更新案が見つかりません（まだ生成中かも）', true);
            return;
        }

        try { GM_setClipboard(text, 'text'); } catch (_) { }

        save(KEYS.toNovel, makePayload(text));
        const moved = pokeMacroDroid(MACRODROID.backUrl);
        toast(
            (result.noChange ? '変更なし' : result.updates.length + '件') +
            (moved ? '　AIのべりすとへ戻ります' : '　AIのべりすとへ送りました')
        );
    }

    function installGrok() {
        floatingButton(P + 'grok_btn', '📖CB返送', '#cd2b5a', CONFIG.grokButtonBottom, sendBackToNovel);

        if (typeof GM_addValueChangeListener === 'function') {
            GM_addValueChangeListener(KEYS.toGrok, function (_n, _o, v, remote) {
                if (remote) receiveOnGrok(v);
            });
        }
        const check = function () { receiveOnGrok(load(KEYS.toGrok, '')); };
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) check();
        });
        window.addEventListener('focus', check);
        setInterval(check, 1500);
        check();
    }


    // =========================================================

    function start() {
        if (!document.body) {
            setTimeout(start, 300);
            return;
        }
        if (IS_AI_NOVEL) installNovel();
        if (IS_GROK) installGrok();
    }

    start();
})();
