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

## Real-site check: dotted abbreviations in Chrome (2026-11-20)

In the user's Chrome (check build fc905ba), "U.S." on en.wikipedia.org/wiki/Nvidia got no hover and no highlight, while AI worked and the offline smoke test read "the U.S." as `u.s.`. Not the article path nor the casing: the offline classifier over the whole article (en-ja `capitalMeaning`, `outline`, document casing) read it as `u.s.` Known. The cause is the word segmenter. Node's `Intl.Segmenter` (ICU 78) follows Unicode's word rules and keeps "U.S" one word; Chrome's splits a full stop or colon between letters: "U" "." "S" ".", "p" "." "m", "e" "." "g", "example" "." "com", "a" ":" "b" (numbers like "3.5" stay whole). So in Chrome "U" and "S" were two single letters, and the dotted reading of PR #147 never ran there. Every offline measurement (the corpus, the smoke tests) used Node's segmentation.

The fix makes `tokenize` the same in every engine: it splits words at each full stop or colon between letters as Chrome does, then joins a whole run of letters and stops that the pack knows (U.S, p.m, Ph.D; not "S.A" of "S.A.C."), as it joins hyphenated compounds. In the 2026-11 corpus Node kept 65 such tokens whole (U.S 20, p.m 8, a.m 5, D.A 3, domains like audible.com); 42 are now joined in both engines (U.S, p.m, a.m, D.A, Ph.D, H.R, M.O, A.M, U.N), and the unknown rest (I.D, G.I, domains) are split as Chrome splits them. A browser test (`tokenize.browser.test.ts`, Chromium and Firefox) now runs the dotted cases.

Checked after the fix in the user's Chrome: U.S. (Nvidia) Known with "United States 合衆国"; a.m. (September 11 attacks) "ante meridiem 午前"; Tokyo (Sony) New with 東京; iPhone (Apple Inc.) New, English definition machine-translated; GPU (Graphics processing unit) New, "A specialized electronic circuit"; AI and US in a YouTube transcript (人工知能; United States 合衆国); WHAT'D in the Netflix transcript (Friends) "what did / what would". The card no longer shows "u.s → u.s." for a word read with its last period. Error log empty.

## Capital cards (2026-11-20)

Three wrong hovers from the judging above, fixed in code (PR "capital cards"): the U.S. card, initialisms of several things, and the rest of the judged misses. Measured on the same corpus (`cc-base2` → `cc-fix5`; `measure.ts` now sends an acronym's document, as the extension does) and judged blind twice (`packets/cc1`, `packets/cc2`, one judge each).

Root causes:
1. **A capitalised word's card joined its capitalised headword with the lower-case one** (en-ja `asWritten`, the recipe pairs' `joinedPair`). EJDict files U.S. both as "U.S.,US" (United States 合衆国 / unserviceable) and as lower-case "u.s." (ubi supra: 上述の箇所に), and the vocabulary's key is "u.s.", so the card was headed "u.s." and listed ubi supra third; likewise Japan → 日本 / 黒い漆, US → 合衆国 / 我々を, Turkey, China, May, March, UN → やつ. Rule: a word capitalised in a way that counts, or in capitals, shows its capitalised headword alone, headed as that headword is written (U.S., US, Japan). The first judging found the exception: a capitalised word next to another one is often a name's or a title's word (Oak Ridge National Lab → 労働党, "Dangling Man" → マン島, "American Buffalo", The International Atomic Energy Agency), whose capital is the name's; there the lower-case senses still follow (`Span.run`, `written` "run"). "unserviceable" stays: it is EJDict's own second expansion of "U.S.,US".
2. **The dictionary's order is not the text's**: en-defs orders an initialism's senses by how many languages translate each (DEA: diethanolamine first). Text that means one of them tends to spell it out where it first uses it ("That's the Drug Enforcement Administration"; Wikipedia's "The Drug Enforcement Administration (DEA) is"). Rule: a word in capitals sends its document's text with its lookup, and the card leads with the first sense whose expansion (words whose initials are its letters) the document writes.
3. **An acronym's possessive read as a capitalised word** ("DEA's" has a lower-case s, so it was "capital", not "upper"): an ending 's or s after two capitals no longer counts.

| Idea | Result | Decision |
|---|---|---|
| Capitalised headword alone, everywhere | 202 tokens changed; judged: after preferred 21 : 6; lost Lab, Man, Buffalo, International, Eve (words of a name or title), Polish ("to Polish my knob") | Refined |
| + inside a run of capitals, capitalised senses first, then lower-case | 172 tokens changed (US 65, U.S. 20, Japan 18, Turkey 15, China 14, CAT 6, UN 5); fresh judging: after preferred 18 : 2, good 0 → 18 of 24 changed; the 2 lost: Polish (a joke), "the March on Washington" | Recommended |
| Senses ordered by the document's words (a sense's words, rarer than rank 300 or 1,000, the document also writes; margins 1–2) | DEA (Breaking Bad), GPU (a laptop review: "display", "device"), PM right; CV → computer vision in an article on video interviews, FC → foster care, M.O. → Medical Officer, D.A. → "doesn't answer", RPG → rocket-propelled grenade in a game video, CB (of CBS) → construction battalion | Dropped |
| Expansion spelled out in the document, any case | DEA 10 of 11 tokens (the 11th's episode never says it), PM → Prime Minister (The Crown); but "3:00 p.m." → Prime Minister in a show about a prime minister | Refined |
| + only for a word in capitals | DEA 10, PM 1; nothing else changes | Recommended |

Not fixed, and why:
- **GPU** → "State Political Directorate" in a laptop review, which never spells it out. en-defs replaced the pointer "Initialism of graphics processing unit" with that term's definition ("A specialized electronic circuit…"), so the sense no longer names its expansion, and no document rule can match it. Data proposal (scripts/data, for the agent who owns it): keep an initialism's expansion in its followed sense ("graphics processing unit: A specialized electronic circuit…"), so the card names what the letters stand for and a page that writes "graphics processing unit" leads with it; and rank an initialism's expansions made of a common noun's words before a historical proper noun's.
- **ANC** → absolute neutrophil count in an earbuds review: the sense meant, "active noise control or active noise cancellation", is kaikki's third of five and en-defs keeps four, dropping it. Data proposal: keep every "Initialism of" sense of a capital-only word (they are one line each).
- **H.R.** → House of Representatives in The Office: every source of the dotted form (EJDict's "H.R.", kaikki's "H.R.") has only that; "human resources" is under HR, which joined no list (no translation table). Not this class; a data question (the undotted capital-only word's senses for its dotted spelling).
- **Netflix** the verb ("To watch … using … Netflix") for the company in "the new Netflix movie": kaikki has Netflix only as that verb (the company has no entry), so rule E kept the verb. Rule A2 cannot help (capitalised words are read without their tag, and the tag's noun has no sense to choose). Not this class; data: a capital-only word whose every sense is a verb derived from the name (a "using … Netflix" definition) should not join, or should join as a name.
- **M.O.** → mail order (modus operandi meant), RAM → 雄羊座 (no "RAM" acronym entry in EJDict; the title entry Ram, Aries, is used), DM → Deutsche mark (direct message), Sol in "Puerta del Sol": the text spells none of them out; data.
- An abbreviation in capitals in a document that spells out another of its expansions ("5 PM" in a text that writes "Prime Minister") leads with that expansion. None in the corpus.

## Still open

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

Runs: `pn-base-eff3fcd` (before), `pn-code1` (code step), `pn-data5` (data step); judging in `packets/pn1`. Capital cards: `cc-base2` (main at 314d78d), `cc-fix3` (headword alone), `cc-fix5` (with runs); judging in `packets/cc1`, `packets/cc2`; the document-words prototype in `proto/capital-cards/lesk.ts`.
