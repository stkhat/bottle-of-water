# Roadmap

Phases 1–2 and M9 are done (git history; [status](../status.md)). What is left, in no fixed order; the user picks the next one.

## Refactor (in progress)
[2026-11-12-refactor.md](2026-11-12-refactor.md): one phase per session and PR.

## Phase 3 ([design](../specs/design.md) "Phases")
- "Ask AI" links (ChatGPT / Claude with the word and sentence)
- LLM explanations: Chrome's Prompt API first, the user's own API key as fallback; cached per word + sentence
- Tatoeba example sentences (CC BY)
- Anki / CSV export
- More sites (each a `PlatformAdapter`)
- New screens go into the mock first and are built after the user reviews them

## Pack hosting
Needs the user: a public data repository and an npm scope (placeholder `@lingo-data`). Then `npm run data:publish -- --download es,es-en`, `npm publish` each `data/publish/<pack>/`, a release, and a check of the real CDN download in the user's Chrome.

## Store release
See [status](../status.md) "Before publishing".

## How milestones run
- A short plan per milestone in `docs/plans/`, deleted once it is merged (decisions go into the spec or status)
- One branch and draft PR per milestone; `npm run verify` before every push; merged when green
