# Translation quality on real content (2026-11-13)

How good are the meanings, phrases and translations Lingo shows on real videos and articles, which fixes work, and how they are layered so they carry over to other language pairs. Learning language English, native language Japanese, default settings (known level 3000, nothing saved).

Two rounds:
- **Round 1** measured the current build and proposed fixes.
- **Round 2** measured on new, three times larger content. It prototyped the fixes offline, outside the repository, and tested them blind against the current build. Ideas that did not hold up were dropped.

## Method
- **Round 1 corpus** (48,500 word tokens):
  - 10 YouTube videos: TED, BBC explainer, late-night interview, Kurzgesagt, cooking, teen vlog (ASR), SNL, a 67-minute podcast (ASR), Crash Course, tech review.
  - 5 random Friends episodes.
  - 10 news articles from BBC, AP, Guardian and NPR.
- **Round 2 corpus** (167,000 tokens, different content):
  - 30 YouTube videos in 14 genres. 14 are ASR-only and 4 have a human Japanese track. They include US, UK and Australian speakers, vlogs, gaming, podcasts, stand-up and sports.
  - 30 articles from 10 outlets: BBC, Guardian, AP, NPR, Al Jazeera, The Conversation, Sky, CBS, PBS and CNN.
  - 15 Netflix episodes (63,800 tokens): 3 random episodes each (seeded) of Suits, The Office (US), Breaking Bad, Brooklyn Nine-Nine and The Crown. Two of them have ALL-CAPS captions.
- **Collection**: everything was collected in the user's Chrome with the check build. Captions are the player's own tracks (`en`, `ja`, `tlang=ja`); Netflix cards come from Lingo's transcript. Copyrighted text stays out of the repo.
- **Pipeline**: Lingo's own code ran offline over the corpus (`createLanguagePack`, `createClassifier`, `createEnJaDictionary`, `captionCards`). Spot checks of highlights and hover cards in the real UI matched it. The check build's error log was empty after every session.
- **Judging**: Claude judged every sample against its sentence.
  - Round 1: 480 hovers, 185 cards/paragraphs, 471 phrase keys, 272 machine-translated definitions, 100 subtitle lines.
  - Round 2: two blind A/B rounds of about 780 hovers and 330 units each on YouTube and articles, current build against prototype. The second A/B used a fresh sample, so the rules were not tested on the items they were tuned on.
  - Netflix was judged last (390 hovers, 165 cards), with the prototype frozen: no rule was tuned on TV dialogue.
  - The samples over-represent hovers the prototype changes; rates below are re-weighted to the corpus.
  - One judge per item: read differences under ±4 points as noise.
- **Chrome's built-in AI** (Translator API, Prompt API / Gemini Nano) ran in the user's Chrome 157.

## Results: current build
| | Round 1 YouTube | Round 1 Netflix | Round 1 articles | Round 2 YouTube | Round 2 Netflix | Round 2 articles |
|---|---|---|---|---|---|---|
| Hover meaning good | 59% | 57% | 46% | 56–58% | 61% | 48–50% |
| Hover meaning wrong or misleading | 21% | 22% | 34% | 17–21% | 16% | 23–25% |
| Tokens with no hover (besides "I", "a") | 2.4% | 3.4% | 5.3% | 2.7% | 3.5% | 6.0% |
| Phrase highlights per 1,000 tokens | 18 | 17 | 18 | 17 | 22 | 15 |
| Cards with no Japanese line | 1.5% | 28% | – | – | 15% | – |

Round 1 details that still hold:
- **Phrases**:
  - Recall is very low: 185 expressions a learner needed were missed in 185 sampled units, 48 of them high value.
  - Detected phrases often show the wrong sense: break up → 壊れる, talk about → a usage note, number one → 本人自身.
  - Wrong matches come from a noun followed by a particle (trucks in, punch in the gut).
- **Machine translation**:
  - YouTube's own auto-translation (4.2/5) beats Chrome's Translator (3.3/5) on subtitle lines. The source order (site track → tlang → built-in) is right.
  - Of 272 phrases shown through an English definition, the definition fits the sentence in 55%.
  - Idioms translated alone come out literally half the time (under the weather → 天気の下で).
- **Netflix**: 28% of spoken cards show no Japanese because condensed Japanese cues are aligned to one card only (`alignByOverlap`).

## Root causes
1. **The hover is one string chosen at build time**: EJDict's first sense (`short`). The sentence is never used, so first-sense, part-of-speech and inflected-form errors follow:
   - just → 正しい, fine → 罰金, decline (noun) → …を断る
   - decided → 明白な, has → haveの三人称…
   - of / so / have give 100–300-character dumps
2. **A word's key is its surface form when that is a headword**, so EJDict's derived adjective or pointer entry wins over the verb.
3. **EJDict merges case variants and lists names as common words**:
   - Japan → 黒い漆, China → 磁器, Mark → 跡, Twain → 二つ.
   - Casing can't help in ALL-CAPS captions or lower-case ASR.
4. **The phrase build drops entries whose words are all common** (`isPhraseSense` rank thresholds, `isCommonPair`):
   - 174 of the 185 missed expressions were not in the data at all: you know, sort of, in turn, take shape, instead of, all right.
   - Nobody can even select them.
5. **Phrase meanings come from the first translation-table word**, or from the first English definition, regardless of sense.
6. **The vocabulary is EJDict's headwords only**: app, website, um, wanna, gaslighting get no hover.
7. **Site translations are aligned one cue to one card.**

## What was tested in round 2
| Idea | Result | Decision |
|---|---|---|
| Prototype v1 (all fixes below, first version) | Good hovers +12–14 pts, but wrong/misleading unchanged (21→21%, 25→24%): it fixed readability, not wrong senses. Phrases: more useful, more noise, units a tie. | Refined |
| **Prototype v2** (A1–A3, D with the fixes below, phrase data v2, context check) | **YouTube**: good 58→70%, wrong/misleading 17→11%. **Articles**: good 50→66%, wrong/misleading 23→15%. Changed hovers preferred 275 vs 52. Phrases: articles useful 37→40, low-value 19→4, wrong-match 16→8. YouTube useful 14→33, wrong-match 7→14. Units preferred 55 vs 37. **Netflix** (not tuned on): good 61→74%, wrong/misleading 16→13%, changed hovers preferred 137 vs 27, phrases useful 23→46, wrong-match 3→13, units preferred 29 vs 20. | **Recommended** |
| Pick the sense by matching glosses against the card's Japanese line | ~7 fixed, ~7 broken of 282 | Dropped |
| Gemini Nano picks the sense freely | Changed 71% of hovers; 72% fit vs 70% today | Dropped |
| Gemini Nano as a yes/no verifier of the shown meaning | Says "no" to 80% of hovers: catches 97% of bad ones, but also flags 3 of 4 good ones | Dropped (automatic use) |
| Normalise definitions before MT (drop "To ", trim ために, dedupe) | Preferred 32 vs 43 the other way; mean 3.23 vs 3.36 | Dropped |
| Sentence-case ALL-CAPS lines before MT | 59 of 60 translations identical (the translator ignores case) | Dropped |
| Previous line as MT context | Improved 0 of 29, worse 4 | Dropped |
| Raise B2's threshold for phrase precision | 0.55 → 0.75 keeps 68 of 178 judged highlights, but the useful share stays 67–71% | Dropped: the score does not separate noise from useful phrases |
| Precision rules P1 + P2 (below) | Useful share of highlights 67% → 78% (current build: 54%); useful with a fitting meaning 53% → 62%. Density 33 → 26 per 1,000 tokens. Tuned and measured on the same 178 judgements, so expect less on new text | **Recommended** (precision first) |
| Show the top senses instead of one (hit@k) | A fitting sense is among the first 1 / 2 / 3 / 4 senses for 60 / 74 / 81 / 86% of 360 words; 90% have one somewhere. Lines grow from 10 to 20 / 29 characters (median) | Option for the UI (see "Costs and decisions") |

The on-device model is not reliable enough to decide anything on its own. It belongs to the user-initiated "Ask AI" of phase 3, not to automatic hovers.

## Recommended fixes, by layer
Every rule is general: it is driven by grammar, the sources' own structure and statistics, never by lists of specific words or phrases. The layers decide what another language pair has to provide:
- **CORE**: the language-independent mechanism, shared by every pair.
- **LEARNING**: a part per learning language, inside `LanguagePack`.
- **NATIVE**: a part per gloss or native language, on the dictionary side.
- **PAIR**: quirks of one dictionary source.

### CORE (shared by every pair)
| Rule | What it does | Evidence |
|---|---|---|
| A1 Base form before derived headword | Follows pointer entries ("Xの過去", "=X", "Plural of X") to their target. Uses the base's entry when the tag says the token is an inflected verb (decided/VBD → decide). Keeps the surface entry when the tag says adjective (established, limited) or the token is an auxiliary (has been → keeps the grammar pointer). | v1 regressions on auxiliaries and participles fixed in v2 |
| A2 Part-of-speech-aware sense | With a trusted tag, leaves sense 1 only on positive evidence: sense 1 is labelled with another POS and the entry has a sense of the tagged POS (fine/JJ → りっぱな, just/RB → 単に, like/IN → …に似た). | Preferred 75 vs 17 in v1 |
| A3 Short line by rule | Shows the chosen sense, cut at the first sense separator, capped at 25 characters (ja) or 40 (en). v2 keeps the first two senses when they fit. | Lines over 25 chars: 4,332 → 0. Mean 19 → 10 chars |
| B1 Import every multi-word entry | Every idiom, phrasal verb, phrase, prepositional phrase, interjection and multi-word noun, at any word rank, stays matchable on selection. Multi-word nouns need a corpus hit or a translation table (drops 48k unattested compounds). | 19,932 → 76,460 patterns. 87 of 185 round-1 misses now in the data (was 17) |
| B2 Idiomaticity score decides highlighting | How far the phrase's definition is from its words' definitions, plus the source's idiomatic/figurative tags. Translated senses weigh more; labelled (slang, sports…) senses weigh less. The threshold rises with the phrase's corpus frequency and low PMI. The corpus is all kaikki usage examples, 21M tokens, with each entry's own headword cut out. Replaces `isCommonPair`. | Noise pairs (come to, live in…) 14/18 → 1/18. Detected missed expressions 0 → 42 |
| B2b Transparent compounds | A noun phrase whose definition names every content word is not highlighted (digital signature, Olympic flame). | Low-value highlights 34 → 19 |
| B4 Named entities | Proper-noun or Title Case entries (New York, American Revolution) are not highlighted; they stay available for lookup. | |
| Context check on phrase matches | Drops a match whose own POS conflicts with its context: adverb "kind of" before a noun ("what kind of music"), interjection "you know" with an object. Drops a verb-only phrasal verb whose first word is tagged as a non-verb (trucks in, punch in the gut). | 12 of 28 wrong matches removed, 2 of 126 useful lost |
| P1 Conversational sentences are lookup-only | An entry whose only POS in the source is "phrase" (a whole utterance: thank you, I know, see you, let me see) is never highlighted; it stays available on selection. | 20 judged highlights, 35% useful |
| P2 Particle must be adverbial | A two-word verb + particle pattern is highlighted only when the tagger reads the particle as an adverbial particle (RP/RB): find out, give up, end up stay; come to + NP, look at, press on, get through go. | Removes 14 bad and 5 useful highlights |
| C2 Rank English definitions by the source's labels | Demotes usage notes, register (vulgar, dated, slang) and domain senses for multi-word terms, and resolves "Synonym of / Clipping of X". | 11 of 70 wrong-sense phrases now fit; 14,875 pointers resolved |
| D Names by document casing | A word capitalised mid-sentence in mixed-case text and never lower-case there is a name for the whole document, if the names lexicon has it. Never a name: function words, interjections, sentence starts without evidence, words after a determiner. Shows "(name)" only when the dictionary would give a common-noun meaning; a proper-noun meaning is kept (France → フランス). | v1 lost France/June; fixed in v2 |
| E Vocabulary from the learning language's Wiktionary | A headword joins the vocabulary when it appears in lower case at least 5 times in other entries' examples. Meanings for words the pair dictionary lacks are English definitions translated at display time, as phrases already are. | +12,493 words. Round-1 unknown tokens 1,366 → 830 (um, cuz, wanna, app, website, chemo) |
| G Many-to-many alignment of site translations | Shows a translation cue on every card it overlaps substantially, as `alignAsrSentences` already does for ASR. Not prototyped. | Netflix cards with no Japanese line today: 28% (Friends), 15% (round 2, 3–22% per episode) |

### LEARNING part (per learning language, in `LanguagePack`)
- **Tagger**: `tagger(sentence) → {label, inflected, proper, confidence}[]` plus a confidence threshold. English: an averaged perceptron trained on UD English-EWT.
  - 93.9% accuracy in-domain, 125 KB gzipped, 3.5 ms per 1,000 tokens, no dependencies.
  - The model is CC BY-SA, the same licence as the shipped Wiktionary packs.
  - Alternatives measured: compromise 84.7%, wink-pos-tagger 89.2%, en-pos 90.6%.
  - Tags are used only when the tagger is confident (88% of tokens).
- **Closed classes**: particles (empty for languages without phrasal verbs, which turns that part of the context check off), determiners, auxiliaries, slot words.
- **Casing convention** for D, and a **names lexicon** from the edition's proper-noun entries (~50 KB gzipped for English).
- **Phrase POS** per pattern from the edition, kept as a field of `phrases.json`.
- **Example corpus and frequency** for B2/E: built from the edition's own usage examples.
  - English has 21M tokens. Spanish has 0.46M, so its frequency signals are weaker.
- **Word pattern**: `patternKey` currently accepts only unaccented English letters and drops "buenos días". It must take the pattern from the language config.

### NATIVE part (per gloss language, dictionary side)
- `GlossReader`:
  - `pointer(sense)`: "Xの過去", "=X" in Japanese; "Plural of X", "Synonym of X" in English.
  - `inferPos(sense)`: from Japanese gloss endings and 《》 notes. Labels 84% of EJDict senses (today's `inferPos` labels far fewer).
  - `shortLine(sense, cap)`: separators ; ／ ・, 25-char cap for Japanese.
- Better: compute per-POS short lines at build time (`shortByPos`), so the extension ships no Japanese heuristics.
- Compositionality on native glosses (B2/B2b): kanji/katakana overlap with the words' own glosses. A katakana loanword gloss marks a transparent compound.

### PAIR data (one dictionary source)
- **EJDict**:
  - Strip the 〈C〉/〈U〉 and {形} markers and usage-comment senses.
  - Keep capitalised headwords apart (Japan → 日本, China → 中国; `data/gate/en-capitalized.json` is the start).
  - Read POS markers.
- **Wiktionary ja translation tables** (C1): keep up to 4 senses with their English hint, in the existing `《hint》word,word` style, instead of the first word only.
  - break up → 別れる first, 壊れる second; write down → 書き留める.
  - 901 → 7,597 phrases with Japanese.

### What a Spanish → English instance needs
- **LEARNING**:
  - A tagger trained on UD Spanish (AnCora/GSD, CC BY(-SA)).
  - Determiners; empty particles.
  - Names from kaikki-es.
  - An accent-aware word pattern.
- **NATIVE**: the English `GlossReader`. Senses already carry POS, so no inference is needed.
- **PAIR**: no quirks.
- **CORE**: reused unchanged.
- Running B1/B2 on Spanish with config only gives 5,070 patterns (repo: 2,470).
  - It highlights a pesar de, es decir, por supuesto and llevar a cabo, and keeps de la and a la out.
  - It misses sobre todo and ya que, and highlights "lo que": the Spanish example corpus is 46 times smaller.

## Costs and decisions for you
- **Highlight density**: phrases per 1,000 tokens go 16.8 → 27.9 on YouTube and articles, and 22 → 40 on Netflix dialogue (all sites: 33, or 26 with P1 and P2). "you know", "I mean" and "kind of" become visible. Reversing PR #28's rule for common pairs is intended here: B2 now decides by meaning, not word rank.
- **Bundle size**: packs grow 24.3 → 43.5 MB (6.8 → 11.4 MB gzipped), mostly English definitions.
  - Moving definitions of selection-only phrases (8.9 MB) to a downloadable pack is the simplest cut, once pack hosting exists.
- **Tagger model licence**: CC BY-SA (like the Wiktionary packs).
- **Threshold**: B2's threshold (0.55) was set for recall. Raising it does not raise precision, so precision comes from P1 and P2 instead (decided: precision before recall).
- **Several senses in the hover** (hit@k, 360 words in context, YouTube / Netflix / articles):

  | Senses shown | 1 | 2 | 3 | 4 |
  |---|---|---|---|---|
  | A fitting sense is among them | 60% | 74% | 81% | 86% |
  | Highlighted (new) words only | 58% | 74% | 86% | 90% |
  | Line length, median / 90th percentile (chars) | 10 / 21 | 20 / 40 | 29 / 51 | |

  - The ceiling is 90%: for the rest no sense of the entry fits (a wrong key, a name, slang).
  - Order matters little: dictionary order gives 58 / 72 / 79 / 84%. The sources have no sense frequencies, so "most frequent" means dictionary order with the tagged part of speech first.
  - It helps words with 2–6 senses most (1 → 3 senses: 64 → 90%). Words with 7 or more senses (get, have, so, line) stay low (48 → 56%).
  - Cost: the learner has to pick the sense, and the meaning takes about three times the space.
  - Decided (2026-11-13): the hover shows up to three senses, all the same size.

## Still open
- **Wrong sense within the right part of speech** (battery → 砲兵中隊, fleet → 艦隊, hike → ハイキングする, miss → 未婚婦人; in dialogue: guy → 控え綱, cool → 涼しい): no general offline rule found. They need sense frequencies the sources don't give, or "Ask AI".
- **Literal vs idiomatic readings** that POS can't separate: come to, in time ("point in time"), not even, got it.
- **Useful vs transparent compounds** that look alike in the data: law enforcement vs public health.
- **Expressions that are not Wiktionary entries** (a lot of, depend on, think less of): 98 of the 185 round-1 misses. They need a collocation source.
- **Names that are also words in caseless text** (CHANDLER, PHOEBE in ALL-CAPS captions).
- **Tagger accuracy on ASR and captions** (measured only in-domain); its errors flip a few senses (calmer → 静けさ).

## Suggested order
1. A1, A3, D and the EJDict capitalised split (small, deterministic, measured). **Done** (2026-11-13):
   - PR #54: hover lines follow pointers to the base word (went → goの過去, then go's senses) and keep one short sense per line (lines wider than 25 Japanese characters 21,750 → 328 on the corpus).
   - PR #55: EJDict's capitalised senses are kept apart (Japan → 日本 first) and names are found by document casing (no highlight, no hover).
   - The tag-dependent part of A1 (decided → decide, auxiliary "has been") moves to step 2.
   - Seen in the real-site check: a surname missing from the names lexicon still gets a common meaning (Harvey Specter → 幽霊). A run of capitalised words should be one name, which would cover it.
2. The tagger part, then A2 and the phrase context check with P1 and P2. Also the tag-dependent part of A1. **Done** (2026-11-13):
   - PR #56: an averaged-perceptron tagger trained on UD English-EWT (118 KB gzipped) picks the sense by part of speech (A2) and the base form of inflected verbs (A1); 10,212 hovers changed on the corpus.
   - PR #57: phrase part of speech, P1, P2 and the context check. Phrase highlights 18.4 → 14.9 per 1,000 tokens; useful share of judged highlights 89 → 94%.
3. The phrase data rebuild (B1, B2, B4, C1, C2) with its size decision. **Done** (PR #58, 2026-11-13):
   - Patterns 19,932 → 73,112; phrasal verbs are always detected (P2 still checks each match); particles that are never adverbs (to, for, with…) never make a phrasal verb.
   - Phrases with Japanese 901 → 7,270; English definitions ranked by label.
   - A run of capitalised words after a name is one name (fixes Harvey Specter).
   - Highlights 14.9 → 26.8 per 1,000 tokens, as estimated in "Costs and decisions"; useful share of judged highlights 94 → 79%.
   - Size: all packs 37.7 → 46.5 MB, all bundled (en-defs leaves out terms every pair dictionary has). A test fails above 50 MB.
4. E (vocabulary). **Done** (PR #59, 2026-11-13):
   - Threshold 8 lower-case uses (not 5) in post-1900 examples, to stay under 50 MB: +6,328 words. Acronyms join only as their own entry (AI is no longer a sloth).
   - Word tokens with no meaning 5,566 → 3,979. New words get a rank from the TV list or the example count.
   - Words shown as New 77.5 → 84.4 per 1,000 tokens; 23 of 30 judged new words show a useful meaning (kinda, cuz, aka still wrong).
   - All packs 49.65 MB. E2E waits on the first cold dictionary load are close to their 5 s limit on the CI runner.
5. G (alignment). **Done** (PR #60, 2026-11-13):
   - A translated cue also shows on every other card it covers at least 50% of.
   - Measured on 6 YouTube videos with human Japanese tracks: cards with no line 2.3 → 1.3%; on tracks condensed like Netflix 21.7 → 1.0%. Neighbour's text 3.9 → 6.3% on condensed tracks; on finely cut, loosely timed tracks about 0.8% of cards get worse.
   - Netflix was not re-measured offline (no timed Japanese tracks in the corpus).
6. Keep the on-device model for "Ask AI". **Done** (PR #61, 2026-11-13): design.md and the roadmap say the model is used only when the user asks.

Real-site check after all six steps (check build from b66986e; the same article, YouTube video and Suits episode as step 1; error log empty on every page, then cleared):
- Working as intended: names in a run are not highlighted (Pearson Specter Litt, Simon Mabon, Lancaster University); Gulf after "the" shows 湾 first; "no longer" → 最早,もう,これ以上; a Japanese cue that spans several cards shows on each of them.
- Still wrong:
  - Meanings translated at display time are not shortened. "get around" shows a three-line translation of its literal sense (move around an obstacle), and "not to mention" shows the figure-of-speech definition, the same failure as the MT judging (section A). "put together" repeats an item (構築、構築).
  - "Nov" in a date shows 初心者: rule E's "nov" (a clipping of novice) wins over the month abbreviation.
  - Wrong phrase matches in dialogue: "just about" in "this isn't just about you…", and "you tell me" in "why don't you tell me…".
- Next fixes this suggests: apply A3's cap and de-duplication to translated English definitions; demote "Used to…" and figure-of-speech definitions in C2; keep abbreviations (Nov, Mon, Jan) on their dictionary entry before rule E words; check "just about" (before a pronoun or noun phrase) and multi-word phrases inside questions with the context rule.

Hover fixes after that check (PR #62, 2026-11-14; corpus of 171,709 tokens; checked in the user's Chrome with the check build from 87d8606, error log empty on all three pages, then cleared):
- Translated meanings: the hover shows one short line (each comma item once, within 25 Japanese characters; a long line keeps the longer of a head that ends a clause and a tail, since the main verb comes last). Over 264 Chrome translations of definitions: width median 32 → 30, 90th percentile 66 → 46, over the cap 23% → 0%. "put together" → 組み立て、構築、または定式化.
- Usage notes: a definition that only says how a phrase is used ("Used to…", an apophasis, a rhetorical question) is not translated; the phrase itself is. "not to mention" → 言うまでもありません. Over the 22 such terms in the corpus (94 uses): better 71, worse 12 (my goodness → 私の良さ, suck it), alike 11.
- Abbreviations: a capitalised word EJDict has no lower-case entry for takes EJDict's abbreviation ("Nov" → 11月(Nov.); Wis, St, Mon). A lower-case pointer to a letter-case form takes that form's definition (aka, gif, dna: 219 words).
- Dialogue: "you tell me" inside a longer sentence and "just about" / "kind of" before a personal pronoun are no longer highlighted; "don't" counts as a do-auxiliary. Highlights 26.8 → 26.7 per 1,000 tokens; the 23 removed are all wrong matches; the 178 judged highlights are unchanged.
- Not fixed: "get around" still shows Wiktionary's first, literal sense (now one short line). Lifting senses labelled figurative or idiomatic was measured and dropped: the labels are uneven ("get it" ×48 → to receive punishment; with verbs and "figuratively" only, 15 better vs 8 worse, "go to sleep" → paresthesia).

## Netflix
Round 2 judged Netflix last, after the prototype was frozen, so these numbers test whether the rules carry over to TV dialogue.

**Results**:
- Hovers: good 61% → 74%, wrong or misleading 16% → 13%. Of the changed hovers, the prototype was preferred 137 times and the current build 27 times.
- Phrases: useful 23 → 46, low-value 12 → 11, wrong-match 3 → 13. Units were preferred 29 vs 20; 116 were a tie.
- Names: 1,991 tokens become "(name)": 805 had a common-noun meaning before (Harvey, Zane, Dwight), and 1,186 had no hover at all.
- Hovers missing in the current build are mostly character names and spoken forms: wanna, yo, um, ya, hmm. "anymore" is missing too, because EJDict has only "any more".

**What dialogue adds to the list** (general rules, not prototyped):
- **A1 on light verbs**: most of the 27 hovers where the current build won are inflected light verbs.
  - got home, got blown up → 受け取る; made, broke, had to → the base's first sense; "Does Harvey know" → …をする. The current build's grammar pointer ("getの過去") was rated acceptable; the base's first sense is wrong.
  - Rule: treat do-support (do + subject + verb, do + not), have/has/had + to and get + past participle as auxiliaries, which A1 already handles.
  - Rule: when the base has many senses and A2 has no evidence, show the pointer with the base's first two senses, not the first sense alone. The sense count is a statistic of the entry, so the rule needs no word list.
- **Slots inside longer idioms**: most new wrong matches are a short entry inside a longer idiom the data cannot match.
  - next thing I know → "I know"; a long way to go → "way to go"; kick my ass → "my ass"; have your work cut out → "cut out".
  - Rule: expand Wiktionary's placeholders (one's, someone, something) into pronoun, possessive and noun-phrase slots when the patterns are built. Then let the longest match win.
- **Discourse markers**: you know, I mean, all right and come on are judged useful, but the meaning shown often does not fit. Phrase POS is already in the data (B1), so A2's rule can run on phrases too: a marker at the start of a clause or standing alone takes its interjection sense.
- **Caption labels**: [sighs], [scoffs], [clears throat] have no subject, so the tagger reads them as nouns (sighs → ため息). The captions part should tag a bracketed label as a clause with an implied subject.
- **Interjections taken as names**: "Aww" at the start of a dialogue turn became "(name)". D must treat a dialogue dash ("- ") and a bracketed speaker label as a sentence start.
- **Within-POS senses in casual speech**: guy → 控え綱, cool → 涼しい, last night → 最後の, "the second you…" → 第2の. These belong to "Still open" (wrong sense within the right part of speech). They are the most frequent wrong hovers left in dialogue.

**Site translations**: 15% of spoken cards have no Japanese line (3–22% per episode), against 28% on Friends in round 1. G (many-to-many alignment) is still needed.

**ALL-CAPS captions** (The Office S5E9, Brooklyn Nine-Nine S1E15): the tagger stays confident on them (87% of tokens vs 84% on mixed case), but it misreads some verbs as nouns (THROW → 投げること). Case-insensitive tagging was not tested.

## Measuring
- The offline runner, the blind A/B packets and the judging rubric worked well and could become `npm run eval:quality`.
- It would run over freely licensed text plus the caption fixtures and report:
  - hover coverage
  - highlights per 1,000 tokens
  - the 95% gate
- Each fix above can then be checked against the same baseline.
