# Words lists: sort, jump to occurrences, article Words panel, translated meanings

Progress (one subagent per step, one branch `claude/sidebar-words-sort-jump-0e9acb`, one PR):
- [x] A. Spec (ui.md, architecture.md) from the approved mock
- [ ] B. Lists translate English definitions (root-cause fix)
- [ ] C. Video Words tab: sort, occurrence chips, jump
- [ ] D. Article Words panel + popup "Show words on this page"
- [ ] E. Real-site check, verify, PR, merge

## Context
User requests (2026-11-14), mock approved the same day (canvas `VideoWords.dc.html`, new `ArticleWords.dc.html`, `Toolbar.dc.html`, sticky note `wordsJump`):
- **Sort** the Words list: In order (first appearance, default) / A–Z / Most seen (count desc, ties in order). A "Sort" label + select under the filter chips
- **Jump**: clicking a row jumps to the term's first occurrence — video: seek to the start of that transcript card and play (as clicking a card does); article: scroll the occurrence to the middle of the view and outline the word for ~1.5 s. **Jump only**: rows no longer open the dictionary
- **Repeated terms**: a row with 2+ occurrences gets chips, one per place (video: the card's start time `1:09`; article: `1 2 3`). The pressed chip is filled green, the row of the last jump gets the selected row style. When the chips do not fit one line, the first ones + `+N`, which shows the rest of that row
- **Articles get a Words panel**: toolbar popup → "This page" → "Show words on this page" (articles only; video pages have the column). Panel at the page's right, 16 px from top/right/bottom, 360 px, 12 px corners, header L + "Words on this page" + × (closes). Same filter chips, sort, rows and chips. The dictionary panel opens left of it while it is open. The list covers the whole main content (not only what came near the viewport)
- **Fix**: list rows showed the English definition when no on-device translation was cached ("a list never starts a new translation"; `shortMeanings` in `src/background/handlers.ts` reads the cache only, and `createSummaries` asks each key once, so a later hover translation never reaches the row). Lists now translate too, at the lowest priority, and pick up translations the hover card / window make. Same for the word list page. Without a translator the English stays

## A. Spec
`docs/specs/ui.md`: "Words, fullscreen and past occurrences" (Words in this video: sort, jump, chips; drop "Selecting a word opens the dictionary window"); Toolbar popup "This page" button; a new "Words on this page" item under Article UI; the "a list never starts a new translation" sentence. `docs/specs/architecture.md` "Definitions translated at display time": lists translate at the lowest priority (queue order: subtitle line, window, hover card, lists). Mock wins.

## B. Translated meanings in lists
- `TermBrief`/`ShortMeaning` (`src/messaging/protocol.ts`) say when `short` is an English definition still to translate (the cleaned text the cache is keyed by) and whether it is a usage note (then the hover's rule: literal translation of the term)
- Content side (`src/content/translate/queue.ts`, `translator.ts`): rows rendered in the list ask for translations at the lowest priority; results go to `cacheTranslations` and into `summaries` (`src/content/video/summaries.ts`). When the hover card / window translates a definition, matching summaries update too
- Word list page `src/entrypoints/wordlist/WordList.tsx`: same with the page's translator when it exists
- Tests: summaries update after translation, queue priority, no translator → English

## C. Video Words tab
- `src/content/video/words.ts`: `VideoWord.cards: number[]` (distinct cards in order, same filters as now; `cue` index is the card index); `sortRows(rows, sort, lang)`
- `state.ts`: `wordsSort` per video like `wordsFilter` (default `"order"`); last jump (row + chip) for the pressed styles
- `src/ui/video/WordsList.tsx` + `VideoPanel.tsx`: sort select, chips (+N), row and chip → `onJump(card)`
- `VideoUi.tsx`: rows with card times (`state.cues[i].startMs`), `onJump` → `app.seekToCue(card)` (`session.ts`, seeks and plays)
- i18n keys; tests `words.test.ts`, `WordsList.browser.test.tsx`

## D. Article Words panel
- Share the grouping with videos (units = cards or text blocks); move `WordsFilterChips` / `WordsList` / sort to `src/ui/words/` for both
- `src/content/article/article.ts`: opening the panel analyzes every in-scope block (batched as `visibility.ts` does); rows from `spans` over `pageText.blocks().filter(inScope)`; summaries as in B
- Jump: `rangeOf(block, start, end)` → `scrollIntoView({block: "center", behavior: "smooth"})` + the clicked-word outline for ~1.5 s
- `ArticleUi.tsx`: the panel; dictionary panel left of it while open
- Popup: page message `pageShowWords` (`src/messaging/page-protocol.ts`), handled in `handlePageRequest`; button in `Popup.tsx` "This page" (articles only)
- Tests: browser tests for full analysis on open, rows, jump, popup message

## E. Check and land
Render the Words tab, the article panel and the popup and compare with the mock. Real sites in the user's Chrome (Claude in Chrome, muted videos): YouTube Ken Robinson TED and Netflix Friends — sort, chip jump lands on the card start and plays, Japanese meanings in rows; an English article — popup button, full list, chip scroll + outline; then the `lingo:check-errors` log read, explained, cleared. `npm run verify`, draft PR → ready → `merge-when-green.sh`.
