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

## Round 2: French and German as learning languages (L0, measured 2026-11-19)

fr→en and de→en pass the gate from English Wiktionary alone (96.5% and 96.7% with main senses; 97.6% and 98.5% with the French and German editions' own English translation tables). No pair from French or German to another offered native passes: the closest is de→fr at 94.6% (95.3% with reversed tables, below), then de→ru 92.1%, de→pl 90.8% and fr→pl 88.9%.

### Method

- **Gate words**: the top 5,000 content words (`GATE.top`, as for English and Spanish), from a subtitle frequency list on Wiktionary, as English uses "Frequency lists/TV/2006": French "Frequency lists/French/OpenSubtitles Top 20K" (Hermitd's OpenSubtitles counts, lower case, 19,993 forms; 9,982 read for 5,000 words); German "Frequency lists/German/TV and movie subtitles (2009)" (Matthias Buchmeier, 25 million tokens, CC BY-SA / GFDL / LGPL, case kept, 380,000 ranks; 10,686 read). Cross-checked on hermitdave/FrequencyWords 2018 `fr_50k` and `de_50k` (OpenSubtitles, CC BY-SA 4.0, lower case) and the Leipzig "Frequency lists/German/Mixed web 3M" (CC BY): within 0.7 points for fr→en and de→en (table below).
- **Base forms**: a list form is read as the headword the UD treebanks write it as inside sentences (lower case or capitalised; without evidence the one spelling the English edition has, else lower case: "Komm", "Ehrlich" are sentence starts, "Socken" is Socke's plural). Its base is a base the English edition's form-of / alt-of senses name (headwords only: kaikki's `form_of` can hold a phrase, "the third person singular or plural"), one with an English meaning first, then the one the treebanks lemmatize the form to most often; a form with a meaning of its own keeps it unless the treebanks lemmatize it to the base more often than to itself ("été" → être; not "origine" → originer or "halte" → halter: the form-of senses name every rare homograph). The L edition's form-of senses only for a word the English edition has no meaning for.
- **Vocabulary**: a base counts only when the learning language's own edition (Wiktionnaire, de.wiktionary) has it with a meaning: an independent dictionary, as EJDict's headwords are for English. The Spanish pack's vocabulary is the English edition's own words, which is why es→en measures 100% by construction; measured this way es→en is 99.2% from the English edition (main senses), which calibrates the method.
- **Left out**, as for English: function words (a closed class among the English edition's parts of speech), the auxiliaries (être, avoir; sein, haben, werden), single letters, words with an apostrophe, names (every part of speech a name), and in French words written only capitalised (David, Paris); German capitalises its nouns, so not there. French: 885 names, 133 function words, 305 forms in neither edition (English quotations, typos); German: 322, 156, 1,108 (subtitle OCR errors "lch", "lhr", English words).
- **Main senses** (the counterpart of the wordnet reader's rule): a source covers a word only with a meaning of its main class, noun, verb, or adjective-or-adverb (UD tags German adverbial adjectives ADJ: "lange", "erst"); for other classes (interjections, particles, numerals) any meaning counts, as each edition labels them differently. The main class is the treebanks' most frequent open-class tag of the lemma with a tenth of its tokens at least (a closed-class or PROPN tag is skipped: German separable particles "zurück", "her" are ADP, "nicht" PART), a verb's ADJ tokens counting as the verb (HDT lemmatizes "überrascht" as überraschen); else the L edition's first part of speech. The surface form's own entry counts too (a participle adjective, "verrückt"). Treebanks for the measurement only: French GSD, Sequoia and ParTUT, German GSD and HDT (licenses below).
- **Sources**, per native N: N's edition's French or German entries (a sense with a gloss that is no form-of or alt-of sense); the L edition's own translation tables (rows coded N; zh or cmn for Chinese); reversed tables, N's edition's own-language entries whose tables list the French or German word (ru "собака" → de Hund gives Hund the meaning собака: a direct link, no pivot, but a kind of source no recipe reads yet, so shown apart); wordnets: OMW's French wordnet (WOLF) is CeCILL-C, not allowed; OMW 1.4 has no German wordnet, and OdeNet (CC BY-SA 4.0, linked to Princeton WordNet by ILI) was "completely automatically created" and is "automatically linked to the Princeton WordNet with some hand checking" (its README; the lexicon says confidenceScore 0.6), so it is no human-made source and does not count; it is measured for information. Raw data: kaikki extracts of 2026-10-30 (English edition: French 593 MB, German 1.1 GB; ja edition 447 MB downloaded; the es, pt, ru, fr, de, zh, it, pl editions from D2–D3).

### Coverage

Top 5,000 content words, in %. Edition and tables: all senses / main senses. "All" is the edition and the tables; "+ reversed" and "+ OdeNet" add those to "All, main senses".

French (`fr-os20k`):

| Native | Native edition                | French tables | All  | **All, main senses** | Top 2,000 | + reversed | + OdeNet |
| ------ | ----------------------------- | ------------- | ---- | -------------------- | --------- | ---------- | -------- |
| en     | 97.3 / 96.5 (English edition) | 94.6 / 93.7   | 97.9 | **97.6**             | 99.0      | –          | –        |
| pl     | 87.9 / 86.7                   | 63.7 / 62.6   | 89.6 | **88.9**             | 95.2      | 90.5       | –        |
| de     | 52.9 / 52.1                   | 86.8 / 85.5   | 87.6 | **86.4**             | 94.4      | 92.7       | –        |
| es     | 37.0 / 36.6                   | 84.9 / 83.9   | 86.8 | **86.0**             | 93.7      | 88.3       | –        |
| ru     | 74.2 / 72.7                   | 74.1 / 72.6   | 87.0 | **85.8**             | 94.0      | 91.3       | –        |
| it     | 30.1 / 29.2                   | 84.9 / 83.5   | 86.2 | **85.0**             | 91.8      | 86.9       | –        |
| pt     | 31.5 / 31.0                   | 76.7 / 75.4   | 79.6 | **78.5**             | 89.7      | 84.0       | –        |
| zh     | 73.2 / 64.4                   | 37.3 / 36.1   | 80.6 | **75.6**             | 82.5      | 79.2       | –        |
| ja     | 50.7 / 50.2                   | 44.3 / 42.7   | 65.6 | **64.7**             | 78.2      | 70.2       | –        |

German (`de-tv2009`):

| Native | Native edition                | German tables | All  | **All, main senses** | Top 2,000 | + reversed | + OdeNet |
| ------ | ----------------------------- | ------------- | ---- | -------------------- | --------- | ---------- | -------- |
| en     | 96.8 / 96.7 (English edition) | 94.5 / 94.1   | 98.5 | **98.5**             | 99.2      | –          | –        |
| fr     | 89.8 / 89.4                   | 90.7 / 90.1   | 94.7 | **94.6**             | 97.0      | 95.3       | –        |
| ru     | 88.6 / 88.2                   | 73.1 / 72.6   | 92.4 | **92.1**             | 94.8      | 93.2       | –        |
| pl     | 90.6 / 89.6                   | 63.0 / 62.5   | 91.4 | **90.8**             | 95.0      | 91.5       | 92.7     |
| zh     | 89.5 / 87.6                   | 12.9 / 12.7   | 90.1 | **88.5**             | 92.1      | 89.9       | 92.7     |
| es     | 17.8 / 17.4                   | 84.3 / 83.9   | 84.7 | **84.2**             | 92.0      | 85.3       | 90.9     |
| it     | 35.5 / 35.4                   | 76.2 / 75.8   | 79.4 | **79.2**             | 88.2      | 80.8       | 91.2     |
| pt     | 29.6 / 29.6                   | 66.9 / 66.5   | 69.9 | **69.6**             | 84.8      | 74.4       | 89.2     |
| ja     | 27.8 / 27.8                   | 41.9 / 41.5   | 49.6 | **49.3**             | 69.7      | 55.4       | 86.2     |

Other frequency lists, all sources with main senses (+ reversed): fr `hd50k` en 97.4, de 86.2 (92.5), pl 88.5 (89.9); de `web3m` en 97.8, fr 95.1 (95.7), ru 91.4 (92.4), pl 90.9 (91.5); de `hd50k` en 98.6, fr 95.7 (96.2), ru 93.0 (94.0), pl 93.1 (93.5). The English edition alone, main senses: fr 96.5 / 96.3; de 96.7 / 95.7 / 97.2 (TV 2009 / web 3M / hd50k). So fr→en and de→en pass on every list; de→fr passes on two of the three German lists and fails on the chosen one; the next, de→ru (91.4–93.0%, 94.0% at most with reversed tables), stays under on every list.

- Why words are uncovered (20 random uncovered words each, `samples-uncovered.txt`): fr→en (122 words): 12 English words and names the subtitles quote that Wiktionnaire has as rare French homographs (toby, clinton, allen, may, stan, side, yes, clean, off, beth), 3 old spellings (crystal, aprés, héro), 5 real gaps (bonnir, barne, franco; bonhomme and insulté lack the class the treebanks give them). de→en (77): 16 English titles, names and abbreviations the subtitles use as names (Sire, Sergeant, Corporal, Iwan, Cox, Dan, Est, ET), 4 real gaps (uh, bittern, Abschlussball, tak). de→fr (272): 9 names and English words (Michel, Ken, Bob, Paolo, Porter, Space, Bear, Twist, offline), 11 real gaps (reinlassen, dahinten, jährig, Beweismaterial, Formation, Panzerabwehrkanone, Stewardess, Summer). Over the 5,000 words, 113 (fr) and 112 (de) are English words or names the English edition lacks as French or German; left out, fr→en would be 99.2%, de→en 99.6%, de→fr 96.2% (`allMainWithoutEnglish` in the reports). Not applied: the gate's rules stay as for English.
- Covered words were sampled for what they show (20 per source, `samples-covered.txt`): the English edition translates ("empêcher" to stop; to prevent; "Erwägung" consideration); Wiktionnaire's German entries translate ("Verlust" Perte, "behalten" Garder, conserver); the ru, pl and zh editions' German entries are dictionary lines (ru "Bindung" связывание, вязка; pl "Kürbis" dynia; zh "Befugnis" "〈中〉 权力，权限…", with gender marks and some traditional characters, the D3 clean-up's class).

### Provenance

The first revision that wrote the counted part of the page (the language section, or the table row), found by binary search over each page's history, for 15 random gate words each deciding or near-deciding source covers (`provenance2-*.txt`):
- **English Wiktionary, French entries** (decides fr→en): 13 of 15 by hand (2003–2021: LGagnon, Paul G, 16@r, Mglovesfun and others); 2 created in 2008–2009 by Tbot, "created from translation at [[chronic]] and [[:fr:chronique]]": entries generated from English Wiktionary's own translation tables, checked against Wiktionnaire, both under the same license. No third-party dictionary.
- **English Wiktionary, German entries** (decides de→en): 11 of 15 by hand (2005–2019), 4 by Tbot from the translation tables as above (Kakerlake, segeln, Einladung, Aktion). One hand-made entry names a commercial dictionary as its source ("Vorwand", 2013: "Info taken from Pons.eu"), a single editor's entry, no import; the class to watch in L2's samples.
- **Wiktionnaire, German entries** (half of de→fr): 8 of 15 by hand (2005–2023); 3 first matched in 2005 edits by Daahbot that only renamed the section template ("{{-de-}}" → "{{=de=}}"), the entries being older; 4 created in 2006–2007 by PiedBot (Laurent Bouvier's bot; its Wiktionnaire user page links to the Vietnamese edition's PiedBot, which imported FVDP there), one of them "Transfert depuis le Wiktionnaire en allemand" (moved from de.wiktionary, under the same license); the 2006 batch (an entry every five seconds, with de.wiktionary's declension tables and examples) has no edit summary, so its source is likely the same transfer but not documented. To check before any de→fr build.
- **de.wiktionary, French rows of the German entries' tables** (the other half of de→fr): 11 of 15 by hand (2005–2017); the 4 bot matches are BaluBot's 2005 conversion of existing rows to the "{{Ü}}" template ("Verwende bei Übersetzungen neue Ü-Vorlage"), not new rows.
- Not checked: the ru, pl and zh editions' German and French entries, as no pair they decide comes near the gate.

### Licensed parts for the learning packs

- **Treebanks** (each LICENSE.txt at the default branch's head, 2026-11-19; `data/raw/ud-french/`, `data/raw/ud-german/`, commits in `COMMITS.txt`): French GSD CC BY-SA 4.0 (allowed; 400,203 tokens, 16,342 sentences); French Sequoia LGPL-LR, the Lesser General Public License for Linguistic Resources (a copyleft of its own, not CC BY-SA: not allowed); French ParTUT CC BY-NC-SA 4.0 (non-commercial: not allowed); German GSD CC BY-SA 4.0 (allowed; 292,756 tokens, 15,589 sentences); German HDT: "The annotation … is licensed under … CC BY-SA 4.0. The text can be distributed for academic use" (the text, whose word forms a tagger's weights keep, is academic-only: not allowed). **Decided** (recommendation, by the license rules): each tagger from its GSD treebank alone; Spanish has two treebanks, so the German and French models' test accuracy is to be measured in L1-2 / L2-2 before the weights cut is chosen.
- **Frequency lists**: French, the hermitdave/FrequencyWords 2018 list (`fr_50k`, `fr_full` for ranks beyond 50,000; content CC BY-SA 4.0 by its README), the same OpenSubtitles counts as the Wiktionary Top 20K the gate was measured on (fr→en 97.4 vs 97.6%), as the Wiktionary page has only 20,000 forms and the Spanish pack reads 150,000. German, Buchmeier's TV and movie subtitles list (380,000 ranks, case kept): German needs case (a lower-case list ranks "essen" and "Essen" as one; [spanish-quality](spanish-quality.md) "What a new learning language needs"); Leipzig's web list measures alike but is web text, not speech.
- **IPA**: the English edition has IPA for 94.0% (French) and 80.6% (German) of a vocabulary of the 50,000 most frequent list forms; with the learning language's own edition 99.9% and 98.7% (Wiktionnaire writes it between backslashes, "\ˈli.re\").
- **Names**: the English edition has 9,156 French and 8,847 German proper-noun entries; 540 and 469 of them are vocabulary words of that vocabulary (Spanish: 7,908 and 1,026 at 150,000 forms). German capitals do not mark names, so `namesByCase` stays off for German (as planned).
- **Inflected forms and pack size**: every form-of / alt-of entry of a vocabulary word as a lemma form, as Spanish (decision of 2026-11-18). From the 50,000 most frequent list forms (vocabulary fr 17,777, de 18,571 words; Spanish 18,496 at 50,000 forms, 34,216 at 150,000): French 125,303 forms, 3.04 MB raw (0.48 MB gzipped); German 89,162 forms, 2.23 MB (0.41 MB), plus 22,928 forms that only the entries' inflection tables list (2.82 MB with them); Spanish, measured alike at 150,000 forms, 371,635 forms and 9.24 MB (the built table 9.9 MB in 5 shards). At Spanish's vocabulary size, about 6 MB raw for each, 3 shards of 2 MB. A pair's download, estimated from the Spanish packs (`es` 12 MB with its lemma table, `es-en` 4.3 MB): fr→en and de→en about 9 to 10 MB for the learning pack and 4 MB for the dictionary (English edition entries with a meaning: French 98,639, German 94,578, Spanish 118,331), about 14 MB raw and 3 MB gzipped, far under the 40 MB per-pair guard.

### Decisions and recommendations

- **Build fr→en (L1) and de→en (L2)**: both pass from the English edition alone, on every frequency list. The French and German editions' English tables add 1.1 and 1.8 points; whether they come second in the recipe is a blind-judging question for L1-1 / L2-1, as for D2's orders.
- **L3: no pair passes; recommended: build none in round 2** (superseded: the user chose reversed tables on 2026-11-20, and de→fr was built in L3, section "L3" below). de→fr is at the gate (94.6% on the chosen list, 95.1–95.7% on the others; 95.3% with reversed tables); reaching it needs either reversed tables as a new kind of source (a design decision, then blind judging, as reversed rows give a native word for one sense only) or a gate rule for the subtitles' English quotations (96.2% without them), both for the user to decide. Measure de→fr again on the L2 corpus if either is wanted; the others are 2.9 points away or more (de→ru 92.1, de→pl 90.8 with main senses).
- **OdeNet is not used**: automatically built (its README), so outside the human-made rule; it would not bring a pair to the gate anyway (de→zh and de→pl 92.7, de→it 91.2).
- **Gate words for French and German**: the top 5,000 content words of the subtitle lists above, read as described; the pack's own gate (`npm run data:stats`) needs the L edition's headwords as the vocabulary check (as EJDict's are for English), since the Spanish rule, the English edition's own words, measures 100% by construction.
- **Nothing blocks L1 and L2.** The constraints: one treebank each (GSD), German case in the frequency list and in the lemma table, IPA from both editions.
- Scripts and outputs (not committed): `data/raw/quality/l0/` (`read-edition.ts`, `reverse.ts`, `freq.ts`, `treebank.ts`, `measure.ts`, `sizes.ts`, `forms.ts`, `provenance2.ts`; `out/report-<lang>-<list>-5000.json`, `words-*`, `uncovered-*`, `samples-covered.txt`, `samples-uncovered.txt`, `provenance2-en-fr-en-de.txt`, `provenance2-fr-de-v2.txt`, `provenance2-de-tables-fr.txt`, `sizes-*.json`). Raw data added to `data/raw/`: `kaikki-fr.jsonl`, `kaikki-de.jsonl`, `kaikki-ja-edition.jsonl`, `freq-fr/`, `freq-de/`, `ud-french/`, `ud-german/`, `odenet/`.

## L3: French and German into other natives with reversed tables (2026-11-20)

The user chose reversed tables as a new source (2026-11-20). Built: **German → French** (`de-fr`); every other French or German pair stays under the gate.

### Method
- **Sources**, each read by the recipe readers generalised from English to a learning language L (`readEdition`, `readTranslationTables` with L's code and letters; architecture "Learning pairs into other natives"): L's own edition's translation tables (rows into N, L's sense as the hint), **reversed tables** (N's edition's own words whose tables list the L word, one sense per native word, ordered by how many of the offered languages the native sense's table translates into) and N's edition's L entries. The editions are cut once to what these read (`learning-slim.ts`, kaikki extracts of 2026-10-30, the zh edition 2026-11-12).
- **Gate** as `npm run data:stats` counts it: the L pack's top 5,000 content words (its vocabulary, any sense; the gate L0 recommended for the packs). L0's own method is reported beside it: its word lists with main senses, over the built pack (one source per term), and over the words of those lists the L pack has (the words Langle looks up; L0's lists also hold the subtitles' English and names the pack leaves out: "hey", "Sir", "Daddy").

### Coverage
Top 5,000 (in %), each source alone and merged as built (the last column the recipe's order; other orders cover within 0.1 points):

| Pair | N's edition | L's tables | Reversed | Edition + tables | Tables + reversed | All three |
|---|---|---|---|---|---|---|
| **de→fr** | 92.6 | 92.6 | 85.6 | 96.5 | 95.2 | **97.1** (96.7% as shipped) |
| de→ru | 90.6 | 75.3 | 71.5 | 93.9 | 85.5 | 94.7 |
| de→pl | 93.5 | 66.3 | 73.9 | 94.2 | 83.0 | 94.6 |
| de→zh | 91.4 | 14.3 | 31.1 | 92.0 | 38.2 | 93.4 |
| de→es | 18.1 | 86.0 | 49.2 | 86.4 | – | 87.9 |
| de→it | 37.9 | 78.6 | 38.8 | 82.0 | – | 83.7 |
| de→pt | 31.3 | 69.7 | 50.8 | 72.7 | – | 77.5 |
| de→ja | 29.8 | 45.9 | 36.7 | 53.8 | – | 61.3 |
| fr→de | 50.5 | 84.4 | 88.4 | 85.6 | 91.7 | 92.2 |
| fr→ru | 72.0 | 70.5 | 82.7 | 84.5 | 87.9 | 90.6 |
| fr→pl | 86.3 | 61.1 | 70.7 | 88.5 | 79.8 | 89.8 |
| fr→es | 35.4 | 83.3 | 60.5 | 85.4 | 87.0 | 88.0 |
| fr→it | 26.9 | 82.9 | 41.2 | 84.1 | 85.2 | 85.9 |
| fr→pt | 28.8 | 74.1 | 60.4 | 77.0 | 81.8 | 82.9 |
| fr→zh | 72.4 | 34.8 | 33.7 | 79.5 | 49.6 | 82.8 |
| fr→ja | 49.9 | 41.6 | 39.6 | 64.3 | 56.9 | 70.9 |

- L0's method over the built pack, German lists TV 2009 / web 3M / hd50k: de→fr 94.4 / 91.1 / 95.3, de→ru 92.1 / 88.3 / 92.9, de→pl 90.7 / 88.1 / 92.7, de→zh 89.1 / 86.6 / 89.9; over the words of each list the `de` pack has: de→fr **97.1 / 98.1 / 97.7**, de→ru 94.8 / 95.1 / 95.2, de→pl 93.3 / 94.9 / 95.0, de→zh 91.7 / 93.2 / 92.1. French lists (os20k / hd50k) over the pack's words: fr→de 94.8 / 94.6, fr→ru 92.7 / 92.4. So de→fr passes by every measure; de→ru and de→pl reach 95% on some lists by L0's method but stay under the packs' gate (94.7, 94.6).
- Reversed tables add 0.6 points to de→fr (they decide 153 of its 5,000 gate words), 0.8 to de→ru, 0.4 to de→pl, 1.4 to de→zh, 1.3–6.6 to the French pairs (fr→de 85.6 → 92.2, fr→ru 84.5 → 90.6), none of which reaches the gate.
- The gate's 144 uncovered de→fr words before the provenance rule (`uncovered-de-fr.json`): the subtitles' English and names the vocabulary has as German words (hi, dad, sorry, lady, cop, Wayne), interjections (ähm, naja, hmm), Swiss and old spellings (heiss, scheissen), adverbs and particles (rüber, hinunter, dazwischen, überein) and rare compounds (Fahrradmantel, Geschützrohr).

### Provenance
- **PiedBot's 2006 German entries on Wiktionnaire** (L0's open question): Wikimedia's MediaWiki history dump of Wiktionnaire for 2006 (`data/raw/mediawiki-history/2026-10.frwiktionary.2006.tsv.bz2`, CC0 metadata) lists 58,757 pages PiedBot created in 2006: 48,241 with no edit summary (German batches in February, 3,308 pages, and April, 7,121; English ones in January and May, Esperanto in March), the rest summarised ("Transfert depuis le Wiktionnaire en allemand", ido, "Wikipedia python library"). Of 136 random gate words with a Wiktionnaire German meaning, 15 are on pages that batch created; each one's page on de.wiktionary just before it has the same declension table (8 of 8 forms where there is one) and examples, but only 7 of the 15 have PiedBot's French glosses in de.wiktionary's French row of the time (Silvester "réveillon, soir du nouvel an", lügen "broder, mentir"); 8 do not (genau "précis, ponctuel, exact, régulier", bestehen "arriver, parvenir, réussir, abouter, persister, perséverer, consister, exister", Schutz, Handtuch: de.wiktionary's row was empty), nor did Wiktionnaire's own French pages list them then, and no edit summary or user page says where they came from. The same operator's bot imported the GPL FVDP dictionary into the Vietnamese edition (section 2). **Decided** (by the license rules): the pages PiedBot created in 2005–2006 with no edit summary (76,335 pages, the 2005 dump too: its French batches of October–December 2005, which also carry translation tables: "bande" came with its German row "Binde") are left out of both Wiktionnaire sources, its German entries and its tables read the other way, and so are the reversed links to the German pages it created (its "Mise à jour des traductions" edits of April 2006 wrote German rows into French pages' tables: erweisen on démontrer, beängstigen on préoccuper) (`LearningRecipe.undocumented`, read from the dumps); the documented transfers stay. In the shipped order this costs 19 gate words (97.1 → 96.7%; top 2,000 97.4%), as de.wiktionary's tables come first.
- **de.wiktionary's French rows** (decide 4,600 of de→fr's 5,000 gate words), the first revision with the French word's row, for 15 random gate words they decide (`provenance/provenance3.log`): 14 by hand (2006–2018: Ortografix "von der Wunschliste", Edcolins, Olaf Studt, Echtio, unregistered editors), 1 BaluBot's 2005 conversion of an existing row to the "{{Ü}}" template (Träne), as in L0's sample. Clean.
- **Reversed tables** (decide 126): the first revision of the French page with the German row, for 12 random words they decided before the rule above (the wiki's rate limit stopped the last three): 8 by hand (2009–2025: NoX, FdrPu, KaiKemmann, DE8AH, unregistered editors, most through the translation gadget); 1 in PiedBot's undocumented creation of "bande" (October 2005, now left out); 2 in PiedBot's "Mise à jour des traductions" edits of April 2006 (préoccuper → beängstigen, démontrer → erweisen), which link German pages others wrote and are kept; 1 row gone since ("fuck"). No third-party dictionary named anywhere.
- **Wiktionnaire's German entries** (decide 111): L0's 15 random pages (8 by hand, 3 older entries renamed by Daahbot, 4 PiedBot's) and the 136-word study above.

### Source order (judged blind)
As D2 and D3: per comparison, 50 random gate words both sources have (each source's first three lines, no context) and 60 corpus tokens whose hover the order changes (the 2026-11-de corpus, Netflix included), one judge per packet (judges read French), X/Y in random order (`packets/order-*`). Words, then tokens: tables over the edition 18 : 16 and 24 : 17 (42 : 33); tables over reversed tables 21 : 8 and 15 : 12 (36 : 20); reversed tables over the edition 15 : 15 and 29 : 17 (44 : 32). Order: **tables, reversed tables, edition**: de.wiktionary translates in short lists ("Hund" → chien; "deshalb" → "pour cela"), Wiktionnaire's German entries are dictionary lines, often longer ("aussi, c’est pourquoi, par conséquent"), and reversed tables give the common native word. Confirmed on a fresh sample against the order first built (edition, tables, reversed), 50 changed tokens per packet: chosen preferred 27 : 15 (YouTube and articles), 20 : 13 (Netflix). The order changes 74–83% of shown tokens' hovers.

### Decisions
- **Built: de→fr** (`de-fr` 2026.1120.0, format 1; L3 in [german-quality](german-quality.md)). Settings offers German → French; a French UI's first pair stays English → French (`firstPair` takes the default learning language's pair first).
- **Not built**: every other French or German pair; de→ru (94.7) and de→pl (94.6) are the closest, both a few dozen words under.
- Scripts and outputs (not committed): `data/raw/quality/l3/` (`report-de.json`, `measure-fr.log`, `uncovered-*.json`, `terms-*.json`, `proto/order.ts`, `proto/quality.ts`, `packets/`, `runs/`); the provenance scripts and their outputs in `data/raw/quality/l3/provenance/` (`piedbot-check.txt`, `piedbot-reverse.txt`, `provenance3.log`).

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
4. ~~Measure the T2? cells for the learning languages planned next.~~ French and German measured in L0 (2026-11-19): fr→en and de→en pass, no fr→N or de→N pair does (section "Round 2").
5. ~~Reversed tables for French and German into other natives.~~ Built in L3 (2026-11-20): de→fr passes (96.7% as shipped) and ships; the others stay under the gate (de→ru 94.7, de→pl 94.6; section "L3").

## Chrome Web Store
The store page takes plain text and screenshots (1280×800 or 640×400), not HTML. A store image made from the matrix should show only the pairs Settings offers, not estimated or T3 cells, and be written in English.
