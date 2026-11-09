# Status

Updated whenever a milestone moves. Last update: 2026-11-09.

## Where we are
- Design (brainstorm) and the UI mock are done
- Roadmap for phase 1 + phase 2: [plans/2026-11-09-roadmap.md](plans/2026-11-09-roadmap.md)
- Current milestone: M0 (spec in English, phase changes, mock artboards for the missing screens)

## Decisions on 2026-11-09
- Tatoeba example sentences and Anki/CSV export moved to phase 3
- The phase-2 language pack is Spanish → English
- Screens without a mock (word list page, per-video word list tab, fullscreen, past-occurrence search) get mock artboards first; they are implemented after the user reviews them

## Open / not made yet
- Mock artboards for the word list page, per-video word list tab, fullscreen and past-occurrence search (in progress, awaiting review)
- How the Language Reactor extension looks on youtube.com is unchecked (only the web player was checked)
- IPA comes from Wiktionary (kaikki); coverage not measured yet
- How many words fit in `storage.sync` after compression (estimated 15,000–20,000) is not measured with real data
- Firefox: support for highlight underlines (`text-decoration` in the Highlight API), whether a translation API exists for extensions, when MV3 host permissions are granted
