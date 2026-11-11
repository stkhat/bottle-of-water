# Development

## Tooling
| Tool | Version (package.json) | Use |
| --- | --- | --- |
| Node | 26 (`.nvmrc`) | runtime |
| WXT | ^0.21.5 | extension framework, build, zip |
| Preact | ^11.2.0 | UI |
| TypeScript | ^6.0.3 | types |
| Vitest (+ `@vitest/browser-playwright`, `vitest-browser-preact`) | ^5.1.0 | unit, browser and manifest tests |
| Playwright | ^1.65.0 | E2E and Vitest browser provider |
| ESLint / Prettier | ^10.14.0 / ^3.9.10 | lint / format |
| Stryker (core + vitest-runner) | ^10.1.1 | mutation report |
| web-ext | ^10.8.0 | lint the Firefox build |

## Commands
| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:firefox` | dev build with reload |
| `npm run check` | typecheck, lint, format check, CLAUDE.md line limit |
| `npm test` | unit tests |
| `npm run test:browser` | browser-mode tests (set `VITEST_BROWSERS=chromium` to skip Firefox) |
| `npm run build` / `npm run build:firefox` | build to `.output/chrome-mv3` / `.output/firefox-mv3` |
| `npm run build:check` | self-reloading Chrome build in `.output/lingo-check` (see below) |
| `npm run test:manifest` | check both built manifests |
| `npm run test:e2e:build` | production and check builds, then run E2E |
| `npm run test:e2e:real` | E2E error checks on real sites (Wikipedia, BBC, YouTube); needs the network |
| `npm run verify` | check, unit, browser (Chromium), builds and E2E, with terse output |
| `npm run zip` / `npm run zip:firefox` | store-ready zips in `.output/` |
| `npm run test:mutation` | Stryker report in `reports/mutation/` |

## How E2E loads the extension
`e2e/fixtures.ts` launches Playwright's bundled Chromium (`channel: "chromium"`) with `--load-extension` pointing at `.output/chrome-mv3`. Stable Chrome 137+ ignores `--load-extension`, so it cannot be used. The extension id is read from the service worker URL. Pages come from a static server (`e2e/serve.mjs`).

## Checking in your own Chrome
`npm run build:check` builds Chrome in mode `check` (to `.output/chrome-mv3-check`), copies it into `.output/lingo-check` (overwriting changed files, deleting ones the build no longer has) and writes `build-id.txt` (time and commit) last.

1. Once: `chrome://extensions` → Developer mode → Load unpacked → `.output/lingo-check`.
2. After that, run `npm run build:check`; the extension reloads itself (no click on reload).

How: in mode `check` only, the service worker reads `build-id.txt` every 2 s while it runs and calls `runtime.reload()` when it changes. It also checks once each time the worker starts, against the id stored in `storage.session` by the previous start, so a build copied in while the worker slept is picked up when it wakes. Other builds leave this code out (`npm run test:manifest` checks it).

Limits:
- The worker sleeps after about 30 s without events, and then nothing polls. The reload happens on its next start: open a YouTube or Netflix page, or the popup.
- Open pages keep the old content scripts until they are reloaded.
- The folder loaded before this change has no self-reload: click reload on it once.
- A build that breaks the service worker cannot reload itself again: fix it and click reload.
- Check builds include WXT's debug logging (`[wxt]` in the console).

## Checking the Firefox build
```
npm run build:firefox
npx web-ext lint -s .output/firefox-mv3
```

## Language data
- The scripts in `scripts/data/` build the packs from raw files in `data/raw/` (git-ignored): `npm run data:build` (English: `public/packs/`, always bundled) and `npm run data:es` (Spanish: `data/packs/`, can be downloaded). `npm run data:stats` prints the numbers recorded in `docs/status.md`.
- `scripts/data/formats.mjs` lists every pack: its folder, data `format` (bump it when the code that reads the pack changes), npm package (scope `@lingo-data`, a placeholder) and sources.
- After the pack files change, run `npm run data:publish`. It writes `src/core/packs/packs.lock.json` (committed; a unit test fails while it is out of date) and an npm package folder per `data/packs/` pack in `data/publish/<pack>/` (git-ignored). A pack keeps its version while its files are unchanged; otherwise it becomes `<year>.<month × 100 + day>.<n>` for the UTC build date (2026-11-11 → `2026.1111.0`), with n counting up for each later change that day. These are plain semver versions (no prerelease suffix) that order by date.
- `npm run data:publish -- --download es,es-en` marks those packs as downloaded (`bundled: false`): the build leaves them out and the extension fetches them from the mirrors. Without `--download` every pack is bundled. Only `data/packs/` packs can be downloaded.
- Test builds (any mode but production) can override the lock: `WXT_PACKS_DOWNLOAD=es,es-en` downloads those packs, `WXT_PACK_MIRRORS=<template>,…` replaces the mirrors (`src/core/packs/lock.ts`). Production builds ignore both.
- Publishing to npm is manual and pending: the scope and the public data repository do not exist yet, so every pack stays bundled. Then: `npm publish` in each `data/publish/<pack>/`, run `data:publish -- --download …`, release.

## CI/CD
- Tests run locally first: `npm run verify` before every push. GitHub Actions minutes are limited (private repository; macOS bills at 10x, Windows at 2x), so GitHub runs the tests only when a pull request is ready to merge.
- `ci.yml` (pull requests that are not drafts, and manual runs; not on pushes to main): one Linux job in Playwright's image (`mcr.microsoft.com/playwright`, browsers preinstalled) that runs check, unit, browser tests on Chromium and Firefox, all builds, manifest, E2E (reports uploaded on failure), the zips and `web-ext lint` (artifact `lingo-zips`). The image tag must match `@playwright/test` (`scripts/check-playwright-image.mjs` fails the job otherwise), so bump it in `ci.yml` with each Playwright update.
- `cross-os.yml` (manual only): the whole suite on macOS and Windows. Run it before a release, or after changing code that touches paths, files or the OS.
- `release.yml` (tag `v*` or manual run): verifies the tag equals the `package.json` version, builds both zips, and for tags creates a GitHub release with the zips attached.
- `mutation.yml` (manual only): Stryker run; uploads `reports/mutation`.
- `dependabot.yml`: weekly updates for npm and GitHub Actions, one grouped pull request each. TypeScript major updates are ignored until typescript-eslint supports TypeScript 7.

## Release steps
1. Bump `version` in `package.json` and merge.
2. Tag `vX.Y.Z` on main and push the tag. The release workflow attaches the Chrome and Firefox zips.
3. Submit the zips to the stores by hand (store submission is manual).

## CLAUDE.md length
Every `CLAUDE.md` must stay at or under 150 lines (`npm run check:claude-md`). A Claude Code hook (`.claude/settings.json`) blocks edits that exceed it. Put details in `docs/`.
