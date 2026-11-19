# French quality on real content (2026-11-19)

How good the French learning pack (French → English, for English speakers learning French) is on real videos and articles at step L1-1 (the `fr` pack and the `fr-en` dictionary, no tagger, no names, no highlighted phrases), and what the next steps should fix. Default settings: known level 3000, nothing saved. Method as in [spanish-quality.md](spanish-quality.md), whose "What a new learning language needs" checklist this step follows; sources and gate measured in L0 ([translation-data-expansion](translation-data-expansion.md) "Round 2").

## Method
- **Corpus** (collected 2026-11-19 in the user's Chrome; `data/raw/quality/2026-11-fr/corpus/`, git-ignored, with `manifest.json`): 82,415 word tokens.
  - 20 YouTube videos (44,957 tokens): France, Quebec, Belgium; stand-up (2), comedy sketch, travel vlog, two TEDx talks, geopolitics and culture explainers, news explainer, science, video game review, street interviews, business podcast, documentary report, car mechanics, cooking history, make-up tutorial, family vlog, entertainment, a Minecraft let's play. 11 manual tracks, 9 ASR. English from a human track (3) or YouTube's `tlang` (9); the ASR tracks were taken from the player's own requests, since YouTube answered 429 to direct timed-text requests after the first grabs, so they have no English line.
  - 5 Netflix episodes (24,663 tokens), one per show, the episode drawn with `random.Random(20261119)`: Lupin S1E4, Family Business S1E6, Tapie S1E5, Standing Up (Drôle) S1E4, Marseille S1E1. Raw French (closed captions) and English tracks, re-aligned offline. Each was played muted and paused at once; none reached the profile's "Continue Watching" row.
  - 13 articles (12,795 tokens, each cut at about 1,500 words): three Wikipedia articles (Photosynthèse, Édith Piaf, Ratatouille), RFI, 20 Minutes (2), franceinfo (rugby), Radio-Canada, RTS, TV5Monde (Africa), Futura Sciences, Numerama, Marmiton. Le Soir, Ouest-France and L'Équipe were left out: their articles are behind a paywall.
- **Pipeline**: the skill's `build-units.ts` (3,591 YouTube cards, 3,373 Netflix cards, 270 paragraphs) and `measure.ts` (`LEARNING=fr NATIVE=en LEVEL=3000`) over this branch.
- **Judging**: no A/B (there is no earlier French build): one blind judge subagent per site rated 120 hovers sampled by token (good, acceptable, wrong, misleading; `data/raw/quality/2026-11-fr/scripts/hover-packets.py`). The manual YouTube tracks, the articles and Netflix were judged on the build before the treebank's elision rule (below), the ASR tracks on the final build. One blind A/B (below) decided the dictionary's sources. One judge per item: read differences under ±4 points as noise.

## Results (L1-1 build)
| | YouTube | Netflix | Articles | All | Spanish at U2-1 → after U2 |
|---|---|---|---|---|---|
| Hover meaning good | 70% (ASR 71%) | 72% | 74% | | 61–68% → 76–82% |
| Hover meaning wrong or misleading | 6% (ASR 7%) | 14% | 9% | | 15–23% → 3–8% |
| Word tokens with no hover | 2.6% | 3.8% | 6.4% | 3.5% (2,917) | 5.3% → 3.3% |
| Words shown as New per 1,000 tokens | 80.0 | 64.2 | 154.9 | 86.9 | 93.8 → 99.6 |
| Phrase highlights per 1,000 tokens | 0 | 0 | 0 | 0 | 4.3 → 12.1 |
| Names (rule D) | 0 | 0 | 0 | 0 | 0 → 415 |
| Hover lines over the width cap | 4 | 1 | 2 | 7 | |
| Cards with no English line | 60% (ASR: none taken) | 11% | – | | |

- **Wrong hovers** (32 of 360 judged before the elision rule): 25 are a homograph's other part of speech, which only a tagger tells apart: "est" → east (1,317 tokens of the corpus show it), "pas" → step (821), "été" → summer (104), "fait" → fact, "dit" → a saying, "vu" → given, "va" → V.A., "en" → in for the pronoun, "Pour" → for before an infinitive, "fréquentes" → to frequent; 2 are names given a word's meaning (Molière → Oxford shoe, Tapie → hidden); 4 are a noun's other sense (grâce in "grâce à", travaux, coup, virés); 1 is slang (beuh). "J'aime" read whole as the noun "a like" (2) is fixed in the final build.
- **Unknown tokens** (2,917): 2,116 capitalised (names and places: France, Bernard, Afrique, Marseille, Nezir; kaikki gives place names proper-noun entries only), English words in French text (the, of, up, gameplay; about 70), rare and technical words (photosynthétiques, thylakoïdes), ASR and caption damage. Participles in -é, -ée, -és (née, appelés, devenue, restés) were unknown before the form-of-a-form rule below (−223 tokens).
- **Hyphenated words** (573 occurrences in the first 60,000 tokens, about 1%): the tokenizer splits at hyphens, so inversions read word by word, which is right ("qu'est-ce" 56, "est-ce" 35, "dites-moi", "avez-vous", "a-t-il"), but compounds do not: "peut-être" (23) shows can + to be, "grand-mère", "rendez-vous", "là-bas", "c'est-à-dire".
- **Netflix cards with no English line** (373 of 3,373): the French track is the closed-caption one, so most are sound labels, as for Spanish.

## What L1-1 built, and what was tested
| Idea | Result | Decision |
|---|---|---|
| The Spanish build generalised (`learning-kaikki.ts`, a `LearningBuild` per language) over kaikki French: alt-of senses, head-line labels, every form-of entry, lemma order from UD French GSD's lemmas, both editions' IPA | 29,793 vocabulary words, 196,045 lemma forms in 3 shards; IPA for 99.3% of the vocabulary (English edition 94%, Wiktionnaire's `\…\` for the rest); the Spanish pack's build is unchanged but for the two CORE rules below | **Built** |
| Frequency list: FrequencyWords 2018 `fr_full`, its first 150,000 entries (as many as Spanish reads) | The same OpenSubtitles counts as the gate's list; it writes elided words apart ("l'", "qu'"), as the tokenizer now does | **Built** |
| Elisions (LEARNING, `tokenize`'s `ELISIONS`): l', d', j', m', t', s', c', n', qu', jusqu', lorsqu', puisqu', quoiqu' split off the word they join, with ' and ’ alike | 3,851 elided tokens get their own hover ("l'" → the, "qu'" → that); before, every "l'homme" was one unknown token | **Built** |
| A word written with an elision is read whole when it is a word of its own: kaikki's senses are not all contractions or compounds of its parts ("qu'il", "j'ai" are), and it is reached when the list has each part (ranked as the rarer) | d'accord, d'abord, aujourd'hui, n'importe, d'ailleurs, s'agit (182 tokens) | **Built** |
| …and only when the treebank joins its parts as a fixed expression or a pronominal verb in half its occurrences at least (fewer than 3 occurrences: kept) | "j'aime" (the noun "a like"; 0 of 7 joined), "jusqu'à", "l'un", "d'or" now read as their parts | **Built** |
| A contraction's literal meaning (CORE): "contraction of à + le, literally “to the, for the, at the”" gives that meaning | au, aux, du, des have one; Spanish "al" gains "at the, to the" first at its next rebuild | **Built** |
| A form of a form (CORE): a base that is itself only a form gives its own base | appelés → appeler, née → naître: −223 unknown tokens; Spanish gains the same at its next rebuild | **Built** |
| Accents in capitals for French: any number of accents a word (ETE → été, DEJA → déjà; two known spellings left alone) | The CORE rule now tries every combination (at most 4,096 spellings); Spanish behaves as before | **Built** |
| The French edition's English translation tables second in `fr-en` (L0: +1.1 points of gate coverage) | The 33 gate words only they cover are English words and names the subtitles quote (joey, jenny, take, burn, kerry): blind A/B against no meaning, the tables preferred 1, no meaning 12, same 20; 9 of the tables' meanings misleading | **Dropped**: English Wiktionary alone |
| Phrase patterns from the B1/B2 build with French settings, highlighted | Not judged: French phrases need pronominal verbs and elisions inside patterns first (L1-4) | 11,232 patterns built **for selections and saved phrases only**, none highlighted |

## What a new learning language needs (French, after L1-1)
- [x] Word pattern and tokenizer: elisions; contractions au, aux, du, des as a pattern's last word (`FRENCH_RULES.contractions`); hyphenated compounds still split (open)
- [ ] Pronominal verbs (L1-4)
- [x] Accents in capitals
- [x] Adjectives after nouns (`FRENCH_RULES.adjectivesAfterNouns`)
- [x] Tagger and grammar (L1-2): GSD only (Sequoia and ParTUT are not allowed); avoir/être + participle, aller + infinitive, negation, closed classes of verb forms
- [x] Lemmas: every form, the treebank's order
- [x] Vocabulary: alt-of senses, head-line labels; case folding is no issue for French
- [ ] Names (L1-3): `names.json` is built (2,031 names, 1,068 mostly capitalised) but rule D is off for French
- [ ] Phrases (L1-4)
- [x] Captions: the CC track's sound labels have no English line (11% of Netflix cards)
- [x] Measured on a corpus of the Spanish corpus's shape

## Costs
- Download: `fr` 7.61 MB raw (1.22 MB gzipped), `fr-en` 4.28 MB (1.11 MB): fr→en 11.9 MB raw, 2.3 MB gzipped (es→en 17.3 MB, 2.8 MB). Every file is under 2 MB.
- The learning pack loads in about 90–130 ms in Node; classifying takes 1.4–1.6 ms per 1,000 tokens without the tagger, 3.6 ms with it (L1-2; Spanish 4.2, English ~3.8). `fr/tagger.json` adds 165 KB raw, 50 KB gzipped.

## Still open
- Homographs among the most frequent words (est, pas, été, fait, dit, va, en): built in L1-2 (below); what the tagger cannot settle is listed there.
- Names: 2,116 capitalised unknown tokens, and names that reach a common word (Molière, Tapie). L1-3.
- Hyphenated compounds read word by word (peut-être, grand-mère, rendez-vous, c'est-à-dire). L1-4, as patterns joined by hyphens.
- Pronominal verbs: "s'agit" is read whole, but "se rendre compte" and "je m'appelle" are not matched as one. L1-4.
- The gate: `npm run data:stats` measures fr→en on the pack's own vocabulary (100% by construction, as for Spanish); L0 measured it against Wiktionnaire's headwords (96.5%). Checking the vocabulary against the French edition's headwords in the pack's own gate is open.
- Not checked in the user's Chrome: the packs are not on npm until their first versions are published by hand, before the merge.

## Suggested order
1. **L1-2 tagger and grammar**: train the perceptron on UD French GSD's surface tokens (multiword tokens "du", "au", "des" as one), choose the weights cut from its dev and test sets; French grammar for A1 (avoir/être + participle, aller + infinitive within a few words, ne … pas around the verb), A1b and A2, so est → être, pas → not, été → être. Expected: most of the 25 judged homograph errors, 2–3% of all tokens.
   - **Done** (PR on `claude/l1-2-french-tagger`, 2026-11-19; `fr` 2026.1119.1 format 2, `fr-en` unchanged; [architecture](../specs/architecture.md) "Tags"). Built:
     - `fr/tagger.json` (`scripts/data/fr-tagger.ts`, last in `data:fr`): the perceptron on UD French GSD's training sentences, each re-tokenized by Langle's tokenizer with the built pack's words read whole, every token tagged with the treebank token it starts in (one sentence of 14,450 left out: a token not in its text); 22 tags (UPOS, the verb form for VERB and AUX, the present participle as Ger). Weights ≥ 3: 165 KB raw, 50 KB gzipped; accuracy dev 95.2%, test 94.8%; a margin of 5 keeps 95.6% / 95.5% of the tokens at 97.1% / 96.7%. Measured: weights ≥ 2 140 KB gzipped, 96.0% / 95.6% (≥ 3 kept, as for Spanish, within the 100 KB budget); words known without scoring at a 97% share (as English and Spanish) against 99% or none: test 94.8 / 94.8 / 94.5%, and the same on est, pas, été (592–594 of 608 "est" right), so the trainer is unchanged.
     - French grammar (`core/tagging/fr.ts`): auxiliaries (AUX + participle or infinitive; finite aller + infinitive); a participle after avoir, after être for the verbs that take être or after a reflexive is a compound tense, after "été" or before "par" a passive, else être + participle a state read as an adjective; a verb form right after a determiner or preposition is a noun ("l'été", "d'été"); "ne … pas / plus / jamais / personne / rien" give the negation word its part of speech whatever the tag; the closed classes of verb forms decided whatever the tag's margin (`WordUse.base`: est, a, as, suis, été, soit → être / avoir; a participle whose auxiliary is avoir → its verb; any verb form right after je, tu, il, on → that verb).
     - CORE `WordUse.grammarPos`: the grammar's part of speech whatever the tag; A2 reads it for the word's own entry; a state keeps its own entry only when that has a sense of the part of speech (A1 rule 2). Set by French only.
     - `fr/pos.json` and the treebank's lemma order were built in L1-1 and are unchanged.
   - Measured (`data/raw/quality/2026-11-fr/steps/l1-2/`): 9,277 of 78,973 word tokens change their hover (11.7%; YouTube 5,110, Netflix 3,195, articles 972; 4,661 change their key): est → être 1,871, pas → the negation 1,120, des → un 430, ce as a pronoun 378, va → aller 364, bien → well 237, fait → faire 170, s' → se 142, son → his/her 140, été → être 114, as → avoir 104, dit → dire 103. Unknown tokens 2,917 → 2,917, New per 1,000 tokens 86.9 → 86.9, lines over the cap 7 → 7 (the tagger changes keys and sense order only). Classifying 1.0 → 3.6 ms per 1,000 tokens. English (NATIVE=ja, 157,458 rows) and Spanish (67,069 rows) unchanged, row for row, on L1-1's head with main merged.
   - Judged blind (one judge per packet, 6 packets of 130 words, 70 changed each, Netflix in its own two; fresh sample, the L1-1 judgements left out; on the build before the refinements below): good hovers (re-weighted to the corpus) YouTube 71 → 76%, articles 68 → 71%, Netflix 68 → 74%; wrong or misleading 8 → 4%, 6 → 4%, 10 → 6%; changed hovers preferred after : before YouTube 92 : 30, articles 91 : 24, Netflix 95 : 26.
   - Refinements from what that judging preferred before (être + participle as a state: désolé, ravi; "tu joues" read as the cheek; the verb rule for any word after a subject pronoun; passives after "été"), 150 hovers more: judged blind on their changed tokens (3 packets, 123 changed words): preferred after : before YouTube 36 : 12, Netflix 39 : 5, articles 3 : 7 (passives without "par" read as states: suspendu, jugé, permis, commis, soumis; the "été" passive rule and the adjective-sense condition that followed fix most of them: 21 tokens, not judged again). Netflix was not held out from the refinements' classes.
   - Got worse (judges preferred before): sense order within one part of speech, which the tag now moves (peu: few before little, puis: and before then, qu' relative read as "what", français: the language first, enfin, vidéo); des as the plural article → un "an, a" (the entry has only the contraction; 430 tokens, 2 of those judged preferred before); "avoir envie / hâte" where the tagger reads the noun as a participle (5 tokens → envier, hâter); "étant donné" (a state: donné "affordable"; L1-4's phrase); untrusted states whose entry lacks an adjective sense still show a noun first (dû "duty"); "par contre" read as the noun "double" (L1-4).
   - Still open: the near future and the compound tenses show aller's, avoir's and être's lexical senses first (to go, to have, to be): kaikki tags their auxiliary senses but the pack keeps only the gloss's last part ("the passive voice"), so A2 finds no sense its source calls auxiliary (a `learning-kaikki.ts` change, Spanish too); forms two verbs share (vis: voir or vivre; suis after an object pronoun: suivre); the compounds a hyphen splits ("nord-est" reads est as the region only when the tagger says so).
2. **L1-3 names and vocabulary**: rule D for French (`namesByCase`; French capitalises names and peoples, "les Français", but not months, languages or nationality adjectives: decide `capitalsForNames` by measuring), names that reach a common word, place names' proper-noun entries.
3. **L1-4 phrases**: pronominal verbs (`se` a word of its own before the verb, être between: "je me suis rendu compte", imperative "rends-toi compte"), elisions inside patterns ("avoir l'air"), hyphenated compounds as patterns, the slots "quelqu'un" and "quelque chose"; then judge highlights and turn detection on.

## Measuring
`data/raw/quality/2026-11-fr/`: `corpus/` (with `manifest.json`), `runs/units/`, `runs/l1-1-final/` (rows and summary of this build), `scripts/hover-packets.py`, `grab/` (the Spanish study's grab snippets with `LEARNING="fr"`), `packets/tables/` (the sources A/B). Rebuild the units and measure with the skill's scripts (`LEARNING=fr NATIVE=en`).
