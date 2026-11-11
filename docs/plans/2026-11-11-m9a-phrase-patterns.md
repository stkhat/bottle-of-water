# M9a — Phrase patterns and selections

> Executed with superpowers:subagent-driven-development. TDD: the matcher, data scripts and classifier in Node; UI in Vitest Browser Mode; the built extension with Playwright E2E. Design: [language data](../specs/2026-11-11-language-data-scaling-design.md) §4.

**Goal:** phrases keep Wiktionary's wording, with slots (`one's`, `someone`, …) and gaps (phrasal verbs). Automatic highlighting stays as strict as today. Saved phrases and selections match with slots and gaps. A selection is saved under the key of the pattern it matches.

## Pattern model
- A pattern is its key's words. A word is either a **slot** (from the language's rules) or a **literal**. A literal matches a token whose lowercased written form, or any of whose base forms, equals it: "spilled the beans" matches `spill the beans`, but "spill the bean" does not.
- Flags:
  - `detect`: no slot, and the existing filters pass (no be/have/do start, the rank thresholds, not a non-constituent).
  - `gap`: in a Wiktionary "phrasal verbs" category. Up to `maxGap` words may come after the first word ("figure it out" → `figure out`).
- Tokens inside a match, and inside a gap, are separated only by whitespace (as `joinedToNext` today).
- English rules (`src/core/phrases/en.ts`):

  | Slot | Filled by |
  |---|---|
  | `one's` | my, your, his, her, its, our, their, one's |
  | `someone's` | the same words, any word ending in 's / ’s, someone's |
  | `someone` | me, you, him, her, us, them, someone |
  | `something` | it, this, that, them, something |
  | `oneself` | myself, yourself, himself, herself, itself, ourselves, yourselves, themselves, oneself |

  `maxGap` is 3. At build time, somebody / sb are written `someone`, sth `something`, and somebody's `someone's`.
- Spanish rules (`es.ts`): slots `alguien` and `algo`, each filled only by itself; no gaps. Later languages add their own rules.
- Modes:
  - **detect**: `detect` patterns only, contiguous.
  - **saved**: the user's saved keys, parsed with the same rules. Slots apply, and the gap applies when the pack flags the key `gap`.
  - **select**: every pattern, with slots and gaps.

## Data
`en/phrases.json` and `es/phrases.json` become `PhrasesPack = { detect: string[]; more: string[]; gap: string[] }`:
- `detect` and `more` are disjoint, sorted by code unit, and together are every pattern
- `gap` is a subset of the two
- `more` holds patterns with slots, and kaikki patterns starting with be/have/do. Those are fine when the user selected them, and were left out only for detection

A pattern's word must be:
- in the vocabulary,
- a form in `lemmas.json`,
- or a slot word.

So inflected keys such as `spill the beans` now come in. `en-ja/phrases.json` and `en-defs` are keyed by pattern key and cover every pattern. Every file stays under 4 MB (`pack-sizes.test.ts`).

## Spans
A match that has a gap becomes **one span per contiguous part**. Each part carries the phrase's `key`, `kind: "phrase"`, `category`, and `part: { index, count }`. The words in the gap keep their own spans. The span list therefore stays ordered and non-overlapping, so renderers keep working. Counters count a phrase once (`part.index === 0`): the Words tab (`src/content/video/words.ts`) and "save all" keys.

## Tasks
1. **Matcher** (`src/core/phrases/{pattern,matcher,en,es}.ts` + tests)
   - The matcher is a trie over pattern words. A slot child matches its fillers; a gap pattern lets the walk skip 0–`maxGap` words after its first word
   - `createPhraseMatcher({ rules, patterns, lemmas })` exposes `longestAt(words, i, mode, saved?)` and `matchSelection(words, from, to)`
   - Select picks the match covering the most selected words. Among those, the longest match wins, so the sentence decides when the selection is part of a longer pattern. Ties go to the earliest start
   - Cases to test:
     - made up her mind → `make up one's mind`
     - pull Anna's leg → `pull someone's leg`
     - figure it out → `figure out` in saved and select modes, but not in detect mode
     - a four-word gap: no match
     - spilled the beans → `spill the beans`
     - a comma inside the phrase breaks the match
     - a selection of "made up" in "she made up her mind" → `make up one's mind`
     - a selection that matches nothing → undefined
2. **Data** (`scripts/data/phrases.mjs`, `es-kaikki.mjs`, fixtures, `types.ts`)
   - Implement the rules above, plus the slot normalization
   - Fixture cases:
     - make up one's mind (more)
     - pull somebody's leg → `pull someone's leg`
     - figure out (detect and gap)
     - spill the beans (detect, with an inflected word)
     - be all ears (more)
   - Run on the real dumps. Record the counts and sizes in `docs/status.md`. Update the smoke tests (`src/core/packs/packs.smoke.test.ts`, `classify.smoke.test.ts`) and the stats (`stats.mjs` phrase meanings by source over all patterns)
3. **Pack and classifier**
   - `LanguagePack` gains `patterns: PhrasePatterns` and `rules: PhraseRules`. `phrases` stays as the set of `detect` keys for code that only needs detection
   - `language-resources.ts` builds both
   - `classify.ts` uses the matcher: a saved match (the longest, with slots and gaps) wins over the longest detect match. Keep the `overLearning` rule. Gap matches become part spans
   - Update `words.ts` counting, `history-keys.ts` (phrase ids once) and `locate.ts` (`wordsOf` leaves parts alone). Update the test fixtures in `src/background/test-packs.ts` and `src/content/article/test-background.ts`
   - Cases to test:
     - saved `make up one's mind` → "made up his mind" is one Learning span
     - saved `figure out` → "figure it out" is two part spans, and "it" keeps its word span
     - detected phrases are unchanged in the existing tests
4. **Selection → pattern key**
   - New request `matchSelection { lang, text, start, end }` → `{ key?: string }`. Add it to `protocol.ts`, `handlers.ts` and the REPEATABLE map in `client.ts`. The handler tokenizes the block and runs select mode on the words inside `[start, end)`
   - Article `onSelection` asks for the key and keeps it in `store.phrase`. `savePhrase` saves under `key ?? the words' keys joined`
   - Handler test, article Browser Mode test: select "made up her mind", save it, and get the saved key `make up one's mind`
5. **Phrase bar (after the mock review)**
   - Build the bar as the mock's `PhraseMeaning` artboard shows it: "Save “{key}” as a phrase" with the phrase's short meaning (from `lookup`). With no pattern, show the literal translation with the "Machine translation" mark. Strings go in `locales/en.json`
   - Browser Mode tests. E2E on the article fixture: select "made up her mind", check the bar, press + Learning, and check that a later "made up his mind" is highlighted Learning
   - Compare the rendered bar with the mock before committing

## Verification
- `npm run verify`, `npm run build:firefox`
- Every pack file stays under 4 MB; record the zipped size
- Real sites (Claude in Chrome, check build): select and save a slot phrase on an article, and see a saved phrasal verb with a gap highlighted on YouTube
