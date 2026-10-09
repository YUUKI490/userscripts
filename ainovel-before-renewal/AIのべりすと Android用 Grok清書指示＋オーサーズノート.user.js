// ==UserScript==
// @name         AIのべりすと Android用 Grok清書指示＋オーサーズノート
// @namespace    local.ainovel.android.seisho
// @version      1.9.1
// @description  本文を読んで納得したら、ざっくり指示と本文をGrokまたはClaudeへ送り、オーサーズノート・洗脳状態一覧・清書した指示を作って戻します（作品ごとの保存・元に戻す・出力チェック・清書モード・指示履歴・キャラ設定つき。novel1の1枚本文欄にも対応。PC版2.11.0とプロンプト共通）
// @match        https://ai-novel.com/*
// @match        https://*.ai-novel.com/*
// @match        https://grok.com/*
// @match        https://*.grok.com/*
// @match        https://x.com/i/grok*
// @match        https://claude.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      trigger.macrodroid.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.9.1';

    console.info('[Seisho] 起動 v' + VERSION + ' @ ' + location.hostname);

    const P = 'ainovel_android_seisho_';

    const KEYS = {
        template: P + 'template',
        last: P + 'last_text',
        states: P + 'states',
        grokTransfer: P + 'grok_transfer',
        reverse: P + 'reverse_transfer',
        plan: P + 'plan',

        /*
         * 1.8.0 まで使っていた「前回の指示文」（作品ごと・1件）。
         * 1.9.0 からは history（作品ごと・3件）へ移し替えます。
         */
        lastInstruction: P + 'last_instruction',

        /*
         * 1.9.0 から作品タイトルごとに保存するもの
         */
        statesMap: P + 'states_by_title',
        lastMap: P + 'last_by_title',
        backupMap: P + 'backup_by_title',
        history: P + 'instruction_history',
        chars: P + 'chars_by_title',

        /*
         * 清書モードと送り先（作品共通）
         */
        mode: P + 'seisho_mode',
        target: P + 'ai_target'
    };


    // =========================================================
    // 📋 クリップボード設定
    // =========================================================

    const CLIPBOARD = {

        /*
         * false にすると、本文コピー時に
         * クリップボードへ一切残さず
         * Grokタブへの転送だけを行います。
         *
         * true に戻すと従来通りコピーもします。
         */
        useClipboard: false,

        /*
         * useClipboard が true のときに、
         * 何ミリ秒後にクリップボードを空にするか。
         * 0 にすると消さずに残します。
         */
        clearAfter: 0
    };


    // =========================================================
    // 🤖 指示の清書
    // =========================================================

    const SEISHO = {

        buttonText: '🤖 AIで清書',

        buttonId: P + 'seisho_button',

        planButtonId: P + 'plan_button',

        planPanelId: P + 'plan_panel',

        /*
         * 清書モードとキャラ設定のボタンを横に並べる行
         */
        toolRowId: P + 'tool_row',
        modeButtonId: P + 'mode_button',
        charsButtonId: P + 'chars_button',
        charsPanelId: P + 'chars_panel',

        /*
         * 清書された指示が戻ってきたとき、
         * 本文画面なら指示入力画面に切り替えるか
         */
        openInputAfterApply: true,

        /*
         * 全文送信になってしまうとき
         * （初回や大きな編集のあと）に送る
         * 最新ブロック数。0で全文のまま
         */
        fullBlockLimit: 3,

        /*
         * 前回送信後に本文が増えていないとき、
         * 本文の代わりに送る文
         */
        noNewText: '（前回送信後、本文の追加はありません。オーサーズ・ノートと洗脳状態一覧は現在のものを維持してください）'
    };


    // =========================================================
    // 📝 構想のひな形
    // =========================================================

    /*
     * 構想が空のとき、エディタに最初から入れておく見出しです。
     * 見出しの名前を変えたいときはここと
     * DEFAULT_TEMPLATE の中の見出し名を合わせて変えてください。
     */
    const PLAN_SKELETON = [
        '【目指すところ】',
        '・',
        '',
        '【段階】',
        '',
        '',
        '【守りたいこと】',
        '・',
        '',
        '【やらないこと】',
        '・'
    ].join('\n');


    /*
     * 1.8.0 までの見出しで保存された構想を、PC版と同じ見出しへ読み替えます。
     *   【これからの進み】        → 【目指すところ】
     *   【やってほしいことの順番】 → 【段階】
     *   【やってほしくない展開】   → 【やらないこと】
     * 【守りたいこと】が無ければ【やらないこと】の前に足します。
     */
    function migratePlanHeadings(text) {

        let t = String(text || '');

        if (
            t.indexOf('【これからの進み】') < 0 &&
            t.indexOf('【やってほしいことの順番】') < 0 &&
            t.indexOf('【やってほしくない展開】') < 0
        ) {
            return t;
        }

        t = t
            .split('【これからの進み】').join('【目指すところ】')
            .split('【やってほしいことの順番】').join('【段階】')
            .split('【やってほしくない展開】').join('【やらないこと】');

        if (t.indexOf('【守りたいこと】') < 0) {

            if (t.indexOf('【やらないこと】') >= 0) {
                t = t.replace('【やらないこと】', '【守りたいこと】\n・\n\n【やらないこと】');
            } else {
                t = t.replace(/\s+$/, '') + '\n\n【守りたいこと】\n・';
            }
        }

        return t;
    }


    /*
     * 見出しだけで中身が無いなら空とみなします
     */
    function isPlanEmpty(
        text
    ) {

        return !String(text || '')
            .replace(/【[^】]*】/g, '')
            .replace(/^[ \t]*[・\-][ \t]*$/gm, '')
            .trim();
    }


    // =========================================================
    // 🔀 MacroDroid連携（タブ切替）
    // =========================================================

    const MACRODROID = {

        /*
         * false にすると従来通り「転送するだけ」に戻ります
         */
        enabled: true,

        /*
         * MacroDroidのWebHook(URL)トリガーで発行されたURL。
         *
         * ⚠ このURLを知っている人は
         *    あなたの端末のマクロを発動できます。
         *    スクリプトを人に渡すときは必ず消してください。
         */
        url: 'https://trigger.macrodroid.com/7f73ce22-8c4c-4f0c-a986-c685962a403c/grok_switch',

        /*
         * Grok → AIのべりすと へ戻るときのURL。
         */
        backUrl: 'https://trigger.macrodroid.com/7f73ce22-8c4c-4f0c-a986-c685962a403c/ainovel_switch',

        /*
         * 送り先がClaudeのときに切り替えるURL。
         * 空のままならClaudeへは切り替えず、転送だけします。
         * MacroDroidにClaude用のマクロを作ったらここへ入れてください。
         */
        claudeUrl: '',

        /*
         * 転送してから何ミリ秒後に切り替えるか。
         */
        delay: 300,

        timeout: 5000
    };


    // =========================================================
    // ▶ Grok自動送信
    // =========================================================

    const AUTO_SUBMIT = {

        /*
         * false にすると貼り付けまでで止まります
         */
        enabled: true,

        /*
         * 貼り付けてから送信するまでの待ち時間(ms)
         */
        delay: 800,

        /*
         * 送信できたか確認するまでの待ち時間(ms)。
         * 入力欄が空にならなければEnterで再挑戦します。
         */
        verifyAfter: 1500
    };


    function isClickableButton(button) {

        if (!button || button.disabled) {
            return false;
        }

        if (button.getAttribute('aria-disabled') === 'true') {
            return false;
        }

        const rect = button.getBoundingClientRect();

        return rect.width > 0 && rect.height > 0;
    }


    function findGrokSendButton(editor) {

        const selectors = [
            'button[type="submit"]',
            'button[aria-label*="送信"]',
            'button[aria-label*="Submit" i]',
            'button[aria-label*="Send" i]',
            'button[data-testid*="send" i]'
        ];

        const scopes = [];

        const form =
            editor.closest
                ? editor.closest('form')
                : null;

        if (form) {
            scopes.push(form);
        }

        scopes.push(document);

        for (const scope of scopes) {

            for (const selector of selectors) {

                const list =
                    Array.prototype.slice
                        .call(scope.querySelectorAll(selector))
                        .filter(isClickableButton);

                if (list.length) {
                    /*
                     * 複数ある場合は
                     * 入力欄に近い後ろの方を採用
                     */
                    return list[list.length - 1];
                }
            }
        }

        return null;
    }


    function editorText(editor) {

        const raw =
            ('value' in editor)
                ? editor.value
                : (editor.innerText || editor.textContent || '');

        return String(raw).trim();
    }


    function pressEnter(editor) {

        const types = ['keydown', 'keypress', 'keyup'];

        for (const type of types) {

            try {

                editor.dispatchEvent(
                    new KeyboardEvent(type, {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    })
                );

            } catch (_) {
            }
        }
    }


    function submitGrok(editor) {

        /*
         * Claudeは利用規約上、自動送信しません。
         * 貼り付けまでで止めるので、送信ボタンは自分で押してください。
         */
        if (!AUTO_SUBMIT.enabled || IS_CLAUDE) {
            return;
        }

        setTimeout(function () {

            const before = editorText(editor);

            const button = findGrokSendButton(editor);

            if (button) {

                try {
                    button.click();
                } catch (error) {
                    console.warn('[AutoSubmit] click失敗', error);
                    pressEnter(editor);
                }

            } else {

                console.warn('[AutoSubmit] 送信ボタンが見つからないのでEnterを送ります');
                pressEnter(editor);
            }

            /*
             * 入力欄が空にならなければ
             * 送信できていないとみなして再挑戦
             */
            setTimeout(function () {

                const after = editorText(editor);

                if (after && after === before) {
                    console.warn('[AutoSubmit] 未送信とみなしてEnterを送ります');
                    pressEnter(editor);
                }

            }, AUTO_SUBMIT.verifyAfter);

        }, AUTO_SUBMIT.delay);
    }


    // =========================================================
    // 👁 現在の状態を確認
    // =========================================================

    const VIEWER = {
        buttonId: 'ainovel-state-view',
        panelId: 'ainovel-state-view-panel'
    };


    function closeViewer() {

        const panel = document.getElementById(VIEWER.panelId);

        if (panel) {
            panel.remove();
        }
    }


    function openViewer() {

        closeViewer();

        const note = authorsNote();

        const states =
            loadStates() ||
            '未保存';

        const panel = document.createElement('div');

        panel.id = VIEWER.panelId;

        panel.style.cssText = [
            'position:fixed',
            'left:8px',
            'right:8px',
            'top:8px',
            'bottom:8px',
            'z-index:2147483645',
            'display:flex',
            'flex-direction:column',
            'padding:12px',
            'border-radius:10px',
            'background:#23232b',
            'color:#eee',
            'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
            'font-size:14px'
        ].join(';');

        const header = document.createElement('div');

        header.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'margin-bottom:8px',
            'font-weight:bold'
        ].join(';');

        const title = document.createElement('span');

        title.textContent = '現在の状態：' + planTitle();

        const close = document.createElement('button');

        close.type = 'button';
        close.textContent = '閉じる';

        close.style.cssText = [
            'padding:7px 13px',
            'border:none',
            'border-radius:6px',
            'background:#44445a',
            'color:#eee',
            'font-size:13px'
        ].join(';');

        close.addEventListener('click', closeViewer);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px';

        /*
         * ↩ 置換前に戻す
         */
        if (loadBackup()) {

            const undo = document.createElement('button');
            undo.type = 'button';
            undo.textContent = '↩ 戻す（' + backupAgeLabel() + '）';
            undo.style.cssText = [
                'padding:7px 11px',
                'border:none',
                'border-radius:6px',
                'background:#8a5a2b',
                'color:#fff',
                'font-size:13px'
            ].join(';');

            undo.addEventListener('click', function () {
                restoreBackup();
                openViewer();
            });

            right.appendChild(undo);
        }

        right.appendChild(close);

        header.appendChild(title);
        header.appendChild(right);

        const body = document.createElement('div');

        body.style.cssText = [
            'flex:1',
            'overflow-y:auto',
            '-webkit-overflow-scrolling:touch'
        ].join(';');

        function section(labelText, content) {

            const label = document.createElement('div');

            label.textContent = labelText;

            label.style.cssText = [
                'margin:10px 0 4px',
                'font-size:12px',
                'opacity:0.75'
            ].join(';');

            const box = document.createElement('div');

            box.textContent = content;

            box.style.cssText = [
                'padding:9px',
                'border-radius:6px',
                'background:#16161c',
                'font-size:13px',
                'line-height:1.6',
                'white-space:pre-wrap',
                'word-break:break-word'
            ].join(';');

            body.appendChild(label);
            body.appendChild(box);
        }

        section('洗脳状態一覧', states);
        section('オーサーズ・ノート', note);
        section('前回までの指示文', instructionHistoryText());
        section('登場人物の基本設定', loadChars() || '未設定');

        panel.appendChild(header);
        panel.appendChild(body);

        document.body.appendChild(panel);
    }


    function installViewerButton() {

        if (
            !IS_AI_NOVEL ||
            document.getElementById(VIEWER.buttonId)
        ) {
            return;
        }

        const button = document.createElement('button');

        button.id = VIEWER.buttonId;
        button.type = 'button';
        button.textContent = '状態確認';

        button.style.cssText = [
            'position:fixed',
            'left:10px',
            'bottom:150px',
            'z-index:2147483630',
            'padding:10px 14px',
            'border:none',
            'border-radius:20px',
            'background:#6a5acd',
            'color:#fff',
            'font-size:13px',
            'font-weight:bold',
            'box-shadow:0 2px 10px rgba(0,0,0,0.4)'
        ].join(';');

        button.addEventListener('click', openViewer);

        document.body.appendChild(button);
    }


    // =========================================================
    // ⬅ Grok → AIのべりすと 逆方向転送
    // =========================================================

    const REVERSE = {

        /*
         * false にするとボタンはコピーのみ行い、
         * AIのべりすとへは送りません。
         */
        enabled: true,

        /*
         * 拾うコードブロックの数
         */
        blockCount: 4,

        /*
         * 古い転送を無視する時間(ms)
         */
        maxAge: 2 * 60 * 1000,

        buttonId: P + 'reverse_button'
    };


    let lastReverseId = '';


    function collectGrokBlocks() {

        let nodes =
            Array.prototype.slice.call(
                document.querySelectorAll('pre code')
            );

        if (!nodes.length) {
            nodes =
                Array.prototype.slice.call(
                    document.querySelectorAll('pre')
                );
        }

        const texts = [];

        nodes.forEach(function (node) {

            const text =
                String(node.innerText || node.textContent || '').trim();

            if (text) {
                texts.push(text);
            }
        });

        return texts;
    }


    function buildReverseText() {

        const all = collectGrokBlocks();

        if (!all.length) {
            return null;
        }

        /*
         * 末尾から必要数だけ。
         * 会話を重ねても常に最新の回答が対象です。
         */
        return all
            .slice(-REVERSE.blockCount)
            .map(function (text) {
                return '```\n' + text + '\n```';
            })
            .join('\n\n');
    }


    function sendToAiNovel(text) {

        save(
            KEYS.reverse,
            createTransferPayload(text)
        );
    }


    function installReverseButton() {

        if (
            !IS_CHAT ||
            document.getElementById(REVERSE.buttonId)
        ) {
            return;
        }

        const button = document.createElement('button');

        button.id = REVERSE.buttonId;
        button.type = 'button';
        button.textContent = '4ブロック送信';

        button.style.cssText = [
            'position:fixed',
            /*
             * Claudeは入力欄が大きいので少し上に出します
             */
            'bottom:' + (IS_CLAUDE ? '220px' : '150px'),
            'right:12px',
            'z-index:2147483640',
            'padding:11px 15px',
            'border:none',
            'border-radius:22px',
            'background:#2f6fd0',
            'color:#fff',
            'font-size:13px',
            'font-weight:bold',
            'box-shadow:0 2px 10px rgba(0,0,0,0.4)'
        ].join(';');

        button.addEventListener('click', function () {

            const text = buildReverseText();

            if (!text) {
                grokToast('コードブロックが見つかりません', true);
                return;
            }

            /*
             * クリップボードにも入れておきます。
             *
             * CLIPBOARD.useClipboard が false でも、
             * 逆転送が無効なときは貼る手段が
             * なくなるのでコピーします。
             */
            if (
                CLIPBOARD.useClipboard ||
                !REVERSE.enabled
            ) {

                try {
                    GM_setClipboard(text, 'text');
                } catch (_) {
                }

                scheduleClipboardClear();
            }

            if (REVERSE.enabled) {

                sendToAiNovel(text);

                /*
                 * AIのべりすとタブへ戻ります
                 */
                const back = pokeMacroDroid(MACRODROID.backUrl);

                grokToast(
                    back
                        ? 'AIのべりすとへ送信して戻ります'
                        : 'AIのべりすとへ送信しました'
                );

            } else {

                grokToast('コピーしました');
            }
        });

        document.body.appendChild(button);
    }


    /*
     * 貼り付け後に本文の1つ上のブロックへ移動します。
     * 「本文ブロック上下ジャンプ」の上ボタンを
     * そのまま押しているだけなので、
     * あちらが無ければ何も起きません。
     */

    const JUMP = {

        enabled: true,

        buttonId: 'ainovel-block-jump-up',

        /*
         * 貼り付けからボタンを押すまでの待ち時間(ms)
         */
        delay: 400
    };


    function jumpUpAfterApply() {

        if (!JUMP.enabled) {
            return;
        }

        setTimeout(function () {

            const button = document.getElementById(JUMP.buttonId);

            if (!button) {
                console.warn('[Jump] 上ボタンが見つかりません');
                return;
            }

            try {
                button.click();
            } catch (error) {
                console.warn('[Jump]', error);
            }

        }, JUMP.delay);
    }


    function receiveReverse(raw) {

        if (!IS_AI_NOVEL) {
            return;
        }

        const payload = parseTransferPayload(raw);

        if (
            !payload ||
            payload.id === lastReverseId
        ) {
            return;
        }

        if (
            Date.now() - Number(payload.time) >
            REVERSE.maxAge
        ) {
            return;
        }

        lastReverseId = payload.id;

        try {

            const parsed = applyAiOutput(payload.text);

            /*
             * 指示が戻ってきたときは
             * 本文はもう読んでいるのでジャンプしません
             */
            if (!parsed || !parsed.instruction) {
                jumpUpAfterApply();
            }

        } catch (error) {

            toast(error.message || String(error), true);
        }
    }


    function installReverseReceiver() {

        if (!IS_AI_NOVEL) {
            return;
        }

        if (typeof GM_addValueChangeListener === 'function') {

            GM_addValueChangeListener(
                KEYS.reverse,
                function (_name, _oldValue, newValue, remote) {
                    if (remote) {
                        receiveReverse(newValue);
                    }
                }
            );
        }

        /*
         * 裏に回っている間に届いた分を
         * 戻ってきたときに拾います
         */
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                receiveReverse(load(KEYS.reverse, ''));
            }
        });

        receiveReverse(load(KEYS.reverse, ''));
    }


    // =========================================================
    // 🧠 洗脳状態の共有
    // =========================================================

    /*
     * GM_setValue の領域は
     * ユーザースクリプトごとに分離されているため、
     * キャラ画像スクリプトからは読めません。
     * 同じ内容を localStorage にも複製して
     * 他のスクリプトから参照できるようにします。
     */

    const SHARED_STATES_KEY = 'ainovel_brainwash_states';


    function mirrorStates(text) {

        try {
            localStorage.setItem(
                SHARED_STATES_KEY,
                String(text || '').trim()
            );
        } catch (error) {
            console.warn('[States] 共有に失敗', error);
        }
    }


    function pokeMacroDroid(targetUrl) {

        const url = targetUrl || MACRODROID.url;

        if (
            !MACRODROID.enabled ||
            url.includes('ここにデバイスID')
        ) {
            return false;
        }

        if (typeof GM_xmlhttpRequest !== 'function') {
            console.warn('[MacroDroid] GM_xmlhttpRequest が使えません');
            return false;
        }

        /*
         * 投げっぱなしで構いません。
         * 応答を待つとタブ切替が遅れるだけです。
         */
        setTimeout(function () {

            try {

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: MACRODROID.timeout,
                    onerror: function (e) {
                        console.warn('[MacroDroid] 送信失敗', e);
                    },
                    ontimeout: function () {
                        console.warn('[MacroDroid] タイムアウト');
                    }
                });

            } catch (error) {
                console.warn('[MacroDroid]', error);
            }

        }, MACRODROID.delay);

        return true;
    }

    const DEFAULT_TEMPLATE =
`以下の小説本文を最後まで読み、AIのべりすとの「脚注／オーサーズ・ノート」に貼り付ける文章と、現在の洗脳状態一覧と、次の本文を生成するための指示文を作成してください。

【作成目的】

本文の続きを考案するのではなく、本文末尾時点で確定している現在の状況と、各キャラクターの状態をAIへ正確に認識させるためのオーサーズ・ノートを作成してください。

未来の展開を書かないルールは、オーサーズ・ノートと洗脳状態一覧だけに適用されます。次の展開は、三つ目の指示文にだけ書いてください。

【オーサーズ・ノートの必須ルール】

・次に起こる展開、今後の予想、展望、伏線の予測、物語を進めるための指示は書かないでください。

・「次に○○する」「○○する可能性がある」「このあと○○を狙う」など、本文でまだ実行されていない未来の行動は書かないでください。

・本文に明記されていない設定、心理、能力、目的、行動を推測して追加しないでください。

・本文の途中ではなく、必ず本文末尾時点の最新状態を基準にしてください。

・途中で状態が変化した人物については、古い状態を残さず、本文末尾時点の最新状態へ置き換えてください。

・既存のオーサーズ・ノートが添付されている場合は、その内容を基礎にしながら、本文と矛盾する古い情報を削除または修正してください。

・現在の場面に登場している人物、現在の状況へ直接関係する人物、直前に状態が変化した人物を対象にしてください。現在の場面と関係のない人物まで並べる必要はありません。

・各人物について、本文から確認できる範囲で「現在地」「身体状態」「精神状態」「洗脳などの特殊状態」「所属と敵味方」「変身状態」「所持装備」「使用可能な能力」「拘束や負傷」「現在行っている行動」「ほかの人物との関係や認識」を整理してください。

・洗脳、変身、拘束、負傷、能力の消耗、装備の破損、位置の移動、敵味方の変化など、現在の行動へ影響する変化を優先的に記載してください。

・すでに終了した行動を、現在も続いているように書かないでください。

・人物が言ったセリフ、命令、叫び、呟きは、一度きりの出来事として扱い、「〜と命じている」「〜と繰り返している」「〜と呟いている」のように現在も続いている行動として書かないでください。必要な場合は、その結果として残った状態（例：命令に従って全員が下がっている）だけを書いてください。

・前回のオーサーズ・ノートから変化のない人物は、現在地と装備と特殊状態が分かる一文だけに短くしてください。

・「洗脳されていない」は書かないでください。洗脳の有無は洗脳状態一覧で判断します。

・【登場人物の基本設定】が書かれている場合、それは各人物の元の状態を示す参照用の資料です。基本設定と同じままの装備、能力、口調、役割、関係はオーサーズ・ノートに書かず、基本設定から変化した点だけを書いてください。基本設定の文章をオーサーズ・ノートへ写さないでください。

・現在の場面に関係しなくなった物や情報（倒した魔物の死骸、わずかな消耗など）は削除してください。

・人物が移動した場合は以前の位置を残さず、本文末尾時点の位置だけを書いてください。

・作戦や命令が変更された場合は、以前の作戦を残さず、現在有効な作戦だけを書いてください。

・洗脳された人物については、元の人格、記憶、口調、知識、能力、人間関係のうち、何が維持され、どの価値観や目的が変化したのかを本文に基づいて明記してください。

・洗脳された人物を、無感情な操り人形として扱わないでください。本文で元の人格や感情が維持されている場合は、その状態を正確に記載してください。

・洗脳された本人に洗脳の自覚があるか、自分の意思だと認識しているかについても、本文で判明している場合は記載してください。

・感想、解説、本文への評価、誤字の指摘、改善案は書かないでください。

・情報を細かな単語の羅列にせず、人物ごとに意味の通る自然な文章でまとめてください。

・AIのべりすとの本文生成を圧迫しないよう、必要な情報を落とさない範囲で簡潔にしてください。

【オーサーズ・ノートの出力形式】

・最初に、オーサーズ・ノートへそのまま貼り付けられる内容をコードブロックで出力してください。

・すべての情報を半角の角括弧「[]」で囲ってください。

・最初に現在の場所、時間、事件、戦況など、場面全体の現状を書いてください。

・その後に、現在の状況へ関係するキャラクターの状態を一人ずつ書いてください。

・複数人を一つの文章にまとめず、状態が異なる人物は一人ずつ分けてください。

・最後にも、次の展開、展望、予想、執筆指示を追加しないでください。

【洗脳状態一覧の判定ルール】

・オーサーズ・ノートの後に、本文末尾時点の「洗脳状態一覧」を別のコードブロックで必ず出力してください。

・本文末尾時点で洗脳が完全に成立し、その状態が継続している名前付きキャラクターを全員記載してください。

・過去に洗脳された人物ではなく、現在も洗脳状態にある人物だけを記載してください。

・洗脳の途中、軽い影響、疑い、抵抗中、未確定状態の人物は記載しないでください。

・洗脳が解除された人物は一覧から削除してください。

・本文中に現在登場していなくても、既存のオーサーズ・ノートや本文から洗脳状態の継続が確定している名前付きキャラクターは一覧に残してください。

・本文に解除された記述がないという理由だけで、洗脳状態を勝手に解除しないでください。

・反対に、明確な洗脳完了の記述がない人物を推測で追加しないでください。

・洗脳以外の魅了、寄生、催眠、服従、人格改変などは、本文または設定で「洗脳状態として扱う」と明示されている場合だけ一覧へ追加してください。

【洗脳状態一覧の固定書式】

・表記は必ず「キャラクター名=洗脳状態」に統一してください。

・キャラクター名には、本文のセリフ前や通常の呼称として使われている名前を使用してください。

・「完全洗脳」「洗脳済み」「敵対状態」「服従状態」など、別の表現へ変更しないでください。

・一人につき一行で記載してください。

・行頭に箇条書き記号、番号、空白を付けないでください。

・名前と「=」と「洗脳状態」の間に空白を入れないでください。

・括弧、説明、理由、状態の詳細を追加しないでください。

・コードブロック内に「洗脳状態一覧」などの見出しを入れないでください。

・洗脳状態の人物が一人もいない場合は「洗脳状態なし」とだけ記載してください。

【指示文の作成ルール】

・指示文は、AIのべりすとの指示入力欄に入れて、次の本文を生成させるための文章です。
・下の【ユーザーのざっくり指示】が書かれている場合は、その内容と意図を変えずに、AIのべりすとが理解しやすい指示文に清書してください。
・ユーザーが書いていない大きな出来事、決着、新しい人物、新しい設定を足さないでください。足りない部分は、本文末尾の状況とオーサーズ・ノートに合わせて、自然につながる程度に補ってください。
・ユーザーの指示に誤字や言い間違いがある場合は、意図をくみ取って直してください。
・誰が、誰に、何をするのかをはっきり書いてください。人物名は本文のセリフ前に使われている名前を使ってください。【登場人物の基本設定】がある場合は、そこに書かれた名前を使ってください。
・人物の口調や役割は、【登場人物の基本設定】に合わせてください。
・洗脳状態の人物は、その状態に合った言動になるように書いてください。
・【作者の構想】が書かれている場合は、下の【作者の構想の読み方】に従って、今回進めるべき段階を一つだけ選び、その段階を一場面分だけ進める指示文にしてください。それより先の段階を先取りしないでください。
・一つの段階が一場面で終わらない場合は、その段階の途中まででかまいません。無理に終わらせないでください。
・【ユーザーのざっくり指示】と【作者の構想】の両方がある場合は、ざっくり指示の内容を清書し、構想と矛盾しないように細部を補ってください。両者が食い違う場合は、ざっくり指示を優先してください。
・【作者の構想】の【守りたいこと】と【やらないこと】に書かれた内容は必ず守ってください。
・【ユーザーのざっくり指示】が「なし」の場合は、構想があれば構想に沿って、構想もなければ本文末尾から自然に続く次の展開を一つ考えて、その指示文を書いてください。すでに起きた出来事を繰り返したり、物語を急に終わらせたりしないでください。
・【作者の構想】の内容は指示文を作るためだけに使い、オーサーズ・ノートと洗脳状態一覧には書かないでください。
・指示文は一つの場面分、200文字前後の自然な文章にしてください。箇条書き、見出し、半角の角括弧「[]」は使わないでください。
・下の【清書モード】に指定がある場合は、その指定を上のルールより優先してください。

【指示文をワンパターンにしないためのルール】

・【前回までの指示文】は、すでに使った指示です。それと同じ出来事、同じ言い回し、同じ文の組み立て、同じ締め方を使わないでください。書き方や構成を真似しないでください。
・【やらないこと】や、オーサーズ・ノートにすでに書かれている継続中の方針や禁止事項（扉を開けない、洗脳を解かない、触れずに下がる等）は、指示文を作るときに守るだけにして、指示文の中には書かないでください。この場面で新しく必要になった制限だけを書いてください。
・「〜はしない」「〜は解かない」のような禁止の文で指示文を締めくくらないでください。最後の一文は、この場面で特に印象的に描いてほしい瞬間か、場面の行き着く先にしてください。
・直前の本文と同じ終わり方にならないようにしてください。同じ人物が同じものを眺めて決意する、同じ台詞で締める、などの終わり方が本文で続いている場合は、別の人物、別の場所、別の出来事で場面を終える指示にしてください。
・指示文で動かす人物は、今回の出来事の中心になる二〜三人に絞ってください。直前の本文ですでに描かれた脇役の反応（叫ぶ、制止する、立ち尽くす、涙ぐむ等）を、もう一度させないでください。
・洗脳されていない人物を登場させる場合は、前回やオーサーズ・ノートと同じ状態のまま並べず、少なくとも一人には前回と違う行動、発言、気持ちの変化を与えてください。ただし決着や洗脳の解除につながる大きな出来事にはしないでください。
・毎回、場面の焦点を変えてください。会話、五感の描写、特定の人物の心の中、周囲や空間の変化などから、前回と違うものを選んでください。
・「口調を残したまま」「自覚はない」のような決まり文句を使わず、その人物らしい具体的なセリフの調子や仕草で書いてください。

【作者の構想の読み方】

・【作者の構想】は、次の四つの見出しで区切られています。

　【目指すところ】……物語が最終的に向かう先
　【段階】……そこへ至るまでの順番
　【守りたいこと】……必ず守る決まり
　【やらないこと】……絶対に書かない内容

・「段階の行」とは、【段階】の見出しより下にあり、次の見出し（【 で始まる行）より前にある行のうち、空行でなく、「・」や「-」で始まらない行のことです。一行が一つの段階です。
・段階の行の先頭には①②③などの番号が付いていることがあります。番号は段階の順番を表します。
・段階の行の先頭に「✅」が付いている場合、その段階は本文ですでに完了しています。
・【目指すところ】【守りたいこと】【やらないこと】の下の行は段階ではありません。
・「✅」が付いていない段階の行のうち、一番上にあるものが、今回進めるべき段階です。

【構想の進み具合の作り方】

・四つ目のコードブロックには、【作者の構想】を一字一句そのまま写してください。見出しの行、番号、「・」で始まる行、空行も、すべて元のまま残してください。
・そのうえで、本文末尾の時点で完了したと言える段階の行だけ、先頭に「✅」を付け足してください。
・「✅」を付けてよいのは段階の行だけです。見出しの行や「・」で始まる行には決して付けないでください。
・「✅」は番号より前に付けてください。例：「②千束とエミリアが堕ちる」→「✅②千束とエミリアが堕ちる」
・すでに「✅」が付いている行は、そのまま「✅」を残してください。
・段階を追加したり削除したり、文章や番号を書き換えたり、順番を変えたりしないでください。付け足すのは「✅」だけです。
・本文で確実に完了したと言える段階だけに付けてください。進行中の段階には付けないでください。
・今回完了した段階が一つも無い場合は、【作者の構想】をそのまま写すだけにしてください。
・【作者の構想】が「なし」の場合は、四つ目のコードブロックに「なし」とだけ書いてください。

【最終的な出力順序】

次の四つのコードブロックだけを、以下の順番で出力してください。コードブロックの前後に説明や感想を付けないでください。

一つ目：オーサーズ・ノート

二つ目：洗脳状態一覧

三つ目：指示文

四つ目：進み具合を付けた構想

【出力例】
\`\`\`css
[現在は朝の市央区中央公園。ガンブレイバーズとヒップノティストが交戦しており、一般市民の避難はまだ完了していない。]

[雷花：ヒップノティストの能力で完全に洗脳されている。元の明るい性格、口調、記憶、仲間への親愛、変身状態、装備、戦闘能力は維持しているが、お尻の笑顔を広めることを正しく幸福な行為だと信じている。]

[若葉：公園北側で一般市民を保護しながら雷花を警戒している。負傷はなく、リーフ・ヒーラーとバインド弾を使用できる。]
\`\`\`
\`\`\`
雷花=洗脳状態
焔=洗脳状態
\`\`\`
\`\`\`
雷花は明るい口調のまま、避難中の市民へお尻の笑顔を広めようと近づく。若葉は市民の前に立ちはだかって雷花を止めようとするが、雷花は仲間への親しみを込めて若葉を説得しようとする。
\`\`\`
\`\`\`
【目指すところ】
・ガンブレイバーズが次々に洗脳され、若葉だけが取り残される

【段階】
✅①雷花が洗脳される
②焔が洗脳される
③若葉が一人になる

【守りたいこと】
・洗脳されても元の口調と戦闘能力はそのまま残る

【やらないこと】
・若葉は洗脳されない
\`\`\`

【登場人物の基本設定】

{キャラ設定}

【現在使用中のオーサーズ・ノート】

{現在のオーサーズノート}

【前回の洗脳状態一覧】

{前回の洗脳状態一覧}

【更新された小説本文】

{本文}

【作者の構想】

{作者の構想}

【前回までの指示文】

{前回までの指示文}

【ユーザーのざっくり指示】

{ざっくり指示}

【清書モード】

{清書モード}`;


    const ids = {
        copy: P + 'copy',
        copyLast: P + 'copy_last',
        importNote: P + 'import_note',
        importPanel: P + 'import_panel',
        notice: P + 'notice',
        target: P + 'target_button'
    };


    const HOST = location.hostname;

    const IS_AI_NOVEL =
        HOST === 'ai-novel.com' ||
        HOST.endsWith('.ai-novel.com');

    const IS_GROK =
        HOST === 'grok.com' ||
        HOST.endsWith('.grok.com') ||
        (
            HOST === 'x.com' &&
            location.pathname.startsWith('/i/grok')
        );

    const IS_CLAUDE =
        HOST === 'claude.ai';

    /*
     * 清書を受け取る側のAI（GrokかClaude）
     */
    const IS_CHAT =
        IS_GROK || IS_CLAUDE;

    const GROK_TRANSFER_MAX_AGE = 2 * 60 * 1000;

    let receivingTransfer = false;

    let lastReceivedTransferId = '';


    function load(key, fallback) {

        try {
            return GM_getValue(key, fallback);
        } catch (_) {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
        }
    }


    function save(key, value) {

        try {
            GM_setValue(key, value);
        } catch (_) {
            localStorage.setItem(key, value);
        }
    }


    function nodeText(node) {

        const value =
            ('value' in node)
                ? node.value
                : (node.innerText || node.textContent || '');

        return String(value)
            .replace(/\r\n?/g, '\n')
            .trim();
    }


    /*
     * novel1形式などで、本文がブロックに分かれず
     * 1枚の入力欄（#data_edit）に入っているときの読み取りです。
     * チャットアイコン（[＃ユーザー]／[＃アシスタント]）で区切り、
     * ユーザーの指示部分は除いて本文だけを返します。
     */
    function editorParts() {

        const root = document.querySelector('#data_container');

        const editor =
            (root && root.querySelector('#data_edit, .data_edit')) ||
            document.getElementById('data_edit');

        if (!editor) {
            return [];
        }

        const parts = [];

        let role = 'plaintext';
        let buffer = '';

        const flush = function () {

            const text = buffer
                .replace(/\r\n?/g, '\n')
                .replace(/\u00a0/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            if (text && role !== 'user') {
                parts.push(text);
            }

            buffer = '';
        };

        const walk = function (node) {

            node.childNodes.forEach(function (child) {

                if (child.nodeType === 3) {
                    buffer += child.data;
                    return;
                }

                if (child.nodeType !== 1) {
                    return;
                }

                const tag = child.tagName;

                if (tag === 'BR') {
                    buffer += '\n';
                    return;
                }

                if (tag === 'IMG') {

                    if (child.classList.contains('chat_icon')) {

                        flush();

                        const alt = child.getAttribute('alt') || '';

                        role =
                            alt.indexOf('ユーザー') >= 0
                                ? 'user'
                                : 'assistant';
                    }

                    return;
                }

                const block = /^(DIV|P)$/.test(tag);

                if (block && buffer && !buffer.endsWith('\n')) {
                    buffer += '\n';
                }

                walk(child);

                if (block && !buffer.endsWith('\n')) {
                    buffer += '\n';
                }
            });
        };

        walk(editor);
        flush();

        return parts;
    }


    /*
     * 本文ブロック（指示ブロック .data_edit.user は除く）の文字列一覧
     */
    function novelParts() {

        const root = document.querySelector('#data_container');

        if (!root) {
            throw new Error('本文欄が見つかりません');
        }

        const blocks = Array.from(
            root.querySelectorAll(
                '.data_edit.plaintext, ' +
                '.data_edit.assistant, ' +
                '.data_edit.Assistant'
            )
        )
            .map(nodeText)
            .filter(Boolean);

        if (blocks.length) {
            return blocks;
        }

        /*
         * ブロックが無いとき（novel1の1枚本文欄）は
         * 1枚の入力欄から読み取ります
         */
        return editorParts();
    }


    function novelText() {

        const parts = novelParts();

        if (!parts.length) {
            throw new Error('コピーできる本文が見つかりません');
        }

        return parts.join('\n\n');
    }


    /*
     * 本文欄の最新のブロックをまとめて返します。
     */
    function lastBlocksText(count) {

        return novelParts()
            .slice(-count)
            .join('\n\n');
    }


    /*
     * 本文欄のいちばん最後のブロックだけを返します。
     */
    function lastBlockText() {

        const parts = novelParts();

        if (!parts.length) {
            throw new Error('コピーできる本文が見つかりません');
        }

        return parts[parts.length - 1];
    }


    function authorsNoteField() {

        const selectors = [
            '#authorsnote',
            '#authors_note',
            'textarea[name="authorsnote"]',
            'textarea[name="authors_note"]'
        ];

        for (const selector of selectors) {

            const field = document.querySelector(selector);

            if (field) {
                return field;
            }
        }

        return null;
    }


    function authorsNote() {

        const field = authorsNoteField();

        return field
            ? (nodeText(field) || 'なし')
            : 'なし';
    }


    function replaceAuthorsNote(text) {

        const field = authorsNoteField();

        if (!field) {
            throw new Error('オーサーズノート欄が見つかりません');
        }

        if ('value' in field) {

            const descriptor =
                Object.getOwnPropertyDescriptor(
                    Object.getPrototypeOf(field),
                    'value'
                );

            if (descriptor && descriptor.set) {
                descriptor.set.call(field, text);
            } else {
                field.value = text;
            }

        } else {

            field.textContent = text;
        }

        try {
            field.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    inputType: 'insertText',
                    data: null
                })
            );
        } catch (_) {
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }

        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
    }


    function parseAiOutput(raw) {

        const text =
            String(raw || '')
                .replace(/\r\n?/g, '\n')
                .trim();

        if (!text) {
            throw new Error('貼り付ける文章が空です');
        }

        const blocks = [];

        const pattern = /```[^\n]*\n([\s\S]*?)```/g;

        let match;

        while ((match = pattern.exec(text)) !== null) {
            blocks.push(match[1].trim());
        }

        return {
            count: blocks.length,
            note: (blocks[0] || text).trim(),
            states: blocks.length >= 2 ? blocks[1].trim() : '',
            instruction: blocks.length >= 3 ? blocks[2].trim() : '',
            plan: blocks.length >= 4 ? blocks[3].trim() : ''
        };
    }


    // =========================================================
    // ✅ 出力のチェック
    // =========================================================

    const CHECK = {
        /*
         * オーサーズノートに入っていたら怪しい言葉
         */
        futureWords: [
            '次に', '今後', 'これから', '可能性がある',
            '展望', '予想', 'だろう', '狙う', '予定'
        ]
    };


    function isValidStates(text) {

        const body = String(text || '').trim();

        if (body === '洗脳状態なし') {
            return true;
        }

        return body.split('\n').every(function (line) {
            return /^[^\s=（(]+=洗脳状態$/.test(line.trim());
        });
    }


    function checkAiOutput(parsed) {

        const warnings = [];

        if (parsed.count < 4) {
            warnings.push('コードブロックが' + parsed.count + '個しかありません（4個必要）');
        }

        if (parsed.states && !isValidStates(parsed.states)) {
            warnings.push('洗脳状態一覧の書式が崩れています');
        }

        const found = CHECK.futureWords.filter(function (word) {
            return parsed.note.indexOf(word) >= 0;
        });

        if (found.length) {
            warnings.push('ノートに未来を書く言葉：' + found.join('、'));
        }

        return warnings;
    }


    function applyAiOutput(raw) {

        const parsed = parseAiOutput(raw);
        const warnings = checkAiOutput(parsed);

        /*
         * 置換前の状態を1回分だけ取っておきます
         */
        saveBackup(authorsNoteRaw(), loadStates());

        replaceAuthorsNote(parsed.note);

        const statesOk = parsed.states && isValidStates(parsed.states);

        if (statesOk) {
            saveStates(parsed.states);
        }

        if (parsed.instruction) {
            setInstruction(parsed.instruction);
            pushInstructionHistory(parsed.instruction);
        }

        const done = ['オーサーズノートを置換'];

        if (statesOk) {
            done.push('洗脳状態一覧を保存');
        }

        if (parsed.instruction) {
            done.push('清書した指示を入力');
        }

        /*
         * 構想に✅が付いて戻ってきたら確認画面
         */
        const newPlan = String(parsed.plan || '').trim();

        if (
            newPlan &&
            newPlan !== 'なし' &&
            newPlan !== loadPlan()
        ) {

            done.push('構想の進み具合を確認');

            setTimeout(function () {
                openPlanEditor(newPlan);
            }, 600);
        }

        if (warnings.length) {

            /*
             * 警告があるときは赤で長めに出します。
             * 変だったら「状態確認」→「戻す」で戻せます。
             */
            toast(
                '⚠ ' + warnings.join(' ／ ') + '（変なら「状態確認」から戻せます）',
                true,
                9000
            );

        } else {

            toast(done.join('・') + 'しました');
        }

        return parsed;
    }


    // =========================================================
    // ✍ 指示入力欄
    // =========================================================

    function roughInstruction() {

        const fake = document.getElementById('qp-full-input');

        if (
            fake &&
            document.body.classList.contains('qp-full-active')
        ) {
            return String(fake.value || '').trim();
        }

        const real = document.getElementById('chat_field');

        return real
            ? String(real.value || '').trim()
            : '';
    }


    function setInstruction(text) {

        const real = document.getElementById('chat_field');

        if (!real) {
            throw new Error('指示入力欄（chat_field）が見つかりません');
        }

        const desc =
            Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(real),
                'value'
            );

        if (desc && desc.set) {
            desc.set.call(real, text);
        } else {
            real.value = text;
        }

        real.dispatchEvent(new Event('input', { bubbles: true }));
        real.dispatchEvent(new Event('change', { bubbles: true }));

        /*
         * 全画面入力の欄にも入れておきます
         */
        const fake = document.getElementById('qp-full-input');

        if (fake) {
            fake.value = text;
        }

        /*
         * 全画面で本文画面を表示中なら指示入力画面へ
         */
        if (
            SEISHO.openInputAfterApply &&
            document.body.classList.contains('qp-full-active') &&
            document.body.classList.contains('qp-text-mode')
        ) {

            const sw = document.getElementById('qp-full-switch');

            if (sw) {

                setTimeout(function () {

                    sw.click();

                    if (fake) {
                        fake.value = text;
                    }

                }, 300);
            }
        }
    }


    // =========================================================
    // 🗂 作品タイトルごとの保存
    // =========================================================

    /*
     * 洗脳状態一覧・前回本文・バックアップ・指示履歴は、
     * 作品タイトル（#data_title）ごとに分けて保存します。
     * 作品を切り替えても別作品の一覧が混ざりません。
     */
    function loadTitledMap(key) {
        try {
            const map = JSON.parse(load(key, '') || '{}');
            return map && typeof map === 'object' ? map : {};
        } catch (_) {
            return {};
        }
    }


    function loadTitled(key) {
        const value = loadTitledMap(key)[planTitle()];
        return typeof value === 'string' ? value : '';
    }


    function saveTitled(key, value) {

        const map = loadTitledMap(key);
        const text = String(value || '');

        if (text) {
            map[planTitle()] = text;
        } else {
            delete map[planTitle()];
        }

        save(key, JSON.stringify(map));
    }


    function loadStates() {
        return loadTitled(KEYS.statesMap).trim();
    }


    function saveStates(text) {
        saveTitled(KEYS.statesMap, String(text || '').trim());
        mirrorStates(text);
    }


    function loadLast() {
        return loadTitled(KEYS.lastMap);
    }


    function saveLast(text) {
        saveTitled(KEYS.lastMap, text);
    }


    // =========================================================
    // ↩ 置換前のバックアップ
    // =========================================================

    /*
     * オーサーズノート欄の生の中身。
     * authorsNote() は空だと「なし」を返すので別に用意しています。
     */
    function authorsNoteRaw() {
        const field = authorsNoteField();
        return field ? nodeText(field) : '';
    }


    function loadBackup() {
        try {
            const raw = loadTitled(KEYS.backupMap);
            const data = raw ? JSON.parse(raw) : null;

            return (
                data &&
                typeof data === 'object' &&
                typeof data.note === 'string'
            )
                ? data
                : null;

        } catch (_) {
            return null;
        }
    }


    function saveBackup(note, states) {
        saveTitled(
            KEYS.backupMap,
            JSON.stringify({
                note: String(note || ''),
                states: String(states || ''),
                time: Date.now()
            })
        );
    }


    /*
     * バックアップと現在を入れ替えます。
     * もう一度押せば「戻す前」に戻れます。
     */
    function restoreBackup() {

        const backup = loadBackup();

        if (!backup) {
            toast('戻せるバックアップがありません', true);
            return;
        }

        const currentNote = authorsNoteRaw();
        const currentStates = loadStates();

        try {

            replaceAuthorsNote(backup.note);
            saveStates(backup.states);
            saveBackup(currentNote, currentStates);

            toast('オーサーズノートと洗脳状態一覧を戻しました（もう一度押すと戻す前に戻ります）');

        } catch (error) {
            toast(error.message || String(error), true);
        }
    }


    function backupAgeLabel() {

        const backup = loadBackup();

        if (!backup || !backup.time) {
            return '';
        }

        const minutes = Math.round((Date.now() - Number(backup.time)) / 60000);

        if (minutes < 1) return 'さっき';
        if (minutes < 60) return minutes + '分前';

        return Math.round(minutes / 60) + '時間前';
    }


    // =========================================================
    // 🕘 前回までの指示文（作品ごと）
    // =========================================================

    const HISTORY_LIMIT = 3;


    function loadHistoryList() {

        let list = [];

        try {
            list = JSON.parse(loadTitled(KEYS.history) || '[]');
            list = Array.isArray(list) ? list : [];
        } catch (_) {
            list = [];
        }

        /*
         * 1.8.0 の「前回の指示文」が残っていれば、最初の1件として取り込みます
         */
        if (!list.length) {
            const old = loadOldLastInstruction();
            if (old) {
                list = [old];
                saveTitled(KEYS.history, JSON.stringify(list));
            }
        }

        return list;
    }


    function loadOldLastInstruction() {
        try {
            const map = JSON.parse(load(KEYS.lastInstruction, '') || '{}');
            return String((map && map[planTitle()]) || '').trim();
        } catch (_) {
            return '';
        }
    }


    function pushInstructionHistory(text) {

        const value = String(text || '').trim();

        if (!value) {
            return;
        }

        const list = loadHistoryList();

        if (list[list.length - 1] !== value) {
            list.push(value);
        }

        saveTitled(KEYS.history, JSON.stringify(list.slice(-HISTORY_LIMIT)));
    }


    function instructionHistoryText() {

        const list = loadHistoryList();

        if (!list.length) {
            return 'なし';
        }

        return list
            .map(function (text, i) {
                const label = (i === list.length - 1)
                    ? '（直前）'
                    : '（' + (list.length - 1 - i) + '回前）';
                return label + text;
            })
            .join('\n\n');
    }


    // =========================================================
    // ✏️ 清書モード
    // =========================================================

    const SEISHO_MODES = {

        light: {
            label: '✏️ モード：手直しだけ',
            background: '#fff4e0',
            rule: [
                'このモードの指定は、【指示文の作成ルール】【指示文をワンパターンにしないためのルール】【作者の構想の読み方】より優先してください。ただし、【前回までの指示文】と同じ言い回しや締め方を避けることだけは守ってください。',
                '・指示文は【ユーザーのざっくり指示】を手直しするだけにしてください。',
                '・ざっくり指示に書かれている出来事、人物、行動だけを使ってください。書かれていない人物の反応、セリフ、禁止事項、状況説明、場所や方針の確認を足さないでください。',
                '・直してよいのは、誤字や言い間違い、主語や相手があいまいな部分、AIのべりすとが読み違えやすい語順だけです。',
                '・人物名は本文のセリフ前に使われている名前にそろえてください。',
                '・長さは、ざっくり指示と同じくらいから、長くても一・五倍までにしてください。',
                '・【作者の構想】は、指示文が構想と矛盾していないかの確認だけに使い、構想の内容を指示文に足さないでください。',
                '・【ユーザーのざっくり指示】が「なし」の場合だけは、このモードの指定を無視して、【指示文の作成ルール】のとおりに作ってください。'
            ].join('\n')
        },

        full: {
            label: '🧩 モード：付け足しあり',
            background: '#e8eefb',
            rule: '指示文は【指示文の作成ルール】のとおりに作ってください。本文末尾の状況とオーサーズ・ノートに合わせて、必要な細部を補ってかまいません。'
        }
    };


    function currentMode() {
        const saved = String(load(KEYS.mode, '')).trim();
        return SEISHO_MODES[saved] ? saved : 'full';
    }


    function toggleMode() {

        const next = currentMode() === 'full' ? 'light' : 'full';

        save(KEYS.mode, next);
        updateModeButton();

        toast(
            next === 'light'
                ? '清書モードを「手直しだけ」にしました'
                : '清書モードを「付け足しあり」にしました'
        );
    }


    function updateModeButton() {

        const button = document.getElementById(SEISHO.modeButtonId);

        if (!button) {
            return;
        }

        const mode = SEISHO_MODES[currentMode()];

        if (button.textContent !== mode.label) {
            button.textContent = mode.label;
        }

        if (button.style.background !== mode.background) {
            button.style.background = mode.background;
        }
    }


    // =========================================================
    // 👥 登場人物の基本設定（作品タイトルごと）
    // =========================================================

    /*
     * 清書AIに「各人物の元の状態」を伝えるための、1人1行の簡易一覧。
     * のべりすと本体には入りません。
     *
     * キャラクターブックから作るときは、エディタの
     * 「作成用テンプレをコピー」で下のプロンプトを使ってください。
     */
    const CHARS_PROMPT =
`以下のキャラクターブックを読み、AIに「登場人物の基本設定」を短く伝えるための簡易一覧を作成してください。

【作成目的】

小説の続きを清書するAIに、各人物の「元の状態」を短く伝えるための参照用一覧です。物語の進行状況ではなく、変化する前の基本設定だけを書いてください。

【一覧に書くこと】

・一人につき一行で、「名前：説明。」の形にしてください。
・名前は、本文でセリフの前に使われる呼び方にしてください。本文の会話ルールに例があればそれに合わせ、無ければ名前だけにしてください。フルネームや読み仮名は書かないでください。名字で呼ばれる人物は名字にしてください。
・説明には、次のうち本文の生成に影響するものだけを、この順番で入れてください。
　①立場や役割（主人公、リーダー、治癒師、委員長、教師など）
　②年齢、学年、性別が物語上重要な場合はその情報
　③武器、装備、能力、技のうち代表的なもの一〜二個
　④口調の特徴。一人称、二人称、語尾など、文章で再現できる形で書いてください（例：「〜ですよ」と穏やかに話す／一人称は俺で乱暴／一人称アタシ、二人称アンタの男勝り口調）
　⑤主人公との関係、または他の人物との重要な関係
・一行は八十文字以内にしてください。
・人数が多い場合でも、キャラクターブックにいる人物は全員入れてかまいません。主人公と主要人物は五項目そろえ、脇役は役割と口調だけの短い行にしてください。
・洗脳、変身、憑依などの仕組みになる物や設定がキャラクターブックにある場合は、人物の後に一行だけ足してください。書かれた人物がどうなるかと、解除の条件を書き、「本作の洗脳状態はこれ」のように状態の名前を添えてください。

【一覧に書かないこと】

・過去の出来事、生い立ち、物語の経緯
・現在の状況、負傷、洗脳、変身などの一時的な状態
・今後の展開、伏線、目標
・性格の長い説明。口調と役割で伝わるものは省いてください
・外見の細かな描写（髪色や服装は、装備として重要な場合だけ）
・キャラクターブックの項目名や「≡」などの記号

【出力形式】

・主人公を最初に、その後は主要人物、脇役、仕組みになる物の順に並べてください。
・行頭に箇条書き記号、番号、空白を付けないでください。
・一覧だけをコードブロックで出力し、前後に説明や感想を付けないでください。

【出力例】
\`\`\`
ルカ：十二歳の少年。主人公。《来歴視》で物の過去を見る。戦わず後方にいる。一人称は僕で丁寧。
イリーナ：探索者パーティーのリーダー。長剣。命令口調で短く言い切る。ルカの保護責任者。
リーネ：治癒師。聖杖と治癒術。「〜ですよ」と穏やかに話す。ルカを気にかけている。
セリア：斥候。双短剣。無口で単語だけで返す。
\`\`\`

【キャラクターブック】

（ここにキャラクターブックの内容を貼り付け）`;


    function loadChars() {
        return loadTitled(KEYS.chars).trim();
    }


    function saveChars(text) {
        saveTitled(KEYS.chars, String(text || '').trim());
        updateCharsButton();
    }


    function updateCharsButton() {

        const button = document.getElementById(SEISHO.charsButtonId);

        if (!button) {
            return;
        }

        const has = !!loadChars();
        const label = has ? '👥 キャラ設定（あり）' : '👥 キャラ設定を書く';
        const background = has ? '#f3e9f7' : '#fff';

        if (button.textContent !== label) {
            button.textContent = label;
        }
        if (button.style.background !== background) {
            button.style.background = background;
        }
    }


    function openCharsEditor() {

        const old = document.getElementById(SEISHO.charsPanelId);
        if (old) {
            old.remove();
        }

        const panel = document.createElement('div');
        panel.id = SEISHO.charsPanelId;
        panel.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'display:flex',
            'flex-direction:column',
            'gap:8px',
            'padding:10px 8px 14px',
            'box-sizing:border-box',
            'background:#fff',
            'color:#222'
        ].join(';');

        const head = document.createElement('div');
        head.style.cssText = 'font-weight:bold;font-size:16px';
        head.textContent = '👥 登場人物の基本設定：' + planTitle();

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:#777;line-height:1.5';
        hint.textContent =
            '清書AIにだけ見せる、各人物の元の状態です。のべりすと本体には入りません。' +
            '「名前：説明。」を1人1行で書いてください。名前は本文のセリフ前に使う呼び方にそろえます。' +
            'キャラクターブックから作るときは「作成用テンプレをコピー」を押して、AIにキャラブックと一緒に貼ってください。';

        const area = document.createElement('textarea');
        area.value = loadChars();
        area.placeholder = [
            '陽介：主人公。二年男子。明るく面倒見がよく恋愛に鈍感。一人称は俺。',
            '大地：二年男子。陽介の幼馴染で同室。所作も口調も女性的で「〜ですよ」と丁寧。',
            '小嶋：二年男子。見栄っ張りな小悪党。改変の書の持ち主。一人称は俺。',
            '改変の書：名前と役割を書いたページを見せると効く。本作の洗脳状態はこれ。'
        ].join('\n');
        area.style.cssText = [
            'flex:1',
            'width:100%',
            'box-sizing:border-box',
            'padding:10px',
            'border:1px solid #999',
            'border-radius:9px',
            'font-size:15px',
            'line-height:1.6',
            'color:#222',
            'background:#fff',
            'resize:none'
        ].join(';');

        const count = document.createElement('div');
        count.style.cssText = 'text-align:right;font-size:12px;color:#777';

        const updateCount = function () {
            const lines = area.value.split('\n').filter(function (line) {
                return line.trim();
            }).length;
            count.textContent = lines + '行 / ' + area.value.length.toLocaleString() + '文字';
        };

        area.addEventListener('input', updateCount);
        updateCount();

        /*
         * 作成用テンプレをコピー
         */
        const promptButton = document.createElement('button');
        promptButton.type = 'button';
        promptButton.textContent = '📋 作成用テンプレをコピー（AIにキャラブックと一緒に貼る）';
        promptButton.style.cssText = [
            'width:100%',
            'height:44px',
            'border:1px solid #6a4c93',
            'border-radius:9px',
            'background:#f3e9f7',
            'color:#3d2a5c',
            'font-size:15px',
            'font-weight:bold'
        ].join(';');

        promptButton.addEventListener('click', function (event) {

            event.preventDefault();
            event.stopPropagation();

            clipboard(CHARS_PROMPT)
                .then(function () {
                    // Android はクリップボード操作のあと画面が動くことがあるので、トーストだけ出します
                    toast('作成用テンプレをコピーしました。AIの入力欄に貼り、末尾にキャラクターブックを貼ってください');
                })
                .catch(function (error) {
                    toast(error.message || String(error), true);
                });
        });

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px';

        const makeButton = function (label, color, handler) {

            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText = [
                'flex:1',
                'height:50px',
                'border:1px solid #000',
                'border-radius:9px',
                'font-size:16px',
                'font-weight:bold',
                'color:#fff',
                'background:' + color
            ].join(';');

            b.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                handler();
            });

            return b;
        };

        row.append(
            makeButton('閉じる', '#777', function () {
                panel.remove();
            }),
            makeButton('保存', '#cd2b5a', function () {
                saveChars(area.value);
                panel.remove();
                toast(
                    area.value.trim()
                        ? 'キャラ設定を保存しました'
                        : 'キャラ設定を空にしました'
                );
            })
        );

        panel.append(head, hint, area, count, promptButton, row);
        document.body.appendChild(panel);
    }



    /*
     * 清書モードとキャラ設定のボタンを、構想ボタンの上に1行で並べます
     * （スマホで縦に場所を取りすぎないように）
     */
    function installToolRow() {

        if (!IS_AI_NOVEL || document.getElementById(SEISHO.toolRowId)) {
            return;
        }

        const anchor =
            document.getElementById(SEISHO.planButtonId) ||
            document.getElementById(SEISHO.buttonId);

        if (!anchor || !anchor.parentNode) {
            return;
        }

        const row = document.createElement('div');
        row.id = SEISHO.toolRowId;
        row.style.cssText = 'display:flex;gap:6px;width:100%;flex:none';

        const make = function (id, border, color, handler) {

            const b = document.createElement('button');
            b.id = id;
            b.type = 'button';
            b.style.cssText = [
                'flex:1',
                'min-width:0',
                'height:40px',
                'border:1px solid ' + border,
                'border-radius:9px',
                'color:' + color,
                'font-size:13px',
                'font-weight:bold',
                'white-space:nowrap',
                'overflow:hidden',
                'text-overflow:ellipsis',
                'cursor:pointer'
            ].join(';');

            b.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                handler();
            });

            return b;
        };

        row.append(
            make(SEISHO.modeButtonId, '#2d509e', '#1b3570', toggleMode),
            make(SEISHO.charsButtonId, '#6a4c93', '#3d2a5c', openCharsEditor)
        );

        anchor.parentNode.insertBefore(row, anchor);

        updateModeButton();
        updateCharsButton();
    }


    // =========================================================
    // 🔀 送り先（Grok / Claude）
    // =========================================================

    const TARGETS = {
        grok: { label: 'Grok', icon: '🤖' },
        claude: { label: 'Claude', icon: '✳️' }
    };


    function currentTargetKey() {
        const saved = String(load(KEYS.target, '')).trim();
        return TARGETS[saved] ? saved : 'grok';
    }


    function targetLabel() {
        return TARGETS[currentTargetKey()].label;
    }


    /*
     * キャラブック更新スクリプトと送り先を共有します
     */
    function mirrorTarget(key) {
        try {
            localStorage.setItem('ainovel_seisho_target', key);
        } catch (_) {
        }
    }


    function cycleTarget() {

        const next = currentTargetKey() === 'grok' ? 'claude' : 'grok';

        save(KEYS.target, next);
        mirrorTarget(next);
        updateTargetButton();

        toast(
            '送り先を ' + TARGETS[next].label + ' に切り替えました' +
            (next === 'claude' && !MACRODROID.claudeUrl
                ? '（Claudeへは自動で切り替わりません）'
                : '')
        );
    }


    function updateTargetButton() {

        const button = document.getElementById(ids.target);

        if (!button) {
            return;
        }

        const t = TARGETS[currentTargetKey()];
        const title = '送り先: ' + t.label + '（タップで切替）';

        if (button.textContent !== t.icon) {
            button.textContent = t.icon;
        }
        if (button.title !== title) {
            button.title = title;
            button.setAttribute('aria-label', title);
        }
    }


    /*
     * 送り先のアプリへ切り替えます（MacroDroid）
     */
    function switchToTarget() {

        if (currentTargetKey() === 'claude') {
            return MACRODROID.claudeUrl
                ? pokeMacroDroid(MACRODROID.claudeUrl)
                : false;
        }

        return pokeMacroDroid();
    }


    // =========================================================
    // 📝 作者の構想（作品タイトルごと）
    // =========================================================

    function planTitle() {

        const t = document.getElementById('data_title');

        const text =
            t
                ? String(t.textContent || '').trim()
                : '';

        return text || '(無題)';
    }


    function loadPlanMap() {

        try {

            const map = JSON.parse(load(KEYS.plan, '') || '{}');

            return map && typeof map === 'object'
                ? map
                : {};

        } catch (_) {

            return {};
        }
    }


    function loadPlan() {

        return migratePlanHeadings(
            String(loadPlanMap()[planTitle()] || '')
        ).trim();
    }


    function savePlan(text) {

        const map = loadPlanMap();

        const key = planTitle();

        /*
         * 見出しだけのひな形のままなら保存しません
         */
        const value =
            isPlanEmpty(text)
                ? ''
                : String(text || '').trim();

        if (value) {
            map[key] = value;
        } else {
            delete map[key];
        }

        save(KEYS.plan, JSON.stringify(map));

        updatePlanButton();
    }


    function updatePlanButton() {

        const button = document.getElementById(SEISHO.planButtonId);

        if (!button) {
            return;
        }

        const has = !!loadPlan();

        button.textContent =
            has
                ? '📝 構想（あり）'
                : '📝 構想を書く';

        button.style.background =
            has
                ? '#e9f7ef'
                : '#fff';
    }


    /*
     * 【やってほしいことの順番】（または【段階】）の行に
     * ①②③…を振り直します。
     * 見出し（【〜】）、空行、箇条書きの「・」行は数えません。
     * 行頭の✅は残します。
     */
    function renumberPlan(text) {

        const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

        const lines = String(text || '').split('\n');

        /*
         * 順番の見出しを探します。
         * 無ければ、見出し以外の行すべてを対象にします。
         */
        let start = -1;
        let end = lines.length;

        for (let i = 0; i < lines.length; i++) {

            if (/^\s*【.*(段階|順番).*】/.test(lines[i])) {
                start = i + 1;
                break;
            }
        }

        if (start >= 0) {

            for (let i = start; i < lines.length; i++) {

                if (/^\s*【/.test(lines[i])) {
                    end = i;
                    break;
                }
            }

        } else {

            start = 0;
        }

        let count = 0;

        for (let i = start; i < end; i++) {

            const body = lines[i].trim();

            if (
                !body ||
                /^【/.test(body) ||
                /^[・\-]/.test(body)
            ) {
                continue;
            }

            const checked = body.startsWith('✅');

            let rest =
                checked
                    ? body.slice(1).trim()
                    : body;

            // 元の番号を外します
            rest = rest
                .replace(
                    new RegExp('^[' + circled + ']\\s*'),
                    ''
                )
                .replace(
                    /^\(?\d+\)?[.．:：、)]?\s*/,
                    ''
                );

            count += 1;

            const mark =
                count <= circled.length
                    ? circled[count - 1]
                    : '(' + count + ')';

            lines[i] =
                (checked ? '✅' : '') +
                mark +
                rest;
        }

        return {
            text: lines.join('\n'),
            count: count
        };
    }


    function openPlanEditor(suggested) {

        const isUpdate = typeof suggested === 'string';

        const old = document.getElementById(SEISHO.planPanelId);

        if (old) {
            old.remove();
        }

        const panel = document.createElement('div');

        panel.id = SEISHO.planPanelId;

        panel.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'display:flex',
            'flex-direction:column',
            'gap:8px',
            'padding:10px 8px 14px',
            'box-sizing:border-box',
            'background:#fff',
            'color:#222'
        ].join(';');

        const head = document.createElement('div');

        head.style.cssText = 'font-weight:bold;font-size:16px';

        head.textContent =
            isUpdate
                ? '📝 構想の進み具合：' + planTitle()
                : '📝 構想：' + planTitle();

        const hint = document.createElement('div');

        hint.style.cssText = 'font-size:12px;color:#777;line-height:1.5';

        hint.textContent =
            isUpdate
                ? '清書したAIが、終わったと判断した段階に✅を付けました。' +
                    '合っていれば保存、違っていれば直すか「やめる」を押してください。'
                : '清書するAIにだけ見せる、あなたの物語の構想です。のべりすと本体には入りません。' +
                    '【段階】の下は「・」を付けずに1行ずつ書いてください。その行だけが①②③と✅の対象です。' +
                    '見出しだけのままなら保存されません。';

        const area = document.createElement('textarea');

        area.value =
            isUpdate
                ? suggested
                : (loadPlan() || PLAN_SKELETON);

        area.placeholder = [
            '例）',
            '【目指すところ】',
            '・蓮以外の全員がしもべになり、蓮が孤立する',
            '',
            '【段階】',
            'マキマと夜一が堕ちる',
            '千束とエミリアが堕ちる',
            '蓮が孤立する',
            '',
            '【守りたいこと】',
            '・洗脳された子は元の口調のまま価値観だけ変わる',
            '',
            '【やらないこと】',
            '・蓮は洗脳されない',
            '・途中で洗脳は解けない'
        ].join('\n');

        area.style.cssText = [
            'flex:1',
            'width:100%',
            'box-sizing:border-box',
            'padding:10px',
            'border:1px solid #999',
            'border-radius:9px',
            'font-size:15px',
            'line-height:1.6',
            'color:#222',
            'background:#fff',
            'resize:none'
        ].join(';');

        const count = document.createElement('div');

        count.style.cssText = 'text-align:right;font-size:12px;color:#777';

        const updateCount = function () {
            count.textContent =
                area.value.length.toLocaleString() + '文字';
        };

        area.addEventListener('input', updateCount);
        updateCount();

        const row = document.createElement('div');

        row.style.cssText = 'display:flex;gap:8px';

        /*
         * ✅が付いた行をまとめて消すボタン
         */
        const clearButton = document.createElement('button');

        clearButton.type = 'button';

        const checkedLines = function () {

            return area.value
                .split('\n')
                .filter(function (line) {
                    return line.trim().startsWith('✅');
                })
                .length;
        };

        const updateClearButton = function () {

            const n = checkedLines();

            clearButton.textContent =
                n
                    ? '✅の行を消す（' + n + '行）'
                    : '✅の行はありません';

            clearButton.disabled = !n;

            clearButton.style.opacity = n ? '1' : '0.5';
        };

        clearButton.style.cssText = [
            'width:100%',
            'height:44px',
            'border:1px solid #28543d',
            'border-radius:9px',
            'background:#e9f7ef',
            'color:#183b2a',
            'font-size:15px',
            'font-weight:bold'
        ].join(';');

        clearButton.addEventListener('click', function (event) {

            event.preventDefault();
            event.stopPropagation();

            const before = checkedLines();

            if (!before) {
                return;
            }

            area.value =
                area.value
                    .split('\n')
                    .filter(function (line) {
                        return !line.trim().startsWith('✅');
                    })
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

            const after = renumberPlan(area.value);

            area.value = after.text;

            updateCount();
            updateClearButton();

            toast(
                before + '行消して番号を振り直しました（保存するまで反映されません）'
            );
        });

        area.addEventListener('input', updateClearButton);
        updateClearButton();

        /*
         * 段階に①②③…を振り直すボタン
         */
        const numberButton = document.createElement('button');

        numberButton.type = 'button';
        numberButton.textContent = '①②③を振り直す';

        numberButton.style.cssText = [
            'width:100%',
            'height:44px',
            'border:1px solid #2d509e',
            'border-radius:9px',
            'background:#e8eefb',
            'color:#1b3570',
            'font-size:15px',
            'font-weight:bold'
        ].join(';');

        numberButton.addEventListener('click', function (event) {

            event.preventDefault();
            event.stopPropagation();

            const result = renumberPlan(area.value);

            area.value = result.text;

            updateCount();
            updateClearButton();

            toast(
                result.count
                    ? result.count + '行に番号を振りました'
                    : '番号を振る行が見つかりません'
            );
        });

        const makeButton = function (label, color, handler) {

            const b = document.createElement('button');

            b.type = 'button';
            b.textContent = label;

            b.style.cssText = [
                'flex:1',
                'height:50px',
                'border:1px solid #000',
                'border-radius:9px',
                'font-size:16px',
                'font-weight:bold',
                'color:#fff',
                'background:' + color
            ].join(';');

            b.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                handler();
            });

            return b;
        };

        row.append(
            makeButton(
                isUpdate ? 'やめる' : '閉じる',
                '#777',
                function () {
                    panel.remove();
                }
            ),
            makeButton(
                isUpdate ? 'この内容で保存' : '保存',
                '#cd2b5a',
                function () {

                    savePlan(area.value);
                    panel.remove();

                    toast(
                        !isPlanEmpty(area.value)
                            ? (
                                isUpdate
                                    ? '構想の進み具合を保存しました'
                                    : '構想を保存しました'
                            )
                            : '構想を空にしました'
                    );
                }
            )
        );

        panel.append(
            head,
            hint,
            area,
            count,
            numberButton,
            clearButton,
            row
        );

        document.body.appendChild(panel);
    }


    function installPlanButton() {

        if (
            !IS_AI_NOVEL ||
            document.getElementById(SEISHO.planButtonId)
        ) {
            return;
        }

        const seisho = document.getElementById(SEISHO.buttonId);

        if (!seisho || !seisho.parentNode) {
            return;
        }

        const button = document.createElement('button');

        button.id = SEISHO.planButtonId;
        button.type = 'button';

        button.style.cssText = [
            'width:100%',
            'height:40px',
            'flex:none',
            'border:1px solid #28543d',
            'border-radius:9px',
            'color:#183b2a',
            'font-size:15px',
            'font-weight:bold',
            'cursor:pointer'
        ].join(';');

        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openPlanEditor();
        });

        seisho.parentNode.insertBefore(button, seisho);

        updatePlanButton();
    }


    function installSeishoButton() {

        if (
            !IS_AI_NOVEL ||
            document.getElementById(SEISHO.buttonId)
        ) {
            return;
        }

        const send = document.getElementById('qp-full-send');

        if (!send || !send.parentNode) {
            return;
        }

        const button = document.createElement('button');

        button.id = SEISHO.buttonId;
        button.type = 'button';
        button.textContent = SEISHO.buttonText;

        button.style.cssText = [
            'width:100%',
            'height:46px',
            'flex:none',
            'border:1px solid #000',
            'border-radius:9px',
            'background:#2f6fd0',
            'color:#fff',
            'font-size:16px',
            'font-weight:bold',
            'cursor:pointer'
        ].join(';');

        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            copyPrompt(false);
        });

        send.parentNode.insertBefore(button, send);
    }


    function openImportPanel(initialText = '') {

        document.getElementById(ids.importPanel)?.remove();

        const panel = document.createElement('div');

        panel.id = ids.importPanel;

        Object.assign(panel.style, {
            position: 'fixed',
            inset: '10px',
            zIndex: 2147483647,
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            padding: '12px',
            borderRadius: '10px',
            background: '#f7f7f7',
            color: '#222',
            boxShadow: '0 4px 24px rgba(0,0,0,.4)',
            fontFamily: 'sans-serif'
        });

        const title = document.createElement('strong');

        title.textContent = 'AIの出力を貼り付け';

        const hint = document.createElement('div');

        hint.textContent =
            'AI回答全体、またはオーサーズノートだけを下へ貼り付けてください。';

        const area = document.createElement('textarea');

        area.value = initialText;

        area.placeholder = 'ここを長押しして「貼り付け」';

        Object.assign(area.style, {
            width: '100%',
            flex: '1 1 auto',
            minHeight: '220px',
            boxSizing: 'border-box',
            resize: 'none',
            fontSize: '14px',
            lineHeight: '1.5'
        });

        const row = document.createElement('div');

        Object.assign(row.style, {
            display: 'flex',
            gap: '8px'
        });

        const apply = document.createElement('button');

        apply.type = 'button';
        apply.textContent = '現在のノートを消して置換';

        const cancel = document.createElement('button');

        cancel.type = 'button';
        cancel.textContent = 'キャンセル';

        for (const button of [apply, cancel]) {

            Object.assign(button.style, {
                flex: '1',
                padding: '11px',
                border: '1px solid #777',
                borderRadius: '7px',
                fontSize: '14px',
                fontWeight: 'bold'
            });
        }

        apply.style.background = '#dff0df';

        apply.addEventListener('click', function () {

            try {
                applyAiOutput(area.value);
                panel.remove();
            } catch (error) {
                toast(error.message || String(error), true);
            }
        });

        cancel.addEventListener('click', function () {
            panel.remove();
        });

        row.append(apply, cancel);

        panel.append(title, hint, area, row);

        document.body.appendChild(panel);

        area.focus();
    }


    async function importAuthorsNote() {

        try {

            if (
                !navigator.clipboard ||
                !navigator.clipboard.readText
            ) {
                throw new Error('クリップボードの直接読込に未対応です');
            }

            const text = await navigator.clipboard.readText();

            applyAiOutput(text);

        } catch (error) {

            openImportPanel();

            toast('貼り付け欄を長押しして貼り付けてください', true);
        }
    }


    function difference(current, previous) {

        if (!previous) {
            return { text: current, label: '全文' };
        }

        if (current === previous) {
            return { text: '', label: '変更なし' };
        }

        if (current.startsWith(previous)) {

            return {
                text:
                    current
                        .slice(previous.length)
                        .replace(/^\s+/, ''),
                label: '差分'
            };
        }

        let common = 0;

        const limit = Math.min(current.length, previous.length);

        while (
            common < limit &&
            current.charCodeAt(common) === previous.charCodeAt(common)
        ) {
            common++;
        }

        if (common / Math.max(1, limit) < 0.6) {
            return {
                text: current,
                label: '全文（大きな編集を検出）'
            };
        }

        let start = current.lastIndexOf('\n\n', common);

        if (start >= 0) {

            start += 2;

        } else {

            start = current.lastIndexOf('\n', common);

            start =
                start >= 0
                    ? start + 1
                    : common;
        }

        return {
            text:
                current
                    .slice(start)
                    .replace(/^\s+/, ''),
            label: '差分（末尾修正を含む）'
        };
    }


    function makePrompt(template, body) {

        /*
         * 古いテンプレを保存している場合でも、
         * 新しい差し込み欄が無ければ末尾に足します。
         */
        if (!template.includes('{作者の構想}')) {
            template += '\n\n【作者の構想】\n\n{作者の構想}';
        }
        if (!template.includes('{前回までの指示文}')) {
            template += '\n\n【前回までの指示文】\n\n{前回までの指示文}';
        }
        if (!template.includes('{ざっくり指示}')) {
            template += '\n\n【ユーザーのざっくり指示】\n\n{ざっくり指示}';
        }
        if (!template.includes('{清書モード}')) {
            template += '\n\n【清書モード】\n\n{清書モード}';
        }
        if (!template.includes('{キャラ設定}')) {
            template += '\n\n【登場人物の基本設定】\n\n{キャラ設定}';
        }

        return template
            .split('{作者の構想}').join(loadPlan() || 'なし')
            .split('{前回までの指示文}').join(instructionHistoryText())
            .split('{ざっくり指示}').join(roughInstruction() || 'なし')
            .split('{清書モード}').join(SEISHO_MODES[currentMode()].rule)
            .split('{キャラ設定}').join(loadChars() || 'なし')
            .split('{現在のオーサーズノート}').join(authorsNote())
            .split('{前回の洗脳状態一覧}').join(loadStates() || 'なし')
            .split('{本文}').join(body);
    }


    let clipboardClearTimer = null;


    /*
     * 一定時間後にクリップボードを空にします。
     * CLIPBOARD.clearAfter が 0 のときは何もしません。
     */
    function scheduleClipboardClear() {

        if (!CLIPBOARD.clearAfter) {
            return;
        }

        if (clipboardClearTimer) {
            clearTimeout(clipboardClearTimer);
        }

        clipboardClearTimer = setTimeout(function () {

            clipboardClearTimer = null;

            clipboard('').catch(function () {
            });

        }, CLIPBOARD.clearAfter);
    }


    async function clipboard(text) {

        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const area = document.createElement('textarea');

        area.value = text;

        Object.assign(area.style, {
            position: 'fixed',
            opacity: '0'
        });

        document.body.appendChild(area);

        area.focus();
        area.select();

        const ok = document.execCommand('copy');

        area.remove();

        if (!ok) {
            throw new Error('クリップボードへコピーできませんでした');
        }
    }


    function toast(message, error = false, duration = 4500) {

        let box = document.getElementById(ids.notice);

        if (!box) {

            box = document.createElement('div');

            box.id = ids.notice;

            Object.assign(box.style, {
                position: 'fixed',
                left: '12px',
                right: '12px',
                bottom: '182px',
                zIndex: 2147483647,
                padding: '12px',
                borderRadius: '9px',
                color: '#fff',
                fontSize: '14px',
                textAlign: 'center',
                boxShadow: '0 3px 14px rgba(0,0,0,.3)'
            });

            document.body.appendChild(box);
        }

        box.style.background = error ? '#a93232' : '#245e43';

        box.textContent = message;

        box.hidden = false;

        clearTimeout(toast.timer);

        toast.timer = setTimeout(function () {
            box.hidden = true;
        }, duration);
    }


    // =========================================================
    // AIのべりすと → Grok 転送
    // =========================================================

    function createTransferPayload(text) {

        return JSON.stringify({
            id:
                Date.now().toString(36) +
                '-' +
                Math.random().toString(36).slice(2),
            time: Date.now(),
            text: String(text || '')
        });
    }


    function sendPromptToGrok(text) {

        save(
            KEYS.grokTransfer,
            createTransferPayload(text)
        );
    }


    function parseTransferPayload(raw) {

        try {

            const data =
                typeof raw === 'string'
                    ? JSON.parse(raw)
                    : raw;

            if (
                !data ||
                typeof data !== 'object' ||
                !data.id ||
                !data.time ||
                typeof data.text !== 'string'
            ) {
                return null;
            }

            return data;

        } catch (_) {

            return null;
        }
    }


    // =========================================================
    // Grok入力欄検索
    // =========================================================

    function isVisible(element) {

        if (!element) {
            return false;
        }

        const style = window.getComputedStyle(element);

        const rect = element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
        );
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

        const candidates = [];

        for (const selector of selectors) {

            document
                .querySelectorAll(selector)
                .forEach(function (element) {

                    if (
                        isVisible(element) &&
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        }

        if (!candidates.length) {
            return null;
        }

        /*
         * 画面下側にあるものを優先。
         * Grokのチャット入力欄を拾いやすくする。
         */
        candidates.sort(function (a, b) {
            return (
                b.getBoundingClientRect().bottom -
                a.getBoundingClientRect().bottom
            );
        });

        return candidates[0];
    }


    // =========================================================
    // textarea / input へ入力
    // =========================================================

    function setTextareaValue(field, text) {

        const descriptor =
            Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(field),
                'value'
            );

        if (descriptor && descriptor.set) {
            descriptor.set.call(field, text);
        } else {
            field.value = text;
        }

        try {
            field.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    inputType: 'insertText',
                    data: text
                })
            );
        } catch (_) {
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }

        field.dispatchEvent(new Event('change', { bubbles: true }));
    }


    // =========================================================
    // contenteditable へ入力
    // =========================================================

    function setContentEditableValue(field, text) {

        field.focus();

        const selection = window.getSelection();

        const range = document.createRange();

        range.selectNodeContents(field);

        selection.removeAllRanges();
        selection.addRange(range);

        let inserted = false;

        try {
            inserted = document.execCommand('insertText', false, text);
        } catch (_) {
            inserted = false;
        }

        if (!inserted) {

            field.textContent = text;

            try {
                field.dispatchEvent(
                    new InputEvent('input', {
                        bubbles: true,
                        inputType: 'insertText',
                        data: text
                    })
                );
            } catch (_) {
                field.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        selection.removeAllRanges();
    }


    function fillGrokEditor(editor, text) {

        if (
            editor instanceof HTMLTextAreaElement ||
            editor instanceof HTMLInputElement
        ) {

            editor.focus();

            setTextareaValue(editor, text);

            return;
        }

        if (
            editor.isContentEditable ||
            editor.getAttribute('contenteditable') === 'true'
        ) {

            setContentEditableValue(editor, text);

            return;
        }

        throw new Error('入力欄の形式を認識できませんでした');
    }


    // =========================================================
    // Grok側通知
    // =========================================================

    function grokToast(message, error = false) {

        let box = document.getElementById(P + 'grok_notice');

        if (!box) {

            box = document.createElement('div');

            box.id = P + 'grok_notice';

            Object.assign(box.style, {
                position: 'fixed',
                left: '12px',
                right: '12px',
                bottom: '20px',
                zIndex: 2147483647,
                padding: '11px',
                borderRadius: '9px',
                color: '#fff',
                fontSize: '14px',
                textAlign: 'center',
                boxShadow: '0 3px 14px rgba(0,0,0,.3)'
            });

            document.body.appendChild(box);
        }

        box.style.background = error ? '#a93232' : '#245e43';

        box.textContent = message;

        box.hidden = false;

        clearTimeout(grokToast.timer);

        grokToast.timer = setTimeout(function () {
            box.hidden = true;
        }, 3000);
    }


    // =========================================================
    // Grok側受信
    // =========================================================

    async function receiveTransfer(raw) {

        if (!IS_CHAT) {
            return;
        }

        /*
         * GrokとClaudeを両方開いていても、
         * 選んでいる送り先のタブだけが受け取ります。
         */
        if (
            (IS_GROK && currentTargetKey() !== 'grok') ||
            (IS_CLAUDE && currentTargetKey() !== 'claude')
        ) {
            return;
        }

        const payload = parseTransferPayload(raw);

        if (
            !payload ||
            payload.id === lastReceivedTransferId
        ) {
            return;
        }

        /*
         * 古い転送データは無視。
         * Grokを後から開いたときに
         * 昔のプロンプトが勝手に入るのを防止。
         */
        if (
            Date.now() - Number(payload.time) >
            GROK_TRANSFER_MAX_AGE
        ) {
            return;
        }

        /*
         * ここではまだ受信済みにしません。
         * 入力欄が見つからないまま受信済みにすると、
         * あとでタブを開き直しても
         * 二度と貼り付けられなくなるためです。
         */
        if (receivingTransfer) {
            return;
        }

        receivingTransfer = true;

        let editor = null;

        /*
         * Grokの画面描画待ち。
         * 250ms × 40回 最大約10秒
         */
        for (let attempt = 0; attempt < 40; attempt++) {

            editor = findGrokEditor();

            if (editor) {
                break;
            }

            await new Promise(function (resolve) {
                setTimeout(resolve, 250);
            });
        }

        if (!editor) {

            receivingTransfer = false;

            grokToast(
                'AIのべりすとから受信しましたが、入力欄が見つかりません',
                true
            );

            return;
        }

        try {

            fillGrokEditor(editor, payload.text);

            /*
             * 貼り付けに成功してはじめて
             * 受信済みとして記録します
             */
            lastReceivedTransferId = payload.id;

            grokToast(
                IS_CLAUDE
                    ? 'AIのべりすとから受信して入力しました。送信ボタンを押してね'
                    : AUTO_SUBMIT.enabled
                        ? 'AIのべりすとから受信して入力・送信します'
                        : 'AIのべりすとから文章を受信して入力しました'
            );

            submitGrok(editor);

        } catch (error) {

            grokToast(error.message || String(error), true);

        } finally {

            receivingTransfer = false;
        }
    }


    function checkPendingTransfer() {

        receiveTransfer(load(KEYS.grokTransfer, ''));
    }


    function installGrokReceiver() {

        if (!IS_CHAT) {
            return;
        }

        /*
         * AIのべりすとタブ側でGM_setValueされた瞬間に
         * Grok側で受信（別タブからの変更だけ処理）
         */
        if (typeof GM_addValueChangeListener === 'function') {

            GM_addValueChangeListener(
                KEYS.grokTransfer,
                function (_name, _oldValue, newValue, remote) {
                    if (remote) {
                        receiveTransfer(newValue);
                    }
                }
            );
        }

        /*
         * Grokを開いた直後にも最新データを確認
         */
        checkPendingTransfer();

        /*
         * Androidでは裏に回ったタブの処理が
         * 止められることがあるので、
         * 前面に戻ったタイミングでもう一度確認します。
         */
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                checkPendingTransfer();
            }
        });

        window.addEventListener('focus', checkPendingTransfer);

        window.addEventListener('pageshow', checkPendingTransfer);

        /*
         * 保険として定期的にも確認します
         */
        setInterval(checkPendingTransfer, 1500);
    }


    // =========================================================
    // 📋 Grok用コピー
    // =========================================================

    /*
     * lastOnly が true のときは
     * 差分ではなく「最後の本文ブロック」だけを送ります。
     */
    async function copyPrompt(lastOnly) {

        const button =
            document.getElementById(
                lastOnly ? ids.copyLast : ids.copy
            );

        if (button) {
            button.disabled = true;
        }

        try {

            const current = novelText();

            let diff =
                lastOnly
                    ? {
                        text: lastBlockText(),
                        label: '最後のブロック'
                    }
                    : difference(
                        current,
                        loadLast()
                    );

            /*
             * 初回や大きな編集のあとで全文送信に
             * なってしまうときは、最新のブロックだけに絞ります
             */
            if (
                !lastOnly &&
                SEISHO.fullBlockLimit > 0 &&
                diff.text &&
                diff.label.indexOf('全文') === 0
            ) {

                const trimmed = lastBlocksText(SEISHO.fullBlockLimit);

                if (
                    trimmed &&
                    trimmed.length < diff.text.length
                ) {

                    diff = {
                        text: trimmed,
                        label: '最新' + SEISHO.fullBlockLimit + 'ブロック'
                    };
                }
            }

            if (
                !diff.text &&
                !lastOnly &&
                roughInstruction()
            ) {

                diff = {
                    text: SEISHO.noNewText,
                    label: '指示のみ'
                };
            }

            if (!diff.text) {

                toast(
                    lastOnly
                        ? '最後の本文ブロックが空です'
                        : '前回コピー後に本文は増えていません',
                    true
                );

                return;
            }

            const prompt =
                makePrompt(
                    String(load(KEYS.template, DEFAULT_TEMPLATE)),
                    diff.text
                );

            /*
             * クリップボードへコピー
             * （CLIPBOARD.useClipboard が false なら省略）
             */
            if (CLIPBOARD.useClipboard) {

                await clipboard(prompt);

                scheduleClipboardClear();
            }

            /*
             * Grokタブへ転送
             */
            sendPromptToGrok(prompt);

            /*
             * MacroDroidにスワイプを依頼して
             * Grokタブへ切り替える
             */
            const switched = switchToTarget();

            /*
             * 転送成功後に現在本文を保存（作品ごと）
             */
            saveLast(current);

            const withInstruction =
                (
                    roughInstruction()
                        ? (currentMode() === 'light' ? '＋指示（手直し）' : '＋指示（付け足し）')
                        : '（指示なし）'
                ) +
                (loadPlan() ? '＋構想' : '') +
                (loadChars() ? '＋キャラ設定' : '');

            const label = targetLabel();

            const head =
                CLIPBOARD.useClipboard
                    ? `${diff.label}${withInstruction}をコピー＋${label}へ送信`
                    : `${diff.label}${withInstruction}を${label}へ送信`;

            toast(
                switched
                    ? `${head}・切替（本文 ${diff.text.length.toLocaleString()}文字）`
                    : `${head}しました（本文 ${diff.text.length.toLocaleString()}文字）`
            );

        } catch (error) {

            console.error('[AI Novel Android Prompt]', error);

            toast(error.message || String(error), true);

        } finally {

            if (button) {
                button.disabled = false;
            }
        }
    }


    // =========================================================
    // ボタン作成
    // =========================================================

    function installButton(id, text, title, bottom, handler, primary) {

        if (document.getElementById(id)) {
            return;
        }

        const button = document.createElement('button');

        button.id = id;
        button.type = 'button';
        button.textContent = text;
        button.title = title;

        button.setAttribute('aria-label', title);

        Object.assign(button.style, {
            position: 'fixed',
            right: '12px',
            bottom: bottom,
            zIndex: 2147483646,
            width: '46px',
            height: '46px',
            padding: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid ' + (primary ? '#28543d' : '#666'),
            borderRadius: '9px',
            background: primary ? '#e9f7ef' : '#fff',
            color: primary ? '#183b2a' : '#222',
            fontSize: '22px',
            lineHeight: '1',
            fontWeight: 'bold',
            boxShadow: '0 2px 10px rgba(0,0,0,.24)',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'manipulation'
        });

        button.addEventListener('click', handler);

        document.body.appendChild(button);
    }


    // =========================================================
    // AIのべりすと側UI
    // =========================================================

    function install() {

        if (!document.body) {
            return;
        }

        /*
         * 📋 Grok用コピー
         */
        installButton(
            ids.copy,
            '📋',
            'AI用コピー',
            '128px',
            function () {
                copyPrompt(false);
            },
            true
        );

        /*
         * 📄 最後のブロックだけGrokへ
         */
        installButton(
            ids.copyLast,
            '📄',
            '最後のブロックをAIへ',
            '184px',
            function () {
                copyPrompt(true);
            },
            true
        );

        /*
         * 📥 ANを置換
         */
        installButton(
            ids.importNote,
            '📥',
            'ANを置換',
            '78px',
            importAuthorsNote,
            true
        );

        /*
         * 🔀 送り先（Grok / Claude）
         */
        installButton(
            ids.target,
            TARGETS[currentTargetKey()].icon,
            '送り先: ' + targetLabel() + '（タップで切替）',
            '240px',
            cycleTarget,
            false
        );
    }


    // =========================================================
    // 起動
    // =========================================================

    if (IS_AI_NOVEL) {

        install();

        /*
         * AIのべりすと側のDOMが
         * 再生成されてもボタンを復帰
         */
        /*
         * ⚠ 本文生成中はDOM変更が大量に発生するため、
         *   まとめて250msに1回だけ動かします。
         */
        let installScheduled = false;

        new MutationObserver(function () {

            if (installScheduled) {
                return;
            }

            installScheduled = true;

            setTimeout(function () {
                installScheduled = false;
                install();
            }, 250);

        }).observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );

        /*
         * 既に保存済みの一覧と送り先も共有しておきます
         */
        mirrorStates(loadStates());
        mirrorTarget(currentTargetKey());

        installReverseReceiver();

        installViewerButton();

        installSeishoButton();
        installPlanButton();
        installToolRow();

        let mirroredTitle = planTitle();

        setInterval(function () {

            installSeishoButton();
            installPlanButton();
            installToolRow();
            updatePlanButton();
            updateModeButton();
            updateCharsButton();

            /*
             * 作品が切り替わったら、キャラ画像スクリプト用の
             * 共有一覧も、その作品のものに差し替えます
             */
            const title = planTitle();

            if (title !== mirroredTitle) {
                mirroredTitle = title;
                mirrorStates(loadStates());
            }

        }, 1500);

        setInterval(installViewerButton, 3000);
    }


    if (IS_CHAT) {

        installGrokReceiver();

        installReverseButton();

        /*
         * GrokもClaudeも画面を組み替えるので
         * ボタンが消えたら作り直します
         */
        setInterval(installReverseButton, 2000);
    }

})();
