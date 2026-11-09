# 開発環境の整備（テスト・CI/CD・CLAUDE.md の行数チェック）

## Context
実装（第1段階 MVP）に入る前に、テストと CI/CD の土台を作る。要件は次の4つ。
- Playwright で、OS をまたいだ動作を保証する
- 最初からテストを書く。中身のない「通るだけのテスト」にしない
- GitHub（https://github.com/stkhat/bottle-of-water 、非公開・空）で CI/CD を回す
- CLAUDE.md を 150 行以内に保つ。hook で自動チェックし、細かい仕様や変わりやすい情報は別ファイルに出す

コードはまだ無い（CLAUDE.md と仕様書だけ、未コミット）。中身のあるテストを書くには、テスト対象になる最小限の動く骨組みが要るので、それも作る。

## 前提にした判断（質問への回答が無かったので推奨案で進める。違えば指摘してほしい）
1. **OS をまたいだ確認**：Linux / macOS / Windows の3つで、単体テストと E2E の両方を回す。E2E のブラウザは Playwright 同梱の Chromium（Chrome 正式版は 137 以降 `--load-extension` を受け付けないため。Edge も Chromium 系なので同じ確認で代える）。Firefox は仕様書の第1段階どおり「ビルドと `web-ext lint` が通る」ことだけ確認する
2. **骨組み**：WXT + Preact で、拡張の読み込み・ポップアップ・設定ページ・記事用 content script（Shadow DOM）だけ作る。ハイライトなどの機能は作らない
3. **CD**：PR ごとに Chrome / Firefox 用の zip を成果物として残し、`v*` タグで GitHub Release に zip を付ける。ストアへの提出は手動
4. **コミット**：仕様書と CLAUDE.md を main に初回コミットして push。開発環境は `chore/dev-env` ブランチで作って PR を出す。マージはユーザーが判断する（メモリの「指示があるまでコミットしない」は、この計画の承認をもって解除とし、メモリも直す）

## 作るもの

### 1. ツール構成
- npm（pnpm は未導入。Node 26 は corepack を同梱しないので npm に揃える）、`.nvmrc` = 26、`engines` を指定
- WXT（`srcDir: "src"`）+ Preact（`@preact/preset-vite`）、TypeScript strict
- ESLint（flat config + typescript-eslint）+ Prettier。**CLAUDE.md の規約を機械的に守らせるルールを入れる**
  - `no-restricted-globals: chrome`（`chrome.*` を直接使わせない）
  - `no-restricted-properties: navigator.userAgent`（ブラウザ名で分岐させない）
- `.gitattributes`（`* text=auto eol=lf`）と Prettier の `endOfLine: lf`（Windows の改行差で落ちないように）

### 2. 骨組み（テスト対象）
| ファイル | 中身 |
|---|---|
| `src/i18n/t.ts`, `src/i18n/locales/en.json` | `t("key", vars)`。キーは `en.json` から型を作り、存在しないキーは型チェックで落とす。差し込み（`{syncName}`）に対応 |
| `src/entrypoints/background.ts` | 空に近い service worker（E2E で拡張 ID を取るため） |
| `src/entrypoints/popup/` | モックのヘッダー（Lingo、English → Japanese、設定の歯車）だけ。歯車で `browser.runtime.openOptionsPage()` |
| `src/entrypoints/options/` | 設定ページの外枠と見出しだけ |
| `src/entrypoints/content/index.tsx` | 記事用 content script。`<html lang>` が学習言語（en）のときだけ WXT の `createShadowRootUi` で右上カードの外枠を差し込む（仕様書「ページの言語を判定し、学習言語と一致したときだけ動く」の最初の一歩。`i18n.detectLanguage` は後で） |
| `src/content/page-language.ts` | `<html lang>` の判定（`en`, `en-US` は一致、`ja`・空は不一致） |

文言・配置は実装時にモック（Toolbar / Article）を読んで合わせる。モックに無いものは足さない。

### 3. テスト（すべて「壊したら落ちる」ことを確認してから入れる）
テストは3層。どれも本物のブラウザか Node で動かし、偽の DOM（jsdom / happy-dom）は使わない。
| 層 | 道具 | 対象 | ブラウザ |
|---|---|---|---|
| 純粋なロジック | Vitest（Node） | 分類、同期データの詰め込み、字幕の解析など | — |
| DOM を使う部品 | **Vitest Browser Mode**（中身は Playwright） | Highlight API、`Intl.Segmenter`、`caretPositionFromPoint`、Shadow DOM の部品、Preact の画面 | **Chromium と Firefox**（偽の DOM はこれらの API を持たないため。Firefox のハイライトの下線の違いもここで拾える） |
| 拡張まるごと | Playwright | 拡張を読み込んだ状態での画面・content script | Chromium（拡張を読み込めるのは Chromium だけ） |

骨組みの段階で Browser Mode の対象になるのは content script のカード部品だけ。設定は最初から入れておく。

**Vitest（単体）** — `WxtVitest()` プラグインと `fakeBrowser` を使う
- `t()`：差し込み、未定義の差し込み変数の扱い
- `page-language`：`en` / `en-US` / `EN` / `ja` / 属性なし
- `scripts/check-claude-md.mjs`：150 行は通る・151 行は落ちる・CRLF でも同じ行数・CLAUDE.md 以外のパスは無視
- `tests/manifest.test.ts`（ビルド後に実行）：Chrome 版の `permissions` / `host_permissions` / content script の `matches` が期待値と完全一致（権限が増えるとインストール時の警告が増えるので、増やすときはテストを直す＝意図して増やす）。Firefox 版に `browser_specific_settings.gecko.id` がある（無いと `storage.sync` が動かない）

**Playwright（E2E）** — `e2e/fixtures.ts` で `launchPersistentContext` に拡張を読み込み、service worker の URL から拡張 ID を取る。テスト用ページは Node 標準の `http` で書いた小さな静的サーバー（`e2e/serve.mjs`、OS 依存なし）を `webServer` で起動
- ポップアップ：ヘッダーの文言が `en.json` の値で出る。歯車を押すと設定ページが新しいタブで開く
- 記事 content script：`lang="en"` のページでは Shadow DOM のカードが出る／`lang="ja"` では何も出ない
- スタイルの分離：`* { color: red !important; font-size: 40px !important }` を持つページでもカードの見た目が変わらない、かつ拡張の CSS がページ本文に漏れない
- 待ち時間は `waitForTimeout` を使わず、要素やイベントを待つ

**ミューテーションテスト**（テストが中身を確かめているかの検査）
- Stryker（vitest runner）で `src/**/*.ts`（entrypoints 以外）を対象に。週1回と手動実行の workflow。最初は結果の報告だけで、落とす基準は後で決める
- カバレッジの数値目標は置かない（数字合わせのテストを生むため）

### 4. Claude Code hook と CLAUDE.md の行数チェック
- `scripts/check-claude-md.mjs`（Node なので Windows でも動く）
  - 引数なし：リポジトリ内のすべての `CLAUDE.md` を数え、150 行を超えたら終了コード 1（CI と `npm run check` 用）
  - `--hook`：Claude Code から渡る JSON（stdin）の `tool_input.file_path` が CLAUDE.md のときだけ数え、超えたら終了コード 2 と理由を stderr に出す（Claude に差し戻される）
- `.claude/settings.json`（コミットする共有設定）に `PostToolUse`（matcher: `Edit|Write|MultiEdit`）で登録。既存の `settings.local.json` は触らない

### 5. CLAUDE.md の整理と別ファイル
CLAUDE.md には変わりにくい規約と「どこを読むか」だけ残す（目安 60〜80 行）。
- 残す：概要、まず読むもの、前提・制約、開発コマンド（`npm run dev` / `check` / `test` / `test:e2e` / `build`）、テストとコミットの規約の要点、進め方
- 移す
  - `docs/status.md`：「現在の状態」「次のステップ」「未決・未作成」（作業のたびに更新する）
  - `docs/testing.md`：テストの方針（公開されている使い方から振る舞いを確かめる／先に落ちるのを見てから実装する／モックはブラウザ API と通信の境界だけ／画面全体のスナップショットは取らない／E2E は role とテキストで要素を取る／YouTube・Netflix の字幕はフィクスチャで）とテストの置き場所
  - `docs/development.md`：ツール構成、CI/CD の流れ、リリース手順、Firefox ビルドの確認方法、E2E の仕組み（Chrome 正式版が使えない理由など）

### 6. GitHub Actions
- `.github/workflows/ci.yml`（push to main / pull_request、同じブランチの古い実行は止める）
  - `check`（ubuntu）：CLAUDE.md の行数、ESLint、Prettier、`tsc --noEmit`
  - `test`（matrix: ubuntu / macos / windows）：`npm ci` → `playwright install --with-deps chromium firefox` → 単体テスト（Node）→ Browser Mode（Chromium・Firefox）→ Chrome・Firefox のビルド → manifest テスト → E2E。失敗時は Playwright のレポートとトレースを成果物に残す
  - `package`（ubuntu、`test` の後）：`wxt zip`（Chrome / Firefox）、`web-ext lint`、zip を成果物に残す
- `.github/workflows/release.yml`（`v*` タグ）：タグと `package.json` の version が一致するか確認 → zip を作る → `gh release create` で添付。`workflow_dispatch` では Release を作らず zip を作るだけ（動作確認用）
- `.github/workflows/mutation.yml`：週1回＋手動。Stryker のレポートを成果物に残す
- `.github/dependabot.yml`：npm と GitHub Actions を週1回
- actions は実装時点の最新メジャー版を使う

### 7. 進め方（git）
1. main で仕様書と現在の CLAUDE.md を初回コミット → push
2. `chore/dev-env` ブランチで上記を作り、テストは1つずつ「先に落ちるのを確認 → 通す」
3. push して PR を作り、3 OS で CI が通るのを確認。落ちたら直す
4. ブランチ保護（必須チェック）は、非公開リポジトリだと GitHub の有料プランが要る。可能かを確認し、設定するかはユーザーに聞く

## 検証
- ローカル（macOS）：`npm run check`、`npm test`、`npm run build`（Chrome / Firefox）、`npm run test:e2e` がすべて通る
- 壊して落ちることの確認（その都度やり、結果を報告する）
  - content script の `lang` 判定を外す → `lang="ja"` の E2E が落ちる
  - Shadow DOM をやめて直接 DOM に入れる → スタイル分離の E2E が落ちる
  - manifest に権限を1つ足す → manifest テストが落ちる
  - `chrome.runtime` を直接書く → ESLint が落ちる
  - CLAUDE.md を 151 行にする → hook が差し戻し、`npm run check` も落ちる
- GitHub：PR 上で `check` / `test`（3 OS）/ `package` が緑。zip が成果物に残る。`release.yml` を `workflow_dispatch` で流して zip ができる（タグを打つ本番の Release はユーザーに確認してから）
- 終わったら `docs/status.md` とメモリ（プロジェクトの状態、コミットの扱い）を更新する
