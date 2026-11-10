# M8e — Fullscreen

> Executed with superpowers:subagent-driven-development. TDD; mount and session behavior in Vitest Browser Mode (real fullscreen from a user gesture), the built extension with Playwright E2E, real sites in the user's Chrome. Before committing the UI, render it and compare with the mock.

**Goal:** in the player's fullscreen on YouTube and Netflix, Lingo stays: the subtitle and its translation over the video (larger), hover cards and the dictionary window, the L button and ^ menu in the player bar. Mock: `Phase 2 — fullscreen video` (`project/Fullscreen.dc.html`), approved 2026-11-10. Phase 1 hides Lingo in fullscreen and gives the site's captions back.

## Decisions (spec "Phase 2 screens")
- No transcript (YouTube's column is not visible anyway; Netflix's side panel stays hidden) and no below-video box: the subtitle is always in the video in fullscreen, whatever the subtitle position setting
- The ^ menu in fullscreen shows only the header, "Show translation" and "Open all settings" (no subtitle position group)
- Site captions stay hidden while Lingo is on, in fullscreen too
- Subtitle look in fullscreen (mock): line 34 px / line-height 1.5, translation 24 px, box padding 6 px 18 px / 4 px 14 px, radius 10, gap 8, horizontal inset 200 px at 1440 px wide (scale: `clamp(24px, 14%, 200px)`), bottom 120 px above the bottom edge (Netflix: the existing lift above its control bar still applies)
- Dictionary window in fullscreen: top-right, 32 px from the top and right edges, 360 × 420, draggable as now
- Everything Lingo draws on the page (`lingo-video`: hover card, dictionary window, end card) must be inside the fullscreen element to render: its host moves into `document.fullscreenElement` (or the nearest element that can hold children when that is a `<video>`) while in fullscreen, and back to `<body>` after

## Tasks
1. **Mount and session** — `src/content/video/mount.tsx`: the `lingo-video` host point is `fullscreenHost() ?? document.body`; `fullscreenchange` also calls `schedule()` so hosts are re-placed; check that the host's event isolation (`PRIVATE_EVENTS`) keeps clicks from reaching the player and that `position: fixed` still works inside the fullscreen element (ancestors with transform). `src/content/video/session.ts`: `setFullscreen` no longer gives captions back (`hideSiteCaptions(status === "ready" && enabled)`). `src/content/ui/VideoUi.tsx`: `InPlayerUi` shows the subtitle in fullscreen using a `fullscreen` look (`src/ui/video/SubtitleOverlay.tsx` `LOOK.fullscreen`) regardless of `subtitlePosition`; `BelowVideoUi` hidden in fullscreen; `PageUi` no longer returns null in fullscreen; `LingoMenu` gets `compact`/`fullscreen` prop dropping the position group. `src/content/video/placement.ts` `dictionaryFrame`: fullscreen branch. Netflix side panel stays hidden in fullscreen (as now). Tests: update the existing fullscreen tests in `mount.browser.test.tsx` and `session.browser.test.ts` (they assert the old behavior), add: host inside the fullscreen element and back; subtitle shown with the fullscreen look while position is "Below video"; menu without positions; dictionary frame; hover card visible in fullscreen
2. **E2E and screenshots** — `e2e/youtube.spec.ts` and `e2e/netflix.spec.ts`: enter fullscreen with `requestFullscreen()` from a user gesture on the element the site uses (YouTube: check the fixture — the real site makes a page-level element fullscreen; Netflix: the player view), then: the subtitle is visible and larger, hovering a word shows the hover card, clicking opens the dictionary window, the L button and ^ menu work and the menu has no position group; leaving fullscreen restores the normal layout. `e2e/extension-errors.spec.ts` gains a fullscreen flow if it drives the video flows. Screenshot pair against the mock (fullscreen with the dictionary window and a hover card) before committing

## Real-site check (in the finish step)
Which element goes fullscreen on youtube.com and netflix.com, and that the hover card / dictionary window render there, are checked in the user's Chrome with Claude in Chrome.

## Docs (after the tasks)
Spec: "Video UI" fullscreen behavior (phase 1 note replaced), "Phase 2 screens". `docs/status.md`.

## Verification
`npm run check`, `npm test`, `VITEST_BROWSERS=chromium npm run test:browser`, `npm run build`, `npm run build:firefox`, `npm run test:e2e:build`.
