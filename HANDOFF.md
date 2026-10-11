# AIのべりすと ユーザースクリプト 引き継ぎメモ（刷新後）

2026-10-11 更新。新しいチャットで続きを始めるときに最初に読むメモ。
刷新前の控えと、刷新を始めたときのメモは `ainovel-before-renewal/`（その中の `HANDOFF.md`）にある。

## 作業のルール

- スマホで作業しているので、コードの修正は差分ではなく全文で出す。
- 頼んでいないボタンや機能を勝手に足さない。
- 返事は日本語で書く（英語にしない）。
- 配布はこのリポジトリに置いて、Violentmonkeyの「URLからインストール」で入れる。
  URLの形：`https://raw.githubusercontent.com/YUUKI490/userscripts/main/ファイル名.user.js`
- Violentmonkeyは `@name` と `@namespace` が同じなら上書き更新になる。新しく作るスクリプトの `@namespace` は `yuuki490-ainovel`。
- raw.githubusercontent.com は最大5分キャッシュされる。更新直後は古い版が入るので「5分待ってから入れて」と伝える。すぐ試すときはコミットのハッシュを入れたURL（`.../userscripts/<コミットID>/ファイル名.user.js`）を渡す（ただしその版に固定されるので、次からはふだんのURLで入れ直してもらう）。

## 今使っているスクリプト（5本）

| スクリプト | ファイル | 版 | 役割 |
|---|---|---|---|
| AIブロック追加 | ainovel-add-ai-block.user.js | 2.2 | 仮ボタン「➕」で入力パネル。ユーザー欄＋AI欄（書き出し）→「続ける」でユーザー＋AIブロックを作り、のべりすとの「続ける」を押す。テンプレ1〜3と⚙。テンプレ内の `{章}` を章番号に置き換え（黄色いボタンで 次章／続き／断章 を切り替え） |
| QuickPaste | ainovel-quickpaste.user.js | 2.4.0 | 刷新前のまま。TXTの「名前(説明)」辞書から名前を入力欄へ。`ainovel_brainwash_states` で洗脳中のキャラを紫表示 |
| 生成後の自動処理 | ainovel-after-generate.user.js | 1.4 | 生成完了を見張る。途中切れ（最後が句読点・記号でない、または「」『』（）が閉じていない）なら「続ける」を押す（最初の生成も含めて5回まで。5回目でも切れていたら最後の行を消す）。ちゃんと終わったら「脚注まとめ係」のプチボットを実行し、脚注を差し替え、洗脳状態を保存。脚注欄の下に「↩ 脚注を戻す」 |
| 縦書き表示 | ainovel-tategaki.user.js | 1.2 | 仮ボタン「縦」で本文を縦書きパネルにかぶせ表示（ユーザーのブロックは表示しない）。生成で自動更新、最新（左端）に追従。パネルの「✍ 入力」でAIブロック追加のパネルを開く。⚙で文字の大きさ（12〜36px）と行間（1.2〜3.0） |
| キャラ画像 | ainovel-char-image.user.js | 1.5 | 縦書きパネルのセリフの頭に顔画像。括弧の前の名前は画像の上へ移す。洗脳中は「名前_洗脳」の画像。仮ボタン「顔」で登録画面（画像を選んで名前を入れて登録→対応表にも自動で追加） |

- 刷新前の「途中切れ自動続行」（ainovel-auto-continue.user.js）は「生成後の自動処理」に入ったので使わない。
- 刷新前の「縦書き表示パネル」「キャラ画像表示＋一括設定」もオフにしてもらっている。
- 仮ボタンは画面左下に縦に並んでいる（下から ➕ → 縦 → 顔）。あとでツールパレットを作り直してまとめる予定。

## スクリプト同士のつながり

- 縦書き表示の「✍ 入力」は、AIブロック追加の仮ボタン（`#ainovel-add-ai-block-btn`）を代わりに押している。
- キャラ画像は、縦書き表示のパネル（`#ainovel-tategaki-scroller`）の中の `.tg-line` を見て顔を入れる。縦書き表示が本文を作り直すと入れ直す。
- キャラ画像の保存場所は刷新前と同じ（IndexedDB `ainovel_character_image_db` の `images`、対応表は localStorage `ainovel_character_image_map`、大きさは `ainovel_character_image_display_settings`）。
- 洗脳状態一覧（localStorage `ainovel_brainwash_states`、`名前=状態` を1行ずつ）は、生成後の自動処理が書き、QuickPasteとキャラ画像が読む。作品ごとの控えは `ainovel_brainwash_states:作品名`。状態に「なし」が入っていれば洗脳されていない扱い（キャラ画像は「判断できない」も洗脳なし扱い）。
- 名前の照らし合わせ：空白を無視、2文字以上で片方がもう片方を含めば同じ人。洗脳状態の保存ではキャラクターブックのタグ（`input.witags`）でフルネームに直す。キャラ画像はフルネームの終わりがセリフの名前と一致すれば同じ人。

## 脚注まとめ係（プチボット）と脚注の差し替え

- プチボットの名前に「脚注まとめ係」を入れる（スクリプトはこの文字で探す）。出力先は「プチボット専用欄に出力する」。
- 出力の形：`[場面：〜]`、`[人物名：〜]`（「：」は全角）、ハイフンだけの区切り線、その下に `人物名=状態` を1行ずつ。
- 脚注の差し替え：`[場面：` は差し替え（なければ最初の人物段落の前へ）。同じ名前の `[人物名：` は新しい段落に差し替え。新しく出た人物は最後の人物段落の後ろへ。出てこなかった人物、タグ（`[ジャンル:〜]` のような半角「:」のもの）、そのほかの段落は残す。
- 共通プロンプトと作品ごとの決まりの書き方は `ainovel-template/AIのべりすと作品作成・共通テンプレート.txt` の「10. プチボット」。
- 提案だけしてテンプレートにはまだ入れていないもの：場面の段落から「ここまでの経緯」をやめ、日時・場所・いる人・今起きていること・これからの予定だけにする案（場面100字・人物120字）。本文のプロンプトに足す【文章のリズム・文体ルール】（「。」だらけの短文を防ぐ）。入れるかどうかは未定。

## のべりすと画面（novel2・チャットUI）で調べたこと

**本文**
- 本文欄 `#data_container` の中に `.data_block`。種類は `.data_edit` のクラス（`plaintext` / `user` / `assistant`）。中身は `data-raw-markdown` 属性にもある。
- `createDataBlockElement(0, [{ cat: 'User' か 'Assistant', text }])` で種類を指定してブロックを作れる。作ったあと `AttachListeners()` → `ApplyIconRules()` → `VisualChange()` → `CopyContent()` → `syncDOMToStorageDebounced(null)`。
- 生成中は `#loading_anim` が見える（中に「中断する」`#btn_aioutput_abort`）。生成完了直後は、AIブロックがまだ入っていないことがあるので、最後のブロックがAIのブロックになって中身が落ち着くまで待ってから判定する。
- 指示の入力欄 `#chat_field`、「続ける」`#getcontinuation_chat`、作品名 `#data_title`。

**脚注・キャラクターブック**
- 脚注 `textarea#authorsnote`（最大6000字）。キャラクターブックのタグ `input#witagN`（`.witags`）、本文 `textarea#wientryN`。

**プチボット**
- 各プチボット：囲み `#petitbotareaN`、名前 `#petitbot_nameN` / `#petitbot_name_displayN`、プロンプト `#petitbot_promptN`（最大3000字）、出力先のプルダウン `#petitbot_outputN`（`output_assistant`＝本文 / `output_petitbot`＝専用欄）、実行ボタンは囲みの中の `.btn-petitbot-chat`（サイトの `ExecutePetitbot(N)`）。
- 専用欄 `#petitbot_output_area`：出力 `textarea#petitbot_output_assistant`、状態 `#petitbot_output_info`（生成中は「生成中」）、反映ボタン `#petitbot_output_apply`。
- プチボットの出力の長さ `petitbot_length` は画面にない隠し項目で、上限 `petitbot_length_maxsize` は200。上げられないので、出力が切れるときは字数を減らす。
- `.novel2` では `custombot` に `name` / `overview` / `prompt` / `selector` / `collapsed` で入る。

## テンプレート置き場

- `ainovel-template/`：作品作成の共通テンプレート、QuickPaste用辞書の作成テンプレート、テンプレ適用テスト.novel2。
- このリポジトリは公開なので、本番の作品ファイルを置くときは注意。

## 次にやりたいこと（候補）

- ツールパレットの作り直し（仮ボタン3つをまとめる）。
- 縦書き表示で、テンプレの前置き（「このリクエストに応じて〜」と罫線）を隠すかどうか。
