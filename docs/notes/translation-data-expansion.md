# Translation data: ways to add more language pairs

Research notes from 2026-11-12–13. They measure which sources could add native languages (and later learning languages) under the current rules of [architecture.md](../specs/architecture.md) "Language data" (earlier research: [language-data-research.md](language-data-research.md)): human-made sources only, one source per term, and the quality gate (a pair is offered when human-made sources give a native meaning for at least **95% of the learning language's 5,000 most frequent content words**). How many people learn each pair (by native language) is in [learner-matrix.md](learner-matrix.md).

## How it was measured
- Words: the gate's 5,000 English content words (`contentWords` in `scripts/data/content-words.mjs`, the same list `npm run data:stats` uses).
- Sources were read with the recipe readers (`readTranslationTables`, `readEdition` in `scripts/data/recipes/recipe.mjs`), so a word counts as covered exactly when a recipe would give it a meaning. The runs reproduce the M9d numbers (es tables 95.1%, zh edition 36.1%, tables 88.1%, both 91.2%).
- OMW: a word is covered when one of its English WordNet synsets has lemmas in the other language. "Main senses" counts only the first synset per part of speech (WordNet orders senses by frequency).
- The measuring scripts were throwaway and are not in the repository. Raw data is in `data/raw/` (git-ignored): `kaikki-en.jsonl`, the edition extracts (es, pt, zh, id, vi; ru, fr, de, it, pl in D2–D3; tr, ko, th in D5), `omw/omw-1.4/`, `wikidata-lexemes.json.gz`.

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
| th | 62.0 | 63.8 | 92.0 | 95.8 | 93.9 | T3 (D5: under the gate with main senses) |
| id | 60.2 | 4.2 | 92.5 | 95.2 | 92.7 | T3 (D5: under the gate with main senses) |
| ko | 76.6 | 78.8 | – | 89.1 | – | T3 (D5) |
| tr | 79.4 | 66.4 | – | 86.8 | – | T3 (D5) |
| uk | 80.7 | – | – | 80.7 | – | T3 (D5; no kaikki extract of the uk edition) |
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

## D5: tr, uk, ko, id, th (measured 2026-11-19)
None passes the gate. Measured as above with the recipe readers over the gate's 5,000 words: the tables (`readTranslationTables`), the edition (`readEdition`, kaikki extracts of 2026-10-30) and OMW (`readWordnetMeanings`). "Main senses" is the OMW reader's own rule (a term whose main senses, each part of speech's first, all lack native lemmas is left out), the rule D3 gated zh with; "all senses" lets a lesser sense alone cover a term. Top 2,000 under main senses in brackets.

| Native | Tables | Native edition | OMW all / main | All | All, main senses | Tables + edition | Tables + OMW main |
|---|---|---|---|---|---|---|---|
| th | 62.0 | 63.8 | 92.0 / 85.5 | 95.8 | **93.9** (97.6) | 77.9 | 90.6 |
| id | 60.2 | 4.2 | 92.5 / 88.0 | 95.2 | **92.7** (95.7) | 61.4 | 92.6 |
| ko | 76.6 | 78.8 | – | 89.1 | **89.1** (94.7) | 89.1 | – |
| tr | 79.4 | 66.4 | – | 86.8 | **86.8** (92.9) | 86.8 | – |
| uk | 80.7 | – | – | 80.7 | **80.7** (90.6) | – | – |

- Source order, were any built: id tables, then omw-id (its edition adds 4 words: 210 of the 5,000 have an English entry there); th tables, omw-th, then the edition (it adds 169 words); ko and tr the tables and the edition, order not judged. No order was judged blind, as none passes.
- id and th pass only if a lesser wordnet sense could cover a term alone ("mall" → pusat, kompleks, plaza from its second sense, "fireman" → pemadam kebakaran from its fourth), which D1 ruled out for its wrong meanings ("realise" → "fare"). The earlier id and th figures (93.2 / 91.2, 93.3 / 90.8) were from throwaway scripts before D1's reader; the rows above replace them.
- uk: kaikki has no extract of the Ukrainian edition (its editions: cs, de, el, es, fr, id, it, ja, ko, ku, ms, nl, pl, pt, ru, simple, th, tr, vi, zh), so the edition could not be read with the recipe reader. OMW 1.4 and 2.0 have no Ukrainian wordnet; the older UkrWordNet is offline and Ukrajinet is unreleased.
- Other wordnets: KeNet (Turkish) is GPL-3.0 in its repository (Maven lists Apache 2.0); KorLex (Korean) is browse-only or research-only. Neither is allowed.
- Why words are uncovered: 20 random uncovered words per language (`samples-inspected.txt`), by class:

| Class | tr | uk | ko | id | th |
|---|---|---|---|---|---|
| English Wiktionary has tables, without a row for the language (and OMW has none) | 16 | 17 | 12 | 5 | 10 |
| Only a lesser OMW sense has native lemmas (main-senses rule) | – | – | – | 10 | 5 |
| Only a spelling variant, clipping or plural of another entry (jewelry, humor, odds, grad, oz) | 0 | 2 | 4 | 1 | 1 |
| A given name or surname in lower case (harry, charlotte, bailey, donna, jenny) | 1 | 1 | 3 | 4 | 3 |
| No tables in English Wiktionary at all (gonna, coffeehouse, funky) | 2 | 0 | 0 | 0 | 1 |
| Edition entry the reader skips: kaikki could not tell its language (ko "tramp" → 짓밟다, tr "haven" → sahip olmak, a form of "have") | 1 | – | 1 | 0 | 0 |

  Counted over every uncovered word (`gaps.json`): following variant pointers to a covered entry (jewelry → jewellery, humor → humour) would add 22 / 20 / 21 / 6 / 5 words (tr / uk / ko / id / th, at most 0.4 points), and reading the editions' entries of unknown language 28 (tr, mostly other languages' words: Bosnian Turkish "mart", ISO codes) and 53 (ko, mostly English: "labor" → 노동, "dent" → 움푹 팬 곳), 1.1 points. Neither brings any language to the gate.
- Provenance, from the page histories of 15 random gate words each edition covers (`provenance-tr-ko-th-id.txt`), and licenses (no edition decides a pass, so none was cleared for use):
  - th: 4 of 15 pages were created in 2018 by ZilentBot, "นำเข้าคำจาก Lexitron" (imported from LEXiTRON, NECTEC's dictionary), and carry {{lexitronimport}}, whose notice says LEXiTRON is used under NECTEC's own license agreement. 1,511 pages are in that template's category, among them 903 of the 3,189 gate words the edition covers, and 79 of the 169 words only the edition has. LEXiTRON's license terms could not be found (SEACrowd's copy lists it as "other" with an empty license file), so under the license rules these entries count as unknown; without them th is at 92.4% with main senses. The other 11 pages were written by hand (2006–2020).
  - ko: 6 of 15 pages were created in 2010–2011 by Gusibbot ("Automated import of articles", a bot of the editor 아흔); 4 of them were empty drafts without a gloss, filled in later, 2 came with glosses ("sunshine" → 햇빛. 일광.); the import's source is not stated. The other 9 were written by hand (2005–2010). No sign of a third-party dictionary dump like vi's, but the bot's source is undocumented.
  - tr: 3 of 15 pages were created in 2006 by VikiBot (one first as a Turkish entry), which lists among its tasks a 13,900-word German / English / French / Italian / Turkish dictionary built from another user's database (source not stated); the other 12 by hand (2006–2026).
  - id: 13 of 15 pages were written by hand by one editor in 2007, the rest by hand later; the edition adds only 4 words.
  - Wordnets: omw-id is MIT, omw-th "wordnet" (Princeton-style), both allowed (D1).
- Scripts and outputs (not committed): `data/raw/quality/d5/` (`measure.ts`, `inspect.ts`, `gaps.ts`, `provenance.ts`; `report.json`, `uncovered-<lang>.json`, the sources' meanings of the gate words, the samples).

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
3. ~~Decide on the "wordnet" license and OMW's place in the source order; then add zh.~~ Done in D1 and D3 (2026-11-18), with it and pl; id re-measured with its edition and OMW together in D5 (2026-11-19): under the gate, as are tr, uk, ko and th (section "D5").
4. Measure the T2? cells for the learning languages planned next.

## Chrome Web Store
The store page takes plain text and screenshots (1280×800 or 640×400), not HTML. A store image made from the matrix should show only the pairs Settings offers, not estimated or T3 cells, and be written in English.
