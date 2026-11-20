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

## Rare words (E1, 2026-11-20)

The plain words below rule E's threshold (hitman, paralegal, fiancé): a kaikki headword joins only when other entries' examples write it in lower case at least 8 times since 1900, and only in ASCII letters. Method as above, on the same corpus and units (171,625 tokens now: `tokenize` splits inner stops since the Chrome fix). The packs on main were last built before several merged script changes, so every candidate is compared with a rebuild of main's scripts (`rw-rebuilt-base`: `en` + `en-ja` + `en-defs` 36.23 MB raw against 36.73 MB in the lock; phrases per 1,000 tokens 26.3 → 25.9, as the merged phrase-build changes move "get it", "take it" to select-only and "call it", "got it" to detect). Sizes are `en` + `en-ja` + `en-defs` raw; unknown is word tokens with no hover.

| Idea | Words added | Size | Unknown | Decision |
|---|---|---|---|---|
| Rebuild of main's scripts | 6,328 | 36.23 MB | 3,625 | (baseline) |
| Accented headwords (fiancé 42 examples, café 212, protégé 22) | +35 | +0.01 MB | −5 | Recommended |
| 6 examples, any word | +2,672 | +1.01 MB | −172 | Refined: it also lowered the capital-only threshold (+437 of them) and took names (Jim → "To jimmy", Steven → "Voice") |
| + capital-only words kept at 8, + the examples write it in lower case at least as often as with a capital | +2,573 | +0.80 MB | −107 | Refined |
| 5 examples, so | +4,719 | +1.44 MB (4.0%) | −135 | Dropped: judged blind (`packets/rw1`, 70 new hovers) 43 good, 9 acceptable, 7 wrong, 11 misleading (26%) |
| Of those, words with a translation table | | | | 34 judged, 3 wrong (9%); without a table 36, 15 (42%): Plex, HAB, Oculus, Bando (product names and names in text), goomba, lookee, brainer, kickass, unspent → "To recover (money that has been spent)" |
| A table into the pair's native language (Japanese) | | | | Dropped: the `en` pack is shared by every pair, and the tables into any language already carry the signal |
| 4 examples with a table (any language), the capital check | +3,588 | +1.21 MB (3.3%) | −102 | Recommended |
| 3 examples with a table | +5,485 | +1.79 MB (4.9%) | −116 | Dropped: 0.58 MB for 14 tokens |
| 2 examples with a table | +8,582 | +2.68 MB (7.4%) | −129 | Dropped: over the +5% target |

Results (shipped: 8 examples, or 4 with a table and the capital check; accents in the word shape):

| | YouTube | Netflix | Articles | All |
|---|---|---|---|---|
| Unknown tokens, before (main's scripts rebuilt) | 1,004 (1.30%) | 1,537 (2.28%) | 1,084 (3.99%) | 3,625 (2.11%) |
| After | 956 (1.24%) | 1,493 (2.22%) | 1,074 (3.95%) | 3,523 (2.05%) |

Words shown as New per 1,000 tokens 86.1 → 86.7; names 1,071 unchanged. The 100 newly hovered tokens all show an English definition, translated at display time (en-ja has no Japanese for them). Judged blind on a fresh packet (`packets/rw2`, 48 changed hovers, one judge per site): 40 good, 5 acceptable, 3 wrong (6%; mojo → "A magic spell or hex", perv → "An ogle", recused → "To reject or repudiate"), none misleading; preferred after : before 44 : 0 (4 the same). Rule E's vocabulary 6,328 → 9,916 words (3,553 rarer words with a table: 1,292 written 4 times, 977 5, 722 6, 562 7; 35 accented ones at 8 or more).

Pack sizes (raw), lock → now: `en` 6.63 → 6.88 MB, `en-ja` 7.81 → 7.82, `en-defs` 22.29 → 22.74 (36.73 → 37.44 MB, +1.9%; +3.3% against the rebuild of main's scripts). The recipe pairs gain the tables' meanings of the new words (hitman → sicario, fiancé → novio): 0.14–0.23 MB each.

"perfectionistic" (3 examples, no table) and "paracetamol" (6, no table) stay out. Still open: en-ja could give the rarer words the tables' Japanese as it does for capital-only words: many have one in the tables; the first English sense is sometimes another use (mojo, perv, unspent's verb "unspend").

## Still open

- A dotted abbreviation's card shows the vocabulary's lower-case head ("u.s.", not "U.S.") and lists the lower-case word's senses after the capital one (U.S.: unserviceable, ubi supra), as EJDict files them together.
- Initialisms of several things: the hover shows one expansion, and the most translated is not always the one meant (DEA, GPU). A context check (the words around it, or the on-device model) would be needed.
- A capital-only word inside a longer name (New Zealand, Europa League): the multi-word name is a phrase the matcher does not detect (B4); handled best there.
- Words without a translation table (NYPD, ChatGPT, Grammys, AGI: about 50 tokens) and without a Wiktionary entry (Nvidia, AirPods, Binance: 598 tokens) stay without a hover.
- Capital-only words in documents in capitals (ALL-CAPS captions) and in caseless speech recognition stay unknown: their case says nothing.
- The recipe pairs (es, pt, ru, fr, de, zh, it, pl): their `capital.json` is not rebuilt, so they show the English definitions translated at display time, and rule D takes their places for names (no native meaning). Rebuilding them with the capital-only words gives native meanings (Tokyo → Tokio) and 8 more pack versions.
- Plain words below rule E's threshold: handled by "Rare words" above (102 tokens); paracetamol, perfectionistic and other words without a translation table stay without a hover.

## Measuring

```
STUDY=2026-11 REPO=<checkout> UNITS=data/raw/quality/2026-11/runs/units-87d8606/units.jsonl \
  OUT=data/raw/quality/2026-11/runs/<label> npx jiti .claude/skills/real-content-quality/scripts/measure.ts
```

Runs: `pn-base-eff3fcd` (before), `pn-code1` (code step), `pn-data5` (data step); judging in `packets/pn1`. Rare words: `rw-base-314d78d` (main's packs), `rw-rebuilt-base`, the candidates `rw-acc8`, `rw-t6`, `rw-t5`, `rw-tab1m3`, `rw-m7tab3m3` (capital threshold not yet separate), `rw-g6`, `rw-g5`, `rw-g4t1`, `rw-g3t1`, `rw-g2t1`, and `rw-final`; judging in `packets/rw1` (g5) and `packets/rw2` (g4t1).
