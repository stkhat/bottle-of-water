# Roadmap

Phases 1–2 and M9 are done (git history; [status](../status.md)). What is left, in no fixed order; the user picks the next one.

## Phase 3 ([design](../specs/design.md) "Phases")
- Meaning in context (on-device AI in the dictionary window) and your meanings (a meaning per sentence for words with several): built and checked with the real model 2026-11-16 ([status](../status.md)). Left: the user's own API key, a later step of its own
- Tatoeba example sentences (CC BY)
- Not done: "Ask AI" links to ChatGPT / Claude (user, 2026-11-15; [design](../specs/design.md) "Phases")
- Anki / CSV export
- More sites (each a `PlatformAdapter`)
- New screens go into the mock first and are built after the user reviews them

## Sync to the user's own cloud storage
Designed, not built: [architecture](../specs/architecture.md) "Sync to the user's own cloud storage" (its "Checks before building" come first).

## Pack hosting
Needs the user: a public data repository and an npm scope (placeholder `@lingo-data`). Then `npm run data:publish -- --download es,es-en`, `npm publish` each `data/publish/<pack>/`, a release, and a check of the real CDN download in the user's Chrome.

## Store release
See [status](../status.md) "Before publishing".

## How milestones run
- A short plan per milestone in `docs/plans/`, deleted once it is merged (decisions go into the spec or status)
- One branch and draft PR per milestone; `npm run verify` before every push; merged when green
