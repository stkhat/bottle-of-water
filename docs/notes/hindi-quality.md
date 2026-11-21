# Hindi quality on real content (2026-11-21)

How good English → Hindi hover meanings (`en-hi`, for Hindi speakers learning English) are on real videos and articles after hi-1, and what hi-2 changed. Default settings: known level 3000, nothing saved. Method as in the real-content-quality skill (`.claude/skills/real-content-quality/SKILL.md`); the pair's sources and gate are in [translation-data-expansion](translation-data-expansion.md) "hi-1".

## Method

- **Corpus**: the 2026-11 English corpus of the translation-quality study, reused (no new collection): 171,625 word tokens over YouTube, Netflix and articles (`data/raw/quality/2026-11/runs/units-87d8606/units.jsonl`, git-ignored).
- **Pipeline**: the skill's `measure.ts` with `NATIVE=hi` (and `zh`, `th`, `ja` for the shared rules) over main 69dd2a5 and over each prototype. Study folder `data/raw/quality/r4-hi/q/` (git-ignored): runs, packets, results and the helper scripts (`packdiff.py`, `diff.py`, `scan.py`, `classify_ab.py`, `run.sh`).
- **Judging**: `judge` subagents (Opus), one per packet. Baseline: 6 packets of main, Hindi beside Chinese (a pair with an edition and a wordnet), seed 31. A/B: main against the hi-2 build, one packet per site (YouTube, articles, Netflix), seed 23, versions shown as X and Y in random order. Rates re-weighted to the corpus; one judge per item, so differences under ±4 points are noise.

## Results

Baseline (main, re-weighted to the corpus):

|          | good | acceptable | wrong | misleading | missing |
| -------- | ---- | ---------- | ----- | ---------- | ------- |
| hi words | 55%  | 32%        | 8%    | 3%         | 2%      |
| zh words | 59%  | 26%        | 13%   | 1%         | 2%      |

Phrase meaning fits (yes / partly / no): hi 44 / 32 / 24%, zh 54 / 24 / 22%. Phrase labels (hi): useful 97, low-value 25, wrong-match 10. Per source, Hindi words from the tables were good 82 of 125, from S1 (reverse glosses) 14 of 30, from the translated English definition 5 of 46; S1 phrases fit 3 of 15.

A/B, main against hi-2 (5.83% of word tokens change, 280 distinct words):

| site     | good before → after | wrong + misleading before → after | changed words preferred after / before / same |
| -------- | ------------------- | --------------------------------- | --------------------------------------------- |
| YouTube  | 58 → 59%            | 13 → 12%                          | 27 / 11 / 32                                  |
| articles | 51 → 52%            | 17 → 16%                          | 24 / 11 / 35                                  |
| Netflix  | 58 → 59%            | 15 → 14%                          | 29 / 6 / 35                                   |

All changed words: hi-2 preferred 80, main 28, same 102. Changed phrase units: hi-2 17, main 12, same 42. By kind of change (after / before): lines removed 11 / 0 (7 same), a different English definition 26 / 9, a word added or swapped 13 / 3, S1 order only 25 / 16 (56 same). The rates move little because only 6% of tokens change; the preferences are clear. The judged build is the one before the last en-defs refinement (below), which changed 44 more tokens.

Numbers that need no judge (hi, main → hi-2): tokens 171,625; New 86.6 and phrases 27.1 per 1,000 tokens (unchanged); names 1,160 → 1,158; no entry 104; translated at display 16,255 → 16,258; lines over the cap 0.

## Root causes

- **A capitalised gloss item read as the lowercase word** (PAIR, S1): मई "May" was a meaning of may; any "Xyz" item named xyz.
- **Offensive table words** (PAIR, tables): the tables give do a "slang: have sex with" sense whose Hindi word is vulgar; it showed as the third word for do / did / doing / does / done (about 1,300 tokens). Hindi's own entries (S1's source) tag that word offensive.
- **A verb's passive read as the verb** (PAIR, S1): "to be entered, put down" made चढ़ना a meaning of put down.
- **S1 narrow senses first** (PAIR, S1): a word whose later sense names the term (लक्ष्य, mainly "aim", whose adjective's third sense is "visible") ranked as high as one that means it, since only the first item counted.
- **No rank for nukta spellings and phrases** (NATIVE): the Hindi subtitle list writes खबर (rank 598) for ख़बर (11,893); मुक़दमा is missing; multiword Hindi words had no rank.
- **Spelling variants shown twice** (NATIVE): ख़बर / खबर, चाँद / चांद, ढूँढ़ना / ढूँढना (166 tokens).
- **"the" shown as a fragment** (CORE, en-defs): its sense is written in two glosses, "…identifiable..." then "...because it has already been mentioned"; the pack kept the second (6,379 tokens of the translated fallback).
- **en-defs lacked the tagged part of speech** (CORE, en-defs): it kept the 4 best senses, so a word with 4 noun senses had no verb (smash, boost, nuke, click, cheer, sideline, veto, debut); rule A2 then showed a noun for a verb.

## What was tested

| Idea                                                                                  | Result                                                                                                                                                        | Decision                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drop every capitalised S1 item                                                        | Lost CEO, TV, BC, "God willing"                                                                                                                               | Refined: only a capitalised headword beside a lowercase one, given to the capital map                                                                              |
| S1 order by where the term is named only (main sense, entry, later sense, later item) | Rare words first (as → बतौर, ever → हरगिज़)                                                                                                                   | Refined: frequency rank × a factor per place (`LESSER`)                                                                                                            |
| Passive items dropped whatever their first word                                       | Lost Thai stative adjectives (related, determined)                                                                                                            | Refined: only items whose first word is a verb and no adjective                                                                                                    |
| Every part of speech's best en-defs sense                                             | Preferred 26 : 9 (sideline, audit, clone, veto, debut), but tagger slips showed marginal senses (handy "The hand", chewy "Chewing gum", stuffy "stuffed toy") | Refined: not a part of speech whose best sense is labelled or none of whose senses is translated; 44 hi tokens back to the main sense, zh's changes 50 → 18 tokens |
| Rank a spelling the list lacks by its folded spelling                                 | ख़बर, मुक़दमा ranked; but ज़ाती ("personal") takes जाती's ("goes") rank                                                                                       | Kept; the collision is open                                                                                                                                        |

## Fixes by layer

| Layer  | Rule                                                                                                                                                                                                                                  | Where                                                       | Measured                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| PAIR   | A capitalised gloss item names no lowercase term when the tables have a capitalised headword and a lowercase one (May, may); it goes to the capitalised headword's meanings                                                           | `reverse-glosses.ts` `namedTerm`, `capital`                 | may → सकना; capital Mr → आक़ा, May → मई                                                       |
| PAIR   | Items that continue a "to be" item with a verb (a verb and no adjective in `en/pos.json`) name nothing                                                                                                                                | `passiveItems`                                              | put down loses चढ़ना; Thai related, contented kept                                            |
| PAIR   | S1 order: first items first, then frequency rank × 1 (the word's main sense), × 2 (another part of speech's main sense), × 4 (a later sense)                                                                                          | `MAIN`, `LESSER`                                            | develop → विकसित करना, fix → ठीक करना, easily → आसानी से first; S1 reorders preferred 25 : 16 |
| PAIR   | A table word the native entries tag offensive is left out of a marked sense ("slang", "vulgar", …) where the term keeps another sense                                                                                                 | `withoutOffensiveWords`                                     | hi 5 words (do's चोदना), th 7 (twat, pussy: หี; suck: ห่วย)                                   |
| NATIVE | `NativeLanguage.spelling`: Hindi folds the nukta and candrabindu (`devanagariSpelling`); short lines that differ only so say the same, and the frequency rank falls back to the folded spelling; a phrase's rank is its rarest word's | `natives.ts`, `short-lines.ts`, `native.ts` `frequencyRank` | 166 repeated tokens gone; other natives have no `spelling`                                    |
| CORE   | A gloss that goes on from its parent's dots reads as one with it                                                                                                                                                                      | `senses.ts` `lastGloss`                                     | the and de families (8 en-defs keys)                                                          |
| CORE   | en-defs keeps each part of speech's best sense when it is unlabelled and its part of speech is translated, then the best others, up to 4                                                                                              | `en-defs.ts`                                                | terms gain a verb or noun (smash, boost, sideline, veto); en-defs 19.80 → 19.79 MB            |

Other natives over the same corpus (main → hi-2, hover tokens changed): th 26 (the offensive words, RAM → แรม from the capital map, a few en-defs parts of speech), ja 0, zh 18 (ease, sideline and bounce better; deadly "In a way which suggests death" worse, a tagger slip). Their summary numbers are unchanged.

## Packs

`en-hi` 2026.1121.1 (17,882 terms: tables 12,288, S1 5,691; 1,812 capitalised headwords; 3.40 MB), `en-th` 2026.1121.3 (7.55 MB), `en-defs` 2026.1121.4 (19.79 MB). Both pairs still pass the gate.

## Still open

- **US, UK, PA read as "us", "uk"**: the hi and th tables lack the acronym (zh has it), so the lowercase en-defs line shows.
- **Clippings in en-defs**: Mr / Dr without an S1 or table line show en-defs' lowercase senses ("millirem").
- **S1's narrow senses**: case → मुक़दमा first, fundamental / constitutional → ज़ाती first (a folded rank: ज़ाती ranks as जाती, "goes"), cool → झकास, set → अथाना. A rank list that keeps the nukta would fix the collision; none is free.
- **S1 phrases** fit poorly (3 of 15 in the baseline); hi-2 did not change them.
- **Tagger slips** still pick a marginal part of speech's sense where the source labels nothing (deadly, um, install, leveraged).
- One A/B sample only, with Netflix in it rather than held out; a fresh sample would confirm the S1 order.
- **Real-site check (hi-3)**: hover do / did (no चोदना), news, moon (one line), may, the, smash / boost as verbs, and a translated line in Chrome.

## Measuring

```
Q=data/raw/quality/r4-hi/q
DEFS=1 $Q/run.sh <label> hi zh th ja    # rebuild en-defs, measure each native
python3 -I $Q/diff.py $Q/runs/base-hi $Q/runs/<label>-hi
python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py --before $Q/runs/base-hi --after $Q/runs/<label>-hi --out $Q/packets/<tag> --tag <tag> --packets 1
python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py --key $Q/packets/<tag>/key-<tag>.json $Q/packets/<tag>/result-*.json
python3 -I $Q/classify_ab.py <tag>     # preferences by kind of change
```
