# Status

Updated whenever a milestone moves. Last update: 2026-11-11.

## Where we are
- **Phase 1 (MVP) is built** (M0–M7 of the [roadmap](plans/2026-11-09-roadmap.md)), merged to `main` through PR #2 (`feat/phase-1`). The dev environment came in through PR #3 (`chore/dev-env`)
- **Phase 2 is built** on `feat/phase-2` ([plan](plans/2026-11-10-m8-phase-2.md)), PR #6: M8a dictionary phrase detection ([plan](plans/2026-11-10-m8a-phrases.md)), M8b Spanish → English pack ([plan](plans/2026-11-10-m8b-spanish.md)), M8c sentence history ([plan](plans/2026-11-10-m8c-sentence-history.md)), M8d words in this video ([plan](plans/2026-11-10-m8d-video-words.md)), M8e fullscreen ([plan](plans/2026-11-10-m8e-fullscreen.md))
- Real-site checks (2026-11-10, user's Chrome via Claude in Chrome): YouTube (Ken Robinson TED talk) and Netflix (Friends, `watch/70274124`) work — subtitles, translations, transcript, hover card, dictionary window, saving, L/^ controls, seek. Details: [notes/youtube-captions.md](notes/youtube-captions.md), [notes/netflix.md](notes/netflix.md)
- Phase 2 real-site checks (2026-11-10, same videos plus Wikipedia): the Words tab (219 rows on the TED talk), detected phrases ("play out", "running through", "used to") with English definitions, fullscreen on both sites (youtube.com makes `<html>` fullscreen, so Lingo's page layer stays in `<body>`; netflix.com makes `.watch-video` fullscreen and the layer moves into it), the 34 px subtitle, hover card, dictionary window at the top right and the reduced ^ menu, "Seen elsewhere · 11" for an unsaved word after visiting two other Wikipedia pages. Netflix's subtitle lift above the control bar and the ^ menu now checked
- YouTube auto-generated captions (2026-11-11, branch `fix/asr-captions`): transcript cards follow the sentences of YouTube's auto-translation, so each card's Japanese is that sentence's translation, and the video shows a card as lines of at most 60 characters. Checked on four ASR videos (`GLNVMi_4Khw`, `1w5R5QOjbVY`, `RVzIGNFyvYU`, `P30_ec_t0Y8`); details in [notes/youtube-captions.md](notes/youtube-captions.md)

- Small fixes (2026-11-11, branch `claude/minor-fixes-e54cb2`): green "L" toolbar icon (the manifest had none, so Chrome drew a gray letter), one gear icon for "open settings", and a theme setting (System / Light / Dark, default System) that covers every Lingo UI; dark palette in the spec's "Shared: theme"

- Dictionary window and transcript (2026-11-11, branch `claude/dictionary-popup-video-ui-d462d4`): a press outside the dictionary window closes it (video and article; × stays), "In this video" marks the term in each line, and transcript words show the hover card and open the dictionary on a click

- **M9, language data that scales** (2026-11-11, [design](specs/2026-11-11-language-data-scaling-design.md)): adopted in draft PR #18 with review fixes (npm hosting via jsDelivr / unpkg, IndexedDB for downloaded packs). M9a phrase patterns on `feat/phrase-patterns` (draft PR #20, [plan](plans/2026-11-11-m9a-phrase-patterns.md)): data, matcher, classifier, saving selections under the pattern key, and the selection card (the phrase's hover card replaces the phrase bar, mock PhraseMeaning) are built
## What phase 1 contains
| Area | Where | Plan |
|---|---|---|
| Dev environment, CI/CD, CLAUDE.md check | `.github/`, `scripts/`, `e2e/`, `tests/` | [dev-environment](plans/2026-11-09-dev-environment.md) |
| Language data (EJDict, Wiktionary/kaikki, frequency) | `scripts/data/`, `public/packs/` | [m2](plans/2026-11-09-m2-data-import.md) |
| Settings, BrowserEnv, tokenizer, packs, dictionary, classifier, TermStore (IndexedDB), sync, messaging | `src/core/`, `src/background/`, `src/messaging/` | [m3](plans/2026-11-09-m3-foundation.md) |
| Hover card (also over a selection), dictionary window/panel | `src/ui/lookup/` | [m4](plans/2026-11-09-m4-lookup-ui.md) |
| Article UI | `src/content/article/` | [m5](plans/2026-11-09-m5-article-ui.md) |
| Video UI (YouTube, Netflix) | `src/content/video/`, `src/ui/video/`, `src/core/subtitles/` | [m6](plans/2026-11-09-m6-video-ui.md) |
| Popup, settings page, word list page | `src/entrypoints/{popup,options,wordlist}/` | [m7](plans/2026-11-10-m7-popup-settings-wordlist.md) |

Checking in your own Chrome: `npm run build:check` refreshes `.output/lingo-check` (loaded unpacked in the user's Chrome) and the extension reloads itself ([development.md](development.md)).

## Known issues and open points (phase 1)
- Netflix: Netflix's Japanese lines are loosely timed, so a few land on a neighboring transcript card; sound labels inside a cue stay in the card ("… ( chuckles )")
- YouTube: real-site layout in theater mode and the narrow single-column layout not checked
- Article UI: a word saved in another tab shows on an open page only after it is classified again (reload or a known-level change)
- Popup: "On this site" reflects only `disabledSites` (a "Never run on" host still shows the switch on); relative times read "2 minutes ago" where the mock says "2 min ago"
- Word list: re-saving a removed word brings back one occurrence (removal deletes the others)
- `storage.sync` holds about 12,400 English terms, not the 15,000–20,000 the spec estimated (see "Data"); demotion of "save all" terms keeps it working
- Firefox (not released yet): `data_collection_permissions` missing in the manifest; `supportsHighlightUnderline()` always returns true; check `adoptedStyleSheets` / `CSS.highlights` from a Firefox content script; Playwright's Firefox does not launch on the dev Mac (CI covers it)
- E2E selects phrases with the Selection API (a Playwright mouse drag selects nothing on the article fixture in headless Chromium)

## Known issues and open points (phase 2)
- Phrase data: some first meanings from Wiktionary fit badly ("talk about" → an interjection sense, "used to" → "accustomed to" where the habitual past is meant); a few literal word pairs remain ("and change"); very common idioms such as "of course" and "a lot" are not in the list
- Article sentences from Wikipedia keep citation brackets ("5] …", "…[") in "On this page" and the history
- YouTube: after using L or ^ the focus stays on Lingo's buttons, whose event isolation keeps YouTube's shortcuts (f, k) from reaching the player until the video is clicked
- Netflix: the in-video subtitle is centered on the whole video, so its right end can run under the transcript side panel
- A selected (saved) phrase only finds history sentences recorded after it was saved: index keys are fixed when a sentence is kept
- The 50 MB history figure is Lingo's own estimate; IndexedDB's indexes take more space on disk
- Production builds use closed shadow roots, so E2E drives the page UI on the check build only
- YouTube ASR: in stretches where the English has no punctuation, a card boundary can be 1–3 words off (YouTube's own translation drifts); a card can then hold a long run-on (up to ~70 words), shown as several lines. Where YouTube translates one English sentence as two, the card holds both, or the English is split at a comma

## Known issues and open points (M9)
- Phrase gaps: a saved phrasal verb may match words that do not belong together (up to three words between its parts; a conjunction or a subject ends the gap, but there is no part-of-speech check)
- A phrase saved before M9a whose key happens to contain a slot word ("someone else") now also matches the slot's fillers ("him else")
- Phrases dropped only by the rank thresholds ("see you later", "in it") are in neither `detect` nor `more`, so a selection cannot match them
- Subtitles: the outline of the term whose dictionary window is open goes around the clicked part of a gap phrase only

## Before publishing (Chrome Web Store)
- Privacy policy page on a public URL (this repo is private)
- Trader / non-trader declaration, 2-Step Verification on the developer account
- Review justifications: `<all_urls>`, page hooks on YouTube/Netflix, subtitle handling (processed in memory; with Sentence history on, the lines that played are kept on the device), sentence history described in the listing
- See the spec's "Chrome Web Store requirements"

## Decisions (2026-11-11)
- Articles: only the title and body get highlights, the end-of-article "Mark as Known", the sentence history and "Seen elsewhere" encounters; words in menus, sidebars and related-story links still show the hover card and the dictionary. Settings → Articles → "Highlight only the article" (on by default) switches it; off, the whole page counts as before. Main content is found by `findMainContent` (`src/content/article/main-content.ts`)
- No page card on articles and no end cards: the toolbar popup keeps the highlight toggles, and the popup's "This page" save-all is gone. Settings → Highlighting → "New words you didn't save" (Keep as New, default / Mark as Known) decides what happens to unsaved New words when a video ends or the end of an article comes into view
- IPA is shown in dictionary style (no syllable dots or tie bars, r instead of ɹ) in Noto Sans or the system UI font

## Decisions (2026-11-09 / 10)
- Tatoeba example sentences and Anki/CSV export moved to phase 3; the phase-2 language pack is Spanish → English
- Chrome Web Store: keep YouTube + Netflix (subtitles processed in memory; played lines kept on the device while Sentence history is on), keep `<all_urls>`, sentence history on by default
- Mock artboards for the word list page and the phase 2 screens were approved as they are (2026-11-10)
- Real-site checks that Playwright cannot do go through Claude in Chrome in the user's Chrome

## Data
Measured on 2026-11-09 with `npm run data:stats` after `npm run data:build` (kaikki English dump of that day, 1,499,161 entries).
- Vocabulary (single-word EJDict headwords, `en/vocab.json`): 40,197 words; the dictionary has 46,612 headwords including multi-word ones
- Lemma entries (inflected form → base): 54,399. A form that is itself a dictionary word keeps a base only when its own kaikki entry confirms it (is → be, does → do; this and news have none)
- IPA: 26,758 words; coverage over the frequency list: 16,719 of 19,089 base forms (87.6%)
- Parts of speech: 39,436 words
- Phrases (M8a, 2026-11-10): 16,384 phrases (5,240 from EJDict, 11,385 from kaikki, some in both); meanings from EJDict 5,240, Wiktionary Japanese translations 725, English definitions 10,419. `en/phrases.json` 0.27 MB, `en-ja/phrases.json` 0.05 MB, `en-defs/dict-1.json` 1.90 MB; all pack files 12.67 MB. Classifying ~1,400 words takes ~0.4 ms. Chrome zip 3.9 MB (phase 1: ~3 MB)
- Phrase patterns (M9a, 2026-11-11): English 19,932 patterns — 18,327 detect (all 16,384 earlier phrases kept; +1,943 with inflected words such as "spill the beans"), 1,605 more (1,432 with a slot: one's 899, someone's 272, someone 168, oneself 94, something 37; 173 starting with be/have/do), 4,725 gap (phrasal verbs). Meanings: EJDict 5,737, Wiktionary Japanese translations 901, English definitions 13,294, none 0. Spanish 2,467 detect, 3 more. `en/phrases.json` 0.41 MB, `en-defs` 2.00 + 0.41 MB; all pack files 19.87 MB. Classifying a 27,000-word corpus takes ~13 ms (unchanged), ~15 ms with 375 saved phrases (+20%)
- Spanish (M8b, 2026-11-10; kaikki Spanish dump, Wiktionary "Frequency lists/Spanish/Mixed 730K", first 150,000 list entries): vocabulary 33,812 words (proper-noun-only entries left out), lemma entries 53,007, IPA 29,595 words (93.9% of the top 20,000 bases; Castilian pronunciation), es-en dictionary 35,438 terms, 1,626 phrases. `es/` 3.0 MB, `es-en/` 3.4 MB in 2 shards; all pack files 19.1 MB; Chrome zip 5.5 MB. Building the es pack and classifier ~29 ms in Node (en ~44 ms)
- Sizes (phase 1): `en/` 3.8 MB (lemmas 1.25, ipa 0.79, freq 0.21, pos 1.04, vocab 0.48), `en-ja/` 6.7 MB in 4 shards; total 10.45 MB, about 3 MB zipped. Every file stays under 4 MB (`scripts/data/pack-sizes.test.ts`; AMO rejects text files over 5 MB)
- Performance: first `analyze` after a service-worker start ~80–125 ms (loads `en`), later calls 5–25 ms; the dictionary loads right after the first `analyze` (`warmDictionary`)
- Sync capacity: 12,402 English terms fit in 102,400 bytes (`src/core/sync/codec.capacity.test.ts`); alternatives measured: up to ~16,300 with a column format (not adopted)
- Raw downloads in `data/raw/` (git-ignored): kaikki English (3.4 GB), kaikki Spanish (1.1 GB, for phase 2), EJDict, Wiktionary TV/2006 frequency pages
