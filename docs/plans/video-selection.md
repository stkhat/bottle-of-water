# Plan: selecting words in video subtitles and the transcript, pausing while a card is open

## Context
On articles and YouTube comments, selecting 2–8 words snaps the selection to whole words and shows the phrase card ("Selected · not saved"), which saves the selection under the phrase pattern it matches. **Video subtitles and the transcript have no selection handling at all**: the text is not selectable inside YouTube/Netflix players (the player's `user-select: none` carries down), nothing reads the selection, and no phrase card is shown. That is why it "does not work".

Decisions (2026-11-13):
- Implement drag selection → phrase card → save, in the subtitle (all variants) and the transcript.
- **Pause** the video when a selection starts, and also when a word's **hover card** or **dictionary window** opens. **Resume automatically** when every card / selection is closed, only if Lingo paused it and the user did not take over playback.
- Mock: update only the YouTube notes (the card is the existing PhraseMeaning card); spec in `docs/specs/ui.md`.

## Approach

### 1. Shared word snapping (core, pure)
- Move the offset logic of `snapSelection` / `selectionKey` / `wordsOf` / `wordCount` / `MIN_PHRASE_WORDS`/`MAX_PHRASE_WORDS` out of `src/content/article/locate.ts` into a pure `src/core/selection.ts`: `snapWords(text, spans, from, to) → { start, end, spans } | undefined` and `selectionKey(text, spans)`.
- `locate.ts` keeps the DOM part (range → block offsets) and calls the core. Article behaviour unchanged (its existing tests must stay green).

### 2. Reading/setting a selection inside Lingo's shadow roots (a "browser difference" part)
- `src/ui/selection-in-root.ts`: `selectedOffsets(container)` → `{ from, to, box } | undefined` and `selectOffsets(container, from, to)`.
  - Range inside the root: `getSelection().getComposedRanges({ shadowRoots: [root] })` when it exists, else `root.getSelection()` (older Chrome); neither → feature off. Root via `container.getRootNode()` (works for closed roots from inside).
  - Offsets: walk the container's text nodes (rendered text = cue text with `\n`→space, same length, per `renderTerms`).
- Add a line to `docs/specs/architecture.md` "Browser differences".

### 3. UI components
- `SubtitleOverlay.tsx` line `<p>` and the transcript card's original text (`Transcript.tsx`): `userSelect: "text"`; new props `onSelectStart()`, `onSelect(from, to, box | undefined)`.
  - pointerdown (from user) on the text → watch `selectionchange`; first non-collapsed selection in this container → `onSelectStart` (pauses). Window `pointerup` (capture) → read `selectedOffsets` → `onSelect`.
  - `TermSpan` click is skipped while the container has a non-collapsed selection (as the article's `onClick` does).
  - After the app snaps, the component re-selects the whole words (`selectOffsets`) like the article.
- `VideoUi.tsx` `PageUi`: render the selection card like `ArticleUi` does — `<Floating anchor={phrase.anchor} onMouseDown={keepSelection}>` + `HoverCard variant="video" selection onDetails=…` (Details is needed: a selection cannot be clicked). Mark presses with `keepOpen` so the dictionary window's press-away does not misfire.

### 4. Video selection logic — `src/content/video/selection.ts` (mirrors `article/selection.ts`)
- `select({ cue, from, to, place, box })`: offsets → cue offsets (subtitle: `+ line.start`), `snapWords` with `state.spans[cue]`, `matchSelection` (existing background handler) on the cue text, `lookup.describe({ key, kind: "phrase", surface, category: "new" })`, set new state `phrase: { ref, from: place, anchor, card } | null` and `selecting: boolean` in `src/content/video/state.ts`.
- `save(status)`: `saveTerm` with display, `source()`, sentence `flat(cue.text)`, translation, `pos.timeMs` (same fields as `changeStatus` in `session.ts`); then drop the card and DOM selection, `recorder.savedFrom`, `summaries.note`, re-analyze cues so the phrase is highlighted.
- `details()`: open the dictionary window for the phrase. Extend `WordRef` with optional `selected?: { start, end, key }` so `cards.spanOf` returns a synthetic phrase span (status changes from the window then reuse `changeStatus`).
- Drop the selection on: collapsed selection, Escape, press-away, a subtitle line change (subtitle origin only), navigation.
- `VideoApp` gains `selectStart`, `selectWords`, `saveSelection`, `openSelectionDetails`, `clearSelection`; wired in `session.ts`.

### 5. Pause / resume — `src/content/video/hold.ts`
- Held while `hover || panel || phrase || selecting`. Subscribe to the store.
- Not held → held: if the video is playing, `adapter.pause()`, remember `pausedByLingo`.
- Held → not held: after ~200 ms (cancelled if held again, so moving word to word does not stutter), `adapter.play()` only if `pausedByLingo` and still paused.
- A `play` event while held (user pressed play) clears `pausedByLingo`; navigation resets.
- `PlatformAdapter` gets `pause()` / `play()`: YouTube via the page-world player API (`pauseVideo`/`playVideo` beside `seekTo` in `youtube/page.ts`, `youtube/messages.ts`), Netflix via its player (`netflixPlayer().pause()/play()` beside `seek` in `netflix/page.ts`, `netflix/messages.ts`).
- With playback paused the hover card no longer disappears on a line change; `cards.lineChanged` stays for user-driven playback.

### 6. Docs / mock
- `docs/specs/ui.md` video section: selection in subtitle/transcript (2–8 words, same card + Details) and the pause/resume rule.
- `docs/notes/language-reactor.md`: note that pausing while a card is open is now a user decision (it lists auto-pause as not adopted).
- Mock: update the `ytTry` note in `project/canvas.json` (publish per the UI mock memory).
- `docs/status.md` entry.

## Verification
- Unit: `src/core/selection.test.ts` (snapping moved from locate tests), hold logic with a fake adapter/video (pause only if playing, resume only if we paused, user play cancels, debounce).
- Browser tests: `SubtitleOverlay.browser.test.tsx` / `VideoPanel.browser.test.tsx` (selection via the Selection API in the open test shadow root → `onSelect` offsets; word click skipped after a drag); `session.browser.test.ts` (select → phrase card → save → cues re-highlighted; Details opens the window; hold pauses/resumes).
- E2E: extend `e2e/youtube.spec.ts` / `e2e/netflix.spec.ts` on the fixture pages: select two words in the subtitle → card → + Learning → highlighted; video paused while the card shows and resumes after.
- `npm run verify` must pass.
- Real sites with Claude in Chrome (check build): YouTube Ken Robinson TED and Netflix Friends 70274124 — drag in the in-video subtitle, below-video box, transcript; hover/click pause & resume; then read and clear the `lingo:check-errors` log.
- Compare the rendered card with the mock PhraseMeaning card before committing.
- Commit on `claude/video-multi-word-highlight-c09e62`, push, draft PR → ready → merge when green.

## Progress
- [x] Phase 1: selection → phrase card → save (sections 1–4)
- [ ] Phase 2: pause / resume (section 5)
- [ ] Docs, mock, real-site check, PR (section 6, verification)
