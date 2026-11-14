# Firefox browser tests: why they failed on CI (2026-11-14)

## What failed
From 2026-11-10 to 11-14, CI's browser-test step failed 9 times; 7 of them were Firefox
only, and each failed its CI retry too. Most were tests that select words by dragging
(subtitle, transcript card, article phrase) or go fullscreen (the transcript sidebar,
"Fullscreen request denied" as an unhandled rejection). Each was patched where it showed:
a skip in Firefox (the drag that starts inside selected words), a Web Lock and retries
around fullscreen, waits, and a product change (transcript cards from `<button>` to a
`div` with the button role, c309e16).

## Cause
Vitest opens a window (a page in a browser context of its own) per test file and runs
files side by side. Firefox has one active window: when another window becomes active
(another file's click or focus), it ends the drag selection and leaves or denies the
fullscreen of the window that was. Chromium keeps every page active, so only Firefox was
hit, and only when another file was busy at the same moment.

Evidence, in CI's image on the dev Mac (Colima, 4 CPUs):
- The subtitle and transcript test files run alone: 0 failures in 3 runs each. Run
  together: a drag test failed in 3 of 3 runs.
- An event log of a failing drag: the move with the button down reaches the page
  (`pointermove`, `buttons: 1`), but the selection stays where the press put it. Five more
  moves before the release change nothing: the drag selection had ended, not lagged.
- Six video and article test files with Firefox running one file at a time: no drag or
  fullscreen-denial failure in 5 runs, with the tests as they were (Playwright's
  `dragAndDrop`); one fullscreen test failed every time, for the screen size (below).
  After that fix, the whole Firefox suite: 780 passed in 3 of 3 runs, including the drag
  test that had been skipped in Firefox.
- A Web Lock taken in one test file is not seen by another (both took it at the same
  millisecond): the fullscreen lock of 7c25ddc did not make files take turns.

## What changed
- Firefox runs its test files one at a time (`fileParallelism` per instance in
  `vitest.config.ts`); Chromium stays side by side. The Firefox part takes about 97 s
  instead of 34 s in the local container.
- The fullscreen helper (`src/testing/fullscreen.ts`) lost its lock and retries.
- The skipped Firefox test runs again.
- One test compared a fullscreen height with 768, the height of CI's 1200×800 screen;
  in the local container Firefox's fullscreen is 1366×768. It now compares with
  `innerHeight`.

## Notes
- c309e16's `<button>` was put back for a check: the transcript selection tests still
  passed on Firefox 159, so the CI failure it answered was most likely this cause too.
  The `div` stays (it is what the tests and the UI now expect).
- The comment in `src/testing/article.tsx` (`dragSelect`) that Firefox "can drop the last
  move" describes the same symptom; its extra move is harmless.
- Playwright's Firefox (build 1572, Firefox 159) exits at launch on macOS 27.0.1 with
  "Could not find profile folder.", with or without Claude Code's sandbox, another TMPDIR
  or HOME: the reason `npm run test:browser:firefox` runs in Docker.
