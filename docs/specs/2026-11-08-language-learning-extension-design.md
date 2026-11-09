# 言語学習ブラウザ拡張 — 設計仕様

## UIモック（正）
- **UIモック：https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS**（Claude Design、非公開。オーナーのみ閲覧可）
  - `YouTube — extension ON`：動画画面
  - `Web article — highlights and phrase saving`：記事画面
  - `Opening Lingo from the browser toolbar`：ツールバーのポップアップと設定の開き方
  - `Settings page`：設定ページ
- **この仕様書とモックが食い違う場合は、モックを正とする。** UIの細部（配置・文言・色・初期値）はモックを参照し、この仕様書には判断の要点だけを書く。
- 拡張機能名は仮に **Lingo** とする。

## Context
好きな動画（YouTube / Netflix）や記事を、そのページ上で教材にできるブラウザ拡張（まずChrome版）を作る。動画UIは Language Reactor（以下LR）、記事のハイライトは Relingo を参考にする。
差別化は「初出/学習中/学習済みのカテゴリ別ハイライト」「熟語登録」「単語ごとの出典と再出現の記録」。
**制約:** 一般公開を視野に入れ、**開発者がサーバーを一切運用しない**。データはユーザーの端末＋ユーザー自身のブラウザの同期（Chrome なら Google アカウント、Firefox なら Mozilla アカウント）に閉じる。
**スコープ方針:** LRの機能をすべて取り込むのではなく、基本機能に絞る。
開発時の組み合わせ：学習言語=英語、母語=日本語、対象サイト=YouTube・Netflix。言語の組み合わせと対象サイトは後から部品を足すだけで増やせる構造にする。

## 決定事項
- 多言語対応の汎用構造を最初から用意する（実装は en→ja のみ）
- Webアプリの役割は未定 → まずは**拡張機能内のページ**（単語帳・設定）として作り、独立サイトは後で検討
- 第1段階は**テキストUIと動画UIの両方を最小構成で**
- 保存は**2層構成**：IndexedDB（全データ）＋ `storage.sync`（ブラウザの同期。状態だけ）＋ JSON書き出し
- **対象ブラウザ**：第1段階で公開するのは Chrome 版だけ。ただし Firefox・Edge などを後から出せるよう、最初からブラウザに依存しない作りにする（「ブラウザによる違いの吸収」を参照）
- 初出の判定 = **頻度レベル（上位N語は既知とみなす）＋ページ単位の一括登録**
- 単語ごとに**出典を必ず紐づける**、保存語が**他の場所にも出てきたか**を見られるようにする
- UIの表示言語は**英語のみ**で作り、後から切り替えられるようにする
- 配色は**白地＋濃紺の文字＋緑のアクセント**で、動画・記事・ポップアップ・設定のすべてで統一する（Grammarly風だが同一にはしない）

## UI仕様（モック準拠）

### 共通：ハイライト
- カテゴリと見た目：**学習中**＝淡い緑の背景＋緑の下線、**初出**＝青の下線、**学習済み**＝グレーの下線
- カテゴリごとにオン/オフでき、**初期値は学習中のみオン**
- 動画内に字幕を重ねるときは、暗い背景でも読めるよう同じカテゴリの色を明るめに調整する
- 変化形は原形にまとめて判定する（ferments → ferment、loaves → loaf）

### 共通：ホバー時の小さな表示
- 種別（Word / Phrase）と現在の状態
- 見出し語、**発音記号（IPA）を必ず表示**、短い訳、補足（語源・関連語・発音の注意など）
- ボタン：「+ Learning」「Known」
- 熟語は、登録済みのものに一致すればそれを表示する（辞書にある熟語の自動検出は第2段階）

### 共通：辞書ウィンドウ（単語クリックで開く）
- **ページの上に浮かぶポップアップウィンドウ**。つかみ部分で動かせ、×で閉じる。固定の列にはしない
  - 動画：画面上のウィンドウ（字幕が動画内のときは字幕にかからない位置・高さ）
  - 記事：画面右側に浮かぶパネル
- 中身
  - 見出し語、種別、発音の再生（`speechSynthesis`）、**発音記号（IPA）**、補足、短い訳
  - 状態ボタン：Learning / Known / Remove（未保存のときは「Not saved」）
  - 品詞ごとの意味
  - 外部辞書へのリンク：Cambridge / Wiktionary / Reverso / WordReference（設定でオン/オフ。**ユーザーが独自の辞書URLを追加する機能は持たない**）
  - 「In this video」/「On this page」：同じ動画・ページ内の他の出現（動画は時刻付きで、クリックでその位置へ）
  - 「Seen elsewhere」：他の出典での出現。未保存の語は「保存すると次から記録する」と案内する
- **「Ask AI」ボタン（ChatGPT / Claude を開くリンク）は第1段階に入れない**

### 動画UI（YouTube / Netflix）
- **画面構成：2列**。左に動画、右に transcript（字幕カードの一覧）。辞書は上記のポップアップウィンドウ
- **字幕の位置は選択式**：「In video（動画内に重ねる。初期値）」/「Below video（動画の下の大きな枠）」
- **訳の表示は、字幕と transcript で別々に設定**できる（どちらも初期値は表示）
- **訳はサイトが用意しているものを優先する**（順番は「翻訳の選び方」を参照）。どこから取った訳かは画面に出さない
- **プレイヤーバーに2つのボタン**を並べ、YouTube自身の歯車（設定）と混同しないよう、**緑の枠で1つのグループに囲う**
  - **L ボタン**：1クリックで Lingo のオン/オフ（オフのときは点線＋取り消し線の表示）
  - **上向き矢印（^）ボタン**：Lingo のメニューを開く（歯車アイコンは使わない）
    - 現在の状態（On / Off for this video）
    - 字幕の位置（In video / Below video）
    - 字幕の訳の表示/非表示
    - 「Open all settings」（設定ページへ）
- transcript
  - カードは原文の下に訳を置く。再生中のカードを強調して自動スクロールし、クリックでその位置へシーク
  - 上部に「Highlight」のカテゴリ切り替えと、transcript の訳の表示スイッチ
- 動画の下に操作説明の文は置かない
- **動画が終わったとき**は右上に「Video finished」のカードを出す（後述の「一括登録」と同じ内容）

### 記事UI（content script）
- ページの言語を判定（`<html lang>` → `i18n.detectLanguage`）し、学習言語と一致したときだけ動く
- **CSS Custom Highlight API** でカテゴリごとに色付けする（DOMを書き換えない）。表示範囲だけを順次処理し、MutationObserverでページの変化に追従する
  - ハイライトの下線が使えないブラウザでは、下線の代わりに背景色だけで区別する（「ブラウザによる違いの吸収」を参照）
- ホバーした単語は `caretPositionFromPoint` で特定する
- 複数の単語を選択すると、単語の境界に合わせて範囲を補正し、「Save "…" as a phrase」と「+ Learning / Known」のバーを出す
- 画面右上に、Lingo の状態とハイライト切り替えの小さなカードを出す
- **本文の最後までスクロールしたとき**は、そのカードの位置に「You reached the end」のカードを出す（後述の「一括登録」と同じ内容。×で閉じると元のカードに戻る）

### 一括登録（ページ内の未保存の語をまとめて保存）
- 対象：そのページ・動画で**まだ保存していない語**（保存済みの語は今の状態のまま。頻度レベルで既知とみなす語は数えない）
- 操作：「Add all to Learning」「Mark all as Known」。実行後は件数と **Undo** を表示する
- 説明文は常時は出さず、**(i) ボタンを押したときだけ**表示する
- 出てくる場所
  1. ツールバーのポップアップの「This page」欄（いつでも）
  2. 動画終了時／記事の最後までスクロールしたときに右上に出るカード（**設定でオン/オフ。初期値はオン**）

### ツールバーのポップアップ（拡張アイコンをクリック）
- ヘッダー：Lingo、言語ペア（English → Japanese）、設定への歯車
- 「On this site」：このサイトでのオン/オフ
- 「Highlight」：カテゴリ切り替え
- 単語数：Learning / Known / Phrases
- 「This page」：一括登録（上記）
- 同期の状態：最後に保存した時刻と使用量（例：「Saved to Chrome sync · 2 min ago」「41 KB of 100 KB used」）
  - 他の端末に届いたかは拡張から分からないため、「同期済み」とは書かない
  - 「Chrome sync」の部分はブラウザに合わせる（Firefox では「Firefox Sync」）
- フッター：「Word list」（単語帳）、「Settings」

### 設定ページ（拡張機能のオプションページ、新しいタブで開く）
- 開き方は3通り：①ツールバーのポップアップの「Settings」／歯車、②拡張アイコンを右クリック →「Options」、③chrome://extensions → Lingo の「Details」→「Extension options」（Firefox では about:addons → Lingo →「Options」。案内の文言はブラウザに合わせる）。動画のプレイヤーバーの L 横の矢印メニューの「Open all settings」からも開ける
- 項目
  - **Languages**：学習言語、母語、画面の表示言語（当面は英語のみ）
  - **New-word level**：「最もよく使う N 語を既知とみなす」スライダー（1,000〜20,000、初期値 3,000）
  - **Highlighting**：カテゴリごとのオン/オフ、「Offer to save the rest when you finish」（終了時のカード。初期値オン）
  - **Dictionaries and AI**：外部辞書4つのオン/オフ。「AI explanations inside the window」は Coming later 表示（説明文の「Chrome's built-in AI」は、内蔵AIのないブラウザでは出さず「your own API key」だけにする）
  - **Video subtitles**：字幕の位置（In video / Below video）、字幕の訳の表示、transcript の訳の表示
  - **Sites**：YouTube / Netflix / その他の記事 のオン/オフ、動かさないサイトの一覧（Never run on）
  - **Sync and backup**
    - ブラウザの同期のスイッチ（「Sync word status with Chrome sync」。名前はブラウザに合わせる）。説明文で「ブラウザにログインして同期をオンにしているときに他の端末へ届く」ことを伝える
    - 使用量と、最後に保存した時刻（「Last saved …」。「Last synced」とは書かない）
    - JSON の Export / Import。説明文に**最後に書き出した日時**（「Last export: …」）を出す
    - 「Your own cloud storage」は Coming later 表示
  - **About**：バージョン、データのライセンス表記

### 単語帳ページ（拡張機能内のページ）
- 絞り込み、状態の変更、出典と出現の一覧、JSON の書き出し・読み込み（モックは未作成）

## アーキテクチャ（MV3 / TypeScript / WXT + Preact、UIはShadow DOM内）

| 部品 | 役割 | 第1段階の実装 |
|---|---|---|
| `LanguagePack` | 単語分割（`Intl.Segmenter`）、原形への変換、頻度順位、**発音記号** | `en`：kaikki(Wiktionary)から作る変化形の対応表・頻度リスト・IPA表 |
| `DictionaryProvider` | 短い訳（ホバー用）と詳細（品詞ごとの訳） | `en→ja`：EJDict-hand（パブリックドメイン、同梱） |
| `TranslationProvider` | 字幕1行・1文の翻訳。複数の実装を優先順に試す（「翻訳の選び方」） | ①サイトの訳の字幕（`PlatformAdapter` から取る）②ブラウザ内蔵の翻訳（Chrome：Translator API）。どちらも無ければ訳を出さない |
| `PlatformAdapter` | 動画要素の取得、字幕トラックの取得と解析（**母語の訳のトラックも含む**）、シーク、終了の検知、ページ遷移の検知 | YouTube / Netflix |
| `TermStore` | 単語・出典・出現の保存と同期 | IndexedDB(Dexie) ＋ `SyncBackend`（`BrowserSyncBackend`）＋ Export/Import |
| `BrowserEnv` | ブラウザごとの違いをまとめる：ブラウザ名、同期の名前と遅れ、設定ページの開き方の案内、使える機能の判定結果 | Chrome（Firefox 用の中身はビルドが通るところまで） |
| `Classifier` | 初出/学習中/学習済み/対象外 の分類、熟語の照合、ページ内の未保存語の集計 | 共通 |
| `LookupUI` | ホバー時の表示、辞書ウィンドウ、熟語登録の操作、一括登録カード | テキストUIと動画UIで共通 |

- 発音記号：EJDict-hand には発音記号がないため、kaikki（英語版Wiktionary）の `sounds` から米国式IPAを抜き出して `LanguagePack` に持たせる。熟語は構成語のIPAをつなげて表示する。IPAが見つからない語は欄を出さない
- 動画・記事の取得
  - **YouTube:** ページ側（MAIN world）でfetch/XHRをフックし、プレイヤー自身が取得する `/api/timedtext`（json3）を受け取る
  - **Netflix:** ページ側で `JSON.parse` をフックしてマニフェストから字幕トラックのURLを取り、TTML/WebVTTを解析する。シークはNetflixのプレイヤーAPI経由で行う
  - 字幕との同期は `requestVideoFrameCallback` ＋ 字幕の二分探索。動画の終了は `ended` イベントで検知する
  - 記事の最後は、本文の末尾の要素を IntersectionObserver で監視して検知する

### 翻訳の選び方
サイトが訳を用意していればそれを優先し、無いときだけブラウザ内蔵の翻訳を使う。サイトの訳は人の手によるものが多く、端末での翻訳処理も要らないため。

| 順番 | 訳の出どころ | YouTube | Netflix | 記事 |
|---|---|---|---|---|
| 1 | サイトにある**母語の字幕トラック**（人が作ったもの） | 手動で付けられた日本語字幕 | 日本語字幕 | — |
| 2 | サイトの**機械翻訳** | 原文の字幕の自動翻訳（`tlang=ja` を付けて取得） | — | — |
| 3 | **ブラウザ内蔵の翻訳** | Translator API | Translator API | Translator API |
| — | どれも無い | 訳を出さない | 訳を出さない | 訳を出さない |

- 動画ごとに1つに決め、途中で切り替えない。サイトの訳を使う動画では、訳が付かない行があっても内蔵の翻訳を混ぜない（意味が重なったり、言い回しがちぐはぐになったりするため）
- **時刻合わせ**：サイトの母語トラックは、原文と字幕の区切りや時刻が違う（Netflix の日本語字幕は特に）
  - 字幕の訳の表示：再生位置で訳のトラックを別に引き、そのとき出ている訳をそのまま出す
  - transcript のカード：訳の字幕を、時刻の重なりが一番大きい原文のカードに割り当てる。1枚に複数来たらつなげる
  - YouTube の自動翻訳は原文と同じ区切りで返るので、そのまま対応させる
- 出現記録の `translation` には、そのとき表示した訳を保存する
- 記事にはサイトの訳が無いので、ブラウザ内蔵の翻訳だけを使う

### データモデル（IndexedDB）
- `terms`: `{id: "en:look up", lang, key(原形または原形の並び), display, kind: word|phrase, status: learning|known, bulk?: bool, note?, createdAt, updatedAt}`
  - 一括登録で保存した語は `bulk: true` にする（Undo と、同期容量が足りないときの格下げに使う）
- `sources`: `{id, platform: youtube|netflix|web, url(正規化), title, lang, firstSeen, lastSeen}`
- `occurrences`: `{termId, sourceId, sentence, translation?, pos: {timeMs}|{textQuote}, seenAt, origin: saved|encountered}`
  - 保存した時点で出典を必ず1件作る
  - 保存済みの語に再び出会ったら自動で記録する（出典と文の組み合わせで重複を除き、1語あたり上限50件）
  - YouTubeは `&t=` 付きリンクで該当箇所へ飛べるようにする
  - 記録されるのは拡張を有効にして開いたページ・動画の範囲だけ
- 設定は storage.sync に置く：言語ペア、表示言語、頻度レベル、ハイライトのカテゴリ、外部辞書のオン/オフ、字幕の位置、訳の表示（字幕／transcript）、終了時カードのオン/オフ、サイトごとのオン/オフと除外リスト

### 同期（ブラウザの `storage.sync`、上限：全体約100KB・512件・1件約8KB）
- `SyncBackend` という部品（`pull / push / lastModified`）の1つとして `BrowserSyncBackend` を作る。後で足すユーザー自身のクラウドストレージも同じ部品の別の実装にする
- 上限は Chrome・Firefox とも同じ値。実行時に `storage.sync` の定数（`QUOTA_BYTES` など）が読めればそれを使い、読めなければ上の値を使う
- 言語ごとに `term key → 状態コード ＋ 更新時刻（分単位をbase36で）` をソートして連結し、gzip（CompressionStream）＋base64にして約7KBずつに分割保存する
- **保存できる量の目安**
  - 無圧縮：**約6,000語**
  - 圧縮後：**約1.5〜2万語**（英語の場合。実データで要検証）
  - 頻度レベルで既知とみなす語は上限に数えない
  - 上限が近づいたら、一括登録した語を「端末内だけ」に格下げする
- マージ方法：語ごとに更新時刻が新しい方を採用し、削除は墓標で表現する。`storage.onChanged` で他の端末の変更を取り込む
- 出典・出現記録は端末内のみ。JSONの書き出し・読み込みで全データを移せる

#### ブラウザにログインしていない・同期がオフのとき
- `storage.sync` はエラーにならず、端末内に保存されるだけになる（`storage.local` と同じ動き）。容量の上限は同じく効くので、上限が近づいたときの格下げもそのまま動く
- あとでログインして同期をオンにすると、他の端末のデータと語ごとの更新時刻でマージされる。特別な処理は要らない
- 拡張からは、データが本当に他の端末へ届いているかを確実に知る方法がない（`set()` が成功するのは端末内に書けた時点）
  - そのため画面では「同期済み」と言い切らず、**最後に保存した時刻と使用量だけ**を出す
  - ログイン状態を調べるための権限（`identity.email`）は取らない。インストール時の警告が増えるわりに、同期がオンかまでは分からないため
- 同期していない人は、端末の変更や拡張の削除で全データを失う（拡張を削除すると IndexedDB も消える）。守る手段は JSON の書き出しなので、Settings の「Backup file」に最後に書き出した日時を出す

#### ブラウザごとの同期の違い
| | Chrome | Firefox |
|---|---|---|
| 同期先 | Google アカウント | Mozilla アカウント（暗号化して保存） |
| ユーザー側の条件 | ログインして同期をオン | ログインして、同期の項目で「アドオン」をオン |
| 届くまでの時間 | ほぼすぐ | 約10分ごと、または「今すぐ同期」 |
| その他 | — | manifest に `browser_specific_settings.gecko.id` が必須（無いと `storage.sync` が動かない）。Android 版では同期されない |

- 同期の名前（「Chrome sync」「Firefox Sync」）と遅れの目安は `BrowserEnv` から取る。保存とマージの処理はブラウザで分けない

#### （今後のTODO）ユーザー自身のクラウドストレージを同期先に追加する：可能。開発者のサーバーは不要
- `SyncBackend` の別の実装として作り、全データ（出典・出現を含む）を言語ごとのJSONファイルとして保存・マージする。マージ方法は `storage.sync` と同じく語ごとの更新時刻で判定する
- 認証は、どのブラウザにもある `identity.launchWebAuthFlow` ＋ PKCE を基本にする（`chrome.identity.getAuthToken` は Chrome 系にしかないため、それに頼らない）。リダイレクトURLはブラウザごとに違うので、各サービスにブラウザの分だけ登録する
- **Google Drive**：`drive.appdata` スコープでアプリ専用のフォルダに保存する。Google Cloud に OAuth クライアントを登録する必要がある。`launchWebAuthFlow` でクライアントシークレットなしに使えるか、公開時に OAuth 同意画面の審査が要るかは要確認（だめなら Chrome だけ `getAuthToken` を使う）
- **Dropbox / OneDrive**：PKCE で認証する。クライアントシークレットもサーバーも不要。アプリ専用フォルダに保存する
- **ローカルフォルダ**：File System Access API で、iCloud Drive などのフォルダを指定して書き出す。外部への同期はそのフォルダ側の仕組みに任せる。**この API があるブラウザ（Chrome 系）だけ**選択肢に出す
- **WebDAV**（Nextcloud など）：ユーザーがURLと認証情報を入力する
- 設計上は第1段階から `TermStore` の裏側にこの部品を差し込める形にしておく（実装はしない）

### UIの表示言語
- 拡張の `i18n` API はブラウザの言語設定に従い、ユーザーが選べない。そのため独自の小さな仕組みにする：画面の文字列はすべて `t("key")` を通し、言語ごとの文言ファイル（`locales/en.json`）を用意する。設定の `uiLocale` で切り替え、初期値は `en`
- ストアに掲載する拡張名・説明だけは `_locales/en/messages.json`（`i18n` API）を使う
- 画面の表示言語と、辞書・翻訳の対象言語（学習言語・母語）は別の設定にする
- ブラウザ名が入る文言（「Chrome sync」「chrome://extensions」など）は文言ファイルに直接書かず、`t("key", { syncName })` のように `BrowserEnv` の値を差し込む

## ブラウザによる違いの吸収（Firefox など）
第1段階で公開するのは Chrome 版だけ。ただし他のブラウザ版を後から出すときに、作り直しにならない構造にしておく。

### 原則
1. 拡張の API は WXT の `browser`（`wxt/browser`）経由で呼ぶ。コードの中で `chrome.*` を直接使わない
2. ブラウザによって有無が違う機能は、必ず部品（`TranslationProvider`・`SyncBackend` など）の裏に置き、**その機能があるかどうかで判定する**。ブラウザ名やユーザーエージェントで分岐しない
3. 機能が無いときは、その機能に関わる表示ごと出さない（灰色のまま置いたり、「このブラウザでは使えません」と常に出したりしない）
4. ブラウザ名が入る文言は `BrowserEnv` から取る
5. manifest は WXT がブラウザごとに作る。Firefox では `browser_specific_settings.gecko.id` を入れ、background は service worker ではなく event page（`background.scripts`）になる
6. 第1段階から、Firefox 向けのビルドが通ることだけは確認する（動作の保証と公開はしない）

### `BrowserEnv` が持つもの
- ブラウザ名、同期の名前（Chrome sync / Firefox Sync）、同期の遅れの目安
- 設定ページの開き方の案内（chrome://extensions / about:addons）
- 機能の判定結果：内蔵の翻訳、内蔵のAI、ハイライトの下線、File System Access API、background で DOM を使う方法（offscreen document / event page）

### Chrome と Firefox の違いと対応
| 使う機能 | Chrome | Firefox | 対応 |
|---|---|---|---|
| ブラウザの同期（`storage.sync`） | Google アカウント | Mozilla アカウント（約10分ごと） | 同じ処理のまま。名前と遅れの目安だけ `BrowserEnv` から取る |
| 字幕・文の翻訳 | Translator API（138以降） | 無い（Mozilla は反対の立場） | どのブラウザでもサイトの訳を先に使うので、違いは3番目の内蔵翻訳だけ。Firefox では、サイトの訳が無い動画と記事では訳を出さない。Firefox の拡張向け翻訳機能があるかは要調査 |
| 内蔵AI（第3段階） | Prompt API | 無い | ユーザー自身の API キーだけにする |
| 記事のハイライト（CSS Custom Highlight API） | 使える | 140以降で使える。ただし出た時点では**下線（`text-decoration`）に未対応** | 下線が使えないときは背景色だけで区別する（初出＝淡い青、学習中＝淡い緑、学習済み＝淡いグレー。色は要調整）。現在の対応状況と判定方法は要確認。動画の字幕は自前の要素で描くので影響しない |
| background で DOM を使う処理 | offscreen document | event page がそのまま DOM を持つ | `BrowserEnv` で切り替える |
| ページ側（MAIN world）のスクリプト | 使える | 128以降で使える | 対応する最低バージョンを決める |
| フォルダへの保存（File System Access API） | 使える | 無い | 選択肢に出さない |
| OAuth（今後のクラウド同期） | `getAuthToken` / `launchWebAuthFlow` | `launchWebAuthFlow` のみ | `launchWebAuthFlow` に統一する |
| 設定ページの開き方③ | chrome://extensions | about:addons | 案内の文言を `BrowserEnv` から取る |

- `Intl.Segmenter`・`caretPositionFromPoint`・`requestVideoFrameCallback`・`CompressionStream`・`speechSynthesis` は新しめの Firefox にもある。対応する最低バージョンは実装時に確認する
- Firefox の MV3 で、manifest に書いたサイトへのアクセス権限がインストール時に付くか、ユーザーの許可が要るかは要確認

### 他のブラウザ
- **Edge**：Chromium なので Chrome 版をほぼそのまま出せる。同期先は Microsoft アカウント。内蔵の翻訳・AI があるかは要確認
- **Safari**：要調査（Xcode でのパッケージ化、`storage.sync` が端末間で同期されるか）

### 公開
- Chrome ウェブストア、Firefox は addons.mozilla.org（AMO）、Edge は Edge Add-ons
- AMO はビルド・圧縮したコードを審査するため、ソースコードとビルド手順の提出が要る

## 段階計画
1. **第1段階（MVP）**
   - 共通基盤（enの言語パック〔IPA含む〕、en→ja辞書、TermStoreと同期、分類）
   - ホバー時の表示と辞書ウィンドウ、熟語登録、一括登録（ポップアップ＋終了時カード）
   - 記事UI
   - YouTube・Netflixの動画UI（2列＋辞書ウィンドウ、字幕位置と訳の切り替え、L ボタンと矢印メニュー、サイトの訳を優先する翻訳）
   - ツールバーのポップアップ、設定ページ、単語帳ページ
2. **第2段階**
   - 辞書に載っている熟語の自動検出
   - 過去の出現の遡り検索（ローカルコーパス）
   - 全画面表示への対応
   - 動画内の語彙一覧タブ
   - Tatoebaの例文、Anki/CSVの書き出し
   - 他の言語のパック
3. **第3段階**
   - 「Ask AI」ボタン（ChatGPT / Claude を単語＋文の入ったプロンプトで開くリンク）
   - LLMによる詳細説明：「単語＋文＋前後の字幕＋保存語」をプロンプトに埋め込み、JSONで受け取って、単語＋文ごとにキャッシュする。実行先はChrome内蔵 Prompt API（Gemini Nano）を優先し、ユーザーが自分のAPIキーを入れる方式を予備にする
   - 対象サイトの追加
4. **今後のTODO**
   - Firefox 版（ハイライトの下線の代わり、AMO への公開）、その後 Edge など
   - ユーザー自身のクラウドストレージへの同期（Google Drive / Dropbox / OneDrive / ローカルフォルダ / WebDAV）
   - UIの表示言語の追加と切り替え
   - 独立したWebアプリ（必要になったら検討）

## リスクと要確認事項
- YouTube・NetflixのUIや内部の仕組みが変わると壊れる → サイトごとの処理を部品として分離し、字幕の解析はフィクスチャでテストする
- 動画内に字幕を重ねる表示と、プレイヤーバーに足す L ボタン・矢印メニューは、YouTube・Netflix 側のプレイヤーUIとぶつからないか実機で確認する
- 品詞の判定をしないため、品詞を絞った辞書引きはできない（全品詞を表示する）
- Wiktionary にIPAがない語もある（表示しない）
- Translator / Prompt API を使えるのはChrome 138以降のデスクトップ版のみ。content scriptから直接使えない場合はoffscreen documentで実行する（要検証）。Firefox にはどちらも無い
- ブラウザの同期は、ユーザーがログインしていないと端末内に保存されるだけになり、拡張からはそれを確実に知れない。同期していない人のデータを守る手段は JSON の書き出しだけ
- データのライセンス：Wiktionary由来はCC-BY-SA、EJDict-handはパブリックドメイン、TatoebaはCC-BY
- Netflixの利用規約（LRと同等の手法の範囲に留める）
- YouTube の字幕の取得にはプレイヤーが付けるトークンが要る場合がある。自動翻訳（`tlang`）や日本語トラックを拡張から追加で取得できるかは要検証（できなければ内蔵の翻訳に回る）

## 検証方法（実装時）
- Vitest：単語分割と原形変換、分類、熟語照合、ページ内の未保存語の集計と一括登録・Undo、同期データの詰め込み・分割・マージ、YouTube json3とNetflix TTMLの解析、訳の選び方と時刻の重なりによる割り当て（フィクスチャ）
- Playwright：展開済みの拡張を読み込み、ローカルのテスト用記事ページでハイライト・ホバー・熟語登録・保存・最後までスクロールしたときのカードを確認する
- 実際のYouTube・Netflixで手動確認：字幕の2つの位置、訳の切り替え、L ボタンと矢印メニュー、transcriptとの同期とシーク、終了時のカード
- 2つのChromeプロファイル（同じGoogleアカウント）で状態の同期を確認する。ログインしていないプロファイルで、エラーなく保存でき、あとでログインしたときにマージされることも確認する
- Firefox 向けのビルドが通ることを確認する（第1段階）。Firefox 上の動作は、Playwright の Firefox では拡張を読み込めないため、`web-ext run` で手動確認する（Firefox 版を作るとき）
- モックと見比べて、配置・文言・初期値が一致しているかを確認する

## 付録：Language Reactor 実機調査（2026-11-08、Web版プレイヤーで確認）
拡張機能版は内蔵ブラウザに入れられないため、拡張版と同じUIを持つWeb版プレイヤー（YouTube動画）で確認した。本プロジェクトのUIはモックを正とし、以下は参考情報。

**画面構成（3列）**
1. 左：動画。その下に大きく現在の字幕（原文）＋訳文
2. 中央：字幕カードのリスト（原文と訳文が左右。再生中を強調。「テキスト／単語」タブ）
3. 右：辞書パネル（クリックで開く固定の列）

**ホバー時の表示**：熟語を自動検出して先に表示（例：about →「know all about」）、その下に単語の短い訳、既知／学習中のボタン

**辞書パネル**：検索欄、見出し語と短い訳、発音、頻度、状態ボタン（既知／学習中／無視）、タグ、品詞ごとの訳、外部辞書リンク（URLテンプレート `…/{q}`）、「例：現在のテキスト」

**裏側（通信内容から判明）。処理はすべて自社サーバー（dioco.io）で行っている**
- 字幕：`getYoutubeSubsData`（サーバー側で品詞・原形・係り受けを付与）
- 字幕の翻訳：`getYoutubeSubsTranslations`
- ホバー用の辞書：`getHoverDictEntriesForSubs`（動画全体分を先読み）
- 詳細辞書：`getFullDict?form=about&pos=ADP&sl=en&tl=ja`（品詞ごとの対訳とTatoebaの例文）
- 読み上げ：`getDictTTS`、外部辞書の一覧：`getExternalDicts`

**Lexa AI（詳細説明）**
- ログインが必要。プロンプトのテンプレートはサーバーから取得（`getLexaPrompts`）。サーバー側でユーザーの文脈（調べた単語・見ている動画・復習が必要な保存語）をプロンプトに埋め込んでLLMを呼ぶ方式。モデルは非公開
- 辞書パネルの「GPT」ボタンはサーバーを使わない（ソースコードで確認）。`https://chatgpt.com/?q=<プロンプト>` を別ウィンドウで開くだけ

**自前サーバーを持たない本プロジェクトでの代替**

| LRの機能 | 本プロジェクトでの代替 |
|---|---|
| サーバー側のNLP（品詞・原形） | `Intl.Segmenter` ＋ 変化形→原形の対応表 |
| 字幕の翻訳 | Chrome内蔵 Translator API |
| 辞書 | 同梱の辞書（EJDict-hand）＋ Wiktionary由来のIPA |
| 読み上げ | Web Speech API の `speechSynthesis` |
| 外部辞書 | URLテンプレート（固定の4つ） |

**取り込まない機能**：Aria（会話AI）、PhrasePump、FSI/DLI、動画カタログ、自動一時停止・再生速度の操作
