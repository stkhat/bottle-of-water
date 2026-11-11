# M9d — Build recipes and new native languages

> TDD: data scripts and pure logic in Node with small kaikki fixtures; the dictionary in Node with pack stubs; the built extension with Playwright E2E. Design: [language data](../specs/2026-11-11-language-data-scaling-design.md) §2–3.

**Goal:** learners of English can choose Spanish or Portuguese as their native language. Each pair's dictionary is built by a recipe that merges human-made sources in order, one source per term; `npm run data:stats` measures each pair against the quality gate, and only the pairs that pass are offered.

**Decided 2026-11-11 (user):**
- First native languages: **es, pt, zh** (learning language en). After the measurements (below), **zh is left for later**: 91.2% of the gate's words.
- **Quality gate: 95% of the top 5,000 content words** (confirmed after the measurements).
- **ECDICT is not used.** Its README and wiki list TheFreeDictionary, Linguee, Babylon, Google Translate and the unlicensed 屌丝字典 among the sources of its Chinese translations, and its maintainer writes that per-entry origins can no longer be traced (ECDICT issue #134). zh is built from the Chinese Wiktionary edition and English Wiktionary's translation tables.
- **Bundled for now:** the new packs are built into `data/packs/` (downloadable) and bundled like `es` / `es-en` until hosting starts.
- **Chinese means Simplified (zh-Hans).** Traditional can be another native language later.

## Branch
`feat/native-languages`: the shared parts below, `en-es` and `en-pt` (one PR, to save CI runs; the first plan had a branch per language).

## Measurements (2026-11-11)
Top 5,000 English content words with a native meaning: es 96.8% (edition 78.3%, tables 95.1%), pt 95.1% (60.8%, 93.6%), zh 91.2% (36.1%, 88.1%). Details in the design's §3.

## Raw data
`data/raw/` (git-ignored; a worktree links it to the main checkout's): `kaikki-en.jsonl` as before, plus the kaikki extracts of the Spanish, Portuguese and Chinese Wiktionary editions (`kaikki.org/dictionary/downloads/<ed>/<ed>-extract.jsonl.gz`, 98 / 36 / 224 MB), unpacked to `kaikki-<ed>-edition.jsonl`.

## Shared parts
- **Content words** (`scripts/data/content-words.mjs`): the top N base forms of the learning language's frequency list, without function words (a part of speech among pronoun, determiner, article, preposition, conjunction, particle, contraction, or an auxiliary such as can, will, must), contractions, single letters and names (words EJDict writes only with capitals, `data/gate/en-capitalized.json` from `ejdict.mjs`).
- **Recipes** (`scripts/data/recipes/`): `recipe.mjs` reads the sources and merges them in order; per term the first source that has it supplies its short meaning and senses, and the term records that source. `native.mjs` holds each pair's recipe and writes the pack. Sources:
  - `readEdition`: a native-language Wiktionary edition's entries for English words, defined in the native language
  - `readTranslationTables`: English Wiktionary's translation tables, per English sense; the English sense label is kept as the sense's hint (shown above "luz, lámpara")
- **Pair pack format** (`PairPack`, `<L>-<N>/dict-<n>.json` + `index.json`): `{ term: [short, [pos, text, hint?][], source] }`, `source` indexing `index.json`'s `sources`.
- **Full English definitions**: `en-defs` holds words as well as phrases (`scripts/data/en-defs.mjs`, `readEdition` over English Wiktionary; `phrases.mjs` no longer writes it), the fallback of every pair whose dictionary lacks a term; the browser's translator translates them at display time (M9b).
- **Quality gate** (`scripts/data/gate.mjs`) in `npm run data:stats`: each pair's coverage of the top 2,000 / 5,000 content words and of phrases, by source (`--json` too). A pair is offered when human-made sources cover at least the gate's share of the top 5,000 content words; the run fails when an offered pair falls under it.
- **Offered pairs from the lock**: `npm run data:publish` writes the passing pairs into the lock's `pairs`; `src/core/languages.ts` reads them instead of a fixed table.
- **Runtime**: `createPairDictionary` reads a pair pack, then `en-defs` (marked English, translated at display time), then nothing. A sense with a hint shows the hint above the native words in the dictionary window (mock `TranslatedSenses`).

## Verification
- Unit tests per script and module (fixtures in `scripts/data/fixtures/`); `npm run verify`
- `npm run data:stats` shows every offered pair over the gate
- E2E: an article with native = es shows Spanish meanings
- In the user's Chrome (`npm run build:check`): an article and a YouTube video with native es / pt, then Lingo's Errors page
