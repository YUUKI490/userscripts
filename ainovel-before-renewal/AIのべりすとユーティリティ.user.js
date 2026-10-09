// ==UserScript==
// @name         AIのべりすとユーティリティ
// @namespace    https://ai-novelist-share.geo.jp/
// @version      0.25.0
// @description  「Ctrl+/」で選択範囲の行の上下に「@/*」と「@*/」を追加/削除する機能と、リトライ・Undo・Redoする前に確認ダイアログを出す機能と、本文入力欄の分割を複数文コメントや最新の出力文(色の変わっている部分)の途中になるのを避ける機能と、@endpointの前に出力するときは@endpointの位置にスクロールする機能と、Redoを3回押した時にもUndo履歴を挿入する機能と、サーバーに送信するテキストを確認する機能と、最大20回分まで過去の出力テキストの履歴を確認する機能と、トークンとして読み取れない文字をハイライトする機能と、特定の文字を含むトークンを検索できる機能と、選択テキストを任意のサイトで検索する機能と、本文に画像を挿入する機能と、編集ページを開いてからの出力数カウント表示などを追加します。※Chrome/Firefoxで動作確認
// @author       しらたま
// @match        https://ai-novel.com/novel.php
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ai-novel.com
// @updateURL    https://github.com/whiteball/ainovelist_user_script/raw/refs/heads/main/scripts/ai_novelist_utility.user.js
// @downloadURL  https://github.com/whiteball/ainovelist_user_script/raw/refs/heads/main/scripts/ai_novelist_utility.user.js
// @supportURL   https://github.com/whiteball/ainovelist_user_script
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @grant        none
// @tag          ai-novelist
// @tag          utilities
// ==/UserScript==

/*
更新履歴

2025/12/03  0.25.0  チャットGUIでUndo/Redo前の確認ダイアログが出なかったのを修正。
                    すぴこさま/でりだ-03では全文字が使用できるので、これらのモデルが選択されているときは使用不可文字のハイライトを停止した。
                    使用不可文字のハイライトの装飾が、送信テキストにも残る不具合を修正。
                    開発版GUIでthinkブロックがあるときに表示が崩れるのを修正。
                    goo辞書サービス終了に伴い、デフォルトの検索ショートカットから削除。
2025/02/01  0.24.4  すぴこさまモデルを選択したときにトークナイザの判定が正しく行われるようにした。
2024/12/30  0.24.3  出力履歴が正しく描画されいなかったし、コピペ時の色分け維持も機能していなかった不具合を修正。
2024/12/08  0.24.2  本文にフォーカスがあたっているとき、Alt+Iを押すと空のfontタグを挿入する機能を追加。挿入箇所で色分けの範囲が途切れるため、AI出力部分を編集する際に人間が入力した部分にまで色分けが適用されてしまうことを抑制することが可能。なお、文末に挿入した場合は、キャレットが移動していないように見えても一度右矢印キーを押さないと、デフォルト色に戻らない。
                    AI出力部分の端に@／＊や@＊／がある場合は、それらがAI出力部分の外側に出るようにした。
                    AI出力色を残す設定の場合に、出力履歴からコピペしても色分けを維持するようにした。ただし、その出力をしたときにAI出力色を残す設定になっていた場合に限る。
                    AI出力部分にマウスカーソルを乗せたときに、その部分に囲み線を表示する設定を追加。
2024/11/02  0.24.1  このスクリプトで追加したメニュー切り替え丸ボタンの色が、カラースキーマ設定に従っていなかったのを修正。
                    AI出力色を残す設定の場合のタイムスタンプをUNIX時間から、人間でも読みやすいYYYY/MM/DD HH:ii:ss形式に変更。
                    AI出力部分にマウスカーソルを乗せたときに、保存しているタイムスタンプがあればツールチップとして表示する設定を追加。
                    AI出力色を残す設定の場合にUndo履歴でも色分けして表示する設定を追加。
                    AI出力色を残す設定の場合に、AI出力部分をコピペしたときに色分けを維持する設定を追加。
2024/10/25  0.24.0  @startpoint @breakの色分けが適用されるようにした。
                    AI出力の色表示を残す設定にしているのに、その色が消えてしまう不具合を修正。
                    GUIv3がAIのべりすとサイト上の設定からも消えているので、関連コードを削除。
                    サイドメニュー表示の時の禁止ワード除外リスト・適用中の禁止ワードとバイアスの表の幅がメニューの幅を超過していた不具合を修正。
                    出力文字数のカウントで改行が4文字としてカウントされていた不具合を修正。
                    @endpointがあっても末尾に挿入する機能が動いていなかった不具合を修正。
                    シャーディング(本文の分割)境界の調整機能を全面的に書き換え。ひとかたまりのAI出力の途中に境界が来ても、できるだけ色分けが失われないようにした。
                    AI出力色を残す場合に、その色分けタグにタイムスタンプを仕込むようにした。
2024/06/17  0.23.5  GUIv2：使用可能文字の判定処理にモデルがnext-previewの場合を追加。
2024/05/19  0.23.4  GUIv2：スーパーとりんさまのバリエーション（カラフル・ソリッド）で使用可能文字の判定などが通常とりんさま相当になってしまう不具合を修正。
2023/11/29  0.23.3  GUIv2：サイドメニューが有効なときは、履歴が横から出てくるボタンを表示しないようにした。
2023/10/15  0.23.2  GUIv2：装飾タグによるマークアップが機能しないのを修正。
2023/08/28  0.23.1  GUIv2：インストラクトモードでアイコンが消えてしまうのを修正。
2023/06/24  0.23.0  GUIv2：スーパーとりんさま対応（トークンとして読み取れない文字が正しく反映されるようにした）。
2023/06/10  0.22.1  GUIv2：ハイパーロングタームメモリのURL変更に追従。
2023/06/10  0.22.0  GUIv2：ハイパーロングタームメモリへの登録用送信テキストが、送信テキスト確認に表示されてしまっていたのを修正。
2023/03/08  0.21.0  GUIv2：画像の挿入機能で、画像の数が多いと重くなるのを若干緩和した。
                    GUIv2：画像の挿入機能で、画像の名前を<<|>>区切りで指定できるようにした。
                            名前に「○○<<|>>××」と書くと、置換用のパターンの「{{name.0}}」が「○○」に、「{{name.1}}」が「××」に置き換えられる。
                            「{{name}}」は「{{name.0}}」と同じ扱いになる。なお、指定した部分以降の「{{name.数字}}」は、すべて空文字列(「」)に置換する。
                            置換後のフォーマットでも同様だが、画像が挿入される位置は「{{name}}」の部分で、「{{name.0}}」の部分には文字列のみが挿入される。
2023/01/19  0.20.0  GUIv2：本文入力欄の右側に、出力履歴の確認(メニューアイコン(右から2番目)で表示できるものと同じ)を追加。(スマホでは無効)
2023/01/06  0.19.2  GUIv2：Safariで適用中の禁止ワード/バイアスの表レイアウトが崩れるのを調整。
2023/01/05  0.19.1  GUIv2：画像の挿入機能が有効の場合、入力の確定置換を併用していないと送信文が壊れる不具合を修正。
2022/12/15  0.19.0  GUIv2：送信テキスト確認で禁止ワードとバイアスも確認できるようにした。
                    GUIv2：禁止ワードを除外できる設定を追加。
2022/11/23  0.18.4  GUIv2：トークンの検索で「\n」や「/」などの検索結果が正しくなかったのを修正。
                    GUIv2：トークンの検索の結果を、キャラクターブックの@biasのフォーマットに変更するオプションを追加。
                    GUIv2：環境設定の折りたたみの中にあった設定群を、別の折りたたみに分離した。
2022/11/02  0.18.3  GUIv2：画像の挿入機能が有効の場合、不必要な表示の更新で出力文のちらつきが発生するのを修正。
2022/11/02  0.18.2  GUIv2：画像の挿入機能の修正。詳細は以下の通り。
                            ZIPファイルが圧縮設定になっていなかったのを修正。
                            置換後のフォーマットの追加。
                            ZIPから設定を読み込んだときに画像を消去できない不具合を修正。
                            画像の幅と高さの扱いが設計意図通りで無かったのを修正。その説明文を追加。
                            続きを書く/リトライボタンを押したときに、ボタンまでスクロールするオプションを追加。
                            (内部的な変更)先読み言明を使用していた正規表現を、後読み言明に書き換え。
                            (内部的な変更)不要な属性を削除し、スタイルをheadのstyleにまとめた。
                            (内部的な変更)一部コードを整理して、コメントを追加。
2022/11/01  0.18.1  GUIv2：画像の挿入が向こうの場合に、出力がundefinedになってしまう不具合の修正。
2022/10/31  0.18.0  GUIv2：本文欄の行頭の任意のテキストに対して、画像を挿入する機能を追加。
2022/09/21  0.17.4  GUIv2/v3：全角のバックスラッシュ(＼)が認識トークンになっていなかった不具合を修正。
2022/09/19  0.17.3  GUIv2：本文欄の背景の位置の選択が公式に取り込まれたので削除。
2022/09/10  0.17.2  GUIv2：本文欄の背景の位置を9方向から選択できるようにした。
                    GUIv2：公式に機能を取り込まれた関係で、同じ名前のlocalStorageのキーに設定を保存しているため、設定の意図しない上書きが発生する可能性があるのを緩和した。
2022/08/21  0.17.1  GUIv2：やみおとめ使用時、ハイライト対象の文字に0u200cが含まれていなかったのを修正。
                    GUIv2：UNDO履歴の挿入と、履歴の履歴でのUNDO一覧の表示上限を上書きできるようにした。デフォルトは98。最大99999、最小10。環境設定から設定可能。
                    GUIv2：このスクリプトが読み込まれるタイミングによっては、追加アイコンの表示がずれたり、テキストエリアにダークモードが反映されないのを改善。
2022/08/19  0.17.0  GUIv2：本文欄で選択したテキストを、任意のサイトで検索した結果を新規タブに表示するキーボードショートカットを追加。環境設定の一番下から最大9件のサイトの設定が可能。
2022/08/09  0.16.0  GUIv2：本文欄の背景を設定する機能が公式に取り込まれたので削除。
                    GUIv2：編集ページでモデルを切り替えた場合、使用できない文字の判定やトークン検索の対象が切り替わらない不具合を修正。
                    GUIv2/v3：Firefoxで「最後にローカル保存した日時」が表示されないのを修正。
2022/08/03  0.15.3  GUIv2：背景画像設定周りのUIの当たり判定がずれていたのを修正。
2022/08/03  0.15.2  GUIv2：本文欄の背景画像の拡大縮小設定を追加。
2022/08/03  0.15.1  GUIv2：本文欄の背景がダークモードに対応していなかったのを修正。
2022/08/03  0.15.0  GUIv2：本文欄の背景にPC/スマホ内の画像を設定できるようにした。画像ファイル自体はこのスクリプトでは保存しないので、ページを開くごとに読み直す必要がある。
                    GUIv2/v3：全角の大括弧［］が認識トークンになっていなかった不具合を修正。
2022/07/26  0.14.1  GUIv2：UserScriptの読み込みタイミングによっては、環境設定がデフォルトに戻ってしまう不具合を対策。
2022/07/25  0.14.0  GUIv2：禁止ワードの下に、特定の文字を含むトークンを検索できるフォームを追加。
2022/06/15  0.13.3  GUIv2/v3：ハイライト対象の文字に全角ハイフンマイナス（－）が含まれていたのを修正。
2022/06/15  0.13.2  GUIv3：0.13.0以降、ボタンが表示されなくなっていたのを修正。
2022/06/07  0.13.1  GUIv2：サロゲートペアの文字が常にハイライトするようになっていたのを修正。
2022/06/04  0.13.0  GUIv2：トークンとして読み取れない文字のハイライトをやみおとめ20Bに対応。
                    GUIv2：AI出力後、メモリ/脚注を置換するスクリプトのオプションを追加。
                           使い方：種別を「使用しない」に設置し置換対象がメモリなら「(?:M){0}」、脚注なら「(?:A){0}」をINの先頭に書く。それに続けてAIの出力にマッチする正規表現を書く。OUTには「メモリ/脚注にマッチする正規表現<|>置換後のテキスト」を書く。OUTでは特殊な変数として「#数字#」が使える。これはOUTを正規表現として解釈する前に、INに書いた正規表現のキャプチャでその部分を置換する。
                           例：IN:(?:M){0}(.+)にいる。/OUT:\[場所：.+\]<|>[場所：#1#]という設定で出力が「大きな広場にいる。」なら、メモリの「[場所：～～]」が「[場所：大きな広場]」に置換される。
2022/05/18  0.12.0  GUIv2/v3：情報表示に最後にローカル/リモートへ保存した日時を追加。
2022/05/17  0.11.4  GUIv2：文字数がシャーディング上限*n+シャーディング上限/2（PCの場合だと4000文字、12000文字……）ぐらいのとき、本文末での分割回避が誤動作するのを修正。
2022/05/16  0.11.3  GUIv2：シャーディングの分割が本文末近くでは起きないようにする変更が、最後の一行を消してしまう不具合を修正。
2022/05/16  0.11.2  GUIv2：トークンとして読み取れない文字から、単独の濁点記号を除外。シャーディングの分割が本文末近くでは起きないように変更。
2022/04/24  0.11.1  GUIv3向けのダイアログに幅と高さの調整ボタンを追加。ダイアログを表示したときに、そのダイアログが常に一番上に来ないのを修正。
2022/04/23  0.11.0  GUIv3向けに、送信テキスト、履歴の履歴、情報の各ダイアログを表示するボタンを追加。PCの場合、ダイアログはドラッグで移動可能(Firefoxはドラッグがもっさりしています)。
2022/04/20  0.10.12 シャーディング境界の手前にコメントがあるとき、本文が一行ごとに区切られてしまうのを修正。
2022/04/15  0.10.11 公式で@endpointの認識位置が最後に出現した場所から、最初に出現した場所に変わったのでそれに追随した。
2022/04/15  0.10.10 トークンとして読み取れない文字をハイライトしているときに、ハイライト部分の直後に改行があると見なされてしまうのを修正。
2022/04/03  0.10.9  @endpointがシャーディング境界に来たときに、Undo/Redoしたときに編集していないのに確認ダイアログが出るのを修正。
                    @endpointがシャーディング境界に来たときに、前の枠の最後に長い複数行コメントがあると、その中央にスクロールしてしまうのを修正。
                    コメント(@/ *～@* /)が連続するときに先に出てきた方のコメントに色分けが適用されないのを修正。@endpointがシャーディング境界に来たときに、出力文が@endpointがある側のシャーディング枠に入ってしまうのを修正。
2022/04/03  0.10.8  @endpointがシャーディング境界に来たときに、出力文が@endpointがある側のシャーディング枠に入ってしまうのを修正。
2022/04/01  0.10.7  @endpointがあるときに、シャーディングの区切りが常に@endpointの直前になってしまうのを修正。
2022/03/26  0.10.6  @endpointがシャーディング境界に来たときに、分割がおかしくなるのを修正。
2022/03/26  0.10.5  情報表示のデータをセッションに保存するようにした。これによりページを閉じない限り、再読込してもデータが維持されるようになった。
2022/03/24  0.10.4  情報表示におおよその本文の文字数を追加。
2022/03/23  0.10.3  リトライやUndo履歴を表示するときのスクロールが、@endpointのコメント領域の中心に繰るのを修正。
2022/03/21  0.10.2  入れ子になったコメント(@/ *～@* /)に正しくfontタグが設定されるように修正。
2022/03/21  0.10.1  @endpointがあっても出力文を一番下に挿入する設定を環境設定の一番下に追加。
2022/03/21  0.10.0  公式で@endpoint前への挿入が実装されたので、バッティングしないように関連機能を修正。
2022/03/19  0.9.3   接続エラーなどが出た後にリトライすると、編集していないのに確認ダイアログが出るのを修正。
2022/03/18  0.9.2   @endpointへのスクロールがずれるのを修正。
2022/03/17  0.9.1   オプションアイコンを横スクロール出来るようにする設定を環境設定の一番下に追加。
2022/03/17  0.9.0   編集ページを開いてからの出力数カウント表示を追加。
2022/03/17  0.8.2   履歴の履歴でまだ存在していない「○個前」を表示しないようにした。
2022/03/14  0.8.1   テスト用コードを消し忘れていたのを修正。
2022/03/14  0.8.0   トークンとして読み取れない文字をハイライトする機能を追加。
2022/03/11  0.7.1   「@/ *」と「@* /」の削除時が改行位置によっては正しく動かない不具合を修正。
2022/03/09  0.7.0   サーバー送信テキスト確認と履歴の履歴を、オプションアイコンのところに追加したアイコンから開閉出来るようにした。
2022/03/07  0.6.3   ロードタイミングがずれて履歴の履歴のボタンが表示出来ないときに、出力をするとエラーで止まるのを修正。
2022/03/03  0.6.2   インデントを調整。
2022/02/28  0.6.1   出力完了時に履歴の履歴の表示か切り替わらないのを修正。Firefoxでの読み込みタイミングがおかしいのをやや改善。
2022/02/28  0.6     最大20回分まで過去の出力テキストの履歴を確認する機能を追加。
2022/02/21  0.5     @endpointを囲っているfontタグに付けていたclassを削除。スクロール先の要素指定が固定になってしまっていたのを修正。このスクリプト自体の自動更新が動くようにした。(※ここからFirefoxでも動作確認)
2022/02/20  0.4     Redoを3回押した時にもUndo履歴を挿入する機能と、サーバーに送信したテキストを確認する機能を追加。インデントを調整。
2022/02/20  0.3     @endpointがあるときにその前に出力を挿入するを追加(※動作確認はChromeのみ)。
2022/02/14  0.2     本文入力欄の分割を複数文コメントや最新の出力文(色の変わっている部分)の途中になるのを避ける機能を追加。
2022/02/14  0.1     公開。「Ctrl+/」で選択範囲の行の上下に「@/ *」と「@* /」を追加/削除する機能と、リトライ・Undo・Redoする前に確認ダイアログを出す機能。
*/

(function () {
    'use strict';

    const defaultSearchSiteConfig = {
        '1': {
            // Weblio辞書
            url: 'https://www.weblio.jp/content/{word}',
        },
        '2': {
            // Weblio類語・シソーラス
            url: 'https://thesaurus.weblio.jp/content/{word}',
        },
    }

    const formatDate = function (dateTime, no_delimiter = false) {
        const date_del = no_delimiter ? '' : '/',
            center_del = no_delimiter ? '' : ' ',
            time_del = no_delimiter ? '' : ':'
        return dateTime.getFullYear() + date_del + ('0' + (dateTime.getMonth() + 1)).slice(-2) + date_del + ('0' + dateTime.getDate()).slice(-2) + center_del + ('0' + dateTime.getHours()).slice(-2) + time_del + ('0' + dateTime.getMinutes()).slice(-2) + time_del + ('0' + dateTime.getSeconds()).slice(-2)
    }

    const isV3Tokenizer = function () {
        const model_info = document.getElementById('modelinfo').textContent
        return (model_info.indexOf('やみおとめ') >= 0) || (model_info.indexOf('スーパーとりん') >= 0) || (model_info.indexOf('next-preview') >= 0) || (model_info.indexOf('すぴこさま') >= 0)
    }
    const isSpikoTokenizer = function () {
        const model_info = document.getElementById('modelinfo').textContent
        return (model_info.indexOf('すぴこさま') >= 0) || (model_info.indexOf('でりだ-0') >= 0)
    }

    const OUTPUT_TYPE_AI_OUTPUT = 0, OUTPUT_TYPE_TEXTCOLOR_AI = 1
    const getOutputType = function () {
        const cur_gui = window.currentGuiMode()
        const conversion_mode = window.currentTextConversionMode()
        if( cur_gui != "chat" && (conversion_mode == "decoration1" || conversion_mode == "decoration2") ) {
            return OUTPUT_TYPE_TEXTCOLOR_AI
        } else {
            return OUTPUT_TYPE_AI_OUTPUT
        }
    }

    let pref = JSON.parse(localStorage.user_script_pref ? localStorage.user_script_pref : '{}')
    if ( ! pref.undo_history_limit) {
        pref.undo_history_limit = 98
    }
    const loadPref = function () {
        const pref_temp = JSON.parse(localStorage.user_script_pref ? localStorage.user_script_pref : '{}')
        pref.bg_image_opacity = pref_temp.bg_image_opacity
        pref.bg_image_repeat = pref_temp.bg_image_repeat
        pref.bg_image_size = pref_temp.bg_image_size
        pref.bg_pos = pref_temp.bg_pos
    }
    const savePref = function () {
        if (pref) {
            localStorage.user_script_pref = JSON.stringify(pref)
        }
    }
    if (!pref.hasOwnProperty('search_url')) {
        pref.search_url = Object.assign({}, defaultSearchSiteConfig)
    }

    // 「Ctrl+/」で選択範囲の行の上下に「@/*」と「@*/」を追加/削除する機能 & 「Alt+数字」で選択した単語を検索する機能
    document.getElementById('data_container').addEventListener('keyup', function (event) {
        if (event.isComposing || event.keyCode === 229) {
            return;
        }
        if (event.altKey) {
            if (pref.search_url.hasOwnProperty(event.key) && pref.search_url[event.key].url !== '') {
                const selection = document.getSelection()
                const query = encodeURIComponent(selection.toString())
                window.open(pref.search_url[event.key].url.replace('{word}', query), '_blank', 'noopener,noreferrer')
                return false
            } else if (event.code === 'KeyI') {
                document.execCommand('insertHTML', false, '<font></font>')
                return false
            }
        }
        if (!(event.ctrlKey && event.code === 'Slash')) {
            return
        }
        const selection = document.getSelection()
        const range = selection.getRangeAt(0)
        let start = range.startContainer, end = range.endContainer;
        if (start.nodeName !== '#text') {
            start = start.childNodes[range.startOffset]
        }
        if (end.nodeName !== '#text') {
            end = end.childNodes[range.endOffset - 1]
        }

        if (start.textContent === '@/*' && end.textContent === '@*/') {
            if (start.nextSibling.tagName.toLowerCase() === 'br') {
                start.parentNode.removeChild(start.nextSibling)
            }
            start.parentNode.removeChild(start)
            if (end.previousSibling.nodeName === '#text' && end.previousSibling.textContent === '' && end.previousSibling.previousSibling.tagName && end.previousSibling.previousSibling.tagName.toLowerCase() === 'br') {
                end.parentNode.removeChild(end.previousSibling.previousSibling)
                end.parentNode.removeChild(end.previousSibling)
            } else {
                if (end.previousSibling.tagName && end.previousSibling.tagName.toLowerCase() === 'br') {
                    end.parentNode.removeChild(end.previousSibling)
                }
            }
            end.parentNode.removeChild(end)
            return
        }

        const before = document.createTextNode('@/*'), after = document.createTextNode('@*/')
        const brBefore = document.createElement('br'), brAfter = document.createElement('br')

        start.parentNode.insertBefore(before, start)
        start.parentNode.insertBefore(brBefore, start)
        end.parentNode.insertBefore(after, end.nextSibling)
        end.parentNode.insertBefore(brAfter, end.nextSibling)
        selection.removeAllRanges()
        selection.setBaseAndExtent(before, 0, after, 3)
    })

    // リトライ・Undo・Redoする前に確認ダイアログを出す機能
    const getcontinuationEvent = function () {
        for (const target of ['retry', 'undo', 'redo']) {
            let origin = document.querySelector('#' + target)
            if (origin.getAttribute('data-clone') === '1') {
                continue
            }
            let clone = origin.cloneNode()
            let parent = origin.parentNode
            clone.setAttribute('data-clone', '1')
            clone.removeAttribute('onclick')
            clone.addEventListener('click', function () {
                const data_undo = document.getElementById('data_undo').value.split('<|entry|>')
                let all = document.getElementsByClassName('data_edit');

                let currentText = '';
                const isBr = function (text) {
                    return text.substring(text.length - 4) === '<br>'
                }
                for (let e of all) {
                    currentText += e.innerHTML;
                    if (!isBr(currentText)) {
                        currentText += '<br>';
                    }
                }
                if (isBr(currentText)) {
                    currentText = currentText.slice(0, -4);
                }
                let cache = data_undo[localStorage.undo_last]
                if (isBr(cache)) {
                    cache = cache.slice(0, -4);
                }
                let cache_base = data_undo[1]
                if (isBr(cache_base)) {
                    cache_base = cache_base.slice(0, -4);
                }
                // タグ削除
                const removeTag = function (txt) {
                    return removeInsertImage(txt)
                        .replace(/(<br>)*<span[^>]*>/g, '')
                        .replace(/<\/span>/g, '')
                        .replace(/<font color="#aaaaaa"[^>]*>/g, '')
                        .replace(/<font class="textcolor_ai"[^>]*>/g, '')
                        .replace(/<\/font>/g, '')
                }
                cache = removeTag(cache)
                cache_base = removeTag(cache_base)
                currentText = removeTag(currentText)

                const last = Number(localStorage.undo_last)
                // 履歴が最初の時にUndoする場合と最後の時にRedoする場合はスルー
                const undo_text = document.getElementById('undo').value, redo_text = document.getElementById('redo').value
                if (!(target === 'undo' && last === 1 && undo_text !== 'History') && !(target === 'redo' && last + 1 === data_undo.length && redo_text !== 'History')) {
                    // 履歴と現在のテキストが異なっていたら確認を挟む
                    if (cache !== currentText && cache_base !== currentText && !window.confirm('テキストは編集されています。このまま続けると編集が失われます。\n続けますか？')) {
                        return
                    }
                }
                origin.dispatchEvent(new Event('click'))
            })
            origin.setAttribute('id', target + '-origin')
            origin.style.display = 'none'
            origin.style.visibility = 'hidden'
            parent.insertBefore(clone, origin)
        }
    }
    for (const getcontinuation of ['getcontinuation', 'getcontinuation_chat']) {
        document.getElementById(getcontinuation).addEventListener('click', getcontinuationEvent)
    }

    // デフォルトのスクロールを無効化
    const originalScrollTop = window.jQuery.fn.init.prototype.scrollTop
    const enableScrollTop = function () {
        window.jQuery.fn.init.prototype.scrollTop = originalScrollTop
    }
    const disableScrollTop = function () {
        window.jQuery.fn.init.prototype.scrollTop = (e) => { }
    }
    // endpointの検索
    const endpointSearch = function () {
        const all = document.getElementsByClassName('data_edit')
        let endpoint = -1, target = -1, target_pos = -1
        for (let i = all.length - 1; i >= 0; i--) {
            endpoint = all[i].innerHTML.lastIndexOf('<font color="#aaaaaa">@endpoint')
            if (endpoint === 0) {
                // 枠の先頭にいる
                if (i === 0) {
                    target = 0
                    target_pos = endpoint
                } else {
                    target = i - 1
                    target_pos = all[target].innerHTML.length
                }
            } else if (endpoint > 0 && all[i].innerHTML.slice(endpoint - 4, endpoint) === '<br>') {
                target = i
                target_pos = endpoint - 4
            }
        }
        return target < 0 ? false : [all, target_pos, target]
    }
    // endpointの直前にスクロール
    const endpointScroll = function (target_element) {
        let $ = window.jQuery
        if (pref.force_insert_last) {
            $("#data_container").scrollTop($("#data_edit").height() * 4096)
            return
        }
        const result = endpointSearch()
        if (result !== false) {
            const [all, endpoint, target] = result
            const top = window.scrollY, left = window.scrollX
            if (target_element) {
                let ai_output
                if (target_element.substr(0, 1) === '.') {
                    ai_output = document.querySelector(target_element + ':last-of-type')
                } else {
                    ai_output = document.getElementById(target_element)
                }
                if (ai_output) {
                    ai_output.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'start' })
                }
            } else {
                let endpoint_target = undefined
                for (const font_tag of all[target].querySelectorAll('font[color="#aaaaaa"]')) {
                    if (font_tag.innerHTML.slice(0, '@endpoint'.length) === '@endpoint') {
                        endpoint_target = font_tag
                        break
                    }
                }
                if (endpoint_target) {
                    if (endpoint_target.previousSibling) {
                        endpoint_target.previousSibling.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'start' })
                    } else {
                        endpoint_target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'start' })
                    }
                } else {
                    const temp_element = document.createElement('span')
                    all[target].appendChild(temp_element)
                    temp_element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'start' })
                    all[target].removeChild(temp_element)
                }
            }
            window.scrollTo({ top: top, left: left, behavior: 'auto' })
        } else {
            $("#data_container").scrollTop($("#data_edit").height() * 4096);
        }
    }

    const t = !0
    const char_list = {
        ' ': t, '　': t, '!': t, '"': t, '#': t, '$': t, '%': t, '&': t, '\'': t, '(': t, ')': t, '*': t, '+': t, ',': t, '-': t, '.': t, '/': t, '0': t, '1': t, '2': t, '3': t, '4': t, '5': t, '6': t, '7': t, '8': t, '9': t, ':': t, ';': t, '<': t, '=': t, '>': t, '?': t, '@': t, 'A': t, 'B': t, 'C': t, 'D': t, 'E': t, 'F': t, 'G': t, 'H': t, 'I': t, 'J': t, 'K': t, 'L': t, 'M': t, 'N': t, 'O': t, 'P': t, 'Q': t, 'R': t, 'S': t, 'T': t, 'U': t, 'V': t, 'W': t, 'X': t, 'Y': t, 'Z': t, '[': t, '\\': t, ']': t, '^': t, '_': t, 'a': t, 'b': t, 'c': t, 'd': t, 'e': t, 'f': t, 'g': t, 'h': t, 'i': t, 'j': t, 'k': t, 'l': t, 'm': t, 'n': t, 'o': t, 'p': t, 'q': t, 'r': t, 's': t, 't': t, 'u': t, 'v': t, 'w': t, 'x': t, 'y': t, 'z': t, '{': t, '|': t, '}': t, '~': t, '«': t, '®': t, '°': t, '±': t, '·': t, '»': t, 'Á': t, 'Å': t, 'É': t, 'Ö': t, '×': t, 'Ø': t, 'ß': t, 'à': t, 'á': t, 'â': t, 'ã': t, 'ä': t, 'å': t, 'æ': t, 'ç': t, 'è': t, 'é': t, 'ê': t, 'ë': t, 'ì': t, 'í': t, 'î': t, 'ï': t, 'ð': t, 'ñ': t, 'ò': t, 'ó': t, 'ô': t, 'ö': t, 'ø': t, 'ù': t, 'ú': t, 'ü': t, 'ý': t, 'ā': t, 'ă': t, 'ć': t, 'Č': t, 'č': t, 'ē': t, 'ě': t, 'ī': t, 'ı': t, 'ł': t, 'ō': t, 'ş': t, 'Š': t, 'š': t, 'ū': t, 'Ž': t, 'ž': t, 'ə': t, 'ˈ': t, 'ː': t, '́': t, 'Γ': t, 'Δ': t, 'Ζ': t, 'Λ': t, 'Σ': t, 'Ω': t, 'α': t, 'β': t, 'γ': t, 'δ': t, 'ε': t, 'ζ': t, 'η': t, 'θ': t, 'ι': t, 'κ': t, 'λ': t, 'μ': t, 'ν': t, 'ο': t, 'π': t, 'ρ': t, 'ς': t, 'σ': t, 'τ': t, 'φ': t, 'χ': t, 'ω': t, 'А': t, 'Б': t, 'В': t, 'Д': t, 'К': t, 'М': t, 'О': t, 'П': t, 'Р': t, 'С': t, 'Т': t, 'а': t, 'б': t, 'в': t, 'г': t, 'д': t, 'е': t, 'з': t, 'и': t, 'й': t, 'к': t, 'л': t, 'м': t, 'н': t, 'о': t, 'п': t, 'р': t, 'с': t, 'т': t, 'у': t, 'х': t, 'ч': t, 'ы': t, 'ь': t, 'я': t, 'ו': t, 'י': t, 'ا': t, 'ب': t, 'ة': t, 'ت': t, 'ج': t, 'ح': t, 'د': t, 'ر': t, 'س': t, 'ع': t, 'ق': t, 'ل': t, 'م': t, 'ن': t, 'ه': t, 'و': t, 'ي': t, 'ی': t, 'र': t, 'ा': t, '्': t, 'ก': t, 'ง': t, 'ด': t, 'ต': t, 'ท': t, 'น': t, 'พ': t, 'ม': t, 'ย': t, 'ร': t, 'ล': t, 'ว': t, 'ส': t, 'ห': t, 'อ': t, 'ั': t, 'า': t, 'ิ': t, 'ี': t, 'ุ': t, 'เ': t, '่': t, '་': t, '‐': t, '–': t, '—': t, '―': t, '‘': t, '’': t, '“': t, '”': t, '†': t, '•': t, '‰': t, '′': t, '※': t, '⁄': t, '←': t, '↑': t, '→': t, '⇒': t, '⇔': t, '∀': t, '∈': t, '−': t, '∞': t, '∶': t, '≒': t, '≤': t, '≪': t, '≫': t, '─': t, '┗': t, '■': t, '□': t, '▲': t, '△': t, '◆': t, '○': t, '◎': t, '●': t, '◯': t, '★': t, '☆': t, '♂': t, '♡': t, '♥': t, '♪': t, '♭': t, '、': t, '。': t, '々': t, '〇': t, '〈': t, '〉': t, '《': t, '》': t, '「': t, '」': t, '『': t, '』': t, '【': t, '】': t, '〒': t, '〔': t, '〕': t, '〜': t, 'ぁ': t, 'あ': t, 'ぃ': t, 'い': t, 'ぅ': t, 'う': t, 'ぇ': t, 'え': t, 'ぉ': t, 'お': t, 'か': t, 'が': t, 'き': t, 'ぎ': t, 'く': t, 'ぐ': t, 'け': t, 'げ': t, 'こ': t, 'ご': t, 'さ': t, 'ざ': t, 'し': t, 'じ': t, 'す': t, 'ず': t, 'せ': t, 'ぜ': t, 'そ': t, 'ぞ': t, 'た': t, 'だ': t, 'ち': t, 'ぢ': t, 'っ': t, 'つ': t, 'づ': t, 'て': t, 'で': t, 'と': t, 'ど': t, 'な': t, 'に': t, 'ぬ': t, 'ね': t, 'の': t, 'は': t, 'ば': t, 'ぱ': t, 'ひ': t, 'び': t, 'ぴ': t, 'ふ': t, 'ぶ': t, 'ぷ': t, 'へ': t, 'べ': t, 'ぺ': t, 'ほ': t, 'ぼ': t, 'ぽ': t, 'ま': t, 'み': t, 'む': t, 'め': t, 'も': t, 'ゃ': t, 'や': t, 'ゅ': t, 'ゆ': t, 'ょ': t, 'よ': t, 'ら': t, 'り': t, 'る': t, 'れ': t, 'ろ': t, 'わ': t, 'ゐ': t, 'ゑ': t, 'を': t, 'ん': t, '゚': t, 'ゝ': t, 'ゞ': t, 'ァ': t, 'ア': t, 'ィ': t, 'イ': t, 'ゥ': t, 'ウ': t, 'ェ': t, 'エ': t, 'ォ': t, 'オ': t, 'カ': t, 'ガ': t, 'キ': t, 'ギ': t, 'ク': t, 'グ': t, 'ケ': t, 'ゲ': t, 'コ': t, 'ゴ': t, 'サ': t, 'ザ': t, 'シ': t, 'ジ': t, 'ス': t, 'ズ': t, 'セ': t, 'ゼ': t, 'ソ': t, 'ゾ': t, 'タ': t, 'ダ': t, 'チ': t, 'ヂ': t, 'ッ': t, 'ツ': t, 'ヅ': t, 'テ': t, 'デ': t, 'ト': t, 'ド': t, 'ナ': t, 'ニ': t, 'ヌ': t, 'ネ': t, 'ノ': t, 'ハ': t, 'バ': t, 'パ': t, 'ヒ': t, 'ビ': t, 'ピ': t, 'フ': t, 'ブ': t, 'プ': t, 'ヘ': t, 'ベ': t, 'ペ': t, 'ホ': t, 'ボ': t, 'ポ': t, 'マ': t, 'ミ': t, 'ム': t, 'メ': t, 'モ': t, 'ャ': t, 'ヤ': t, 'ュ': t, 'ユ': t, 'ョ': t, 'ヨ': t, 'ラ': t, 'リ': t, 'ル': t, 'レ': t, 'ロ': t, 'ワ': t, 'ヰ': t, 'ヱ': t, 'ヲ': t, 'ン': t, 'ヴ': t, 'ヵ': t, 'ヶ': t, '・': t, 'ー': t,
        '一': t, '丁': t, '七': t, '万': t, '丈': t, '三': t, '上': t, '下': t, '不': t, '与': t, '丑': t, '且': t, '丕': t, '世': t, '丘': t, '丙': t, '丞': t, '両': t, '並': t, '中': t, '串': t, '丸': t, '丹': t, '主': t, '丼': t, '乂': t, '乃': t, '久': t, '之': t, '乏': t, '乖': t, '乗': t, '乙': t, '九': t, '乞': t, '也': t, '乱': t, '乳': t, '乾': t, '亀': t, '了': t, '予': t, '争': t, '事': t, '二': t, '于': t, '云': t, '互': t, '五': t, '井': t, '亘': t, '些': t, '亜': t, '亞': t, '亡': t, '亢': t, '交': t, '亥': t, '亦': t, '亨': t, '享': t, '京': t, '亭': t, '亮': t, '人': t, '什': t, '仁': t, '仄': t, '仇': t, '今': t, '介': t, '仏': t, '仔': t, '仕': t, '他': t, '仗': t, '付': t, '仙': t, '代': t, '令': t, '以': t, '仮': t, '仰': t, '仲': t, '件': t, '任': t, '企': t, '伊': t, '伍': t, '伎': t, '伏': t, '伐': t, '休': t, '会': t, '伝': t, '伯': t, '伴': t, '伸': t, '伺': t, '似': t, '伽': t, '佃': t, '但': t, '佇': t, '位': t, '低': t, '住': t, '佐': t, '佑': t, '体': t, '何': t, '余': t, '佛': t, '作': t, '佩': t, '佳': t, '併': t, '使': t, '侃': t, '來': t, '例': t, '侍': t, '侑': t, '供': t, '依': t, '侠': t, '価': t, '侮': t, '侯': t, '侵': t, '侶': t, '便': t, '係': t, '促': t, '俄': t, '俊': t, '俗': t, '俘': t, '保': t, '俟': t, '信': t, '俣': t, '修': t, '俯': t, '俳': t, '俵': t, '俸': t, '俺': t, '倉': t, '個': t, '倍': t, '倒': t, '倖': t, '候': t, '借': t, '倣': t, '値': t, '倦': t, '倫': t, '倭': t, '倶': t, '倹': t, '偉': t, '偏': t, '偕': t, '做': t, '停': t, '健': t, '偲': t, '側': t, '偵': t, '偶': t, '偽': t, '傀': t, '傅': t, '傍': t, '傑': t, '傘': t, '備': t, '催': t, '傭': t, '傲': t, '傳': t, '債': t, '傷': t, '傾': t, '僅': t, '働': t, '像': t, '僑': t, '僕': t, '僚': t, '僧': t, '僭': t, '僻': t, '儀': t, '儁': t, '億': t, '儒': t, '償': t, '儡': t, '優': t, '儲': t, '允': t, '元': t, '兄': t, '充': t, '兆': t, '先': t, '光': t, '克': t, '兌': t, '免': t, '兎': t, '児': t, '兗': t, '党': t, '兜': t, '入': t, '全': t, '兪': t, '八': t, '公': t, '六': t, '共': t, '兵': t, '其': t, '具': t, '典': t, '兼': t, '冀': t, '内': t, '円': t, '冉': t, '冊': t, '再': t, '冏': t, '冑': t, '冒': t, '冗': t, '写': t, '冠': t, '冤': t, '冥': t, '冨': t, '冪': t, '冬': t, '冲': t, '冴': t, '冶': t, '冷': t, '凄': t, '准': t, '凋': t, '凌': t, '凍': t, '凛': t, '凝': t, '凡': t, '処': t, '凧': t, '凪': t, '凰': t, '凱': t, '凶': t, '凸': t, '凹': t, '出': t, '函': t, '刀': t, '刃': t, '分': t, '切': t, '刈': t, '刊': t, '刑': t, '列': t, '初': t, '判': t, '別': t, '利': t, '到': t, '制': t, '刷': t, '券': t, '刹': t, '刺': t, '刻': t, '剃': t, '則': t, '削': t, '剌': t, '前': t, '剖': t, '剛': t, '剣': t, '剤': t, '剥': t, '剪': t, '副': t, '剰': t, '割': t, '創': t, '劇': t, '劉': t, '力': t, '功': t, '加': t, '劣': t, '助': t, '努': t, '劫': t, '励': t, '労': t, '効': t, '劾': t, '勃': t, '勅': t, '勇': t, '勉': t, '勒': t, '動': t, '勘': t, '務': t, '勝': t, '募': t, '勢': t, '勤': t, '勧': t, '勲': t, '勾': t, '勿': t, '匁': t, '匂': t, '包': t, '匈': t, '匍': t, '匐': t, '化': t, '北': t, '匝': t, '匠': t, '匡': t, '匪': t, '匹': t, '区': t, '医': t, '匿': t, '十': t, '千': t, '升': t, '午': t, '半': t, '卍': t, '卑': t, '卒': t, '卓': t, '協': t, '南': t, '単': t, '博': t, '卜': t, '占': t, '卦': t, '卯': t, '印': t, '危': t, '即': t, '却': t, '卵': t, '卸': t, '卿': t, '厄': t, '厘': t, '厚': t, '原': t, '厥': t, '厨': t, '厩': t, '厭': t, '厳': t, '去': t, '参': t, '又': t, '叉': t, '及': t, '友': t, '双': t, '反': t, '収': t, '叔': t, '取': t, '受': t, '叙': t, '叛': t, '叟': t, '叡': t, '叢': t, '口': t, '古': t, '句': t, '叩': t, '只': t, '叫': t, '召': t, '可': t, '台': t, '叱': t, '史': t, '右': t, '叶': t, '号': t, '司': t, '吃': t, '各': t, '合': t, '吉': t, '吊': t, '同': t, '名': t, '后': t, '吏': t, '吐': t, '向': t, '君': t, '吟': t, '吠': t, '否': t, '含': t, '吸': t, '吹': t, '吻': t, '吾': t, '呂': t, '呆': t, '呈': t, '呉': t, '告': t, '呑': t, '呟': t, '周': t, '呪': t, '味': t, '呼': t, '命': t, '咀': t, '咄': t, '咋': t, '和': t, '咎': t, '咤': t, '咬': t, '咲': t, '咳': t, '咸': t, '咽': t, '哀': t, '品': t, '哈': t, '哉': t, '員': t, '哥': t, '哨': t, '哭': t, '哲': t, '哺': t, '唄': t, '唆': t, '唇': t, '唐': t, '唖': t, '唯': t, '唱': t, '唾': t, '啄': t, '商': t, '問': t, '啓': t, '喀': t, '善': t, '喉': t, '喋': t, '喘': t, '喚': t, '喜': t, '喝': t, '喧': t, '喩': t, '喪': t, '喫': t, '喬': t, '喰': t, '営': t, '嗅': t, '嗚': t, '嗜': t, '嗣': t, '嘆': t, '嘉': t, '嘔': t,
        '嘗': t, '嘘': t, '嘩': t, '嘱': t, '嘲': t, '嘴': t, '噂': t, '噌': t, '噛': t, '器': t, '噴': t, '噺': t, '嚆': t, '嚇': t, '嚢': t, '嚥': t, '囁': t, '囃': t, '囚': t, '四': t, '回': t, '因': t, '団': t, '囮': t, '困': t, '囲': t, '図': t, '固': t, '国': t, '圀': t, '圃': t, '國': t, '圏': t, '園': t, '圓': t, '團': t, '土': t, '圧': t, '在': t, '圭': t, '地': t, '圳': t, '址': t, '坂': t, '均': t, '坊': t, '坐': t, '坑': t, '坡': t, '坤': t, '坦': t, '坪': t, '垂': t, '型': t, '垢': t, '垣': t, '埃': t, '埋': t, '城': t, '埔': t, '埜': t, '域': t, '埠': t, '埴': t, '執': t, '培': t, '基': t, '埼': t, '堀': t, '堂': t, '堅': t, '堆': t, '堕': t, '堡': t, '堤': t, '堪': t, '堯': t, '堰': t, '報': t, '場': t, '堵': t, '堺': t, '塀': t, '塁': t, '塊': t, '塑': t, '塔': t, '塗': t, '塘': t, '塙': t, '塚': t, '塞': t, '塩': t, '填': t, '塵': t, '塹': t, '塾': t, '境': t, '墓': t, '増': t, '墜': t, '墟': t, '墨': t, '墳': t, '墺': t, '墾': t, '壁': t, '壇': t, '壊': t, '壌': t, '壕': t, '士': t, '壬': t, '壮': t, '声': t, '壱': t, '売': t, '壷': t, '壺': t, '壽': t, '変': t, '夏': t, '夕': t, '外': t, '多': t, '夜': t, '夢': t, '大': t, '天': t, '太': t, '夫': t, '夭': t, '央': t, '失': t, '夷': t, '奄': t, '奇': t, '奈': t, '奉': t, '奎': t, '奏': t, '契': t, '奔': t, '奕': t, '套': t, '奘': t, '奚': t, '奠': t, '奢': t, '奥': t, '奨': t, '奪': t, '奮': t, '女': t, '奴': t, '奸': t, '好': t, '如': t, '妃': t, '妄': t, '妊': t, '妓': t, '妖': t, '妙': t, '妥': t, '妨': t, '妬': t, '妹': t, '妻': t, '妾': t, '姉': t, '始': t, '姑': t, '姓': t, '委': t, '姚': t, '姜': t, '姥': t, '姦': t, '姪': t, '姫': t, '姶': t, '姻': t, '姿': t, '威': t, '娘': t, '娠': t, '娥': t, '娩': t, '娯': t, '娶': t, '娼': t, '婁': t, '婆': t, '婉': t, '婚': t, '婢': t, '婦': t, '婿': t, '媒': t, '媚': t, '媛': t, '嫁': t, '嫉': t, '嫌': t, '嫡': t, '嬉': t, '嬢': t, '嬪': t, '嬰': t, '子': t, '孔': t, '孕': t, '字': t, '存': t, '孚': t, '孝': t, '孟': t, '季': t, '孤': t, '学': t, '孫': t, '孵': t, '學': t, '宅': t, '宇': t, '守': t, '安': t, '宋': t, '完': t, '宍': t, '宏': t, '宕': t, '宗': t, '官': t, '宙': t, '定': t, '宛': t, '宜': t, '宝': t, '実': t, '客': t, '宣': t, '室': t, '宥': t, '宦': t, '宮': t, '宰': t, '害': t, '宴': t, '宵': t, '家': t, '宸': t, '容': t, '宿': t, '寂': t, '寄': t, '寅': t, '密': t, '寇': t, '富': t, '寒': t, '寓': t, '寛': t, '寝': t, '察': t, '寡': t, '實': t, '寧': t, '寨': t, '審': t, '寮': t, '寵': t, '寶': t, '寸': t, '寺': t, '対': t, '寿': t, '封': t, '専': t, '射': t, '将': t, '尉': t, '尊': t, '尋': t, '導': t, '小': t, '少': t, '尖': t, '尚': t, '尤': t, '尭': t, '就': t, '尸': t, '尹': t, '尺': t, '尻': t, '尼': t, '尽': t, '尾': t, '尿': t, '局': t, '居': t, '屈': t, '届': t, '屋': t, '屍': t, '屏': t, '屑': t, '屓': t, '展': t, '属': t, '屠': t, '層': t, '履': t, '屯': t, '山': t, '岐': t, '岑': t, '岡': t, '岩': t, '岬': t, '岱': t, '岳': t, '岸': t, '峙': t, '峠': t, '峡': t, '峨': t, '峯': t, '峰': t, '島': t, '峻': t, '崇': t, '崋': t, '崎': t, '崑': t, '崔': t, '崖': t, '崗': t, '崙': t, '崩': t, '嵌': t, '嵐': t, '嵩': t, '嵯': t, '嶋': t, '嶺': t, '嶼': t, '嶽': t, '巌': t, '巖': t, '川': t, '州': t, '巡': t, '巣': t, '工': t, '左': t, '巧': t, '巨': t, '巫': t, '差': t, '己': t, '已': t, '巳': t, '巴': t, '巷': t, '巻': t, '巽': t, '巾': t, '市': t, '布': t, '帆': t, '希': t, '帖': t, '帛': t, '帝': t, '帥': t, '師': t, '席': t, '帯': t, '帰': t, '帳': t, '帷': t, '常': t, '帽': t, '幅': t, '幇': t, '幌': t, '幕': t, '幟': t, '幡': t, '幣': t, '干': t, '平': t, '年': t, '并': t, '幸': t, '幹': t, '幻': t, '幼': t, '幽': t, '幾': t, '庁': t, '広': t, '庄': t, '庇': t, '床': t, '序': t, '底': t, '店': t, '庚': t, '府': t, '度': t, '座': t, '庫': t, '庭': t, '庵': t, '庶': t, '康': t, '庸': t, '庾': t, '廃': t, '廈': t, '廉': t, '廊': t, '廓': t, '廖': t, '廟': t, '廠': t, '廣': t, '廬': t, '延': t, '廷': t, '建': t, '廻': t, '廿': t, '弁': t, '弄': t, '弊': t, '式': t, '弐': t, '弓': t, '弔': t, '引': t, '弘': t, '弛': t, '弟': t, '弥': t, '弦': t, '弧': t, '弩': t, '弱': t, '張': t, '強': t, '弼': t, '弾': t, '彅': t, '彌': t, '当': t, '彗': t, '彙': t, '形': t, '彦': t, '彩': t, '彪': t, '彫': t, '彬': t, '彭': t, '彰': t, '影': t, '彷': t, '役': t, '彼': t, '彿': t, '往': t, '征': t, '径': t, '待': t, '徊': t, '律': t, '後': t, '徐': t, '徒': t, '従': t, '得': t, '徘': t, '御': t, '徨': t, '復': t, '循': t, '微': t, '徳': t, '徴': t, '德': t, '徹': t, '徽': t, '心': t, '必': t, '忌': t,
        '忍': t, '志': t, '忘': t, '忙': t, '応': t, '忠': t, '快': t, '念': t, '忽': t, '怒': t, '怖': t, '怜': t, '思': t, '怠': t, '怡': t, '急': t, '性': t, '怨': t, '怪': t, '怯': t, '恋': t, '恐': t, '恒': t, '恕': t, '恣': t, '恥': t, '恨': t, '恩': t, '恪': t, '恭': t, '息': t, '恰': t, '恵': t, '悉': t, '悌': t, '悔': t, '悟': t, '悠': t, '患': t, '悦': t, '悩': t, '悪': t, '悲': t, '悶': t, '悼': t, '情': t, '惇': t, '惑': t, '惚': t, '惜': t, '惟': t, '惠': t, '惣': t, '惧': t, '惨': t, '惰': t, '想': t, '惹': t, '愁': t, '愉': t, '愍': t, '意': t, '愕': t, '愚': t, '愛': t, '感': t, '慄': t, '慈': t, '態': t, '慌': t, '慎': t, '慕': t, '慢': t, '慣': t, '慧': t, '慨': t, '慮': t, '慰': t, '慶': t, '憂': t, '憎': t, '憐': t, '憑': t, '憚': t, '憤': t, '憧': t, '憩': t, '憲': t, '憶': t, '憾': t, '懇': t, '應': t, '懐': t, '懲': t, '懸': t, '懺': t, '懿': t, '戊': t, '戌': t, '戍': t, '戎': t, '成': t, '我': t, '戒': t, '或': t, '戚': t, '戟': t, '戦': t, '戮': t, '戯': t, '戴': t, '戸': t, '戻': t, '房': t, '所': t, '扁': t, '扇': t, '扈': t, '扉': t, '手': t, '才': t, '打': t, '払': t, '托': t, '扮': t, '扱': t, '扶': t, '批': t, '承': t, '技': t, '抄': t, '把': t, '抑': t, '抒': t, '投': t, '抗': t, '折': t, '抜': t, '択': t, '披': t, '抱': t, '抵': t, '抹': t, '押': t, '抽': t, '担': t, '拉': t, '拌': t, '拍': t, '拐': t, '拒': t, '拓': t, '拗': t, '拘': t, '拙': t, '招': t, '拝': t, '拠': t, '拡': t, '括': t, '拭': t, '拮': t, '拳': t, '拵': t, '拶': t, '拷': t, '拼': t, '拾': t, '拿': t, '持': t, '指': t, '按': t, '挑': t, '挙': t, '挟': t, '挨': t, '挫': t, '振': t, '挺': t, '挽': t, '挿': t, '捉': t, '捌': t, '捏': t, '捕': t, '捗': t, '捜': t, '捧': t, '捨': t, '捩': t, '据': t, '捲': t, '捷': t, '捺': t, '捻': t, '掃': t, '授': t, '掌': t, '排': t, '掘': t, '掛': t, '掟': t, '掠': t, '採': t, '探': t, '接': t, '控': t, '推': t, '掩': t, '措': t, '掬': t, '掲': t, '掴': t, '掻': t, '掾': t, '揃': t, '揄': t, '揆': t, '揉': t, '描': t, '提': t, '揖': t, '揚': t, '換': t, '握': t, '揮': t, '援': t, '揶': t, '揺': t, '損': t, '搬': t, '搭': t, '携': t, '搾': t, '摂': t, '摘': t, '摩': t, '摯': t, '摺': t, '撃': t, '撒': t, '撚': t, '撤': t, '撥': t, '撫': t, '播': t, '撮': t, '撰': t, '撲': t, '撹': t, '擁': t, '操': t, '擢': t, '擦': t, '擬': t, '擲': t, '擾': t, '攀': t, '攘': t, '攣': t, '攪': t, '攫': t, '支': t, '攸': t, '改': t, '攻': t, '放': t, '政': t, '故': t, '敏': t, '救': t, '敗': t, '教': t, '敢': t, '散': t, '敦': t, '敬': t, '数': t, '整': t, '敵': t, '敷': t, '斂': t, '文': t, '斉': t, '斌': t, '斎': t, '斐': t, '斑': t, '斗': t, '料': t, '斛': t, '斜': t, '斡': t, '斤': t, '斥': t, '斧': t, '斬': t, '断': t, '斯': t, '新': t, '方': t, '於': t, '施': t, '旅': t, '旋': t, '族': t, '旗': t, '旛': t, '既': t, '日': t, '旦': t, '旧': t, '旨': t, '早': t, '旬': t, '旭': t, '旱': t, '旺': t, '昂': t, '昆': t, '昇': t, '昌': t, '明': t, '昏': t, '易': t, '昔': t, '星': t, '映': t, '春': t, '昧': t, '昨': t, '昭': t, '是': t, '昴': t, '昶': t, '昼': t, '晁': t, '時': t, '晃': t, '晋': t, '晏': t, '晒': t, '晟': t, '晦': t, '晧': t, '晩': t, '普': t, '景': t, '晰': t, '晴': t, '晶': t, '智': t, '暁': t, '暇': t, '暉': t, '暑': t, '暖': t, '暗': t, '暢': t, '暦': t, '暫': t, '暮': t, '暴': t, '曇': t, '曖': t, '曙': t, '曜': t, '曝': t, '曰': t, '曲': t, '曳': t, '更': t, '書': t, '曹': t, '曼': t, '曽': t, '曾': t, '替': t, '最': t, '會': t, '月': t, '有': t, '朋': t, '服': t, '朔': t, '朕': t, '朗': t, '望': t, '朝': t, '期': t, '朧': t, '木': t, '未': t, '末': t, '本': t, '札': t, '朱': t, '朴': t, '机': t, '朽': t, '杉': t, '李': t, '杏': t, '材': t, '村': t, '杓': t, '杖': t, '杜': t, '束': t, '条': t, '杣': t, '来': t, '杭': t, '杯': t, '東': t, '杵': t, '杷': t, '松': t, '板': t, '枇': t, '析': t, '枕': t, '林': t, '枚': t, '果': t, '枝': t, '枠': t, '枡': t, '枢': t, '枯': t, '架': t, '柄': t, '柊': t, '柏': t, '某': t, '柑': t, '染': t, '柔': t, '柘': t, '柚': t, '柩': t, '柯': t, '柱': t, '柳': t, '柴': t, '柵': t, '査': t, '柿': t, '栃': t, '栄': t, '栓': t, '栖': t, '栗': t, '栞': t, '校': t, '株': t, '核': t, '根': t, '格': t, '栽': t, '桁': t, '桂': t, '桃': t, '案': t, '桐': t, '桑': t, '桓': t, '桔': t, '桜': t, '桝': t, '桟': t, '桧': t, '桶': t, '桿': t, '梁': t, '梅': t, '梓': t, '梗': t, '條': t, '梢': t, '梧': t, '梨': t, '梯': t, '械': t, '梱': t, '梵': t, '梶': t, '棄': t, '棋': t, '棍': t, '棒': t, '棗': t, '棘': t, '棚': t, '棟': t, '棠': t, '森': t, '棲': t, '棹': t, '棺': t,
        '椀': t, '椅': t, '椋': t, '植': t, '椎': t, '椒': t, '検': t, '椿': t, '楊': t, '楓': t, '楔': t, '楕': t, '楚': t, '楠': t, '楡': t, '楢': t, '業': t, '楯': t, '極': t, '楷': t, '楼': t, '楽': t, '概': t, '榊': t, '榎': t, '榛': t, '榜': t, '榮': t, '榴': t, '槃': t, '槇': t, '構': t, '槌': t, '槍': t, '槐': t, '槓': t, '様': t, '槙': t, '槨': t, '槻': t, '槽': t, '槿': t, '樂': t, '樊': t, '樋': t, '標': t, '樟': t, '模': t, '権': t, '横': t, '樫': t, '樹': t, '樺': t, '樽': t, '橋': t, '橘': t, '橙': t, '機': t, '橿': t, '檀': t, '檄': t, '檎': t, '檗': t, '檜': t, '檣': t, '檻': t, '櫂': t, '櫃': t, '櫓': t, '櫛': t, '櫻': t, '欄': t, '欅': t, '欠': t, '次': t, '欣': t, '欧': t, '欲': t, '欺': t, '欽': t, '款': t, '歌': t, '歓': t, '止': t, '正': t, '此': t, '武': t, '歩': t, '歪': t, '歯': t, '歳': t, '歴': t, '死': t, '歿': t, '殆': t, '殉': t, '殊': t, '残': t, '殖': t, '殲': t, '殴': t, '段': t, '殷': t, '殺': t, '殻': t, '殿': t, '毀': t, '毅': t, '母': t, '毎': t, '毒': t, '比': t, '毘': t, '毛': t, '毫': t, '毬': t, '毯': t, '氏': t, '氐': t, '民': t, '気': t, '氣': t, '水': t, '氷': t, '永': t, '氾': t, '汀': t, '汁': t, '求': t, '汎': t, '汐': t, '汗': t, '汚': t, '汝': t, '江': t, '池': t, '汪': t, '汰': t, '汲': t, '決': t, '汽': t, '汾': t, '沂': t, '沃': t, '沈': t, '沌': t, '沓': t, '沖': t, '沙': t, '沛': t, '没': t, '沢': t, '沫': t, '河': t, '沸': t, '油': t, '治': t, '沼': t, '沿': t, '況': t, '泄': t, '泉': t, '泊': t, '泌': t, '法': t, '泗': t, '泡': t, '波': t, '泣': t, '泥': t, '注': t, '泰': t, '泳': t, '洋': t, '洒': t, '洗': t, '洙': t, '洛': t, '洞': t, '津': t, '洩': t, '洪': t, '洲': t, '活': t, '派': t, '流': t, '浄': t, '浅': t, '浙': t, '浚': t, '浜': t, '浦': t, '浩': t, '浪': t, '浬': t, '浮': t, '浴': t, '海': t, '浸': t, '涅': t, '消': t, '涌': t, '涙': t, '涛': t, '涜': t, '涯': t, '液': t, '涵': t, '涼': t, '淀': t, '淋': t, '淑': t, '淘': t, '淡': t, '淫': t, '淮': t, '深': t, '淳': t, '淵': t, '混': t, '添': t, '清': t, '渇': t, '済': t, '渉': t, '渋': t, '渓': t, '渕': t, '渚': t, '減': t, '渠': t, '渡': t, '渤': t, '渥': t, '渦': t, '温': t, '渫': t, '測': t, '渭': t, '港': t, '游': t, '渾': t, '湊': t, '湖': t, '湘': t, '湛': t, '湧': t, '湯': t, '湾': t, '湿': t, '満': t, '源': t, '準': t, '溜': t, '溝': t, '溢': t, '溥': t, '溪': t, '溶': t, '溺': t, '滄': t, '滅': t, '滋': t, '滑': t, '滓': t, '滝': t, '滞': t, '滬': t, '滲': t, '滴': t, '滸': t, '漁': t, '漂': t, '漆': t, '漉': t, '漏': t, '漑': t, '演': t, '漕': t, '漠': t, '漢': t, '漣': t, '漫': t, '漬': t, '漱': t, '漳': t, '漸': t, '漿': t, '潁': t, '潔': t, '潘': t, '潜': t, '潟': t, '潤': t, '潭': t, '潮': t, '潰': t, '潼': t, '澁': t, '澄': t, '澎': t, '澤': t, '澪': t, '澱': t, '澳': t, '激': t, '濁': t, '濃': t, '濠': t, '濡': t, '濤': t, '濫': t, '濯': t, '濱': t, '濾': t, '瀉': t, '瀋': t, '瀑': t, '瀕': t, '瀞': t, '瀧': t, '瀬': t, '瀾': t, '灌': t, '灘': t, '火': t, '灯': t, '灰': t, '灸': t, '灼': t, '災': t, '炉': t, '炊': t, '炎': t, '炒': t, '炙': t, '炭': t, '炳': t, '炸': t, '点': t, '為': t, '烈': t, '烏': t, '烙': t, '焉': t, '焔': t, '焙': t, '焚': t, '無': t, '焦': t, '然': t, '焼': t, '煉': t, '煌': t, '煎': t, '煕': t, '煙': t, '煤': t, '煥': t, '照': t, '煩': t, '煬': t, '煮': t, '煽': t, '熊': t, '熙': t, '熟': t, '熱': t, '熹': t, '熾': t, '燁': t, '燃': t, '燈': t, '燐': t, '燕': t, '燥': t, '燦': t, '燭': t, '燮': t, '燻': t, '爆': t, '爛': t, '爪': t, '爬': t, '爵': t, '父': t, '爺': t, '爽': t, '爾': t, '片': t, '版': t, '牌': t, '牒': t, '牙': t, '牛': t, '牝': t, '牟': t, '牡': t, '牢': t, '牧': t, '物': t, '牲': t, '特': t, '牽': t, '犀': t, '犠': t, '犬': t, '犯': t, '状': t, '狂': t, '狄': t, '狐': t, '狗': t, '狙': t, '狛': t, '狡': t, '狩': t, '独': t, '狭': t, '狸': t, '狼': t, '猛': t, '猟': t, '猥': t, '猪': t, '猫': t, '献': t, '猶': t, '猷': t, '猾': t, '猿': t, '獄': t, '獅': t, '獣': t, '獨': t, '獲': t, '玄': t, '率': t, '玉': t, '王': t, '玖': t, '玩': t, '玲': t, '珀': t, '珂': t, '珈': t, '珊': t, '珍': t, '珠': t, '珪': t, '班': t, '現': t, '球': t, '琅': t, '理': t, '琉': t, '琢': t, '琥': t, '琨': t, '琲': t, '琳': t, '琴': t, '琵': t, '琶': t, '瑕': t, '瑚': t, '瑛': t, '瑜': t, '瑞': t, '瑠': t, '瑤': t, '瑩': t, '瑪': t, '瑳': t, '璃': t, '璋': t, '璧': t, '環': t, '璽': t, '瓊': t, '瓜': t, '瓢': t, '瓦': t, '瓶': t, '甑': t, '甕': t, '甘': t, '甚': t, '生': t, '産': t, '甥': t, '甦': t, '用': t, '甫': t, '田': t, '由': t, '甲': t, '申': t, '男': t, '町': t,
        '画': t, '界': t, '畏': t, '畑': t, '畔': t, '留': t, '畜': t, '畝': t, '畠': t, '畢': t, '略': t, '畦': t, '番': t, '異': t, '畳': t, '當': t, '畷': t, '畿': t, '疆': t, '疇': t, '疋': t, '疎': t, '疏': t, '疑': t, '疫': t, '疱': t, '疲': t, '疵': t, '疹': t, '疼': t, '疽': t, '疾': t, '病': t, '症': t, '痍': t, '痒': t, '痕': t, '痘': t, '痙': t, '痛': t, '痢': t, '痩': t, '痰': t, '痴': t, '痺': t, '瘍': t, '瘡': t, '瘤': t, '療': t, '癌': t, '癒': t, '癖': t, '癬': t, '発': t, '登': t, '白': t, '百': t, '的': t, '皆': t, '皇': t, '皐': t, '皓': t, '皝': t, '皮': t, '皿': t, '盃': t, '盆': t, '盈': t, '益': t, '盗': t, '盛': t, '盟': t, '監': t, '盤': t, '盧': t, '盪': t, '目': t, '盲': t, '直': t, '相': t, '盾': t, '省': t, '眉': t, '看': t, '県': t, '眞': t, '真': t, '眠': t, '眩': t, '眷': t, '眺': t, '眼': t, '着': t, '睡': t, '督': t, '睦': t, '睨': t, '睿': t, '瞑': t, '瞞': t, '瞬': t, '瞭': t, '瞰': t, '瞳': t, '瞼': t, '矛': t, '矢': t, '知': t, '矩': t, '短': t, '矮': t, '矯': t, '石': t, '砂': t, '研': t, '砕': t, '砥': t, '砦': t, '砧': t, '砲': t, '破': t, '砺': t, '硝': t, '硫': t, '硬': t, '硯': t, '碁': t, '碇': t, '碍': t, '碑': t, '碓': t, '碗': t, '碧': t, '碩': t, '確': t, '磁': t, '磐': t, '磔': t, '磨': t, '磯': t, '礁': t, '礎': t, '礦': t, '礫': t, '示': t, '礼': t, '社': t, '祀': t, '祁': t, '祇': t, '祈': t, '祉': t, '祐': t, '祓': t, '祖': t, '祗': t, '祚': t, '祝': t, '神': t, '祟': t, '祠': t, '祢': t, '祥': t, '票': t, '祭': t, '祷': t, '祺': t, '禁': t, '禄': t, '禅': t, '禍': t, '禎': t, '福': t, '禧': t, '禮': t, '禰': t, '禹': t, '禽': t, '禿': t, '秀': t, '私': t, '秉': t, '秋': t, '科': t, '秒': t, '秘': t, '租': t, '秤': t, '秦': t, '秩': t, '称': t, '移': t, '稀': t, '程': t, '税': t, '稔': t, '稗': t, '稙': t, '稚': t, '稜': t, '稠': t, '種': t, '稲': t, '稷': t, '稼': t, '稽': t, '稿': t, '穀': t, '穂': t, '穆': t, '積': t, '穎': t, '穏': t, '穢': t, '穣': t, '穫': t, '穴': t, '究': t, '空': t, '穿': t, '突': t, '窃': t, '窄': t, '窒': t, '窓': t, '窟': t, '窩': t, '窪': t, '窮': t, '窯': t, '窺': t, '竄': t, '竇': t, '竈': t, '立': t, '站': t, '竜': t, '章': t, '竣': t, '童': t, '竪': t, '端': t, '競': t, '竹': t, '竺': t, '竿': t, '笏': t, '笑': t, '笙': t, '笛': t, '笠': t, '笥': t, '符': t, '第': t, '笹': t, '筆': t, '筈': t, '等': t, '筋': t, '筏': t, '筐': t, '筑': t, '筒': t, '答': t, '策': t, '筵': t, '箇': t, '箋': t, '箏': t, '箒': t, '箔': t, '箕': t, '算': t, '箚': t, '管': t, '箪': t, '箭': t, '箱': t, '箸': t, '節': t, '範': t, '篆': t, '篇': t, '築': t, '篠': t, '篤': t, '篩': t, '篭': t, '簒': t, '簗': t, '簡': t, '簾': t, '簿': t, '籃': t, '籍': t, '籠': t, '籤': t, '米': t, '籾': t, '粉': t, '粋': t, '粍': t, '粒': t, '粕': t, '粗': t, '粘': t, '粛': t, '粟': t, '粥': t, '粧': t, '粲': t, '精': t, '糊': t, '糎': t, '糖': t, '糞': t, '糟': t, '糠': t, '糧': t, '糸': t, '系': t, '糾': t, '紀': t, '約': t, '紅': t, '紆': t, '紇': t, '紋': t, '納': t, '紐': t, '純': t, '紗': t, '紘': t, '紙': t, '級': t, '紛': t, '素': t, '紡': t, '索': t, '紫': t, '累': t, '細': t, '紳': t, '紹': t, '紺': t, '終': t, '絃': t, '組': t, '絆': t, '経': t, '結': t, '絞': t, '絡': t, '絢': t, '給': t, '絨': t, '統': t, '絵': t, '絶': t, '絹': t, '綏': t, '經': t, '継': t, '続': t, '綜': t, '綬': t, '維': t, '綱': t, '網': t, '綴': t, '綸': t, '綺': t, '綻': t, '綽': t, '綾': t, '綿': t, '緊': t, '緋': t, '総': t, '緑': t, '緒': t, '線': t, '締': t, '編': t, '緩': t, '緬': t, '緯': t, '練': t, '緻': t, '縁': t, '縄': t, '縛': t, '縞': t, '縣': t, '縦': t, '縫': t, '縮': t, '總': t, '績': t, '繁': t, '繊': t, '繋': t, '繍': t, '織': t, '繕': t, '繡': t, '繭': t, '繰': t, '繹': t, '纂': t, '纏': t, '缶': t, '罠': t, '罪': t, '置': t, '罰': t, '署': t, '罵': t, '罷': t, '罹': t, '羅': t, '羊': t, '羌': t, '美': t, '羞': t, '群': t, '羨': t, '義': t, '羲': t, '羹': t, '羽': t, '翁': t, '翅': t, '翊': t, '翌': t, '習': t, '翔': t, '翟': t, '翠': t, '翰': t, '翻': t, '翼': t, '耀': t, '老': t, '考': t, '者': t, '耆': t, '而': t, '耐': t, '耕': t, '耗': t, '耳': t, '耶': t, '耽': t, '耿': t, '聖': t, '聘': t, '聚': t, '聞': t, '聡': t, '聯': t, '聰': t, '聲': t, '聳': t, '聴': t, '職': t, '聾': t, '肆': t, '肇': t, '肉': t, '肋': t, '肌': t, '肖': t, '肘': t, '肛': t, '肝': t, '股': t, '肢': t, '肥': t, '肩': t, '肪': t, '肯': t, '育': t, '肴': t, '肺': t, '胃': t, '胆': t, '背': t, '胎': t, '胚': t, '胞': t, '胡': t, '胤': t, '胱': t, '胴': t, '胸': t, '能': t, '脂': t, '脅': t, '脆': t,
        '脇': t, '脈': t, '脊': t, '脚': t, '脛': t, '脩': t, '脱': t, '脳': t, '脹': t, '脾': t, '腋': t, '腎': t, '腐': t, '腔': t, '腕': t, '腫': t, '腰': t, '腱': t, '腸': t, '腹': t, '腺': t, '腿': t, '膀': t, '膏': t, '膚': t, '膜': t, '膝': t, '膠': t, '膣': t, '膨': t, '膳': t, '膵': t, '膿': t, '臀': t, '臂': t, '臆': t, '臍': t, '臓': t, '臣': t, '臥': t, '臧': t, '臨': t, '自': t, '臭': t, '至': t, '致': t, '臺': t, '臼': t, '舅': t, '與': t, '興': t, '舌': t, '舎': t, '舐': t, '舒': t, '舗': t, '舘': t, '舛': t, '舜': t, '舞': t, '舟': t, '航': t, '般': t, '舵': t, '舶': t, '舷': t, '船': t, '艇': t, '艘': t, '艤': t, '艦': t, '良': t, '色': t, '艶': t, '艾': t, '芋': t, '芒': t, '芙': t, '芝': t, '芥': t, '芦': t, '芭': t, '芯': t, '花': t, '芳': t, '芸': t, '芹': t, '芽': t, '苅': t, '苑': t, '苔': t, '苗': t, '苛': t, '苞': t, '若': t, '苦': t, '苫': t, '英': t, '苺': t, '苻': t, '茂': t, '范': t, '茅': t, '茉': t, '茎': t, '茜': t, '茨': t, '茲': t, '茶': t, '茸': t, '茹': t, '荀': t, '草': t, '荊': t, '荏': t, '荒': t, '荘': t, '荷': t, '荻': t, '荼': t, '莉': t, '莞': t, '莢': t, '莫': t, '莱': t, '莽': t, '菅': t, '菊': t, '菌': t, '菓': t, '菖': t, '菜': t, '菟': t, '菩': t, '華': t, '菰': t, '菱': t, '萄': t, '萇': t, '萊': t, '萌': t, '萎': t, '萩': t, '萬': t, '萱': t, '萼': t, '落': t, '葉': t, '著': t, '葛': t, '葡': t, '董': t, '葦': t, '葬': t, '葯': t, '葱': t, '葵': t, '葺': t, '蒐': t, '蒔': t, '蒙': t, '蒜': t, '蒲': t, '蒸': t, '蒼': t, '蓄': t, '蓉': t, '蓋': t, '蓑': t, '蓬': t, '蓮': t, '蓼': t, '蔑': t, '蔓': t, '蔚': t, '蔡': t, '蔣': t, '蔦': t, '蔭': t, '蔵': t, '蔽': t, '蕃': t, '蕉': t, '蕊': t, '蕎': t, '蕨': t, '蕩': t, '蕪': t, '蕭': t, '蕾': t, '薄': t, '薇': t, '薊': t, '薔': t, '薗': t, '薙': t, '薛': t, '薦': t, '薨': t, '薩': t, '薪': t, '薫': t, '薬': t, '薮': t, '藁': t, '藍': t, '藏': t, '藝': t, '藤': t, '藩': t, '藪': t, '藺': t, '藻': t, '蘂': t, '蘆': t, '蘇': t, '蘭': t, '虎': t, '虐': t, '虔': t, '虚': t, '虜': t, '虞': t, '號': t, '虫': t, '虹': t, '虻': t, '蚊': t, '蚕': t, '蛇': t, '蛋': t, '蛍': t, '蛙': t, '蛛': t, '蛭': t, '蛮': t, '蛸': t, '蛹': t, '蛾': t, '蜀': t, '蜂': t, '蜘': t, '蜜': t, '蜷': t, '蝉': t, '蝋': t, '蝕': t, '蝦': t, '蝶': t, '融': t, '螺': t, '蟄': t, '蟲': t, '蟹': t, '蟻': t, '蠣': t, '血': t, '衆': t, '行': t, '衍': t, '術': t, '街': t, '衙': t, '衛': t, '衝': t, '衞': t, '衡': t, '衣': t, '表': t, '衰': t, '衷': t, '袁': t, '袂': t, '袈': t, '袋': t, '袖': t, '被': t, '袴': t, '裁': t, '裂': t, '装': t, '裏': t, '裔': t, '裕': t, '補': t, '裟': t, '裡': t, '裳': t, '裴': t, '裸': t, '製': t, '裾': t, '複': t, '褐': t, '褒': t, '褻': t, '襄': t, '襖': t, '襟': t, '襲': t, '襷': t, '西': t, '要': t, '覆': t, '覇': t, '見': t, '規': t, '視': t, '覗': t, '覚': t, '覧': t, '親': t, '観': t, '角': t, '解': t, '触': t, '言': t, '訂': t, '訃': t, '計': t, '訊': t, '討': t, '訓': t, '託': t, '記': t, '訛': t, '訟': t, '訣': t, '訥': t, '訪': t, '設': t, '許': t, '訳': t, '訴': t, '訶': t, '診': t, '註': t, '証': t, '詐': t, '詔': t, '評': t, '詞': t, '詠': t, '詣': t, '試': t, '詩': t, '詫': t, '詮': t, '詰': t, '話': t, '該': t, '詳': t, '誅': t, '誇': t, '誉': t, '誌': t, '認': t, '誓': t, '誕': t, '誘': t, '語': t, '誠': t, '誤': t, '誦': t, '説': t, '読': t, '誰': t, '課': t, '誹': t, '誼': t, '調': t, '談': t, '請': t, '諌': t, '諍': t, '諏': t, '諒': t, '論': t, '諜': t, '諡': t, '諦': t, '諧': t, '諫': t, '諭': t, '諮': t, '諱': t, '諷': t, '諸': t, '諺': t, '諾': t, '謀': t, '謁': t, '謂': t, '謄': t, '謎': t, '謐': t, '謗': t, '謙': t, '講': t, '謝': t, '謡': t, '謨': t, '謬': t, '謳': t, '謹': t, '證': t, '識': t, '譚': t, '譜': t, '警': t, '議': t, '譲': t, '護': t, '讀': t, '讃': t, '讐': t, '讒': t, '谷': t, '豆': t, '豊': t, '豚': t, '象': t, '豪': t, '豫': t, '豹': t, '貌': t, '貝': t, '貞': t, '負': t, '財': t, '貢': t, '貧': t, '貨': t, '販': t, '貪': t, '貫': t, '責': t, '貯': t, '貰': t, '貴': t, '貶': t, '買': t, '貸': t, '費': t, '貼': t, '貿': t, '賀': t, '賂': t, '賃': t, '賄': t, '資': t, '賈': t, '賊': t, '賑': t, '賓': t, '賛': t, '賜': t, '賞': t, '賠': t, '賢': t, '賣': t, '賤': t, '賦': t, '質': t, '賭': t, '購': t, '賽': t, '贄': t, '贅': t, '贈': t, '贋': t, '贔': t, '贖': t, '赤': t, '赦': t, '赫': t, '走': t, '赳': t, '赴': t, '起': t, '超': t, '越': t, '趙': t, '趣': t, '趨': t, '足': t, '趾': t, '跋': t, '距': t, '跡': t, '跨': t, '路': t, '跳': t, '践': t, '踊': t, '踏': t, '踪': t, '踵': t, '蹂': t, '蹄': t,
        '蹊': t, '蹟': t, '蹴': t, '躁': t, '躇': t, '躊': t, '躍': t, '躙': t, '身': t, '躯': t, '車': t, '軋': t, '軌': t, '軍': t, '軒': t, '軟': t, '転': t, '軸': t, '軽': t, '較': t, '載': t, '輌': t, '輔': t, '輛': t, '輜': t, '輝': t, '輩': t, '輪': t, '輯': t, '輸': t, '輻': t, '輿': t, '轄': t, '轍': t, '轟': t, '轢': t, '辛': t, '辞': t, '辟': t, '辣': t, '辰': t, '辱': t, '農': t, '辺': t, '辻': t, '込': t, '辿': t, '迂': t, '迄': t, '迅': t, '迎': t, '近': t, '返': t, '迦': t, '迪': t, '迫': t, '迭': t, '述': t, '迷': t, '迹': t, '追': t, '退': t, '送': t, '逃': t, '逅': t, '逆': t, '逍': t, '透': t, '逐': t, '逓': t, '途': t, '逗': t, '這': t, '通': t, '逝': t, '速': t, '造': t, '逢': t, '連': t, '逮': t, '週': t, '進': t, '逵': t, '逸': t, '逼': t, '遁': t, '遂': t, '遅': t, '遇': t, '遊': t, '運': t, '遍': t, '過': t, '道': t, '達': t, '違': t, '遙': t, '遜': t, '遠': t, '遡': t, '遣': t, '遥': t, '適': t, '遭': t, '遮': t, '遵': t, '遷': t, '選': t, '遺': t, '遼': t, '遽': t, '避': t, '邁': t, '邂': t, '還': t, '邇': t, '邉': t, '邊': t, '邑': t, '邢': t, '那': t, '邦': t, '邨': t, '邪': t, '邯': t, '邱': t, '邵': t, '邸': t, '郁': t, '郊': t, '郎': t, '郡': t, '郢': t, '部': t, '郭': t, '郵': t, '郷': t, '都': t, '鄒': t, '鄧': t, '鄭': t, '鄲': t, '鄴': t, '酉': t, '酋': t, '酌': t, '配': t, '酎': t, '酒': t, '酔': t, '酢': t, '酪': t, '酬': t, '酵': t, '酷': t, '酸': t, '醍': t, '醐': t, '醒': t, '醜': t, '醤': t, '醸': t, '采': t, '釈': t, '釉': t, '里': t, '重': t, '野': t, '量': t, '金': t, '釘': t, '釜': t, '針': t, '釣': t, '釧': t, '鈍': t, '鈔': t, '鈞': t, '鈴': t, '鉄': t, '鉉': t, '鉛': t, '鉢': t, '鉤': t, '鉦': t, '鉱': t, '鉾': t, '銀': t, '銃': t, '銅': t, '銑': t, '銘': t, '銚': t, '銭': t, '鋏': t, '鋒': t, '鋤': t, '鋭': t, '鋲': t, '鋳': t, '鋸': t, '鋼': t, '錆': t, '錐': t, '錘': t, '錠': t, '錦': t, '錨': t, '錫': t, '錬': t, '錮': t, '錯': t, '録': t, '鍋': t, '鍔': t, '鍛': t, '鍬': t, '鍮': t, '鍵': t, '鍼': t, '鍾': t, '鎌': t, '鎖': t, '鎚': t, '鎧': t, '鎬': t, '鎮': t, '鏃': t, '鏑': t, '鏡': t, '鐘': t, '鐵': t, '鐸': t, '鑑': t, '鑽': t, '長': t, '門': t, '閃': t, '閉': t, '開': t, '閏': t, '閑': t, '間': t, '閔': t, '閘': t, '関': t, '閣': t, '閤': t, '閥': t, '閩': t, '閭': t, '閲': t, '閻': t, '閾': t, '闇': t, '闊': t, '闍': t, '闕': t, '闘': t, '阜': t, '阪': t, '阮': t, '防': t, '阻': t, '阿': t, '陀': t, '附': t, '降': t, '限': t, '陛': t, '陝': t, '院': t, '陣': t, '除': t, '陥': t, '陪': t, '陰': t, '陳': t, '陵': t, '陶': t, '陸': t, '険': t, '陽': t, '隅': t, '隆': t, '隈': t, '隊': t, '隋': t, '階': t, '随': t, '隔': t, '隕': t, '隘': t, '隙': t, '際': t, '障': t, '隠': t, '隣': t, '隧': t, '隴': t, '隷': t, '隻': t, '隼': t, '雀': t, '雁': t, '雄': t, '雅': t, '集': t, '雇': t, '雉': t, '雌': t, '雍': t, '雑': t, '雙': t, '雛': t, '離': t, '難': t, '雨': t, '雪': t, '雫': t, '雰': t, '雲': t, '零': t, '雷': t, '電': t, '需': t, '震': t, '霊': t, '霍': t, '霖': t, '霜': t, '霞': t, '霧': t, '露': t, '霸': t, '青': t, '靖': t, '静': t, '非': t, '靡': t, '面': t, '革': t, '靭': t, '靱': t, '靳': t, '靴': t, '靺': t, '鞄': t, '鞆': t, '鞍': t, '鞘': t, '鞠': t, '鞨': t, '鞭': t, '韋': t, '韓': t, '韮': t, '音': t, '韶': t, '韻': t, '響': t, '頁': t, '頂': t, '頃': t, '項': t, '順': t, '須': t, '頌': t, '預': t, '頑': t, '頒': t, '頓': t, '領': t, '頚': t, '頬': t, '頭': t, '頴': t, '頸': t, '頻': t, '頼': t, '顆': t, '題': t, '額': t, '顎': t, '顒': t, '顔': t, '顕': t, '願': t, '顛': t, '類': t, '顧': t, '風': t, '颯': t, '飛': t, '食': t, '飢': t, '飫': t, '飯': t, '飲': t, '飴': t, '飼': t, '飽': t, '飾': t, '餃': t, '餅': t, '養': t, '餌': t, '餐': t, '餓': t, '餡': t, '館': t, '饅': t, '饉': t, '饌': t, '饒': t, '饗': t, '首': t, '香': t, '馨': t, '馬': t, '馮': t, '馳': t, '馴': t, '駁': t, '駄': t, '駅': t, '駆': t, '駐': t, '駒': t, '駕': t, '駿': t, '騎': t, '騒': t, '験': t, '騙': t, '騨': t, '騰': t, '驃': t, '驚': t, '驤': t, '骨': t, '骸': t, '髄': t, '髏': t, '髑': t, '體': t, '高': t, '髙': t, '髪': t, '髭': t, '髷': t, '鬘': t, '鬚': t, '鬱': t, '鬼': t, '魁': t, '魂': t, '魃': t, '魅': t, '魏': t, '魔': t, '魚': t, '魯': t, '鮎': t, '鮑': t, '鮫': t, '鮭': t, '鮮': t, '鯉': t, '鯖': t, '鯛': t, '鯨': t, '鯱': t, '鰐': t, '鰓': t, '鰭': t, '鰹': t, '鰻': t, '鱒': t, '鱗': t, '鳥': t, '鳩': t, '鳳': t, '鳴': t, '鳶': t, '鴉': t, '鴎': t, '鴨': t, '鴻': t, '鵜': t, '鵠': t, '鵬': t, '鶏': t, '鶯': t, '鶴': t, '鷗': t, '鷲': t, '鷹': t, '鷺': t, '鸞': t,
        '鹵': t, '鹸': t, '鹿': t, '麒': t, '麓': t, '麗': t, '麟': t, '麦': t, '麹': t, '麺': t, '麻': t, '麾': t, '麿': t, '黄': t, '黌': t, '黎': t, '黒': t, '黔': t, '黙': t, '黛': t, '鼎': t, '鼓': t, '鼠': t, '鼻': t, '齊': t, '齋': t, '齟': t, '齢': t, '齧': t, '齬': t, '龍': t, '龐': t, '龕': t, '이': t, '﨑': t, '～': t,
        'Ａ': t, 'Ｂ': t, 'Ｃ': t, 'Ｄ': t, 'Ｅ': t, 'Ｆ': t, 'Ｇ': t, 'Ｈ': t, 'Ｉ': t, 'Ｊ': t, 'Ｋ': t, 'Ｌ': t, 'Ｍ': t, 'Ｎ': t, 'Ｏ': t, 'Ｐ': t, 'Ｑ': t, 'Ｒ': t, 'Ｓ': t, 'Ｔ': t, 'Ｕ': t, 'Ｖ': t, 'Ｗ': t, 'Ｘ': t, 'Ｙ': t, 'Ｚ': t, 'ａ': t, 'ｂ': t, 'ｃ': t, 'ｄ': t, 'ｅ': t, 'ｆ': t, 'ｇ': t, 'ｈ': t, 'ｉ': t, 'ｊ': t, 'ｋ': t, 'ｌ': t, 'ｍ': t, 'ｎ': t, 'ｏ': t, 'ｐ': t, 'ｑ': t, 'ｒ': t, 'ｓ': t, 'ｔ': t, 'ｕ': t, 'ｖ': t, 'ｗ': t, 'ｘ': t, 'ｙ': t, 'ｚ': t, '０': t, '１': t, '２': t, '３': t, '４': t, '５': t, '６': t, '７': t, '８': t, '９': t,
        '／': t, '＼': t, '＊': t, '．': t, '？': t, '！': t, '（': t, '）': t, '【': t, '】': t, '［': t, '］': t, '｛': t, '｝': t, '＜': t, '＞': t, '：': t, '…': t, '”': t, '＄': t, '％': t, '＆': t, '’': t, '＠': t, '＊': t, '＾': t, '＝': t, '｜': t, '；': t, '＋': t, '＿': t, '゛': t, '－': t,
    }
    const char_list_20b = {
        "!": t, "\"": t, "#": t, "$": t, "%": t, "&": t, "'": t, "(": t, ")": t, "*": t, "+": t, ",": t, "-": t, ".": t, "/": t, "0": t, "1": t, "2": t, "3": t, "4": t, "5": t, "6": t, "7": t, "8": t, "9": t, ":": t, ";": t, "<": t, "=": t, ">": t, "?": t, "@": t, "A": t, "B": t, "C": t, "D": t, "E": t, "F": t, "G": t, "H": t, "I": t, "J": t, "K": t, "L": t, "M": t, "N": t, "O": t, "P": t, "Q": t, "R": t,
        "S": t, "T": t, "U": t, "V": t, "W": t, "X": t, "Y": t, "Z": t, "[": t, "\\": t, "]": t, "^": t, "_": t, "`": t, "a": t, "b": t, "c": t, "d": t, "e": t, "f": t, "g": t, "h": t, "i": t, "j": t, "k": t, "l": t, "m": t, "n": t, "o": t, "p": t, "q": t, "r": t, "s": t, "t": t, "u": t, "v": t, "w": t, "x": t, "y": t, "z": t, "{": t, "|": t, "}": t, "~": t, "¥": t, "§": t, "«": t, "\u00ad": t, "®": t, "°": t,
        "±": t, "·": t, "»": t, "Á": t, "É": t, "Ö": t, "×": t, "Ø": t, "ß": t, "à": t, "á": t, "â": t, "ã": t, "ä": t, "å": t, "ç": t, "è": t, "é": t, "ê": t, "ë": t, "ì": t, "í": t, "ð": t, "ñ": t, "ó": t, "ô": t, "ö": t, "ø": t, "ù": t, "ú": t, "ü": t, "ā": t, "ă": t, "ć": t, "Č": t, "č": t, "ē": t, "ī": t, "ı": t, "ł": t, "ō": t, "Š": t, "š": t, "ū": t, "ž": t, "ə": t, "ˈ": t, "ː": t, "\u0301": t, "\u0304": t,
        "\u0307": t, "Δ": t, "Ζ": t, "Σ": t, "Ω": t, "α": t, "β": t, "γ": t, "δ": t, "ε": t, "ζ": t, "η": t, "θ": t, "ι": t, "κ": t, "λ": t, "μ": t, "ν": t, "ο": t, "π": t, "ρ": t, "ς": t, "σ": t, "τ": t, "φ": t, "ω": t, "А": t, "Б": t, "В": t, "Д": t, "К": t, "М": t, "П": t, "С": t, "а": t, "б": t, "в": t, "г": t, "д": t, "е": t, "з": t, "и": t, "й": t, "к": t, "л": t, "м": t, "н": t, "о": t, "п": t, "р": t,
        "с": t, "т": t, "у": t, "ч": t, "ы": t, "ь": t, "я": t, "י": t, "ا": t, "ب": t, "ت": t, "د": t, "ر": t, "س": t, "ق": t, "ل": t, "م": t, "ن": t, "ه": t, "و": t, "ي": t, "ی": t, "र": t, "ा": t, "्": t, "ก": t, "ง": t, "ท": t, "น": t, "ม": t, "ย": t, "ร": t, "ล": t, "ว": t, "ส": t, "อ": t, "ั": t, "า": t, "\u0e34": t, "\u0e35": t, "เ": t, "๑": t, "‐": t, "–": t, "—": t, "―": t, "‘": t, "’": t, "“": t, "”": t,
        "„": t, "†": t, "•": t, "\u202a": t, "\u202c": t, "‰": t, "′": t, "※": t, "←": t, "↑": t, "→": t, "↓": t, "⇒": t, "⇔": t, "∀": t, "∈": t, "−": t, "∞": t, "∶": t, "≒": t, "≤": t, "≪": t, "≫": t, "⊿": t, "⋯": t, "─": t, "━": t, "│": t, "┈": t, "┗": t, "┼": t, "█": t, "■": t, "□": t, "▲": t, "△": t, "▼": t, "▽": t, "◆": t, "◇": t, "○": t, "◎": t, "●": t, "◯": t, "◼": t, "★": t, "☆": t, "♀": t, "♂": t, "♡": t,
        "♢": t, "♥": t, "♦": t, "♪": t, "♭": t, "⚠": t, "✳": t, "❤": t, "⭐": t, "、": t, "。": t, "〃": t, "々": t, "〆": t, "〇": t, "〈": t, "〉": t, "《": t, "》": t, "「": t, "」": t, "『": t, "』": t, "【": t, "】": t, "〒": t, "〔": t, "〕": t, "〖": t, "〗": t, "〜": t, "〝": t, "〟": t, "ぁ": t, "あ": t, "ぃ": t, "い": t, "ぅ": t, "う": t, "ぇ": t, "え": t, "ぉ": t, "お": t, "か": t, "が": t, "き": t, "ぎ": t, "く": t, "ぐ": t, "け": t,
        "げ": t, "こ": t, "ご": t, "さ": t, "ざ": t, "し": t, "じ": t, "す": t, "ず": t, "せ": t, "ぜ": t, "そ": t, "ぞ": t, "た": t, "だ": t, "ち": t, "ぢ": t, "っ": t, "つ": t, "づ": t, "て": t, "で": t, "と": t, "ど": t, "な": t, "に": t, "ぬ": t, "ね": t, "の": t, "は": t, "ば": t, "ぱ": t, "ひ": t, "び": t, "ぴ": t, "ふ": t, "ぶ": t, "ぷ": t, "へ": t, "べ": t, "ぺ": t, "ほ": t, "ぼ": t, "ぽ": t, "ま": t, "み": t, "む": t, "め": t, "も": t, "ゃ": t,
        "や": t, "ゅ": t, "ゆ": t, "ょ": t, "よ": t, "ら": t, "り": t, "る": t, "れ": t, "ろ": t, "わ": t, "ゐ": t, "ゑ": t, "を": t, "ん": t, "ゔ": t, "\u3099": t, "\u309a": t, "ゝ": t, "ゞ": t, "ァ": t, "ア": t, "ィ": t, "イ": t, "ゥ": t, "ウ": t, "ェ": t, "エ": t, "ォ": t, "オ": t, "カ": t, "ガ": t, "キ": t, "ギ": t, "ク": t, "グ": t, "ケ": t, "ゲ": t, "コ": t, "ゴ": t, "サ": t, "ザ": t, "シ": t, "ジ": t, "ス": t, "ズ": t, "セ": t, "ゼ": t, "ソ": t, "ゾ": t,
        "タ": t, "ダ": t, "チ": t, "ヂ": t, "ッ": t, "ツ": t, "ヅ": t, "テ": t, "デ": t, "ト": t, "ド": t, "ナ": t, "ニ": t, "ヌ": t, "ネ": t, "ノ": t, "ハ": t, "バ": t, "パ": t, "ヒ": t, "ビ": t, "ピ": t, "フ": t, "ブ": t, "プ": t, "ヘ": t, "ベ": t, "ペ": t, "ホ": t, "ボ": t, "ポ": t, "マ": t, "ミ": t, "ム": t, "メ": t, "モ": t, "ャ": t, "ヤ": t, "ュ": t, "ユ": t, "ョ": t, "ヨ": t, "ラ": t, "リ": t, "ル": t, "レ": t, "ロ": t, "ワ": t, "ヰ": t, "ヱ": t,
        "ヲ": t, "ン": t, "ヴ": t, "ヵ": t, "ヶ": t, "・": t, "ー": t, "ヽ": t, "一": t, "丁": t, "七": t, "万": t, "丈": t, "三": t, "上": t, "下": t, "不": t, "与": t, "丑": t, "专": t, "且": t, "丕": t, "世": t, "丘": t, "丙": t, "业": t, "东": t, "丝": t, "丞": t, "両": t, "丢": t, "两": t, "严": t, "並": t, "个": t, "丫": t, "中": t, "丰": t, "串": t, "临": t, "丸": t, "丹": t, "为": t, "主": t, "丼": t, "丽": t, "举": t, "乃": t, "久": t, "么": t,
        "义": t, "之": t, "乎": t, "乏": t, "乐": t, "乖": t, "乗": t, "乙": t, "九": t, "乞": t, "也": t, "习": t, "书": t, "买": t, "乱": t, "乳": t, "乾": t, "亀": t, "亂": t, "了": t, "予": t, "争": t, "事": t, "二": t, "于": t, "云": t, "互": t, "五": t, "井": t, "亘": t, "亚": t, "些": t, "亜": t, "亞": t, "亡": t, "亢": t, "交": t, "亥": t, "亦": t, "产": t, "亨": t, "享": t, "京": t, "亭": t, "亮": t, "亲": t, "人": t, "什": t, "仁": t, "仄": t,
        "仅": t, "仆": t, "仇": t, "今": t, "介": t, "仍": t, "从": t, "仏": t, "仔": t, "仕": t, "他": t, "仗": t, "付": t, "仙": t, "代": t, "令": t, "以": t, "们": t, "仮": t, "仰": t, "仲": t, "件": t, "价": t, "任": t, "份": t, "仿": t, "企": t, "伊": t, "伍": t, "伎": t, "伏": t, "伐": t, "休": t, "众": t, "优": t, "伙": t, "会": t, "伝": t, "传": t, "伤": t, "伦": t, "伯": t, "估": t, "伴": t, "伶": t, "伸": t, "伺": t, "似": t, "伽": t, "佃": t,
        "但": t, "佇": t, "位": t, "低": t, "住": t, "佐": t, "佑": t, "体": t, "何": t, "余": t, "佛": t, "作": t, "你": t, "佩": t, "佳": t, "併": t, "使": t, "侃": t, "來": t, "例": t, "侍": t, "侑": t, "侘": t, "供": t, "依": t, "侠": t, "価": t, "侧": t, "侮": t, "侯": t, "侵": t, "侶": t, "便": t, "係": t, "促": t, "俄": t, "俊": t, "俗": t, "俘": t, "保": t, "俟": t, "俠": t, "信": t, "俣": t, "俩": t, "修": t, "俯": t, "俱": t, "俳": t, "俵": t,
        "俸": t, "俺": t, "倅": t, "倉": t, "個": t, "倍": t, "們": t, "倒": t, "倖": t, "候": t, "倚": t, "借": t, "倣": t, "値": t, "倦": t, "倩": t, "倪": t, "倫": t, "倭": t, "倶": t, "倹": t, "值": t, "倾": t, "假": t, "偉": t, "偏": t, "偕": t, "做": t, "停": t, "健": t, "偲": t, "側": t, "偵": t, "偶": t, "偷": t, "偽": t, "傀": t, "傅": t, "傍": t, "傑": t, "傘": t, "備": t, "催": t, "傭": t, "傲": t, "傳": t, "債": t, "傷": t, "傻": t, "傾": t,
        "僅": t, "働": t, "像": t, "僑": t, "僕": t, "僚": t, "僥": t, "僧": t, "僭": t, "僵": t, "僻": t, "儀": t, "儁": t, "儂": t, "億": t, "儒": t, "儘": t, "儚": t, "償": t, "儡": t, "優": t, "儲": t, "儺": t, "儿": t, "允": t, "元": t, "兄": t, "充": t, "兆": t, "兇": t, "先": t, "光": t, "克": t, "兌": t, "免": t, "兎": t, "児": t, "兒": t, "兔": t, "兗": t, "党": t, "兜": t, "入": t, "內": t, "全": t, "兩": t, "兪": t, "八": t, "公": t, "六": t,
        "兰": t, "共": t, "关": t, "兴": t, "兵": t, "其": t, "具": t, "典": t, "养": t, "兼": t, "兽": t, "冀": t, "内": t, "円": t, "冉": t, "冊": t, "再": t, "冑": t, "冒": t, "冗": t, "写": t, "军": t, "冠": t, "冤": t, "冥": t, "冨": t, "冪": t, "冬": t, "冰": t, "冲": t, "决": t, "冴": t, "况": t, "冶": t, "冷": t, "净": t, "凄": t, "准": t, "凉": t, "凋": t, "凌": t, "凍": t, "凑": t, "凛": t, "凜": t, "凝": t, "几": t, "凡": t, "凤": t, "処": t,
        "凧": t, "凪": t, "凭": t, "凯": t, "凰": t, "凱": t, "凶": t, "凸": t, "凹": t, "出": t, "击": t, "函": t, "刀": t, "刃": t, "分": t, "切": t, "刈": t, "刊": t, "刎": t, "刑": t, "划": t, "列": t, "刘": t, "则": t, "刚": t, "初": t, "判": t, "別": t, "利": t, "别": t, "刮": t, "到": t, "制": t, "刷": t, "券": t, "刹": t, "刺": t, "刻": t, "剃": t, "則": t, "削": t, "剋": t, "剌": t, "前": t, "剑": t, "剖": t, "剛": t, "剝": t, "剣": t, "剤": t,
        "剥": t, "剧": t, "剩": t, "剪": t, "副": t, "剰": t, "割": t, "創": t, "剽": t, "劇": t, "劈": t, "劉": t, "力": t, "办": t, "功": t, "加": t, "务": t, "劣": t, "动": t, "助": t, "努": t, "劫": t, "励": t, "劲": t, "労": t, "効": t, "劾": t, "势": t, "勁": t, "勃": t, "勅": t, "勇": t, "勉": t, "勒": t, "動": t, "勘": t, "務": t, "勝": t, "募": t, "勢": t, "勤": t, "勧": t, "勲": t, "勾": t, "勿": t, "匁": t, "匂": t, "包": t, "匈": t, "匋": t,
        "匍": t, "匐": t, "化": t, "北": t, "匙": t, "匠": t, "匡": t, "匪": t, "匹": t, "区": t, "医": t, "匿": t, "十": t, "千": t, "升": t, "午": t, "半": t, "卍": t, "华": t, "卑": t, "卒": t, "卓": t, "協": t, "单": t, "卖": t, "南": t, "単": t, "博": t, "卜": t, "占": t, "卡": t, "卦": t, "卧": t, "卫": t, "卯": t, "印": t, "危": t, "即": t, "却": t, "卵": t, "卷": t, "卸": t, "卻": t, "卿": t, "厄": t, "厅": t, "历": t, "厉": t, "压": t, "厌": t,
        "厘": t, "厚": t, "原": t, "厠": t, "厥": t, "厨": t, "厩": t, "厭": t, "厲": t, "厳": t, "去": t, "参": t, "又": t, "叉": t, "及": t, "友": t, "双": t, "反": t, "収": t, "发": t, "叔": t, "取": t, "受": t, "变": t, "叙": t, "叛": t, "叟": t, "叡": t, "叢": t, "口": t, "古": t, "句": t, "另": t, "叩": t, "只": t, "叫": t, "召": t, "可": t, "台": t, "叱": t, "史": t, "右": t, "叶": t, "号": t, "司": t, "叹": t, "吃": t, "各": t, "合": t, "吉": t,
        "吊": t, "同": t, "名": t, "后": t, "吏": t, "吐": t, "向": t, "吓": t, "吗": t, "君": t, "吞": t, "吟": t, "吠": t, "否": t, "吧": t, "含": t, "听": t, "吮": t, "吴": t, "吸": t, "吹": t, "吻": t, "吼": t, "吾": t, "呀": t, "呂": t, "呃": t, "呆": t, "呈": t, "呉": t, "告": t, "呑": t, "员": t, "呜": t, "呟": t, "呢": t, "周": t, "呪": t, "味": t, "呵": t, "呷": t, "呻": t, "呼": t, "命": t, "咀": t, "咄": t, "咆": t, "咋": t, "和": t, "咎": t,
        "咒": t, "咕": t, "咖": t, "咙": t, "咤": t, "咥": t, "咫": t, "咬": t, "咯": t, "咱": t, "咲": t, "咳": t, "咸": t, "咽": t, "咿": t, "哀": t, "品": t, "哄": t, "哇": t, "哈": t, "哉": t, "响": t, "哎": t, "員": t, "哥": t, "哦": t, "哨": t, "哪": t, "哭": t, "哮": t, "哲": t, "哺": t, "哼": t, "唄": t, "唆": t, "唇": t, "唐": t, "唔": t, "唖": t, "唯": t, "唱": t, "唸": t, "唾": t, "啄": t, "商": t, "啊": t, "問": t, "啓": t, "啖": t, "啜": t,
        "啞": t, "啥": t, "啦": t, "啪": t, "啼": t, "啾": t, "喀": t, "喂": t, "喃": t, "善": t, "喇": t, "喉": t, "喊": t, "喋": t, "喔": t, "喘": t, "喚": t, "喜": t, "喝": t, "喧": t, "喩": t, "喪": t, "喫": t, "喬": t, "單": t, "喰": t, "営": t, "喷": t, "嗄": t, "嗅": t, "嗎": t, "嗚": t, "嗜": t, "嗟": t, "嗣": t, "嗤": t, "嗯": t, "嘆": t, "嘉": t, "嘔": t, "嘗": t, "嘘": t, "嘛": t, "嘩": t, "嘯": t, "嘱": t, "嘲": t, "嘴": t, "嘶": t, "嘻": t,
        "嘿": t, "噂": t, "噌": t, "噎": t, "噓": t, "噗": t, "噛": t, "噢": t, "噤": t, "器": t, "噪": t, "噫": t, "噴": t, "噺": t, "嚆": t, "嚇": t, "嚙": t, "嚢": t, "嚥": t, "嚼": t, "囀": t, "囁": t, "囃": t, "囚": t, "四": t, "回": t, "因": t, "团": t, "団": t, "园": t, "囮": t, "困": t, "囲": t, "図": t, "围": t, "固": t, "国": t, "图": t, "圀": t, "圃": t, "圆": t, "圈": t, "國": t, "圏": t, "園": t, "圓": t, "圖": t, "團": t, "土": t, "圣": t,
        "圧": t, "在": t, "圭": t, "地": t, "圳": t, "场": t, "址": t, "坂": t, "均": t, "坊": t, "坏": t, "坐": t, "坑": t, "块": t, "坚": t, "坡": t, "坤": t, "坦": t, "坪": t, "垂": t, "型": t, "垢": t, "垣": t, "埃": t, "埋": t, "城": t, "埒": t, "埔": t, "埜": t, "域": t, "埠": t, "埴": t, "執": t, "培": t, "基": t, "埼": t, "堀": t, "堂": t, "堅": t, "堆": t, "堕": t, "堡": t, "堤": t, "堪": t, "堯": t, "堰": t, "報": t, "場": t, "堵": t, "堺": t,
        "塀": t, "塁": t, "塊": t, "塑": t, "塔": t, "塗": t, "塘": t, "塙": t, "塚": t, "塞": t, "塢": t, "塩": t, "填": t, "塵": t, "塹": t, "塾": t, "境": t, "墓": t, "増": t, "墙": t, "墜": t, "增": t, "墟": t, "墨": t, "墳": t, "墺": t, "墾": t, "壁": t, "壇": t, "壊": t, "壌": t, "壓": t, "壕": t, "壜": t, "士": t, "壬": t, "壮": t, "声": t, "壱": t, "売": t, "壷": t, "壺": t, "壽": t, "处": t, "备": t, "変": t, "复": t, "夏": t, "夕": t, "外": t,
        "多": t, "夜": t, "够": t, "夠": t, "夢": t, "夥": t, "大": t, "天": t, "太": t, "夫": t, "夭": t, "央": t, "失": t, "头": t, "夷": t, "夹": t, "夺": t, "夾": t, "奄": t, "奇": t, "奈": t, "奉": t, "奋": t, "奎": t, "奏": t, "契": t, "奔": t, "奕": t, "套": t, "奚": t, "奠": t, "奢": t, "奥": t, "奨": t, "奪": t, "奮": t, "女": t, "奴": t, "奶": t, "奸": t, "她": t, "好": t, "如": t, "妃": t, "妄": t, "妈": t, "妊": t, "妓": t, "妖": t, "妙": t,
        "妥": t, "妨": t, "妬": t, "妮": t, "妳": t, "妹": t, "妻": t, "妾": t, "姆": t, "姉": t, "始": t, "姐": t, "姑": t, "姓": t, "委": t, "姚": t, "姜": t, "姥": t, "姦": t, "姪": t, "姫": t, "姬": t, "姶": t, "姻": t, "姿": t, "威": t, "娃": t, "娅": t, "娇": t, "娑": t, "娘": t, "娜": t, "娠": t, "娥": t, "娩": t, "娯": t, "娶": t, "娼": t, "婁": t, "婆": t, "婉": t, "婚": t, "婢": t, "婦": t, "婿": t, "媒": t, "媚": t, "媛": t, "媽": t, "嫁": t,
        "嫂": t, "嫉": t, "嫌": t, "嫡": t, "嫣": t, "嫩": t, "嬉": t, "嬌": t, "嬢": t, "嬪": t, "嬰": t, "嬲": t, "子": t, "孔": t, "孕": t, "字": t, "存": t, "孚": t, "孝": t, "孟": t, "季": t, "孤": t, "学": t, "孩": t, "孫": t, "孵": t, "學": t, "它": t, "宅": t, "宇": t, "守": t, "安": t, "宋": t, "完": t, "宍": t, "宏": t, "宕": t, "宗": t, "官": t, "宙": t, "定": t, "宛": t, "宜": t, "宝": t, "实": t, "実": t, "客": t, "宣": t, "室": t, "宥": t,
        "宦": t, "宫": t, "宮": t, "宰": t, "害": t, "宴": t, "宵": t, "家": t, "宸": t, "容": t, "宾": t, "宿": t, "寂": t, "寄": t, "寅": t, "密": t, "寇": t, "富": t, "寒": t, "寓": t, "寛": t, "寝": t, "察": t, "寡": t, "寥": t, "實": t, "寧": t, "寨": t, "審": t, "寮": t, "寵": t, "寶": t, "寸": t, "对": t, "寺": t, "寻": t, "导": t, "対": t, "寿": t, "封": t, "専": t, "射": t, "将": t, "將": t, "尉": t, "尊": t, "尋": t, "對": t, "導": t, "小": t,
        "少": t, "尔": t, "尖": t, "尘": t, "尚": t, "尝": t, "尤": t, "尬": t, "尭": t, "就": t, "尸": t, "尹": t, "尺": t, "尻": t, "尼": t, "尽": t, "尾": t, "尿": t, "局": t, "屁": t, "层": t, "居": t, "屈": t, "届": t, "屋": t, "屍": t, "屏": t, "屑": t, "屓": t, "展": t, "属": t, "屠": t, "層": t, "履": t, "屯": t, "山": t, "屹": t, "岁": t, "岐": t, "岑": t, "岛": t, "岡": t, "岩": t, "岬": t, "岱": t, "岳": t, "岸": t, "峙": t, "峠": t, "峡": t,
        "峨": t, "峯": t, "峰": t, "島": t, "峻": t, "崇": t, "崎": t, "崑": t, "崔": t, "崖": t, "崗": t, "崙": t, "崩": t, "嵌": t, "嵐": t, "嵩": t, "嵯": t, "嶋": t, "嶺": t, "嶼": t, "嶽": t, "巌": t, "巖": t, "川": t, "州": t, "巡": t, "巣": t, "工": t, "左": t, "巧": t, "巨": t, "巫": t, "差": t, "己": t, "已": t, "巳": t, "巴": t, "巷": t, "巻": t, "巽": t, "巾": t, "市": t, "布": t, "帆": t, "师": t, "希": t, "帖": t, "帛": t, "帝": t, "帥": t,
        "带": t, "師": t, "席": t, "帮": t, "帯": t, "帰": t, "帳": t, "帶": t, "帷": t, "常": t, "帽": t, "幅": t, "幇": t, "幌": t, "幕": t, "幟": t, "幡": t, "幣": t, "幫": t, "干": t, "平": t, "年": t, "并": t, "幸": t, "幹": t, "幻": t, "幼": t, "幽": t, "幾": t, "庁": t, "広": t, "庄": t, "庇": t, "床": t, "序": t, "应": t, "底": t, "店": t, "庚": t, "府": t, "庞": t, "废": t, "度": t, "座": t, "庫": t, "庭": t, "庵": t, "庶": t, "康": t, "庸": t,
        "庾": t, "廃": t, "廈": t, "廉": t, "廊": t, "廓": t, "廟": t, "廠": t, "廣": t, "廬": t, "延": t, "廷": t, "建": t, "廻": t, "廿": t, "开": t, "弁": t, "异": t, "弃": t, "弄": t, "弉": t, "弊": t, "式": t, "弐": t, "弓": t, "弔": t, "引": t, "弗": t, "弘": t, "弛": t, "弟": t, "张": t, "弥": t, "弦": t, "弧": t, "弩": t, "弯": t, "弱": t, "張": t, "強": t, "弹": t, "强": t, "弼": t, "弾": t, "彅": t, "彌": t, "当": t, "录": t, "彗": t, "彙": t,
        "形": t, "彦": t, "彩": t, "彪": t, "彫": t, "彬": t, "彭": t, "彰": t, "影": t, "彷": t, "役": t, "彻": t, "彼": t, "彿": t, "往": t, "征": t, "径": t, "待": t, "很": t, "徊": t, "律": t, "後": t, "徐": t, "徒": t, "従": t, "得": t, "徘": t, "從": t, "御": t, "徨": t, "復": t, "循": t, "微": t, "徳": t, "徴": t, "德": t, "徹": t, "徽": t, "心": t, "必": t, "忆": t, "忌": t, "忍": t, "志": t, "忘": t, "忙": t, "応": t, "忠": t, "快": t, "念": t,
        "忽": t, "怀": t, "态": t, "怎": t, "怒": t, "怕": t, "怖": t, "怜": t, "思": t, "怠": t, "怡": t, "急": t, "性": t, "怨": t, "怪": t, "怯": t, "总": t, "恋": t, "恍": t, "恐": t, "恒": t, "恕": t, "恢": t, "恣": t, "恥": t, "恨": t, "恩": t, "恪": t, "恫": t, "恭": t, "息": t, "恰": t, "恵": t, "恶": t, "悄": t, "悉": t, "悌": t, "悍": t, "悔": t, "悟": t, "悠": t, "患": t, "悦": t, "您": t, "悩": t, "悪": t, "悲": t, "悴": t, "悶": t, "悸": t,
        "悼": t, "情": t, "惇": t, "惊": t, "惑": t, "惚": t, "惜": t, "惟": t, "惠": t, "惡": t, "惣": t, "惧": t, "惨": t, "惩": t, "惯": t, "惰": t, "想": t, "惹": t, "愁": t, "愈": t, "愉": t, "意": t, "愕": t, "愚": t, "愛": t, "感": t, "愣": t, "愧": t, "愿": t, "慄": t, "慇": t, "慈": t, "態": t, "慌": t, "慎": t, "慕": t, "慟": t, "慢": t, "慣": t, "慧": t, "慨": t, "慮": t, "慰": t, "慶": t, "慾": t, "憂": t, "憊": t, "憎": t, "憐": t, "憑": t,
        "憔": t, "憚": t, "憤": t, "憧": t, "憩": t, "憫": t, "憬": t, "憮": t, "憲": t, "憶": t, "憺": t, "憾": t, "懂": t, "懃": t, "懇": t, "應": t, "懐": t, "懲": t, "懷": t, "懸": t, "懺": t, "懿": t, "戀": t, "戈": t, "戊": t, "戌": t, "戍": t, "戎": t, "戏": t, "成": t, "我": t, "戒": t, "或": t, "战": t, "戚": t, "戟": t, "戦": t, "截": t, "戮": t, "戯": t, "戰": t, "戴": t, "户": t, "戸": t, "戻": t, "房": t, "所": t, "扁": t, "扇": t, "扈": t,
        "扉": t, "手": t, "才": t, "扎": t, "扑": t, "打": t, "扔": t, "払": t, "托": t, "扣": t, "扫": t, "扬": t, "扭": t, "扮": t, "扯": t, "扱": t, "扶": t, "批": t, "找": t, "承": t, "技": t, "抄": t, "抉": t, "把": t, "抑": t, "抒": t, "抓": t, "投": t, "抖": t, "抗": t, "折": t, "抚": t, "抛": t, "抜": t, "択": t, "护": t, "报": t, "披": t, "抬": t, "抱": t, "抵": t, "抹": t, "押": t, "抽": t, "担": t, "拉": t, "拌": t, "拍": t, "拐": t, "拒": t,
        "拓": t, "拔": t, "拖": t, "拗": t, "拘": t, "拙": t, "招": t, "拜": t, "拝": t, "拠": t, "拡": t, "拥": t, "拨": t, "择": t, "括": t, "拭": t, "拮": t, "拱": t, "拳": t, "拵": t, "拶": t, "拷": t, "拼": t, "拾": t, "拿": t, "持": t, "挂": t, "指": t, "按": t, "挑": t, "挙": t, "挟": t, "挠": t, "挡": t, "挣": t, "挤": t, "挥": t, "挨": t, "挫": t, "振": t, "挺": t, "挽": t, "挿": t, "捂": t, "捆": t, "捉": t, "捌": t, "捏": t, "捕": t, "捗": t,
        "捜": t, "换": t, "捧": t, "捨": t, "捩": t, "据": t, "捲": t, "捷": t, "捺": t, "捻": t, "掃": t, "授": t, "掉": t, "掌": t, "掏": t, "排": t, "掘": t, "掛": t, "掟": t, "掠": t, "採": t, "探": t, "接": t, "控": t, "推": t, "掩": t, "措": t, "掬": t, "掲": t, "掴": t, "掻": t, "掾": t, "揃": t, "揄": t, "揆": t, "揉": t, "描": t, "提": t, "插": t, "揖": t, "揚": t, "換": t, "握": t, "揮": t, "援": t, "揶": t, "揺": t, "損": t, "搓": t, "搔": t,
        "搖": t, "搞": t, "搦": t, "搬": t, "搭": t, "携": t, "搾": t, "摂": t, "摆": t, "摇": t, "摑": t, "摘": t, "摩": t, "摯": t, "摸": t, "摺": t, "撃": t, "撑": t, "撒": t, "撓": t, "撕": t, "撚": t, "撞": t, "撤": t, "撥": t, "撫": t, "播": t, "撮": t, "撰": t, "撲": t, "撹": t, "撼": t, "擁": t, "擊": t, "操": t, "擢": t, "擦": t, "擬": t, "擲": t, "擽": t, "擾": t, "攀": t, "攘": t, "攣": t, "攪": t, "攫": t, "支": t, "收": t, "攸": t, "改": t,
        "攻": t, "放": t, "政": t, "故": t, "效": t, "敌": t, "敏": t, "救": t, "敗": t, "教": t, "敢": t, "散": t, "敦": t, "敬": t, "数": t, "敲": t, "整": t, "敵": t, "敷": t, "數": t, "斂": t, "斃": t, "文": t, "斉": t, "斌": t, "斎": t, "斐": t, "斑": t, "斗": t, "料": t, "斜": t, "斡": t, "斤": t, "斥": t, "斧": t, "斬": t, "断": t, "斯": t, "新": t, "斷": t, "方": t, "於": t, "施": t, "旁": t, "旅": t, "旋": t, "族": t, "旗": t, "旛": t, "无": t,
        "既": t, "日": t, "旦": t, "旧": t, "旨": t, "早": t, "旬": t, "旭": t, "旱": t, "时": t, "旺": t, "昂": t, "昆": t, "昇": t, "昊": t, "昌": t, "明": t, "昏": t, "易": t, "昔": t, "星": t, "映": t, "春": t, "昧": t, "昨": t, "昭": t, "是": t, "昴": t, "昶": t, "昼": t, "显": t, "晁": t, "時": t, "晃": t, "晋": t, "晏": t, "晒": t, "晓": t, "晕": t, "晚": t, "晟": t, "晦": t, "晧": t, "晨": t, "晩": t, "普": t, "景": t, "晰": t, "晴": t, "晶": t,
        "智": t, "暁": t, "暂": t, "暇": t, "暈": t, "暉": t, "暑": t, "暖": t, "暗": t, "暢": t, "暦": t, "暫": t, "暮": t, "暴": t, "曇": t, "曖": t, "曙": t, "曜": t, "曝": t, "曦": t, "曰": t, "曲": t, "曳": t, "更": t, "書": t, "曹": t, "曼": t, "曽": t, "曾": t, "替": t, "最": t, "會": t, "月": t, "有": t, "朋": t, "服": t, "朔": t, "朕": t, "朗": t, "望": t, "朝": t, "期": t, "朦": t, "朧": t, "木": t, "未": t, "末": t, "本": t, "札": t, "术": t,
        "朱": t, "朴": t, "朵": t, "朶": t, "机": t, "朽": t, "杀": t, "杂": t, "权": t, "杉": t, "李": t, "杏": t, "材": t, "村": t, "杓": t, "杖": t, "杜": t, "杞": t, "束": t, "条": t, "杣": t, "来": t, "杨": t, "杭": t, "杯": t, "杰": t, "東": t, "杵": t, "杷": t, "松": t, "板": t, "极": t, "枇": t, "析": t, "枕": t, "林": t, "枚": t, "果": t, "枝": t, "枠": t, "枡": t, "枢": t, "枪": t, "枯": t, "架": t, "枷": t, "柄": t, "柊": t, "柏": t, "某": t,
        "柑": t, "染": t, "柔": t, "柘": t, "柚": t, "查": t, "柩": t, "柯": t, "柱": t, "柳": t, "柴": t, "柵": t, "査": t, "柾": t, "柿": t, "栃": t, "栄": t, "标": t, "树": t, "栓": t, "栖": t, "栗": t, "栞": t, "校": t, "株": t, "样": t, "核": t, "根": t, "格": t, "栽": t, "桁": t, "桂": t, "桃": t, "案": t, "桌": t, "桐": t, "桑": t, "桓": t, "桔": t, "桜": t, "桝": t, "桟": t, "桧": t, "桶": t, "桾": t, "桿": t, "梁": t, "梅": t, "梓": t, "梗": t,
        "條": t, "梟": t, "梢": t, "梦": t, "梧": t, "梨": t, "梯": t, "械": t, "梱": t, "梳": t, "梵": t, "梶": t, "检": t, "棄": t, "棋": t, "棍": t, "棒": t, "棗": t, "棘": t, "棚": t, "棟": t, "棠": t, "森": t, "棲": t, "棹": t, "棺": t, "椀": t, "椅": t, "椋": t, "植": t, "椎": t, "椒": t, "椙": t, "検": t, "椰": t, "椿": t, "楊": t, "楓": t, "楔": t, "楕": t, "楚": t, "楠": t, "楡": t, "楢": t, "業": t, "楯": t, "極": t, "楷": t, "楼": t, "楽": t,
        "概": t, "榊": t, "榎": t, "榛": t, "榜": t, "榮": t, "榴": t, "槃": t, "槇": t, "構": t, "槌": t, "槍": t, "槐": t, "槓": t, "様": t, "槙": t, "槨": t, "槻": t, "槽": t, "槿": t, "樂": t, "樊": t, "樋": t, "樓": t, "標": t, "樟": t, "模": t, "樣": t, "権": t, "横": t, "樫": t, "樱": t, "樹": t, "樺": t, "樽": t, "橇": t, "橋": t, "橘": t, "橙": t, "機": t, "橿": t, "檀": t, "檄": t, "檎": t, "檜": t, "檣": t, "檬": t, "檻": t, "櫂": t, "櫃": t,
        "櫓": t, "櫛": t, "櫻": t, "欄": t, "欅": t, "欒": t, "欠": t, "次": t, "欢": t, "欣": t, "欧": t, "欲": t, "欸": t, "欺": t, "欽": t, "款": t, "歆": t, "歉": t, "歌": t, "歎": t, "歓": t, "歡": t, "止": t, "正": t, "此": t, "步": t, "武": t, "歩": t, "歪": t, "歯": t, "歳": t, "歴": t, "死": t, "歿": t, "殆": t, "殉": t, "殊": t, "残": t, "殖": t, "殲": t, "殴": t, "段": t, "殷": t, "殺": t, "殻": t, "殿": t, "毀": t, "毅": t, "母": t, "毎": t,
        "每": t, "毒": t, "毓": t, "比": t, "毕": t, "毘": t, "毛": t, "毟": t, "毫": t, "毬": t, "毯": t, "氏": t, "民": t, "气": t, "気": t, "氣": t, "水": t, "氷": t, "永": t, "氾": t, "汀": t, "汁": t, "求": t, "汉": t, "汎": t, "汐": t, "汕": t, "汗": t, "汚": t, "汝": t, "江": t, "池": t, "污": t, "汪": t, "汰": t, "汲": t, "決": t, "汽": t, "汾": t, "沁": t, "沃": t, "沈": t, "沉": t, "沌": t, "沐": t, "沒": t, "沓": t, "沖": t, "沙": t, "没": t,
        "沢": t, "沫": t, "河": t, "沸": t, "油": t, "治": t, "沼": t, "沽": t, "沾": t, "沿": t, "況": t, "泄": t, "泉": t, "泊": t, "泌": t, "法": t, "泗": t, "泛": t, "泡": t, "波": t, "泣": t, "泥": t, "注": t, "泪": t, "泰": t, "泳": t, "泽": t, "洁": t, "洋": t, "洒": t, "洗": t, "洙": t, "洛": t, "洞": t, "津": t, "洩": t, "洪": t, "洲": t, "洸": t, "活": t, "派": t, "流": t, "浄": t, "浅": t, "测": t, "浑": t, "浓": t, "浙": t, "浚": t, "浜": t,
        "浣": t, "浦": t, "浩": t, "浪": t, "浬": t, "浮": t, "浴": t, "海": t, "浸": t, "涂": t, "涅": t, "消": t, "涌": t, "涎": t, "涙": t, "涛": t, "涜": t, "润": t, "涩": t, "涯": t, "液": t, "涵": t, "涸": t, "涼": t, "淀": t, "淋": t, "淑": t, "淘": t, "淡": t, "淨": t, "淫": t, "淮": t, "深": t, "淳": t, "淵": t, "混": t, "淹": t, "添": t, "清": t, "渇": t, "済": t, "渉": t, "渋": t, "渐": t, "渓": t, "渕": t, "渙": t, "渚": t, "減": t, "渠": t,
        "渡": t, "渤": t, "渥": t, "渦": t, "温": t, "渫": t, "測": t, "渭": t, "港": t, "渴": t, "游": t, "渾": t, "湊": t, "湖": t, "湘": t, "湛": t, "湧": t, "湯": t, "湾": t, "湿": t, "満": t, "溌": t, "源": t, "準": t, "溜": t, "溝": t, "溢": t, "溥": t, "溪": t, "溫": t, "溶": t, "溺": t, "滄": t, "滅": t, "滋": t, "滑": t, "滓": t, "滔": t, "滚": t, "滝": t, "滞": t, "满": t, "滬": t, "滲": t, "滴": t, "滸": t, "滾": t, "滿": t, "漁": t, "漂": t,
        "漆": t, "漉": t, "漏": t, "漑": t, "演": t, "漕": t, "漠": t, "漢": t, "漣": t, "漫": t, "漬": t, "漱": t, "漲": t, "漸": t, "漿": t, "潁": t, "潔": t, "潘": t, "潜": t, "潟": t, "潤": t, "潭": t, "潮": t, "潰": t, "澁": t, "澄": t, "澡": t, "澤": t, "澪": t, "澱": t, "澳": t, "澹": t, "激": t, "濁": t, "濃": t, "濠": t, "濡": t, "濤": t, "濫": t, "濯": t, "濱": t, "濾": t, "瀉": t, "瀋": t, "瀑": t, "瀕": t, "瀞": t, "瀟": t, "瀧": t, "瀬": t,
        "瀾": t, "灌": t, "灘": t, "火": t, "灭": t, "灯": t, "灰": t, "灵": t, "灸": t, "灼": t, "災": t, "炉": t, "炊": t, "炎": t, "炒": t, "炙": t, "炬": t, "炭": t, "炮": t, "炯": t, "炳": t, "炸": t, "点": t, "為": t, "炼": t, "烂": t, "烈": t, "烏": t, "烙": t, "烟": t, "烦": t, "烧": t, "烫": t, "热": t, "烹": t, "焉": t, "焔": t, "焙": t, "焚": t, "無": t, "焦": t, "焰": t, "焱": t, "然": t, "焼": t, "煉": t, "煌": t, "煎": t, "煕": t, "煙": t,
        "煤": t, "煥": t, "照": t, "煩": t, "煬": t, "煮": t, "煽": t, "熊": t, "熔": t, "熙": t, "熟": t, "熱": t, "熹": t, "熾": t, "燁": t, "燃": t, "燈": t, "燐": t, "燕": t, "燗": t, "燥": t, "燦": t, "燭": t, "燵": t, "燻": t, "燼": t, "爆": t, "爛": t, "爪": t, "爬": t, "爱": t, "爵": t, "父": t, "爷": t, "爸": t, "爹": t, "爺": t, "爽": t, "爾": t, "片": t, "版": t, "牌": t, "牒": t, "牙": t, "牛": t, "牝": t, "牟": t, "牡": t, "牢": t, "牧": t,
        "物": t, "牲": t, "牵": t, "特": t, "牽": t, "犀": t, "犠": t, "犬": t, "犯": t, "状": t, "犹": t, "狀": t, "狂": t, "狄": t, "狐": t, "狗": t, "狙": t, "狛": t, "狠": t, "狡": t, "狩": t, "独": t, "狭": t, "狸": t, "狼": t, "狽": t, "猊": t, "猎": t, "猗": t, "猛": t, "猜": t, "猟": t, "猥": t, "猪": t, "猫": t, "献": t, "猶": t, "猷": t, "猾": t, "猿": t, "獄": t, "獅": t, "獏": t, "獠": t, "獣": t, "獨": t, "獪": t, "獰": t, "獲": t, "玄": t,
        "率": t, "玉": t, "王": t, "玖": t, "玛": t, "玩": t, "环": t, "现": t, "玲": t, "玻": t, "珀": t, "珂": t, "珈": t, "珊": t, "珍": t, "珠": t, "珪": t, "班": t, "現": t, "球": t, "琅": t, "理": t, "琉": t, "琢": t, "琥": t, "琪": t, "琲": t, "琳": t, "琴": t, "琵": t, "琶": t, "琺": t, "瑕": t, "瑚": t, "瑛": t, "瑜": t, "瑞": t, "瑟": t, "瑠": t, "瑤": t, "瑪": t, "瑶": t, "瑾": t, "璃": t, "璋": t, "璧": t, "環": t, "璽": t, "瓊": t, "瓜": t,
        "瓢": t, "瓣": t, "瓦": t, "瓶": t, "甑": t, "甕": t, "甘": t, "甚": t, "甜": t, "生": t, "産": t, "甥": t, "甦": t, "用": t, "甩": t, "甫": t, "田": t, "由": t, "甲": t, "申": t, "电": t, "男": t, "町": t, "画": t, "界": t, "畏": t, "畑": t, "畔": t, "留": t, "畜": t, "畝": t, "畠": t, "畢": t, "略": t, "畦": t, "番": t, "畫": t, "異": t, "畳": t, "當": t, "畷": t, "畿": t, "疆": t, "疇": t, "疋": t, "疎": t, "疏": t, "疑": t, "疫": t, "疯": t,
        "疱": t, "疲": t, "疵": t, "疹": t, "疼": t, "疽": t, "疾": t, "病": t, "症": t, "痍": t, "痒": t, "痔": t, "痕": t, "痘": t, "痙": t, "痛": t, "痢": t, "痣": t, "痩": t, "痰": t, "痴": t, "痺": t, "瘍": t, "瘡": t, "瘤": t, "瘦": t, "瘴": t, "療": t, "癇": t, "癌": t, "癒": t, "癖": t, "癪": t, "癬": t, "発": t, "登": t, "發": t, "白": t, "百": t, "的": t, "皆": t, "皇": t, "皐": t, "皓": t, "皙": t, "皮": t, "皱": t, "皺": t, "皿": t, "盃": t,
        "盆": t, "盈": t, "益": t, "盒": t, "盖": t, "盗": t, "盘": t, "盛": t, "盟": t, "盡": t, "監": t, "盤": t, "盧": t, "盪": t, "目": t, "盯": t, "盲": t, "直": t, "相": t, "盾": t, "省": t, "眇": t, "眉": t, "看": t, "県": t, "眞": t, "真": t, "眠": t, "眦": t, "眩": t, "眷": t, "眸": t, "眺": t, "眼": t, "着": t, "睁": t, "睛": t, "睡": t, "督": t, "睦": t, "睨": t, "睫": t, "睾": t, "睿": t, "瞑": t, "瞞": t, "瞠": t, "瞥": t, "瞪": t, "瞬": t,
        "瞭": t, "瞰": t, "瞳": t, "瞼": t, "矛": t, "矜": t, "矢": t, "知": t, "矩": t, "短": t, "矮": t, "矯": t, "石": t, "砂": t, "研": t, "砕": t, "砥": t, "砦": t, "砧": t, "砲": t, "破": t, "砺": t, "硕": t, "硝": t, "硫": t, "硬": t, "确": t, "硯": t, "碁": t, "碇": t, "碌": t, "碍": t, "碎": t, "碑": t, "碓": t, "碗": t, "碧": t, "碩": t, "碰": t, "確": t, "磁": t, "磊": t, "磋": t, "磐": t, "磔": t, "磨": t, "磯": t, "礁": t, "礎": t, "礦": t,
        "礫": t, "示": t, "礼": t, "社": t, "祀": t, "祁": t, "祇": t, "祈": t, "祉": t, "祐": t, "祓": t, "祖": t, "祗": t, "祚": t, "祝": t, "神": t, "祟": t, "祠": t, "祢": t, "祥": t, "票": t, "祭": t, "祷": t, "禁": t, "禄": t, "禅": t, "禊": t, "禍": t, "禎": t, "福": t, "禦": t, "禧": t, "禪": t, "禮": t, "禰": t, "禹": t, "离": t, "禽": t, "禿": t, "秀": t, "私": t, "秉": t, "秋": t, "种": t, "科": t, "秒": t, "秘": t, "租": t, "秤": t, "秦": t,
        "秩": t, "积": t, "称": t, "移": t, "稀": t, "程": t, "稍": t, "税": t, "稔": t, "稗": t, "稙": t, "稚": t, "稜": t, "稠": t, "種": t, "稲": t, "稳": t, "稷": t, "稼": t, "稽": t, "稿": t, "穀": t, "穂": t, "穆": t, "積": t, "穎": t, "穏": t, "穢": t, "穣": t, "穫": t, "穴": t, "究": t, "穹": t, "空": t, "穿": t, "突": t, "窃": t, "窄": t, "窒": t, "窓": t, "窗": t, "窘": t, "窟": t, "窩": t, "窪": t, "窮": t, "窯": t, "窺": t, "竄": t, "竇": t,
        "竈": t, "立": t, "站": t, "竜": t, "竟": t, "章": t, "竣": t, "童": t, "竦": t, "竪": t, "端": t, "競": t, "竹": t, "竺": t, "竿": t, "笏": t, "笑": t, "笔": t, "笙": t, "笛": t, "笠": t, "笥": t, "符": t, "第": t, "笹": t, "筆": t, "筈": t, "等": t, "筋": t, "筏": t, "筐": t, "筑": t, "筒": t, "答": t, "策": t, "筧": t, "筵": t, "简": t, "箇": t, "箋": t, "箏": t, "箒": t, "箔": t, "箕": t, "算": t, "箚": t, "管": t, "箪": t, "箭": t, "箱": t,
        "箸": t, "節": t, "篁": t, "範": t, "篆": t, "篇": t, "築": t, "篝": t, "篠": t, "篤": t, "篩": t, "篭": t, "簀": t, "簒": t, "簓": t, "簗": t, "簡": t, "簪": t, "簾": t, "簿": t, "籃": t, "籍": t, "籐": t, "籠": t, "籤": t, "米": t, "类": t, "籾": t, "粂": t, "粉": t, "粋": t, "粍": t, "粒": t, "粕": t, "粗": t, "粘": t, "粛": t, "粟": t, "粥": t, "粧": t, "粲": t, "精": t, "糊": t, "糎": t, "糕": t, "糖": t, "糞": t, "糟": t, "糠": t, "糧": t,
        "糸": t, "系": t, "糾": t, "紀": t, "約": t, "紅": t, "紆": t, "紋": t, "納": t, "紐": t, "純": t, "紗": t, "紘": t, "紙": t, "級": t, "紛": t, "素": t, "紡": t, "索": t, "紧": t, "紫": t, "紬": t, "累": t, "細": t, "紳": t, "紹": t, "紺": t, "終": t, "絃": t, "組": t, "絆": t, "経": t, "結": t, "絕": t, "絞": t, "絡": t, "絢": t, "給": t, "絨": t, "絮": t, "統": t, "絲": t, "絵": t, "絶": t, "絹": t, "綏": t, "經": t, "継": t, "続": t, "綜": t,
        "綬": t, "維": t, "綱": t, "網": t, "綴": t, "綸": t, "綺": t, "綻": t, "綽": t, "綾": t, "綿": t, "緊": t, "緋": t, "総": t, "緑": t, "緒": t, "線": t, "緞": t, "締": t, "編": t, "緩": t, "緬": t, "緯": t, "練": t, "緻": t, "縁": t, "縄": t, "縊": t, "縋": t, "縛": t, "縞": t, "縣": t, "縦": t, "縫": t, "縮": t, "縷": t, "縺": t, "總": t, "績": t, "繁": t, "繊": t, "繋": t, "繍": t, "織": t, "繕": t, "繚": t, "繡": t, "繫": t, "繭": t, "繰": t,
        "繹": t, "繼": t, "纂": t, "續": t, "纏": t, "红": t, "纤": t, "约": t, "级": t, "纪": t, "纯": t, "纱": t, "纳": t, "纸": t, "纹": t, "线": t, "练": t, "组": t, "细": t, "织": t, "终": t, "经": t, "绑": t, "结": t, "绕": t, "给": t, "绝": t, "统": t, "继": t, "绪": t, "续": t, "绳": t, "维": t, "绷": t, "绿": t, "缓": t, "缘": t, "缚": t, "缝": t, "缠": t, "缩": t, "缶": t, "缺": t, "罅": t, "罐": t, "网": t, "罗": t, "罚": t, "罠": t, "罢": t,
        "罩": t, "罪": t, "置": t, "罰": t, "署": t, "罵": t, "罷": t, "罹": t, "羅": t, "羊": t, "羌": t, "美": t, "羞": t, "群": t, "羨": t, "義": t, "羲": t, "羹": t, "羽": t, "翁": t, "翅": t, "翊": t, "翌": t, "習": t, "翔": t, "翘": t, "翟": t, "翠": t, "翡": t, "翰": t, "翳": t, "翻": t, "翼": t, "耀": t, "老": t, "考": t, "者": t, "耆": t, "而": t, "耐": t, "耕": t, "耗": t, "耳": t, "耶": t, "耻": t, "耽": t, "耿": t, "聊": t, "联": t, "聖": t,
        "聘": t, "聚": t, "聞": t, "聡": t, "聯": t, "聰": t, "聲": t, "聳": t, "聴": t, "聶": t, "職": t, "聽": t, "聾": t, "肆": t, "肇": t, "肉": t, "肋": t, "肌": t, "肏": t, "肖": t, "肘": t, "肚": t, "肛": t, "肝": t, "肠": t, "股": t, "肢": t, "肤": t, "肥": t, "肩": t, "肪": t, "肯": t, "肱": t, "育": t, "肴": t, "肺": t, "胀": t, "胃": t, "胆": t, "背": t, "胎": t, "胖": t, "胚": t, "胜": t, "胞": t, "胡": t, "胤": t, "胥": t, "胯": t, "胱": t,
        "胴": t, "胶": t, "胸": t, "能": t, "脂": t, "脅": t, "脆": t, "脇": t, "脈": t, "脊": t, "脏": t, "脑": t, "脖": t, "脚": t, "脛": t, "脩": t, "脫": t, "脱": t, "脳": t, "脸": t, "脹": t, "脾": t, "腋": t, "腎": t, "腐": t, "腑": t, "腔": t, "腕": t, "腥": t, "腦": t, "腫": t, "腰": t, "腱": t, "腳": t, "腸": t, "腹": t, "腺": t, "腻": t, "腾": t, "腿": t, "膀": t, "膂": t, "膊": t, "膏": t, "膚": t, "膜": t, "膝": t, "膠": t, "膣": t, "膨": t,
        "膳": t, "膵": t, "膿": t, "臀": t, "臂": t, "臆": t, "臉": t, "臍": t, "臓": t, "臣": t, "臥": t, "臧": t, "臨": t, "自": t, "臭": t, "至": t, "致": t, "臺": t, "臼": t, "舅": t, "與": t, "興": t, "舌": t, "舍": t, "舎": t, "舐": t, "舒": t, "舔": t, "舗": t, "舘": t, "舛": t, "舜": t, "舞": t, "舟": t, "航": t, "般": t, "舰": t, "舳": t, "舵": t, "舶": t, "舷": t, "船": t, "艇": t, "艘": t, "艤": t, "艦": t, "良": t, "色": t, "艳": t, "艶": t,
        "艾": t, "节": t, "芋": t, "芒": t, "芙": t, "芝": t, "芥": t, "芦": t, "芬": t, "芭": t, "芯": t, "花": t, "芳": t, "芸": t, "芹": t, "芻": t, "芽": t, "苅": t, "苍": t, "苏": t, "苑": t, "苔": t, "苗": t, "苛": t, "苞": t, "若": t, "苦": t, "苫": t, "英": t, "苺": t, "苻": t, "茂": t, "范": t, "茄": t, "茅": t, "茉": t, "茎": t, "茗": t, "茜": t, "茨": t, "茫": t, "茲": t, "茵": t, "茶": t, "茸": t, "茹": t, "荀": t, "草": t, "荊": t, "荏": t,
        "荒": t, "荘": t, "荡": t, "药": t, "荷": t, "荻": t, "荼": t, "莉": t, "莎": t, "莞": t, "莢": t, "莪": t, "莫": t, "莱": t, "莲": t, "获": t, "莹": t, "莽": t, "菅": t, "菊": t, "菌": t, "菓": t, "菖": t, "菜": t, "菟": t, "菩": t, "菫": t, "華": t, "菰": t, "菱": t, "菲": t, "萄": t, "萊": t, "萌": t, "萎": t, "萝": t, "萧": t, "萨": t, "萩": t, "萬": t, "萱": t, "萼": t, "落": t, "葉": t, "著": t, "葛": t, "葡": t, "董": t, "葦": t, "葬": t,
        "葱": t, "葵": t, "葺": t, "蒂": t, "蒋": t, "蒐": t, "蒔": t, "蒙": t, "蒲": t, "蒸": t, "蒼": t, "蓄": t, "蓉": t, "蓋": t, "蓑": t, "蓝": t, "蓬": t, "蓮": t, "蓼": t, "蔑": t, "蔓": t, "蔚": t, "蔡": t, "蔣": t, "蔦": t, "蔭": t, "蔵": t, "蔽": t, "蕃": t, "蕉": t, "蕊": t, "蕎": t, "蕨": t, "蕩": t, "蕪": t, "蕭": t, "蕾": t, "薄": t, "薇": t, "薊": t, "薔": t, "薗": t, "薙": t, "薛": t, "薦": t, "薨": t, "薩": t, "薪": t, "薫": t, "薬": t,
        "薮": t, "薯": t, "薰": t, "藁": t, "藉": t, "藍": t, "藏": t, "藝": t, "藤": t, "藩": t, "藪": t, "藺": t, "藻": t, "蘂": t, "蘆": t, "蘇": t, "蘭": t, "虎": t, "虐": t, "虑": t, "虔": t, "處": t, "虚": t, "虜": t, "虞": t, "號": t, "虫": t, "虹": t, "虻": t, "虽": t, "蚊": t, "蚕": t, "蛆": t, "蛇": t, "蛉": t, "蛋": t, "蛍": t, "蛙": t, "蛛": t, "蛟": t, "蛭": t, "蛮": t, "蛸": t, "蛹": t, "蛾": t, "蜀": t, "蜂": t, "蜃": t, "蜘": t, "蜜": t,
        "蜥": t, "蜴": t, "蜷": t, "蜻": t, "蝉": t, "蝋": t, "蝕": t, "蝙": t, "蝠": t, "蝦": t, "蝶": t, "蝿": t, "融": t, "螢": t, "螺": t, "蟄": t, "蟠": t, "蟲": t, "蟹": t, "蟻": t, "蠅": t, "蠍": t, "蠕": t, "蠢": t, "蠣": t, "蠱": t, "血": t, "衆": t, "行": t, "衍": t, "術": t, "街": t, "衙": t, "衛": t, "衝": t, "衞": t, "衡": t, "衣": t, "补": t, "表": t, "衫": t, "衰": t, "衷": t, "衾": t, "衿": t, "袁": t, "袂": t, "袈": t, "袋": t, "袍": t,
        "袖": t, "袜": t, "袢": t, "被": t, "袭": t, "袱": t, "袴": t, "裁": t, "裂": t, "装": t, "裏": t, "裔": t, "裕": t, "裙": t, "補": t, "裝": t, "裟": t, "裡": t, "裤": t, "裳": t, "裴": t, "裸": t, "裹": t, "製": t, "裾": t, "褄": t, "複": t, "褌": t, "褐": t, "褒": t, "褥": t, "褪": t, "褶": t, "褻": t, "襄": t, "襖": t, "襞": t, "襟": t, "襦": t, "襲": t, "襷": t, "西": t, "要": t, "覆": t, "覇": t, "見": t, "規": t, "視": t, "覗": t, "覚": t,
        "覧": t, "親": t, "観": t, "覺": t, "见": t, "观": t, "规": t, "视": t, "览": t, "觉": t, "角": t, "解": t, "触": t, "觸": t, "言": t, "訂": t, "訃": t, "計": t, "訊": t, "討": t, "訓": t, "託": t, "記": t, "訛": t, "訝": t, "訟": t, "訣": t, "訥": t, "訪": t, "設": t, "許": t, "訳": t, "訴": t, "訶": t, "診": t, "註": t, "証": t, "詈": t, "詐": t, "詔": t, "評": t, "詛": t, "詞": t, "詠": t, "詢": t, "詣": t, "試": t, "詩": t, "詫": t, "詭": t,
        "詮": t, "詰": t, "話": t, "該": t, "詳": t, "誂": t, "誅": t, "誇": t, "誉": t, "誌": t, "認": t, "誑": t, "誓": t, "誕": t, "誘": t, "語": t, "誠": t, "誤": t, "誦": t, "說": t, "説": t, "読": t, "誰": t, "課": t, "誹": t, "誼": t, "調": t, "談": t, "請": t, "諌": t, "諍": t, "諏": t, "諒": t, "論": t, "諜": t, "諡": t, "諦": t, "諧": t, "諫": t, "諭": t, "諮": t, "諱": t, "諷": t, "諸": t, "諺": t, "諾": t, "謀": t, "謁": t, "謂": t, "謎": t,
        "謐": t, "謗": t, "謙": t, "講": t, "謝": t, "謡": t, "謬": t, "謳": t, "謹": t, "證": t, "識": t, "譚": t, "譜": t, "警": t, "議": t, "譲": t, "護": t, "讀": t, "讃": t, "變": t, "讐": t, "讒": t, "讓": t, "计": t, "认": t, "讨": t, "让": t, "训": t, "议": t, "记": t, "讲": t, "讶": t, "许": t, "论": t, "设": t, "证": t, "识": t, "诉": t, "试": t, "诗": t, "话": t, "该": t, "语": t, "诱": t, "说": t, "诶": t, "请": t, "诺": t, "读": t, "课": t,
        "谁": t, "调": t, "谈": t, "谓": t, "谢": t, "谷": t, "豆": t, "豊": t, "豚": t, "象": t, "豪": t, "豫": t, "豹": t, "貂": t, "貌": t, "貝": t, "貞": t, "負": t, "財": t, "貢": t, "貧": t, "貨": t, "販": t, "貪": t, "貫": t, "責": t, "貯": t, "貰": t, "貴": t, "貶": t, "買": t, "貸": t, "費": t, "貼": t, "貿": t, "賀": t, "賂": t, "賃": t, "賄": t, "資": t, "賈": t, "賊": t, "賑": t, "賓": t, "賛": t, "賜": t, "賞": t, "賠": t, "賢": t, "賣": t,
        "賤": t, "賦": t, "質": t, "賭": t, "購": t, "賽": t, "贄": t, "贅": t, "贈": t, "贋": t, "贔": t, "贖": t, "贝": t, "负": t, "责": t, "败": t, "货": t, "质": t, "贱": t, "贴": t, "贵": t, "费": t, "资": t, "赏": t, "赛": t, "赤": t, "赦": t, "赫": t, "走": t, "赳": t, "赴": t, "赵": t, "赶": t, "起": t, "趁": t, "超": t, "越": t, "趙": t, "趣": t, "趨": t, "足": t, "趴": t, "趾": t, "跋": t, "跑": t, "距": t, "跟": t, "跡": t, "跨": t, "跪": t,
        "路": t, "跳": t, "践": t, "踊": t, "踏": t, "踝": t, "踢": t, "踩": t, "踪": t, "踵": t, "蹂": t, "蹄": t, "蹊": t, "蹟": t, "蹭": t, "蹲": t, "蹴": t, "躁": t, "躇": t, "躊": t, "躍": t, "躓": t, "躙": t, "身": t, "躬": t, "躯": t, "躰": t, "躱": t, "躲": t, "躺": t, "躾": t, "軀": t, "車": t, "軋": t, "軌": t, "軍": t, "軒": t, "軟": t, "転": t, "軸": t, "軽": t, "較": t, "載": t, "輌": t, "輔": t, "輕": t, "輛": t, "輜": t, "輝": t, "輩": t,
        "輪": t, "輯": t, "輸": t, "輻": t, "輿": t, "轄": t, "轉": t, "轍": t, "轟": t, "轡": t, "轢": t, "车": t, "转": t, "轮": t, "软": t, "轻": t, "较": t, "辈": t, "辉": t, "输": t, "辛": t, "辜": t, "辞": t, "辟": t, "辣": t, "辦": t, "辰": t, "辱": t, "農": t, "边": t, "辺": t, "辻": t, "込": t, "达": t, "辿": t, "迂": t, "迄": t, "迅": t, "过": t, "迎": t, "运": t, "近": t, "返": t, "还": t, "这": t, "进": t, "远": t, "连": t, "迦": t, "迪": t,
        "迫": t, "迭": t, "述": t, "迷": t, "迸": t, "迹": t, "追": t, "退": t, "送": t, "适": t, "逃": t, "逅": t, "逆": t, "选": t, "逍": t, "透": t, "逐": t, "递": t, "逓": t, "途": t, "逗": t, "這": t, "通": t, "逝": t, "逞": t, "速": t, "造": t, "逡": t, "逢": t, "連": t, "逮": t, "週": t, "進": t, "逸": t, "逼": t, "遁": t, "遂": t, "遅": t, "遇": t, "遊": t, "運": t, "遍": t, "過": t, "道": t, "達": t, "違": t, "遗": t, "遙": t, "遜": t, "遠": t,
        "遡": t, "遣": t, "遥": t, "適": t, "遭": t, "遮": t, "遵": t, "遷": t, "選": t, "遺": t, "遼": t, "遽": t, "避": t, "邀": t, "邁": t, "邂": t, "還": t, "邇": t, "邉": t, "邊": t, "邏": t, "邑": t, "那": t, "邦": t, "邨": t, "邪": t, "邯": t, "邱": t, "邵": t, "邸": t, "郁": t, "郊": t, "郎": t, "郞": t, "郡": t, "部": t, "郭": t, "郵": t, "郷": t, "都": t, "鄙": t, "鄧": t, "鄭": t, "鄴": t, "酉": t, "酊": t, "酋": t, "酌": t, "配": t, "酎": t,
        "酒": t, "酔": t, "酢": t, "酥": t, "酩": t, "酪": t, "酬": t, "酱": t, "酵": t, "酷": t, "酸": t, "醇": t, "醉": t, "醍": t, "醐": t, "醒": t, "醜": t, "醤": t, "醫": t, "醸": t, "采": t, "釈": t, "釉": t, "释": t, "里": t, "重": t, "野": t, "量": t, "金": t, "釘": t, "釜": t, "針": t, "釣": t, "釧": t, "鈍": t, "鈔": t, "鈴": t, "鉄": t, "鉈": t, "鉉": t, "鉛": t, "鉢": t, "鉤": t, "鉦": t, "鉱": t, "鉾": t, "銀": t, "銃": t, "銅": t, "銑": t,
        "銘": t, "銚": t, "銛": t, "銜": t, "銭": t, "鋏": t, "鋒": t, "鋤": t, "鋭": t, "鋲": t, "鋳": t, "鋸": t, "鋼": t, "錆": t, "錐": t, "錘": t, "錠": t, "錦": t, "錨": t, "錫": t, "錬": t, "錮": t, "錯": t, "録": t, "鍋": t, "鍔": t, "鍛": t, "鍬": t, "鍮": t, "鍵": t, "鍼": t, "鍾": t, "鎌": t, "鎖": t, "鎚": t, "鎧": t, "鎬": t, "鎮": t, "鎹": t, "鏃": t, "鏑": t, "鏡": t, "鐘": t, "鐙": t, "鐵": t, "鐸": t, "鑑": t, "鑽": t, "鑿": t, "针": t,
        "钟": t, "钱": t, "钻": t, "铁": t, "铃": t, "银": t, "链": t, "锁": t, "锐": t, "错": t, "镇": t, "镜": t, "長": t, "长": t, "門": t, "閂": t, "閃": t, "閉": t, "開": t, "閏": t, "閑": t, "間": t, "閔": t, "閘": t, "関": t, "閣": t, "閤": t, "閥": t, "閨": t, "閩": t, "閲": t, "閻": t, "閾": t, "闇": t, "闊": t, "闍": t, "闕": t, "闖": t, "闘": t, "關": t, "门": t, "闪": t, "闭": t, "问": t, "间": t, "闷": t, "闹": t, "闻": t, "阜": t, "队": t,
        "阪": t, "阮": t, "防": t, "阳": t, "阴": t, "阵": t, "阻": t, "阿": t, "陀": t, "附": t, "际": t, "陆": t, "陈": t, "陌": t, "降": t, "限": t, "陛": t, "陝": t, "院": t, "陣": t, "除": t, "陥": t, "险": t, "陪": t, "陰": t, "陳": t, "陵": t, "陶": t, "陷": t, "陸": t, "険": t, "陽": t, "隅": t, "隆": t, "隈": t, "隊": t, "隋": t, "階": t, "随": t, "隐": t, "隔": t, "隕": t, "隘": t, "隙": t, "際": t, "障": t, "隠": t, "隣": t, "隧": t, "隨": t,
        "隴": t, "隶": t, "隷": t, "隻": t, "隼": t, "难": t, "雀": t, "雁": t, "雄": t, "雅": t, "集": t, "雇": t, "雉": t, "雌": t, "雍": t, "雑": t, "雖": t, "雙": t, "雛": t, "雜": t, "離": t, "難": t, "雨": t, "雪": t, "雫": t, "雯": t, "雰": t, "雲": t, "零": t, "雷": t, "雹": t, "電": t, "雾": t, "需": t, "震": t, "霊": t, "霍": t, "霖": t, "霜": t, "霞": t, "霧": t, "霰": t, "露": t, "霸": t, "霹": t, "靂": t, "靄": t, "靈": t, "青": t, "靖": t,
        "静": t, "靜": t, "非": t, "靠": t, "靡": t, "面": t, "革": t, "靭": t, "靱": t, "靴": t, "靺": t, "鞄": t, "鞆": t, "鞋": t, "鞍": t, "鞘": t, "鞠": t, "鞨": t, "鞭": t, "韋": t, "韓": t, "韩": t, "韮": t, "音": t, "韶": t, "韻": t, "響": t, "頁": t, "頂": t, "頃": t, "項": t, "順": t, "須": t, "頌": t, "預": t, "頑": t, "頒": t, "頓": t, "頗": t, "領": t, "頚": t, "頬": t, "頭": t, "頰": t, "頴": t, "頷": t, "頸": t, "頻": t, "頼": t, "頽": t,
        "顆": t, "題": t, "額": t, "顎": t, "顔": t, "顕": t, "願": t, "顛": t, "類": t, "顧": t, "顫": t, "顯": t, "顰": t, "顶": t, "项": t, "顺": t, "须": t, "顾": t, "顿": t, "预": t, "领": t, "颈": t, "颊": t, "频": t, "颗": t, "题": t, "颜": t, "额": t, "颤": t, "風": t, "颯": t, "飄": t, "风": t, "飘": t, "飛": t, "飞": t, "食": t, "飢": t, "飯": t, "飲": t, "飴": t, "飼": t, "飽": t, "飾": t, "餃": t, "餅": t, "餉": t, "養": t, "餌": t, "餐": t,
        "餓": t, "餘": t, "餞": t, "餡": t, "館": t, "饅": t, "饉": t, "饌": t, "饒": t, "饗": t, "饭": t, "饱": t, "饶": t, "馆": t, "首": t, "香": t, "馨": t, "馬": t, "馮": t, "馳": t, "馴": t, "駁": t, "駄": t, "駅": t, "駆": t, "駈": t, "駐": t, "駒": t, "駕": t, "駝": t, "駱": t, "駿": t, "騎": t, "騒": t, "験": t, "騙": t, "騨": t, "騰": t, "驃": t, "驍": t, "驕": t, "驚": t, "驤": t, "马": t, "骂": t, "验": t, "骑": t, "骚": t, "骨": t, "骸": t,
        "髄": t, "髏": t, "髑": t, "體": t, "高": t, "髙": t, "髪": t, "髭": t, "髮": t, "髯": t, "髷": t, "鬆": t, "鬘": t, "鬚": t, "鬨": t, "鬱": t, "鬼": t, "魁": t, "魂": t, "魃": t, "魄": t, "魅": t, "魈": t, "魎": t, "魏": t, "魔": t, "魘": t, "魚": t, "魯": t, "鮎": t, "鮑": t, "鮫": t, "鮭": t, "鮮": t, "鯉": t, "鯖": t, "鯛": t, "鯨": t, "鯰": t, "鯱": t, "鰐": t, "鰓": t, "鰭": t, "鰹": t, "鰻": t, "鱈": t, "鱒": t, "鱗": t, "鱼": t, "鲁": t,
        "鲜": t, "鳥": t, "鳩": t, "鳳": t, "鳴": t, "鳶": t, "鴉": t, "鴎": t, "鴨": t, "鴫": t, "鴻": t, "鵜": t, "鵞": t, "鵠": t, "鵡": t, "鵬": t, "鵯": t, "鵺": t, "鶏": t, "鶯": t, "鶴": t, "鷗": t, "鷲": t, "鷹": t, "鷺": t, "鸞": t, "鸡": t, "鸣": t, "鹵": t, "鹸": t, "鹿": t, "麒": t, "麓": t, "麗": t, "麟": t, "麦": t, "麹": t, "麺": t, "麻": t, "麼": t, "麾": t, "麿": t, "黄": t, "黎": t, "黏": t, "黑": t, "黒": t, "默": t, "黙": t, "黛": t,
        "點": t, "黴": t, "鼎": t, "鼓": t, "鼠": t, "鼻": t, "齊": t, "齋": t, "齎": t, "齐": t, "齟": t, "齢": t, "齧": t, "齬": t, "齿": t, "龍": t, "龐": t, "龕": t, "龙": t, "龟": t, "가": t, "각": t, "간": t, "같": t, "거": t, "건": t, "걸": t, "것": t, "게": t, "겠": t, "고": t, "과": t, "구": t, "그": t, "금": t, "기": t, "까": t, "나": t, "남": t, "내": t, "너": t, "네": t, "녀": t, "눈": t, "는": t, "니": t, "다": t, "대": t, "더": t, "던": t,
        "데": t, "도": t, "동": t, "되": t, "두": t, "드": t, "들": t, "때": t, "라": t, "람": t, "래": t, "러": t, "런": t, "레": t, "려": t, "로": t, "르": t, "를": t, "리": t, "마": t, "만": t, "말": t, "며": t, "면": t, "모": t, "무": t, "문": t, "물": t, "미": t, "바": t, "발": t, "방": t, "보": t, "부": t, "분": t, "비": t, "사": t, "살": t, "상": t, "생": t, "서": t, "선": t, "성": t, "세": t, "소": t, "손": t, "수": t, "스": t, "습": t, "시": t,
        "신": t, "실": t, "아": t, "안": t, "않": t, "았": t, "야": t, "어": t, "없": t, "었": t, "에": t, "여": t, "였": t, "오": t, "와": t, "요": t, "우": t, "운": t, "위": t, "유": t, "으": t, "은": t, "을": t, "음": t, "의": t, "이": t, "인": t, "일": t, "입": t, "있": t, "자": t, "장": t, "저": t, "적": t, "전": t, "정": t, "제": t, "조": t, "주": t, "지": t, "진": t, "차": t, "치": t, "카": t, "하": t, "한": t, "할": t, "해": t, "했": t, "화": t,
        "히": t, "﨑": t, "\ufe0e": t, "\ufe0f": t, "﹅": t, "～": t, "🌸": t, "🐰": t, "💕": t, "💢": t, "💦": t, "💧": t, "\udb40": t, "\udd00": t,
        'Ａ': t, 'Ｂ': t, 'Ｃ': t, 'Ｄ': t, 'Ｅ': t, 'Ｆ': t, 'Ｇ': t, 'Ｈ': t, 'Ｉ': t, 'Ｊ': t, 'Ｋ': t, 'Ｌ': t, 'Ｍ': t, 'Ｎ': t, 'Ｏ': t, 'Ｐ': t, 'Ｑ': t, 'Ｒ': t, 'Ｓ': t, 'Ｔ': t, 'Ｕ': t, 'Ｖ': t, 'Ｗ': t, 'Ｘ': t, 'Ｙ': t, 'Ｚ': t, 'ａ': t, 'ｂ': t, 'ｃ': t, 'ｄ': t, 'ｅ': t, 'ｆ': t, 'ｇ': t, 'ｈ': t, 'ｉ': t, 'ｊ': t, 'ｋ': t, 'ｌ': t, 'ｍ': t, 'ｎ': t, 'ｏ': t, 'ｐ': t, 'ｑ': t, 'ｒ': t, 'ｓ': t, 'ｔ': t, 'ｕ': t, 'ｖ': t, 'ｗ': t, 'ｘ': t, 'ｙ': t, 'ｚ': t, '０': t, '１': t, '２': t, '３': t, '４': t, '５': t, '６': t, '７': t, '８': t, '９': t,
        ' ': t, '　': t, '／': t, '＼': t, '＊': t, '．': t, '？': t, '！': t, '（': t, '）': t, '【': t, '】': t, '［': t, '］': t, '｛': t, '｝': t, '＜': t, '＞': t, '：': t, '…': t, '”': t, '＄': t, '％': t, '＆': t, '’': t, '＠': t, '＊': t, '＾': t, '＝': t, '｜': t, '；': t, '＋': t, '＿': t, '゛': t, '～': t, '－': t,
    }
    // 本文入力欄の分割を複数文コメントや最新の出力文(色の変わっている部分)の途中になるのを避ける機能
    /**
     *
     * @param {string|null} orig_text
     * @param {boolean} nospan
     * @param {boolean} noscroll
     * @param {Number} tagreplace
     */
    window.TextSharding = function (orig_text = null, nospan = true, noscroll = false, tagreplace = 0) {
        let $ = window.jQuery
        if (!orig_text) {
            orig_text = localStorage.textdata;
        }

        let sharding_max = 0
        if ($.cookie("use_shards") == "optout") {
            if (window.matchMedia && window.matchMedia('(max-device-width: 900px)').matches) {
                sharding_max = 8000;
            } else {
                sharding_max = 500000;
            }
        } else if (window.matchMedia && window.matchMedia('(max-device-width: 900px)').matches) {
            sharding_max = 1500;
        } else {
            sharding_max = 8000;
        }

        $('#data_container').empty();
        if (orig_text.length >= 1280) { $('#data_container').css('min-height', $('#data_container').css('max-height')); }
        else { $('#data_container').css('min-height', ''); }
        let i = 0;

	    // 折りたたみタグは置換ではなく削除する。
        if (window.removeThinkFoldBlocks) {
            orig_text = window.removeThinkFoldBlocks(orig_text, 0);
        }

        if (nospan == true) {
            orig_text = orig_text.replace(/<span.*?>|<\/span>/gi, '');
        }

        // テキストカラーの置換回避処理
        for (i = 1; i < 4; i++) {
          const tar_tag = new RegExp ("<font( class=\"textcolor_"+i+"\".*?)>(.*?)</font>", "gi" );
          const reb_reg = "__TXTC_S__$1__TXTC_SE__$2__TXTC_E__"
          orig_text = orig_text.replace( tar_tag, reb_reg );
        }

        // 装飾用AIカラーの置換回避
        {
            const tar_tag = new RegExp ("<font( class=\"textcolor_ai\".*?)>(.*?)</font>", "gi" );
            const reb_reg = "__TXTC_S__$1__TXTC_SE__$2__TXTC_E__"
            orig_text = orig_text.replace( tar_tag, reb_reg );
        }

        orig_text = orig_text.replace(/(<font.*?>|<\/font>)/gi, '');
        orig_text = orig_text.replace(/(<a.*?>)/gi, '');
        orig_text = orig_text.replace(/(<\/a>)/gi, '');
        orig_text = orig_text.replace(/(<pre.*?>|<\/pre>)/gi, '');
        orig_text = orig_text.replace(/(\n)/gi, '<br>');
        orig_text = orig_text.replace(/(<div><br>)/gi, '<br>');
        orig_text = orig_text.replace(/(<br.*?>)/gi, '<br>');
        orig_text = orig_text.replace(/(<div.*?>)/gi, '<br>');
        orig_text = orig_text.replace(/(<\/div>)/gi, '');
        // イメージの埋め込み処理対策
        orig_text = orig_text.replace(/(<img class="mod_insert_image"[^>]*>)/gi, '');
        // イメージの埋め込み処理対策ここまで

        // 使用許可タグを置換する
        if (tagreplace == 1) {
            orig_text = window.DecoratedText(orig_text);
        } else if(tagreplace == 2){
            // Undo時に設定がオンになっている場合は許可タグをすべてテキストに戻す。
            orig_text = RemoveDecorationText(orig_text);
        }

        orig_text = orig_text.replace(/(__TXTC_S__.*?__TXTC_SE__)?(@\/\*|＠／＊)(?![^@＠]*(?:@\/\*|＠／＊))(.*?)(@\*\/|＠＊／)(__TXTC_E__)?/g, '<font color=\"#aaaaaa\">$2$1$3$5$4</font>');
        // orig_text = orig_text.replace(/(@\/\*|＠／＊)/g, '<span class="temp_comment_start">$1</span>');
        // orig_text = orig_text.replace(/(@\*\/|＠＊／)/g, '<span class="temp_comment_end">$1</span>');
        //orig_text = orig_text.replace(/(@\/\*)/gi, '<font color=\"#aaaaaa\">@/*');
        //orig_text = orig_text.replace(/(@\*\/)/gi, '@*</a>\/</font>');
        //orig_text = orig_text.replace(/(＠／＊)/gi, '<font color=\"#aaaaaa\">＠／＊');
        //orig_text = orig_text.replace(/(＠＊／)/gi, '＠＊</a>／</font>');
        orig_text = orig_text.replace(/(@_)(.*?)(<br>)/gi, '<font color=\"#aaaaaa\">@_$2</font><br>');
        //orig_text = orig_text.replace(/@endpoint(?!.*?@endpoint.*?)(.*?)(<br>)*$/i, '<font color=\"#aaaaaa\">@endpoint$1</font>');
        orig_text = orig_text.replace(/@endpoint(.*?)(<br>)*$/i, '<font color=\"#aaaaaa\">@endpoint$1</font>');

        // startpointもしくはbreakより前の文章は色を変える(テスト機能)
        orig_text = orig_text.replace(/(^.*@startpoint)/, '<font color=\"#aaaaaa\">$1</font>');
        orig_text = orig_text.replace(/(^.*@break)/, '<font color=\"#aaaaaa\">$1</font>');

        // テキストカラータグを元に戻す
        if ( tagreplace == 2) {
            orig_text = orig_text.replace(/__TXTC_S__ class="textcolor_(.*?)"__TXTC_SE__(.*?)__TXTC_E__/gi, "&lt;f color$1&gt;$2&lt;/f&gt;");
        } else {
            orig_text = orig_text.replace(/__TXTC_S__(.*?)__TXTC_SE__(.*?)__TXTC_E__/gi, "<font$1>$2</font>");
        }

        // カラータグにおいて仕様想定外の表記方法で変換に失敗した場合、それらのタグを消去する。
        for (i = 1; i < 4; i++) {
            orig_text = orig_text.replace(" class=\"textcolor_"+i+"\"__TXTC_SE__", "" );
        }
        orig_text = orig_text.replace( "__TXTC_S__", "" );
        orig_text = orig_text.replace( "__TXTC_SE__", "" );
        orig_text = orig_text.replace( "__TXTC_E__", "" );

        // すぴこさま/でりだ-03は理論上全ての文字が扱えるのでハイライトはしない
        if ( ! isSpikoTokenizer())
        {
            for (let i = orig_text.length - 1; i >= 0; i--) {
                if (orig_text[i] === '>') {
                    // タグ部分をスキップ
                    // TODO:スキップするとタグが適用された文章にハイライトが挿入できないのでは？
                    const pos = orig_text.lastIndexOf('<', i)
                    if (pos > 0) {
                        const tag_name = orig_text.substring(pos + 1, i)
                        if (tag_name[0] === '/') {
                            const pos2 = orig_text.lastIndexOf('<' + tag_name.substring(1), pos)
                            if (pos2 > 0) {
                                i = pos2
                            }
                        } else {
                            i = pos
                        }
                    }
                } else {
                    // ハイライトを挿入
                    let j = i
                    for (; j >= 0; j--) {
                        if (isV3Tokenizer()) {
                            const codePoint = orig_text.codePointAt(j)
                            if (codePoint >= 0xDC00 && codePoint <= 0xDFFF) {
                                // サロゲートペアの後ろ
                                if (char_list_20b[orig_text.substr(j - 1, 2)]) {
                                    if (j === i) {
                                        j--
                                        i = j
                                    }
                                    break
                                } else {
                                    j--
                                }
                            } else if (char_list_20b[orig_text[j]]) {
                                break
                            }
                        } else {
                            if (char_list[orig_text[j]]) {
                                break
                            }
                        }
                    }
                    if (i !== j) {
                        orig_text = orig_text.substring(0, j + 1) + '<a style="border:1px solid;color:inherit">' + orig_text.substring(j + 1, i + 1) + '</a>' + orig_text.substring(i + 1)
                        i = j
                    }
                }
            }
        }

        const font_family = document.getElementById("vis_fontfamily").value.replace(/"/gi, '');

        var last_shard_ends_with_br = false;

        if (orig_text.length >= 1) {
            const data_container = document.getElementById('data_container')
            const data_edit = document.createElement('div')
            data_edit.contentEditable = 'true'
            data_edit.spellcheck = false
            data_edit.autocapitalize = 'off'
            data_edit.id = 'data_edit'
            data_edit.className = 'data_edit'
            data_edit.setAttribute('autocorrect', 'off')
            data_edit.style.fontFamily = font_family
            data_edit.style.fontSize = (document.getElementById('vis_fontsize').value / 40) + 'rem'
            data_edit.style.letterSpacing = (document.getElementById('vis_fontkerning').value / 80) + 'rem'
            data_edit.style.lineHeight = (document.getElementById('vis_fontleading').value / 10) + 'rem'
            data_edit.style.color = document.getElementById('vis_fontcolor').value
            data_edit.onclick = () => { window.CopyContent(); window.savecurrentwork(); }
            data_edit.onmouseout = () => { window.CopyContent(); window.savecurrentwork(); }
            data_edit.onpaste = (event) => { window.handle_paste(this, event); return false; }

            data_edit.innerHTML = orig_text

            // 複数行コメント @/* ～ @*/ をfontタグで囲う
            // while (1) {
            //     const comment_start = data_edit.querySelector('.temp_comment_start')
            //     if (!comment_start) {
            //         break
            //     }
            // }

            /**
             * 指定ノードの最後が改行かチェックする。子孫ノードの末尾が改行でも可。
             * @param {Node} node
             * @returns {boolean}
             */
            const checkLastBr = (node) => {
                if (node.hasChildNodes()) {
                    return checkLastBr(node.lastChild)
                }
                if (node.nodeType === Node.ELEMENT_NODE && node instanceof Element && node.tagName === 'BR') {
                    return true
                }
                return false
            }
            while (data_edit.textContent.length > sharding_max) {
                // まず次のdivを作って、そのdivの文字数が規定値になるまで後ろから順番にノードを移動する
                const next_data_edit = data_edit.cloneNode()
                // cloneNodeでイベントはコピーされない
                next_data_edit.onclick = data_edit.onclick
                next_data_edit.onmouseout = data_edit.onmouseout
                next_data_edit.onpaste = data_edit.onpaste

                // あとで削るので、limitはちょっと超えても良いことにする
                let lastNode = null, limit = sharding_max * 1.1
                while (limit > 0 && data_edit.lastChild) {
                    const last_length = data_edit.lastChild.textContent.length;
                    if (limit - last_length < 0) {
                        // 次のノードを追加して規定値を超えるなら、追加せずに抜ける
                        // ただし、次のノードが大きい場合で、既に追加したノードの量が少ない、または全く無い場合は、追加する
                        if ( ! ((last_length < sharding_max && limit > sharding_max * 3 / 4)
                            || (last_length >= sharding_max && limit === sharding_max * 1.1))) {
                            break;
                        }
                    }

                    lastNode = next_data_edit.insertBefore(data_edit.lastChild, lastNode)
                    limit -= last_length
                }


                // 規定値になったら、先頭のノードを改行に相当するところまで切り取って、改行の手前までを元のdivに戻す
                if (data_edit.lastChild === null || checkLastBr(data_edit.lastChild)) {
                    // 前のdivの最後が改行だったら何もしない
                    data_container.insertBefore(next_data_edit, data_container.firstChild)
                    continue
                }
                while (next_data_edit.hasChildNodes()) {
                    const target = next_data_edit.firstChild
                    if (target.nodeType === Node.ELEMENT_NODE && target instanceof Element) {
                        if (target.tagName === 'BR') {
                            // 改行は前のに戻して、範囲確定
                            data_edit.append(target)
                            // 連続する改行は全部前のに戻す
                            let target_br = next_data_edit.firstChild
                            while (target_br.nodeType === Node.ELEMENT_NODE && target_br instanceof Element && target_br.tagName === 'BR') {
                                data_edit.append(target_br)
                                target_br = next_data_edit.firstChild
                            }
                            break
                        } else if (target.tagName === 'FONT') {
                            // if (target.getAttribute('color') === '#aaaaaa') {
                            //     // コメントブロックである。つまりこの前後には改行があるものとして扱えるはず
                            //     // コメントブロックは分割しないので、ループ離脱
                            //     break
                            // } else {

                            // AI出力その他装飾である
                            // 中の改行を探す
                            const br_list = target.querySelectorAll('br')
                            if (br_list.length === 0) {
                                // 改行が見つからなかったので前のに戻す
                                data_edit.append(target)
                                continue
                            }
                            for (const br of br_list) {
                                if (br.parentNode !== target) {
                                    // fontタグが入れ子になっていてややこしいので、このbrは使わない
                                    continue
                                }

                                if (target.lastChild === br) {
                                    // fontタグの最後が改行なので、全体を前のに戻す
                                    data_edit.append(target)
                                    break
                                }
                                // fontタグをbrの前後に分ける
                                const clone = target.cloneNode()
                                while (target.firstChild !== br && target.hasChildNodes()) {
                                    clone.appendChild(target.firstChild)
                                }
                                // 改行はfontの外に出しておかないと、シャーディングの枠にフォーカスしたとき、末尾に改行が追加されてしまう
                                data_edit.append(clone, br)

                                break
                            }
                            // ここまで来たら少なくもとどこかの改行で分割しているはずなので抜ける
                            break

                            // }
                        }
                    }

                    // テキストノードや未知のタグなので前のに戻して、次のノードへ
                    data_edit.append(target)
                }

                data_container.insertBefore(next_data_edit, data_container.firstChild)
            }

            if (data_edit.hasChildNodes()) {
                data_container.insertBefore(data_edit, data_container.firstChild)
            } else {
                // ノードがないので消す
                data_edit.remove()
            }
        }

        // イメージの挿入
        applyInsertImage()

        // 通常のスクロールをendpointがあればその前になるようにする
        if (getOutputType() === OUTPUT_TYPE_TEXTCOLOR_AI) {
            endpointScroll('.textcolor_ai')
        } else {
            endpointScroll('ai_output')
        }
        if (!nospan) {
            // 出力挿入時やUndo、Redoなどのスクロールを止める
            disableScrollTop()
        }
    }

    // 最終保存日時の記録
    let lastLocalSave = '', lastRemoteSave = ''
    // 情報表示の機能
    let totalOutputChar = 0, totalOutputCount = 0, totalRetryCount = 0, lastTextDateCount = 0
    // セッション情報の読み書き
    const saveSession = function () {
        const history_hidden = document.getElementById('show-history-text-hidden')
        const current_undo = createHistoryText(true)
        const history = (current_undo ? '<|entry|>' + current_undo : '') + (history_hidden ? history_hidden.value : '')
        sessionStorage['usermod_stat_' + localStorage.current_works_id] = JSON.stringify({ totalOutputChar, totalOutputCount, totalRetryCount, history })
    }
    const loadSession = function () {
        if (sessionStorage['usermod_stat_' + localStorage.current_works_id]) {
            const stat_data = JSON.parse(sessionStorage['usermod_stat_' + localStorage.current_works_id])
            totalOutputChar = stat_data.totalOutputChar
            totalOutputCount = stat_data.totalOutputCount
            totalRetryCount = stat_data.totalRetryCount
            const history_hidden = document.getElementById('show-history-text-hidden')
            if (history_hidden) {
                history_hidden.value = stat_data.history
                buildHistorySelect()
                UpdateModInfo()
            }
        }
    }
    const UpdateModInfo = function () {
        const area = document.getElementById('mod-information')
        const avgOutputChar = totalOutputChar / totalOutputCount,
            avgRetryCount = totalRetryCount / (totalOutputCount - totalRetryCount)
        if (area && !Number.isNaN(avgOutputChar) && !Number.isNaN(avgRetryCount)) {
            const text = `総出力回数： ${totalOutputCount}回
総出力文字数： ${totalOutputChar}文字
平均出力文字数： ${Math.round(avgOutputChar * 100) / 100}文字
総リトライ回数： ${totalRetryCount}回
平均リトライ回数： ${Math.round(avgRetryCount * 100) / 100}回`
            area.value = text + (lastTextDateCount ? `\nおおよその本文の文字数：約${lastTextDateCount}文字` : '') + (lastLocalSave !== '' ? `\n最後にローカル保存した日時：${lastLocalSave}` : '') + (lastRemoteSave !== '' ? `\n最後にリモート保存した日時：${lastRemoteSave}` : '')
        } else if (lastLocalSave !== '' || lastRemoteSave !== '') {
            area.value = (lastLocalSave !== '' ? `最後にローカル保存した日時：${lastLocalSave}` : '') + (lastRemoteSave !== '' ? `\n最後にリモート保存した日時：${lastRemoteSave}` : '')
        }
    }

    // textcolor_aiに情報表示を追加
    document.getElementsByTagName('head')[0].insertAdjacentHTML('beforeend', `<style type="text/css" id="mod-textcolor-ai-css-var">
        .mod_textcolor_ai_timestamp {
            --tooltip-offset: -1.2rem;
            --outline: dotted 1px;
        }
    </style><style type="text/css" id="mod-textcolor-ai">
        .mod_textcolor_ai_timestamp .textcolor_ai {
            position: relative;
        }
        .mod_textcolor_ai_timestamp .textcolor_ai:hover {
            outline: var(--outline);
        }
        .mod_textcolor_ai_timestamp .textcolor_ai[data-timestamp]:hover::before {
            pointer-events: none;
            content: attr(data-timestamp);
            position: absolute;
            background-color: beige;
            color: black;
            border: 1px solid grey;
            font-size: 75%;
            line-height: 100%;
            top: var(--tooltip-offset);
            left: 0;
            padding: 2px 2px;
            text-wrap: nowrap;
        }
        #show-history-text .textcolor_ai {
            color: revert;
        }
    </style>`)

    // textcolor_ai使用時に、最新出力結果への操作が正しく行われるために、先に結果テキストをキャッシュする
    const resultHistory = [['', '']]
    const originalAIOutput_Writelog = window.AIOutput_Writelog
    window.AIOutput_Writelog = function (text) {
        resultHistory.push([text, formatDate(new Date())])
        return originalAIOutput_Writelog(text)
    }
    /**
     *
     * @param {number} index
     * @param {boolean} with_tag
     * @param {boolean} only_timestamp
     * @returns {string|number|false}
     */
    const GetResultHistory = function (index, with_tag = true, only_timestamp = false) {
        if (!resultHistory) {
            return false
        }
        if (-resultHistory.length <= index && index < 0) {
            index = resultHistory.length + index + 1
        }
        if (index < 1 || resultHistory.length < index) {
            return ''
        }
        if (only_timestamp) {
            return resultHistory[index - 1][1]
        }
        return with_tag ? '<span id="ai_output" data-timestamp="' + resultHistory[index - 1][1] + '">' + resultHistory[index - 1][0] + '</span>' : resultHistory[index - 1][0]
    }
    window.GetResultHistory = GetResultHistory

    const originalDoneLoading = window.DoneLoading
    window.DoneLoading = async function () {
        // UNIX時間が入っていたらtoLocaleString()で変換
        for (const element of document.getElementsByClassName('textcolor_ai')) {
            const timestamp = element.getAttribute('data-timestamp')
            if (timestamp && !isNaN(timestamp)) {
                element.setAttribute('data-timestamp', formatDate(new Date(Number(timestamp))))
            }
        }
        originalDoneLoading()
    }
    const originalHandlePaste = window.handle_paste
    /**
     * textcolor_aiが有るときだけ書式を維持する
     * @param {Element} elem
     * @param {ClipboardEvent} e
     */
    window.handle_paste = function handle_paste(elem, e) {
        var text = e.clipboardData.getData('text/html')
        if (!pref.textcolor_ai_paste || getOutputType() !== OUTPUT_TYPE_TEXTCOLOR_AI || text.indexOf('textcolor_ai') === -1) {
            return originalHandlePaste(elem, e)
        }

        const dom = new DOMParser()
        const html = dom.parseFromString(text, 'text/html')

        if (!html) {
            return originalHandlePaste(elem, e)
        }

        /**
         * 不要なHTML要素を削除する
         * @param {Node} node
         */
        const remover = function (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node
            }

            if (node.nodeType ===  Node.ELEMENT_NODE && node instanceof Element) {
                const remove_parent = ! (node.tagName === 'BODY' || node.tagName === 'BR' || node.tagName === 'FONT' && node.classList.contains('textcolor_ai'))
                // 一度テンポラリ変数に展開しないと、forループ内で削除したときに対象がずれていく
                const tempNodeList = [...node.childNodes]
                for (const child of tempNodeList){
                    const result = remover(child)
                    if (result === null) {
                        child.remove()
                    } else if (remove_parent) {
                        node.parentElement.insertBefore(child, node)
                    }
                }
                if (remove_parent) {
                    return null
                }

                // Chromeは親要素のスタイルを子要素のスタイルにコピーする。
                // そのため、コピー先に親スタイルが固定値として残り、設定で文字サイズ等を変えたときに、その部分に反映されない。
                // なので、ここで消しておく。
                node.removeAttribute('style')

                return node
            }
            return null
        }

        remover(html.body)
        document.execCommand('insertHTML', false, html.body.innerHTML.replaceAll(/\n|\r/g, ''))
    }

    // @endpointの前に出力を挿入する機能
    // @endpointの直前に改行がないと動きません
    // PushHistoryが基本的に最新出力文挿入後にしか呼ばれないため、無理矢理割り込んでいます
    const originalPushHistory = window.PushHistory
    /** @param {string} data */
    window.PushHistory = function (data) {
        let output = ''
        if (getOutputType() === OUTPUT_TYPE_TEXTCOLOR_AI) {
            const pos = data.indexOf('@endpoint')
            let start = data.lastIndexOf('<font class="textcolor_ai"', pos === -1 ? +Infinity : pos), end = data.indexOf('</font>', start)
            if (start >= 0 && end >= 0) {
                // 出力した後
                end += '</font>'.length
                let aiFixed
                const last_result = GetResultHistory(-1, false)
                for (const ai of [...document.getElementById('data_container').getElementsByClassName('textcolor_ai')].reverse()) {
                    if (ai.innerHTML === last_result && !ai.getAttribute('data-timestamp')) {
                        output = last_result
                        aiFixed = ai
                        // AI出力にタイムスタンプを付ける
                        // シャーディングの兼ね合いで分割することがあるので、分割しても元は一つだとわかりやすくするため
                        ai.setAttribute('data-timestamp', GetResultHistory(-1, false, true))

                        // if (ai.parentNode.tagName === 'DIV' && ai.parentNode.id.toLowerCase() === 'data_edit') {
                        if (ai.parentElement.tagName === 'FONT' && ai.parentElement.parentElement.id.toLowerCase() === 'data_edit') {
                            const next_br = ai.nextSibling
                            if (!!pref.force_insert_last) {
                                // ai.parentNode.removeChild(next_br)
                                const before = ai.previousSibling, after = ai.nextSibling
                                document.querySelector('#data_container > div:last-child').insertAdjacentElement('beforeend', ai)
                                if (before && before.tagName && before.tagName === 'HR') {
                                    ai.insertAdjacentElement('beforebegin', before)
                                }
                                if (after && after.tagName && after.tagName === 'HR') {
                                    ai.insertAdjacentElement('afterend', after)
                                }
                            }
                            else {
                                const target = ai.parentNode, ai_prev = ai.previousSibling, ai_next = ai.nextSibling
                                // @endpointがシャーディング境界にある、かつ、先頭のシャーディングではない場合は、一つ前のシャーディングの最後に追加する
                                if (target.previousElementSibling === null && target.parentNode.previousElementSibling !== null) {
                                    target.parentNode.previousElementSibling.insertAdjacentElement('beforeend', ai)
                                } else {
                                    target.insertAdjacentElement('beforebegin', ai)
                                }
                                if (next_br && next_br.nodeType === Node.ELEMENT_NODE && next_br instanceof Element && next_br.tagName === 'BR') {
                                    // 出力の次の改行を移動する
                                    ai.insertAdjacentElement('afterend', next_br)
                                    if (ai.previousSibling && ai.previousSibling.nodeType === Node.ELEMENT_NODE && ai.previousSibling instanceof Element && ai.previousSibling.tagName === 'BR') {
                                        // 移動後の出力の直前が改行なら取り除く
                                        ai.parentNode.removeChild(ai.previousSibling)
                                    }
                                } else if ((ai_prev && ai_prev.nodeType === Node.ELEMENT_NODE && ai_prev instanceof Element && ai_prev.tagName === 'HR')
                                    && (ai_next && ai_next.nodeType === Node.ELEMENT_NODE && ai_next instanceof Element && ai_next.tagName === 'HR')) {
                                    // 出力の前後がhrならそれらを移動する
                                    ai.insertAdjacentElement('beforebegin', ai_prev)
                                    // 後ろのhrの次は改行になっているのでそれも移動
                                    const temp_br = ai_next.nextElementSibling
                                    ai.insertAdjacentElement('afterend', ai_next)
                                    ai_next.insertAdjacentElement('afterend', temp_br)
                                    if (ai_prev.previousSibling && ai_prev.previousSibling.nodeType === Node.ELEMENT_NODE && ai_prev.previousSibling instanceof Element && ai_prev.previousSibling.tagName === 'BR') {
                                        // 移動後の出力の直前が改行なら取り除く
                                        ai_prev.parentNode.removeChild(ai_prev.previousSibling)
                                    }
                                }
                            }
                            window.CopyContent()
                            data = localStorage.textdata
                        }
                        break;
                    }
                }
                if (aiFixed) {
                    const temp_output_html = applyInsertImage(aiFixed.innerHTML)
                    if (aiFixed.innerHTML !== temp_output_html) {
                        aiFixed.innerHTML = temp_output_html
                    }
                }
            }
        } else {
            let start = data.lastIndexOf('<span id="ai_output"'), end = data.indexOf('</span>', start)
            if (start >= 0 && end >= 0) {
                // 出力した後
                end += '</span>'.length
                output = data.slice(start, end)
                const ai = document.getElementById('ai_output')
                if (ai.parentElement.tagName.toLowerCase() === 'font') {
                    const next_br = ai.nextSibling
                    if (!!pref.force_insert_last) {
                        // ai.parentNode.removeChild(next_br)
                        document.querySelector('#data_container > div:last-child').insertAdjacentElement('beforeend', ai)
                    }
                    else {
                        const target = ai.parentNode
                        // @endpointがシャーディング境界にある、かつ、先頭のシャーディングではない場合は、一つ前のシャーディングの最後に追加する
                        if (target.previousElementSibling === null && target.parentNode.previousElementSibling !== null) {
                            target.parentNode.previousElementSibling.insertAdjacentElement('beforeend', ai)
                        } else {
                            target.insertAdjacentElement('beforebegin', ai)
                        }
                        if (next_br && next_br.nodeType === Node.ELEMENT_NODE && next_br instanceof Element && next_br.tagName === 'BR') {
                            ai.insertAdjacentElement('afterend', next_br)
                        }
                        if (ai.previousSibling && ai.previousSibling instanceof Element && ai.previousSibling.tagName === 'BR') {
                            ai.parentNode.removeChild(ai.previousSibling)
                        }
                    }
                }
                window.CopyContent()
                data = localStorage.textdata
                const temp_output_html = applyInsertImage(ai.innerHTML)
                if (ai.innerHTML !== temp_output_html) {
                    ai.innerHTML = temp_output_html
                }
            }
        }

        if (output !== '') {
            endpointScroll()
            // 情報表示のためのカウント
            totalOutputCount++
            if (window.retry) {
                totalRetryCount++
            }
            totalOutputChar += output.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '')
                .replace(/<font class="textcolor_ai"[^>]*>/g, '').replace(/<\/font>/g, '')
                .replace(/<br>/g, "\n").length
            UpdateModInfo()

            // 特殊なスクリプト(置換)
            const memory = document.getElementById('memory'),
                authorsnote = document.getElementById('authorsnote')
            let needCopyContent = false
            for (let i = 0; i < 100; i++) {
                const script_selector = document.getElementById('script_selector' + i)
                if (script_selector && script_selector.value === 'script_none') {
                    const script_in = document.getElementById('script_in' + i)
                    let target
                    if (script_in && script_in.value.indexOf('(?:M){0}') === 0) {
                        target = memory
                    } else if (script_in && script_in.value.indexOf('(?:A){0}') === 0) {
                        target = authorsnote
                    } else {
                        continue
                    }
                    const script_out = document.getElementById('script_out' + i)
                    let script_out_text = script_out.value
                    const regexp_in = new RegExp(script_in.value)
                    const result_in = regexp_in.exec(output.replace(/<br>/gi, "\n").replace(/<\/?[^>]+>/gi, ''))
                    if (result_in !== null) {
                        for (let j = 1; j < result_in.length; j++) {
                            script_out_text = script_out_text.replace('#' + j + '#', result_in[j])
                        }
                        const [script_out_before, script_out_after] = script_out_text.split('<|>')
                        const regexp_out = new RegExp(script_out_before)
                        target.value = target.value.replace(regexp_out, script_out_after)
                        needCopyContent = true
                    }
                }
            }
            if (needCopyContent) {
                window.CopyContent()
            }
        }
        originalPushHistory(data)
        enableScrollTop()
    }

    // 続きを書くやリトライ後にスクロールを復活させる
    const originalCopyContent = window.CopyContent
    window.CopyContent = function () {
        enableScrollTop()
        const all = document.getElementsByClassName('data_edit')
        let comment = -1, target = -1, target_pos = -1
        for (let i = all.length - 1; i >= 0; i--) {
            comment = all[i].innerHTML.indexOf('<font color="#aaaaaa"')
            if (comment === 0 && i !== 0) {
                const tag_name = all[i - 1].childNodes[all[i - 1].childNodes.length - 1].nodeName.toLowerCase()
                if (tag_name !== 'br' && tag_name !== 'span') {
                    // 枠の先頭にコメントがいる&一つ前に枠がある&一つ前の枠の最後に改行がないと出力に失敗するので改行(空っぽのspan)を挿入する
                    const span = document.createElement('span')
                    span.classList.add('__temporary')
                    all[i - 1].appendChild(span)
                }
            }
        }
        originalCopyContent()
        for (let i = all.length - 1; i >= 0; i--) {
            for (const span of all[i].querySelectorAll('span.__temporary')) {
                all[i].removeChild(span)
            }
        }

        window.resizeHistorySide && window.resizeHistorySide()
    }

    const originalDecoratedText = window.DecoratedText
    window.DecoratedText = function (textdata, txtc_replace = true, cc_flag = false) {
        // ハイライトを削除
        textdata = textdata.replace(/(<a.*?>)/gi, '');
        textdata = textdata.replace(/(<\/a>)/gi, '');

        return originalDecoratedText(textdata, txtc_replace, cc_flag)
    }

    // Redoを押した数をカウントする
    let freeze_history_redo_tap_count = 0

    // Undo、Redo後にスクロールを復活させる
    const originalUndoRedoLabel = window.UndoRedoLabel
    window.UndoRedoLabel = function () {
        enableScrollTop()
        originalUndoRedoLabel()
        // Redoボタンのラベル張りかえ
        const data_undo = document.getElementById('data_undo')
        if (!!localStorage.undo_last && data_undo && document.getElementById("data_undo").value) {
            const history_list = data_undo.value.split("<|entry|>")
            if (Number(localStorage.undo_last) >= (history_list.length - 1)) {
                document.getElementById("redo").value = "Redo >>";
            } else {
                document.getElementById("redo").value = "Redo (" + (history_list.length - Number(localStorage.undo_last) - 1) + ")";
            }
        }
        freeze_history_redo_tap_count = 0
    }

    // Undo履歴の挿入をendpoint前にする
    window.FreezeUndoHistory = function (isRedo = false) {
        if (document.getElementById('submitarea').style.display == "none") { return false; }
        if (!document.getElementById("data_undo").value) { return false; }
        if (document.getElementById("data_undo").value.indexOf("<|entry|>") == -1) { return false; }

        // 挿入テキストの作成
        var temp = "";
        for (var i = 1; i <= pref.undo_history_limit; i++) {
            var history = GetResultHistory(i + 1, false);
            if (history) {
                if (pref.textcolor_ai_history && getOutputType() === OUTPUT_TYPE_TEXTCOLOR_AI) {
                    const timestamp = GetResultHistory(i + 1, false, true)
                    temp += '(' + i + ')<br><font class="textcolor_ai' + (timestamp ? ('" data-timestamp="' + timestamp) : '') + '">' + history + '</font><br>';
                } else {
                    temp += '(' + i + ')<br>' + history + '<br>';
                }
            } else {
                break;
            }
        }

        // 挿入位置の確定
        const base_history = window.GetHistory(1)
        let pos = base_history.indexOf('@endpoint')
        if (!pref.force_insert_last && pos >= 0) {
            const font_tag = '<font color="#aaaaaa">'
            if (base_history.lastIndexOf(font_tag, pos) === pos - font_tag.length) {
                pos = pos - font_tag.length
            }
            const head = base_history.slice(0, pos).replace(/(\n)/gi, '<br>')
            temp = head + (head.slice(-4) === '<br>' ? '' : '<br>') + '@/*<br>' + temp.replace(/<span.*?>/g, '').replace(/<\/span>/g, '') + '@*/<br>' + base_history.slice(pos).replace(/(\n)/gi, '<br>');
        } else {
            temp = base_history.replace(/(\n)/gi, '<br>') + '@/*<br>' + temp.replace(/<span.*?>/g, '').replace(/<\/span>/g, '') + '@*/<br><br>';
        }
        window.TextSharding(temp, false);
        enableScrollTop()
        VisualChange();

        if (isRedo) {
            document.getElementById('redo').value = 'History';
            freeze_history_redo_tap_count = 0;
        } else {
            document.getElementById('undo').value = 'History';
            freeze_history_tap_count = 0;
        }
    }

    // Redoを3回押した時にUndo履歴を挿入する
    const originalRedoContent = window.RedoContent
    window.RedoContent = function () {
        if (document.getElementById('submitarea').style.display == "none") { return false; }
        if (!document.getElementById("data_undo").value) { return false; }
        if (document.getElementById("data_undo").value.indexOf("<|entry|>") == -1) { return false; }

        if (document.getElementById('redo').value === 'History') {
            freeze_history_redo_tap_count = 0
            const undo_last = Number(localStorage.undo_last) - 1
            if (window.GetHistory(undo_last)) {
                localStorage.undo_last = String(undo_last);
            }
        } else if (!window.GetHistory(Number(localStorage.undo_last) + 1)) {
            freeze_history_redo_tap_count++
            if (freeze_history_redo_tap_count >= 3) { window.FreezeUndoHistory(true) }
            return false
        } else {
            freeze_history_redo_tap_count = 0
        }

        return originalRedoContent()
    }

    // 送信テキストをテキストエリアに流す/出力履歴をため込む - ここから
    const createHistoryText = (with_tag = false) => {
        // 挿入テキストの作成
        let temp = ''
        for (var i = 1; i <= pref.undo_history_limit; i++) {
            const history = GetResultHistory(i + 1, false)
            if (history) {
                if (with_tag) {
                    const timestamp = GetResultHistory(i + 1, false, true)
                    temp += '(' + i + ')<br><font class="textcolor_ai" data-timestamp="' + timestamp + '">' + history.replace(/<\/?span[^>]*>/g, '') + '</font><br>'
                } else {
                    temp += '(' + i + ')\n' + history.replace(/<br>/g, '\n').replace(/<\/?span[^>]*>/g, '') + '\n'
                }
            } else {
                break
            }
        }
        return temp
    }
    const originalAjax = window.jQuery.ajax
    window.jQuery.ajax = function (param) {
        if (param.type === 'POST' && param.data) {
            if (param.url === 'getrequest_v5.php') {
                const data = param.data.find(function (value) {
                    return value.name === 'data'
                })
                lastTextDateCount = data.value.length
            } else if (param.url === '_remotestories.php') {
                // リモート保存時の日時を記録する
                const now = new Date()
                lastRemoteSave = formatDate(now)
                UpdateModInfo()
            } else if (param.url.indexOf('https://ltmemory.tringpt.com/') < 0 && param.url.indexOf('https://api-ltm.') < 0 && param.headers && param.headers['Content-Type'] === 'application/json') {
                const json_data = JSON.parse(param.data)
                const textarea = document.getElementById('send-text-confirm'),
                    ban_textarea = document.getElementById('send-ban-word-confirm'),
                    bias_textarea = document.getElementById('send-bias-confirm'),
                    badfilter = document.getElementById('badfilter')
                if (json_data.text && textarea) {
                    textarea.value = json_data.text
                    const counter = document.getElementById('options_usermod_text_count')
                    if (counter) {
                        counter.textContent = json_data.text.length + '文字'
                    }
                }
                // 禁止ワードの抽出と禁止ワード無効化の適用
                if (json_data.userbadwords && ban_textarea && badfilter) {
                    const ban_list = json_data.userbadwords.replace(/\u2581/g, '\\n').split('<<|>>')

                    const mod_anti_ban_words = document.getElementById('mod_anti_ban_words')
                    let anti_ban_words = []
                    if (mod_anti_ban_words && mod_anti_ban_words.value) {
                        const pos = json_data.userbadwords.indexOf('[[')
                        if (pos >= 0) {
                            json_data.userbadwords = json_data.userbadwords.slice(pos + '[[<<|>>'.length)
                        }
                        anti_ban_words = mod_anti_ban_words.value.split(/\n|<<\|>>/)
                    }

                    let temp = '', row_temp = '', counter = 0, ban_word_counter = 0, override = []
                    for (const word of ban_list) {
                        if (!word) {
                            continue
                        }
                        if (anti_ban_words.length !== 0) {
                            if (anti_ban_words.includes(word)) {
                                continue
                            }
                            override.push(word)
                        }
                        counter++
                        ban_word_counter++
                        row_temp += '<td>' + word.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') + '</td>'
                        if (counter >= 5) {
                            temp += '<tr>' + row_temp + '</tr>'
                            counter = 0
                            row_temp = ''
                        }
                    }
                    if (row_temp !== '') {
                        temp += '<tr>' + row_temp + '</tr>'
                    }
                    ban_textarea.innerHTML = '<div>適用中の禁止ワード (' + ban_word_counter + '件)</div>' + (badfilter.checked ? '<div>コンテントフィルターが有効の場合は禁止ワード一覧を表示しません</div>' : '<table>' + temp + '</table>')
                    if (anti_ban_words.length !== 0) {
                        json_data.userbadwords = override.join('<<|>>').replace(/\\n/g, '\u2581')
                        param.data = JSON.stringify(json_data)
                    }
                }
                // biasの抽出
                if (json_data.logit_bias && json_data.logit_bias_values && bias_textarea) {
                    const bias_list = json_data.logit_bias.replace(/\u2581/g, '\\n').split('<<|>>'),
                        bias_value_list = json_data.logit_bias_values.split('|')
                    let temp = '', row_temp = '', counter = 0, index = 0, bias_counter = 0
                    for (const word of bias_list) {
                        if (!word) {
                            continue
                        }
                        counter++
                        bias_counter++
                        row_temp += '<td>' + word.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') + ' (' + (Number(bias_value_list[index]) * 4) + ')</td>'
                        if (counter >= 5) {
                            temp += '<tr>' + row_temp + '</tr>'
                            counter = 0
                            row_temp = ''
                        }
                        index++
                    }
                    if (row_temp !== '') {
                        temp += '<tr>' + row_temp + '</tr>'
                    }
                    bias_textarea.innerHTML = '<div>適用中のバイアス・括弧内はバイアス値 (' + bias_counter + '件)</div><table>' + temp + '</table>'
                }
            }
        }
        return originalAjax(param)
    }
    const buildHistorySelect = function (historyText = '') {
        const textarea_history_hidden = document.getElementById('show-history-text-hidden')
        if (textarea_history_hidden) {
            const history_history = textarea_history_hidden.value.split('<|entry|>')
            if (history_history.length > 20) {
                history_history.pop()
            }

            if (historyText) {
                textarea_history_hidden.value = '<|entry|>' + historyText + history_history.join('<|entry|>')
            }

            const select_history = document.getElementById('show-history-select')
            for (let i = select_history.children.length; i <= history_history.length - (historyText ? 0 : 1); i++) {
                const option = document.createElement('option')
                option.innerText = i + '個前'
                option.value = i
                select_history.appendChild(option)
            }
            select_history.dispatchEvent(new Event('change'))

            const select_history_side = document.getElementById('show-history-select-side')
            for (let i = select_history_side.children.length; i <= history_history.length - (historyText ? 0 : 1); i++) {
                const option = document.createElement('option')
                option.innerText = i + '個前'
                option.value = i
                select_history_side.appendChild(option)
            }
            select_history_side.dispatchEvent(new Event('change'))
        }
    }
    const originalCleanUpUndo = window.CleanUpUndo
    window.CleanUpUndo = function () {
        if (document.getElementById("data_undo").value !== '') {
            // 挿入テキストの作成
            buildHistorySelect(createHistoryText(true))
        }
        resultHistory.splice(0, Infinity, ['', ''])
        originalCleanUpUndo()
    }
    const originalShowPost = window.showpost
    window.showpost = function () {
        originalShowPost()
        const select_history = document.getElementById('show-history-select')
        if (select_history) {
            select_history.dispatchEvent(new Event('change'))
        }
        const select_history_side = document.getElementById('show-history-select-side')
        if (select_history_side) {
            select_history_side.dispatchEvent(new Event('change'))
        }
        if (select_history || select_history_side) {
            saveSession()
        }
    }
        ; (function () {
            const balloon_options_option = document.getElementById('balloon_options_option'),
                options_goodies = document.getElementById('options_goodies')
            if (!balloon_options_option || !options_goodies) {
                // 起点となる要素がないのでスルーする
                return
            }
            // アイコンの準備
            const color_black = 'rgb(68,68,68)', color_white = 'rgb(255,255,255)'
            const text_svg = `<svg version="1.1" id="_x32_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="512px" height="512px" viewBox="0 0 512 512" style="width: 64px; height: 64px; opacity: 1;" xml:space="preserve"><style type="text/css">.st0{fill:#4B4B4B;}</style><g><path class="st0" d="M449.891,87.953c-3.766-8.906-10.031-16.438-17.922-21.781c-7.891-5.328-17.5-8.469-27.719-8.469h-42.656v-7.359h-61.828c0.281-2,0.438-4.063,0.438-6.141C300.203,19.828,280.375,0,256,0s-44.203,19.828-44.203,44.203c0,2.078,0.156,4.141,0.438,6.141h-61.828v7.359H107.75c-6.813,0-13.359,1.391-19.281,3.906c-8.906,3.766-16.453,10.031-21.797,17.922c-5.328,7.906-8.469,17.5-8.469,27.719v355.219c0,6.781,1.391,13.344,3.906,19.281c3.766,8.906,10.031,16.438,17.922,21.781c7.906,5.344,17.5,8.469,27.719,8.469h296.5c6.797,0,13.359-1.375,19.281-3.906c8.922-3.75,16.453-10.031,21.797-17.922c5.328-7.891,8.469-17.5,8.469-27.703V107.25C453.797,100.438,452.422,93.891,449.891,87.953z M256,27.797c9.047,0,16.406,7.359,16.406,16.406c0,2.172-0.438,4.234-1.203,6.141h-30.391c-0.781-1.906-1.219-3.969-1.219-6.141C239.594,35.156,246.969,27.797,256,27.797z M424.328,462.469c0,2.813-0.563,5.406-1.578,7.797c-1.5,3.578-4.063,6.672-7.281,8.859c-3.219,2.156-7,3.406-11.219,3.406h-296.5c-2.813,0-5.422-0.563-7.813-1.563c-3.594-1.516-6.672-4.094-8.844-7.297c-2.156-3.219-3.406-7-3.422-11.203V107.25c0-2.813,0.563-5.422,1.578-7.813c1.516-3.594,4.078-6.688,7.281-8.844c3.219-2.156,7-3.406,11.219-3.422h42.656v6.141c0,11.531,9.344,20.875,20.891,20.875h169.422c11.531,0,20.875-9.344,20.875-20.875v-6.141h42.656c2.813,0,5.422,0.563,7.813,1.578c3.578,1.5,6.672,4.063,8.844,7.281s3.422,7,3.422,11.219V462.469z" style="fill: color_setting;"></path><rect x="156.141" y="170.672" class="st0" width="31.625" height="31.625" style="fill: color_setting;"></rect><rect x="225.516" y="170.672" class="st0" width="130.359" height="31.625" style="fill: color_setting;"></rect><rect x="156.141" y="264.125" class="st0" width="31.625" height="31.625" style="fill: color_setting;"></rect><rect x="225.516" y="264.125" class="st0" width="130.359" height="31.625" style="fill: color_setting;"></rect><rect x="156.141" y="357.594" class="st0" width="31.625" height="31.625" style="fill: color_setting;"></rect><rect x="225.516" y="357.594" class="st0" width="130.359" height="31.625" style="fill: color_setting;"></rect></g></svg>`,
                history_svg = `<svg version="1.1" id="_x32_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="512px" height="512px" viewBox="0 0 512 512" style="width: 64px; height: 64px; opacity: 1;" xml:space="preserve"><style type="text/css">.st0{fill:#4B4B4B;}</style><g>	<path class="st0" d="M141.18,56.938l30.484,33.531v157.594c0,2.563,1.422,4.938,3.688,6.141c2.281,1.203,5.031,1.063,7.156-0.391l36.406-24.656l36.391,24.656c2.141,1.453,4.891,1.594,7.172,0.391c2.25-1.203,3.688-3.578,3.688-6.141V90.469l-30.5-33.531H141.18z" style="fill: color_setting;"></path>	<path class="st0" d="M436.008,93.344l-25.875-62.563c9.188-0.563,14.719-8.156,14.719-14.078C424.852,7.469,417.383,0,408.164,0H109.477C92.086,0,76.195,7.094,64.836,18.5C53.43,29.859,46.32,45.75,46.336,63.125V470.75c0,22.781,18.469,41.25,41.25,41.25h343.359c19.188,0,34.719-15.547,34.719-34.734V127.578C465.664,110.125,452.789,95.844,436.008,93.344z M290.664,92.844v155.219c0,11.672-6.406,22.328-16.719,27.797c-4.531,2.391-9.625,3.672-14.75,3.672c-6.313,0-12.422-1.875-17.641-5.438l-22.641-15.344l-22.656,15.344c-5.219,3.563-11.313,5.438-17.641,5.438c-5.109,0-10.219-1.281-14.75-3.688c-10.297-5.453-16.703-16.109-16.703-27.781V99.938l-6.469-7.094h-31.219c-8.266,0-15.594-3.313-21.016-8.703c-5.406-5.453-8.719-12.766-8.719-21.016s3.313-15.578,8.719-21c5.422-5.406,12.75-8.719,21.016-8.719H383.57l26.688,59.438H290.664z" style="fill: color_setting;"></path></g></svg>`,
                info_svg = `<svg version="1.1" id="_x32_" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="width: 64px; height: 64px; opacity: 1;" xml:space="preserve"><style type="text/css">.st0{fill:#4B4B4B;}</style><g><path class="st0" d="M437.015,74.978C390.768,28.686,326.619-0.014,256,0C185.381-0.014,121.231,28.686,74.978,74.978C28.694,121.224-0.015,185.381,0,256c-0.015,70.612,28.694,134.762,74.978,181.015C121.231,483.314,185.381,512.008,256,512c70.619,0.008,134.768-28.686,181.015-74.985c46.299-46.253,75-110.403,74.985-181.015C512.014,185.381,483.314,121.224,437.015,74.978z M403.56,403.552c-37.851,37.798-89.866,61.112-147.56,61.12c-57.694-0.008-109.709-23.321-147.56-61.12C70.649,365.716,47.336,313.702,47.321,256c0.014-57.702,23.328-109.716,61.119-147.552C146.291,70.649,198.306,47.343,256,47.329c57.694,0.014,109.709,23.32,147.56,61.119c37.791,37.836,61.104,89.851,61.119,147.552C464.664,313.702,441.351,365.716,403.56,403.552z" style="fill: color_setting;"></path><path class="st0" d="M251.694,194.328c21.381,0,38.732-17.343,38.732-38.724c0-21.396-17.351-38.724-38.732-38.724c-21.38,0-38.724,17.328-38.724,38.724C212.97,176.986,230.314,194.328,251.694,194.328z" style="fill: color_setting;"></path><path class="st0" d="M299.164,362.806h-5.262c-5.387,0-9.761-4.358-9.761-9.746V216.731c0-1.79-0.94-3.462-2.47-4.38c-1.53-0.933-3.44-0.977-5.023-0.142l-66.544,36.986c-19.358,9.679-10.068,21.239-2.858,20.94c7.202-0.284,28.679-2.41,28.679-2.41v85.336c0,5.388-4.373,9.746-9.761,9.746h-10.336c-2.686,0-4.88,2.194-4.88,4.88v21.284c0,2.687,2.194,4.881,4.88,4.881h83.336c2.694,0,4.881-2.194,4.881-4.881v-21.284C304.045,365,301.858,362.806,299.164,362.806z" style="fill: color_setting;"></path></g></svg>`
            const blob_text_icon = new Blob([text_svg.replace(/color_setting/g, color_black)], { type: 'image/svg+xml' }),
                blob_history_icon = new Blob([history_svg.replace(/color_setting/g, color_black)], { type: 'image/svg+xml' }),
                blob_info_icon = new Blob([info_svg.replace(/color_setting/g, color_black)], { type: 'image/svg+xml' }),
                blob_text_icon_white = new Blob([text_svg.replace(/color_setting/g, color_white)], { type: 'image/svg+xml' }),
                blob_history_icon_white = new Blob([history_svg.replace(/color_setting/g, color_white)], { type: 'image/svg+xml' }),
                blob_info_icon_white = new Blob([info_svg.replace(/color_setting/g, color_white)], { type: 'image/svg+xml' })
            const text_icon_url = URL.createObjectURL(blob_text_icon),
                history_icon_url = URL.createObjectURL(blob_history_icon),
                info_icon_url = URL.createObjectURL(blob_info_icon),
                text_icon_white_url = URL.createObjectURL(blob_text_icon_white),
                history_icon_white_url = URL.createObjectURL(blob_history_icon_white),
                info_icon_white_url = URL.createObjectURL(blob_info_icon_white)
            let style = 'margin-left: 40px;', style_balloon = 'margin: 10px;'
            if (navigator.userAgent.match(/iPhone|Android.+Mobile/)) {
                style = 'margin-left: 15px;'
                style_balloon = 'margin: 5px;'
            }
            // オプション枠の追加
            document.getElementById('balloon_options_option').parentNode.insertAdjacentHTML('beforeend', `<p class="balloon" id="balloon_options_usermod_text" style="background-color:#ffffff;` + style_balloon + `" title="送信テキスト確認(ユーザースクリプト)" onClick="ToggleOptions('101');">
<img src="` + text_icon_url + `" class="options_icons" id="img_options_usermod_text" width="32" height="32" style="margin-top:16px;"></p>
<p class="balloon" id="balloon_options_usermod_history" style="background-color:#ffffff;` + style_balloon + `" title="出力履歴確認(ユーザースクリプト)" onClick="ToggleOptions('102');">
<img src="` + history_icon_url + `" class="options_icons" id="img_options_usermod_history" width="32" height="32" style="margin-top:16px;"></p>
<p class="balloon" id="balloon_options_usermod_info" style="background-color:#ffffff;` + style_balloon + `" title="情報表示(ユーザースクリプト)" onClick="ToggleOptions('103');">
<img src="` + info_icon_url + `" class="options_icons" id="img_options_usermod_info" width="32" height="32" style="margin-top:16px;"></p>`)

            const select_history = document.createElement('select')
            select_history.style = 'margin-bottom: 10px;height: 2rem;width: 100px;'
            select_history.id = 'show-history-select'
            const option = document.createElement('option')
            option.innerText = '現在'
            option.value = 0
            select_history.appendChild(option)
            select_history.readOnly = true
            const select_history_side = select_history.cloneNode(true)
            select_history_side.id = 'show-history-select-side'
            document.getElementsByTagName('head')[0].insertAdjacentHTML('beforeend', `<style type="text/css">
#send-ban-word-confirm, #send-bias-confirm {
    width: 85%;
    margin-top: 1rem;
}
#send-ban-word-confirm div, #send-bias-confirm div {
    color:#777777;
    margin-bottom: 0.5rem;
}
#send-ban-word-confirm table, #send-ban-word-confirm td,
#send-bias-confirm table, #send-bias-confirm td {
    border: solid 1px #777777;
    width: 100%;
}
#send-ban-word-confirm table, #send-bias-confirm table {
    font-size: 90%;
    border-collapse: collapse;
    table-layout: fixed;
}
#send-ban-word-confirm td, #send-bias-confirm td {
    max-width: 20%;
    padding: 5px;
}
#data_edit {
    width: 95%;
}
#show-history-side-button-area {
    padding: 0 15px;
    text-align: right;
}
#show-history-side-button, #show-history-side-left-button, #show-history-side-right-button {
    margin: 0 0.5rem;
}
#show-history-text {
    height: 600px;
    border: double 2px gray;
    padding: 5px;
    overflow-y: scroll;
}
</style>`)
            document.getElementById('options_goodies').insertAdjacentHTML('afterend', `<div id="options_usermod_text" style="display: none;"><dl id="acMenu">
<dt><div class="header2" style="padding:0px;"><h3 style="padding-left:15px;">▼　送信テキスト確認(ユーザースクリプト)</h3></div></dt>
<dd class="dd-margin" style="margin-top: 15px;` + style + `display: block;">
<div style="max-width:90%; color:#777777" class="explanations"><div style="float:left;text-align:left">最後にAIに送信した入力テキスト内容・禁止ワード・バイアスを確認できます。</div><div style="float:none;text-align:right" id="options_usermod_text_count"></div></div>
<textarea id="send-text-confirm" rows="30" readOnly></textarea>
<div id="send-ban-word-confirm"></div><div id="send-bias-confirm"></div></dd></dl></div>
<div id="options_usermod_history" style="display: none;"><dl id="acMenu">
<dt><div class="header2" style="padding:0px;"><h3 style="padding-left:15px;">▼　出力履歴確認(ユーザースクリプト)</h3></div></dt>
<dd class="dd-margin" style="margin-top: 15px;` + style + `display: block;">
<div style="max-width:90%; color:#777777;" class="explanations">過去20回分までAIが出力したテキストの履歴を確認できます。<br>確認可能なすべての履歴をファイルに保存することもできます。<br>ページを閉じると履歴は消えます。</div>
` + select_history.outerHTML + `<button id="show-history-download" style="margin-left: 20px;margin-bottom: 10px;height: 2rem;width: 120px;">ファイルに保存</button><br><div id="show-history-text"></div>
</dd></dl><textarea id="show-history-text-hidden" style="display:none;" rows="30" readOnly></textarea></div>
<div id="options_usermod_info" style="display: none;"><dl id="acMenu">
<dt><div class="header2" style="padding:0px;"><h3 style="padding-left:15px;">▼　情報表示(ユーザースクリプト)</h3></div></dt>
<dd class="dd-margin" style="margin-top: 15px;` + style + `display: block;">
<div style="max-width:90%; color:#777777;" class="explanations">編集ページを開いてから集計した情報を表示します。<br>ページを閉じない限り継続して集計します。</div>
<textarea id="mod-information" rows="8" readOnly></textarea></dd></dl></div>`)
            const data_container = document.getElementById('data_container')
            data_container.insertAdjacentHTML('beforebegin', `<div id="show-history-side-button-area" style="display:none;"><div style="display:none;" data-width="75" id="show-history-side-button-area-inner"><button id="show-history-side-left-button">≪</button><button id="show-history-side-right-button">≫</button></button></div><button id="show-history-side-button">＋</button></div>`)
            const wrap_block = document.createElement('div')
            wrap_block.style = 'display: flex;justify-content: space-evenly;align-items: flex-start;'
            data_container.insertAdjacentElement('beforebegin', wrap_block)
            data_container.style.width = '100vw'
            wrap_block.appendChild(data_container)
            wrap_block.insertAdjacentHTML('beforeend', `<div id="show-history-side" style="display:none;margin: 15px 0;">
<h4 style="margin-bottom:5px;margin-top:0;">出力履歴確認<span id="tooltips">
<span data-text="過去20回分までAIが出力したテキストの履歴を確認できます。&lt;br&gt;履歴をファイルに保存する場合は、下のメニューアイコン(右から2番目)からどうぞ。&lt;br&gt;ページを閉じると履歴は消えます。" id="help_show-history-side"><img src="images/icon_popup.png" width="20" height="20" id="help_show-history-side_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_show-history-side_icon" onclick="return false;"></span>
</span></h4>
` + select_history_side.outerHTML + `<br><textarea id="show-history-text-side" style="width:100%;" readOnly></textarea>
</div>`)
            const changeCurrentHistory = function (targetName, selected) {
                const textarea_history_hidden = document.getElementById('show-history-text-hidden'),
                    textarea_history = document.getElementById(targetName)
                let result = ''
                if (selected === '0') {
                    result = createHistoryText(true)
                } else if (textarea_history_hidden.value === '') {
                    result = ''
                } else {
                    const history_history = textarea_history_hidden.value.split('<|entry|>')
                    if (history_history[selected]) {
                        result = history_history[selected]
                    } else {
                        result = ''
                    }
                }
                if (textarea_history.tagName === 'DIV') {
                    textarea_history.innerHTML = result.replaceAll(/(\n)/g, '<br>')
                } else {
                    textarea_history.value = result
                }
            }
            document.getElementById('show-history-select').addEventListener('change', function () {
                changeCurrentHistory('show-history-text', this.value)
            })
            document.getElementById('show-history-select-side').addEventListener('change', function () {
                changeCurrentHistory('show-history-text-side', this.value)
            })
            document.getElementById('show-history-download').addEventListener('click', function () {
                const textarea_history_hidden = document.getElementById('show-history-text-hidden')
                if (!textarea_history_hidden) {
                    return
                }
                const title = localStorage.textdata_title, separator = '\n---*---*---*---*---*---\n'
                const temp = title + separator + createHistoryText() + textarea_history_hidden.value.replace(/<\|entry\|>/g, separator).replace(/<br>/g, '\n').replace(/<\/?[^>]+>/gi, '')
                const blob = new Blob([temp], { type: 'text/plain' }),
                    a = document.createElement("a")
                const now = new Date()
                a.href = URL.createObjectURL(blob);
                document.body.appendChild(a);
                a.download = title.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '') + '_' + now.getFullYear() + (now.getMonth() + 1) + now.getDate() + now.getHours() + now.getMinutes() + now.getSeconds() + '.txt';
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            })
            const show_history_side_button = document.getElementById('show-history-side-button')
            const fixed_bottom_right = document.getElementsByClassName('fixed_bottom_right')
            if (fixed_bottom_right.length > 0) {
                show_history_side_button.style.display = 'none'
            }
            const setHistorySideDisplay = function () {
                const side = document.getElementById('show-history-side')
                if (show_history_side_button.innerText === '＋') {
                    side.style.display = 'block'
                    data_container.style.width = show_history_side_button.previousElementSibling.getAttribute('data-width') + '%'
                    side.style.width = (100 - Number(show_history_side_button.previousElementSibling.getAttribute('data-width'))) + '%'
                    show_history_side_button.innerText = '－'
                    show_history_side_button.previousElementSibling.style.display = 'inline-block'
                } else {
                    side.style.display = 'none'
                    data_container.style.width = '100vw'
                    show_history_side_button.innerText = '＋'
                    show_history_side_button.previousElementSibling.style.display = 'none'
                }
                window.resizeHistorySide && window.resizeHistorySide()
            }
            show_history_side_button.addEventListener('click', function () {
                setHistorySideDisplay()
            })

            if ( ! navigator.userAgent.match(/iPhone|Android.+Mobile/)) {
                document.getElementById('show-history-side-button-area').style.display = ''
            }
            const changeHistorySideOffset = function (offset) {
                const inner = document.getElementById('show-history-side-button-area-inner'),
                    left = document.getElementById('show-history-side-left-button'),
                    right = document.getElementById('show-history-side-right-button')
                let width = Number(inner.getAttribute('data-width')) + offset
                if (width < 50) {
                    width = 50
                    left.disabled = 'disabled'
                } else {
                    left.disabled = ''
                }
                if (width > 85) {
                    width = 85
                    right.disabled = 'disabled'
                } else {
                    right.disabled = ''
                }
                inner.setAttribute('data-width', width)
                data_container.style.width = width + '%'
                const side = document.getElementById('show-history-side')
                side.style.width = (100 - width) + '%'
                window.resizeHistorySide && window.resizeHistorySide()
            }
            document.getElementById('show-history-side-left-button').addEventListener('click', function () {
                changeHistorySideOffset(-5)
            })
            document.getElementById('show-history-side-right-button').addEventListener('click', function () {
                changeHistorySideOffset(5)
            })
            window.jQuery("#help_show-history-side").on({
                'mouseenter': function () {
                    const $ = window.jQuery
                    var text = $(this).attr('data-text');
                    if (window.innerWidth < 768) {
                        $(this).append('<div class="tooltips_body" style="left:-300px;width:300px">' + text + '</div>');
                    } else {
                        $(this).append('<div class="tooltips_body" style="left:-500px">' + text + '</div>');
                    }
                },
                'mouseleave': function () {
                    window.jQuery(this).find(".tooltips_body").remove();
                }
            });
            // 表示の調整
            const VisualChange2 = function () {
                const $ = window.jQuery
                $('#show-history-text,#show-history-text-side,#send-text-confirm,#send-ban-word-confirm,#send-bias-confirm,#mod_anti_ban_words').css('font-family', document.getElementById("vis_fontfamily").value);
                const fontSize = document.getElementById("vis_fontsize")
                $('#show-history-text,#show-history-text-side,#send-text-confirm,#send-ban-word-confirm,#send-bias-confirm,#mod_anti_ban_words').css('font-size', fontSize.value / 40 + 'rem');
                $('#show-history-text,#show-history-text-side,#send-text-confirm,#mod_anti_ban_words').css('letter-spacing', document.getElementById("vis_fontkerning").value / 80 + 'rem');
                $('#show-history-text,#show-history-text-side,#send-text-confirm,#mod_anti_ban_words').css('line-height', document.getElementById("vis_fontleading").value / 10 + 'rem');
                const array_iconsize_actuals = new Array('32', '20', '24', '28', '32', '36', '40', '48');
                $('#balloon_options_usermod_text').each(function () {
                    $(this).css('width', array_iconsize_actuals[document.getElementById("gui_iconsize").value] * 2);
                    $(this).css('height', array_iconsize_actuals[document.getElementById("gui_iconsize").value] * 2);
                    $(this).css('margin-right', array_iconsize_actuals[document.getElementById("gui_iconsize").value] / 7);
                });
                $('#balloon_options_usermod_history').each(function () {
                    $(this).css('width', array_iconsize_actuals[document.getElementById("gui_iconsize").value] * 2);
                    $(this).css('height', array_iconsize_actuals[document.getElementById("gui_iconsize").value] * 2);
                    $(this).css('margin-right', array_iconsize_actuals[document.getElementById("gui_iconsize").value] / 7);
                });
                $('#balloon_options_usermod_info').each(function () {
                    $(this).css('width', array_iconsize_actuals[document.getElementById("gui_iconsize").value] * 2);
                    $(this).css('height', array_iconsize_actuals[document.getElementById("gui_iconsize").value] * 2);
                    $(this).css('margin-right', array_iconsize_actuals[document.getElementById("gui_iconsize").value] / 7);
                });

                const mod_textcolor_ai_css_var = document.getElementById('mod-textcolor-ai-css-var')
                if (mod_textcolor_ai_css_var) {
                    mod_textcolor_ai_css_var.textContent = `.mod_textcolor_ai_timestamp {
                        --tooltip-offset: -${ fontSize.value / 40 }rem;
                        --outline: ${ pref.textcolor_ai_outline ? 'dotted 1px' : 'none'};
                    }`
                }
            }
            document.getElementById('vis_fontsize').addEventListener('input', VisualChange2);
            document.getElementById('vis_fontkerning').addEventListener('input', VisualChange2);
            document.getElementById('vis_fontleading').addEventListener('input', VisualChange2);
            document.getElementById('gui_iconsize').addEventListener('input', VisualChange2);
            const originalFontFamily = window.FontFamily
            window.FontFamily = function (elem) {
                originalFontFamily(elem)
                VisualChange2()
            }
            const originalToggleOptions = window.ToggleOptions
            window.ToggleOptions = function (id, dontclose = false) {
                var colsh = Colorscheme_Load( document.getElementById("vis_bgcolor").value );
                if( !colsh ){
                    colsh.body        = "#fff";
                    colsh.balloon_off = "#eee";
                    colsh.balloon_on  = "#444";
                    colsh.option      = "#eee";
                    colsh.text        = "#000";
                    colsh.frame       = "#cd2b5a";
                }
                document.getElementById('options_usermod_text').style.display = "none";
                document.getElementById('options_usermod_history').style.display = "none";
                document.getElementById('options_usermod_info').style.display = "none";
                document.getElementById('balloon_options_usermod_text').style.backgroundColor = colsh.balloon_off;
                document.getElementById('balloon_options_usermod_history').style.backgroundColor = colsh.balloon_off;
                document.getElementById('balloon_options_usermod_info').style.backgroundColor = colsh.balloon_off;
                document.getElementById('img_options_usermod_text').src = text_icon_url;
                document.getElementById('img_options_usermod_history').src = history_icon_url;
                document.getElementById('img_options_usermod_info').src = info_icon_url;
                originalToggleOptions(id, dontclose)
                if (document.getElementById('modelinfo').style.display !== '') {
                    if (Number(id) === 101) {
                        document.getElementById('options_usermod_text').style.display = "";
                        document.getElementById('balloon_options_usermod_text').style.backgroundColor = colsh.balloon_on;
                        document.getElementById('img_options_usermod_text').src = text_icon_white_url;
                    } else if (Number(id) === 102) {
                        document.getElementById('options_usermod_history').style.display = "";
                        document.getElementById('balloon_options_usermod_history').style.backgroundColor = colsh.balloon_on;
                        document.getElementById('img_options_usermod_history').src = history_icon_white_url;
                    } else if (Number(id) === 103) {
                        document.getElementById('options_usermod_info').style.display = "";
                        document.getElementById('balloon_options_usermod_info').style.backgroundColor = colsh.balloon_on;
                        document.getElementById('img_options_usermod_info').src = info_icon_white_url;
                    }
                }
            }
            const originalLoadVisConfigFromStorage = window.LoadVisConfigFromStorage
            window.LoadVisConfigFromStorage = function (id, dontclose = false) {
                originalLoadVisConfigFromStorage()
                VisualChange2()
            }
            VisualChange2()
        })()
    window.resizeHistorySide = function () {
        // サイドの履歴の高さを調整
        const show_history_text_side = document.getElementById('show-history-text-side')
        if (show_history_text_side && show_history_text_side.style.display !== 'none') {
            const data_container = document.getElementById('data_container')
            const rect_base = data_container.getBoundingClientRect(),
                rect_parent = show_history_text_side.parentElement.getBoundingClientRect(),
                rect = show_history_text_side.getBoundingClientRect()
            show_history_text_side.style.height = rect_base.height - (rect.y - rect_parent.y)
        }
    }
    // 送信テキストをテキストエリアに流す/出力履歴をため込む - ここまで

    document.querySelector('#options_goodies > .prefencesMenu')
        .insertAdjacentHTML('afterend', `<dl>
    <dt id="mod_user_script_menu" style="cursor: pointer">
        <div class="header3" style="padding:0px;">
            <h3 style="padding-left:15px;" id="options_head">▼　ユーザースクリプト設定</h3>
        </div>
    </dt>
    <dd class="dd-margin" style="margin: 0px 0px 0px 40px; display: none;">
<h3>ユーザースクリプト</h3>
<label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);" id="mod_icon_scroll" name="mod_icon_scroll" onclick="CopyContent();" ` + (pref.icon_scroll ? 'checked' : '') + `><span class="explanations">　アイコンのスクロールを有効化</span></label><br>
<label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);margin-top:1rem" id="mod_force_insert_last" name="mod_force_insert_last" onclick="CopyContent();" ` + (pref.force_insert_last ? 'checked' : '') + `><span class="explanations">　endpoint存在時でも一番下に出力</span></label><br>
<label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);margin-top:1rem" id="mod_textcolor_ai_tooltip" name="mod_textcolor_ai_tooltip" onclick="CopyContent();" ` + (pref.textcolor_ai_tooltip ? 'checked' : '') + `><span class="explanations">　AI出力色を残す設定での出力部分にマウスカーソルを乗せると、出力日時をヒント表示</span></label><br>
<label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);margin-top:1rem" id="mod_textcolor_ai_history" name="mod_textcolor_ai_history" onclick="CopyContent();" ` + (pref.textcolor_ai_history ? 'checked' : '') + `><span class="explanations">　AI出力色を残す設定の場合、Undo履歴も色分け</span></label><br>
<label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);margin-top:1rem" id="mod_textcolor_ai_paste" name="mod_textcolor_ai_paste" onclick="CopyContent();" ` + (pref.textcolor_ai_paste ? 'checked' : '') + `><span class="explanations">　AI出力色を残す設定の場合、出力部分をコピペしたときに色分けを維持</span></label><br>
<label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);margin-top:1rem" id="mod_textcolor_ai_outline" name="mod_textcolor_ai_outline" onclick="CopyContent();" ` + (pref.textcolor_ai_outline ? 'checked' : '') + `><span class="explanations">　AI出力色を残す設定の場合、色分け部分に囲み線を表示</span></label><br>
<label><input type="number" style="font-size: 18px;margin-top:1rem;width: 5rem;" id="mod_undo_history_limit" name="mod_undo_history_limit" onclick="CopyContent();" value="` + pref.undo_history_limit + `" min="10" max="99999"><span class="explanations">　出力履歴の1ページ当たりの上限</span></label><br>
<h4>検索ショートカット設定
<span id="tooltips">
<span data-text="本文欄で選択したテキストを、下で設定した各サイトで検索します。<br>テキストを選択した状態で、Alt＋数字を押すと、数字に対応するサイトを新規タブに表示します。" id="help_mod_search_url"><img src="images/icon_popup.png" width="20" height="20" id="help_mod_search_url_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_mod_search_url_icon" onclick="return false;"></span>
</span></h4>
<div><span style="display:inline-block;width:2rem">1 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_1" name="mod_search_url_1" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">2 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_2" name="mod_search_url_2" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">3 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_3" name="mod_search_url_3" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">4 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_4" name="mod_search_url_4" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">5 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_5" name="mod_search_url_5" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">6 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_6" name="mod_search_url_6" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">7 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_7" name="mod_search_url_7" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">8 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_8" name="mod_search_url_8" onclick="CopyContent()";></div>
<div><span style="display:inline-block;width:2rem">9 : </span><input type="text" style="font-size: 18px;width:60%;" id="mod_search_url_9" name="mod_search_url_9" onclick="CopyContent()";></div>
<div style="margin-top: 0.5rem">
<h4>画像の挿入
<span id="tooltips">
<span data-text="本文欄の中の指定した名前を、画像に置き換えます。チャット用プロンプトなどと組み合わせてお使い下さい。名前入力欄の隣のチェックボックスにチェックすると、本文に置換対象の名前を残します。置換対象を決める正規表現は調整できます。設定の保存ボタンから名前と画像の組み合わせデータをダウンロード可能です。" id="help_mod_insert_image"><img src="images/icon_popup.png" width="20" height="20" id="help_mod_insert_image_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_mod_insert_image" onclick="return false;"></span>
</span></h4>
    <div style="margin-bottom: 1rem">
        <label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);" id="mod_insert_image" ` + (pref.insert_image ? 'checked' : '') + `><span class="explanations">　画像の挿入を有効化</span></label>
        <br>
        <label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);" id="mod_insert_image_last_only" ` + (pref.insert_image_last_only ? 'checked' : '') + `><span class="explanations">　最新入力枠のみ画像を挿入する</span></label>
        <br>
        <label><input type="checkbox" style="font-size: 18px; transform:scale(1.5);" id="mod_insert_image_scroll_to_button" ` + (pref.insert_image_scroll_to_button ? 'checked' : '') + `><span class="explanations">　続きを書くを押した時にボタンまでスクロール<span data-text="続きを書くを押すと、画像が一時的に消えますが、その際に消えた画像の高さ分だけスクロールしてしまうことがあります。その対策として、続きを書く/リトライを押した際に、続きを書く/リトライボタンが画面下部に来るようスクロールを行います。" id="help_mod_insert_image_scroll_to_button"><img src="images/icon_popup.png" width="20" height="20" id="help_mod_insert_image_scroll_to_button_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_mod_insert_image_scroll_to_button" onclick="return false;"></span></span></label>
    </div>
    <div id="mod_insert_image_items" style="margin-bottom: 1rem">
        <p>幅と高さについて
        <span id="tooltips">
        <span data-text="幅と高さ両方に1以上の数値を設定すると、その幅と高さで本文に挿入します(アスペクト比が変わります)。どちらかを0にすると、入力した幅または高さを最大値としたサイズに合わせて挿入します(アスペクト比は維持します)。両方0にすると、元の画像サイズのまま挿入します。" id="help_mod_insert_image_items_wh"><img src="images/icon_popup.png" width="20" height="20" id="help_mod_insert_image_items_wh_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_mod_insert_image_items_wh" onclick="return false;"></span>
        </span></p>
        <div id="mod_insert_image_items_inner" style="margin-bottom: 1rem">
        </div>
        <div>
            <button id="mod_insert_image_item_add" data-next-id="0">入力枠を追加</button>
        </div>
    </div>
    <div style="margin-bottom: 1rem">
        <h5>置換用のパターンの設定
        <span id="tooltips">
        <span data-text="「置換用のパターン」の文字列で本文を検索します。&lt;br&gt;「{{name}}」は検索前に画像の名前に置換されます。画像の名前を「<<|>>」で区切ってあると、それぞれ別々に置換されます。例えば「○○<<|>>××」と書くと、「{{name.0}}」が「○○」、「{{name.1}}」が「××」に置換されます。「{{name}}」は「{{name.0}}」と同じ扱いになります。なお、該当する部分がない「{{name.数字}}」は、すべて空文字列(「」)に置換されます。&lt;br&gt; 「置換用のパターン」のパターンにキャプチャなどの正規表現を使う場合、「置換後のフォーマット」に置換後の文字列を指定してください。その際、キャプチャは「$数字」のスタイルではなく、「$<文字列>」のスタイルにしてください。なお、_から始まるキャプチャ名(例えば「$<_line>」)はシステム予約となりますので、使用しないでください。&lt;br&gt;「置換後のフォーマット」でも「{{name.数字}}」が使えます。ただし、「{{name}}」の位置には画像が挿入されますが、「{{name.0}}」の位置には文字列のみになります。" id="help_mod_insert_image_format"><img src="images/icon_popup.png" width="20" height="20" id="help_mod_insert_image_format_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_mod_insert_image_format" onclick="return false;"></span>
        </span></h5>
        <div style="display:inline-block">
            置換用のパターン<br>
            <input type="text" style="font-size: 18px;" id="mod_insert_image_format" value="{{name}}「" placeholder="例：{{name}}「">
        </div>
        <div style="display:inline-block">
            置換後のフォーマット(任意)<br>
            <input type="text" style="font-size: 18px;" id="mod_insert_image_format_after" value="" placeholder="例：{{name}}「">
        </div>
    </div>
    <div>
        <div style="margin-bottom: 1rem;"><button id="mod_insert_image_apply">設定を本文に適用する</button></div>
        <div style="display: inline-block;margin-right: 2rem;"><button id="mod_insert_image_save">設定の保存</button></div>
        <div style="display: inline-block;">設定の読込：<input type="file" id="mod_insert_image_load" accept=".zip"></div>
    </div>
</div>` + ( document.getElementById('badfilter') ?
`<h4>禁止ワード除外リスト
<span id="tooltips">
<span data-text="この設定で指定された単語に完全一致する禁止ワードを、サーバー送信対象から除外します。禁止ワードリストやキャラクターブックの@addbanwordで追加された禁止ワードの他、システムが追加する禁止ワードも除外可能です。&lt;br&gt;除外ワードの書式は禁止ワードリストと同じく、改行か&lt;&lt;|&gt;&gt;で各単語を区切ってください。&lt;br&gt;※除外リストはすべての作品で共通です。" id="help_mod_anti_ban_words"><img src="images/icon_popup.png" width="20" height="20" id="help_mod_anti_ban_words_icon" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_mod_anti_ban_words_icon" onclick="return false;"></span>
</span></h4>
<textarea id="mod_anti_ban_words" style="width:85%" rows="4"></textarea>
</dd></dl>` : ''))
    // メニュー開閉
    window.jQuery('#mod_user_script_menu').on('click', function() {
        window.jQuery(this).next().slideToggle('fast')
    })
    const mod_icon_scroll = document.getElementById('mod_icon_scroll')
    if (mod_icon_scroll) {
        mod_icon_scroll.addEventListener('change', function () {
            loadPref()
            if (this.checked) {
                const elem = document.querySelector('#operation_btn_container+div')
                elem.style['overflow-x'] = 'scroll'
                elem.style['white-space'] = 'nowrap'
                pref.icon_scroll = true
            } else {
                const elem = document.querySelector('#operation_btn_container+div')
                elem.style['overflow-x'] = ''
                elem.style['white-space'] = ''
                pref.icon_scroll = false
            }
            savePref()
        })
        mod_icon_scroll.dispatchEvent(new Event('change'))
    }
    const mod_force_insert_last = document.getElementById('mod_force_insert_last')
    if (mod_force_insert_last) {
        mod_force_insert_last.addEventListener('change', function () {
            loadPref()
            if (this.checked) {
                pref.force_insert_last = true
            } else {
                pref.force_insert_last = false
            }
            savePref()
        })
    }
    const mod_textcolor_ai_tooltip = document.getElementById('mod_textcolor_ai_tooltip')
    if (mod_textcolor_ai_tooltip) {
        mod_textcolor_ai_tooltip.addEventListener('change', function () {
            loadPref()
            if (this.checked) {
                document.getElementById('data_container').classList.add('mod_textcolor_ai_timestamp')
                pref.textcolor_ai_tooltip = true
            } else {
                document.getElementById('data_container').classList.remove('mod_textcolor_ai_timestamp')
                pref.textcolor_ai_tooltip = false
            }
            savePref()
        })
        mod_textcolor_ai_tooltip.dispatchEvent(new Event('change'))
    }
    const mod_textcolor_ai_history = document.getElementById('mod_textcolor_ai_history')
    if (mod_textcolor_ai_history) {
        mod_textcolor_ai_history.addEventListener('change', function () {
            loadPref()
            if (this.checked) {
                pref.textcolor_ai_history = true
            } else {
                pref.textcolor_ai_history = false
            }
            savePref()
        })
    }
    const mod_textcolor_ai_paste = document.getElementById('mod_textcolor_ai_paste')
    if (mod_textcolor_ai_paste) {
        mod_textcolor_ai_paste.addEventListener('change', function () {
            loadPref()
            if (this.checked) {
                pref.textcolor_ai_paste = true
            } else {
                pref.textcolor_ai_paste = false
            }
            savePref()
        })
    }
    const mod_textcolor_ai_outline = document.getElementById('mod_textcolor_ai_outline')
    if (mod_textcolor_ai_outline) {
        mod_textcolor_ai_outline.addEventListener('change', function () {
            loadPref()
            if (this.checked) {
                pref.textcolor_ai_outline = true
            } else {
                pref.textcolor_ai_outline = false
            }
            savePref()
            // 表示更新
            document.getElementById('vis_fontsize').dispatchEvent(new Event('input'))
        })
    }
    const mod_undo_history_limit = document.getElementById('mod_undo_history_limit')
    if (mod_undo_history_limit) {
        mod_undo_history_limit.addEventListener('change', function () {
            loadPref()
            pref.undo_history_limit = Number(mod_undo_history_limit.value)
            if (!pref.undo_history_limit) {
                pref.undo_history_limit = 98
                mod_undo_history_limit.value = pref.undo_history_limit
            } else if (pref.undo_history_limit < 10) {
                pref.undo_history_limit = 10
                mod_undo_history_limit.value = pref.undo_history_limit
            } else if (pref.undo_history_limit > 99999) {
                pref.undo_history_limit = 99999
                mod_undo_history_limit.value = pref.undo_history_limit
            }
            savePref()
        })
    }
    for (let i = 1; i <= 9; i++) {
        const mod_search_url = document.getElementById('mod_search_url_' + i)
        if (mod_search_url) {
            if (pref.search_url.hasOwnProperty(i)) {
                mod_search_url.value = pref.search_url[i].url
            }
            const saveSearchPref = function () {
                loadPref()
                if (pref.search_url.hasOwnProperty(i)) {
                    pref.search_url[i].url = mod_search_url.value
                } else {
                    pref.search_url[i] = { url: mod_search_url.value }
                }
                savePref()
            }
            mod_search_url.addEventListener('change', saveSearchPref)
            mod_search_url.addEventListener('keyup', saveSearchPref)
            mod_search_url.addEventListener('blur', saveSearchPref)
        }
    }
    window.jQuery("#help_mod_search_url,#help_mod_anti_ban_words").on({
        'mouseenter': function () {
            const $ = window.jQuery
            var text = $(this).attr('data-text');
            $(this).append('<div class="tooltips_body">' + text + '</div>');
        },
        'mouseleave': function () {
            window.jQuery(this).find(".tooltips_body").remove();
        }
    });

    const mod_bg_image_opacity = document.getElementById('mod_bg_image_opacity')
    if (mod_bg_image_opacity) {
        mod_bg_image_opacity.value = (pref.bg_image_opacity !== undefined ? pref.bg_image_opacity : 4)
        document.getElementById('mod_bg_image_opacity_disp').innerText = Number(mod_bg_image_opacity.value) / 10
    }
    const mod_bg_image_repeat = document.getElementById('mod_bg_image_repeat')
    if (mod_bg_image_repeat) {
        mod_bg_image_repeat.checked = (pref.bg_image_repeat !== undefined ? pref.bg_image_repeat : true)
    }

    const mod_anti_ban_words = document.getElementById('mod_anti_ban_words')
    if (mod_anti_ban_words) {
        mod_anti_ban_words.value = pref.anti_ban_words ? pref.anti_ban_words : ''
        mod_anti_ban_words.addEventListener('change', function () {
            loadPref()
            pref.anti_ban_words = mod_anti_ban_words.value
            savePref()
        })
    }

    // 最終保存日時の記録
    const originalStorageSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
        const work_id = localStorage.getItem('current_works_id')
        if (this === localStorage && key === 'works' + work_id) {
            const now = new Date()
            lastLocalSave = formatDate(now)
            UpdateModInfo()
        }
        return originalStorageSetItem.bind(this)(key, value)
    }

    // 禁止ワードの下にトークン検索
    document.getElementById('badwords_tokens_disp').insertAdjacentHTML('afterend', `<h3>◆ トークン検索(ユーザースクリプト)
<span id="tooltips" style="animation-duration:0ms;">
<span id="mod_tooltips_text_token_search" data-text="左の入力欄に書いた文字を含むトークン一覧を検索します。(※外部サーバーに接続します。検索ボタンを短時間に連打しないでください)">
<img src="images/icon_popup.png" width="20" height="20" id="help_memory" class="help_popup" style="margin-left:10px; margin-top: -5px; vertical-align:middle;" aria-describedby="tooltip_memory" onclick="return false;"></span>
</span>
</h3>
<div><input type="text" id="mod_token_query" style="padding: 5px;font-size: 1rem;margin-right: 10px;width: 100px;" placeholder="検索文字">
<button id="mod_token_query_search" style="padding: 5px;font-size: 1rem;margin-right: 10px;width: 80px;">検索</button>
<input type="text" id="mod_token_query_result" style="padding: 5px;font-size: 1rem;width: 60%;" readOnly></div>
<div><input type="text" id="mod_token_bias" style="padding: 5px;font-size: 1rem;margin-right: 10px;width: 100px;" value="0">
<label><input type="checkbox" id="mod_token_enable_bias" style="font-size: 18px; transform:scale(1.5);"><span class="explanations"> 左の数値をバイアスの数値として検索結果に適用する</span></label></div>`)
    const mod_tooltips = document.getElementById('mod_tooltips_text_token_search')
    mod_tooltips.addEventListener('mouseenter', function () {
        var text = window.jQuery(this).attr('data-text');
        window.jQuery(this).append('<div class="tooltips_body">' + text + '</div>');
    })
    mod_tooltips.addEventListener('mouseleave', function () {
        window.jQuery(this).find(".tooltips_body").remove()
    })
    document.getElementById('mod_token_query_search').addEventListener('click', function () {
        const query_element = document.getElementById('mod_token_query')
        if (query_element) {
            const query = encodeURIComponent(query_element.value.trim())
            fetch('https://ai-novelist-share.geo.jp/api/get_tokens/' + (isV3Tokenizer() ? '1' : '0') + '?q=' + query)
                .then(res => res.json())
                .then(data => data.result)
                .then(data => {
                    const query_result_element = document.getElementById('mod_token_query_result')
                    if (query_result_element) {
                        query_result_element.setAttribute('data-raw', data.join('<<|>>'))
                        const mod_token_enable_bias = document.getElementById('mod_token_enable_bias'),
                            mod_token_bias = document.getElementById('mod_token_bias')
                        if (mod_token_enable_bias && mod_token_enable_bias.checked && mod_token_bias) {
                            const bias = mod_token_bias.value
                            query_result_element.value = data.join(',' + bias + '<<|>>') + ',' + bias
                        } else {
                            query_result_element.value = data.join('<<|>>')
                        }
                    }
                })
        }
    })
    const mod_token_enable_bias = document.getElementById('mod_token_enable_bias')
    if (mod_token_enable_bias) {
        mod_token_enable_bias.addEventListener('change', function () {
            const query_result_element = document.getElementById('mod_token_query_result')
            if (!query_result_element) {
                return
            }
            const value = query_result_element.getAttribute('data-raw')
            if (!value) {
                return
            }
            const mod_token_bias = document.getElementById('mod_token_bias')
            if (this.checked && mod_token_bias) {
                const bias = mod_token_bias.value
                query_result_element.value = value.split('<<|>>').join(',' + bias + '<<|>>') + ',' + bias
            } else {
                query_result_element.value = value
            }
        })
    }
    const originalLoadVisConfigFromStorage = window.LoadVisConfigFromStorage
    let alreadyLoadVisConfig = false
    window.LoadVisConfigFromStorage = function () {
        alreadyLoadVisConfig = true
        originalLoadVisConfigFromStorage()
    }
    document.addEventListener('DOMContentLoaded', function () {
        if (alreadyLoadVisConfig) {
            VisualChange()
        }
    })

    // イメージの埋め込み処理
    // style追加
    // mod_insert_image_content_newクラスは、画像がある行に新規の出力文が追加される場合に上手く動かないので未使用
    document.getElementsByTagName('head')[0].insertAdjacentHTML('beforeend', `<style type="text/css">
    .mod_insert_image_content_new {
        display: inline-flex;
        margin: 5px 0;
        align-items: center;
    }
    .mod_insert_image_content_new .name{
        white-space: nowrap;
        margin: 0 5px;
    }
    .mod_insert_image_content {
        display: inline-block;margin:5px 0;
    }
    .mod_insert_image_content img{
        vertical-align: middle;
    }
</style>`)
    // ツールチップ表示のイベント
    window.jQuery("#help_mod_insert_image, #help_mod_insert_image_format, #help_mod_insert_image_items_wh, #help_mod_insert_image_scroll_to_button").on({
        'mouseenter': function () {
            const $ = window.jQuery
            var text = $(this).attr('data-text');
            $(this).append('<div class="tooltips_body">' + text + '</div>');
        },
        'mouseleave': function () {
            window.jQuery(this).find(".tooltips_body").remove();
        }
    });
    // チェックボックスのイベント
    for (const check of ['insert_image', 'insert_image_last_only', 'insert_image_scroll_to_button']) {
        const checkbox = document.getElementById('mod_' + check)
        if (checkbox) {
            checkbox.addEventListener('change', function () {
                loadPref()
                if (this.checked) {
                    pref[check] = true
                } else {
                    pref[check] = false
                }
                savePref()
            })
        }
    }
    /**
     * テキストから画像挿入関係のタグを削除する。
     */
    const removeInsertImage = function (txt) {
        return txt.replace(/<img class="mod_insert_image"[^>]*>/gi, '')
            .replace(/<span class="mod_insert_image_name"[^>]*>([^<]*)<\/span>/gi, '$1')
            .replace(/<span class="mod_insert_image_content(?:_new)?"[^>]*>([^<]*)<\/span>/gi, '$1')
    }
    // 画像挿入関係のタグを削除するためにWriteTextDataIntoStorageを完全上書き
    window.WriteTextDataIntoStorage = function () {
        var all = document.getElementsByClassName("data_edit");
        var temp_text = "";

        for (var i=0, max=all.length; i < max; i++) {
            // 拡張 イメージタグの除去
            let all_temp = all[i].innerHTML
            all_temp = removeInsertImage(all_temp)
            // 拡張 イメージタグの除去 ここまで

            temp_text = temp_text + all_temp;
            if ( temp_text.substring(temp_text.length - 4) != "<br>" ) {
                temp_text = temp_text + "<br>";
            }
        }
        if ( temp_text.substring(temp_text.length - 4) == "<br>" ) {
            temp_text = temp_text.substring(0,temp_text.length - 4);
        }

        localStorage.textdata = temp_text;
    }
    // 入力枠の追加処理
    const mod_insert_image_item_add = document.getElementById('mod_insert_image_item_add')
    /**
     * 画像挿入設定の入力枠を追加する。
     * @returns {Number} 次のID
     */
    const addInsertImageUI = function () {
        const id = mod_insert_image_item_add.getAttribute('data-next-id'),
            mod_insert_image_items_inner = document.getElementById('mod_insert_image_items_inner')
        if (mod_insert_image_items_inner) {
            let init_w = 64, init_h = 64
            const currentElemCount = mod_insert_image_items_inner.childElementCount
            if (currentElemCount > 0) {
                const last_id = mod_insert_image_items_inner.children[mod_insert_image_items_inner.childElementCount - 1].getAttribute('data-id')
                const mod_insert_image_item_width = document.getElementById('mod_insert_image_item_width[' + last_id + ']'),
                    mod_insert_image_item_height = document.getElementById('mod_insert_image_item_height[' + last_id + ']')
                if (mod_insert_image_item_width) {
                    init_w = mod_insert_image_item_width.value
                }
                if (mod_insert_image_item_height) {
                    init_h = mod_insert_image_item_height.value
                }
            }

            mod_insert_image_items_inner.insertAdjacentHTML('beforeend', `<div id="mod_insert_image_item[${id}]" class="mod_insert_image_item" style="margin-bottom: 0.5rem" data-id="${id}">
                <span style="vertical-align: middle;">
                    <input type="text" style="font-size: 18px;width:10rem;" id="mod_insert_image_item_name[${id}]" placeholder="名前を入力...">
                    <input type="checkbox" style="font-size: 18px; transform:scale(1.5);" id="mod_insert_image_item_display[${id}]" >
                    幅：
                    <input type="text" style="font-size: 18px;width:3.5rem;" id="mod_insert_image_item_width[${id}]" value="${init_w}" placeholder="64">
                    高さ：
                    <input type="text" style="font-size: 18px;width:3.5rem;" id="mod_insert_image_item_height[${id}]" value="${init_h}" placeholder="64">
                    <input type="file" id="mod_insert_image_item_file[${id}]" accept="image/*">
                </span>
                <span style="vertical-align:middle;display:none;">
                    <img id="mod_insert_image_item_image[${id}]" style="vertical-align:middle;max-height:64px;max-width:64px;">
                    <button style="padding:3px;">×</button>
                </span>
            </div>`)
            const mod_insert_image_item = document.getElementById('mod_insert_image_item_file[' + id + ']')
            const mod_insert_image_item_image = document.getElementById('mod_insert_image_item_image[' + id + ']')
            if (mod_insert_image_item && mod_insert_image_item_image) {
                mod_insert_image_item.addEventListener('change', function () {
                    if (mod_insert_image_item_image.src && mod_insert_image_item_image.src !== location.href) {
                        URL.revokeObjectURL(mod_insert_image_item_image.src)
                    }
                    mod_insert_image_item_image.src = URL.createObjectURL(this.files[0])
                    mod_insert_image_item_image.parentElement.style.display = ''
                    mod_insert_image_item.value = ''
                })
                mod_insert_image_item_image.nextElementSibling.addEventListener('click', function () {
                    mod_insert_image_item_image.parentElement.style.display = 'none'
                    if (mod_insert_image_item_image.src && mod_insert_image_item_image.src !== location.href) {
                        URL.revokeObjectURL(mod_insert_image_item_image.src)
                    }
                    mod_insert_image_item_image.src = ''
                    mod_insert_image_item.value = ''
                })
            }
            mod_insert_image_item_add.setAttribute('data-next-id', Number(id) + 1)
            document.getElementById('vis_fontsize').dispatchEvent(new Event('input'))
            return Number(id)
        }
        return NaN
    }
    addInsertImageUI()
    if (mod_insert_image_item_add) {
        mod_insert_image_item_add.addEventListener('click', function () {
            addInsertImageUI()
        })
    }
    // 確定置換を正しく動作させるために、続きを書く/リトライ処理の前に画像を削除する。
    // hidepostは続きを書く/リトライの直前にしか呼ばれないので、このタイミングに差し込む。
    const originalHidepost = window.hidepost
    window.hidepost = function () {
        // 各入力枠の画像を削除
        let needCopyContent = false
        for (const data_edit of document.getElementsByClassName('data_edit')) {
            const temp_html = removeInsertImage(data_edit.innerHTML)
            if (data_edit.innerHTML !== temp_html) {
                data_edit.innerHTML = temp_html
                needCopyContent = true
            }
        }
        if (needCopyContent) {
            window.CopyContent()
        }
        // スクロールするオプションが有効なら、ボタンまでスクロール
        if (pref.insert_image && pref.insert_image_scroll_to_button) {
            document.getElementById('operation_btn_container').scrollIntoView(false)
        }
        originalHidepost()
    }

    /**
     * 本文入力枠のテキストに画像を挿入する。
     * target_textが与えられた場合は、本文入力枠ではなくそのテキストに対して挿入する。
     * target_textは出力テキスト(ai_outputの中身)を与えることを想定している。
     * @param {string} target_text 画像を挿入する対象のテキスト
     * @returns {string} target_textが与えられた場合は、挿入後のテキスト。そうでなければ空。
     */
    const applyInsertImage = function (target_text = '') {
        // 設定が有効かチェック
        if ( ! pref.insert_image) {
            return target_text
        }
        // 正規表現が登録されているかチェック
        const mod_insert_image_format = document.getElementById('mod_insert_image_format')
        if (!mod_insert_image_format || mod_insert_image_format.value === '') {
            console.error('mod_insert_image_format is empty')
            return target_text
        }
        // 画像を適用する
        const mod_insert_image_format_base = mod_insert_image_format.value
        const replace_args = []
        for (const mod_insert_image_item of document.getElementsByClassName('mod_insert_image_item')) {
            const id = mod_insert_image_item.getAttribute('data-id')
            const mod_insert_image_item_name = document.getElementById('mod_insert_image_item_name[' + id + ']'),
                mod_insert_image_item_image = document.getElementById('mod_insert_image_item_image[' + id + ']')
            if (!(mod_insert_image_item_name && mod_insert_image_item_image && mod_insert_image_item_name.value !== '' && mod_insert_image_item_image.src !== location.href)) {
                continue
            }

            try {
                const text = mod_insert_image_item_name.value.replace('<<|>>', '\x01').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').split('\x01')
                let format_base = mod_insert_image_format_base.replace('{{name}}', text[0])
                text.forEach(function (part_text, index) {
                    format_base = format_base.replace('{{name.' + index + '}}', part_text)
                })
                format_base = format_base.replace(/{{name.\d+?}}/g, '')
                const reg = new RegExp('(?<_preceding>^|<br>)' + format_base + '(?<_line>.*?)(?=\\<|$)', 'gm')
                let img_h = 'max-height:64px;', img_w = 'max-width:64px;', display = 'none'
                const mod_insert_image_item_width = document.getElementById('mod_insert_image_item_width[' + id + ']'),
                    mod_insert_image_item_height = document.getElementById('mod_insert_image_item_height[' + id + ']'),
                    mod_insert_image_item_display = document.getElementById('mod_insert_image_item_display[' + id + ']')
                const width = mod_insert_image_item_width ? Number(mod_insert_image_item_width.value) : 0,
                    height = mod_insert_image_item_height ? Number(mod_insert_image_item_height.value) : 0

                if (width === 0) {
                    if (height === 0) {
                        img_w = ''
                        img_h = ''
                    } else {
                        img_w = ''
                        img_h = 'max-height:' + height + 'px;'
                    }
                } else if (width > 0) {
                    if (height > 0) {
                        img_w = 'width:' + width + 'px;'
                        img_h = 'height:' + height + 'px;'
                    } else {
                        img_w = 'max-width:' + width + 'px;'
                        img_h = ''
                    }
                }

                if (mod_insert_image_item_display && mod_insert_image_item_display.checked) {
                    display = 'inline'
                }

                const mod_insert_image_format_after = document.getElementById('mod_insert_image_format_after')
                const mod_insert_image_format_base_after = (mod_insert_image_format_after && mod_insert_image_format_after.value !=='') ? mod_insert_image_format_after.value : mod_insert_image_format_base
                const after_text = '<img class="mod_insert_image" src="' + mod_insert_image_item_image.src + '" title="' + text[0] + '" alt="' + text[0] + '" style="' + img_h + img_w + '"><span class="mod_insert_image_name" style="display:' + display + ';">' + text[0] + '</span>'
                let format_base_after = mod_insert_image_format_base_after.replace('{{name}}', after_text)
                text.forEach(function (part_text, index) {
                    format_base_after = format_base_after.replace('{{name.' + index + '}}', part_text)
                })
                format_base_after = format_base_after.replace(/{{name.\d+?}}/g, '')
                replace_args.push({
                    reg: reg,
                    text: '$<_preceding><span class="mod_insert_image_content">' + format_base_after + '$<_line></span>',
                })
            } catch (error) {
                console.error(error)
            }
        }
        if (target_text === '') {
            let target_list = document.getElementsByClassName('data_edit')
            if (pref.insert_image_last_only) {
                target_list = [target_list[target_list.length - 1]]
            }
            for (const data_edit of target_list) {
                let innerHTML = data_edit.innerHTML
                for (const args of replace_args) {
                    innerHTML = innerHTML.replace(args.reg, args.text)
                }
                if (data_edit.innerHTML !== innerHTML) {
                    data_edit.innerHTML = innerHTML
                }
            }
            return ''
        } else {
            for (const args of replace_args) {
                target_text = target_text.replace(args.reg, args.text)
            }
            return target_text
        }
    }
    // 強制的にTextShardingを呼び出して、画像挿入を適用するボタン
    const mod_insert_image_apply = document.getElementById('mod_insert_image_apply')
    if (mod_insert_image_apply) {
        mod_insert_image_apply.addEventListener('click', function () {
            window.CopyContent()
            window.TextSharding()
        })
    }
    // 設定の保存
    const mod_insert_image_save = document.getElementById('mod_insert_image_save')
    if (mod_insert_image_save) {
        mod_insert_image_save.addEventListener('click', async function () {
            const save_date = []
            // 画像設定を列挙
            for (const mod_insert_image_item of document.getElementsByClassName('mod_insert_image_item')) {
                const id = mod_insert_image_item.getAttribute('data-id')
                const mod_insert_image_item_name = document.getElementById('mod_insert_image_item_name[' + id + ']'),
                    mod_insert_image_item_image = document.getElementById('mod_insert_image_item_image[' + id + ']'),
                    mod_insert_image_item_width = document.getElementById('mod_insert_image_item_width[' + id + ']'),
                    mod_insert_image_item_height = document.getElementById('mod_insert_image_item_height[' + id + ']'),
                    mod_insert_image_item_display = document.getElementById('mod_insert_image_item_display[' + id + ']')
                if (!(mod_insert_image_item_name && mod_insert_image_item_image && mod_insert_image_item_width && mod_insert_image_item_height && mod_insert_image_item_display)) {
                    continue
                }

                let img_url = ''
                if (mod_insert_image_item_image.src !== location.href) {
                    try {
                        img_url = await new Promise(async (resolve, reject) => {
                            const reader = new FileReader();
                            reader.addEventListener('load', function () {
                                resolve(reader.result)
                            })
                            reader.addEventListener('abort', function () {
                                reject('abort')
                            })
                            reader.addEventListener('error', function () {
                                resolve(reader.error)
                            })
                            reader.readAsDataURL(await (await fetch(mod_insert_image_item_image.src)).blob());
                        })
                    } catch (e) {
                        console.error(e)
                    }
                }
                save_date.push({
                    'name': mod_insert_image_item_name.value,
                    'img': img_url,
                    'width': mod_insert_image_item_width.value,
                    'height': mod_insert_image_item_height.value,
                    'display': mod_insert_image_item_display.checked ? 1 : 0,
                })
            }
            // その他設定
            const mod_insert_image_format = document.getElementById('mod_insert_image_format'),
                mod_insert_image_format_after = document.getElementById('mod_insert_image_format_after')
            // ZIP準備
            const zip = new JSZip()
            zip.file('setting.json', JSON.stringify({'option': {
                'format': mod_insert_image_format ? mod_insert_image_format.value : '',
                'format_after': mod_insert_image_format_after ? mod_insert_image_format_after.value : '',
            }, 'list': save_date}))
            zip.generateAsync({
                type:'blob',
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 6,
                }
            }).then(function (blob) {
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                document.body.appendChild(a)
                a.download = 'AIのべりすと拡張_画像設定.zip'
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(a.href)
            })
        })
    }
    // 設定の読み込み
    const mod_insert_image_load = document.getElementById('mod_insert_image_load')
    if (mod_insert_image_load) {
        mod_insert_image_load.addEventListener('change', function (event) {
            // 項目設定用関数
            const setInsertImageData = function (id, data) {
                const mod_insert_image_item_name = document.getElementById('mod_insert_image_item_name[' + id + ']'),
                    mod_insert_image_item_file = document.getElementById('mod_insert_image_item_file[' + id + ']'),
                    mod_insert_image_item_image = document.getElementById('mod_insert_image_item_image[' + id + ']'),
                    mod_insert_image_item_width = document.getElementById('mod_insert_image_item_width[' + id + ']'),
                    mod_insert_image_item_height = document.getElementById('mod_insert_image_item_height[' + id + ']'),
                    mod_insert_image_item_display = document.getElementById('mod_insert_image_item_display[' + id + ']')
                if (!(mod_insert_image_item_name && mod_insert_image_item_file && mod_insert_image_item_image && mod_insert_image_item_width && mod_insert_image_item_height && mod_insert_image_item_display)) {
                    return false
                }

                mod_insert_image_item_name.value = data.name
                mod_insert_image_item_file.value = ''
                mod_insert_image_item_image.src = data.img
                mod_insert_image_item_image.parentElement.style.display = ''
                mod_insert_image_item_width.value = data.width
                mod_insert_image_item_height.value = data.height
                mod_insert_image_item_display.checked = data.display !== 0
                fetch(data.img).then(res => res.blob()).then(blob => {
                    if (mod_insert_image_item_image.src && mod_insert_image_item_image.src !== location.href) {
                        window.URL.revokeObjectURL(mod_insert_image_item_image.src)
                    }
                    mod_insert_image_item_image.src = window.URL.createObjectURL(blob)
                })
                return true
            }
            if (event.target.files.length === 0) {
                return
            }
            const zip_file = event.target.files[0];
            JSZip.loadAsync(zip_file).then(function (zip) {
                return zip.files['setting.json'].async('text')
            }).then(function (text) {
                return JSON.parse(text)
            }).then(function (save_data) {
                if (!(save_data && save_data.list && save_data.list.length > 0)) {
                    return
                }
                // 既存の項目に上書き
                for (const mod_insert_image_item of document.getElementsByClassName('mod_insert_image_item')) {
                    const id = mod_insert_image_item.getAttribute('data-id')
                    if (setInsertImageData(id, save_data.list[0])) {
                        save_data.list.shift()
                    }
                }

                if (save_data.list.length > 0) {
                    // 項目が足りないので追加する
                    for (const date of save_data.list) {
                        const id = addInsertImageUI()
                        setInsertImageData(id, date)
                    }
                }

                if (save_data.option) {
                    for (const setting of [['format', 'mod_insert_image_format'], ['format_after', 'mod_insert_image_format_after']]) {
                        if (save_data.option[setting[0]]) {
                            const element = document.getElementById(setting[1])
                            if (element) {
                                element.value = save_data.option[setting[0]]
                            }
                        }
                    }
                }

                // 読み込み終わったらファイルは消す
                mod_insert_image_load.value = ''
            })
        })
    }
    // イメージの埋め込み処理 ここまで

    loadSession()
    setTimeout(function () {
        document.getElementById('vis_fontsize').dispatchEvent(new Event('input'))
    }, 1000)

})();
