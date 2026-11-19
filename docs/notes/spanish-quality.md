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
- **ASR mixed case without punctuation**: Spanish YouTube ASR capitalises turn starts mid-text ("Entonces", "Yo"). Since step 4 these are no names (not in the lexicon, a pronoun, and the form rule is off in documents without punctuation) and no longer count as capitals for the lookup (`capitalsForNames`); a given name that is a common word ("Claro", "Perfecto") would still be taken for a name in a short document that never writes it in lower case (none in this corpus).
- **Speaker labels**: Netflix's Spanish SDH track names the speaker in brackets ("[Paulina]", 20 tokens); brackets are no evidence for rule D, so the label shows paulino's "Pauline".
- **Phrases over names**: a pattern word the document reads as a name still matches ("al Chile que ya no es" → `al chile`, honestly); and a closed-class pattern that is an idiom ("como si nada", "yo que tú") is lookup-only with "lo que".
- **Interjection forms** missing from kaikki in lower case (mhm, híjole; "ajá" has its own meaning since step 3) and diminutives (puerquita, juntitos).

## Suggested order
1. **CORE fixes** (small, deterministic, no data): A1 auxiliary branch for non-headwords, A1b, BASE, LONGEST, Unicode word shapes (retrain the English tagger with them and confirm it is unchanged on EWT). Effect on Spanish appears only with step 2's tagger; on English expect few changes (measure on the 2026-11 corpus).
   - **Done** (PR on `claude/core-fixes`, 2026-11-18). Measured (`data/raw/quality/2026-11-es/steps/u2-1/`):
     - Spanish on main's data: no change (no tagger, no phrase parts of speech). With this study's prototype data (steps 2–5): 2,213 hovers change (los → el 762, una → uno 633, al → a 266, veces → vez, hemos → haber, podemos → poder, fue → ser) and 9 highlights go (ir de 5, de vestir 3), the prototype's result less 15 participles that now follow the participle rules.
     - English (171,709 tokens): 63 hovers (times → time 46) and 25 highlights (26.7 → 26.6 per 1,000 tokens) change. Judged blind: removed highlights 12 wrong matches (as well in "might as well", my ass, last time in "for the last time") and 10 useful (in love in "fall in love", good time, for sale); changed units preferred 13 after vs 9 before, changed hovers 5 vs 6; on the round-1 corpus (fresh) units 1 vs 2 and hovers 5 vs 1.
     - Two refinements found on English: A1b leaves an entry that starts with a pointer to one of its bases (a tagger error "dying" as a noun went to die, "dice"); LONGEST spares a phrase when the longer pattern shares a part of speech with it ("of course" in "and of course", "off the bat" in "right off the bat").
     - The English tagger retrained with the new shapes: dev 92.50 → 92.50%, test 92.54 → 92.40%, 116 → 116 KB gzipped, 1,434 hovers changed by training-order noise (judged even). Not shipped: the kept model scores the same under the new shapes.
     - Classifying ~2.8 → ~3.2 ms per 1,000 tokens; the select trie (~60 ms for English) is built on the first block with a detected phrase.
     - Still open: a part that keeps its meaning inside a verb pattern loses its highlight ("fall in love"); the phrase build could mark the longer patterns whose definitions repeat the shorter one's.
2. **Spanish tagger and grammar** (LEARNING: `es/tagger.json` with weights ≥ 3, `src/core/tagging/es.ts`, `es/pos.json`, lemma order from the treebanks; `scripts/data/es-tagger.ts`; THIRD_PARTY_NOTICES names AnCora and GSD). Expected: hovers good +11–14 points, wrong or misleading −10–15 points (rounds 1–3).
   - **Done** (PR on `claude/spanish-tagger`, 2026-11-18; `es` 2026.1118.0 format 2, `es-en` 2026.1118.0). Built: the tagger (97 KB gzipped; test AnCora 96.8%, GSD 94.7%), its grammar, `es/pos.json` (main part of speech by the treebanks' tags), the lemma order (treebank lemmas, with the bases' own counts as a prior of 5 so a form seen once does not decide: "Vengo" is lemmatized vengar once), and two rules the step found:
     - CORE `basesInOrder`: rule A1 reads a form as the first base its tag fits where the pack lists bases likeliest first; by rank, "creo" stayed crear (creó ranks crear 670, creer 690), also in the prototype. 162 hovers (creo/crees/cree/creen → creer 117).
     - LEARNING data, form-of meanings: a form-of sense that glosses its pointer gives that meaning ("dative of ellos and ellas; to them, for them"). Fixes the U2-1 data problem ("les" → elles "they" becomes "to them, for them"), and me, te, lo, nos, os, eso, esos, sus, unos, eres, chica, mayor; 100 more vocabulary words. The form-of twin of step 3's alt-of rule.
   - Measured (`data/raw/quality/2026-11-es/steps/u2-2/`): 17,072 hovers change (12,163 from the tagger, grammar and orders alone: de → of 3,249, que → who 1,200, es → ser 878, los → el 761); unknown tokens 3,880 → 3,835; New per 1,000 tokens 93.8 → 94.5 (100 words that are now their own vocabulary words rank by themselves); highlights 4.3 → 4.3 (310 → 310); lines over the cap 2 → 2. English (NATIVE=ja, 171,709 tokens): unchanged, row for row.
   - Judged blind (fresh sample, round 1–4 items left out, one judge per packet, 6 packets; Netflix judged in its own packets, no rule tuned after): good hovers YouTube 64 → 79%, articles 62 → 78%, Netflix 62 → 73%; wrong or misleading 17 → 3%, 13 → 3%, 18 → 8%; changed hovers preferred after : before 87 : 8, 93 : 9, 83 : 16. Judged on the build before `basesInOrder` (its 162 changes were not judged).
   - Got worse (judges preferred before): "lo" before "que" or an adjective now shows the pronoun first (4 of 6 judged "lo"); relative "que" leads with "who" (2 vs 1); "hace" (ago), "¿vale?", "o sea" read as verb or noun senses; forms the tag cannot settle (ven → ver, vino → venir, se fue → ser). These are the "Still open" classes (within-part-of-speech senses, lemma ambiguity).
3. **Vocabulary rules** (alt-of senses, head-line tags, every kaikki inflected form with the lemma table sharded under 4 MB per file): unknown tokens 5.3% → 3.5%; Spanish packs 6.54 → 17.6 MB raw.
   - **Done** (PR on `claude/spanish-vocabulary`, 2026-11-19; `es` 2026.1118.1 format 3, `es-en` 2026.1118.1). Built in `es-kaikki.ts`:
     - Alt-of senses: the one word the gloss names after "of" is a base and the sense a meaning, after its pointer ("very; apocopic form of mucho"), from the target's quoted gloss ("apocopic form of bueno (“good, fine”)"), or, for a pointer alone, the target's first meaning of the same part of speech ("sólo" → "only; solely"). Not acronyms ("ESO"), two-word targets ("al": a + el), obsolete, archaic or misspelt senses, nor alt-of senses of a word that is a form ("os"). Senses keep the source's order ("su": his, her… first). A base's own bases join the vocabulary (tus → tu → tuyo).
     - The pointer reading (also for form-of senses) ends at a "," after a one-word target when a meaning follows ("apocopic form of tuyo, your"; "female equivalent of amigo, friend"), not before a later ";" (la: "accusative of ella, ello, and usted; her, it, you") nor before a clause about the pointer ("deprecated in 2010").
     - Head-line labels: a register label every sense of an entry carries is ignored for the list's 50,000 most frequent forms, unless a sense's gloss writes it ("vos": obsolete form of os stays out).
     - Every form: every kaikki form-of or alt-of entry of a vocabulary word is a lemma form (53,050 → 381,536 forms); a form with a meaning of its own becomes a vocabulary word (1,827: "ajá" → aha, not ajar). `es/lemmas/` 9.90 MB raw (1.10 MB gzipped) in 5 shards of up to 2 MB; the loader keeps the shards apart (merging them would cost more than parsing).
   - Measured (`data/raw/quality/2026-11-es/steps/u2-3/`): 3,469 hovers change (un → "an / one" 877, mi → "my" 322, su → "his, hers, its" 232, muy 219, este 143, tu 136); unknown tokens 3,835 → 2,506 (5.27 → 3.44%: every form −684, alt-of −610, head labels −24, diminutives −3); New per 1,000 tokens 94.5 → 101.9; highlights 4.3 → 4.4 (310 → 319: no jodas, se supone, buen provecho, perder la cabeza, through the new lemma forms); lines over the cap 2 → 2. Packs 7.70 → 16.71 MB raw, 1.88 → 2.83 MB gzipped. Learning pack load in Node ~18 → ~71 ms. English (NATIVE=ja, 171,709 tokens): unchanged, row for row.
   - Judged blind (fresh sample, earlier items left out, 6 packets): changed hovers preferred after : before YouTube 98 : 4, articles 73 : 9, Netflix 101 : 4; good hovers (re-weighted) YouTube 67 → 71%, articles 79 → 82%, Netflix 69 → 74%; wrong or misleading 6 → 2%, 8 → 5%, 17 → 11%. Phrases: Netflix 2 wrong matches added (no jodas, a matar in "a matarte"), 3 useful.
   - Got worse: capitalised names that now reach a common word through a form (Salad → salar, Hales → halar, Mojos → mojo, Burger, water "toilet"; step 4), added later senses ("cuyo": guinea pig, "súper": supermarket), diminutives read by the comma rule ("gordito": very fat), "Coja" → the noun coja (ham) where the verb coger was right.
4. **Names lexicon and the capitalised-in-examples rule**: ~400 names per 73k tokens, ~400 common meanings on names gone.
   - **Done** (PR on `claude/spanish-names`, 2026-11-19; `es` 2026.1119.0 format 4, `es-en` unchanged). Built:
     - LEARNING data (`es-kaikki.ts`, `es/names.json`): kaikki Spanish's proper-name entries that are vocabulary words, inflected forms of them or given names, with their kinds, as `en/names.json` (2,466 names; 11 KB gzipped). A name the usage examples of kaikki Spanish and of Wikcionario's Spanish entries write capitalised inside a sentence at least 3 times and at least twice as often as in lower case is marked "c" (487: Chile, Japón, Brasil, Luis); CORE rule D counts a "c" surname, place or organisation as rare whatever its rank.
     - LEARNING setting `capitalsForNames` (Spanish; English capitalises Germans, Democrats, March and US, so not English): (a) a capitalised word that is no name asks for no capitalised senses and keeps rules A1 and A2 (turned on with rule D, the `capital` mark sent "Nueva York" to nueva "news", "De" to the letter, "Segunda" to "second gear": 24 tokens); (b) the class step 3 made worse: a word the lexicon lacks that is only an inflected form is a name when the document always capitalises it, the document has punctuation, and every base is rare and no noun (Bruna, Afores) or it follows a capitalised word the language does not know ("Stephen Hales", "My Salad", "Rockstar Games"). Not after a determiner, not after a title head ("Fuerzas Armadas", "Vía Láctea" stay words), not a function word's form. Measured on the corpus: of 144 capitalised forms the lexicon lacks, the rule names 16 tokens (Bruna 10, Nocturna 2, Salad, Hales, Games, Afores); without the noun condition, plurals in titles (Atracciones, Migraciones, Recetas, Párrocos) were named too and judges preferred the word (4 of 5); without the punctuation condition, ASR turn starts (Imagínate, Mola, Mirad) would be names. On English the same rule named Democrats, Christians, Islands (62 tokens), hence the setting.
   - Measured (`data/raw/quality/2026-11-es/steps/u2-4/`): 415 tokens become names (Marina 41, Chile 36, Mercedes 30, Sosa 23, Arcadio 20, Elena 17, Japón 18, Martín 13, Bruna 10, Lucía 10, Polo 9; YouTube 109, Netflix 166, articles 140), all of which had a hover before (245 known, 170 New); no other hover changes; unknown tokens 2,506 → 2,506; New per 1,000 tokens 101.9 → 99.6; highlights 4.4 → 4.4; lines over the cap 2 → 2. es→en packs 16.71 → 16.75 MB raw. English (NATIVE=ja, 171,709 tokens): unchanged, row for row.
   - Judged blind (fresh sample, earlier rounds' items left out, one judge per site, Netflix in its own packet): on changed tokens misleading 80 → 6 of 97, good 6 → 88; changed hovers preferred after : before YouTube 31 : 0, articles 37 : 6 (1 same), Netflix 20 : 1 (1 same). The judged build also named rare nouns' plurals in titles; the noun condition that followed turns those 5 tokens back, 4 of them judged worse (final: articles 37 : 3, Netflix 20 : 0).
   - Got worse (judges preferred before): title words the lexicon has as an organisation or a given name ("Medio Rural y Marino", "Fauna y Flora Silvestres"), a song title in quotes («Nocturna»). Not fixed: "la Lucía" (an article before a name, common in Spanish speech, keeps lucir) and "los Párrocos" (es/pos.json lists "los" as a pronoun only, so the determiner rule misses it).
5. **Phrase data rebuild for Spanish** (B1/B2/B2b/B4 with LEARNING settings, the example corpus of both kaikki editions, phrase parts of speech so P1 and the context checks run, closed-class patterns, 3-sense gloss bags): highlights 4.3 → 12.3 per 1,000 tokens, useful share of judged highlights ~75%.
   - **Done** (PR on `claude/spanish-phrases`, 2026-11-19; `es` 2026.1119.1 format 4, `es-en` 2026.1119.0). Built:
     - LEARNING data (`es-kaikki.ts`, `phrases.ts`): the M8b rank rule is gone; Spanish runs the English pack's B1/B2/B2b/B4 build (`importPhrases`) with its own settings (`PhraseBuildLanguage`, `spanishPhraseBuild`): words `\p{Ll}+`, slots alguien and algo, auxiliaries ser, estar and haber, function words and closed classes from `es/pos.json`, gloss bags from each word's first 3 senses, and the examples of kaikki Spanish and Wikcionario's Spanish entries. 7,401 patterns (2,626 before): 4,310 detected, 3,091 more; phrase definitions are the senses best first (C2) with their parts of speech, so P1 and the fit rules read them. A pattern of pronouns, articles, determiners and conjunctions only is not detected: 12 patterns the score would detect ("lo que", "que lo que", "uno que otro"; also "como si nada", "yo que tú", "y eso que", none in the corpus).
     - LEARNING data, closed-class meanings (the 2026-11-19 check's "los"): a closed-class gloss (article, determiner, pronoun, preposition, conjunction, contraction) that describes the word before translating it leads with the translation ("feminine plural definite article; the" → "the; …", "first-person singular pronoun in the nominative case; I" → "I; …", "A reflexive or reciprocal pronoun: oneself, himself…" → "oneself, himself…; …"), and a closed-class form-of sense takes its target's quoted gloss ("los": masculine plural of el (“the”) → "the"; ellos, esto, ciertos, cuyos, míos). Of 241 closed-class words (440 senses) 15 senses change and 8 forms become vocabulary words; the 9 senses left that only describe have no translation in the source ("con": dependent preposition; "se" for the passive).
     - LEARNING data, `es/pos.json`: a word also has the closed classes of its form-of senses that the treebanks tag it with ("los": article, pronoun; "una": article, determiner, pronoun; "nuestros", "poca"): 19 words.
     - CORE, BASE: a headword tagged as a part of speech of its own that the base has none of is no form of it ("fuera de": the adverb, not `ir de`; "de vista": the noun, not `de vestir`).
   - Measured (`data/raw/quality/2026-11-es/steps/u2-5/`): highlights 4.4 → 12.3 per 1,000 tokens (319 → 895; YouTube 3.3 → 12.0, Netflix 8.8 → 16.5, articles 1.1 → 7.6): por favor 41, a ver 40, o sea 36, por eso 27, eso es 24, qué tal 17, por supuesto 13, a través de 12, buenos días 5; gone: no sé 59, no entiendo, me llamo, dónde está (P1) and acabar de 19 (now under the score's threshold). 6,937 hovers change (la → "the" 2,156, el 1,559, los 761, se 695, lo 654, las 551, yo → "I" 387, esto 143, ellos 17); unknown tokens 2,506 → 2,506; New per 1,000 tokens 99.6 → 99.9 (the 8 new vocabulary words rank by themselves); names 415 → 414 ("al Chile" is now the phrase `al chile`); lines over the cap 2 → 2. English (NATIVE=ja, 171,709 tokens): unchanged, row for row.
   - Judged blind (6 packets, one judge each, Netflix in its own; words fresh, earlier rounds' items left out; every changed article unit had been judged in rounds 1–4, so article units are reused, nothing was tuned on them): highlights useful / low-value / wrong-match YouTube 7/2/0 → 48/2/12, articles 7/3/3 → 66/2/10, Netflix 10/12/3 → 27/7/12 (useful share 77%, 85%, 59%; 76% over all); changed units preferred after : before YouTube 44 : 14, articles 49 : 9, Netflix 32 : 23; changed hovers preferred after : before 17 : 0, 15 : 0, 15 : 0; good hovers (re-weighted) 73 → 80%, 72 → 83%, 65 → 71%.
   - Got worse (judges preferred before): Netflix's phrasebook utterances now lookup-only (no te preocupes, no mames, me cago en la puta, de mierda; P1), acabar de; wrong matches of the "Still open" classes: "eso es" + complement, literal "mi vida", "de la Tierra", "al día siguiente", "a ver" in "lo voy a ver", "dimos cuenta de" (pronominal: step 6), "por mí", and "fuera de" where the tag is untrusted.
6. **Pronominal verbs, contractions, ALL-CAPS accents** (not prototyped): recall of darse cuenta and friends, −9 wrong matches, ~60 tokens; then measure the English-edition example corpus again.
7. **Real-site check** (Phase 7) on one Spanish article, one YouTube video and one Netflix episode.

## Measuring
- Runs: `data/raw/quality/2026-11-es/runs/` (`units/units.jsonl`, `main-L3000`, `final-proto`, `r1-proto`, ablations `abl-*`, `proto-abl-*`, `proto-v7`).
- Packets, keys, judge results and tallies: `data/raw/quality/2026-11-es/packets/r1`–`r4`.
- Prototype and scripts: `data/raw/quality/2026-11-es/proto/` (`README.txt`); UD treebanks in `data/raw/ud-spanish/` with their commits.
