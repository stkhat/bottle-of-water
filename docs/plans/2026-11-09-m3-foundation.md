# M3 — Foundation (packs at runtime, classification, storage, sync, messaging)

> Executed task by task with superpowers:subagent-driven-development. TDD: every test is seen failing before the code exists. Spec: docs/specs/2026-11-08-language-learning-extension-design.md (Architecture, Data model, Sync).

**Goal:** everything the UIs need from the background: settings, browser differences, tokenizing and classifying text, dictionary lookups, saving terms with sources and occurrences, save-all with Undo, JSON export/import, and browser sync.

**Architecture:** pure modules in `src/core/` (testable in Node), storage in `src/background/` (IndexedDB via Dexie, tested in Vitest Browser Mode on real IndexedDB; `storage.sync` via WXT `fakeBrowser` in Node). Content scripts and extension pages call the background through one typed message protocol in `src/messaging/`. Nothing calls `chrome.*`; browser differences go through `BrowserEnv`.

## Files
| Path | Responsibility |
|---|---|
| `src/core/settings.ts` | `Settings` type, `DEFAULT_SETTINGS`, `mergeSettings(partial)` |
| `src/background/settings-store.ts` | read/write/watch settings in `storage.sync` (key `settings`) |
| `src/core/browser-env.ts` | `BrowserEnv`: `syncName`, `syncDelayHint`, `extensionsPageHint`, feature flags (`translator`, `builtInAi`, `highlightUnderline`, `fileSystemAccess`) — names from the build target (`import.meta.env.BROWSER`), features by detection |
| `src/core/text/tokenize.ts` | `tokenize(text, lang)` → `{ text, start, end, isWord }[]` with `Intl.Segmenter` |
| `src/core/packs/load.ts` | fetch + cache pack JSON from `browser.runtime.getURL("/packs/...")` |
| `src/core/language-pack.ts` | `LanguagePack` interface + `createEnglishPack(data)`: `lemmas(word)`, `rank(base)`, `ipa(term)` |
| `src/core/dictionary.ts` | `DictionaryProvider` interface + `createEnJaDictionary(data)`: `short(term)`, `entry(term)` |
| `src/core/classify.ts` | `Classifier`: classify tokens into terms (words + saved phrases), categories, unsaved list |
| `src/background/db.ts` | Dexie schema `terms`, `sources`, `occurrences`, `meta` |
| `src/background/term-store.ts` | save / set status / remove / record encounters / save all + Undo / counts / export / import |
| `src/core/sync/codec.ts` | pack/unpack/merge of sync records, gzip + base64, chunking |
| `src/background/sync/browser-sync-backend.ts` | `SyncBackend` over `storage.sync`: push, pull, onChanged, quota, demotion |
| `src/messaging/protocol.ts`, `src/messaging/client.ts`, `src/background/handlers.ts` | typed requests/responses, `send()` helper, background dispatcher |

## Tasks

### 1. Settings and BrowserEnv
- `Settings`: `learningLang: "en"`, `nativeLang: "ja"`, `uiLocale: "en"`, `knownLevel: 3000` (1,000–20,000, step 500), `highlight: { new: false, learning: true, known: false }`, `offerSaveAllAtEnd: true`, `dictionaries: { cambridge, wiktionary, reverso, wordreference: true }`, `subtitlePosition: "inVideo" | "belowVideo"` (default inVideo), `subtitleTranslation: true`, `transcriptTranslation: true`, `sites: { youtube: true, netflix: true, articles: true }`, `neverRunOn: string[]` (default `[]`), `disabledSites: string[]` (popup "On this site" off), `syncEnabled: true`, `sentenceHistory: true` (phase 2; stored now so the shape is stable). `mergeSettings` fills missing keys from defaults and clamps `knownLevel`
- Tests: defaults match the spec and mock; clamping; unknown keys dropped; settings store round-trip and change notification with `fakeBrowser`
- `BrowserEnv`: Chrome → `syncName: "Chrome sync"`, `extensionsPage: "chrome://extensions"`; Firefox → `"Firefox Sync"`, `"about:addons"`. Feature detection functions take the global object as a parameter so tests can pass stubs (`"Translator" in g`, `"showDirectoryPicker" in g`, `CSS.highlights` + `CSS.supports("text-decoration-line", "underline")` for highlight; the underline-in-::highlight check is refined in M5)

### 2. Tokenizer and LanguagePack (en)
- `tokenize` uses `Intl.Segmenter(lang, { granularity: "word" })`, keeps offsets, marks `isWordLike`; apostrophes inside words stay in the token ("don't", "teacher's")
- `createEnglishPack({ lemmas, freq, ipa, vocab })` wraps the M2 readers; `lemmas("Loaves")` → `["loaf"]`; unknown words → `[]`; `rank("the") === 1`
- Loader: `loadPack(lang)` fetches the M2 files once per service-worker lifetime (memoized promise). Test the memoization with a stub fetch

### 3. DictionaryProvider (en→ja)
- `short(term)`, `entry(term)` → `{ head, kind: "word" | "phrase", ipa?, short, senses: { pos?, text }[] }` via M2 `lookup` + `ipaFor`; phrases join base forms with spaces
- Tests on fixtures: dough, figure out, unknown word → `undefined`

### 4. Classifier
- Input: tokens of a block of text + a `TermIndex` (saved terms: `Map<key, status>`, where key is the base form or base forms joined by a space) + settings (`knownLevel`)
- Output: spans `{ start, end, key, kind, category }` where category is `learning | known | new | ignored`:
  - saved phrase matched on consecutive word tokens' base forms (longest match first; a phrase span suppresses the words inside it)
  - saved word → its status
  - unsaved word in the vocabulary: `known` if `rank <= knownLevel` (treated as known, not saved), else `new`
  - not in the vocabulary, numbers, single letters → `ignored`
- `unsavedKeys(spans)` → distinct keys with category `new` (what "save all" adds; frequency-known words are not counted)
- Tests: ferments → ferment classified via saved "ferment"; "figure out" phrase over "figured out" (base forms); level boundary (rank == level is known); phrase suppression; unsaved count dedupes

### 5. TermStore (Dexie, Browser Mode tests on real IndexedDB)
- Schema per the spec's data model. `terms` key `id` = `${lang}:${key}`; indexes on `status`, `updatedAt`. `sources` key `id` (hash of platform + normalized URL); `occurrences` auto-increment with compound index `[termId+sourceId+sentence]` and index `termId`. `meta` table for `lastExportAt`, `lastSavedAt`
- URL normalization: drop hash and tracking params (`utm_*`, `fbclid`, `gclid`); YouTube → `https://www.youtube.com/watch?v=<id>`; Netflix → `https://www.netflix.com/watch/<id>`
- API: `saveTerm({ lang, key, display, kind, status, source, sentence, translation?, pos })` (creates/updates term, upserts source, adds an `origin: "saved"` occurrence — a source is mandatory), `setStatus(id, status)`, `removeTerm(id)` (keeps a tombstone for sync), `recordEncounters(source, items[])` (only for saved terms; dedupe on term+source+sentence; keep the newest 50 per term), `saveAll(lang, keys[], status, source)` → `{ batchId, count }` (terms get `bulk: true`), `undoSaveAll(batchId)` (removes only terms that batch created), `counts(lang)` → `{ learning, known, phrases }`, `termIndex(lang)`, `occurrencesOf(termId)`, `exportJson()` / `importJson(json)` (merge by `updatedAt`, records `lastExportAt` on export)
- Tests cover each behavior, including the 50-occurrence cap and that Undo leaves previously saved terms alone

### 6. Sync codec (Node)
- Record line: `key \t statusCode \t updatedMinutesBase36` with status codes `l` (learning), `k` (known), `x` (tombstone); sorted by key; joined with `\n`; gzip via `CompressionStream("gzip")`; base64; split into chunks of at most 7,000 characters (`sync:<lang>:0..n`, plus `sync:<lang>:meta` = `{ chunks, updatedAt }`)
- `merge(local, remote)` per key: newer `updatedMinutes` wins; equal times keep local; tombstones win only when newer
- Capacity test: generate 20,000 realistic keys from `public/packs/en/freq.json`, assert total encoded size is under 100 KB and record the measured word count that fits in 100 KB in `docs/status.md`

### 7. BrowserSyncBackend
- `push(lang)`: encode from TermStore, write chunks + meta, remove stale chunks, record `lastSavedAt`; quota from `browser.storage.sync.QUOTA_BYTES` / `QUOTA_BYTES_PER_ITEM` when readable, else 102,400 / 8,192
- Before writing, if the encoded size exceeds 90% of the quota, drop `bulk` terms from the sync payload (oldest first) until it fits — they stay on this device. Expose `syncedCount`, `localOnlyCount`
- `pull(lang)`: read chunks, decode, merge into TermStore (apply remote wins, create missing terms with no source — sources and occurrences never sync)
- Listen to `browser.storage.onChanged` (area `sync`) for other devices' writes → pull. Debounce pushes (2 s) after local changes
- `status()` → `{ bytesUsed, quotaBytes, lastSavedAt }` for the popup and settings
- Tests with `fakeBrowser`: round trip between two simulated devices (two TermStores sharing one fake sync area), demotion when over 90%, tombstone propagation, signed-out behaves the same (no special case)

### 8. Messaging and background wiring
- Requests (discriminated union on `type`): `getSettings`, `setSettings(partial)`, `analyze({ lang, blocks: string[] })` → spans per block, `lookup({ lang, key })` → dictionary entry + saved status + occurrences (this source / elsewhere), `saveTerm`, `setStatus`, `removeTerm`, `recordEncounters`, `saveAll`, `undoSaveAll`, `counts`, `syncStatus`, `exportJson`, `importJson`
- `send(request)` in `src/messaging/client.ts` returns the typed response; errors come back as `{ error: string }` and are rethrown
- `src/entrypoints/background.ts` wires handlers, loads packs lazily, starts sync
- Tests: dispatcher routes each request type with a fake store (Node); one E2E smoke test that the content script on `article-en.html` gets spans back from the background

## Verification
`npm run check`, `npm test`, `VITEST_BROWSERS=chromium npm run test:browser`, build + `npm run test:manifest` (permissions unchanged: `storage` only — Dexie and storage.sync need nothing more), `npm run test:e2e`.
