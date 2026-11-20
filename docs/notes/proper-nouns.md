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

"perfectionistic" (3 examples, no table) and "paracetamol" (6, no table) stay out. en-ja gives them the tables' Japanese since "Data fixes" below; the first English sense is sometimes another use (mojo, perv, unspent's verb "unspend"), whose tables have no Japanese.

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

On Wikipedia's article path, offline (the pages' text through `tokenize`, `documentCasing`, `classify` and the en-ja dictionary with the page as the document; Claude in Chrome was not reachable for the check in the user's Chrome): Drug Enforcement Administration: DEA and DEA's → "Initialism of Drug Enforcement Administration" (before: diethanolamine), U.S. and US → "United States 合衆国 / unserviceable" headed U.S. and US, also "(DSS), U.S. State Department", read among capitals (it showed ubi supra first: dotted capitals now count as written in capitals anywhere); Nvidia: the same for U.S. and US; GPU on Graphics processing unit and Nvidia still "State Political Directorate" (below). "(DEA)" in brackets and "DEA SRT" next to another acronym are read with no case (brackets are labels, two acronyms a caps run), so they take no expansion; the capital-only DEA still shows its own senses there.

Not fixed, and why:
- **GPU** → "State Political Directorate" in a laptop review, which never spells it out. en-defs replaced the pointer "Initialism of graphics processing unit" with that term's definition ("A specialized electronic circuit…"), so the sense no longer names its expansion, and no document rule can match it. Data proposal (scripts/data, for the agent who owns it): keep an initialism's expansion in its followed sense ("graphics processing unit: A specialized electronic circuit…"), so the card names what the letters stand for and a page that writes "graphics processing unit" leads with it; and rank an initialism's expansions made of a common noun's words before a historical proper noun's.
- **ANC** → absolute neutrophil count in an earbuds review: the sense meant, "active noise control or active noise cancellation", is kaikki's third of five and en-defs keeps four, dropping it. Data proposal: keep every "Initialism of" sense of a capital-only word (they are one line each).
- **H.R.** → House of Representatives in The Office: every source of the dotted form (EJDict's "H.R.", kaikki's "H.R.") has only that; "human resources" is under HR, which joined no list (no translation table). Not this class; a data question (the undotted capital-only word's senses for its dotted spelling).
- **Netflix** the verb ("To watch … using … Netflix") for the company in "the new Netflix movie": kaikki has Netflix only as that verb (the company has no entry), so rule E kept the verb. Rule A2 cannot help (capitalised words are read without their tag, and the tag's noun has no sense to choose). Not this class; data: a capital-only word whose every sense is a verb derived from the name (a "using … Netflix" definition) should not join, or should join as a name.
- **M.O.** → mail order (modus operandi meant), RAM → 雄羊座 (no "RAM" acronym entry in EJDict; the title entry Ram, Aries, is used), DM → Deutsche mark (direct message), Sol in "Puerta del Sol": the text spells none of them out; data.
- An abbreviation in capitals in a document that spells out another of its expansions ("5 PM" in a text that writes "Prime Minister") leads with that expansion. None in the corpus.

## Data fixes (2026-11-20)

The data proposals of "Not fixed, and why" above, and the rarer words' Japanese ("Rare words": still open). Same corpus and units; `df-base-b18f375` (main's packs, which a rebuild of main's scripts reproduces) → `df1-v3`. Rules in [architecture](../specs/architecture.md) "Vocabulary and frequency (rule E)": "Meanings", "Capital-only words, the data", "Their meanings"; "Abbreviations spelled out".

| Idea | Result | Decision |
|---|---|---|
| en-defs: an abbreviation's pointer keeps what it stands for in the definition it takes ("graphics processing unit: A specialized electronic circuit…"), also where kaikki nests the definition under "Initialism of X." (HR's "human resources: The human capital of an organization") | 97 tokens' English lines change, mostly capitals (GPU's second line, ASMR, GG); the card names the expansion, and a document that writes it leads with it | Recommended |
| en-defs: a capital-only word keeps every abbreviation sense beyond four; the expansion rule reads each alternative joined by "or" | ANC in the earbuds review (which writes "Active Noise Cancellation") → "Initialism of active noise control or active noise cancellation" (3 tokens; was absolute neutrophil count) | Recommended |
| A capital-only word's abbreviation sense with no Japanese takes its expansion's tables' Japanese, hinted by the expansion | 630 → 686 words with Japanese (CPU → 中央処理装置, USB, SSD, Falklands, Saudi → サウジアラビア, Zealand's second line ニュージーランド); FC → 野手選択 (fielder's choice) where its first sense, football club, has no Japanese | Recommended |
| The same for rule E's lower-case words | mm → 月 (month) in "Mm-hmm", pre → 我慢汁, neo → ネオジム, min, com, micro, med: most of the wrong new hovers of the first judging | Dropped |
| en-ja: rule E's words the tables' Japanese (in `en-ja/phrases.json`) | 1,862 of 9,916 words; 490 tokens change from an English definition to Japanese (router → ルータ, smartphone → スマホ, hitman → 殺し屋, eventually → 結局) | Recommended |
| …only where the word's best-ranked sense has Japanese | would drop 420 of 2,739 entries, most of them right (areola, biomass, voicemail, lepton: the table is at entry level, or the ranking puts a rare sense first) | Dropped |
| mojo, perv, recused | no Japanese in their tables: they keep their English definitions (the first sense still another use) | Open |
| Netflix: a verb's sense whose gloss names the word itself is no meaning of a capital-only word | Netflix and Venmo leave (1,330 → 1,328); "the new Netflix movie" has no hover, as for a company Wiktionary has no entry for | Recommended |
| GPU: an initialism's senses ranked by their expansions' tables | 40 of 1,328 first senses change: GPU right, but CV → coronavirus, CNN → convolutional neural network, IBM → missile, BMW, GC → grandchild | Dropped |
| GPU: a historical proper noun's expansion after a common noun's | 2 change: GPU → gas permeance unit (graphics processing unit carries a domain topic), GDR → global depository receipt | Dropped |
| Register-labelled senses after the others, for capital-only words | 46 change, mostly worse (Instagram → "A user's profile", FAQ, ISP, Nanjing) | Dropped |
| H.R.: the spelling without periods' senses first, en-defs and en-ja | H.R. → 人材開発部 (human resources) right, but P.M. → 検視 (post mortem) for "3 P.M.", M.O. → ミズーリ, D.A. → ドーパミン, A.M. → アマゾナス州 | Dropped |
| H.R.: those senses after the dotted spelling's own, en-defs only | the dictionary window of a recipe pair lists HR's human resources after House of Representatives; en-ja keeps EJDict's 下院 | Recommended |

Over the corpus: unknown tokens 3,523 → 3,524 (Netflix), New 86.7 and phrases 26.1 per 1,000 tokens unchanged, names 1,071, hovers translated at display time 3,557 → 3,057, lines over the cap unchanged (328). 653 word tokens change. Judged blind on two samples (`packets/df1` for v2, with lower-case words' expansions, then `packets/df2`, a fresh sample of v3; changed hovers only, one judge per site): good 77 → 131 and 96 → 130, acceptable 63 → 24 and 50 → 27, wrong or misleading 39 → 24 and 32 → 21; preferred after : before 133 : 18 and 115 : 16. The wrong ones left are mostly old: clippings in lower case (mm → "month: …", com in audible.com, pre in "pre-…"), a name read as a word (Cooper → 桶屋, "takin'" → ターキン), DEA with no expansion in its document, FC → 野手選択, Google → ググる for the company.

Sizes, raw MB, lock → now: `en` 6.881 → 6.881, `en-ja` 7.816 → 7.997, `en-defs` 22.738 → 22.613 (words every pair now has leave it); en→ja 37.44 → 37.49 MB (guard 40). The recipe pairs are unchanged. `data:capitals` now runs after `data:phrases` (it adds the words to `en-ja/phrases.json`) and reads the extract twice (the expansions' tables), about a minute.

## Multi-word names (2026-11-20)

A capital-only word inside a longer name was looked up alone: Zealand → シェラン島 in "New Zealand", Latina, Europa. The name is a kaikki entry (B4, a named entity: never detected), but no pattern when one of its words is a capital-only word (B1 asks for vocabulary words). Rule in [architecture](../specs/architecture.md) "Names that are units". `df1-v3` (data fixes 1) → `df2-v4`.

| Idea | Result | Decision |
|---|---|---|
| Named patterns with a translation table, capital-only words allowed, detected where the text writes their capitalised words so, not in a text in capitals | 2,580 names; 200 spans; judged blind (`packets/nm1`, 160 of them): 158 the name the text means, meaning fits 144 | Refined |
| + two capitalised words at least | "I have never" (a game, matched in "But I have never missed a train") and 63 terms whose one capital any text writes (Ming dynasty, Pythagorean theorem, Russian roulette) out: 2,522 names, 198 spans | Recommended |
| Names as written in title case word by word | "Council Of Europe" would ask "Of" for a capital | Dropped: as the entries write them |
| A capital-only word inside a run of capitals forming a known name gets no meaning (the brief's fallback) | not needed where the name is a unit; where no entry exists (Europa League, Tokyo Station) nothing is known to form | Dropped |
| Names lower case in the pack (smaller under gzip) | 455.7 against 460.6 KB gzipped, but the card's head and the small words' case are lost | Dropped |

Results: 198 name spans over the corpus (YouTube 47, Netflix 60, articles 91; 1.2 per 1,000 tokens): phrase highlights per 1,000 tokens 26.1 → 27.2 (articles 12.3 → 15.7, YouTube 27.9 → 28.5, Netflix 29.5 → 30.4), New 86.7 → 86.1 (a name's words are no longer New words one by one), unknown and names unchanged. New Zealand (2), Saudi Arabia (3), Latin America, Wall Street, New York (17), Middle East, World Cup, Inner Mongolia now hover as the name. Wrong meanings: Your Honor ×11 (its first sense in en-defs is a representative's form of address, not a judge's), Twelfth Night (the festival, for the play), The Rock (the prison, for the wrestler), Jesus Christ as an oath. The judges call names low-value highlights (133 of 160; the rubric counts a name as low-value), so they preferred the changed units 34 : 39 (85 the same); the hover precision is the point of the rule.

Costs: `en/phrases.json` 443 → 461 KB gzipped (its budget raised 450 → 470 KB); `en` 6.88 → 6.94 MB, `en-ja` 8.00 → 8.01 MB raw (the names' Japanese from the tables, 7,558 → 7,621 phrase meanings), `en-defs` 22.61 → 22.70 MB (the new patterns' definitions); building the matcher 37 → 46–51 ms in Node. Europa League and Tokyo Station have no Wiktionary entry, so Europa (エウロパ) and Tokyo are still read alone there.

## Recipe pairs (2026-11-20)

The eight recipe pairs kept a capitalised headword only when its lower-case form was a vocabulary word (`capitalTermOf`), so the capital-only words had none: they showed the English definition, translated at display time, and rule D took their places for names. Now a capital-only word's capitalised headword is kept, never a lower-case one, and a name's words may be capital-only words. `df3-base-<pair>` (data fixes 2) → `df3-v2-<pair>`.

| Idea | Result | Decision |
|---|---|---|
| The capital-only words as capitalised headwords | Tokyo → Tokio, AI → IA, ATM → cajero automático, Kurdish → kurdo, Kyoto → Kioto (was a name), but Instagram → "Instagram", Sony, YouTube, MacBook: the gloss writes the name again | Refined |
| + a headword that means nothing (its gloss is the word itself) is left out for a capital-only word, which has its English definition | Instagram, Sony keep "An online photo- and video-sharing…" | Recommended |

en-es over the corpus: 168 tokens change; hovers translated at display time 2,749 → 2,603, names 1,372 → 1,348 (places with a native meaning), New 84.8 → 85.0; en-de 3,304 → 3,165, names 1,381 → 1,369. Judged blind (`packets/rc1`, en-es, 35 changed hovers, one judge): good 15 → 23, acceptable 18 → 10, wrong 2 → 2; preferred after : before 27 : 7. Worse: RPG → "sigla de Rocket-Propelled Grenade" (the edition's first sense), Brunswick → Brunsvigo for a bowling alley, Ebola's river first (the edition's order, not `rankCapitalSenses`).

`de` and `de-en` rebuilt with the vocabulary of E1: the German edition's keys that are now English words leave (`englishWord`: 20 words, brontosaurus, mascarpone, dioxin, webmaster; de-en 58 → 38 lines changed).

## Still open

- A capital-only word inside a longer name with no Wiktionary entry (Europa League, Tokyo Station) is still read alone ("Multi-word names"); a name's first sense can be another use (Your Honor, Twelfth Night).
- Words without a translation table (NYPD, ChatGPT, Grammys, AGI: about 50 tokens) and without a Wiktionary entry (Nvidia, AirPods, Binance: 598 tokens) stay without a hover.
- Capital-only words in documents in capitals (ALL-CAPS captions) and in caseless speech recognition stay unknown: their case says nothing.
- The recipe pairs (es, pt, ru, fr, de, zh, it, pl): rebuilt with the capital-only words on 2026-11-20 ("Recipe pairs" below).
- Plain words below rule E's threshold: handled by "Rare words" above (102 tokens); paracetamol, perfectionistic and other words without a translation table stay without a hover.

## Measuring

```
STUDY=2026-11 REPO=<checkout> UNITS=data/raw/quality/2026-11/runs/units-87d8606/units.jsonl \
  OUT=data/raw/quality/2026-11/runs/<label> npx jiti .claude/skills/real-content-quality/scripts/measure.ts
```

Runs: `pn-base-eff3fcd` (before), `pn-code1` (code step), `pn-data5` (data step); judging in `packets/pn1`. Capital cards: `cc-base2` (main at 314d78d), `cc-fix3` (headword alone), `cc-fix5` (with runs); judging in `packets/cc1`, `packets/cc2`; the document-words prototype in `proto/capital-cards/lesk.ts`. Rare words: `rw-base-314d78d` (main's packs), `rw-rebuilt-base`, the candidates `rw-acc8`, `rw-t6`, `rw-t5`, `rw-tab1m3`, `rw-m7tab3m3` (capital threshold not yet separate), `rw-g6`, `rw-g5`, `rw-g4t1`, `rw-g3t1`, `rw-g2t1`, and `rw-final`; judging in `packets/rw1` (g5) and `packets/rw2` (g4t1). Data fixes: `df-base-b18f375`, `df1-v1` (dotted spellings' senses first), `df1-v2` (lower-case words' expansions), `df1-v3`; judging in `packets/df1`, `packets/df2`; multi-word names: `df2-v1` (title case word by word), `df2-v2` (one capital enough), `df2-v4`, judged in `packets/nm1`; the prototypes (ranking variants, the Japanese guard) in `proto/data-fixes/`.
