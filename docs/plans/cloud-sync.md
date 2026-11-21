# Plan: sync to the user's own cloud storage

Design: [architecture](../specs/architecture.md) "Sync to the user's own cloud storage". This plan orders the build; decisions go into the spec.

## User decisions (2026-11-21)
- Google Drive only first; Dropbox and OneDrive later, each a `CloudProvider` of its own
- Everything in the design is synced (terms, occurrences, your meanings, settings, sentence history)
- The spike (C0) comes first

## Milestones
| | Milestone | State |
|---|---|---|
| C0 | Spike: register the Google Cloud project; a throwaway build that only signs in and reads/writes one file in Chrome and Firefox ("Checks before building", Google items) | |
| C1 | Mock: Settings "Your own cloud storage", status, "Connect … on this device too", history's "Also save to …" | |
| C2 | Core merge and file format (`src/core/cloud/`): file types and codec, every merge rule, the in-memory reference merge, unit tests and the property test | built |
| C3 | Dexie v7 data model (`deviceId`, `addedAt`, `clearedAt`; tombstones are never pruned locally, so no "connected" switch), settings field times (`settingsTimes`), `importJson` on the new rules (export version 3) | built |
| C4 | `CloudSyncBackend` against an in-memory fake provider: read/merge/write, timing, status and errors, browser sync while connected | |
| C5 | Google Drive provider: files half over `fetch` (recorded responses in tests), auth half (`getAuthToken` / `launchWebAuthFlow`) | |
| C6 | UI per the mock | |
| C7 | Real check in the user's Chrome and Firefox with a real account; release docs (store listing, privacy) | |
