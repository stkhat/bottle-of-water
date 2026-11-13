# Highlight and video UI fixes

Progress (one subagent per step, one branch `claude/highlight-feature-fixes-0dea49`, one PR):
- [x] A. Details button always on the hover card (item 3) + white outline on the L / ^ group (item 4), mock and spec
- [x] B. Netflix L group height (item 5)
- [x] C. Selection partly over an existing highlight (item 2)
- [x] D. Meta-label definitions such as "A mild intensifier." (item 6)
- [x] E. Freeze while selecting: measure, then fix (item 1) — not reproduced on the dev Mac; render and stuck-state fixes, `docs/notes/selection-performance.md`
- [ ] F. verify, PR, merge


## Context
The user reported six problems from real use (YouTube / Netflix / articles):
1. Highlighting (selecting words) sometimes freezes — the user says **the whole page gets heavy and stops responding**.
2. Words cannot be saved as a phrase when part of the selection is already highlighted.
3. The hover card should always have a "Details" button (over video it shows the hint "Click the word for details" instead).
4. The green outline around the L / ^ group in the player bar should not be green → **translucent white outline** (user's choice).
5. On Netflix the L group sits at a different height from Netflix's own buttons.
6. "I mean" shows マイルドなインテンシファイア: Wiktionary's "A mild intensifier." machine-translated.

User decision for 2: **save the selected words as they are**; only a pattern that contains the whole selection replaces it, and a saved phrase is drawn in preference to an automatic (detected) highlight.

Branch: `claude/highlight-feature-fixes-0dea49` (this worktree). One commit per item, draft PR at the end.

## 1. Freeze (page heavy) — measure, then fix
Prime suspect (code reading, not yet reproduced): every store `set` re-renders the whole transcript.
- `src/ui/video/Transcript.tsx:152-160` renders every `<Card>` with `{...props}` and no memo; `TranscriptUi` (`src/content/video/VideoUi.tsx:361`) gets a fresh render on every store change (selection start/select/describe, hover, line changes, hold), with new inline handler functions each time.
- After a save, `analyzeAll` (`src/content/video/session.ts:347-374`) re-classifies every cue and does one `store.set({spans})` per 50 cues → N full transcript renders + `videoWords` recompute. Articles: `saved()` → `reanalyze()` of every block (`src/content/article/article.ts:221-224, 314-316`).

Steps:
- First measure in the user's Chrome (Claude in Chrome, check build) on a long transcript (Netflix Friends 70274124, YouTube Ken Robinson TED) and on a long article: count long tasks with a `PerformanceObserver("longtask")` while selecting words, opening the card and saving. Record the numbers in `docs/notes/` (before/after).
- Fixes (keep those the measurement supports):
  - `Card` → `memo` with a comparison of what a card shows (index, cue, now, its spans entry, its translation, showTranslation, highlight, selection state); handlers read through a ref / stable callbacks so new closures do not defeat the memo.
  - After a save, re-classify only the cues/blocks that contain the saved phrase's words (fall back to all when unknown), and apply the result in one `store.set`.
- Stuck-state fixes found on the way (cheap, real bugs):
  - `src/content/video/selection.ts:205` / `:109`: a failed lookup or a missing anchor box drops the selection (clears `selecting`, releases the hold) instead of leaving the video paused with hovers suppressed.
  - A transcript selection is cleared when the video starts playing (`seekToCue` now plays, 0f38bee; `lineChanged` only clears subtitle selections, `selection.ts:222-224`).
  - `src/content/video/hover-intent.ts:50-53`: do not mark a hover "shown" when `cards.ts:90` suppressed it.
- Tests: browser tests for the memoized card (a store change unrelated to a card does not re-render it — count renders), session tests for failed lookup → selection dropped, play → transcript selection cleared.

## 2. Selection partly over an existing highlight
- `src/core/phrases/matcher.ts:328-348` `matchSelection`: use a pattern only when its span (first..last word, gap words included) contains every selected word. Keeps "made up" → `make up one's mind` and "made it up" → `make up`; "give up on it" with `give up` saved now stays "give up on it". Update `matcher.test.ts` (the "ties to the earliest start" case changes) and add partial-overlap cases.
- `src/core/selection.ts` `snapWords`/`wordsOf`: a contiguous saved phrase that the selection only partly covers counts as its words (as detected phrases do already) instead of widening the selection to the whole phrase; gap phrases still widen. Keys per word must be real bases (not slot words); where they cannot be, keep the phrase whole.
- `src/core/classify.ts:275-307`: saved phrases first — find saved matches left to right, then fill detected phrases only where they do not overlap a saved one. Today a detected phrase starting earlier swallows a saved one starting later, so a newly saved overlapping phrase never shows.
- Native drag: a press inside the painted (snapped) selection starts a text drag in Chrome. Collapse the existing selection on pointerdown in Lingo's text (video `src/ui/video/text-selection.ts`, article `src/content/article/interactions.ts`), and add the missing `pointercancel` handling in `interactions.ts`.
- Tests: `classify.test.ts` (saved phrase after an overlapping detected one is drawn), `selection.test.ts`, `phrase-ui.browser.test.tsx` / `mount.browser.test.tsx` (select over a highlighted phrase → card shows the selected words → save → highlighted).
- Spec `docs/specs/ui.md:108` (Article UI selection rule) and the video "Selecting words" bullet.

## 3. Details button always on the hover card
- `src/ui/lookup/HoverCard.tsx`: `onDetails` becomes required; drop the hint branch (`:196-200`) and `hover.hint` from `src/i18n/locales/en.json` (knip).
- Video: add `openHoverDetails()` to `VideoApp` (`src/content/video/state.ts`, `session.ts`), reading `store.get().hover.ref` and calling `cards.clickWord(ref)`; pass it at `VideoUi.tsx:580-586`.
- Tests: `HoverCard.browser.test.tsx` (hint tests → Details always), e2e `extension-errors.spec.ts` lines ~429, 532, 624, 640, 840 (`hover.hint` → Details button), plus one test that Details on a video hover opens the dictionary window.
- Spec `docs/specs/ui.md:38`; mock: the video hover cards end with Details.

## 4. L / ^ group outline → translucent white
- `src/ui/video/PlayerButtons.tsx:23-35`: border `1.5px solid rgba(255,255,255,0.55)`-ish, background a light translucent white instead of the green tint (L's own green fill when on stays). Pick values that read on both YouTube and Netflix bars; check by screenshot.
- Test `PlayerButtons.browser.test.tsx:41-46`; spec `ui.md:63` ("one outline", not green); mock player-bar groups.

## 5. Netflix L group height
- Measure on netflix.com (Claude in Chrome): the control row's `align-items`/height, `DIV.medium` and button boxes vs the `lingo-player-buttons` host box.
- Fix in the Netflix adapter, not the shared host style in `src/content/video/mount.tsx:146-151` (YouTube is right): e.g. a Netflix host style with `align-self: center` and the wrapper's height (adapter hook for the host style, `src/content/video/netflix/adapter.ts`). Record the measurement in `docs/notes/netflix.md`. Give `tests/fake-netflix-player.ts` the measured row CSS and assert the vertical centre matches a sibling button in `src/content/video/netflix/mount.browser.test.tsx`.

## 6. Meta-label definitions ("A mild intensifier.")
General rule (NATIVE layer, no word lists), per `.claude/skills/real-content-quality/SKILL.md`:
- `src/core/lexicon/definitions.ts` `isUsageNote`: also a definition whose head only names a function — intensifier / filler / hedge / discourse marker / filled pause, "An indication of/that…", "A phrase/word used…", "Serves/Functions as…" — **only for non-nominal senses** (pass the part of speech; nouns like "umbrella term", "question word" stay meanings). Keep "An expression of surprise." a meaning (existing test).
- Effect: hover (`src/content/lookup/describe.ts:238-254`) translates the phrase itself, as for "not to mention"; the build (`scripts/data/senses.ts:221`) demotes these senses. Rebuild `npm run data:en-defs`, update the pack lock.
- Consistency: `translateSenses` (`describe.ts:330-377`) and `shortMeanings` (`src/background/handlers.ts:171-197`) must not translate/cache a usage-note short, so word lists and transcript summaries match the hover.
- Measure: list every en-defs short the new rule flips; judge a sample blind on a fresh set (precision), record in `docs/notes/translation-quality.md`. Tests in `definitions.test.ts`, `describe.test.ts`.

## Mock and docs
- Mock (https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS, see memory reference-ui-mock): video hover cards with Details; player-bar group outline white. Update `docs/specs/ui.md` to match.
- `docs/status.md`: note the fixes.

## Verification
- Touched unit/browser tests while iterating; `npm run verify` before the push.
- Render the changed UI (HoverCard over video, PlayerButtons) and compare with the mock by screenshot.
- Real sites in the user's Chrome (Claude in Chrome, check build, video muted): Netflix Friends + YouTube TED — select over a highlighted phrase and save; Details on a video hover; outline colour; Netflix L height; "I mean" hover; long-task counts before/after. Finish with the lingo:check-errors log snippet, fix/explain entries, clear the log.
- Commit per item, push, open a **draft** PR.
