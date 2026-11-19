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
| `npm run build:check-download` | check build that downloads its language data from the E2E server's mirror, in `.output/chrome-mv3-check-download` (see "Language data downloads in E2E") |
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
`e2e/fixtures.ts` launches Playwright's bundled Chromium (`channel: "chromium"`, with a Japanese UI: `LANGUAGE=ja` for Linux, which ignores `--lang`, and `--lang=ja` for Windows) and loads a build with CDP's `Extensions.loadUnpacked`: `.output/chrome-mv3-check` by default, `.output/chrome-mv3` (production) or `.output/chrome-mv3-check-download` where a test asks for it (`test.use({ build })`). Stable Chrome 137+ cannot load an unpacked extension this way, so it cannot be used. The extension loads only after the lock's mirrors are routed (`e2e/pack-mirrors.ts`, below), since a new install starts its download at once; `--disable-extensions-except` would load it at launch, before the routes, so Playwright's own `--disable-extensions` is left out instead. The extension id is read from the service worker URL. Each test then starts with English → Japanese (fixture option `startPair`; null keeps the pair the install chose from the UI language, which macOS takes from the system). Pages come from a static server (`e2e/serve.ts`), which Playwright starts, or reuses when one already listens on port 4719 (not in CI): stop an old one after changing `serve.mjs`.

## Language data downloads in E2E
Every build downloads every pack, so no E2E test may reach the real CDNs (jsDelivr would also keep a 404 for a version not on npm yet):
- `e2e/pack-mirrors.ts` routes the lock's mirrors (jsDelivr, unpkg) in each test's browser, service worker included, to the files in `data/packs/`, and makes their hosts unresolvable (`--host-resolver-rules`), so a request the routes miss fails. With the fixture option `mirrorsHeld` the answers wait for `releasePackMirrors`, to see the first download in progress (`e2e/first-run.spec.ts`).
- `npm run build:check-download` builds in mode `check-download`: the check build (open shadow roots, debug logging, no self-reload) with the variable in `.env.check-download` (WXT reads `.env.<mode>`): every pack is downloaded from `http://localhost:4719/mirror/{package}@{version}/{file}`, which tests can break.
- `e2e/serve.ts` writes the npm package folders `data/publish/<pack>/` from the committed lock when it starts (the publish script's `writePackages`; the lock is not rewritten), then serves them under `/mirror/` in the npm CDNs' URL shape (`/mirror/@langle/es@2026.1111.0/freq.json`; another version is a 404). Its answers carry `access-control-allow-origin: *`, as jsDelivr's and unpkg's do: the extension has no host permissions.
- `/mirror-control` switches how the mirror answers: `GET` gives `{ broken, hold, held, served }`; `POST ?broken=1` sends every file with one byte changed (its SHA-256 no longer matches the lock), `POST ?hold=1` keeps requests waiting until `?hold=0`, `POST ?reset` turns both off (answering what was held) and zeroes `served`.
- `e2e/pack-downloads.spec.ts` waits for the install's English → Japanese data, then breaks the mirror to see "Couldn't download" in the popup and Settings, then fixes it and retries from Settings until the page is highlighted. The waiting states are browser tests (`Popup`, `SettingsPage`, `article.browser`).
- `e2e/progressive-download.spec.ts` (check build, routed mirrors) holds the `en-defs` files on the mirror: the page is highlighted and hovers show from `en` and `en-ja`, the popup has no download line while Settings shows the pair downloading, and "figure out" (only in `en-defs`) shows once its files are let through. `e2e/pack-mirrors.ts` can hold all files or a pack's (`mirrorsHeld`) and send them through one throttled link (`mirrorBitsPerSecond`, gzipped sizes).
- Measuring first use: `npx wxt build --mode check && LANGLE_FIRST_USE_MBIT=10 npx playwright test e2e/progressive-download.spec.ts -g "first use"` times a new install's English → Japanese from the mirrors' first byte to the first highlight, the first hover and the first card from `en-defs` (printed and in the report's annotations; skipped unless the variable is set, and when the browser's UI language is not Japanese). To time another build, put its `chrome-mv3-check` output in `.output/` first.
- To run only these: `npm run build:check-download && npx playwright test e2e/pack-downloads.spec.ts`. To try it by hand: `node e2e/serve.ts`, load `.output/chrome-mv3-check-download` unpacked, choose Spanish → English in Settings and open `http://localhost:4719/article-es.html`; `curl -X POST 'http://localhost:4719/mirror-control?broken=1'` makes the next download fail.

## Checking in your own Chrome
`npm run build:check` builds Chrome in mode `check` (to `.output/chrome-mv3-check`), copies it into `.output/langle-check` (overwriting changed files, deleting ones the build no longer has) and writes `build-id.txt` (time and commit) last. Like production, it downloads its language data from the lock's mirrors, so the lock's pack versions must be on npm first.

1. Once: `chrome://extensions` → Developer mode → Load unpacked → `.output/langle-check`.
2. After that, run `npm run build:check`; the extension reloads itself (no click on reload).
3. Reload the pages you check on after the copy: until then they keep the old content scripts.
   A check that needs other settings (another language pair, New highlighted, any field of the settings object) changes them itself through the settings channel ("Changing settings in a check" below), and restores the user's settings at the end; it does not ask the user to open Settings.
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
   Each reply holds `entries` (`level`, `message`, `stack`, `context`, `url`, `time`) and `connected` (false: the extension was reloaded under that content script, which then answers only with what it could not send). Any `error` or `warning` entry is a finding: fix it, or name its cause, before the check counts as passed. `info` entries are records, not findings: the language data's mirrors (below). Then run the snippet again with `action: "clear"` so the next check starts empty. Entries left by tabs that were open during a reload count too: they are the old content scripts' teardown, sent once that tab is reloaded. No one has to open `chrome://extensions` (Claude in Chrome cannot open `chrome://` or `chrome-extension://` pages).

How: in mode `check` only, the service worker reads `build-id.txt` every 2 s while it runs and calls `runtime.reload()` when it changes. It also checks once each time the worker starts, against the id stored in `storage.session` by the previous start, so a build copied in while the worker slept is picked up when it wakes. Other builds leave this code out (`npm run test:manifest` checks it).

The error log (`src/check/`, mode `check` only): every Langle context (the service worker, the content scripts, the popup, options and word list pages) records what Chrome's Errors page would show: `console.error` and `console.warn` calls (still printed), uncaught errors and unhandled rejections (in content scripts only those from Langle's scripts, not the site's). The service worker keeps the newest 200 entries in `storage.local` (`checkErrorLog`); the other contexts send theirs to it, and keep what they cannot send (a content script cut off by a reload) in the tab's `sessionStorage`, up to 50, which the next script in that tab sends. The content scripts answer the page's `langle:check-errors` messages (`read`, `clear`). `e2e/extension-errors.spec.ts` reads and clears it like the snippet; `npm run test:manifest` checks that production builds have none of it.

The pack mirrors in the log (`src/check/pack-mirrors.ts`, from the pack store's `onMirror`): the service worker adds one entry per try of a mirror for a pack file, in download order (the learning language's pack, the pair's dictionary, then its fallback, `en-defs`):
- `info` `Pack en-defs dict-3.json: served by https://cdn.jsdelivr.net/npm/@langle/en-defs@<version>/dict-3.json (1843200 bytes, 412 ms)`: the mirror that served the file, its bytes and the time from the request to the last byte checked. A real-site check of a first download reads these to see which CDN served what and how fast
- `warning` `Pack en-defs dict-3.json: mirror failed, <url>: HTTP 503` (or `SHA-256 does not match the lock`, `Failed to fetch`): every mirror that failed, also when the next one served the file. A finding like any warning: name the CDN's failure, or fix the lock

`e2e/progressive-download.spec.ts` reads these lines after a first download. Production builds record nothing.

Limits:
- The log misses what happens before Langle's code runs, such as a manifest or service worker that fails to load: the extension then does not run at all, which the check itself shows (no Langle on the page, no answer to the snippet). Click "Errors" on Langle's card in `chrome://extensions` for those.
- The page-world scripts (`*-main.content.ts`) record nothing: their errors are mixed with the site's.
- Any page can read and clear the log of a check build. Only load it in your own browser profile for checks.
- In check builds, Chrome's console attributes console errors and warnings to the log's wrapper; the entries' `stack` has the caller.
- The worker sleeps after about 30 s without events, and then nothing polls. The reload happens on its next start: open a YouTube or Netflix page, or the popup.
- Open pages keep the old content scripts until they are reloaded.
- A build that breaks the service worker cannot reload itself again: fix it and click reload.
- Check builds include WXT's debug logging (`[wxt]` in the console).

### Changing settings in a check
This is the standard way to change settings during a check in your own Chrome: the check build's content scripts answer the page's `langle:check-settings` messages (`src/check/settings-channel.ts`), so `javascript_tool` on any web page Langle runs on (an article, a YouTube or Netflix page) can do what Settings does. Each snippet starts with the same helper:
```js
var langle = (action, settings) => new Promise((done) => {
  const id = String(Math.random());
  addEventListener("message", (e) => {
    if (e.data?.type === "langle:check-settings" && e.data.reply && e.data.id === id) done(e.data);
  });
  postMessage({ type: "langle:check-settings", action, id, settings }, "*");
  setTimeout(() => done("No answer: Langle's check build does not run on this page"), 5000);
});
```
1. First, save the user's settings: `await langle("get")`. Keep the reply's `settings` object (the whole of it) in your notes.
2. Change what the check needs, for example a pair: `await langle("set", { learningLang: "en", nativeLang: "fr" })`, or any other fields: `await langle("set", { highlight: { new: true }, knownLevel: 5000 })`. The reply is `{ ok: true, settings }` (what is now stored) or `{ ok: false, error }`, and nothing is written then.
3. After a pair change, wait for its language data (rerun while it says it is still downloading):
   ```js
   await (async () => {
     for (let i = 0; i < 25; i++) {
       const r = await langle("packs");
       if (!r.ok || r.ready || r.failed) return r;
       await new Promise((ok) => setTimeout(ok, 1000));
     }
     return "Still downloading: run this again";
   })()
   ```
   The reply holds `packs` (the chosen pair's), `ready` (each can be used), `failed` and `packState` (every pack's `state`, `received`, `total`). Then reload the pages under check, or wait for them to analyze again.
4. At the end, restore: `await langle("set", <the saved settings object>)`, and check that the reply's `settings` equal the saved ones.

To watch a first download again, delete a pack the chosen pair does not use, as Settings' "Remove" does (the helper above with the pack added to the message: `postMessage({ type: "langle:check-settings", action: "remove", id, pack: "en-defs" }, "*")`); the reply is the `packs` report. For the whole progressive download of English → Japanese: switch to Spanish → English, remove `en`, `en-ja` and `en-defs`, clear the error log, open an English page and switch back; the log then lists every file's mirror. Switching back to the user's pair at the end downloads what it needs again.

`set` merges a partial settings object, nested groups key by key, as Settings does. It refuses rather than drops or clamps: an unknown key, an ill-typed value or a slider value off its range or step (`mergeSettings`, `src/core/settings.ts`, decides), and a pair Langle does not offer (the error names the offered native languages). A new learning language without `nativeLang` gets its first native language, as in Settings. The change goes through the background's `setSettings`, the one `storage.sync` write Settings makes, so packs download and open pages analyze again the same way.

Limits:
- Settings live in `storage.sync`: while the check runs, the change reaches the user's other signed-in browsers too. Always restore.
- Settings also starts Chrome's translation models for the new pair, which needs a user activation; the channel tries, and where Chrome refuses, the dictionary window's click starts them later.
- Only the top frame answers, once per tab. Any page can change the settings of a check build: only load it in your own browser profile.
- `e2e/settings.spec.ts` drives the channel like the snippets; `npm run test:manifest` checks that production builds have none of it.

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
- The scripts in `scripts/data/` build the packs from raw files in `data/raw/` (git-ignored) into `data/packs/<pack>/`: `npm run data:build` (English and the English → native pair dictionaries) `npm run data:es` (Spanish) `npm run data:fr` (French: downloads the FrequencyWords list and UD French GSD if missing, and reads `data/raw/kaikki-fr.jsonl` and the French edition `data/raw/kaikki-fr-edition.jsonl`, cut once to `kaikki-fr-edition-slim.jsonl`; about 3 minutes) and `npm run data:de` (German: fetches Buchmeier's subtitle list pages from Wiktionary and UD German GSD if missing, and reads `data/raw/kaikki-de.jsonl` and the German edition `data/raw/kaikki-de-edition.jsonl`, cut once to `kaikki-de-edition-slim.jsonl`; about a minute). No pack is bundled with the extension (user, 2026-11-18): it downloads the packs of the chosen pair. `npm run data:native -- es pt ru fr de zh it pl` builds the English → native pair dictionaries by their recipes (`scripts/data/recipes/recipes.ts`), from what each recipe names: a Wiktionary edition's kaikki extract (`kaikki.org/dictionary/downloads/<ed>/<ed>-extract.jsonl.gz`, unpacked to `data/raw/kaikki-<ed>-edition.jsonl`), the English extract's translation tables (always), and OMW wordnets (the Open Multilingual Wordnet 1.4 release, `https://github.com/omwn/omw-data/releases/download/v1.4/omw-1.4.tar.xz`, unpacked in `data/raw/omw/`, so that `data/raw/omw/omw-1.4/omw-en/omw-en.xml` and `omw-<lang>/omw-<lang>.xml` exist; omw-en is read whenever a recipe has a wordnet). A recipe with a wordnet reads omw-en (111 MB) whole: a few seconds and about 1 GB of memory more. The zh recipe converts traditional characters with the dictionaries of the `opencc` dev dependency (`node_modules/opencc/data/dictionary/`; only its data files are read, its install script does not run, and knip ignores it as nothing imports it). They file meanings under the phrase patterns, and `en-defs` leaves out the terms every English pair has, so `data:build` runs them after `data:phrases` and before `data:en-defs` (keep that order when running the steps by hand). `data:kaikki` writes the vocabulary (EJDict's headwords and rule E's words, also listed in `data/gate/en-wiktionary-words.json`) and the example counts `data:freq` ranks them by (`data/raw/en-example-counts.json`, not committed), so run it before `data:freq`; it also writes the capital-only words (`en/capitals.json`), whose Japanese meanings `data:capitals` then adds to EJDict's in `en-ja/capital.json` (it writes that file again whole, so run it after `data:ejdict` and `data:kaikki`). `npm run data:stats` prints the numbers recorded in `docs/notes/data-sizes.md`. `data:phrases` reads the extract twice (entries, then the example corpus) and takes about 2 minutes.
- The scripts are TypeScript that Node runs as it is (type stripping, no build step). The `src/` files they import keep their own imports type-only; `scripts/data/common.test.ts` loads every data script under plain Node to check this. Shared helpers (pack I/O, shards, the kaikki JSONL stream, the cached Wiktionary fetch) are in `scripts/data/common.ts`.
- `scripts/data/formats.ts` lists every pack: its folder, npm package (scope `@langle`, the npm organization `langle`) and sources with their licenses (a recipe pair's from its recipe; WordNet-style licenses' full notices are in `scripts/data/licenses/`). `src/core/packs/formats.ts` holds what the extension shares with the scripts: each pack's data `format` (bump it when the code that reads the pack changes; a recipe pair's is in its native-language entry, `src/core/natives.ts`), the language packs and the dictionaries (`DICTIONARY_PACKS`, also the pairs the quality gate checks). A new native language: architecture.md "Adding a native language".
- After the pack files change, run `npm run data:publish`. It writes `src/core/packs/packs.lock.json` (committed; a unit test fails while it is out of date) and an npm package folder per pack in `data/publish/<pack>/` (git-ignored). A pack keeps its version while its files are unchanged; otherwise it becomes `<year>.<month × 100 + day>.<n>` for the UTC build date (2026-11-11 → `2026.1111.0`), with n counting up for each later change that day. These are plain semver versions (no prerelease suffix) that order by date.
- Test builds (any mode but production) can replace the lock's mirrors: `WXT_PACK_MIRRORS=<template>,…` (`src/core/packs/lock.ts`). Production builds ignore it. `.env.check-download` sets it for the E2E download build (see "Language data downloads in E2E").
- `npm run data:npm-publish` publishes each pack whose version in the committed lock is not on npm yet (`-- --dry-run` publishes nothing). It never rewrites the lock and stops when the pack files differ from it. `packs.yml` runs it by hand from GitHub Actions (dry run by default) with npm trusted publishing, so no token is stored. The repository is public, so npm attaches provenance to each version `packs.yml` publishes, and refuses one whose package.json `repository.url` does not name this repository (`REPOSITORY_URL` in `scripts/data/formats.ts`); the extension still checks each file's SHA-256. A package takes a trusted publisher only once it exists, so each new package's first version is published by hand: `npm login`, `npm run data:npm-publish`, then set the package's trusted publisher on npmjs.com to this repository and `packs.yml`. A published version cannot be replaced, so publish before the release whose lock names it.
- Downloaded since 2026-11-18: `es`, `es-en`, `en-es`, `en-pt`; `en`, `en-ja`, `en-defs` too since D0 ([plan](plans/language-expansion.md)), their first versions published by hand before that change merged; `en-ru`, `en-fr`, `en-de` since D2 and `en-zh`, `en-it`, `en-pl` since D3, likewise. `packs.yml`'s first real publish (2026-11-18) was refused by npm's provenance check because the package.json files had no `repository.url`, so no version has been published through it yet. Before a new version's files are on npm, don't fetch its CDN URLs: jsDelivr keeps the 404 for a while (`https://purge.jsdelivr.net/npm/<package>@<version>/<file>` clears it).

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
