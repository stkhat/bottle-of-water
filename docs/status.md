# Status

Updated whenever a milestone moves. Last update: 2026-11-09.

## Where we are
- Design (brainstorm) and the UI mock are done
- Roadmap for phase 1 + phase 2: [plans/2026-11-09-roadmap.md](plans/2026-11-09-roadmap.md)
- M1 dev environment is built (WXT scaffold, lint, unit/browser/manifest/E2E tests, CLAUDE.md check, CI workflows); CI has not run on GitHub yet
- M0 done (spec in English, phase changes, mock artboards for the missing screens — awaiting review)
- Current milestone: M1 PR and CI, then M2 (data import)
- Firefox build: `web-ext lint` warns that `data_collection_permissions` is missing from the manifest; add it before any Firefox release

## Decisions on 2026-11-09
- Tatoeba example sentences and Anki/CSV export moved to phase 3
- The phase-2 language pack is Spanish → English
- Screens without a mock (word list page, per-video word list tab, fullscreen, past-occurrence search) get mock artboards first; they are implemented after the user reviews them

- Chrome Web Store requirements checked: no blocker. Keep YouTube + Netflix (subtitles in memory only), keep `<all_urls>`, sentence history on by default. See the spec's "Chrome Web Store requirements"

## Before publishing
- Privacy policy page on a public URL (this repo is private)
- Trader / non-trader declaration, 2-Step Verification on the developer account
- Review justifications: `<all_urls>`, page hooks on YouTube/Netflix, subtitle handling

## Open / not made yet
- Mock artboards for the word list page, per-video word list tab, fullscreen and past-occurrence search: added 2026-11-09, **awaiting the user's review** (those screens are built only after it)
- How the Language Reactor extension looks on youtube.com is unchecked (only the web player was checked)
- IPA comes from Wiktionary (kaikki); coverage not measured yet
- How many words fit in `storage.sync` after compression (estimated 15,000–20,000) is not measured with real data
- Firefox: support for highlight underlines (`text-decoration` in the Highlight API), whether a translation API exists for extensions, when MV3 host permissions are granted
