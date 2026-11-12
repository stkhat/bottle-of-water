# Translation data: ways to add more language pairs

Research notes from 2026-11-12–13. They measure which sources could add native languages (and later learning languages) under the current rules of [architecture.md](../specs/architecture.md) "Language data" (earlier research: [language-data-research.md](language-data-research.md)): human-made sources only, one source per term, and the quality gate (a pair is offered when human-made sources give a native meaning for at least **95% of the learning language's 5,000 most frequent content words**). The matrix for the Ethnologue 200 top 20 is in [language-matrix.html](language-matrix.html).

## How it was measured
- Words: the gate's 5,000 English content words (`contentWords` in `scripts/data/content-words.mjs`, the same list `npm run data:stats` uses).
- Sources were read with the recipe readers (`readTranslationTables`, `readEdition` in `scripts/data/recipes/recipe.mjs`), so a word counts as covered exactly when a recipe would give it a meaning. The runs reproduce the M9d numbers (es tables 95.1%, zh edition 36.1%, tables 88.1%, both 91.2%).
- OMW: a word is covered when one of its English WordNet synsets has lemmas in the other language. "Main senses" counts only the first synset per part of speech (WordNet orders senses by frequency).
- The measuring scripts were throwaway and are not in the repository. Raw data is in `data/raw/` (git-ignored): `kaikki-en.jsonl`, the es / pt / zh / id / vi edition extracts, `omw/omw-1.4/`, `wikidata-lexemes.json.gz`.

## English learners: coverage per native language (measured)
Coverage in %, over the 5,000 words. "All" is tables + edition + OMW.

| Native | Tables | Native edition | OMW | All | All, main senses | Tier |
|---|---|---|---|---|---|---|
| ja | 86.3 | – | 92.6 | 97.3 | 96.9 | T1 (EJDict, 100%, offered) |
| es | 95.1 | 78.3 | 83.1 | 98.7 | 98.5 | T2 (offered) |
| pt | 93.6 | 60.8 | 91.5 | 98.3 | 98.0 | T2 (offered) |
| fr | 95.0 | – | 92.5 | 98.7 | 98.5 | T2 |
| de | 95.4 | – | – | 95.4 | 95.4 | T2 |
| ru | 95.3 | – | – | 95.3 | 95.3 | T2 |
| vi | 68.4 | 98.5 | – | 99.0 | 99.0 | T2 |
| zh | 88.1 | 36.1 | 78.7 | 96.1 | 95.1 | T2 (with OMW) |
| id | 60.1 | 4.2 | 89.2 | 93.2 | 91.2 | T3 |
| ar | 79.3 | – | 59.2 | 86.5 | 84.3 | T3 |
| hi | 68.7 | – | – | 68.7 | – | T3 |
| ur | 48.1 | – | – | 48.1 | – | T3 |
| sw | 39.9 | – | – | 39.9 | – | T3 |
| bn | 39.7 | – | – | 39.7 | – | T3 |
| te | 35.3 | – | – | 35.3 | – | T3 |
| mr | 27.3 | – | – | 27.3 | – | T3 |
| arz | 19.1 | – | – | 19.1 | – | T3 |
| ha | 8.3 | – | – | 8.3 | – | T3 |
| pcm | 0.5 | – | – | 0.5 | – | T3 |

Tiers: **T1** a dedicated bilingual dictionary is the main source and the pair passes the gate; **T2** collaborative sources (Wiktionary, OMW) pass the gate; **T3** under the gate (English definition plus display-time machine translation only).

## Promising

### 1. Native languages the current recipe already passes: fr, de, ru
English Wiktionary's translation tables alone reach 95.0% (fr), 95.4% (de) and 95.3% (ru). Each needs only a recipe entry (`RECIPES` in `scripts/data/recipes/native.mjs`). The fr, de and ru Wiktionary editions are in kaikki's extracts and would add margin; they were not downloaded.

### 2. Vietnamese through its own Wiktionary edition
The Vietnamese edition defines 98.5% of the words in Vietnamese by itself (99.0% with the tables), with dictionary-like entries ("deserve" → "Đáng, xứng đáng"; "available" → "Sẵn có để dùng…"). Many of these English entries use the edition's old entry structure and look bulk-imported from an earlier English–Vietnamese dictionary. **Before use: confirm where they came from and under which license they were imported.**

### 3. Open Multilingual Wordnet (OMW 1.4) as a new source
OMW links languages through WordNet synsets, so a translation keeps the sense it was made for (unlike pivoting through English words). Measured gain on top of tables + edition:

| Native | Before | With OMW | Main senses only | OMW wordnet license |
|---|---|---|---|---|
| zh | 91.2 | **96.1** | 95.1 | "wordnet" (Princeton-style) |
| id | 61.4 | 93.2 | 91.2 | MIT |
| ja | 86.3 | 97.3 | 96.9 | "wordnet" |
| ar | 79.3 | 86.5 | 84.3 | CC BY-SA 3.0 |
| th | 62.0 | 93.3 | 90.8 | "wordnet" |

- zh passes the gate with OMW, and OMW's Chinese wordnet is in Simplified characters (the zh edition writes Traditional).
- Quality, sampled: zh is good (basically → 基本上, setback → 挫折, gravity → 重力) but needs clean-up of markers such as "婚姻+的". id is uneven (manner → cara is right, lawsuit → "sebab, hal" and don → "mengira" are wrong; the wordnet mixes in Malay). ja needs a choice among lemmas: the first lemmas are sometimes archaic (官衙, 出立ち).
- **Decisions needed:** the license policy lists public domain, MIT and CC BY-SA; the "wordnet" license (attribution only) would have to be added for zh / ja / th. Where OMW sits in the source order (after the tables, before the English definition) and how its lemmas are chosen.
- OMW 1.4 has no wordnet for hi, bn, ur, mr, te, sw, ha, ko, tr, fa or vi, so it does not help those languages.

### 4. Learning languages other than English: licensed bilingual dictionaries
- **JMdict** (ja → en): the Japanese and English parts are CC BY-SA 4.0 (EDRDG licence). Its German, French, Russian and other glosses are under separate copyright held by their compilers, so they are not usable without checking each.
- **CC-CEDICT** (zh → en): CC BY-SA 3.0 per its official site.
- HanDeDict (zh → de) and CFDICT (zh → fr) are said to share CEDICT-style terms; not verified.
- For L → en in general, English Wiktionary itself is large for es, de, pt, ru, fr, zh, ar and ja (over 200,000 senses each; es → en, 879,000 senses, measures 100%).

### 5. Later, for languages with no source: build-time machine translation of definitions
For hi, bn, ur, sw and the others, no human-made source comes near the gate. Translating `en-defs` definitions at build time with an openly licensed model (Opus-MT, CC BY 4.0) would cover every word and work in every browser. It needs a separate gate tier ("machine-translated", always marked), and quality drops for low-resource languages. It is the only option left for them; not measured or started.

## Measured or checked, not promising
| Idea | Result |
|---|---|
| Pivot through English synonyms (a word without a translation takes its synonym's) | hi 68.7 → 76.4 with main senses (84.9 with all senses); no language without other sources gets near 95%. Wrong senses come through: gosh → chihuahua, bob → surge, impress → grab, issue → sortie |
| Wikidata Lexemes (CC0; senses linked by "item for this sense" or translation claims) | +0 to +2.7 points. Almost no lexemes for hi (about 2,800 under Hindustani), ur, ko, vi, th; links are mostly concrete nouns, and sense order is not by frequency (tan → タン) |
| PanLex | License pages conflict (CC BY-NC-SA on the license page, CC0 on the snapshot pages), and many of its source dictionaries are recorded with unknown licenses; usable only if limited to sources with known open licenses. Not measured |
| Chambers English–Hindi "CC0" scan on archive.org | A commercial publisher's dictionary; the CC0 tag comes from the uploader. Not usable |
| Word alignment from parallel corpora (OPUS) | Noisy, licenses differ per corpus. Not pursued |
| ECDICT, Shabdanjali (en → hi) | ECDICT: untraceable sources (decided 2026-11-11). Shabdanjali: GPL |
| Display-time translation as the only source | Not counted by the gate (Chrome only, not reviewed) |

## Other learning languages (estimated)
Rows other than English in the matrix are estimated from source sizes (kaikki sense counts, 2026-11-13), not measured. Rules:
- T1~: a bilingual dictionary with a confirmed license (zh → en, ja → en).
- T2? (L → en): English Wiktionary has over 200,000 senses of L.
- T2? (neither is English): N's edition has over 100,000 senses of L, plus L's own translation tables or OMW for both.
- T3~: the rest. Sense counts include inflected-form entries, so they overstate size: the zh edition has 127,000 senses of English yet covers only 36.1% alone. A T2? cell means "worth measuring", not "passes".

Result: 2 T1~ and 16 T2? cells, mostly major languages → English, Chinese or French; 342 T3~ cells. South Asian and African languages have almost nothing between them.

Two of the top 20 are special: Nigerian Pidgin has no settled spelling, and Egyptian Arabic speakers usually write Standard Arabic.

## Next steps, in order of payoff
1. Add fr, de and ru recipes (no new source).
2. Check the Vietnamese edition's provenance; if clean, add vi.
3. Decide on the "wordnet" license and OMW's place in the source order; then add zh (and re-measure id with its edition and OMW together).
4. Measure the T2? cells for the learning languages planned next.

## Chrome Web Store
The store page takes plain text and screenshots (1280×800 or 640×400), not HTML. A store image made from the matrix should show only the pairs Settings offers, not estimated or T3 cells, and be written in English.
