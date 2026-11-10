# Lingo (working name) — language-learning browser extension (Chrome first)

A browser extension (MV3) for learning a language right on top of the videos (YouTube / Netflix) and web articles you like. Phase 1 publishes only the Chrome version; Firefox, Edge and others come later.
Core features: highlights by category (New / Learning / Known), meaning on hover, dictionary window on click, saving phrases, recording sources and re-occurrences.

## Read first
1. **Design spec**: [docs/specs/2026-11-08-language-learning-extension-design.md](docs/specs/2026-11-08-language-learning-extension-design.md)
2. **Current status and next steps**: [docs/status.md](docs/status.md)
3. **Roadmap**: [docs/plans/2026-11-09-roadmap.md](docs/plans/2026-11-09-roadmap.md)
4. **Testing policy**: [docs/testing.md](docs/testing.md)
5. **Tooling, CI/CD, release**: [docs/development.md](docs/development.md)
6. **UI mock (Claude Design)**: https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS
   - Private (owner only). Read it with the Artifact tool's `read`: `project/canvas.json` and each screen — `project/Main.dc.html` (YouTube), `project/Article.dc.html` (article), `project/Toolbar.dc.html` (toolbar popup), `project/Settings.dc.html` (settings page)
   - **When the spec and the mock disagree, the mock wins.** When the mock changes, update the spec's "UI spec (follows the mock)" to match

## Commands
- `npm run dev`: dev build with reload
- `npm run check`: typecheck, lint, format, CLAUDE.md line limit (150)
- `npm test`: unit tests; `npm run test:browser`: real-browser tests (`VITEST_BROWSERS=chromium` locally)
- `npm run build`: production build; `npm run test:e2e:build`: build + Playwright E2E
- `npm run verify`: everything above, terse (~1.5 min). While iterating, run only the touched test files; run `verify` before every push (it must pass). GitHub CI adds Firefox only

## Constraints
- **The developer runs no servers** (the extension will be public). Data lives only on the device (IndexedDB) and in the user's own browser sync (`storage.sync`: a Google account in Chrome, a Mozilla account in Firefox)
- **Browser-neutral code**: call extension APIs through WXT's `browser` (never `chrome.*` directly). Features that differ between browsers sit behind a part and are detected by whether the feature exists, not by browser name. Strings containing a browser name come from `BrowserEnv` (spec: "Absorbing browser differences")
- Browser sync just stores locally when signed out, and the extension cannot tell the difference. The UI says "Saved", never "Synced"
- Development pair: learning = English, native = Japanese, sites = YouTube and Netflix. Language pairs and sites grow by adding parts (`LanguagePack` / `DictionaryProvider` / `PlatformAdapter` …)
- The UI is English only. Every string goes through `t("key")` so it can be switched later
- Stack: MV3 / TypeScript / WXT + Preact, UI inside Shadow DOM, tests with Vitest and Playwright
- Language Reactor is a reference only; do not copy its features wholesale. Keep to the basics in the spec

## Rules
- **Everything committed to git is in English** (code, comments, docs, commit messages, PRs). Chat with the user is in Japanese
- **Before committing a UI change, render it and compare it with the mock** (layout, copy, colors, defaults)
- Commit and push only when the user asks or an approved plan says so. Work on a branch per phase and open a **draft** PR; mark it ready for review only just before merging, which is when GitHub runs CI (Actions minutes are limited). Never poll CI; the user merges
- No Claude attribution in commit messages or PR bodies

## Working style
- UI requests often arrive as comments on the mock. After handling one, fix both the mock and the spec, and reply in the comment thread
