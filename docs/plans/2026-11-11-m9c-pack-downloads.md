# M9c — Downloaded language packs

> Executed with superpowers:subagent-driven-development. TDD: scripts and pure logic in Node; the pack store in Browser Mode (IndexedDB, stubbed fetch); UI in Browser Mode; the built extension with Playwright E2E against a local mirror. Design: [language data](../specs/2026-11-11-language-data-scaling-design.md) §1. Mock: artboard `LanguageData` (reviewed 2026-11-11).

**Goal:** a pack is either bundled or downloaded, as its entry in a lock file says. Downloaded packs come from npm mirrors, are verified against SHA-256 values bundled with the extension, kept in IndexedDB, and switched to a new version in one transaction. While its data is missing, a language shows a downloading or failed state, and pages analyze again once the data is ready.

**Decided 2026-11-11 (user): hosting comes later.** The public data repository and the npm scope don't exist yet. So:
- the download path is built completely and tested against a local mirror;
- production builds keep every pack bundled (`bundled: true` in the lock) until the packages are published;
- switching `es` and `es-en` to downloads afterwards is a lock-file change: run `npm run data:publish -- --download es,es-en`, publish, release.

## Layout
- **Pack sources**:
  - `public/packs/<pack>/`: always bundled. These are `en`, `en-ja` and `en-defs` (spec: migration).
  - `data/packs/<pack>/` (committed): packs that can be downloaded. `es` and `es-en` move here; the data scripts write here.
- **Lock file** `src/core/packs/packs.lock.json`, written by `npm run data:publish`:
  ```json
  {
    "v": 1,
    "mirrors": [
      "https://cdn.jsdelivr.net/npm/{package}@{version}/{file}",
      "https://unpkg.com/{package}@{version}/{file}"
    ],
    "packs": {
      "es": {
        "package": "@lingo-data/es",
        "version": "2026.1111.0",
        "format": 1,
        "bundled": true,
        "files": [{ "path": "freq.json", "size": 380150, "sha256": "…" }]
      }
    }
  }
  ```
  - The npm scope is a placeholder until the user creates one; it is a constant in the publish script.
  - `format` is the data format the code reads. The publish script takes it from `scripts/data/formats.mjs`, and the runtime refuses a stored version whose format differs.
  - `version` stays the same while a pack's files are unchanged. When they change it becomes `<year>.<month × 100 + day>.<n>` for the UTC build date (2026-11-11 → `2026.1111.0`, 2027-01-05 → `2027.105.0`), with n = 0 for the day's first changed build and one more for each later one that day (from the lock's current version). Plain semver without prerelease suffixes, so versions order by date and npm treats them as normal releases.
- **npm package folders** `data/publish/<pack>/` (git-ignored), written by the same script: `package.json` (name, version, CC-BY-SA-4.0, files), `LICENSE`, `README.md` (sources and attribution) and the pack files. `npm publish` is run by hand later.
- **Build**: a WXT hook (`build:publicAssets`) copies the `data/packs/<pack>` folders whose lock entry says `bundled` into the output's `packs/`. Test builds can override the lock's `bundled` flags and mirrors with environment variables, never in production mode:
  - `WXT_PACKS_DOWNLOAD=es,es-en` downloads those packs;
  - `WXT_PACK_MIRRORS=http://localhost:4719/mirror/{package}@{version}/{file}` points at the local mirror.

## Runtime
- **`PackStore`** (`src/background/pack-store.ts`)
  - Dexie version 4 adds:
    - `packFiles: "sha256"`: `{ sha256, blob }`, one row per file;
    - `packVersions: "pack"`: `{ pack, version, format, files: { path, sha256 }[] }`, the active version.
  - `ensure(packs)` brings each pack to its lock version:
    - files whose SHA-256 is already stored are skipped;
    - the rest are fetched from the mirrors in order and checked with `crypto.subtle.digest`. A mismatch counts as a failure, and the next mirror is tried;
    - each file is stored as soon as it verifies;
    - when every file is there, one transaction switches `packVersions`, then files that no pack refers to are deleted.
  - `remove(pack)` deletes a pack's version row and its unreferenced files.
  - A per-pack lock prevents two downloads of the same pack.
- **Pack state** in `storage.local` under `packState`: `{ [pack]: { state: "ready" | "downloading" | "failed", received, total, error? } }`. Pages, the popup and Settings watch it.
- **`PackSource`** (`src/background/packs.ts`): the `FetchJson` that `createPackLoader` already takes.
  - A bundled pack is read with `runtime.getURL`.
  - A downloaded pack is read from the store, through the active version's file blob and `JSON.parse`.
  - A missing pack, or one stored in the wrong format, throws `PacksUnavailableError`.
  - When a pack's version switches, the in-memory loads are forgotten.
- **Triggers** (`src/entrypoints/background.ts`): every one calls `ensure` for the packs of the current pair (`packsFor(learning, native)`, from the recipes in `language-resources.ts`):
  - the service worker starts;
  - `watchSettings` reports a new pair;
  - `runtime.onInstalled`;
  - the `alarms` retry fires;
  - Settings or the popup sends `retryPacks`.

  Retries back off at 1, 5 and 30 minutes, then every 6 hours, using the `alarms` permission (no install warning; `tests/manifest.test.ts` is updated on purpose).
- **Messages**:
  - A request whose resources need a missing pack replies `{ ok: false, error, code: "packsUnavailable", packs }`.
  - New requests:
    - `packStatus` → the state, plus each pack's size from the lock, for the current pair and for other downloaded packs;
    - `retryPacks`;
    - `removePack { pack }`. It also clears that pair's `mtCache` rows.

## UI (per the mock)
- **Content scripts** (article, video): on `packsUnavailable`, they show nothing on the page and watch `packState`. When the packs are ready, they analyze again.
- **Toolbar popup**: while the current pair's data is downloading or failed, one line under the header shows "Downloading Spanish data · 45%" with a bar, or "Couldn't download Spanish data" with Retry.
- **Video column**: the same line at the top of the Lingo column while its data is missing.
- **Settings → Languages**: a "Language data" row with the rows below nested under it.
  - The chosen pair: its size, then Downloaded, "Downloading · n%" with a bar, or "Couldn't download" with Retry.
  - Each downloaded pack the chosen pair doesn't use: its size and Remove.
  - A pair whose packs are all bundled shows no data row.
- Strings go in `locales/en.json`, and colors come from theme tokens.

## Tasks
1. **Data and build**
   - Move `es` and `es-en` to `data/packs` and point the data scripts there.
   - `scripts/data/formats.mjs`, `publish.mjs` (+ `.d.mts`, tests), the lock file, the WXT hook and the env overrides.
   - Update the smoke tests, `pack-sizes.test.ts` (both folders) and `.gitignore` (`data/publish`).
   - `THIRD_PARTY_NOTICES.md` paths.
2. **Background**
   - Write `PackStore`, `PackSource`, the triggers with `alarms`, `packState`, the messages, `packsFor` and `PacksUnavailableError`.
   - Tests:
     - Browser Mode, store with a fake fetch: a wrong hash, then the second mirror; resume after a stop; skip stored files; switch versions; garbage-collect; format mismatch; remove.
     - Handler tests.
3. **UI**
   - Content scripts handle `packsUnavailable`, wait and analyze again.
   - The popup and video lines, and the Settings rows.
   - Browser Mode tests. Screenshots compared with the mock.
4. **E2E and checks**
   - Serve `data/publish` from `e2e/serve.mjs` under `/mirror/`.
   - Build the check build with `WXT_PACKS_DOWNLOAD=es,es-en` and the local mirror. An E2E then shows a Spanish page waiting for its data, the data downloading, and the page highlighted.
   - A broken file on the mirror shows the failed state and Retry.
   - `npm run verify`, `build:firefox`.
   - Production build: everything bundled, size unchanged.
   - Docs: the main spec's data sources and architecture, `docs/status.md`, `docs/development.md` (data publish steps).

## Verification
- `npm run verify` (E2E includes the download test), `npm run build:firefox`.
- Compare the Settings and popup states with the mock.
- In the user's Chrome, check build: unchanged behavior (everything bundled). The real CDN download is checked after publishing.
