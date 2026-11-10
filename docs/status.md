# Status

Updated whenever a milestone moves. Last update: 2026-11-10.

## Where we are
- **Phase 1 (MVP) is built** (M0–M7 of the [roadmap](plans/2026-11-09-roadmap.md)), merged to `main` through PR #2 (`feat/phase-1`). The dev environment came in through PR #3 (`chore/dev-env`)
- **Phase 2 is in progress** on `feat/phase-2` ([plan](plans/2026-11-10-m8-phase-2.md)). Done: M8a dictionary phrase detection ([plan](plans/2026-11-10-m8a-phrases.md)), M8b Spanish → English pack ([plan](plans/2026-11-10-m8b-spanish.md)), M8c sentence history ([plan](plans/2026-11-10-m8c-sentence-history.md))
- Real-site checks (2026-11-10, user's Chrome via Claude in Chrome): YouTube (Ken Robinson TED talk) and Netflix (Friends, `watch/70274124`) work — subtitles, translations, transcript, hover card, dictionary window, saving, L/^ controls, seek. Details: [notes/youtube-captions.md](notes/youtube-captions.md), [notes/netflix.md](notes/netflix.md)

## What phase 1 contains
| Area | Where | Plan |
|---|---|---|
| Dev environment, CI/CD, CLAUDE.md check | `.github/`, `scripts/`, `e2e/`, `tests/` | [dev-environment](plans/2026-11-09-dev-environment.md) |
| Language data (EJDict, Wiktionary/kaikki, frequency) | `scripts/data/`, `public/packs/` | [m2](plans/2026-11-09-m2-data-import.md) |
| Settings, BrowserEnv, tokenizer, packs, dictionary, classifier, TermStore (IndexedDB), sync, messaging | `src/core/`, `src/background/`, `src/messaging/` | [m3](plans/2026-11-09-m3-foundation.md) |
| Hover card, dictionary window/panel, phrase bar, save-all card | `src/ui/lookup/` | [m4](plans/2026-11-09-m4-lookup-ui.md) |
| Article UI | `src/content/article/` | [m5](plans/2026-11-09-m5-article-ui.md) |
| Video UI (YouTube, Netflix) | `src/content/video/`, `src/ui/video/`, `src/core/subtitles/` | [m6](plans/2026-11-09-m6-video-ui.md) |
| Popup, settings page, word list page | `src/entrypoints/{popup,options,wordlist}/` | [m7](plans/2026-11-10-m7-popup-settings-wordlist.md) |

Checking in your own Chrome: `npm run build:check` refreshes `.output/lingo-check` (loaded unpacked in the user's Chrome) and the extension reloads itself ([development.md](development.md)).

## Known issues and open points (phase 1)
- Netflix: the subtitle lift above the control bar and the ^ menu are not yet checked on netflix.com; Netflix's Japanese lines are loosely timed, so a few land on a neighboring transcript card; sound labels inside a cue stay in the card ("… ( chuckles )")
- YouTube: real-site layout in theater mode and the narrow single-column layout not checked
- Article UI: a word saved in another tab shows on an open page only after it is classified again (reload or a known-level change)
- Popup: "On this site" reflects only `disabledSites` (a "Never run on" host still shows the switch on); relative times read "2 minutes ago" where the mock says "2 min ago"
- Word list: re-saving a removed word brings back one occurrence (removal deletes the others)
- `storage.sync` holds about 12,400 English terms, not the 15,000–20,000 the spec estimated (see "Data"); demotion of "save all" terms keeps it working
- Firefox (not released yet): `data_collection_permissions` missing in the manifest; `supportsHighlightUnderline()` always returns true; check `adoptedStyleSheets` / `CSS.highlights` from a Firefox content script; Playwright's Firefox does not launch on the dev Mac (CI covers it)
- E2E selects phrases with the Selection API (a Playwright mouse drag selects nothing on the article fixture in headless Chromium)

## Before publishing (Chrome Web Store)
- Privacy policy page on a public URL (this repo is private)
- Trader / non-trader declaration, 2-Step Verification on the developer account
- Review justifications: `<all_urls>`, page hooks on YouTube/Netflix, subtitle handling (processed in memory; with Sentence history on, the lines that played are kept on the device), sentence history described in the listing
- See the spec's "Chrome Web Store requirements"

## Decisions (2026-11-09 / 10)
- Tatoeba example sentences and Anki/CSV export moved to phase 3; the phase-2 language pack is Spanish → English
- Chrome Web Store: keep YouTube + Netflix (subtitles in memory only), keep `<all_urls>`, sentence history on by default
- Mock artboards for the word list page and the phase 2 screens were approved as they are (2026-11-10)
- Real-site checks that Playwright cannot do go through Claude in Chrome in the user's Chrome

## Data
Measured on 2026-11-09 with `npm run data:stats` after `npm run data:build` (kaikki English dump of that day, 1,499,161 entries).
- Vocabulary (single-word EJDict headwords, `en/vocab.json`): 40,197 words; the dictionary has 46,612 headwords including multi-word ones
- Lemma entries (inflected form → base): 54,399. A form that is itself a dictionary word keeps a base only when its own kaikki entry confirms it (is → be, does → do; this and news have none)
- IPA: 26,758 words; coverage over the frequency list: 16,719 of 19,089 base forms (87.6%)
- Parts of speech: 39,436 words
- Phrases (M8a, 2026-11-10): 16,384 phrases (5,240 from EJDict, 11,385 from kaikki, some in both); meanings from EJDict 5,240, Wiktionary Japanese translations 725, English definitions 10,419. `en/phrases.json` 0.27 MB, `en-ja/phrases.json` 0.05 MB, `en-defs/dict-1.json` 1.90 MB; all pack files 12.67 MB. Classifying ~1,400 words takes ~0.4 ms. Chrome zip 3.9 MB (phase 1: ~3 MB)
- Spanish (M8b, 2026-11-10; kaikki Spanish dump, Wiktionary "Frequency lists/Spanish/Mixed 730K", first 150,000 list entries): vocabulary 33,812 words (proper-noun-only entries left out), lemma entries 53,007, IPA 29,595 words (93.9% of the top 20,000 bases; Castilian pronunciation), es-en dictionary 35,438 terms, 1,626 phrases. `es/` 3.0 MB, `es-en/` 3.4 MB in 2 shards; all pack files 19.1 MB; Chrome zip 5.5 MB. Building the es pack and classifier ~29 ms in Node (en ~44 ms)
- Sizes (phase 1): `en/` 3.8 MB (lemmas 1.25, ipa 0.79, freq 0.21, pos 1.04, vocab 0.48), `en-ja/` 6.7 MB in 4 shards; total 10.45 MB, about 3 MB zipped. Every file stays under 4 MB (`scripts/data/pack-sizes.test.ts`; AMO rejects text files over 5 MB)
- Performance: first `analyze` after a service-worker start ~80–125 ms (loads `en`), later calls 5–25 ms; the dictionary loads right after the first `analyze` (`warmDictionary`)
- Sync capacity: 12,402 English terms fit in 102,400 bytes (`src/core/sync/codec.capacity.test.ts`); alternatives measured: up to ~16,300 with a column format (not adopted)
- Raw downloads in `data/raw/` (git-ignored): kaikki English (3.4 GB), kaikki Spanish (1.1 GB, for phase 2), EJDict, Wiktionary TV/2006 frequency pages
