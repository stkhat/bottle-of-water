# Architecture

MV3 / TypeScript / WXT + Preact, UI inside Shadow DOM. UI behaviour: [ui.md](ui.md); decisions and phases: [design.md](design.md).

## Parts
| Part | Role | Implementation |
|---|---|---|
| `LanguagePack` | Word segmentation (`Intl.Segmenter`), base forms, frequency rank, **IPA**, phrase patterns and the language's **phrase matcher** (slots, gaps, detect vs select) | `en`: inflection table, frequency list, IPA table and phrase list built from kaikki (Wiktionary) and EJDict; `es` (kaikki Spanish, Wiktionary Spanish frequency list) |
| `DictionaryProvider` | Short translation (hover) and details (meanings by part of speech), with the source each term came from | `en→ja`: EJDict-hand (public domain, bundled). EJDict has no part-of-speech labels: a sense is labeled only when kaikki lists a single part of speech for the word, or when the Japanese gloss's ending identifies one of the word's kaikki parts of speech; otherwise it is shown without a label; `es→en` from kaikki's English glosses; `en→es`, `en→pt` from recipes ("Language data") |
| `TranslationProvider` | Translating one subtitle line / sentence. Several implementations tried in order ("Choosing a translation") | ① the site's translated subtitles (from `PlatformAdapter`) ② the browser's built-in translator (Chrome: Translator API). If neither exists, no translation |
| `PlatformAdapter` | Get the video element, fetch and parse subtitle tracks (**including the native-language track**), seek, detect the end, detect navigation | YouTube / Netflix |
| `TermStore` | Store and sync terms, sources and occurrences | IndexedDB (Dexie) + `BrowserSyncBackend` + Export/Import |
| `BrowserEnv` | Browser names for UI text and feature detection | Chrome (Firefox values only need to build) |
| `PackSource` / `PackStore` | Where a pack's files come from, as the lock file says. `PackSource` reads a bundled pack with `runtime.getURL` and a downloaded one from `PackStore`; a pack not on the device fails the request with `packsUnavailable`, and pages wait for `packState`. `PackStore` fetches the lock's files from the mirrors in order, checks each against its SHA-256, keeps them in IndexedDB (`packFiles`, `packVersions`), switches a pack to a new version in one transaction and retries failures (1, 5, 30 min, then every 6 h) | Every pack bundled until the npm packages are published; then `es`, `es-en` and later packs downloaded from npm via jsDelivr, then unpkg (`en`, `en-ja`, `en-defs` stay bundled). The E2E build `check-download` downloads `es`, `es-en` from a local mirror |
| `Classifier` | Classify New / Learning / Known / ignored, match phrases, count unsaved words on a page | shared |
| `LookupUI` | Hover card, dictionary window, phrase saving, save all (popup "This page") | shared by text and video UI |

- Code layout: `src/core/` is browser-free logic (`lexicon/`: language packs, dictionaries, definitions, IPA; `packs/`: pack loading, the lock, pack states and pairs; `phrases/`, `subtitles/`, `sync/` codec and layout, `text/`, `classify.ts`, `settings.ts`, `url.ts`, `util.ts`). `src/background/` holds the stores and handlers. `src/messaging/` is what pages and the background share: `protocol.ts` (every message and wire type), `client.ts` (`send`), `storage.ts` (`watchSettings`, `watchPackState`)
- Where things run: a content script's IndexedDB belongs to the page's origin, so `TermStore`, `LanguagePack` and `DictionaryProvider` live in the **background** and content scripts / extension pages talk to it through typed messages. Pack data is read by the background in compact formats that reload quickly when the service worker restarts: bundled packs with `runtime.getURL` (not exposed as `web_accessible_resources`), downloaded packs from IndexedDB. Translating English definitions runs in the UI (content scripts, extension pages), since the Translator API does not exist in workers; the background keeps the results (`mtCache`)
- The UI on web pages sits in shadow roots: closed in production builds so page scripts cannot read it (it shows sentences kept from other sites), open in the check build and in development so tests and the developer can reach it. It acts only on events the user caused (`isTrusted`), not on events a page script dispatches: each shadow root drops untrusted UI events as they enter it (`guardShadowRoot`, `src/ui/from-user.ts`), and the handlers that open the dictionary or change a word check again
- IPA: EJDict-hand has no pronunciations, so the US IPA is taken from the `sounds` field of kaikki (English Wiktionary) and kept in the `LanguagePack`. Phrases show the IPA of their words joined together. Words without IPA hide the field. It is shown in dictionary style (`dictionaryIpa`): Wiktionary's syllable dots, tie bars, aspiration and diacritics are dropped, and ɹ/ɚ/ɝ/ɫ are written r/ər/ɜːr/l. It is set in Noto Sans where installed, else the system UI font, so every IPA letter comes from one font
- Getting video and text
  - **YouTube:** hook fetch/XHR in the page (MAIN world) and receive the `/api/timedtext` (json3) responses the player itself requests
  - **Netflix:** hook `JSON.parse` in the page to read subtitle track URLs from the manifest, then parse TTML/WebVTT. Seek through Netflix's player API
  - Sync with subtitles via `requestVideoFrameCallback` + binary search over cues. Detect the video end with the `ended` event
  - Code: `src/content/video/youtube/` and `netflix/`, each a MAIN-world `page.ts` (no dependencies), its `messages.ts` and the `adapter.ts` (`PlatformAdapter`). Both talk over `page-channel.ts` (`postMessage` to the page's own origin, shapes checked on both sides); `adapter-kit.ts` and `recent.ts` hold what the adapters share
  - Detect the end of an article with an IntersectionObserver on the last element of the body

## Language data
Research behind these choices (coverage per language, hosting alternatives, review findings): [notes/language-data-research.md](../notes/language-data-research.md).

| Unit | Contents | How many |
|---|---|---|
| Learning-language pack `<L>` | lemmas, frequency, IPA, parts of speech, vocabulary, phrase patterns | one per learning language, shared by every native language |
| Pair dictionary `<L>-<N>` | words and phrases under the same keys (a phrase's key is its pattern, e.g. `make up one's mind`), one source tag per term | one per pair |
| English definitions `<L>-en` (`en-defs`, `es-en`) | Wiktionary's English definitions of L's words and phrases | the pair dictionary when N = en, the last fallback otherwise |

- Pair pack format (`<L>-<N>/dict-<n>.json` + `index.json`): `{ term: [short, [pos, text, hint?][], source] }`; `source` indexes `index.json`'s `sources`, `hint` is a translation table's English sense. `en-ja` keeps EJDict's format. Every file stays under 4 MB (AMO rejects text files over 5 MB)

### Distribution
- A lock file bundled with the extension (`src/core/packs/packs.lock.json`, written by `npm run data:publish`) lists per pack its npm package, version, data `format`, whether it is bundled, and its files with size and SHA-256, plus the mirrors and the offered pairs. Data fixes ship with an extension release
- Downloaded packs: one npm package per pack in a public data repository, fetched from jsDelivr, then unpkg (both `Access-Control-Allow-Origin: *`, so no host permissions). Each file is checked against the lock's SHA-256 and stored in IndexedDB, one row per file (`packFiles`, `packVersions`). A new version is fetched beside the old one (stored hashes are skipped), switched in one transaction, then unreferenced files are deleted. A download stopped with the service worker resumes; retries go through `alarms` (1, 5, 30 min, then every 6 h)
- Fetched when a pair is chosen in Settings, when synced settings name a pair whose packs are missing, and when the lock changes. A stored version in an older `format` is not used. Packs of a pair no longer chosen stay until removed in Settings
- Without the data: requests that need a missing pack fail with `packsUnavailable`; the packs' state lives in `storage.local` (`packState`), which pages and Settings watch, and pages analyze again once it is ready
- **Hosting is not set up yet** (user, 2026-11-11): every pack is bundled; `en`, `en-ja`, `en-defs` stay bundled, the rest move to downloads with `npm run data:publish -- --download …` and a release. The E2E build `check-download` downloads `es`, `es-en` from a local mirror

### Native meanings and the quality gate
- Each pair has a build recipe (`scripts/data/recipes/`) merging sources in order; **per term, the first source that has it supplies all of it**: a bilingual dictionary (EJDict for en→ja), the native language's Wiktionary edition, English Wiktionary's translation tables. No pivoting through English at build time
- Terms no source has fall back to `<L>-en`, translated at display time (below); without a translator the English shows
- **Quality gate**: a pair is offered only when the human-made sources give a meaning for ≥ 95% of L's 5,000 most frequent content words (function words, contractions, letters and names not counted; user, 2026-11-11). `npm run data:stats` reports and checks it; `npm run data:publish` writes the passing pairs into the lock, which Settings reads
- Not used: ECDICT (its Chinese sources cannot be traced), build-time machine translation (the API's terms and output rights are unclear). zh is left for later (91.2%; the zh edition writes Traditional characters)

### Phrase patterns
- A pattern is words and slots (`one's`, `someone`, `something`, `oneself`; Spanish `alguien`, `algo`) with flags `detect` (automatic highlighting) and `gap` (words may come between parts, as in phrasal verbs). A pattern's word matches a token's written form or any base form, so keys keep Wiktionary's wording
- Each language's phrase matcher (`LanguagePack`) fills slots (English possessives → `one's`, object pronouns → `someone` / `something`, reflexives → `oneself`) and applies the gap rule
- Detect mode (highlighting): contiguous `detect` patterns without slots; saved phrases also match with slots and gaps. Select mode (a selection): every pattern; the one covering the most selected words wins, and the sentence decides when the selection is part of a longer pattern
- A phrase with a gap becomes one span per contiguous part (same key, part number); words in the gap keep their own spans. A selection is saved under its pattern's key

### Definitions translated at display time
- The English definition is translated, not the phrase ("spill the beans" → "To reveal a secret." → 秘密を漏らす). Leading labels are dropped; pointer senses ("Alternative form of …") stay English
- The Translator API does not exist in workers, so the UI translates and the background caches the results (`mtCache`, keyed by L, N and the cleaned text; 20,000 rows, least recently used out; cleared with the pair's packs; device only). Whether it can run is detected in the UI
- The hover card translates the first sense, the dictionary window up to four. One queue per page with the subtitle translator: current subtitle line, then the window, then the hover card. Lists use cached translations only
- Creating a translator for a pair Chrome still has to download needs a user gesture: Settings starts it when a pair is chosen, the dictionary window when it opens; hover cards show English until then

### Licenses
- Only public-domain, MIT or CC BY-SA data whose sources can be traced. Wiktionary-derived packs are CC BY-SA 4.0; About and `THIRD_PARTY_NOTICES.md` list each source per pack

### Data sources
Scripts in `scripts/data/` download raw files into `data/raw/` (git-ignored) and write the processed packs, which are committed: always-bundled packs in `public/packs/<pack>/` (read with `runtime.getURL`, not `web_accessible_resources`), downloadable ones in `data/packs/<pack>/` (a build hook copies them in while the lock says bundled). `npm run data:publish` also writes npm package folders to `data/publish/<pack>/` (git-ignored; `npm publish` by hand).

| File | Source | Used for |
|---|---|---|
| EJDict-hand `src/*.txt` | github.com/kujirahand/EJDict (pinned commit) | en→ja translations, English phrase list |
| kaikki English JSONL (~3.4 GB, streamed) | kaikki.org/dictionary/English/ | inflections, US IPA, parts of speech, phrases, Japanese translations, English definitions, translation tables |
| kaikki Spanish JSONL (~1.1 GB) | kaikki.org/dictionary/Spanish/ | Spanish inflections, IPA, English glosses |
| kaikki es / pt Wiktionary editions | kaikki.org | en→es, en→pt meanings |
| Frequency lists | Wiktionary "Frequency lists/TV/2006" (en), "Frequency lists/Spanish/Mixed 730K" (es) | frequency rank |

## Choosing a translation
Use the site's translation when it has one; fall back to the browser's built-in translator only when it doesn't. Site translations are often human-made and need no on-device processing.

| Order | Source | YouTube | Netflix | Articles |
|---|---|---|---|---|
| 1 | The site's **native-language subtitle track** (human-made) | manually added Japanese subtitles | Japanese subtitles | — |
| 2 | The site's **machine translation** | auto-translation of the original subtitles (fetched with `tlang=ja`) | — | — |
| 3 | **The browser's built-in translator** | Translator API | Translator API | Translator API |
| — | none | no translation | no translation | no translation |

- Pick one per video and never switch midway. When a video uses the site's translation, lines without a translation are not filled in by the built-in translator (meanings would overlap and the phrasing would clash)
- **Timing**: a site's native-language track has different line breaks and timestamps from the original (especially Japanese subtitles on Netflix)
  - Subtitle translation: look up the translation track separately by playback position and show the translation on screen at that moment as is
  - Transcript cards: assign each translated cue to the card (sentence) it overlaps most in time (ties to the earlier card); join them if several land on one card. A spoken line goes to a sound-label card only when it overlaps no other card
  - YouTube's auto-translation of a manual track comes back with the same breaks as the original, so map it one to one; for an auto-generated track the cards come from its sentences (see "Transcript")
- The occurrence's `translation` stores the translation shown at that time
- Articles have no site translation, so only the built-in translator is used

## Data model (IndexedDB)
- One Dexie schema version (4). Versions 1–3 only added tables and were merged into it (2026-11-12); Dexie upgrades an older database by comparing the schemas
- `terms`: `{id: "en:look up", lang, key (base form or sequence of base forms), display, kind: word|phrase, status: learning|known, bulk?: bool, note?, createdAt, updatedAt}`
  - Words saved by "save all" (Mark as Known at the end) get `bulk: true` (for demotion when sync space runs out)
- `sources`: `{id, platform: youtube|netflix|web, url (normalized), title, lang, firstSeen, lastSeen}`
- `occurrences`: `{termId, sourceId, sentence, translation?, pos: {timeMs}|{textQuote}, seenAt, origin: saved|encountered}`
  - Saving always creates one source record
- Sentence history (device only: never synced, not in the JSON export)
  - `historyPages`: `{id (= source id), platform, url (normalized), host, title, lang, firstSeen, lastSeen, bytes}`
  - `historySentences`: `{pageId, text, translation?, pos, keys: termId[], seenAt}`, unique per page and text, indexed by `keys` (every base form of each word outside the 300 most common, plus the phrases found in the sentence)
  - Articles keep the sentences of the blocks Lingo analyzes; videos keep **played lines only**. Not kept while the switch is off or on hosts in "Never run on" / switched off in the popup; adding a host to "Never run on" removes its pages. Size is counted by Lingo (UTF-16 size of the strings plus a fixed overhead); over 50 MB, the oldest pages (`lastSeen`) are removed until under 45 MB
  - Saving a word (not "save all") copies its kept sentences into its occurrences (`origin: encountered`, up to 50)
  - Meeting a saved word again records it automatically (deduplicated by source + sentence, at most 50 per word; the oldest encounters go first, the sentences the word was saved from always stay)
  - YouTube links use `&t=` to jump to the spot
  - Only pages/videos opened with the extension on are recorded
- Settings live in storage.sync: language pair, interface language, frequency level, highlight categories, external dictionaries on/off, subtitle position, translation visibility (subtitle / transcript), subtitle text size and background, what to do with unsaved New words at the end, per-site on/off and the exclusion list, and the L button's on/off per video platform

## Sync (browser `storage.sync`; limits: ~100 KB total, 512 items, ~8 KB per item)
- `BrowserSyncBackend` (background) owns it. A backend for the user's own cloud (future) would sit beside it; no interface is kept for it until then
- The limits are the same in Chrome and Firefox. Use the `storage.sync` constants (`QUOTA_BYTES` etc.) when readable at runtime, otherwise the values above
- Per language, sort `term key → status code + updated time (minutes in base36)`, concatenate, gzip (CompressionStream) + base64, and store in chunks of ~7 KB
- **Rough capacity**
  - Uncompressed: **~6,000 words**
  - Compressed: **~12,400 words** (English, measured 2026-11-09 with realistic save times; 20,000 words take ~170 KB)
  - Words within the frequency level do not count
  - When the limit gets close, demote words saved by "save all" to "this device only"
  - Over 90% of the room left by other keys (settings, other languages): leave out "save all" words oldest first; if that is not enough, leave out the oldest known words too and report how many. They stay on the device
- Merge: per word, the newer update time wins (same minute: keep this device's); deletions are tombstones, carried for 90 days. Pick up other devices' changes with `storage.onChanged`
- Each push reads and merges the synced copy before writing it (chunks first, then `sync:<lang>:meta` = `{chunks, updatedAt, v}`, then stale chunks are removed), 2 s after the last local change. Pulled changes are not pushed back unless this device has newer ones. Storage errors (quota, write rate) show in the status and are retried with backoff
- Sources and occurrences stay on the device. JSON export/import moves all data

### When the browser is not signed in / sync is off
- `storage.sync` does not fail; it just stores locally (behaves like `storage.local`). The quota still applies, so demotion near the limit works the same
- If the user signs in and turns on sync later, data merges with other devices by per-word update time. Nothing special is needed
- The extension has no reliable way to know whether data reaches other devices (`set()` succeeds once written locally)
  - So the UI never claims "synced"; it shows **only the last saved time and usage**
  - Do not request the permission for checking sign-in (`identity.email`). It adds an install warning and still cannot tell whether sync is on
- Users without sync lose everything when they change devices or remove the extension (removing it also deletes IndexedDB). JSON export is the safeguard, so Settings "Backup file" shows the last export time

### Sync differences by browser
| | Chrome | Firefox |
|---|---|---|
| Sync target | Google account | Mozilla account (stored encrypted) |
| User requirement | signed in with sync on | signed in, with "Add-ons" on in sync options |
| Delay | almost immediate | about every 10 minutes, or "Sync now" |
| Other | — | `browser_specific_settings.gecko.id` is required in the manifest (without it `storage.sync` does not work). Not synced on Android |

- The sync name ("Chrome sync", "Firefox Sync") comes from `BrowserEnv`. Saving and merging do not differ by browser

### (Future TODO) Sync to the user's own cloud storage: possible, no developer server needed
- A second backend storing all data (including sources and occurrences) as one JSON file per language, merged by per-word update time like `storage.sync`
- Auth: `identity.launchWebAuthFlow` + PKCE, available in every browser (`chrome.identity.getAuthToken` exists only in Chromium browsers, so do not depend on it). Redirect URLs differ per browser, so register one per browser with each service
- **Google Drive**: store in the app-only folder with the `drive.appdata` scope. Needs an OAuth client registered in Google Cloud. To check: whether `launchWebAuthFlow` works without a client secret, and whether publishing needs OAuth consent screen review (if not workable, use `getAuthToken` in Chrome only)
- **Dropbox / OneDrive**: PKCE auth, no client secret or server. Store in the app folder
- **Local folder**: write into a folder such as iCloud Drive via the File System Access API and let that folder sync. **Offered only in browsers that have the API (Chromium)**
- **WebDAV** (Nextcloud etc.): the user enters a URL and credentials

## Interface language
- The extension `i18n` API follows the browser's language and cannot be chosen by the user, so use a small custom mechanism: every UI string goes through `t("key")` with one file per language (`locales/en.json`). Switch with the `uiLocale` setting, default `en`
- Only the store name and description use `_locales/en/messages.json` (the `i18n` API)
- The interface language is a separate setting from the dictionary/translation languages (learning and native)
- Strings containing a browser name ("Chrome sync") are not written into the locale file; insert `BrowserEnv` values with `t("key", { syncName })`

## Browser differences (Firefox and others)
Only the Chrome version is published, but the structure must not need rewriting when other browsers follow.

### Principles
1. Call extension APIs through WXT's `browser` (`wxt/browser`). Never use `chrome.*` directly in code
2. Features that exist only in some browsers always sit behind a part (`TranslationProvider`, `PlatformAdapter`, …) and are **detected by whether the feature exists**, never by browser name or user agent
3. When a feature is missing, hide everything related to it (no grayed-out controls, no permanent "not available in this browser")
4. Strings containing a browser name come from `BrowserEnv`
5. WXT generates the manifest per browser. Firefox gets `browser_specific_settings.gecko.id`, and its background is an event page (`background.scripts`) instead of a service worker
6. Verify only that the Firefox build succeeds (no behavior guarantee, not published)

### What `BrowserEnv` holds
- Browser name and sync name (Chrome sync / Firefox Sync) for UI text
- Features detected where `BrowserEnv` is built (built-in AI, File System Access API). The translator is detected in the UI, where it runs: it never exists in the service worker
- Add a field only when code reads it

### Chrome vs Firefox
| Feature | Chrome | Firefox | Handling |
|---|---|---|---|
| Browser sync (`storage.sync`) | Google account | Mozilla account (~every 10 min) | Same code. Only the name comes from `BrowserEnv` |
| Subtitle/sentence translation | Translator API (138+) | none (Mozilla opposes it) | Every browser uses the site's translation first, so only the third fallback differs. In Firefox, videos without a site translation and articles get no translation. Whether Firefox has a translation API for extensions is to be investigated |
| Translating English definitions | Translator API, in the UI | none | Firefox shows the English definition as it is. Detected where the translation runs (the UI), not in the background |
| Downloaded language data | IndexedDB in the background | IndexedDB in the event page | Same code. Cache Storage is not used (Firefox allows it on `moz-extension:` only behind a pref) |
| Built-in AI (phase 3) | Prompt API | none | Only the user's own API key |
| Article highlights (CSS Custom Highlight API) | available | available from 140, but at release **without underline (`text-decoration`) support** | Without underlines use background colors only (New = pale blue, Learning = pale green, Known = pale gray; colors to tune). Current support and detection method to be confirmed. Video subtitles are drawn with our own elements, so unaffected |
| DOM work in the background | offscreen document | the event page has a DOM | not needed so far |
| Page (MAIN world) scripts | available | from 128 | decide the minimum version |
| Saving to a folder (File System Access API) | available | none | not offered |
| OAuth (future cloud sync) | `getAuthToken` / `launchWebAuthFlow` | `launchWebAuthFlow` only | standardize on `launchWebAuthFlow` |

- `Intl.Segmenter`, `caretPositionFromPoint`, `requestVideoFrameCallback`, `CompressionStream` and `speechSynthesis` exist in recent Firefox too. Confirm minimum versions during implementation
- To confirm: whether Firefox MV3 grants host permissions listed in the manifest at install time or requires user consent

### Other browsers
- **Edge**: Chromium, so the Chrome version ships almost as is. Syncs to a Microsoft account. Built-in translation/AI to be confirmed
- **Safari**: to be investigated (packaging with Xcode, whether `storage.sync` syncs across devices)

## Publishing
- Chrome Web Store, addons.mozilla.org (AMO) for Firefox, Edge Add-ons for Edge
- AMO reviews built and minified code, so source code and build instructions must be submitted

## Chrome Web Store requirements (checked 2026-11-09)
No outright blocker. Decisions and requirements:
- **Subtitles (decided)**: keep YouTube and Netflix. Subtitle tracks are processed in memory; what is stored is the sentence in which a saved word appears (as an occurrence) and, while Sentence history is on, the lines that actually played (on the device only). Policy risk: "do not facilitate unauthorized access to content" / copyrighted content. Language Reactor does the same on the store. Prepare a written justification for review
- **Host access (decided)**: keep the content script on all sites (`<all_urls>`), accepting an in-depth review (can take weeks). Write a justification (article highlighting on any page the user reads)
- **Sentence history (decided)**: on by default, as in the mock. Browsing activity may be collected only for a user-facing feature described prominently in the store listing and in the UI, so the listing and Settings must describe it clearly, and it stays on the device
- **Privacy policy (required)**: any extension that handles user data needs a privacy policy URL, even when data stays on the device. Recorded sources (URL, title) and sentences count as user data. Disclose: what is stored locally, that word status goes through the browser's sync, that nothing is sent to the developer. Include the Limited Use compliance statement. Host it somewhere public without a server (e.g. GitHub Pages; this repo is private, so a separate public page is needed)
- **2026 policy update (in force since 2026-08-01)**: data collected must be necessary for the single purpose and prominently disclosed
- **Code**: no remotely hosted code (everything bundled, including the MAIN-world scripts); no obfuscation (minification is fine). Hooking page fetch/XHR/`JSON.parse` is not prohibited but needs a justification
- **Downloaded language data**: data, not code, so allowed. Packs are JSON read with `JSON.parse`, verified against hashes bundled with the extension. The privacy policy names the hosts (jsDelivr, unpkg), says they see the IP address and which packs were fetched, and that no page content or words are sent
- **Single purpose**: "learn vocabulary on the videos and articles you read" — keep every feature framed around it
- **Listing**: icon, screenshots and a description are mandatory; no keyword lists ("YouTube Netflix …"); "works with YouTube and Netflix" wording only, no third-party logos
- **Account**: 2-Step Verification; trader / non-trader declaration (EU DSA) — the user decides before publishing
