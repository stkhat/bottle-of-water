# M2 — Data import (en pack, en→ja dictionary)

> Executed task by task with superpowers:subagent-driven-development. TDD: every test is seen failing before the code exists.

**Goal:** build-time scripts that turn EJDict-hand, kaikki (English Wiktionary) and a Wiktionary frequency list into small bundled pack files, plus the pure readers that the background will use.

**Architecture:** `scripts/data/*.mjs` (Node, streaming, no deps beyond Node) read `data/raw/` and write JSON into `public/packs/` (WXT copies `public/` into the build; the background loads them with `fetch(browser.runtime.getURL(...))`). Readers in `src/core/packs/` are pure functions over parsed JSON so they test in Node.

## Sources (pinned)
- EJDict-hand: `https://raw.githubusercontent.com/kujirahand/EJDict/2dd9e71ffcefce89b4d946ce07bf51fa0573aac0/src/{a..z}.txt` (TSV `headword(s)\tmeaning`; comma-separated headwords are spelling variants). Public domain
- kaikki English: `data/raw/kaikki-en.jsonl` (one JSON entry per line: `word`, `pos`, `forms[] {form, tags[]}`, `sounds[] {ipa, tags[]}`, `senses[]`). CC BY-SA
- Frequency: Wiktionary "Frequency lists/TV/2006" (41,284 words from TV and movie scripts; pages `Wiktionary:Frequency lists/TV/2006/1-1000` …). Fetched via the MediaWiki API (`action=parse&prop=wikitext`). CC BY-SA. Chosen because Lingo is used mostly on videos

## Output files (all committed, UTF-8 JSON, sorted keys for stable diffs)
| File | Shape | Content |
|---|---|---|
| `public/packs/en/lemmas.json` | `{ [form]: string \| string[] }` | inflected form → base form(s), only when form ≠ base and the base is in the vocabulary. From kaikki `forms` with inflection tags (plural, past, participle, present, third-person, comparative, superlative), ignoring forms tagged alternative / obsolete / archaic / dialectal / misspelling / pronunciation-spelling / nonstandard. Lowercase |
| `public/packs/en/ipa.json` | `{ [word]: string }` | US IPA: the first `sounds[].ipa` whose tags include `General-American` or `US`; words without one are left out |
| `public/packs/en/freq.json` | `string[]` | base forms in rank order (index 0 = rank 1). A form's rank counts for its base form; a base takes its best rank. Top 30,000 |
| `public/packs/en/pos.json` | `{ [word]: string[] }` | parts of speech kaikki lists for the word (noun, verb, adj → "adjective", adv → "adverb", phrase, prep → "preposition", …), for labeling meanings |
| `public/packs/en-ja/dict.json` | `{ [headword]: [short: string, senses: string[]] }` | EJDict. Headword lowercase, variants expanded to separate keys. `senses` = the meaning split on ` / `, trimmed. `short` = the first sense with `《…》` notes and `『』` marks removed, cut at the first `;` |

Vocabulary ("the words Lingo knows") = EJDict single-word headwords. Multi-word EJDict headwords are kept in `dict.json` (phrases, used by saved-phrase lookups now and phrase detection in phase 2).

## Readers (`src/core/packs/`)
- `lemmatize(form, lemmas, vocab)`: lowercase; if `form` is in vocab return `[form]`, plus any bases from `lemmas[form]`; else bases from `lemmas[form]`; else `[]`. Handles `’`/`'` and trailing possessive `'s`
- `rankOf(base, freqIndex)`: 1-based rank or `Infinity`; `buildFreqIndex(freq)` → Map
- `ipaFor(term, ipa)`: words → their IPA; phrases → the words' IPA joined with spaces (slashes stripped and re-wrapped once), `undefined` if any word lacks IPA
- `lookup(term, dict, pos)`: `{ short, senses: { pos?: string, text: string }[] }`. Part-of-speech labels: if `pos[term]` has exactly one entry, every sense gets it; if several, infer per sense from the Japanese gloss ending and accept only labels in `pos[term]` (verb: ends with a verb ending such as する/る/う/く/す/つ/む/ぶ/ぐ/ぬ or contains `…を`; adjective: ends with な/い/の/的な; adverb: ends with に/く/て/と), otherwise no label

## Tasks
1. EJDict import: fetch the 26 files into `data/raw/ejdict/`, `scripts/data/ejdict.mjs` → `dict.json`. Unit tests on a fixture TSV (variants, ` / ` split, short cleanup). Commit script + tests (+ output only after task 4)
2. kaikki import: `scripts/data/kaikki.mjs` streaming `readline` over the JSONL → `lemmas.json`, `ipa.json`, `pos.json`, restricted to the vocabulary from task 1. Unit tests on a small fixture JSONL (loaves → loaf, ferments → ferment, alternative/obsolete forms ignored, GA IPA chosen over RP-only)
3. Frequency import: `scripts/data/frequency.mjs` (MediaWiki API, cached into `data/raw/freq-en/`), parse the wikitext tables, map forms to bases with `lemmas.json`, write `freq.json`. Fixture test for the wikitext parser and the best-rank rule
4. Readers in `src/core/packs/` with tests (fixtures + a smoke test over the real files: ferments → ferment, loaves → loaf, dough has IPA `/doʊ/`, `figure out` is in dict, rank of "the" is 1-ish). `npm run data:build` runs tasks 1–3. Commit the generated files
5. Measure and record in `docs/status.md`: IPA coverage over the top 20,000 base forms, file sizes, words in the vocabulary. Add `THIRD_PARTY_NOTICES.md` (EJDict public domain; Wiktionary CC BY-SA 4.0 with attribution and link; note the derived files are CC BY-SA)

## Verification
`npm run check`, `npm test`; real-file smoke test passes; pack files total under ~15 MB.
