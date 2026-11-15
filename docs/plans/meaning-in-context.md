# Phase 3: meaning in context and your meanings — implementation plan

To be committed as `docs/plans/meaning-in-context.md` (English). Deleted once M4 is merged (decisions go into the spec, status and notes).

Progress (the parent session runs each step as a subagent end to end: branch, `npm run verify`, draft PR → ready → `merge-when-green.sh`, then worktree and branch removed, local main fast-forwarded):
- [x] M0. Checks before building (the user's Chrome) → notes + spec changes, one docs PR — **gate passed 2026-11-16: build M1a–M4** ([notes](../notes/meaning-in-context.md) "Decisions"; no mock change: a card without an explanation is the mock's card without that line)
  - [x] C1. API surface (every context, pairs, activation, docs)
  - [x] C2. Latency, `clone()`
  - [x] C3. Quality (300 terms with entries, 60 without; blind judged), then the explanation gate
  - [x] C4. Prompts per native language (Spanish, English; Portuguese unavailable)
- [x] M1a. Your meanings: data, messages, JSON export v2, "Use here" in the dictionary window (the button as tall as the meaning line: user, 2026-11-16)
- [x] M1b. Your meanings: hover card, Words lists, word list page (2026-11-16)
- [x] M2. `ExplanationProvider`, `core/explain/`, the explanations cache, the per-page runner (fake provider) (2026-11-16; the provider gives a session per prompt: `session(pair, instructions, signal)` → `{budget, measure, prompt, destroy}`, architecture "Parts")
- [x] M3. Chrome Prompt API provider, "In this sentence", download flow, Settings rows (2026-11-16; fake model only, the real one in M4: [architecture](../specs/architecture.md) "Meaning in context" → "Parts", [ui](../specs/ui.md) "Meaning in context and your meanings")
- [ ] M4. Real-site check in the user's Chrome, status and notes

## Context
Phase 3 was designed and mocked on 2026-11-15 (spec PR #88): [architecture](../specs/architecture.md) "Meaning in context", [ui](../specs/ui.md) "Meaning in context and your meanings", [design](../specs/design.md) "Phases". Mock artboards: `ContextMeaning`, `YourMeanings`, `WordsListsMeanings`, `WordListMeanings` and the Settings "Dictionaries and AI" rows on https://claude.ai/artifact/SMxhVni5DdE6cK8UazvqGS. Two features:
- **Your meanings** (no model needed): the user ties one meaning to each sentence a term was met in; hover cards, Words lists and the word list show them. Works in every browser.
- **Meaning in context**: Gemini Nano (Chrome Prompt API) explains a term in its sentence with the lines around it; the answer only suggests ("Fits here", "Use this meaning").

The spec asks for its checks first, because the API's shape in MV3 and the model's quality decide parts of the design. What the code has today (surveyed 2026-11-15):
- Dexie has one version (4) in `src/background/db.ts`; `term-store.ts` writes terms, sources and occurrences in one `mutate()` transaction (`tables`, :237). Occurrences are trimmed to 50 by `trimOccurrences` (:311, saved rows stay). Removal paths: `tombstone()` (:324, used by `removeTerm` and `undoSaveAll`), `importJson` (:605), `applySynced` (:711). Export is `{format: "lingo-export", version: 1}` and `parseExport` (:787) rejects other versions.
- No `clearedAt` and no `deviceId` exist yet (both come from the cloud-sync design).
- `OccurrenceView` (`protocol.ts:185`) has no source id. The dictionary window gets `here` (every line with the term) but **not which sentence it was opened from**. Video keeps `VideoPanel.ref {cue, span}` (`content/video/state.ts:80`); articles keep `cards.panelRef()` (`content/article/cards.ts:49`); a Words row opens `row.first`.
- `SenseList` in `ui/lookup/DictionaryWindow.tsx:292` renders each sense's pack text (`text`) with its display-time translation (`translated`). Hover lines come from `windowView`/`hoverView` in `content/lookup/describe.ts`.
- The translator queue (`content/translate/queue.ts`) runs one job at a time, has no abort; `translator.ts` shows the user-activation rule for downloads.
- `translation-cache.ts` (LRU by `usedAt`, `clearPair`) and the `removePack` handler (`handlers.ts:519`) are the model for the explanations cache.
- `BrowserEnv.features.builtInAi` = `"LanguageModel" in globalThis`; Settings shows a `LaterRow` "AI explanations inside the window" (`options/sections/Dictionaries.tsx:52`). (M3 removed both: the provider detects `LanguageModel` itself.)
- `t()` has no plural rules: singular forms are separate `.one` keys picked by the caller (`page.words.more.one`). The spec's "plural forms of `t()`" means this pattern.
- IndexedDB tests are `*.browser.test.ts` (Chromium and Firefox) with `freshDb()` (`src/testing/db.ts`); handlers have unit tests with fake deps.
- A sense-picking study with Gemini Nano already ran on the 2026-11 corpus in the user's Chrome 157 (`data/raw/quality/2026-11/`, git-ignored; [notes](../notes/translation-quality.md) "What was tested in round 2").

## M0. Checks before building
Run in the user's Chrome through Claude in Chrome with a **throwaway probe** (a branch that is never merged, or files in the study folder): a check-build content script and extension page that answer `window.postMessage` requests like the check build's error log does, so `javascript_tool` can drive them. Study folder `data/raw/quality/2026-11-context/` (git-ignored). Results go into a new `docs/notes/meaning-in-context.md`; spec, ui.md and mock changes follow; one docs PR. Then the user is asked (AskUserQuestion) what to build.

### C1. Where and how `LanguageModel` works in an MV3 extension (Chrome stable, record the version)
| Question | How | Result that changes the design |
|---|---|---|
| Does `LanguageModel` exist in a content script (top frame of youtube.com, netflix.com, an article; an iframe), an extension page, an offscreen document, the service worker? | probe each context | **Content script has it** → prompts run in the content script like the translator (spec as is). **Only extension pages** → prompts run in an offscreen document behind a proxy provider (M2 builds the proxy), and "Download and explain" opens Settings at the On-device AI row: the mock and ui.md change first, the user reviews |
| Availability values, download progress (`monitor` → `downloadprogress`), `contextWindow` vs `inputQuota`, `measureContextUsage` vs `measureInputUsage` (does it count the schema?) | read them; prompt a known text | Missing token counting → budget estimated from characters with a margin (M2 `context.ts` takes an estimator) |
| JSON-schema `responseConstraint`: obeyed? integer or null for `sense`? | 50 prompts | Not obeyed → prompt asks for JSON, `checkAnswer` parses tolerant JSON, retry once (already in the spec); unreliable `null` → `sense: -1` for "none" |
| Does `create()` need a user activation only when downloading? Can a click in the page's shadow DOM start it? Can an offscreen document ever download? | create in each state | Activation needed even when `available` → every explanation needs a click (no automatic start for terms without an entry: the Settings switch and ui.md change) |
| `expectedInputs` / `expectedOutputs` languages per pair: en→ja, es→en, en→es, en→pt | `availability()` per pair | A pair `unavailable` → that pair shows nothing (spec as is); record which |
| Permission, manifest key or Google's Generative AI Prohibited Uses Policy acknowledgment for extensions | Chrome docs + manifest test | A required acknowledgment → a one-time notice (mock first) and store-listing text |
| Is the model removed when disk is low; what `availability()` says then | docs | confirms "read again when the window or Settings opens" |

### C2. Latency in the user's Chrome
Prompt the same 30 terms with only the sentence, 5, 10, 20 lines and the most that fits; measure session creation, the first prompt after a browser start and later prompts (p50/p90), and whether a warm base session with `clone()` saves time.
- Picks the **budget cap**: the largest context whose p90 stays under ~5 s (proposal; the user sees the table).
- If even sentence-only prompts take over ~10 s: the automatic start for terms without an entry defaults off (the user decides).
- If `clone()` of a session holding the instructions helps: M3 keeps one base session per page.

### C3. Quality on real content (`real-content-quality` skill)
- Corpus: the 2026-11 corpus (YouTube, articles; Netflix held out, as last time). Sample ~300 terms with two or more dictionary meanings (YouTube 120, articles 100, Netflix 80) and ~60 selections without an entry.
- Prototype `core/explain` in the study folder (context collection, prompt, schema); the run goes through the probe in batches.
- Conditions: sentence only / 5 lines / the C2 cap, each with and without the site's translation (videos with a native track or `tlang`).
- Judged blind: does the meaning fit here; does `sense` name a fitting meaning (and is "none fit" right); is the JSON valid; does the Japanese read well. Terms without an entry: AI meaning vs today's literal machine translation.
- Baseline: dictionary rules 70%, Nano picking the sense without context 72%.
- **What changes the design** (proposal; the user decides at the gate):
  - Context clearly helps (fit ≥ ~85% and ≥ 10 points over 72% on the held-out set) → build M2–M3 as designed
  - It doesn't → stop after M1b (your meanings with dictionary meanings only); the spec says why
  - The site translation doesn't help → leave translations out of the context (simpler M2)
  - More lines don't help beyond a few → a small fixed count instead of the budget loop
  - `sense` often wrong → drop "Fits here" and "None of the dictionary's meanings fit here." (mock first)
  - AI not better than the literal translation for terms without an entry → no automatic start

### C4. Prompts per native language
Native languages offered: Japanese (en→ja), English (es→en), Spanish (en→es), Portuguese (en→pt). ~30 judged answers each: the answer is in the native language, `meaning` keeps to the hover length (≈25 Japanese / 40 Latin characters), the explanation reads well. Result: the instructions per language in M2's `prompt.ts`; a language that fails → that pair `unavailable` until fixed.

## M1a. Your meanings: data, messages, export, "Use here"
Branch `claude/your-meanings-data`. Works without a model; built after the gate whatever C3 says (unless the user drops it).
- **Schema** (`db.ts`): Dexie version 5 adds `meanings: "key, termId"` and `meaningChoices: "&[termId+sourceId+sentence], termId, meaningKey"`. The spec's cloud-sync changes move to the following version (architecture "Data model changes" renamed).
- **Device id**: `background/device-id.ts`, random, made on first use, in `storage.local` (the same id cloud sync will use).
- **Meaning key**: SHA-256 of (termId, from, text), base64url, in `core/meanings.ts` (`crypto.subtle`, browser-free).
- **Store** (`term-store.ts`, tables added to `mutate()`):
  - `chooseMeaning({term: SaveTermInput, place: {sourceUrl, sentence, …}, meaning | null})`: unsaved term → saved as Learning with this sentence (`origin: saved`); saved term without this occurrence → added (`encountered`); writes the meaning row if new and the choice (`at`, `deviceId`); replacing or undoing drops meanings no live choice names, locally only. Undo leaves the term saved
  - `trimOccurrences` keeps occurrences with a live choice
  - The three removal paths delete the term's choices and meanings. Re-saving from the same sentence keeps its choice
  - **Decision**: a choice is taken in only while its term is live; `clearedAt` comes with cloud sync (today's occurrences have the same gap: status "re-saving a removed word brings back one occurrence"). The spec says so
- **Export v2** (`exportJson`/`importJson`/`parseExport`): adds `meanings` and `meaningChoices`; import reads versions 1 and 2; choices merge by the later `at` (equal `at`: the smaller `deviceId`), meanings by union of `key`. Validators like `isOccurrence`.
- **Messages** (`protocol.ts`, `handlers.ts`, `client.ts` `REPEATABLE`): `chooseMeaning`; `lookup` takes the place (`sourceUrl`, `sentence`) and `LookupResult` gains `yourMeanings: {key, from, text, glossLang?, pos?, explanation?, count}[]` and `chosenHere?: key`; `OccurrenceView` gains `meaningKey?`.
- **"This sentence"** reaches the window: video `VideoPanel.ref.cue` (the card's flat text, as `termInput` saves it), article `panelRef` → `sentenceAt`, a Words row its earliest place (`row.first`). Shared in `content/lookup/` (`describeTerm` / `showPanel` take the place).
- **Matching** a stored dictionary meaning to the window's rows by part of speech and pack text (`core/meanings.ts` `matchSense`), never by index or translation.
- **Dictionary window** (`SenseList`): "Use here" per row (shown on pointer or focus, 28 px, green outline), "Used here" filled; press again to undo; meanings chosen from the AI elsewhere first with the "AI" tag; bookmark mark and "N sentences" (`.one` key) on every chosen meaning. English pack text is translated at display time like other senses.
- **Tests**: unit — key hash, `matchSense` after a pack reorder, order (here, most choices, newest), handlers. Browser (Chromium + Firefox) — term-store: choose, replace, undo, unsaved → Learning, two devices' same meaning as one row, unused meanings dropped, trim keeps chosen, removal on all three paths, re-save keeps the choice, export/import v1 and v2 with merge by `at`; `DictionaryWindow.browser.test.tsx`: Use here on hover and focus, Used here, undo, AI tag, counts, a translated definition shown as Used here. E2E (`e2e/content.spec.ts`): article → dictionary → Use here → the word is Learning; export holds version 2.
- **Mock**: render the window on the E2E article fixture (light and dark) next to `ContextMeaning`/`YourMeanings` (Meanings rows: Use here, Used here, AI tag, bookmark, counts).

## M1b. Your meanings: hover card, Words lists, word list page
Branch `claude/your-meanings-lists`.
- **Hover card**: `describeTerm` sends the hovered place; lines = the meaning chosen here, then the most used, then the dictionary's, at most three, bookmark on chosen ones (`describe.ts` `hoverView`, `HoverCard.tsx`).
- **Words lists** (`content/words/summaries.ts`, `words.ts` `toWordRows`, `ui/words/WordsList.tsx`): `termSummaries` returns each term's meanings and its choices on this source; rows with meanings chosen here get one line per meaning (bookmark, 13 px, ellipsis, its chips) in order of first appearance, then the unchosen places under the grey short meaning; meanings only elsewhere → one line with them joined by " · ". Accessible names "Places with your meaning …" / "Places with no meaning chosen, …". Same for video and article panels.
- **Word list page** (`useWordListData.ts`, `Rows.tsx`, `WordList.tsx` search, `DetailsPanel.tsx`): Meaning column shows chosen meanings; search matches them; "Where you saw it · N" grouped by meaning (AI tag, "· N"), "No meaning chosen" last. Nothing is chosen on this page.
- **Tests**: unit — row grouping and order; browser (Chromium + Firefox) — `HoverCard`, `WordsList`, `VideoPanel`, `WordList` page (groups, search on a chosen meaning, a term without meanings unchanged); E2E — after M1a's flow the word list shows the meaning and the group.
- **Mock**: hover card and window vs `YourMeanings`; Words tab (video fixture) and Words on this page vs `WordsListsMeanings`; word list page and details vs `WordListMeanings`; light and dark.
- **Real-site check** (short, M1 ships on its own): YouTube TED and a Wikipedia article in the user's Chrome — choose, undo, hover, Words, word list; error log read and cleared.

## M2. `ExplanationProvider` and `core/explain/` (fake provider)
Branch `claude/explain-core`. The gate said to build it. No visible UI (nothing runs without a provider). The study prototype (`data/raw/quality/2026-11-context/proto/explain.ts`, `explain: "needed"`) is the starting point for the prompt.
- `core/explain/provider.ts`: the interface (`availability(pair)`, `download(onProgress)`, `measure(text)`, `budget`, `prompt(text, schema, signal)`); fake in `src/testing/explain.ts`.
- `core/explain/context.ts`: fixed part + up to 5 lines alternately before/after (before first), whole lines; one `measure()` of the prompt, lines dropped from the far end while it is over the limit; returns the lines used. Lines `{text}` (no translations).
- `core/explain/prompt.ts`: English instructions, the answer in the native language, the two examples (with and without explanation) per native language, the term marked (each part of a gap phrase), numbered pack senses with parts of speech, none for a term without an entry.
- `core/explain/answer.ts`: the schema `{meaning, unusual, explanation | null, sense | null}` and `checkAnswer` (out-of-range `sense` → null, the explanation dropped unless `unusual`, empty meaning or bad JSON → retry once, then error).
- Content side `content/explain/`: lines from the transcript cards around the term's card; from the article block, then neighbour blocks; from a comment, then its thread. A runner: one prompt per page, a new term or closing the window aborts, 30 s timeout. Prompts run in the content script (C1).
- Background: `explanations` table (Dexie version 6), keyed by pair, term key, source, sentence, provider, browser major version; answer + line count; 5,000 rows LRU; cleared in `removePack` next to `translations.clearPair`; `getExplanation`/`putExplanation` messages. Never exported.
- **Tests**: unit — context (alternation, whole lines, at most 5, a long line dropped to fit, only the sentence fits), prompt snapshots per native language, answer checks; browser — the cache (LRU, key by source, cleared with a pack), the runner with the fake provider (abort, timeout, retry), context from the video and article fixtures.

## M3. Chrome Prompt API provider and the UI
Branch `claude/explain-chrome`.
- `ChromePromptApi` (`content/explain/chrome-prompt-api.ts`): detected by `LanguageModel` existing; availability per pair with `expectedInputs`/`expectedOutputs`; download with progress inside the click; `measureContextUsage` ?? `measureInputUsage`; `contextWindow` ?? `inputQuota`; `responseConstraint`; abort signal; one base session per page with the instructions, `clone()` per prompt.
- Dictionary window "In this sentence" (after the status buttons): Explain in context (sparkle, pale green, green outline); reading placeholder "Reading N lines around it…"; card (`#F6F7F9`, meaning 16 px semibold, explanation 14 px only when `unusual`, Use this meaning → M1a's `chooseMeaning` with `from: ai`, "On-device AI · N lines"); "Fits here" tag; "None of the dictionary's meanings fit here."; download text with the browser name from `BrowserEnv`, "Download and explain", progress and bar; "Couldn't explain this." + Try again; cached card at once. A term without an entry starts at once unless the setting is off.
- Settings: `explainUnknown` (default on, in `Settings`/`DEFAULT_SETTINGS`/`mergeSettings`); "On-device AI" row (Download → Downloading % → Ready, read again on open) and the switch row replace the `LaterRow`; both hidden without a provider or with the pair unavailable.
- i18n keys (`.one` forms for "N lines"); the store listing and privacy-policy notes in status "Before publishing" (sentence and lines go to the on-device model).
- **Tests**: unit — the provider over a fake `LanguageModel` global (value names, old and new API names, unavailable pair); browser (Chromium + Firefox) — window states with the fake provider (idle → reading → card, download, error and Try again, abort on another term, automatic start and the switch, unavailable pair), Use this meaning, Settings rows, nothing shown without a provider (Firefox run included); E2E — Playwright's Chromium has no model: no section, no Settings rows, no errors logged.
- **Mock**: every state of `ContextMeaning` and the Settings "Dictionaries and AI" rows rendered with the fake provider, light and dark.

## M4. Real-site check and wrap-up
In the user's Chrome (Claude in Chrome, check build, muted videos): YouTube Ken Robinson TED, Netflix Friends `watch/70274124` (Japanese track), a Wikipedia article, a YouTube comment thread. Explain in context, a term without an entry, download flow if the model is missing, Fits here, Use this meaning, cached reopen, Settings rows; timings noted. Error log read, every entry fixed or explained, cleared. Then status.md ("Where we are", known issues), spec "not built" markers removed, notes updated, this plan deleted.

## Verification (every milestone)
- `npm run check`, the touched unit and browser tests while iterating (Firefox too when the DOM changes), `npm run verify` before every push.
- Before each UI commit: render the change (E2E fixture pages or the browser tests' mounts, light and dark) and compare with the named artboards (layout, copy, colors, defaults); when they differ, the mock wins, and a needed mock change goes to the user first.
- ui.md / architecture.md updated in the same PR when the build settles a detail.
