# Arabic quality on real content (2026-11-21)

How good English → Arabic hover meanings (`en-ar`, for Arabic speakers learning English) are on real videos and articles after ar-1, and what ar-2 changed. Default settings: known level 3000, nothing saved. Method as in the real-content-quality skill (`.claude/skills/real-content-quality/SKILL.md`); the pair's sources and gate are in [translation-data-expansion](translation-data-expansion.md) "ar-1".

## Method

- **Corpus**: the 2026-11 English corpus of the translation-quality study, reused (no new collection): 171,625 word tokens over YouTube, Netflix and articles (`data/raw/quality/2026-11/runs/units-87d8606/units.jsonl`, git-ignored).
- **Pipeline**: the skill's `measure.ts` with `NATIVE=ar` (and every other native for the shared rules) over main 3ae9626 and over each prototype. Study folder `data/raw/quality/r4-ar/q/` (git-ignored): runs, packets, results and the helper scripts (`run.sh`, `diff.py`, `packdiff.py`, `capdiff.py`, `s1_packet.py`, `s1_analyze.py`).
- **Judging**: `judge` subagents (Opus), one per packet. Baseline: 6 packets of main, Arabic beside Chinese (a pair with tables first and a wordnet). S1 study: 278 S1 links (an Arabic entry's gloss naming an English term) labelled blind in 3 packets, each with the term's corpus sentence. A/B: main against the ar-2 build, one packet per site (YouTube, articles, Netflix), seed 57, versions shown as X and Y in random order; the same for Hindi (seed 58), which the shared rules change most. Rates re-weighted to the corpus; one judge per item, so differences under ±4 points are noise.

## Results

Baseline (main, re-weighted to the corpus):

|          | good | acceptable | wrong | misleading | missing |
| -------- | ---- | ---------- | ----- | ---------- | ------- |
| ar words | 63%  | 30%        | 6%    | 0%         | 0%      |
| zh words | 64%  | 28%        | 7%    | 0%         | 0%      |

Phrase meaning fits (yes / partly / no): ar 59 / 16 / 26%, zh 56 / 21 / 23%. Phrase labels (ar): useful 106, low-value 16, wrong-match 10. Arabic is about as good as Chinese. By source of the word tokens: tables 86% (131,177), the translated English definition 3.2%, S1 2.8%, en-defs 2.4%, capitalised headwords from the tables 1.7%.

A/B, main against ar-2 (1.14% of word tokens change, 49 distinct words):

| site     | good before → after | wrong + misleading before → after | changed words preferred after / before / same |
| -------- | ------------------- | --------------------------------- | --------------------------------------------- |
| YouTube  | 61 → 62%            | 9 → 9%                            | 16 / 1 / 7                                    |
| articles | 60 → 60%            | 7 → 7%                            | 18 / 1 / 4                                    |
| Netflix  | 78 → 78%            | 10 → 10%                          | 14 / 0 / 5                                    |

All changed words: ar-2 preferred 48, main 2, same 16. The judges chose by the stray "m" and "f or" and the repeated spellings; the senses are the same, so the rates do not move. Hindi (2.20% of tokens change, 120 words: spellings the entries call alternatives, the inline labels): ar-2 preferred 45, main 2, same 98; good 63 → 64% (articles), 50 → 50% (Netflix), 67 → 67% (YouTube).

Numbers that need no judge (ar, main → ar-2): tokens 171,625; New 86.7 and phrases 27.1 per 1,000 tokens; names 1,119; no entry 87; translated at display 6,498; lines over the cap 6: all unchanged.

## Root causes

- **Two words in one table row** (CORE, tables): English Wiktionary's rows sometimes hold two words its template did not split, joined by "or" or after an inline gender label: "دكتور m or دكتورة", "موسيقى f or موسيقا", "هجوم m هجمة". The line showed the label and the "or" (doctor, music, attack, option, France). Every native has such rows (fr "casse-croûte m or casse-croute", ru "актив m or активы", es "alegato m alegación"), and in an Arabic row the Latin label made a capitalised headword's meaning a "word" by its shape (France, Hungary, Bristol: names now).
- **An alternative spelling first** (NATIVE): the tables list إنكليزي (the Levantine spelling) before إنجليزي for English, لأجل beside من أجل for "for" (1,264 tokens), موسيقا beside موسيقى. Arabic's own entries say which is the alternative ("alternative spelling of إِنْجْلِيزِيّ"), and the frequency list agrees.
- **S1 is weak** (PAIR): of 278 S1 links judged, 24% good, 33% acceptable, 28% wrong, 15% misleading. Its narrow lines (fond → ناعم, aware → خبير, salute → سجد) come from Arabic entries whose gloss lists the English word as one of many items. S1 shows on 2.8% of word tokens (4,342), the tables on 86%.
- **The wordnet's old senses** (PAIR): figure out → حدث / أثار; the wordnet is the last source and shows on few tokens.

## What was tested

| Idea                                                                                                                    | Result                                                                                                                                                                                                                      | Decision                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Show the vocalised form of an ambiguous word                                                                            | In the S1 study, harakat would have told the reader the meant word in 4 of about 300 links                                                                                                                                  | Dropped                                                                 |
| Drop an S1 link whose Arabic headword has a homograph with another meaning                                              | Homograph links are worse (misleading 33 of 139 against 9 of 139), but the rule took good words: edge lost حد / حافة / طرف                                                                                                  | Dropped                                                                 |
| Drop S1 links read from an entry's form-of senses                                                                       | Too broad: alleged, given, accomplished lost their only good line                                                                                                                                                           | Dropped                                                                 |
| Tell S1's good links by structure (where the gloss names the term, the tables' part of speech, overlap with the tables) | No signal held: main-item links 30% good, later items 23%, plain items 23%                                                                                                                                                  | Dropped; S1 stays as ordered in ar-1                                    |
| Split a row at every label and every "or"                                                                               | Right for Arabic, but German lost du for "you" (4,073 tokens: "du" is also the dual's label) and French "du marché"; phrases with a gender inside lost their end ("unter Eid m aussagen" → "unter Eid", "point m de débat") | Refined: no "du" label; a label alone splits only parts alike in length |
| Dedupe a sense's words by text once alternative spellings are mapped                                                    | Hindi lost the noun एक beside the numeral एक                                                                                                                                                                                | Refined: per part of speech                                             |

## Fixes by layer

| Layer  | Rule | Where | Measured |
| ------ | ---- | ----- | -------- |
| CORE   | A table row's words (`rowWords`): split at "or" where it cannot be a word (a native script, or beside a label) and at an inline gender, number or aspect label when the parts are alike in length; labels dropped; in a native script a part with none of its letters is an English note, dropped | `recipe.ts` `readTranslationTables` | ar about 400 tokens (doctor → دكتور, music, attack, option, France); fr 54 (crime, snack), de 46 (american, depose, flex), ru 47 (switch, guard, assets), es 9, pt 1, zh 0 on the corpus (烟台 or 烟台 → 烟台 in the pack); ar France, Hungary, Bristol and 7 more capitalised headwords are names now |
| NATIVE | A word the native entries call only an alternative spelling of one other word shows as that word when the frequency list ranks it no lower (`alternativeSpelling`, natives with `reverseGlosses.frequency`) | `native.ts`, `reverse-glosses.ts` `alternatives` | ar english → إنجليزي, for → من أجل (1,264 tokens), music → موسيقى; hi रक्खना → रखना, जूलाई → जुलाई, ध्वनी → ध्वनि |
| CORE   | A sense's words, once converted, are deduped per part of speech | `convertTerms` | hi one keeps the numeral and the noun एक |

Other natives over the same corpus (main → ar-2, hover tokens changed): th 0, zh 0, ja 0. The smoke test's first line for English in Arabic is now إنجليزي.

## Packs

`en-ar` 2026.1121.1 (26,500 terms; 5.23 MB), `en-hi` 2026.1121.3, `en-zh` 2026.1121.2, `en-ru` 2026.1121.2, `en-de` 2026.1121.2, `en-fr`, `en-es`, `en-pt`, `en-it`, `en-pl` 2026.1121.1, `de-fr` 2026.1121.1 (the row words). `en-defs` and `en-th` unchanged. en-ar still passes by rule (a): top 5,000 91.5%, tokens 97.0%.

## Still open

- **S1's narrow lines**: fond → ناعم, aware → خبير, salute → سجد; no structural rule found that keeps the good S1 links (24% good).
- **The wordnet's old senses**: figure out → حدث / أثار.
- **A label between parts of unequal length** reads as one word: right for "unter Eid m aussagen", wrong for "فطر m عيش الغراب" (mushroom); alike parts split, right for "هجوم m هجمة", wrong for "طريق m ضيق" (a narrow road) and "calomnie f écrite".
- **Feminine and plural rows** fill table slots beside the main word (سجين, سجينة).
- **children → طفل** (the singular, from S1).

## Measuring

```
Q=data/raw/quality/r4-ar/q
DEFS=1 sh $Q/run.sh <label> ar hi th zh ja fr de es ru pt   # rebuild en-defs, measure each native
python3 -I $Q/diff.py $Q/runs/base-ar $Q/runs/<label>-ar
python3 $Q/capdiff.py $Q/packs-base ar hi                   # capitalised headwords whose meaning kind changed
python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py --before $Q/runs/base-ar --after $Q/runs/<label>-ar --out $Q/packets/<tag> --tag <tag> --packets 3
python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py --key $Q/packets/<tag>/key-<tag>.json $Q/packets/<tag>/result-*.json
```
