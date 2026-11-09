# Status

Updated whenever a milestone moves. Last update: 2026-11-10.

## Where we are
- Design (brainstorm) and the UI mock are done
- Roadmap for phase 1 + phase 2: [plans/2026-11-09-roadmap.md](plans/2026-11-09-roadmap.md)
- M1 dev environment: PR #1 (`chore/dev-env`), CI green on Linux / macOS / Windows
- M0 done (spec in English, phase changes, mock artboards for the missing screens — awaiting review)
- M2 data import is built on `feat/phase-1` (packs in `public/packs/`, readers in `src/core/packs/`); see "Data" below
- M3 foundation is built on `feat/phase-1`: settings, BrowserEnv, tokenizer, language pack, dictionary, classifier, TermStore (IndexedDB), sync codec + BrowserSyncBackend, typed messaging and the background wiring
- M4 shared lookup UI parts are built on `feat/phase-1`
- M5 article UI is built on `feat/phase-1` ([plans/2026-11-09-m5-article-ui.md](plans/2026-11-09-m5-article-ui.md)): run conditions and page language, the page text model with visibility batching, highlights (CSS Custom Highlight API), the hover card, the dictionary panel (status changes, speech, external dictionaries, "On this page", "Seen elsewhere"), phrase selection, the page card's highlight chips bound to the settings, the end-of-article card with save all + Undo, re-occurrence recording, re-analysis when the known level changes, and the `pageSummary` / `pageSaveAll` / `pageUndo` requests the popup (M7) will send to the tab (`src/messaging/page-protocol.ts`). Compared with the mock in screenshots (hover card, panel, phrase bar, end card)
- M6 video UI is in progress on `feat/phase-1` ([plans/2026-11-09-m6-video-ui.md](plans/2026-11-09-m6-video-ui.md)). Done on YouTube (Tasks 0–5): caption fixtures and findings ([notes/youtube-captions.md](notes/youtube-captions.md)), subtitle parsers, the translation choice, the MAIN-world caption hooks and the adapter, the per-video session, and the UI: the subtitle in the video or below it, the transcript (highlight chips, translation switch, playing card, click to seek), the green-outlined L and ^ buttons with the Lingo menu, the hover card, the dictionary window ("In this video" with times), status changes with the line, its time and the translation shown, the "Video finished" card with save all + Undo, and the popup's page requests. Compared with mock Main in screenshots (components and the built extension on the routed fixture page). Next: Netflix (Task 6) and the real-site check (Task 7)
- Performance (E2E, built extension): the first `analyze` after a service-worker start loads only the `en` pack (3.8 MB, including `en/vocab.json`) in ~80–125 ms; before the vocabulary was split from the dictionary it loaded ~10 MB in ~215–270 ms. Later calls take 5–25 ms. The dictionary (6.7 MB in 4 shards) loads on the first `lookup`: ~115–130 ms after an `analyze`, ~180–190 ms when it is the first message. Possible later optimizations: analyze only when highlighting is on. The dictionary is now loaded right after the first `analyze` on an article page (`warmDictionary`)
- Firefox build: `web-ext lint` warns that `data_collection_permissions` is missing from the manifest; add it before any Firefox release

## Decisions on 2026-11-09
- Tatoeba example sentences and Anki/CSV export moved to phase 3
- The phase-2 language pack is Spanish → English
- Screens without a mock (word list page, per-video word list tab, fullscreen, past-occurrence search) get mock artboards first; they are implemented after the user reviews them

- Chrome Web Store requirements checked: no blocker. Keep YouTube + Netflix (subtitles in memory only), keep `<all_urls>`, sentence history on by default. See the spec's "Chrome Web Store requirements"

## Data
Measured on 2026-11-09 with `npm run data:stats` after `npm run data:build` (kaikki English dump of that day, 1,499,161 entries).
- Vocabulary (single-word EJDict headwords, `en/vocab.json`): 40,197 words; the dictionary has 46,612 headwords including multi-word ones
- Lemma entries (inflected form → base): 54,399
- IPA: 26,758 words; coverage over the frequency list: 16,719 of 19,089 base forms (87.6%). The list has fewer than 20,000 entries because only vocabulary words are kept
- Parts of speech: 39,436 words
- File sizes: `en/lemmas.json` 1.25 MB, `en/ipa.json` 0.79 MB, `en/freq.json` 0.21 MB, `en/pos.json` 1.04 MB, `en/vocab.json` 0.48 MB; `en-ja/dict-1.json`–`dict-3.json` 2.00 MB each, `en-ja/dict-4.json` 0.68 MB, `en-ja/index.json` 245 bytes; total 10.45 MB. Every file must stay under 4 MB (`scripts/data/pack-sizes.test.ts`): AMO's linter (`web-ext lint`) rejects text files over 5 MB
- A form that is itself a dictionary word (is, does, has, this) keeps a base only when its own kaikki entry says "form of <base>" in a non-rare inflection sense, and that sense is a verb inflection or the EJDict gloss names the base. So is → be, does → do, has → have, lives → life/live; this and news have no base. Forms outside the vocabulary still take every base whose entry lists them
- EJDict has no phrasal verbs as headwords (no "figure out"); its multi-word headwords are compounds such as "figure of speech"
- Sync capacity (`src/core/sync/codec.capacity.test.ts`, the spec's format: lines sorted by key, base36 minutes, gzip, base64): **12,402 English terms fit in 102,400 bytes**; 20,000 terms take 170,367 bytes. Data: the most frequent base forms, saved over one year in sessions and "save all" batches, 55% known / 40% learning / 5% removed, fixed seed. The settings key and other languages share the same 100 KB
  - Measured alternatives on the same data (not adopted): lines sorted by update time with time deltas, ~14,800 terms; the same with keys, statuses and times in separate columns, ~16,300; hours instead of minutes, ~13,600. None fits 20,000; the key text itself takes most of the space

## Before publishing
- Privacy policy page on a public URL (this repo is private)
- Trader / non-trader declaration, 2-Step Verification on the developer account
- Review justifications: `<all_urls>`, page hooks on YouTube/Netflix, subtitle handling

## Open / not made yet
- Video UI: only checked on the routed YouTube fixture page; real YouTube (controls that auto-hide, theater mode, the narrow single-column layout, YouTube re-rendering the player bar) is checked in Task 7
- Article UI: changes made in another tab (saving a word there) show on an open page only after it is classified again (reload, or a known-level change). Re-analyzing when the tab becomes visible again would cover it
- Article UI: the hover card's notes line has no etymology or related words (no data); it shows the base form of an inflected word ("loaves → loaf") and, for a phrase, its main word's translation
- E2E: a Playwright mouse drag selects no text on `e2e/pages/article-en.html` in headless Chromium, even without the extension (it does on simpler pages and in the browser tests), and Shift+click selected nothing on the Linux CI runner, so the E2E test selects the phrase with the Selection API (mouse selection is covered by the browser tests)
- Mock artboards for the word list page, per-video word list tab, fullscreen and past-occurrence search: added 2026-11-09, **awaiting the user's review** (those screens are built only after it)
- How the Language Reactor extension looks on youtube.com is unchecked (only the web player was checked)
- `storage.sync` holds about 12,400 English terms, not the 15,000–20,000 the spec estimated (see "Data"). Decide whether that is enough or whether the sync format should change
- Firefox: support for highlight underlines (`text-decoration` in the Highlight API), whether a translation API exists for extensions, when MV3 host permissions are granted
- TODO (Firefox): `supportsHighlightUnderline()` in `src/content/article/highlighter.ts` always returns true. Detect whether `::highlight()` draws `text-decoration` there; when it does not, the highlighter already switches to background colors only. Also check that a content script can set `document.adoptedStyleSheets` and `CSS.highlights` in Firefox (Xray wrappers)
