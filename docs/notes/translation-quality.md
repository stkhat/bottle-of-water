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
- **Round 2 corpus** (103,500 tokens, different content):
  - 30 YouTube videos in 14 genres. 14 are ASR-only and 4 have a human Japanese track. They include US, UK and Australian speakers, vlogs, gaming, podcasts, stand-up and sports.
  - 30 articles from 10 outlets: BBC, Guardian, AP, NPR, Al Jazeera, The Conversation, Sky, CBS, PBS and CNN.
  - Netflix was not collected (see the end of this note).
- **Collection**: everything was collected in the user's Chrome with the check build. Captions are the player's own tracks (`en`, `ja`, `tlang=ja`); Netflix cards come from Lingo's transcript. Copyrighted text stays out of the repo.
- **Pipeline**: Lingo's own code ran offline over the corpus (`createLanguagePack`, `createClassifier`, `createEnJaDictionary`, `captionCards`). Spot checks of highlights and hover cards in the real UI matched it. The check build's error log was empty after every session.
- **Judging**: Claude judged every sample against its sentence.
  - Round 1: 480 hovers, 185 cards/paragraphs, 471 phrase keys, 272 machine-translated definitions, 100 subtitle lines.
  - Round 2: two blind A/B rounds of about 780 hovers and 330 units each, current build against prototype. The second A/B used a fresh sample, so the rules were not tested on the items they were tuned on.
  - The samples over-represent hovers the prototype changes; rates below are re-weighted to the corpus.
  - One judge per item: read differences under ±4 points as noise.
- **Chrome's built-in AI** (Translator API, Prompt API / Gemini Nano) ran in the user's Chrome 157.

## Results: current build
| | Round 1 YouTube | Round 1 Netflix | Round 1 articles | Round 2 YouTube | Round 2 articles |
|---|---|---|---|---|---|
| Hover meaning good | 59% | 57% | 46% | 56–58% | 48–50% |
| Hover meaning wrong or misleading | 21% | 22% | 34% | 17–21% | 23–25% |
| Tokens with no hover (besides "I", "a") | 2.4% | 3.4% | 5.3% | 2.7% | 6.0% |
| Phrase highlights per 1,000 tokens | 18 | 17 | 18 | 17 | 15 |
| Cards with no Japanese line | 1.5% | 28% | – | – | – |

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
| **Prototype v2** (A1–A3, D with the fixes below, phrase data v2, context check) | **YouTube**: good 58→70%, wrong/misleading 17→11%. **Articles**: good 50→66%, wrong/misleading 23→15%. Changed hovers preferred 275 vs 52. Phrases: articles useful 37→40, low-value 19→4, wrong-match 16→8. YouTube useful 14→33, wrong-match 7→14. Units preferred 55 vs 37. | **Recommended** |
| Pick the sense by matching glosses against the card's Japanese line | ~7 fixed, ~7 broken of 282 | Dropped |
| Gemini Nano picks the sense freely | Changed 71% of hovers; 72% fit vs 70% today | Dropped |
| Gemini Nano as a yes/no verifier of the shown meaning | Says "no" to 80% of hovers: catches 97% of bad ones, but also flags 3 of 4 good ones | Dropped (automatic use) |
| Normalise definitions before MT (drop "To ", trim ために, dedupe) | Preferred 32 vs 43 the other way; mean 3.23 vs 3.36 | Dropped |
| Sentence-case ALL-CAPS lines before MT | 59 of 60 translations identical (the translator ignores case) | Dropped |
| Previous line as MT context | Improved 0 of 29, worse 4 | Dropped |

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
| C2 Rank English definitions by the source's labels | Demotes usage notes, register (vulgar, dated, slang) and domain senses for multi-word terms, and resolves "Synonym of / Clipping of X". | 11 of 70 wrong-sense phrases now fit; 14,875 pointers resolved |
| D Names by document casing | A word capitalised mid-sentence in mixed-case text and never lower-case there is a name for the whole document, if the names lexicon has it. Never a name: function words, interjections, sentence starts without evidence, words after a determiner. Shows "(name)" only when the dictionary would give a common-noun meaning; a proper-noun meaning is kept (France → フランス). | v1 lost France/June; fixed in v2 |
| E Vocabulary from the learning language's Wiktionary | A headword joins the vocabulary when it appears in lower case at least 5 times in other entries' examples. Meanings for words the pair dictionary lacks are English definitions translated at display time, as phrases already are. | +12,493 words. Round-1 unknown tokens 1,366 → 830 (um, cuz, wanna, app, website, chemo) |
| G Many-to-many alignment of site translations | Shows a translation cue on every card it overlaps substantially, as `alignAsrSentences` already does for ASR. Not prototyped. | Netflix: 28% of cards empty today |

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
- **Highlight density**: phrases per 1,000 tokens go 16.8 → 27.9. "you know", "I mean" and "kind of" become visible. Reversing PR #28's rule for common pairs is intended here: B2 now decides by meaning, not word rank.
- **Bundle size**: packs grow 24.3 → 43.5 MB (6.8 → 11.4 MB gzipped), mostly English definitions.
  - Moving definitions of selection-only phrases (8.9 MB) to a downloadable pack is the simplest cut, once pack hosting exists.
- **Tagger model licence**: CC BY-SA (like the Wiktionary packs).
- **Threshold**: B2's threshold (0.55) is a product choice between recall and noise; the measured sweep is in the prototype notes.

## Still open
- **Wrong sense within the right part of speech** (battery → 砲兵中隊, fleet → 艦隊, hike → ハイキングする, miss → 未婚婦人): no general offline rule found. They need sense frequencies the sources don't give, or "Ask AI".
- **Literal vs idiomatic readings** that POS can't separate: come to, in time ("point in time"), not even, got it.
- **Useful vs transparent compounds** that look alike in the data: law enforcement vs public health.
- **Expressions that are not Wiktionary entries** (a lot of, depend on, think less of): 98 of the 185 round-1 misses. They need a collocation source.
- **Names that are also words in caseless text** (CHANDLER, PHOEBE in ALL-CAPS captions).
- **Tagger accuracy on ASR and captions** (measured only in-domain); its errors flip a few senses (calmer → 静けさ).

## Suggested order
1. A1, A3, D and the EJDict capitalised split (small, deterministic, measured).
2. The tagger part, then A2 and the phrase context check.
3. The phrase data rebuild (B1, B2, B4, C1, C2) with its size decision.
4. E (vocabulary).
5. G (alignment).
6. Keep the on-device model for "Ask AI".

## Netflix
- Round 2's Netflix part (Suits, The Office and three other shows, 3 random episodes each) is not done yet: the collection stopped at the profile picker.
- Round 1's five Friends episodes are the Netflix evidence so far.
- What Netflix adds: three of them have ALL-CAPS closed captions, sitcom interjections are poorly glossed (ew → enlisted woman, bye → 二の次の事), and 28% of cards have no Japanese line.

## Measuring
- The offline runner, the blind A/B packets and the judging rubric worked well and could become `npm run eval:quality`.
- It would run over freely licensed text plus the caption fixtures and report:
  - hover coverage
  - highlights per 1,000 tokens
  - the 95% gate
- Each fix above can then be checked against the same baseline.
