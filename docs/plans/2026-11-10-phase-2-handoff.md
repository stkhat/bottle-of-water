# Phase 2 — handoff

Phase 1 is merged to `main`. Phase 2 runs in a new session; this page is where it starts. Read CLAUDE.md, [status.md](../status.md), the [roadmap](2026-11-09-roadmap.md) (M8) and the spec first.

## Scope (roadmap M8)
1. **Dictionary phrase detection.** A phrase list from Wiktionary's English idioms and phrasal verbs made of vocabulary words (kaikki English, already in `data/raw/kaikki-en.jsonl`), merged with EJDict's multi-word headwords. Saved phrases win over detected ones. Where no Japanese translation exists, show the English definition (spec, "Phases" → phase 2). This also fills the phrase meanings and IPA missing in phase 1 (word list, dictionary window)
2. **Past occurrences (sentence history).** Keep sentences from pages and videos opened with Lingo on, on the device, with a base-form index; cap 50 MB, oldest pages removed first; never synced; "Never run on" sites not kept. Unsaved words show "Seen elsewhere · N" from the history; saving a word imports them into its occurrences. Settings gets the **Sentence history** section (switch on by default, space used, Clear). Chrome Web Store: collecting browsing activity is allowed only for a user-facing feature described prominently in the listing and the UI — keep the Settings copy and the store listing clear about it
3. **Fullscreen.** Subtitle and translation stay over the video (larger), hover cards and the dictionary window work, the L and ^ buttons stay in the player bar; no transcript; the subtitle position choice does not apply, so the ^ menu shows only the translation switch and "Open all settings". Phase 1 currently hides Lingo in fullscreen and gives the site's captions back
4. **Words in this video.** Transcript / Words tabs in the right column; words and phrases in order of first appearance with highlight, short translation and count (e.g. 3×); filter chips All / New / Learning / Known with counts; selecting a word opens the dictionary window with "In this video"
5. **Spanish → English pack.** `LanguagePack` es (kaikki Spanish, already downloaded to `data/raw/kaikki-es.jsonl`, 1.1 GB), a `DictionaryProvider` es→en from kaikki's English glosses, Wiktionary "Frequency lists/Spanish/Mixed 730K", language choices in Settings, the language name in the level slider copy. Confirm it is added without touching the en→ja code; watch the pack sizes (each file < 4 MB, total zipped size compared with phase 1's ~3 MB; consider the 30–50k most common words)

Screens 2–4 follow the approved mock artboards (approved as they are on 2026-11-10): `Phase 2 — words in this video` (`project/VideoWords.dc.html`), `Phase 2 — fullscreen video` (`project/Fullscreen.dc.html`), `Phase 2 — past occurrences of unsaved words` (`project/PastOccurrences.dc.html`). The spec's "Phase 2 screens" section describes them.

## How phase 1 was run (keep doing this)
- Branch `feat/phase-2` from `main`, one PR; Claude may merge its own PRs once the phase is complete, CI is green on all jobs and the UI matches the mock (merge commit)
- A short plan per milestone in `docs/plans/`, then one subagent per task (superpowers:subagent-driven-development); TDD; English in the repo; no Claude attribution in commits
- Before committing UI: render it and compare with the mock (screenshot pairs)
- Real sites: Playwright gets empty YouTube captions (PO token), and Netflix needs the user's login, so real-site checks run in the user's Chrome with Claude in Chrome. `npm run build:check` refreshes `.output/lingo-check`, which the user loaded unpacked once; it reloads itself. Test videos: YouTube `watch?v=iG9CE55wbtY`, Netflix Friends `watch/70274124`. Ask the user to turn off other subtitle extensions (Language Reactor) during checks
- `VITEST_BROWSERS=chromium` locally (Playwright's Firefox does not launch on the dev Mac; CI runs Firefox)

## Open points from phase 1 worth folding in
See [status.md](../status.md) → "Known issues and open points". The ones closest to phase 2: phrase meanings/IPA (item 1), Netflix subtitle lift and ^ menu not yet checked on the real site, re-analysis when another tab saves a word, sync capacity (~12,400 English terms).
