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
| simple-git-hooks / lint-staged | ^2.14.0 / ^17.6.0 | git hooks / format staged files |
| knip | ^6.45.1 | dead-code report |
| web-ext | ^10.8.0 | lint the Firefox build |

## Commands
| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:firefox` | dev build with reload |
| `npm run check` | typecheck, lint, format check, CLAUDE.md line limit, dead code (knip) |
| `npm run check:dead` | knip: unused files, exports and dependencies |
| `npm test` | unit tests |
| `npm run test:browser` | browser-mode tests (set `VITEST_BROWSERS=chromium` to skip Firefox) |
| `npm run test:browser:firefox` | browser-mode tests on Firefox in CI's Playwright image (Docker; see "Firefox in Docker"); takes Vitest arguments, e.g. a test file, and `--shards=N` to split the files over N containers |
| `npm run build` / `npm run build:firefox` | build to `.output/chrome-mv3` / `.output/firefox-mv3` |
| `npm run build:check` | self-reloading Chrome build in `.output/langle-check` (see below) |
| `npm run build:check-download` | check build that downloads its Spanish data from the E2E server's mirror, in `.output/chrome-mv3-check-download` (see "Language data downloads in E2E") |
| `npm run test:manifest` | check both built manifests |
| `npm run test:e2e:build` | production, check and check-download builds, then run E2E |
| `npm run test:e2e:real` | E2E error checks on real sites (Wikipedia, BBC, YouTube); needs the network |
| `npm run verify` | everything a push needs, in about 75 s (`scripts/verify.ts`): check, unit, browser on Chromium, builds and E2E on the host, while the Firefox browser tests run in Docker (3 containers) alongside; one line per stage, and the part of the log that says why when one fails (full logs in `$(git rev-parse --git-path langle-verify)`). The first failure stops the rest. When it passes, it records the tree it tested for the pre-push hook |
| `npm run zip` / `npm run zip:firefox` | store-ready zips in `.output/` |
| `npm run test:mutation` | Stryker report in `reports/mutation/` |

## Hooks and static checks
- `npm install` installs the git hooks (`prepare` runs `simple-git-hooks`; after changing the `simple-git-hooks` key in `package.json`, run `npm run prepare`). **pre-commit**: `lint-staged` runs `prettier --write` and `eslint --fix` on the staged files and restages them; no typecheck, to keep commits fast. **pre-push** (`scripts/pre-push.ts`): a branch push goes through only if `npm run verify` passed on the tree being pushed (the working tree as `git add -A` would commit it, so verifying before committing counts; trees are listed in `.git/langle-verified`, shared by every worktree). Tags and branch deletions pass.
- Claude Code: the `PostToolUse` hook in `.claude/settings.json` runs `scripts/format-hook.ts`, which formats each edited file with Prettier, and `scripts/check-claude-md.ts --hook`.
- In an emergency, `git commit --no-verify` skips the pre-commit hook and `git push --no-verify` the pre-push hook. Never skip the pre-push hook for a push to a PR: CI no longer runs `check` or Firefox, so it would not catch what `verify` would have.
- TypeScript: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride` and `noUncheckedIndexedAccess` (WXT's generated tsconfig already turned on the last three; `tsconfig.json` states them so they do not depend on it).
- ESLint: `tseslint.configs.strict` everywhere, plus type-aware rules on `src/` (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `consistent-type-imports`, `switch-exhaustiveness-check` with a `default` counting as exhaustive). `no-non-null-assertion` is off: with `noUncheckedIndexedAccess`, `!` states an index the code knows is present.
- Prettier does not format `docs/` or `CLAUDE.md`: it pads every table column and adds blank lines, growing the docs by about 17%, which sessions read as context.
- knip (`npm run check:dead`, part of `check`; configured under `knip` in `package.json`) fails on unused files, exports and dependencies. An export only a test uses counts as used.

## How E2E loads the extension
`e2e/fixtures.ts` launches Playwright's bundled Chromium (`channel: "chromium"`) with `--load-extension` pointing at a build: `.output/chrome-mv3-check` by default, `.output/chrome-mv3` (production) or `.output/chrome-mv3-check-download` where a test asks for it (`test.use({ build })`). Stable Chrome 137+ ignores `--load-extension`, so it cannot be used. The extension id is read from the service worker URL. Pages come from a static server (`e2e/serve.ts`), which Playwright starts, or reuses when one already listens on port 4719 (not in CI): stop an old one after changing `serve.mjs`.

## Language data downloads in E2E
Production builds bundle every pack, so the download path is tested against a local npm mirror:
- `npm run build:check-download` builds in mode `check-download`: the check build (open shadow roots, debug logging, no self-reload) with the variables in `.env.check-download` (WXT reads `.env.<mode>`): `es` and `es-en` are left out of the build and downloaded from `http://localhost:4719/mirror/{package}@{version}/{file}`.
- `e2e/serve.ts` writes the npm package folders `data/publish/<pack>/` from the committed lock when it starts (the publish script's `writePackages`; the lock is not rewritten), then serves them under `/mirror/` in the npm CDNs' URL shape (`/mirror/@langle/es@2026.1111.0/freq.json`; another version is a 404). Its answers carry `access-control-allow-origin: *`, as jsDelivr's and unpkg's do: the extension has no host permissions.
- `/mirror-control` switches how the mirror answers: `GET` gives `{ broken, hold, held, served }`; `POST ?broken=1` sends every file with one byte changed (its SHA-256 no longer matches the lock), `POST ?hold=1` keeps requests waiting until `?hold=0`, `POST ?reset` turns both off (answering what was held) and zeroes `served`.
- `e2e/pack-downloads.spec.ts` breaks the mirror to see "Couldn't download" in the popup and Settings, then fixes it and retries from Settings until the page is highlighted. The waiting states are browser tests (`Popup`, `SettingsPage`, `article.browser`).
- To run only these: `npm run build:check-download && npx playwright test e2e/pack-downloads.spec.ts`. To try it by hand: `node e2e/serve.ts`, load `.output/chrome-mv3-check-download` unpacked, choose Spanish → English in Settings and open `http://localhost:4719/article-es.html`; `curl -X POST 'http://localhost:4719/mirror-control?broken=1'` makes the next download fail.

## Checking in your own Chrome
`npm run build:check` builds Chrome in mode `check` (to `.output/chrome-mv3-check`), copies it into `.output/langle-check` (overwriting changed files, deleting ones the build no longer has) and writes `build-id.txt` (time and commit) last.

1. Once: `chrome://extensions` → Developer mode → Load unpacked → `.output/langle-check`.
2. After that, run `npm run build:check`; the extension reloads itself (no click on reload).
3. Reload the pages you check on after the copy: until then they keep the old content scripts.
4. **Every check in your own Chrome ends with reading the check build's error log** on a web page Langle runs on (a YouTube watch page, an article), with Claude in Chrome's `javascript_tool`:
   ```js
   await new Promise((done) => {
     const id = String(Math.random()), replies = [];
     addEventListener("message", (e) => {
       if (e.data?.type === "langle:check-errors" && e.data.reply && e.data.id === id) replies.push(e.data);
     });
     postMessage({ type: "langle:check-errors", action: "read", id }, "*");
     setTimeout(() => done(replies.length ? replies : "No answer: Langle's check build does not run on this page"), 1000);
   })
   ```
   Each reply holds `entries` (`level`, `message`, `stack`, `context`, `url`, `time`) and `connected` (false: the extension was reloaded under that content script, which then answers only with what it could not send). Any entry is a finding: fix it, or name its cause, before the check counts as passed. Then run the snippet again with `action: "clear"` so the next check starts empty. Entries left by tabs that were open during a reload count too: they are the old content scripts' teardown, sent once that tab is reloaded. No one has to open `chrome://extensions` (Claude in Chrome cannot open `chrome://` or `chrome-extension://` pages).

How: in mode `check` only, the service worker reads `build-id.txt` every 2 s while it runs and calls `runtime.reload()` when it changes. It also checks once each time the worker starts, against the id stored in `storage.session` by the previous start, so a build copied in while the worker slept is picked up when it wakes. Other builds leave this code out (`npm run test:manifest` checks it).

The error log (`src/check/`, mode `check` only): every Langle context (the service worker, the content scripts, the popup, options and word list pages) records what Chrome's Errors page would show: `console.error` and `console.warn` calls (still printed), uncaught errors and unhandled rejections (in content scripts only those from Langle's scripts, not the site's). The service worker keeps the newest 200 entries in `storage.local` (`checkErrorLog`); the other contexts send theirs to it, and keep what they cannot send (a content script cut off by a reload) in the tab's `sessionStorage`, up to 50, which the next script in that tab sends. The content scripts answer the page's `langle:check-errors` messages (`read`, `clear`). `e2e/extension-errors.spec.ts` reads and clears it like the snippet; `npm run test:manifest` checks that production builds have none of it.

Limits:
- The log misses what happens before Langle's code runs, such as a manifest or service worker that fails to load: the extension then does not run at all, which the check itself shows (no Langle on the page, no answer to the snippet). Click "Errors" on Langle's card in `chrome://extensions` for those.
- The page-world scripts (`*-main.content.ts`) record nothing: their errors are mixed with the site's.
- Any page can read and clear the log of a check build. Only load it in your own browser profile for checks.
- In check builds, Chrome's console attributes console errors and warnings to the log's wrapper; the entries' `stack` has the caller.
- The worker sleeps after about 30 s without events, and then nothing polls. The reload happens on its next start: open a YouTube or Netflix page, or the popup.
- Open pages keep the old content scripts until they are reloaded.
- A build that breaks the service worker cannot reload itself again: fix it and click reload.
- Check builds include WXT's debug logging (`[wxt]` in the console).

## Firefox in Docker
- Playwright's Firefox does not launch on the dev Mac (macOS 27), so `npm run test:browser:firefox` runs the browser tests in the image CI uses (`mcr.microsoft.com/playwright:v<@playwright/test version>-noble`, from `scripts/playwright-image.ts`, which `scripts/check-playwright-image.ts` also checks CI against). Install once: `brew install colima docker`.
- When Docker is not running, the script starts Colima with 4 CPUs and 4 GB (about 20 s) and stops it after, unless another container still runs in it; an already running Colima or Docker Desktop is used as it is. The first run pulls the image (about 1 GB to download, 3.6 GB on disk).
- The checkout is mounted at the same path (failures name files you can open), and `node_modules` (Linux builds) lives in a Docker volume named after the `package-lock.json` hash, filled by `npm ci --ignore-scripts` on first use; volumes of older lockfiles are removed. The run has no `CI` variable, so a failing test is not retried.
- `--shards=N` runs N containers side by side, each with its own Firefox, so Firefox's one-active-window limit (testing.md "Notes") holds within each. `verify` uses 3: 108 s in one container, 44 s in three; more would not help, since the host lane takes about 70 s. The install runs first, in one container.

## Checking the Firefox build
```
npm run build:firefox
npx web-ext lint -s .output/firefox-mv3
```

## Language data
- The scripts in `scripts/data/` build the packs from raw files in `data/raw/` (git-ignored): `npm run data:build` (English: `public/packs/`, always bundled, and the English → native pair dictionaries) and `npm run data:es` (Spanish: `data/packs/`, can be downloaded). `npm run data:native -- es pt` builds the English → native pair dictionaries from the kaikki extracts of those Wiktionary editions (`kaikki.org/dictionary/downloads/<ed>/<ed>-extract.jsonl.gz`, unpacked to `data/raw/kaikki-<ed>-edition.jsonl`); they file meanings under the phrase patterns, and `en-defs` leaves out the terms every English pair has, so `data:build` runs them after `data:phrases` and before `data:en-defs` (keep that order when running the steps by hand). `data:kaikki` writes the vocabulary (EJDict's headwords and rule E's words, also listed in `data/gate/en-wiktionary-words.json`) and the example counts `data:freq` ranks them by (`data/raw/en-example-counts.json`, not committed), so run it before `data:freq`. `npm run data:stats` prints the numbers recorded in `docs/notes/data-sizes.md`. `data:phrases` reads the extract twice (entries, then the example corpus) and takes about 2 minutes.
- The scripts are TypeScript that Node runs as it is (type stripping, no build step). The `src/` files they import keep their own imports type-only; `scripts/data/common.test.ts` loads every data script under plain Node to check this. Shared helpers (pack I/O, shards, the kaikki JSONL stream, the cached Wiktionary fetch) are in `scripts/data/common.ts`.
- `scripts/data/formats.ts` lists every pack: its folder, npm package (scope `@langle`, the npm organization `langle`) and sources. `src/core/packs/formats.ts` holds what the extension shares with the scripts: each pack's data `format` (bump it when the code that reads the pack changes), the language packs and the dictionaries (`DICTIONARY_PACKS`, also the pairs the quality gate checks).
- After the pack files change, run `npm run data:publish`. It writes `src/core/packs/packs.lock.json` (committed; a unit test fails while it is out of date) and an npm package folder per `data/packs/` pack in `data/publish/<pack>/` (git-ignored). A pack keeps its version while its files are unchanged; otherwise it becomes `<year>.<month × 100 + day>.<n>` for the UTC build date (2026-11-11 → `2026.1111.0`), with n counting up for each later change that day. These are plain semver versions (no prerelease suffix) that order by date.
- `npm run data:publish -- --download es,es-en` marks those packs as downloaded (`bundled: false`): the build leaves them out and the extension fetches them from the mirrors. Without `--download` every pack is bundled. Only `data/packs/` packs can be downloaded.
- Test builds (any mode but production) can override the lock: `WXT_PACKS_DOWNLOAD=es,es-en` downloads those packs, `WXT_PACK_MIRRORS=<template>,…` replaces the mirrors (`src/core/packs/lock.ts`). Production builds ignore both. `.env.check-download` sets them for the E2E download build (see "Language data downloads in E2E").
- `npm run data:npm-publish` publishes each downloadable pack whose version in the committed lock is not on npm yet (`-- --dry-run` publishes nothing). It never rewrites the lock and stops when the pack files differ from it. `packs.yml` runs it by hand from GitHub Actions (dry run by default) with npm trusted publishing, so no token is stored; there is no public data repository, and npm makes no provenance for a private one (the extension checks each file's SHA-256 instead). A package takes a trusted publisher only once it exists, so each new package's first version is published by hand: `npm login`, `npm run data:npm-publish`, then set the package's trusted publisher on npmjs.com to this repository and `packs.yml`. A published version cannot be replaced, so publish before the release whose lock names it.
- Downloaded since 2026-11-18: `es`, `es-en`, `en-es`, `en-pt` (`npm run data:publish -- --download es,es-en,en-es,en-pt`; keep the list when running it again, or those packs go back to bundled). `packs.yml` has run only as a dry run: its first real publish is the first check of trusted publishing. Before a new version's files are on npm, don't fetch its CDN URLs: jsDelivr keeps the 404 for a while (`https://purge.jsdelivr.net/npm/<package>@<version>/<file>` clears it).

## CI/CD
- Tests run locally first: `npm run verify` before every push (the pre-push hook enforces it). GitHub Actions minutes are limited (private repository; macOS bills at 10x, Windows at 2x), so GitHub runs the tests only when a pull request is ready to merge.
- `ci.yml` (pull requests that are not drafts, and manual runs; not on pushes to main; not on pull requests that change only `docs/`, which nothing builds, tests or checks): one Linux job in Playwright's image (`mcr.microsoft.com/playwright`, browsers preinstalled), about 3.5 minutes, that runs only what Linux can tell apart from the dev Mac: unit, browser tests on Chromium, all builds, manifest, E2E (reports uploaded on failure) and `web-ext lint`. `check` (the same on any OS) and the Firefox browser tests (already run in this very image by `verify`) are left to `verify`; zips come from `release.yml`. `node_modules` is cached per lockfile, `.nvmrc` and image, so `npm ci` runs only when one changes; `cache.yml` makes that cache on main (on a push that changes one of them, or by hand), because a pull request can restore only caches from its own branch or main. The image tag must match `@playwright/test` (`scripts/check-playwright-image.ts` fails the job otherwise), so bump it in `ci.yml` with each Playwright update.
- Work in phases may be stacked: while a phase's pull request waits for CI, the next phase starts on its branch, with that branch as the pull request's base; it is retargeted to `main` once the base merges, and merged only then.
- `cross-os.yml` (manual only): the whole suite on macOS and Windows. Run it before a release, or after changing code that touches paths, files or the OS.
- `release.yml` (tag `v*` or manual run): verifies the tag equals the `package.json` version, builds both zips, and for tags creates a GitHub release with the zips attached.
- `packs.yml` (manual only, on main; dry run unless unticked): publishes the language packs' npm packages that are not on npm yet (`npm run data:npm-publish`, trusted publishing, no `npm ci`). Run it after merging a change to `data/packs/` and before the release that uses it.
- `mutation.yml` (manual only): Stryker run; uploads `reports/mutation`.
- `dependabot.yml`: weekly updates for npm and GitHub Actions, one grouped pull request each. TypeScript major updates are ignored until typescript-eslint supports TypeScript 7.

## Release steps
1. If the lock names pack versions not on npm yet, run `packs.yml` on main.
2. Bump `version` in `package.json` and merge.
3. Tag `vX.Y.Z` on main and push the tag. The release workflow attaches the Chrome and Firefox zips.
4. Submit the zips to the stores by hand (store submission is manual).

## CLAUDE.md length
Every `CLAUDE.md` must stay at or under 150 lines (`npm run check:claude-md`). A Claude Code hook (`.claude/settings.json`) blocks edits that exceed it. Put details in `docs/`.
