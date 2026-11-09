# Language-learning browser extension — design spec

## UI mock (canonical)
- **UI mock: https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS** (Claude Design, private, owner only)
  - `YouTube — extension ON`: video page
  - `Web article — highlights and phrase saving`: article page
  - `Opening Lingo from the browser toolbar`: toolbar popup and how to open settings
  - `Settings page`: settings page
- **When this spec and the mock disagree, the mock wins.** UI details (layout, copy, colors, defaults) live in the mock; this spec records only the decisions behind them.
- Working name of the extension: **Lingo**.

## Context
A browser extension (Chrome first) that turns the videos (YouTube / Netflix) and articles you already like into study material, right on the page. The video UI takes cues from Language Reactor (LR below); article highlighting takes cues from Relingo.
Differentiators: highlights by category (New / Learning / Known), saving phrases, and recording each word's source and where it shows up again.
**Constraint:** the extension will be public, and **the developer runs no servers at all**. Data stays on the user's device and in the user's own browser sync (a Google account in Chrome, a Mozilla account in Firefox).
**Scope:** do not copy every LR feature; keep to the basics.
Development pair: learning language = English, native language = Japanese, sites = YouTube and Netflix. More language pairs and sites are added later by plugging in new parts.

## Decisions
- Build a generic multi-language structure from the start (phase 1 implements en→ja only)
- The role of a web app is undecided → start with **pages inside the extension** (word list, settings); a standalone site can come later
- Phase 1 ships **both the text UI and the video UI, each minimal**
- Storage has **two layers**: IndexedDB (all data) + `storage.sync` (browser sync, status only) + JSON export
- **Target browsers**: phase 1 publishes Chrome only, but the code is browser-neutral from day one so Firefox, Edge and others can follow (see "Absorbing browser differences")
- "New" is decided by **a frequency level (the top N words count as known) + saving a whole page at once**
- Every saved word **always has a source**, and you can see **whether a saved word appeared elsewhere**
- The UI is **English only** for now, built so it can be switched later
- Colors: **white background + dark navy text + green accent**, the same across video, article, popup and settings (Grammarly-like, but not identical)

## UI spec (follows the mock)

### Shared: highlights
- Categories and looks: **Learning** = pale green background + green underline, **New** = blue underline, **Known** = gray underline
- Each category can be turned on/off; **by default only Learning is on**
- When subtitles are drawn over the video, the same category colors are brightened so they read on dark backgrounds
- Inflected forms are matched to the base form (ferments → ferment, loaves → loaf)

### Shared: hover card
- Kind (Word / Phrase) and current status
- Headword, **IPA (always shown when available)**, short translation, extra notes (etymology, related words, pronunciation notes)
- Buttons: "+ Learning", "Known"
- For phrases, a saved phrase that matches is shown (automatic detection of dictionary phrases is phase 2)
- EJDict has almost no phrasal verbs or idioms (no "figure out", "from scratch"). When a phrase is not in the bundled dictionary, its short translation comes from the browser's built-in translator (`TranslationProvider`); if that is unavailable too, the translation line is left out

### Shared: dictionary window (opens when a word is clicked)
- **A popup window floating over the page.** It can be dragged by its handle and closed with ×. It is not a fixed column
  - Video: a window over the page (when subtitles are inside the video, placed so it does not cover them)
  - Article: a panel floating on the right side of the screen
- Contents
  - Headword, kind, pronunciation playback (`speechSynthesis`), **IPA**, notes, short translation
  - Status buttons: Learning / Known / Remove ("Not saved" when unsaved)
  - Meanings by part of speech
  - External dictionary links: Cambridge / Wiktionary / Reverso / WordReference (each can be turned on/off in settings; **users cannot add their own dictionary URLs**)
  - "In this video" / "On this page": other occurrences in the same video or page (with timestamps for videos; clicking seeks there)
  - "Seen elsewhere": occurrences in other sources. For unsaved words, explain that saving starts recording
- **No "Ask AI" button (links to ChatGPT / Claude) in phase 1**

### Video UI (YouTube / Netflix)
- **Two columns**: video on the left, transcript (subtitle cards) on the right. The dictionary is the popup window above
- **Subtitle position is selectable**: "In video" (overlaid on the video, default) / "Below video" (a large box under the video)
- **Translation visibility is set separately for the subtitle and the transcript** (both shown by default)
- **Prefer translations provided by the site** (order in "Choosing a translation"). Where a translation came from is not shown
- **Two buttons in the player bar**, grouped in **one green outline** so they are not confused with YouTube's own gear
  - **L button**: one click turns Lingo on/off (when off: dotted outline + strikethrough)
  - **Up arrow (^) button**: opens the Lingo menu (no gear icon)
    - Current state (On / Off for this video)
    - Subtitle position (In video / Below video)
    - Show/hide the subtitle translation
    - "Open all settings" (settings page)
- Transcript
  - Each card shows the original with the translation below it. The playing card is emphasized and auto-scrolled; clicking a card seeks there
  - Header: "Highlight" category toggles and the transcript translation switch
- No instructions text under the video
- **When the video ends**, a "Video finished" card appears top right (same content as "Save all" below)

### Article UI (content script)
- Detect the page language (`<html lang>` → `i18n.detectLanguage`) and run only when it matches the learning language
- Color by category with the **CSS Custom Highlight API** (no DOM rewriting). Process only the visible range, progressively, and follow page changes with a MutationObserver
  - In browsers where highlights cannot be underlined, use background colors only (see "Absorbing browser differences")
- Find the hovered word with `caretPositionFromPoint`
- When several words are selected, snap the range to word boundaries and show a bar with "Save "…" as a phrase" and "+ Learning / Known"
- A small card at the top right shows Lingo's state and highlight toggles
- **When the reader scrolls to the end of the article**, a "You reached the end" card appears in that card's place (same content as "Save all"; closing it with × brings back the original card)

### Save all (save every unsaved word on the page at once)
- Target: words on the page/video that are **not saved yet** (saved words keep their status; words within the frequency level are not counted)
- Actions: "Add all to Learning", "Mark all as Known". Afterwards show the count and **Undo**
- The explanation is not shown by default; **only when the (i) button is pressed**
- Where it appears
  1. The "This page" section of the toolbar popup (always)
  2. The top-right card when a video ends / the reader reaches the end of an article (**on/off in settings, on by default**)

### Toolbar popup (click the extension icon)
- Header: Lingo, language pair (English → Japanese), gear for settings
- "On this site": on/off for this site
- "Highlight": category toggles
- Word counts: Learning / Known / Phrases
- "This page": save all (above)
- Sync status: last saved time and usage (e.g. "Saved to Chrome sync · 2 min ago", "41 KB of 100 KB used")
  - The extension cannot tell whether data reached other devices, so it never says "synced"
  - The "Chrome sync" part follows the browser ("Firefox Sync" in Firefox)
- Footer: "Word list", "Settings"

### Settings page (the extension's options page, opens in a new tab)
- Three ways to open it: ① "Settings" / gear in the toolbar popup, ② right-click the extension icon → "Options", ③ chrome://extensions → Lingo "Details" → "Extension options" (Firefox: about:addons → Lingo → "Options"; the wording follows the browser). Also from "Open all settings" in the menu next to L in the video player bar
- Sections
  - **Languages**: learning language, native language, interface language (English only for now)
  - **New-word level**: slider "Treat the N most common words as known" (1,000–20,000, default 3,000)
  - **Highlighting**: on/off per category, "Offer to save the rest when you finish" (the end card, default on)
  - **Dictionaries and AI**: on/off for the four external dictionaries. "AI explanations inside the window" shows Coming later (the mention of "Chrome's built-in AI" is hidden in browsers without built-in AI, leaving only "your own API key")
  - **Video subtitles**: subtitle position (In video / Below video), subtitle translation, transcript translation
  - **Sites**: on/off for YouTube / Netflix / other articles, and a "Never run on" list
  - **Sync and backup**
    - Browser sync switch ("Sync word status with Chrome sync"; the name follows the browser). The description explains that data reaches other devices when the user is signed in to the browser with sync on
    - Usage and last saved time ("Last saved …", never "Last synced")
    - JSON Export / Import. The description shows **when the last export happened** ("Last export: …")
    - "Your own cloud storage" shows Coming later
  - **About**: version, data license notices

### Word list page (a page inside the extension; mock `Word list page`, awaiting review)
- Opens in a new tab from "Word list" in the toolbar popup
- Header: Lingo, "Word list", language pair, **Export / Import** (the same JSON as in Settings)
- Filters: search (words and meanings), status (All / Learning / Known), kind (All / Words / Phrases), sort (Recently seen / A–Z / Most seen)
- List columns: Word (with a Phrase tag), Meaning, Status, Seen (number of occurrences), Last seen
- Selecting a row shows a details panel on the right: headword, kind, pronunciation playback, IPA, short translation, status buttons (Learning / Known / Remove), and "Where you saw it · N" (each occurrence with its source, time or date, the sentence, and a link back to the spot; the occurrence where it was saved is marked "Saved here")

### Phase 2 screens (mock, awaiting review)
- **Words in this video** (mock `Phase 2 — words in this video`): the right column gets two tabs, Transcript / Words. Words lists the words and phrases in the video in order of first appearance, each with its highlight, short translation and how many times it occurs (e.g. 3×). Filter chips All / New / Learning / Known with counts. Selecting a word opens the dictionary window with its "In this video" list
- **Fullscreen** (mock `Phase 2 — fullscreen video`): in the player's fullscreen the subtitle and translation stay over the video (larger), hover cards and the dictionary window work, and the L button and ^ menu stay in the player bar. The transcript column is not shown. The subtitle position choice does not apply (always in the video), so the ^ menu shows only the translation switch and "Open all settings"
- **Past occurrences of unsaved words** (mock `Phase 2 — past occurrences of unsaved words`)
  - The dictionary window shows "Seen elsewhere · N" for unsaved words too, from the local sentence history. When the word is saved, those occurrences become part of its history
  - Settings gets a **Sentence history** section: "Keep sentence history" switch (on by default; never synced; Never run on sites are not kept), space used with a bar (cap 50 MB; the oldest pages are removed first), the number of pages and videos, and "Clear" (saved words and their sources stay)

## Architecture (MV3 / TypeScript / WXT + Preact, UI inside Shadow DOM)

| Part | Role | Phase 1 implementation |
|---|---|---|
| `LanguagePack` | Word segmentation (`Intl.Segmenter`), base forms, frequency rank, **IPA** | `en`: inflection table, frequency list and IPA table built from kaikki (Wiktionary) |
| `DictionaryProvider` | Short translation (hover) and details (meanings by part of speech) | `en→ja`: EJDict-hand (public domain, bundled). EJDict has no part-of-speech labels: a sense is labeled only when kaikki lists a single part of speech for the word, or when the Japanese gloss's ending identifies one of the word's kaikki parts of speech; otherwise it is shown without a label |
| `TranslationProvider` | Translating one subtitle line / sentence. Several implementations tried in order ("Choosing a translation") | ① the site's translated subtitles (from `PlatformAdapter`) ② the browser's built-in translator (Chrome: Translator API). If neither exists, no translation |
| `PlatformAdapter` | Get the video element, fetch and parse subtitle tracks (**including the native-language track**), seek, detect the end, detect navigation | YouTube / Netflix |
| `TermStore` | Store and sync terms, sources and occurrences | IndexedDB (Dexie) + `SyncBackend` (`BrowserSyncBackend`) + Export/Import |
| `BrowserEnv` | Browser differences in one place: browser name, sync name and delay, how to open the settings page, feature detection results | Chrome (Firefox values only need to build) |
| `Classifier` | Classify New / Learning / Known / ignored, match phrases, count unsaved words on a page | shared |
| `LookupUI` | Hover card, dictionary window, phrase saving, save-all card | shared by text and video UI |

- Where things run: a content script's IndexedDB belongs to the page's origin, so `TermStore`, `LanguagePack` and `DictionaryProvider` live in the **background** and content scripts / extension pages talk to it through typed messages. Pack data is bundled with the extension and read by the background with `runtime.getURL` (not exposed as `web_accessible_resources`), in compact formats that reload quickly when the service worker restarts
- IPA: EJDict-hand has no pronunciations, so the US IPA is taken from the `sounds` field of kaikki (English Wiktionary) and kept in the `LanguagePack`. Phrases show the IPA of their words joined together. Words without IPA hide the field
- Getting video and text
  - **YouTube:** hook fetch/XHR in the page (MAIN world) and receive the `/api/timedtext` (json3) responses the player itself requests
  - **Netflix:** hook `JSON.parse` in the page to read subtitle track URLs from the manifest, then parse TTML/WebVTT. Seek through Netflix's player API
  - Sync with subtitles via `requestVideoFrameCallback` + binary search over cues. Detect the video end with the `ended` event
  - Detect the end of an article with an IntersectionObserver on the last element of the body

### Data sources
Import scripts in `scripts/data/` download raw files into `data/raw/` (git-ignored) and write small processed files into `public/packs/<lang>/` (copied into the build and read by the background with `runtime.getURL`), which are committed. Notices go in About and `THIRD_PARTY_NOTICES.md`.

| File | Source | Size | Used for |
|---|---|---|---|
| EJDict-hand `src/*.txt` (26 files) | github.com/kujirahand/EJDict (pinned commit) | ~5 MB total | en→ja translations, English phrase list |
| kaikki English JSONL | kaikki.org/dictionary/English/ | ~3.4 GB (streamed; only processed output is kept) | inflection → base form, US IPA, phrases |
| kaikki Spanish JSONL | kaikki.org/dictionary/Spanish/ | ~1.1 GB | Spanish inflections, IPA, English glosses (phase 2) |
| Frequency lists | Wiktionary "Frequency lists/TV/2006" (en, 41k words from TV and movie scripts) and "Frequency lists/Spanish/Mixed 730K" (es); CC BY-SA | < 1 MB each | frequency rank |

### Choosing a translation
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
  - Transcript cards: assign each translated cue to the original card it overlaps most in time; join them if several land on one card
  - YouTube's auto-translation comes back with the same breaks as the original, so map it one to one
- The occurrence's `translation` stores the translation shown at that time
- Articles have no site translation, so only the built-in translator is used

### Data model (IndexedDB)
- `terms`: `{id: "en:look up", lang, key (base form or sequence of base forms), display, kind: word|phrase, status: learning|known, bulk?: bool, note?, createdAt, updatedAt}`
  - Words saved by "save all" get `bulk: true` (for Undo, and for demotion when sync space runs out)
- `sources`: `{id, platform: youtube|netflix|web, url (normalized), title, lang, firstSeen, lastSeen}`
- `occurrences`: `{termId, sourceId, sentence, translation?, pos: {timeMs}|{textQuote}, seenAt, origin: saved|encountered}`
  - Saving always creates one source record
  - Meeting a saved word again records it automatically (deduplicated by source + sentence, at most 50 per word; the oldest encounters go first, the sentences the word was saved from always stay)
  - YouTube links use `&t=` to jump to the spot
  - Only pages/videos opened with the extension on are recorded
- Settings live in storage.sync: language pair, interface language, frequency level, highlight categories, external dictionaries on/off, subtitle position, translation visibility (subtitle / transcript), end card on/off, per-site on/off and the exclusion list

### Sync (browser `storage.sync`; limits: ~100 KB total, 512 items, ~8 KB per item)
- `BrowserSyncBackend` is one implementation of a `SyncBackend` part (`push / pull / status / start / stop`). The user's own cloud storage, added later, is another implementation of the same part
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

#### When the browser is not signed in / sync is off
- `storage.sync` does not fail; it just stores locally (behaves like `storage.local`). The quota still applies, so demotion near the limit works the same
- If the user signs in and turns on sync later, data merges with other devices by per-word update time. Nothing special is needed
- The extension has no reliable way to know whether data reaches other devices (`set()` succeeds once written locally)
  - So the UI never claims "synced"; it shows **only the last saved time and usage**
  - Do not request the permission for checking sign-in (`identity.email`). It adds an install warning and still cannot tell whether sync is on
- Users without sync lose everything when they change devices or remove the extension (removing it also deletes IndexedDB). JSON export is the safeguard, so Settings "Backup file" shows the last export time

#### Sync differences by browser
| | Chrome | Firefox |
|---|---|---|
| Sync target | Google account | Mozilla account (stored encrypted) |
| User requirement | signed in with sync on | signed in, with "Add-ons" on in sync options |
| Delay | almost immediate | about every 10 minutes, or "Sync now" |
| Other | — | `browser_specific_settings.gecko.id` is required in the manifest (without it `storage.sync` does not work). Not synced on Android |

- The sync name ("Chrome sync", "Firefox Sync") and delay come from `BrowserEnv`. Saving and merging do not differ by browser

#### (Future TODO) Sync to the user's own cloud storage: possible, no developer server needed
- Another `SyncBackend` implementation storing all data (including sources and occurrences) as one JSON file per language, merged by per-word update time like `storage.sync`
- Auth: `identity.launchWebAuthFlow` + PKCE, available in every browser (`chrome.identity.getAuthToken` exists only in Chromium browsers, so do not depend on it). Redirect URLs differ per browser, so register one per browser with each service
- **Google Drive**: store in the app-only folder with the `drive.appdata` scope. Needs an OAuth client registered in Google Cloud. To check: whether `launchWebAuthFlow` works without a client secret, and whether publishing needs OAuth consent screen review (if not workable, use `getAuthToken` in Chrome only)
- **Dropbox / OneDrive**: PKCE auth, no client secret or server. Store in the app folder
- **Local folder**: write into a folder such as iCloud Drive via the File System Access API and let that folder sync. **Offered only in browsers that have the API (Chromium)**
- **WebDAV** (Nextcloud etc.): the user enters a URL and credentials
- From phase 1, `TermStore` is shaped so this part can be plugged in behind it (not implemented)

### Interface language
- The extension `i18n` API follows the browser's language and cannot be chosen by the user, so use a small custom mechanism: every UI string goes through `t("key")` with one file per language (`locales/en.json`). Switch with the `uiLocale` setting, default `en`
- Only the store name and description use `_locales/en/messages.json` (the `i18n` API)
- The interface language is a separate setting from the dictionary/translation languages (learning and native)
- Strings containing a browser name ("Chrome sync", "chrome://extensions") are not written into the locale file; insert `BrowserEnv` values with `t("key", { syncName })`

## Absorbing browser differences (Firefox and others)
Phase 1 publishes only the Chrome version, but the structure must not need rewriting when other browsers follow.

### Principles
1. Call extension APIs through WXT's `browser` (`wxt/browser`). Never use `chrome.*` directly in code
2. Features that exist only in some browsers always sit behind a part (`TranslationProvider`, `SyncBackend`, …) and are **detected by whether the feature exists**, never by browser name or user agent
3. When a feature is missing, hide everything related to it (no grayed-out controls, no permanent "not available in this browser")
4. Strings containing a browser name come from `BrowserEnv`
5. WXT generates the manifest per browser. Firefox gets `browser_specific_settings.gecko.id`, and its background is an event page (`background.scripts`) instead of a service worker
6. From phase 1, verify only that the Firefox build succeeds (no behavior guarantee, not published)

### What `BrowserEnv` holds
- Browser name, sync name (Chrome sync / Firefox Sync), rough sync delay
- How to reach the settings page (chrome://extensions / about:addons)
- Feature detection results: built-in translation, built-in AI, highlight underlines, File System Access API, how the background gets a DOM (offscreen document / event page)

### Chrome vs Firefox
| Feature | Chrome | Firefox | Handling |
|---|---|---|---|
| Browser sync (`storage.sync`) | Google account | Mozilla account (~every 10 min) | Same code. Only the name and delay come from `BrowserEnv` |
| Subtitle/sentence translation | Translator API (138+) | none (Mozilla opposes it) | Every browser uses the site's translation first, so only the third fallback differs. In Firefox, videos without a site translation and articles get no translation. Whether Firefox has a translation API for extensions is to be investigated |
| Built-in AI (phase 3) | Prompt API | none | Only the user's own API key |
| Article highlights (CSS Custom Highlight API) | available | available from 140, but at release **without underline (`text-decoration`) support** | Without underlines use background colors only (New = pale blue, Learning = pale green, Known = pale gray; colors to tune). Current support and detection method to be confirmed. Video subtitles are drawn with our own elements, so unaffected |
| DOM work in the background | offscreen document | the event page has a DOM | switched by `BrowserEnv` |
| Page (MAIN world) scripts | available | from 128 | decide the minimum version |
| Saving to a folder (File System Access API) | available | none | not offered |
| OAuth (future cloud sync) | `getAuthToken` / `launchWebAuthFlow` | `launchWebAuthFlow` only | standardize on `launchWebAuthFlow` |
| Opening settings, way ③ | chrome://extensions | about:addons | wording from `BrowserEnv` |

- `Intl.Segmenter`, `caretPositionFromPoint`, `requestVideoFrameCallback`, `CompressionStream` and `speechSynthesis` exist in recent Firefox too. Confirm minimum versions during implementation
- To confirm: whether Firefox MV3 grants host permissions listed in the manifest at install time or requires user consent

### Other browsers
- **Edge**: Chromium, so the Chrome version ships almost as is. Syncs to a Microsoft account. Built-in translation/AI to be confirmed
- **Safari**: to be investigated (packaging with Xcode, whether `storage.sync` syncs across devices)

### Publishing
- Chrome Web Store, addons.mozilla.org (AMO) for Firefox, Edge Add-ons for Edge
- AMO reviews built and minified code, so source code and build instructions must be submitted

### Chrome Web Store requirements (checked 2026-11-09)
No outright blocker. Decisions and requirements:
- **Subtitles (decided)**: keep YouTube and Netflix. Subtitle tracks are processed in memory only and never written to storage; only the sentence in which a saved word appears is stored (as an occurrence). Policy risk: "do not facilitate unauthorized access to content" / copyrighted content. Language Reactor does the same on the store. Prepare a written justification for review
- **Host access (decided)**: keep the content script on all sites (`<all_urls>`), accepting an in-depth review (can take weeks). Write a justification (article highlighting on any page the user reads)
- **Sentence history, phase 2 (decided)**: on by default, as in the mock. Browsing activity may be collected only for a user-facing feature described prominently in the store listing and in the UI, so the listing and Settings must describe it clearly, and it stays on the device
- **Privacy policy (required)**: any extension that handles user data needs a privacy policy URL, even when data stays on the device. Recorded sources (URL, title) and sentences count as user data. Disclose: what is stored locally, that word status goes through the browser's sync, that nothing is sent to the developer. Include the Limited Use compliance statement. Host it somewhere public without a server (e.g. GitHub Pages; this repo is private, so a separate public page is needed)
- **2026 policy update (in force since 2026-08-01)**: data collected must be necessary for the single purpose and prominently disclosed
- **Code**: no remotely hosted code (everything bundled, including the MAIN-world scripts); no obfuscation (minification is fine). Hooking page fetch/XHR/`JSON.parse` is not prohibited but needs a justification
- **Single purpose**: "learn vocabulary on the videos and articles you read" — keep every feature framed around it
- **Listing**: icon, screenshots and a description are mandatory; no keyword lists ("YouTube Netflix …"); "works with YouTube and Netflix" wording only, no third-party logos
- **Account**: 2-Step Verification; trader / non-trader declaration (EU DSA) — the user decides before publishing

## Phases
1. **Phase 1 (MVP)**
   - Foundation (en language pack incl. IPA, en→ja dictionary, TermStore and sync, classification)
   - Hover card and dictionary window, saving phrases, save all (popup + end card)
   - Article UI
   - Video UI for YouTube and Netflix (two columns + dictionary window, subtitle position and translation toggles, L button and arrow menu, site-first translation)
   - Toolbar popup, settings page, word list page
2. **Phase 2**
   - Automatic detection of phrases in the dictionary (phrase list from Wiktionary's English idioms and phrasal verbs, made of vocabulary words; where no Japanese translation exists, the English definition is shown)
   - Searching past occurrences (local corpus)
   - Fullscreen support
   - Per-video word list tab
   - A Spanish → English language pack
3. **Phase 3**
   - "Ask AI" button (links that open ChatGPT / Claude with a prompt containing the word and sentence)
   - LLM explanations: embed "word + sentence + nearby subtitles + saved words" in a prompt, receive JSON, cache per word + sentence. Run on Chrome's built-in Prompt API (Gemini Nano) first, with the user's own API key as a fallback
   - Example sentences from Tatoeba (CC BY)
   - Anki / CSV export
   - More sites
4. **Future TODO**
   - Firefox version (alternative to highlight underlines, publishing on AMO), then Edge and others
   - Sync to the user's own cloud storage (Google Drive / Dropbox / OneDrive / local folder / WebDAV)
   - More interface languages and switching between them
   - A standalone web app (only if needed)

## Risks and open questions
- YouTube/Netflix UI or internals may change and break things → keep per-site code in separate parts and test subtitle parsing with fixtures
- Check on the real sites that subtitles over the video and the L button / arrow menu in the player bar do not clash with YouTube's and Netflix's player UI
- No part-of-speech tagging, so dictionary lookups cannot be narrowed by part of speech (all parts of speech are shown)
- Some words have no IPA on Wiktionary (not shown)
- Translator / Prompt API are available only on desktop Chrome 138+. If they cannot be used from a content script directly, run them in an offscreen document (to verify). Firefox has neither
- Browser sync only stores locally when the user is not signed in, and the extension cannot reliably tell. JSON export is the only safeguard for users without sync
- Data licenses: Wiktionary-derived data is CC BY-SA, EJDict-hand is public domain (Tatoeba, phase 3, is CC BY)
- Netflix terms of use (stay within techniques equivalent to LR's)
- Fetching YouTube subtitles may need a token added by the player. Whether the extension can additionally fetch the auto-translation (`tlang`) or the Japanese track is to be verified (if not, fall back to the built-in translator)

## How to verify (during implementation)
- Vitest: segmentation and base forms, classification, phrase matching, counting unsaved words, save all and Undo, packing/splitting/merging sync data, parsing YouTube json3 and Netflix TTML, choosing a translation and assigning by time overlap (fixtures)
- Playwright: load the unpacked extension and check highlights, hover, phrase saving, saving and the end-of-article card on a local test article
- Manually on real YouTube and Netflix: both subtitle positions, translation toggles, the L button and arrow menu, transcript sync and seeking, the end card
- Two Chrome profiles (same Google account) to check status sync. Also check that a signed-out profile saves without errors and merges after signing in later
- Check that the Firefox build succeeds (phase 1). Behavior in Firefox is checked manually with `web-ext run` (Playwright's Firefox cannot load extensions) when the Firefox version is built
- Compare against the mock: layout, copy and defaults match. **Before committing any UI change, render it and compare with the mock**

## Appendix: Language Reactor field study (2026-11-08, checked in the web player)
The extension version could not be installed in the built-in browser, so the web player (YouTube video), which has the same UI as the extension, was used. This project's UI follows the mock; the following is reference only.

**Layout (three columns)**
1. Left: the video, with the current subtitle (original) + translation large below it
2. Middle: list of subtitle cards (original and translation side by side, current one emphasized, "Text / Words" tabs)
3. Right: dictionary panel (a fixed column opened by clicking)

**Hover**: detects phrases automatically and shows them first (e.g. about → "know all about"), then the word's short translation, with Known / Learning buttons

**Dictionary panel**: search box, headword and short translation, pronunciation, frequency, status buttons (Known / Learning / Ignore), tags, translations by part of speech, external dictionary links (URL template `…/{q}`), "Example: current text"

**Back end (from network traffic). Everything runs on their own servers (dioco.io)**
- Subtitles: `getYoutubeSubsData` (server adds part of speech, base forms, dependencies)
- Subtitle translation: `getYoutubeSubsTranslations`
- Hover dictionary: `getHoverDictEntriesForSubs` (prefetched for the whole video)
- Full dictionary: `getFullDict?form=about&pos=ADP&sl=en&tl=ja` (translations by part of speech and Tatoeba examples)
- Text-to-speech: `getDictTTS`; external dictionary list: `getExternalDicts`

**Lexa AI (detailed explanations)**
- Requires sign-in. Prompt templates come from the server (`getLexaPrompts`). The server embeds the user's context (looked-up word, current video, saved words due for review) in the prompt and calls an LLM. The model is not disclosed
- The "GPT" button in the dictionary panel uses no server (confirmed in source). It just opens `https://chatgpt.com/?q=<prompt>` in a new window

**Replacements in this project (no own servers)**

| LR feature | This project |
|---|---|
| Server-side NLP (part of speech, base forms) | `Intl.Segmenter` + inflection → base form table |
| Subtitle translation | Chrome's built-in Translator API |
| Dictionary | bundled dictionary (EJDict-hand) + IPA from Wiktionary |
| Text-to-speech | Web Speech API `speechSynthesis` |
| External dictionaries | URL templates (fixed four) |

**Not adopted**: Aria (conversation AI), PhrasePump, FSI/DLI, video catalog, auto-pause and playback-speed controls
