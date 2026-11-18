# Spanish quality on real content (2026-11-18)

How good the Spanish learning pack (Spanish → English, for English speakers learning Spanish) is on real videos and articles, why it falls short of the English pack, and which of the English pack's rules close the gap. Default settings: known level 3000, nothing saved. Method and rules as in [translation-quality.md](translation-quality.md); every rule below is a LEARNING setting of `LanguagePack` (or a CORE fix it exposed), so French and German can reuse it.

## Method
- **Corpus** (collected 2026-11-18 in the user's Chrome; `data/raw/quality/2026-11-es/corpus/`, git-ignored): 72,828 word tokens.
  - 15 YouTube videos (34,538 tokens): Mexico, Spain, Argentina, Chile, Colombia, US Hispanic; cooking, stand-up, travel vlog, two TEDx talks, news explainer, documentary, history, podcast interview, science, street interviews, press conference, lifestyle vlog, news. 9 ASR tracks, 6 human; English from the human track or YouTube's `tlang`.
  - 5 Netflix episodes (21,089 tokens): La casa de las flores, Élite, La casa de papel, Cien años de soledad, Envidiosa. Raw TTML Spanish and English tracks, re-aligned offline.
  - 15 articles (17,201 tokens): BBC Mundo, El País, elDiario.es, La Nación (voseo), Infobae, Marca, RTVE, Xataka, Expansión, Muy Interesante, BioBioChile, Directo al Paladar, three Wikipedia articles.
- **Pipeline**: the skill's `build-units.ts` (2,534 YouTube cards, 2,915 Netflix cards, 323 paragraphs) and `measure.ts` (`LEARNING=es NATIVE=en LEVEL=3000`) over main at 0715716.
- **Prototype**: a copy of Langle's code with the changes below, outside the repo (`data/raw/quality/2026-11-es/proto/`, `README.txt` lists every change). It builds the `es` and `es-en` packs from the same kaikki-es extract and runs through the same `measure.ts`.
- **Judging**: blind A/B packets (main vs prototype), one judge subagent per packet, rubric adapted for English-speaking learners of Spanish (`proto/RUBRIC-es.txt`):
  - Round 1 (tuning sample): YouTube and articles, 520 hovers and 220 units.
  - Round 2 (fresh sample, round 1's items left out): YouTube and articles, 520 hovers and 206 units.
  - Round 3 (held out): Netflix, judged once with the prototype frozen after round 2; no rule was tuned on TV dialogue.
  - Round 4: the example-corpus choice (units only, all three sites, 124 units).
  - Rates are re-weighted to the corpus (`ab-tally.py`). One judge per item: read differences under ±4 points as noise.

## Results (current build)
| | YouTube | Netflix | Articles | All | English (2026-11, before → after its rules) |
|---|---|---|---|---|---|
| Hover meaning good | 63% | 61% | 68% | | 56–61% → 66–74% |
| Hover meaning wrong or misleading | 17–20% | 23% | 15–16% | | 16–25% → 11–15% |
| Word tokens with no hover | 4.9% | 6.1% | 5.2% | 5.3% (3,880) | 2.3% |
| Words shown as New per 1,000 tokens | 78.7 | 108.5 | 106.1 | 93.8 | 84.4 |
| Phrase highlights per 1,000 tokens | 3.2 | 8.5 | 1.1 | 4.3 | 26.7 |
| Names (rule D) | 0 | 0 | 0 | 0 | 1,051 in 171k |
| Hover lines over the width cap | 0 | 1 | 1 | 2 | |
| Cards with no English line | 0.3% | 9.1% | – | | |

- **Phrases**: the 310 highlights are mostly phrasebook utterances ("no sé" 59, "no entiendo", "me llamo", "dónde está") that the English pack makes lookup-only (P1). Judged: YouTube useful 5–9, low-value 3–4, wrong-match 0–2 per round; articles 4–6 useful. In rounds 1–3 judges listed 117 high-value expressions in 536 units that neither version highlights (darse cuenta de, llevar a cabo, por lo que, ya que, ni siquiera).
- **Hovers**: one sense list per surface form, in source order, with no tagger:
  - "de" → "The name of the Latin script letter D"; "es" → the letter "e" (a plural noun beats the verb ser);
  - "hemos" → "heme", "comido" → comedir, "creo"/"crees" → crear (first base in code-unit order);
  - "los" → only the pronoun ("los acontecimientos"), "buena parte" → "inheritance".
- **Unknown tokens** (3,880):

  | Cause | Tokens | Examples |
  |---|---|---|
  | Names and places (capitalised, no entry or a proper-noun entry only) | 1,505 | México, José, Virginia |
  | Inflected forms missing from the frequency list (the lemma table only has the list's 150,000 forms) | 934 | suspira, debías, cuéntales, fijaos |
  | Apocopic and alternative forms (alt-of senses are dropped and not followed) | 599 | muy (207), tu (126), gran, primer, cualquier, buen, algún, vídeo, quizás |
  | Not in kaikki in lower case (English words, ASR, foreign) | 324 | hmm, km, of, the |
  | ALL-CAPS captions without accents | ~60 | ESTAN, DIA, SEGUN, POLICIA |
  | A register tag every sense carries (it comes from the head line) | 25 | vosotros, fin (and their forms: os) |
- **Netflix cards with no English line** (266 of 2,915): not an alignment problem. The Spanish track is the SDH one and the English track is not: 175 cards are only sound labels ("[suspira]"), 34 song lyrics, 39 short interjections (Ah, Hmm), and 18 are speech: 0.7% of spoken cards.

## Root causes
By layer (the layer that has to supply the fix):
1. **LEARNING: no tagger.** A1 and A2 are off, so a hover cannot tell "de" (preposition) from the letter, "es" from the plural of "e", or a verb form from a homographic noun ("hemos", "pienso").
2. **LEARNING data: the lemma table ranks bases by their best form.** A form two verbs share gives both the same rank and their code-unit order wins ("creo" → crear, "siento" → sentar, "sale" → salar). The frequency list is case-folded too, so "chile" ranks as a common word because of Chile.
3. **LEARNING data: the vocabulary build drops alt-of senses and anything tagged archaic**, and kaikki copies head-line labels onto every sense ("fin": archaic feminine gender). The most frequent adverb and possessive of the language are unknown.
4. **LEARNING data: inflections come only from the frequency list.** Spanish has ~50 forms per verb plus clitic forms ("cuéntales"); kaikki has them all as form-of entries.
5. **LEARNING: no names lexicon**, so rule D is off (`namesByCase` needs one).
6. **LEARNING data: phrases use the M8b rank rule** (a phrase / prep_phrase entry whose rarest word ranks beyond 1,000) instead of B1/B2, with no parts of speech, so P1 and the context checks cannot run either.
7. **CORE bugs that Spanish exposes** (English never meets them):
   - A1's auxiliary branch assumes the auxiliary is written as a headword ("has"); for a form that is not ("podemos", "es" + infinitive) it jumps to the other base (podar, the letter e).
   - The phrase matcher matches a pattern word through any base of an ambiguous form ("fue de" matches "ir de").
   - A detected phrase inside a longer pattern that is only selectable is still highlighted ("de vista" inside "punto de vista").
   - The perceptron's word shapes read only ASCII letters (Á, Ñ count as punctuation).

## What was tested
| Idea | Result | Decision |
|---|---|---|
| Tagger: averaged perceptron on UD Spanish AnCora + GSD, UPOS + verb form (23 tags), surface tokens (a multiword token "del", "dímelo" takes its first word's tag) | Test accuracy AnCora 97.3%, GSD 95.0%; 1.08 MB raw / 304 KB gzipped; trained in 10 s. With weights ≥ 3: 96.8 / 94.5%, 325 / 98 KB. Weights ≥ 5: 94.5 / 91.8%, 31 KB gzipped | **Recommended** (weights ≥ 3) |
| A1 and A2 with that tagger, Spanish grammar (AUX tag + participle, gerund or infinitive within 4 words; ser/estar + participle as a state) | de → of, es → ser, haya/he → haber, guías → guía; 4,239 keys and 8,040 line orders change | **Recommended** |
| CORE fix: A1's auxiliary branch only for a headword ("has"); "podemos", "hemos", "es" go to their base | 201 hovers change, nearly all fixed (hemos: heme → haber; comido: comedir → comer) | **Recommended** |
| A1b: a headword whose entry lacks the tagged part of speech goes to a base that has it | los → el (article), veces → vez, al → a, vieja → viejo; 2,085 hovers change | **Recommended** |
| Lemma order from the treebanks' own lemmas (how often the treebank gives the form that lemma, then the lemma's count) | creo → creer, siento → sentir, sale → salir, podemos → poder | **Recommended** |
| Rank bases by the summed frequency of their unambiguous forms | Words New per 1,000 tokens 98.9 → 124.7: "un", "pero", "cosa" become New (their forms are shared) | Dropped |
| Alt-of senses give a meaning (the gloss after "apocopic form of mucho;") and a base; an abbreviation of a multi-word term does not; a word that is a form ("os") keeps its form | Unknown tokens −621 (muy → very, tu → your, vídeo → video) | **Recommended** |
| A register tag on every sense of an entry is the head line's, ignored for a word among the list's 50,000 most frequent forms | −31 tokens (fin, vosotros, os) | **Recommended** |
| Every kaikki form-of entry of a vocabulary word is a lemma form (incl. clitic forms) | −681 tokens; lemmas 1.3 → 9.7 MB raw (1.16 MB gzipped, needs 3 shards); learning pack load ~35 → ~115 ms | **Recommended** (user, 2026-11-18) |
| Names lexicon from kaikki-es proper-name entries (vocabulary words, their forms and given names: 2,467) and rule D | 401 tokens become names (Marina, Mercedes, Sosa, Polo, Rosa); 399 had a common meaning before | **Recommended** |
| Names written capitalised in the example corpus at least twice as often as in lower case count as rare (the case-folded list ranks "chile" < 3,000) | Chile, Japón, Brasil, Argentina become names | **Recommended** |
| B1/B2/B2b/B4 phrase build for Spanish (accent-aware word pattern, Spanish slots, kaikki parts of speech) | Patterns 2,470 → 7,393 (4,294 detected); highlights 4.3 → 14.8 per 1,000 tokens; "buenos días", "por supuesto", "a través de" in | **Recommended** |
| Phrase gloss bag from each word's first 3 senses, not 12 (a bilingual source: a function word's 12 senses explain every phrase; "sobre todo", "ya que" scored 0) | +0.9 per 1,000 tokens: en vez de, así como, para nada, sentar cabeza | **Recommended** |
| Scale example counts to the English corpus's 21M tokens | Highlights 14.8 → 4.1: loses por favor, por supuesto, lo siento, hoy en día | Dropped |
| Patterns made only of pronouns, articles, determiners and conjunctions are not detected | "lo que" (232 highlights; judged useful 4, low-value 19, wrong-match 5) and "que lo que" gone | **Recommended** |
| BASE (CORE): a pattern word matched through a base of an inflected verb must be the base A1 chooses | "ir de" 16 → 4 ("fue de" is ser) | **Recommended** |
| LONGEST (CORE): a longer selectable pattern that starts earlier and holds the detected one wins | de vista (in punto de vista), de vestir; 0.2 ms per 1,000 tokens | **Recommended** |
| Example corpus: English edition only (0.46M tokens) vs + Spanish edition (0.98M) | English edition only: +3 highlights per 1,000 tokens (de verdad, acabar de, llevar a cabo, por lo que, a pesar de) but also con todo, por muy, querer decir + object. Judged: useful 33 → 115, wrong-match 11 → 51; units preferred 81 vs 40 (YouTube 36:7, articles 17:16, Netflix 28:17) | Both editions (decided 2026-11-18: precision first) |

### The prototype against main, judged
| | YouTube | Articles | Netflix (held out) |
|---|---|---|---|
| Good hovers, round 1 (tuning) | 63 → 74% | 68 → 79% | |
| Wrong or misleading, round 1 | 17 → 7% | 16 → 7% | |
| Good hovers, round 2 (fresh) | 63 → 76% | 68 → 82% | 61 → 76% |
| Wrong or misleading, round 2 | 20 → 6% | 15 → 3% | 23 → 8% |
| Changed hovers preferred (prototype : main) | 111 : 11 | 112 : 9 | 118 : 11 |
| Phrases useful / low-value / wrong-match, round 2 | 9/4/0 → 40/1/14 | 6/2/0 → 46/0/13 | 9/10/2 → 37/4/6 |
| Changed units preferred (prototype : main) | 37 : 21 | 31 : 11 | 40 : 15 |
| Phrase highlights per 1,000 tokens | 3.2 → 12.0 | 1.1 → 7.7 | 8.5 → 16.7 |
| Word tokens with no hover | 4.9 → 3.2% | 5.2 → 4.3% | 6.1 → 3.3% |

All sites: unknown tokens 3,880 → 2,521 (5.33 → 3.46%), New per 1,000 tokens 93.8 → 98.9 (unknown words now have meanings), names 0 → 401, highlights 4.3 → 12.3 per 1,000 tokens, lines over the cap 2 → 2. Classifying: 0.8 → 4.2 ms per 1,000 tokens (Node, dev Mac; the tagger is 2.2 of it; English ~3.8).

## Recommended fixes, by layer

### LEARNING (Spanish settings and data; French and German supply the same)
| Rule | What it does | Evidence |
|---|---|---|
| Tagger | Perceptron on UD Spanish AnCora (CC BY 4.0) + GSD (CC BY-SA 4.0), UPOS with verb form, surface tokens, weights ≥ 3 (98 KB gzipped) | 96.8% / 94.5% test |
| Tagger grammar (`uses`, `role`) | Auxiliary = the AUX tag before a participle, gerund or infinitive; a state = ser/estar + participle without "por"; closed classes from UPOS (DET, ADP, PRON), personal pronouns and possessives; no particles (P2 off) | A1/A2 rows above |
| Lemma order | A form's bases ordered by the treebank's own lemmas, so the base list and the ranks agree on the likely base | creo → creer |
| Vocabulary (rule E for Spanish) | Alt-of senses count (apocopic, alternative and superseded spellings), with the gloss after the pointer as the meaning; head-line register tags on frequent words ignored; optionally every kaikki form-of entry as a lemma form | −652 / −681 unknown tokens |
| Names lexicon + casing | kaikki-es proper names (vocabulary words, their forms, given names) with kinds; a name the examples write capitalised mostly counts as rare | 401 names |
| Phrase data | B1/B2/B2b/B4 with the language's word pattern (`\p{Ll}+`), slots (alguien, algo), auxiliaries (ser, estar, haber), parts of speech per pattern, the example corpus of both kaikki editions, gloss bags from 3 senses | 7,393 patterns |
| Closed-class patterns | A pattern of only pronouns, articles, determiners and conjunctions is not detected (by `pos.json`) | lo que |
| Pronominal verbs (not prototyped) | A matcher slot for the reflexive clitic before a finite verb ("me di cuenta") and attached to it ("darme cuenta"), so `darse cuenta` is matched and `dar cuenta de` is not | 260 pronominal patterns (240 detected); 16 uses in the corpus that no pattern can match today (darse cuenta 13), plus 7 wrong "dar cuenta de" |
| Contractions (not prototyped) | "al" = a + el, "del" = de + el: a pattern word "a" matched through "al" needs the article too | 9 highlights (al fondo, al gusto, al tiempo) |
| Accent restoration in ALL-CAPS documents (not prototyped) | An unknown word in an upper-case document looks up the vocabulary's one accented spelling | ~60 tokens (ESTAN, DIA, POLICIA) |

### CORE (shared; found with Spanish)
- A1: the auxiliary branch only for an auxiliary written as a headword (English unchanged).
- A1b: a headword whose entry lacks the tagged part of speech goes to a base that has it.
- BASE: a pattern word matched through a base of an inflected verb must be the base A1 chooses.
- LONGEST: a longer selectable pattern that starts earlier and holds a detected one wins (also the English note's "next thing I know" case).
- Perceptron word shapes over Unicode letters (`\p{Lu}`, `\p{Ll}`); English's model needs retraining with it (non-ASCII is rare there).

### NATIVE (English glosses)
- Nothing new: es-en senses already carry their parts of speech, and the English `GlossReader` reads pointers. One gloss shape to add: "apocopic form of X; meaning" / "…of X, meaning" gives the meaning after the target (done in the data build in the prototype).

### PAIR (kaikki-es)
- Head-line labels copied onto every sense ("archaic" on fin, vosotros) and alt-of senses of acronyms on lower-case words ("eso" → ESO) need the two data-build rules above.

## What a new learning language needs
A checklist for French and German, in the order the Spanish work found them:
- [ ] Word pattern and tokenizer: letters with diacritics (`\p{L}`), elision and contractions as the language writes them (French l', d', qu'; German none; Spanish al, del), and how a phrase word matches a contraction.
- [ ] Tagger: a UD treebank with a licence compatible with CC BY-SA (French: GSD CC BY-SA, ParTUT CC BY-NC-SA (not usable); German: GSD CC BY-SA, HDT CC BY-SA; confirm each licence in the treebank's LICENSE.txt), trained on surface tokens (French "du", "au", German "zum", "im" as one token), UPOS + verb form, weights ≥ 3.
- [ ] Tagger grammar: which tags and words are auxiliaries (French avoir/être + participle, aller + infinitive; German haben/sein/werden + participle or infinitive, with the verb at the clause end, so "within 4 words" does not hold), states, closed classes, particles (German separable prefixes are particles: P2 applies, gap rule needed; French none).
- [ ] Lemmas: every inflected form from the extract's form-of entries (or a rule engine), and the base order from the treebank's lemmas; a separable verb's two parts (German "fängt … an") need the gap matcher.
- [ ] Vocabulary: alt-of senses, head-line labels, the frequency list's case folding (German capitalises every noun: rank by the lower-case form is wrong).
- [ ] Names: `namesByCase` only where capitals mean names (French yes; German no: names lexicon still used, by lexicon and runs only).
- [ ] Phrases: B1/B2 with the language's slots (French quelqu'un, quelque chose, se; German jemandem, etwas, sich), pronominal verbs (se, sich), auxiliaries, closed classes, parts of speech; gloss bags from the first 3 senses.
- [ ] Example corpus: English edition + native edition, and check the trade-off below (count-based thresholds were tuned on 21M English tokens).
- [ ] Captions: the SDH track's sound labels have no line in the native track (Netflix); count them apart.
- [ ] Measure with this study's scripts on a corpus of the same shape before shipping.

## Decisions (2026-11-18)
- **Every inflected form: kept** (user). Every kaikki form-of entry of a vocabulary word, clitic forms included, is a lemma form: −681 unknown tokens (0.9 points; suspira, cuéntales, debías). Lemmas 1.3 → 9.7 MB raw (1.16 MB gzipped), sharded so that every file stays under 4 MB; the Spanish packs go 6.54 → 17.6 MB raw (3.2 MB gzipped), within the per-pair guard of 40 MB raw (after D0); learning pack load ~35 → ~115 ms in Node. Measured alternatives: without it 9.1 MB raw; regular forms generated by rule at runtime (smaller, more code, irregular verbs still need data).
- **Tagger weights ≥ 3**: 98 KB gzipped (325 KB raw), test accuracy 96.8% AnCora / 94.5% GSD. Measured: ≥ 2 304 KB gzipped, 97.3% / 95.0% (the judged rows used it); ≥ 5 31 KB, 94.5% / 91.8%.
- **Example corpus: both kaikki editions** (precision before recall, user rule of 2026-11-13): 12.3 highlights per 1,000 tokens, useful share 73–79% of judged highlights. Measured alternative, English edition only: ~15.3 per 1,000 tokens, useful 33 → 115 and wrong-match 11 → 51 in round 4, units preferred 81 vs 40. With the pronominal and contraction rules and a context rule for adverbial patterns before a noun phrase ("con todo el…"), measure the English-edition setting again.
- **Licences**: THIRD_PARTY_NOTICES names UD Spanish AnCora (CC BY 4.0) and GSD (CC BY-SA 4.0); both are allowed, like the English model's EWT (CC BY-SA 4.0).

## Costs
- **Classify time**: 0.8 → 4.2 ms per 1,000 tokens in Node (English ~3.8); the tagger is 2.2 of it.
- **Pack load**: the learning pack ~35 → ~115 ms in Node, mostly the lemma table.

## Still open
- **Within-part-of-speech senses** ("hace 20 años" → to do, "se trata de" → to treat, "pinche" → kitchen servant, "vale" as OK): the same class as English's; "se trata de" and "hace … años" are pronominal / impersonal constructions the phrase rules could cover.
- **Lemma ambiguity the tag cannot settle** ("fui/fue" ir or ser, "ve" ir or ver, "creen" crear or creer in "se creen"): the treebank has lemmas, so the tagger could predict the lemma of an ambiguous form from context (tag set with lemma for ambiguous forms).
- **Discourse markers' senses**: "a ver" shows "show me!" first; "eso es" + complement is matched as the interjection.
- **Periphrases that are no Wiktionary entries**: volver a + infinitive, soler + infinitive, llevar + time, estar de acuerdo (only "de acuerdo" is an entry): judges list them as missed high-value units.
- **ASR mixed case without punctuation**: Spanish YouTube ASR capitalises turn starts mid-text ("Entonces", "Yo"); rule D's closed-class exclusions keep them from becoming names, but the casing pass reads them as capitals inside sentences.
- **Interjection forms** missing from kaikki in lower case (ajá → ajar, mhm, híjole) and diminutives (puerquita, juntitos).

## Suggested order
1. **CORE fixes** (small, deterministic, no data): A1 auxiliary branch for non-headwords, A1b, BASE, LONGEST, Unicode word shapes (retrain the English tagger with them and confirm it is unchanged on EWT). Effect on Spanish appears only with step 2's tagger; on English expect few changes (measure on the 2026-11 corpus).
2. **Spanish tagger and grammar** (LEARNING: `es/tagger.json` with weights ≥ 3, `src/core/tagging/es.ts`, `es/pos.json`, lemma order from the treebanks; `scripts/data/es-tagger.ts`; THIRD_PARTY_NOTICES names AnCora and GSD). Expected: hovers good +11–14 points, wrong or misleading −10–15 points (rounds 1–3).
3. **Vocabulary rules** (alt-of senses, head-line tags, every kaikki inflected form with the lemma table sharded under 4 MB per file): unknown tokens 5.3% → 3.5%; Spanish packs 6.54 → 17.6 MB raw.
4. **Names lexicon and the capitalised-in-examples rule**: ~400 names per 73k tokens, ~400 common meanings on names gone.
5. **Phrase data rebuild for Spanish** (B1/B2/B2b/B4 with LEARNING settings, the example corpus of both kaikki editions, phrase parts of speech so P1 and the context checks run, closed-class patterns, 3-sense gloss bags): highlights 4.3 → 12.3 per 1,000 tokens, useful share of judged highlights ~75%.
6. **Pronominal verbs, contractions, ALL-CAPS accents** (not prototyped): recall of darse cuenta and friends, −9 wrong matches, ~60 tokens; then measure the English-edition example corpus again.
7. **Real-site check** (Phase 7) on one Spanish article, one YouTube video and one Netflix episode.

## Measuring
- Runs: `data/raw/quality/2026-11-es/runs/` (`units/units.jsonl`, `main-L3000`, `final-proto`, `r1-proto`, ablations `abl-*`, `proto-abl-*`, `proto-v7`).
- Packets, keys, judge results and tallies: `data/raw/quality/2026-11-es/packets/r1`–`r4`.
- Prototype and scripts: `data/raw/quality/2026-11-es/proto/` (`README.txt`); UD treebanks in `data/raw/ud-spanish/` with their commits.
