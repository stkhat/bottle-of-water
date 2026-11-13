# Selecting words: main-thread cost

Measured on 2026-11-14 for the report "selecting words sometimes freezes: the whole page gets heavy and stops responding" (plan `docs/plans/highlight-fixes.md`, step E). Dev Mac (Apple Silicon), the user's Chrome, the check build, videos muted.

## How
- Real pages, in the page through Claude in Chrome: a `PerformanceObserver` for `longtask` (50 ms and more), and a 4 ms `setInterval` that records every gap over 14 ms (a busy main thread, Lingo's or the site's). Flow: drag-select 2–3 words in a transcript card or the subtitle, wait for the card, press "+ Learning", then remove the phrase from the dictionary window. Hovers over words.
- Lingo's own render cost, which the page samplers cannot tell from the site's: `Transcript` with 420 cards of 10 words each, rendered with Preact in Vitest's Chromium, the time of one render per kind of store change (30 runs, median and max).
- Articles: how many `CSS.highlights` ranges are new objects after a save (each new range is repainted).

## Before (25d658e)
- YouTube, Ken Robinson TED (324 cards, 2,904 words in the transcript): playing 10 s, no long task. Select + card + save: no long task; 10 gaps, 256 ms in all, longest 29 ms. One hover: 2 gaps (21, 22 ms).
- Netflix, Friends 70274124 (419 cards, 2,591 words): playing 10 s, no long task, 13 gaps of 15–19 ms (one per line change). Select in a transcript card: 5 gaps, 88 ms, longest 23 ms; save: 4 gaps, 72 ms, longest 21 ms. Select in the subtitle and three hovers: 8 gaps, 144 ms, longest 31 ms. A drag across three cards: 5 gaps, longest 31 ms. No long task anywhere.
- Wikipedia "World War II" (scrolled through, 2,220 New highlights): select: one long task of 63 ms (a 79 ms frame with no script attributed: style and paint); save: no long task, 7 gaps, 217 ms, longest 57 ms. After the save every one of the 2,220 ranges was new.
- `Transcript` render, 420 cards: a store change the cards do not show (a hover, a selection) 3.2 ms (max 6.6–10.3); the playing line moving 3.4 ms (max 8.6–11.9); one cue's spans changed 2.9 ms (max 6.2–9.2). A save classified every cue again and applied it in one store change per 50 cues: 9 full renders for Friends.

## After (564c0f1)
- YouTube, the same flow: no long task; select 10 gaps, 220 ms, longest 33 ms; save 4 gaps, 104 ms, longest 31 ms; one hover 4 gaps, longest 29 ms.
- Netflix, playing 10 s: no long task, 6 gaps of 16–19 ms.
- Wikipedia, the same flow: no long task; select 9 gaps, longest 59 ms; save 12 gaps, longest 34 ms. After the save 10 of the 2,220 ranges were new (the paragraph with the phrase).
- `Transcript` render, 420 cards: unrelated change 0.1 ms (max 0.5), line change 0.3 ms (max 1.0), one cue changed 0.1 ms (max 0.4). A save applies one store change; only the cues whose spans changed render.

## Reading
- The freeze did not reproduce on the dev Mac: no long task from Lingo before or after, and the page samplers' gaps are mostly the sites' own work (they did not move with the fix).
- Lingo's own cost per store change fell about 30× and no longer grows with the transcript; a save no longer renders the transcript once per 50 cues, and an article save repaints only the blocks that changed. On a CPU 4–6× slower than the dev Mac the old cost (3–12 ms per change, several changes per hover or selection, 9 after a save on a 20-minute episode) reaches long tasks, which fits "the whole page gets heavy".
- Selections that stayed after their card could not show (a failed lookup, no box for the card, a play from another card) kept the video paused and hover cards away, which also reads as frozen; they are now dropped (`src/content/video/selection.ts`).
