# Translation data: ways to add more language pairs

Research notes from 2026-11-12–13. They measure which sources could add native languages (and later learning languages) under the current rules of [architecture.md](../specs/architecture.md) "Language data" (earlier research: [language-data-research.md](language-data-research.md)): human-made sources only, one source per term, and the quality gate (a pair is offered when human-made sources give a native meaning for at least **95% of the learning language's 5,000 most frequent content words**). How many people learn each pair (by native language) is in [learner-matrix.md](learner-matrix.md).

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
| fr | 95.0 | 98.0 | 92.5 | 98.7 | 98.5 | T2 (offered, D2: tables and edition, 98.7; WOLF not allowed) |
| de | 95.4 | 56.4 | – | 96.1 | – | T2 (offered, D2) |
| ru | 95.3 | 91.2 | – | 97.8 | – | T2 (offered, D2) |
| vi | 68.4 | 98.5 | – | 99.0 | 99.0 | T2 |
| zh | 88.0 | 36.1 | 78.7 | 96.1 | 95.1 | T2 (offered, D3: tables, edition, OMW, 95.1) |
| it | 91.5 | 87.2 | – | 98.2 | 98.2 | T2 (offered, D3: tables, edition, OMW) |
| pl | 91.0 | 99.4 | – | 99.5 | 99.5 | T2 (offered, D3: edition, tables, OMW) |
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
English Wiktionary's translation tables alone reach 95.0% (fr), 95.4% (de) and 95.3% (ru). Each needs only a recipe entry (`RECIPES` in `scripts/data/recipes/recipes.ts`). The fr, de and ru Wiktionary editions are in kaikki's extracts and would add margin; they were not downloaded.

**Built in D2 (2026-11-18)**, with the editions (kaikki extracts of 2026-10-30: ru 2.6 GB, fr 6.3 GB, de 3.1 GB unpacked). Top 5,000 / 2,000 / phrases, by recipe:

| Native | Tables alone | Edition alone | Edition first | Tables first | Chosen |
|---|---|---|---|---|---|
| ru | 95.32 / 96.80 / 17.45 | 91.16 / 94.50 / 4.37 | 97.78 / 98.30 / 18.67 | 97.78 / 98.30 / 18.67 | tables first |
| fr | 95.04 / 96.65 / 23.08 | 97.98 / 98.55 / 11.55 | 98.70 / 98.95 / 27.54 | 98.70 / 98.95 / 27.54 | edition first |
| de | 95.36 / 96.60 / 23.88 | 56.38 / 70.05 / 1.53 | 96.14 / 97.20 / 24.35 | 96.14 / 97.20 / 24.35 | tables first |

Both orders cover the same terms, so the order was judged blind, X/Y in random order, by a hover's first three lines: 50 random words of the top 5,000 that both sources have (edition preferred / tables preferred / alike: ru 10 / 18 / 22, fr 5 / 3 / 42, de 4 / 18 / 28), then for ru and de 60 tokens sampled from the 2026-11 corpus where the order changes the hover (79% of shown word tokens in ru, 70% in de; tokens: ru 7 / 15 / 38, de 16 / 19 / 25). The German edition defines English words by description ("eine unangenehme Empfindung auf der Haut" for itch, where the tables say Jucken); the Russian one writes labels, abbreviations and sense references into the gloss ("неисч. время [1]", "воен. полковник", "то же, что night owl"). Wiktionnaire translates, like Wikcionario. Seen with the tables first: their sense order on common verbs ("go" → говорить / machen, "to say" first), tables whose items are example sentences ("would" → "We sat on the bench, опоздает ли автобус."), a few dialect words under German (Alemannic "Huus", "Zit" in a list's later items).

**Built in D3 (2026-11-18): zh, it, pl**, with OMW 1.4 and the zh (2026-11-12), it and pl (2026-10-30) edition extracts (zh 2.0 GB, it 0.5 GB, pl 1.1 GB unpacked). Top 5,000 / 2,000 / phrases; OMW under the reader's main-senses rule (a term whose main senses lack native lemmas is left out):

| Native | Tables | + wordnets | + edition (as built) | Edition alone | Built |
|---|---|---|---|---|---|
| zh | 87.96 / 93.00 / 17.90 | 93.64 / 96.00 / 23.21 | 95.14 / 96.55 / 25.65 | 36.12 / 42.65 / 6.76 | tables, edition, Chinese Open Wordnet |
| it | 91.46 / 95.30 / 13.10 | 96.86 / 97.90 / 18.78 | 98.20 / 98.75 / 19.17 | 87.16 / 93.15 / 1.32 | tables, edition, MultiWordNet, ItalWordNet |
| pl | 90.96 / 94.65 / 23.92 | 94.48 / 96.40 / 27.49 | 99.54 / 99.60 / 30.97 | 99.38 / 99.50 / 11.64 | edition, tables, plWordNet |

- zh tables: kaikki codes Mandarin rows cmn (90,142) or zh (3,178), and also codes zh the rows of other varieties nested under "Chinese" (Hokkien 783, Dungan 538: "мәмә" for bread), so the recipe keeps the rows named "Chinese Mandarin" (`tables.langs`). cmn alone gives 80.86%; cmn and zh with every row 88.12%; Mandarin rows 87.96%. Each row writes "traditional /simplified" ("麵包 /面包"); the simplified form is kept. The gate's earlier estimate (96.1%) counted wordnet senses beyond the main ones.
- pl: plWordNet brings the tables to 94.5% only (95.3% if a term could take a lesser sense alone), so pl needs Wikisłownik, which translates ("bread" → chleb, pieczywo; "give" → dawać, oddawać, przekazywać) and alone reaches 99.4%.
- Order, judged blind by subagents (A / B preferred, top-5,000 words then corpus tokens where the order changes the hover): zh tables vs wordnet 20 / 9, 27 / 12; tables vs edition 22 / 4, 21 / 21; edition vs wordnet after the tables 19 / 10, 32 / 13. it tables vs wordnets 25 / 13, 28 / 7; tables vs edition 16 / 9, 15 / 16; edition vs wordnets after the tables 15 / 12, 22 / 27 (even). pl edition vs tables 18 / 8, 20 / 17; edition vs plWordNet after the tables 32 / 5, 39 / 5.
- Simplified characters: OpenCC 1.4.2's TSPhrases (483 phrases) and TSCharacters (about 4,000 characters) over every source; the zh edition's glosses are traditional ("麵包" → 面包), the tables' and the wordnet's are already simplified. The zh edition also leaked page structure into 307 glosses ("adoring\n====翻译====\n翻译\n* 汉语：深情款款"): a gloss is cut where a heading or list item starts, and dropped when only the headword was before it. Sampled 30 zh senses (10 per source): the wordnet's are clean after D1's marker clean-up ("团的, 附属于团的", "衣架, 挂衣钩"); the edition's are dictionary lines, some long with notes ("没有味道的，乏味的").

### 2. Vietnamese through its own Wiktionary edition: not used (user, 2026-11-18)
The Vietnamese edition defines 98.5% of the words in Vietnamese by itself (99.0% with the tables), with dictionary-like entries ("deserve" → "Đáng, xứng đáng"; "available" → "Sẵn có để dùng…"). Provenance, checked 2026-11-18: these English entries (about 98% of the gate's 5,000 words have a sense from them) were imported in 2006 by the bot PiedBot from the Free Vietnamese Dictionary Project's English–Vietnamese database (Hồ Ngọc Đức, GNU GPL; [Wiktionary:Nguồn gốc/FVDP](https://vi.wiktionary.org/wiki/Wiktionary:Nguồn_gốc/FVDP), [Thành viên:PiedBot](https://vi.wiktionary.org/wiki/Thành_viên:PiedBot)). The only permission for GFDL use is a one-line email from the author (2006-05-19), with no explicit CC BY-SA grant. Without those entries the edition covers about 0.4–2%. **Decision: not used; revisit only with a written CC BY-SA or CC BY grant from the author.**

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
- **Decided** (user, 2026-11-18; built in D1): attribution-only licenses (CC BY, ODC-BY, WordNet-style) are allowed; OMW sits after the tables, before the English definition; lemma choice and clean-up are general rules (architecture "Native meanings and the quality gate"). OMW's French wordnet (WOLF) is CeCILL-C, which is not allowed, so fr goes without it.
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
1. ~~Add fr, de and ru recipes (no new source).~~ Done in D2 (2026-11-18), with their editions (section 1).
2. ~~Check the Vietnamese edition's provenance; if clean, add vi.~~ Checked 2026-11-18: its English entries come from a GPL dictionary with no CC BY-SA grant, so vi is dropped (section 2).
3. ~~Decide on the "wordnet" license and OMW's place in the source order; then add zh.~~ Done in D1 and D3 (2026-11-18), with it and pl; re-measure id with its edition and OMW together (D5).
4. Measure the T2? cells for the learning languages planned next.

## Chrome Web Store
The store page takes plain text and screenshots (1280×800 or 640×400), not HTML. A store image made from the matrix should show only the pairs Settings offers, not estimated or T3 cells, and be written in English.
