# Lingo（仮称）— 言語学習ブラウザ拡張（まず Chrome 版）

好きな動画（YouTube / Netflix）や Web 記事の上で、そのまま語学学習ができるブラウザ拡張（MV3）。第1段階は Chrome 版だけ公開し、Firefox・Edge などは後から出す。
単語・熟語のカテゴリ別ハイライト（初出／学習中／学習済み）、ホバーで意味、クリックで辞書ウィンドウ、熟語登録、出典と再出現の記録が中心機能。

## まず読むもの
1. **設計仕様**：[docs/specs/2026-11-08-language-learning-extension-design.md](docs/specs/2026-11-08-language-learning-extension-design.md)
2. **UIモック（Claude Design）**：https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS
   - 非公開（オーナーのみ）。中身は Artifact ツールの `read` で `project/canvas.json` と各画面 `project/Main.dc.html`（YouTube）、`project/Article.dc.html`（記事）、`project/Toolbar.dc.html`（ツールバーのポップアップ）、`project/Settings.dc.html`（設定ページ）を読む
   - **仕様書とモックが食い違う場合はモックが正**。モックを変えたら、仕様書の「UI仕様（モック準拠）」も同じ内容に直す

## 前提・制約
- **開発者はサーバーを一切運用しない**（一般公開予定）。データは端末内（IndexedDB）と、ユーザー自身のブラウザの同期（`storage.sync`。Chrome なら Google アカウント、Firefox なら Mozilla アカウント）だけ
- **ブラウザに依存しない作りにする**：拡張 API は WXT の `browser` 経由（`chrome.*` を直接使わない）。ブラウザで有無が違う機能は部品の裏に置き、ブラウザ名ではなく機能の有無で判定する。ブラウザ名が入る文言は `BrowserEnv` から取る（仕様書「ブラウザによる違いの吸収」）
- ブラウザの同期は、未ログインだと端末内に保存されるだけで、拡張からは区別できない。画面では「Synced」ではなく「Saved」と書く
- 開発時の組み合わせは 学習言語=英語、母語=日本語、対象サイト=YouTube・Netflix。言語ペアとサイトは差し替え可能な部品（`LanguagePack` / `DictionaryProvider` / `PlatformAdapter` など）で増やす
- 画面の表示言語は英語のみ。文字列はすべて `t("key")` 経由にして、後から切り替えられるようにする
- 技術構成の予定：MV3 / TypeScript / WXT + Preact、UI は Shadow DOM 内、テストは Vitest と Playwright
- Language Reactor は参考に留め、機能を丸ごと取り込まない。仕様書にある基本機能に絞る

## 現在の状態（2026-11-08 時点）
- 設計（ブレスト）とUIモックまで完了。**コードはまだ無い**
- 仕様書と この CLAUDE.md は未コミット。**ユーザーが指示するまでコミットしない**
- 次のステップ
  1. ユーザーが仕様書をレビュー
  2. `superpowers:writing-plans` で第1段階（MVP）の実装計画を作る
  3. 計画に沿って実装
- 未決・未作成
  - 単語帳ページのモックは未作成
  - 拡張版 Language Reactor が youtube.com 上でどう表示されるかは未確認（Web版プレイヤーでのみ確認）
  - 発音記号（IPA）は Wiktionary（kaikki）から取り込む方針。カバー率は未検証
  - `storage.sync` に入る語数（圧縮後 約1.5〜2万語）は実データで未検証
  - Firefox 版の要確認：ハイライトの下線（Highlight API の `text-decoration`）の対応状況、Firefox の拡張向け翻訳機能の有無、MV3 のホスト権限の付与タイミング

## 進め方
- ユーザーとのやり取りは日本語。UI上の文言は英語
- UIの要望はモックのコメントで届くことが多い。対応したらモックと仕様書の両方を直し、コメントのスレッドに返信する
