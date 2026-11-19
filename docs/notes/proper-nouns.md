# Proper nouns, abbreviations and product names (2026-11-19)

The user reported that many words cannot be highlighted and chose this class: AI, U.S., NYPD, iPhone, AirPods, Tokyo, Nvidia, Kurdish. They had no vocabulary entry, so `lemmatize` gave nothing and the word was `ignored`: no highlight, no hover, no way to save it. Method: the `real-content-quality` skill on the 2026-11 corpus (171,709 tokens, `units-87d8606`), `measure.ts` before and after, blind judging of the changed hovers. Rules in [architecture](../specs/architecture.md) "Vocabulary and frequency (rule E)": "Abbreviations with a period inside", "Contractions of vocabulary words", "Capital-only words".

## Baseline (main at eff3fcd)

Unknown word tokens (no hover) per site, and by class (a rough classification by the tokens' Wiktionary entries and the names lexicon):

| | YouTube | Netflix | Articles | All |
|---|---|---|---|---|
| Unknown tokens | 1,142 (1.48%) | 1,599 (2.37%) | 1,238 (4.55%) | 3,979 (2.32%) |
| Person names (stay unknown, rule D) | 404 | 1,125 | 487 | 2,016 |
| No Wiktionary entry (Nvidia, AirPods, Binance, Demirtaş) | 183 | 135 | 289 | 607 |
| Entities and products (Tokyo, YouTube, Ebola, iPhone, Grammys) | 109 | 56 | 137 | 302 |
| Initialisms (AI, DEA, BTS, IC, NYPD, ATM) | 112 | 52 | 115 | 279 |
| Places, organisations | 23 | 2 | 32 | 57 |
| Nationality adjectives (Senegalese, Kurdish, Saudi) | 9 | 14 | 36 | 59 |
| Dotted abbreviations (U.S, p.m, a.m, Ph.D) | 16 | 22 | 25 | 63 |
| Clitic 'd (what'd, how'd, why'd) | | 15 | | 15 |
| Plain words below rule E's 8 examples (hitman, paralegal, paracetamol, fiancé) | 137 | 96 | 83 | 316 |
| Other (lowercase without entry, capitalised plain words, "__") | 149 | 82 | 34 | 265 |

## Root causes

1. Rule E's shape `/^[a-z][a-z']*$/` and its proper-noun exclusion: no capitalised headword can join the vocabulary, and keys are lower case, so "AI" would become "ai", a sloth.
2. The word segmenter cuts "U.S." before its last period ("U.S" "."), while EJDict and the vocabulary have "u.s.".
3. The contraction table (U1-5) has what'd, how'd, where'd, but the vocabulary does not, so only the tagger split them.

## What was tested

| Idea | Result | Decision |
|---|---|---|
| Capital-only words: a capitalised headword (no person) written so ≥ 8 times in the examples and more often than in lower case | 2,785 words; 420 tokens get a hover, but many wrong ones: initialisms of many things (IC → independent contractor, CNC → consensual non-consent, NFC a cat breed, BTS "in secret"), obscure places for a part of a longer name (Vito a barangay, Paso a horse, Falkland a Scottish village) | Refined |
| + a person's name also through its gloss's plural ("the male given names Timothy") and categories, and pointers to one (Dmitri, Jer) | Tim, Zane, Huang, Steve, Mahmood out | Recommended |
| + a sense a translation table translates (Wiktionary translates what is notable) | 1,331 words; the wrong ones above out; lost: NYPD, ChatGPT, Grammys, AGI, Ozempic (no table) | Recommended |
| Senses in source order | Ebola → a river | Dropped |
| Senses by how many languages the tables translate each into | Ebola → the virus, CNC → computer numerical control; DEA → diethanolamine, GPU → the Soviet secret police | Recommended |
| + an abbreviation's expansions first by how often the example corpus writes them | DEA, ANC right; USB → US Bancorp, CV → coronavirus, FC → Federal Court: the corpus has too few of them | Dropped |
| Excluding capital-only words inside a run of capitals (New Zealand, Europa League) | 32 of 279 tokens, mostly right ones (Tokyo Station, Saudi Arabia, MacBook Pro) | Dropped |
| A dotted abbreviation in any case | "I.D" → i.d. "inside diameter" | Refined: case must match (EJDict's capitals listed in en/capitals.json) |

## Results (the shipped rules)

| | YouTube | Netflix | Articles | All |
|---|---|---|---|---|
| Unknown tokens, before | 1,142 (1.48%) | 1,599 (2.37%) | 1,238 (4.55%) | 3,979 (2.32%) |
| After the code step (contractions, dotted) | 1,138 | 1,565 | 1,216 | 3,919 (2.28%) |
| After the data step (capital-only words) | 1,015 (1.32%) | 1,542 (2.29%) | 1,085 (3.99%) | 3,642 (2.12%) |
| Target classes left (entities, initialisms, places, adjectives, dotted, 'd) | 165 | 105 | 199 | 449 (was 775) |
| Person names left | 404 | 1,124 | 487 | 2,015 (was 2,016) |

Words shown as New per 1,000 tokens 84.4 → 86.0 (the new words are mostly unranked or rare; 9 words cross rank 3,000 as the list ranks the new ones); names 1,054 → 1,063 (places rule D takes without a Japanese meaning: Edirne, Bayern, Fulham). en-ja gives 630 of the 1,331 words Japanese (AI → 人工知能, Tokyo → 東京, YouTube → ユーチューブ, Kurdish → クルド語, ATM → 現金自動預払機); the others show their English definition, translated at display time.

Blind judging (`packets/pn1`, before vs after, one judge per site, 114 changed hovers and 90 unchanged): changed hovers preferred after : before YouTube 29 : 7, articles 38 : 4, Netflix 23 : 4. On the changed items the new hovers were good 79, acceptable 23, wrong 3, misleading 9 (10.5%; by tokens about 8%). The wrong and misleading ones:
- an initialism whose most translated sense is not the text's: DEA → diethanolamine (11 tokens), GPU → the Soviet secret police, ANC → absolute neutrophil count;
- a word that is part of a longer name: Zealand → シェラン島 (New Zealand), Latina → a province of Lazio, Europa → エウロパ (Europa League);
- Netflix the verb; Qing as a person's surname (rule D keeps a name with a meaning); H.R. → House of Representatives in The Office (EJDict has no human resources).

Pack sizes (raw): en 6.51 → 6.62 MB (capitals.json 17 KB; forms, IPA, parts of speech and names of the new words), en-ja 7.75 → 7.81 MB, en-defs 22.00 → 22.37 MB; every file under 4 MB.

## Still open

- Initialisms of several things: the hover shows one expansion, and the most translated is not always the one meant (DEA, GPU). A context check (the words around it, or the on-device model) would be needed.
- A capital-only word inside a longer name (New Zealand, Europa League): the multi-word name is a phrase the matcher does not detect (B4); handled best there.
- Words without a translation table (NYPD, ChatGPT, Grammys, AGI: about 50 tokens) and without a Wiktionary entry (Nvidia, AirPods, Binance: 598 tokens) stay without a hover.
- Capital-only words in documents in capitals (ALL-CAPS captions) and in caseless speech recognition stay unknown: their case says nothing.
- The recipe pairs (es, pt, ru, fr, de, zh, it, pl): their `capital.json` is not rebuilt, so they show the English definitions translated at display time, and rule D takes their places for names (no native meaning). Rebuilding them with the capital-only words gives native meanings (Tokyo → Tokio) and 8 more pack versions.
- Plain words below rule E's threshold (316 tokens: hitman, paralegal, paracetamol, fiancé with its é) are a separate trade-off: the threshold was set by pack size (architecture "Size cut").

## Measuring

```
STUDY=2026-11 REPO=<checkout> UNITS=data/raw/quality/2026-11/runs/units-87d8606/units.jsonl \
  OUT=data/raw/quality/2026-11/runs/<label> npx jiti .claude/skills/real-content-quality/scripts/measure.ts
```

Runs: `pn-base-eff3fcd` (before), `pn-code1` (code step), `pn-data5` (data step); judging in `packets/pn1`.
