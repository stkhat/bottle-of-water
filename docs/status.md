# Status

Updated whenever a milestone moves. Last update: 2026-11-09.

## Where we are
- Design (brainstorm) and the UI mock are done
- Roadmap for phase 1 + phase 2: [plans/2026-11-09-roadmap.md](plans/2026-11-09-roadmap.md)
- M1 dev environment: PR #1 (`chore/dev-env`), CI green on Linux / macOS / Windows
- M0 done (spec in English, phase changes, mock artboards for the missing screens — awaiting review)
- M2 data import is built on `feat/phase-1` (packs in `public/packs/`, readers in `src/core/packs/`); see "Data" below
- M3 foundation is built on `feat/phase-1`: settings, BrowserEnv, tokenizer, language pack, dictionary, classifier, TermStore (IndexedDB), sync codec + BrowserSyncBackend, typed messaging and the background wiring
- Current milestone: M4 (shared lookup UI parts)
- Performance (E2E, built extension): the first `analyze` after a service-worker start loads only the `en` pack (3.8 MB, including `en/vocab.json`) in ~80–125 ms; before the vocabulary was split from the dictionary it loaded ~10 MB in ~215–270 ms. Later calls take 5–25 ms. The dictionary (6.7 MB in 4 shards) loads on the first `lookup`: ~115–130 ms after an `analyze`, ~180–190 ms when it is the first message. Possible later optimizations: load the dictionary in the background once `analyze` is done; analyze only when highlighting is on
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
- Mock artboards for the word list page, per-video word list tab, fullscreen and past-occurrence search: added 2026-11-09, **awaiting the user's review** (those screens are built only after it)
- How the Language Reactor extension looks on youtube.com is unchecked (only the web player was checked)
- `storage.sync` holds about 12,400 English terms, not the 15,000–20,000 the spec estimated (see "Data"). Decide whether that is enough or whether the sync format should change
- Firefox: support for highlight underlines (`text-decoration` in the Highlight API), whether a translation API exists for extensions, when MV3 host permissions are granted
