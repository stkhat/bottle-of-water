# M8d — Words in this video

> Executed with superpowers:subagent-driven-development. TDD; row building in Node, components in Vitest Browser Mode, the built extension with Playwright E2E. Before committing the UI, render it and compare with the mock.

**Goal:** the right column of the video page gets two tabs, Transcript / Words. Words lists the words and phrases of the video in order of first appearance, each with its highlight, short meaning and count, filterable by status; selecting one opens the dictionary window with its "In this video" list. Mock: `Phase 2 — words in this video` (`project/VideoWords.dc.html`), approved 2026-11-10.

## Decisions
- Rows: every word and phrase span of the classified cards except `ignored` and words known only by the frequency level (unsaved Known). So: New (unsaved), Learning and saved Known, words and phrases (decided 2026-11-10)
- Grouped by key + kind, in order of first appearance; count = number of spans in the whole video ("3×"); rows appear as batches are classified and follow status changes live
- Filter chips All / New / Learning / Known with counts, one selected at a time (All by default); the tab and filter live in the session state (per page, not saved in settings); the Transcript tab is the default
- Short meaning from the dictionary in one batch request per new set of keys (no built-in translator for the list); `lang` from `glossLang ?? nativeLang`
- Selecting a row opens the dictionary window for the term's first occurrence (`clickWord`), which lists "In this video" as today; the row of the open term is shown selected (mock: green pale background and border)
- Header (mock): L badge + a two-tab segmented control (`role="tablist"`) filling the row. The Transcript tab keeps phase 1's controls (Translation switch, Highlight chips) below the tabs; the Words tab shows the filter chips there. Same on Netflix (the side panel uses the same component)

## Tasks
1. **Data** — new request `termSummaries {lang, terms: {key, kind}[]}` → `{ [key]: { short?, glossLang?, status: "new" | "learning" | "known" } }` (protocol, client `REPEATABLE`, `handlers.ts`: saved status from the term index, `dictionary.entry(key)` for short/glossLang; dictionary loaded once). `src/content/video/words.ts`: `videoWords(cues, spans, summaries)` → rows `{key, kind, head (surface of first occurrence, or the dictionary head), category (new | learning | known), count, first: {cue, span}}` following the decisions, plus `filterCounts(rows)`. Session (`src/content/video/session.ts`): state `panelTab: "transcript" | "words"`, `wordsFilter`, `summaries`; after each analyzed batch request summaries for keys not asked yet; actions `setPanelTab`, `setWordsFilter`, `openWord(row)` (→ `clickWord` with the first occurrence). Tests: unit tests for `videoWords` (order, grouping, counts, exclusions, phrases), handler test, session browser test (summaries requested once per key, rows follow a status change)
2. **UI** — `src/ui/video/Transcript.tsx` (or a new `VideoPanel.tsx` wrapping it and a new `WordsList.tsx`): tabs, filter chips (mock styles: selected = white, `#8C92A3` border, bold; others transparent with dashed `#C9CDD6` border; counts in `#5A6075`), rows (head with the category's highlight style from `terms.tsx`, count "N×" right-aligned, short meaning one line with ellipsis, selected style), empty state when a filter has no rows (one short line, e.g. "No words here yet."). Wire through `src/content/ui/VideoUi.tsx` `TranscriptUi`. All strings via `t()`. Tests: Browser Mode for tabs (keyboard: arrow keys move between tabs per the tablist pattern), chips and counts, row click → `openWord`, selected row; E2E on the YouTube fixture (`e2e/youtube.spec.ts`): switch to Words, rows listed with counts, filter New, click a row → dictionary window with "In this video · N". Screenshot pair against the mock (Words tab with the dictionary window open) before committing

## Docs (after the tasks)
Spec: "Phase 2 screens" → Words in this video (decisions above). `docs/status.md`.

## Verification
`npm run check`, `npm test`, `VITEST_BROWSERS=chromium npm run test:browser`, `npm run build`, `npm run build:firefox`, `npm run test:e2e:build`.
