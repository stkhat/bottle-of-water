# German quality on real content (2026-11-20)

How good the German learning pack (German → English, for English speakers learning German) is on real videos and articles at step L2-1 (the `de` pack and the `de-en` dictionary with its tagger and German grammar, no names rule, no highlighted phrases), and what the next steps should fix. Default settings: known level 3000, nothing saved. Method as in [french-quality.md](french-quality.md), whose steps L1-1 and L1-2 this step does at once; sources and gate measured in L0 ([translation-data-expansion](translation-data-expansion.md) "Round 2").

## Method
- **Corpus** (collected 2026-11-20; `data/raw/quality/2026-11-de/corpus/`, git-ignored, with `manifest.json`): 55,016 word tokens. Claude in Chrome was not connected for the whole session, so the corpus was collected without the user's Chrome: the YouTube tracks with `yt-dlp` (the user's own install; subtitle files only, no video) and the articles from their HTML or Wikipedia's API (`grab/yt-dlp-grab.py`, `grab/article-fetch.py`, the same JSON as the Chrome grabs). **No Netflix episode** could be collected without the browser: Netflix is not measured or judged here (the next real-site check, below).
  - 19 YouTube videos (43,765 tokens): Germany, Austria; street interviews (Easy German), history and science explainers (MrWissen2go, MAITHINK X, Kurzgesagt, Doktor Whatson, Simplicissimus), news (tagesschau, tagesschau in Einfacher Sprache, ZIB 2), political satire (heute-show), documentary report (Y-Kollektiv), technology (Breaking Lab), food (Galileo, Sallys Welt), a let's play (Gronkh), a comedy vlog, a car review, a football press conference, stand-up (Felix Lobrecht, an hour). 6 manual tracks, 13 ASR. No English line: none has a human English track, and YouTube answered 429 to every translated track (as for the French study's ASR tracks).
  - 13 articles (11,251 tokens, each cut at about 1,500 words): four Wikipedia articles (Photosynthese, Marlene Dietrich, Brezel, Käsespätzle), tagesschau (2), Deutsche Welle, SRF (2), BR24, t-online (2), heise. Stern and GEO answered "Access Denied"; one heise article is behind its paywall: left out.
- **Pipeline**: the skill's `build-units.ts` (4,418 YouTube cards, 255 paragraphs) and `measure.ts` (`LEARNING=de NATIVE=en LEVEL=3000`) over this branch.
- **Judging**: one blind judge subagent per site rated 120 hovers sampled by token (`scripts/hover-packets.py`), on the build before the refinements below (`runs/l2-1-v2`); then one blind A/B per site of that first build against the final one on the tokens whose hover changed (`packets/ab-v1-v3`), and one blind A/B for the dictionary's sources (below). One judge per item: read differences under ±4 points as noise.

## Results (L2-1)
| | YouTube | Articles | All | French at L1-1 → L1-2 |
|---|---|---|---|---|
| Hover meaning good | 66% | 78% | | 70–74% → 71–76% |
| Hover meaning wrong or misleading | 4% | 6% | | 6–14% → 4–6% |
| Word tokens with no hover | 7.9% | 14.2% | 9.2% (5,067) | 3.5% |
| Words shown as New per 1,000 tokens | 93.5 | 169.6 | 109.1 | 86.9 |
| Phrase highlights per 1,000 tokens | 0 | 0 | 0 | 0 |
| Names (rule D) | 0 | 0 | 0 | 0 |
| Hover lines over the width cap | 3 | 6 | 9 | 7 |

- **Refinements after the judged build** (judged blind on the changed tokens, about 1% of the corpus; good on those tokens before → after): YouTube 25 → 59% good, 30 → 8% wrong, preferred after : before 48 : 21; articles 32 → 65% good, 39 → 16% wrong or misleading, 19 : 5. They are: a finite verb after a preposition is no noun (a postposition: "Den Angaben zufolge soll …", and "Das sind", which the first build read as the noun Sein); a capitalised word inside a sentence is a noun (`capitalNoun`); "am", "im", "zum" … are their contraction ("am Montag": on the), "am" before a superlative its particle; a key's capitalised headword first where the examples write it so inside sentences (`capitalFirst`: Menschen → human being, not the pronoun "mensch"; Frau → woman). Got worse (judges preferred before): an untagged inflected verb whose key has a noun now first (postet, geboxt, entsetzt: "post", "boxing", "horror"), "Bitte" and "Lachen" at a clause's start read as nouns, two separable readings from an ASR fragment ("geht … über", "hast … zu").
- **Wrong hovers** (12 of 240 judged on the first build): a separable verb whose particle the hover does not join (an in "angucken", auf in "aufzählen", "dazu geben" written apart), a homograph's other word (as → As, soll → Soll: fixed by the postposition rule; Haaren → haaren: fixed by `capitalNoun`), a name given a word's meaning (Pro in "iPad Pro", Land as a surname), mal shown as "times", nächste → nah.
- **Unknown tokens** (5,067, 9.2%; French 3.5%): 3,761 capitalised (names and places: Berlin, Deutschland, Japan, Hans; kaikki gives place names proper-noun entries only), compounds (1,533 tokens split into two vocabulary words: Bahnsystem, Supermond, Pizzateig, Lichtenergie, Bundespräsidentin, Verdauungsenzyme), abbreviations (z.B, bzw, KI, SRF, USA), English words (the, of, yeah), ASR damage. German writes compounds as one word, so the vocabulary from a frequency list reaches far fewer of a text's words than in French or Spanish.
- **The polite Sie**: about 90 capitalised "Sie", "Ihre", "Ihnen" inside sentences show "she", "her", "them": the key "sie" has both headwords' senses, the lowercase one's first, and the defs dictionary does not read the written case (L2-2).
- **Separable verbs**: 207 tokens read as the separable verb whose particle closes their clause (sieht … aus → aussehen, kommt … an → ankommen, hängt … ab → abhängen); of 30 sampled, 27 are right (two from ASR fragments, "hör auf … zu" read as zuhören).

## What L2-1 built, and what was tested
| Idea | Result | Decision |
|---|---|---|
| The French build (`learning-kaikki.ts`) over kaikki German, `nounsCapitalised`: a capitalised headword ("Haus", "Häuser") is a word like a lowercase one, its form-of senses count, and a key both spellings share has both headwords' senses, the lowercase one's first with room for 2 of the capitalised one's (`CAPITAL_ROOM`: "sie" keeps Sie's "you (polite)") | 33,630 vocabulary words, 138,748 lemma forms in 3 shards, IPA for 32,067 (95.4%; 99.2% of the 5,000 most frequent) | **Built** |
| Frequency list: Buchmeier's "TV and movie subtitles (2009)", its first 150,000 ranks, case kept; a written form ranks the bases of the headword spelt as it is ("Reisen" ranks Reise, "reisen" itself; a sentence's first word, with no capitalised headword, the lowercase word's) | `germanWritten`, `rankedBases` | **Built** |
| A key's capitalised headword first by the list's case counts (capitalised 3 times as often as lower case) | Menschen, Frau right; but "Nein", "Hallo", "All" first as the nouns "a no", "hullabaloo", "cosmos": an utterance's first word is capitalised too | **Dropped** for the examples' case inside sentences (next row) |
| …by the examples' case inside sentences (kaikki German and de.wiktionary's examples; 3 times as often, 3 times at least) | 272 tokens change (am, Menschen, Frau, Ungarn right; untagged verb forms of noun keys worse) | **Built** |
| IPA from de.wiktionary (written `[haʊ̯s]`, kept in slashes) for the words English Wiktionary has none for | English edition 81% → 95.4% of the vocabulary | **Built** |
| Contractions: a meaning after the parts ("contraction of in + dem; in the"), or the parts' own glosses ("an (“on(to)”) + das (“the”)" → "on(to) the"); a contraction's alt-of sense names no single target ("ins" had in's meaning) | im, ins, ans, aufs, fürs, beim, vom, am gain their meaning; ums, hinterm, überm, unterm name only their parts (no meaning) | **Built** (CORE: Spanish and French at their next rebuild) |
| A description, a comma, then the translation, for closed classes ("nominative masculine singular definite article, the" → "the") | der, die, das show "the" | **Built** (CORE) |
| Each part of speech keeps its first sense within the 6 senses (`keptSenses`) | "sein" keeps the determiner "his" after the verb's five senses | **Built** (CORE: next rebuilds) |
| A verb's senses kaikki tags auxiliary are labelled "auxiliary": rule A2 shows them first where the grammar reads an auxiliary (also for a sense so labelled in `senseOrder`), the lexical ones where the tag reads a verb | "hat gemacht": forms the perfect aspect; "hat ein Auto": to have; 730 auxiliaries in the corpus | **Built** (the label CORE in the build; Spanish and French at their next rebuild) |
| Separable verbs' forms written apart (kaikki's "fängt an") as forms of the verb, after their other bases and without their rank (`separableVerbs`) | 6,995 forms with separable verbs; 207 tokens read so (27 of 30 sampled right) | **Built** |
| Tagger from UD German GSD: universal tags with the verb form; weights ≥ 3 | test 90.0% (382 nouns read as proper nouns: GSD tags common words inside names PROPN) | Refined |
| …GSD's PROPN on STTS NN, ADJA, ADJD, CARD read as NOUN, ADJ, NUM; STTS VA*, VM* always AUX (GSD calls a tenth VERB); the separable particle (STTS PTKVZ) PART.Vz | test 92.5%, a margin of 5 keeps 92.6% at 95.7% | **Built** |
| …weights ≥ 2 | 93.9%, 122 KB gzipped (≥ 3: 41 KB) | Not taken: over the 100 KB budget |
| The German edition's English translation tables second in `de-en` (L0: +1.8 points of gate coverage) | Blind A/B on the 85 gate words only they cover: tables preferred 50, no meaning 15, same 20 (French: 1 : 12); 12 tables' meanings misleading, all persons' names the subtitles use (Bobby, Ken, Mac, Sharon → "Sharon fruit"). On the corpus they would give 1,228 unknown tokens a meaning, a third of them persons' names (Hans → "Jack, Hank") | **Deferred to L2-2**, with the names rules that keep persons' names out |
| A word written in lower case takes an untrusted tag that agrees (any part of speech, or verbs only) | 725 / 71 tokens change, mostly worse (da "since", die "who"; participles to their verbs, betrunken → betrinken) | **Dropped** |
| A capitalised word keeps its own entry where separable verbs share its form ("Sankt", not "(ihr) sankt ab") | fixed 1 token, broke 3 ("Schienen" → schienen, past of scheinen) | **Dropped** |
| Phrase patterns from the B1/B2 build with German settings (slots jemand, jemanden, jemandem, jemandes, etwas; auxiliaries sein, haben, werden), highlighted | Not judged: German phrases need separable verbs and "sich" inside patterns, with gaps (L2-3) | 2,475 patterns built **for selections and saved phrases only**, none highlighted |

## German grammar (`core/tagging/de.ts`)
- An auxiliary is a form of haben, sein or werden with a participle or infinitive anywhere in its clause (between pauses; German puts the verb's other parts at the clause's end, or the finite verb there in a subordinate clause) and no other auxiliary or modal between them: haben + participle, werden + participle or infinitive, sein + the participle of a verb that takes sein (a closed class of motion and change-of-state verbs, with separable particles: angekommen). Sein + another participle is a state, read as the adjective ("ist geschlossen"). A modal keeps its own meaning; its infinitive is a verb.
- A separable verb's finite form is that verb where its particle closes the clause (tagged PART.Vz, or the clause's last word as a preposition or adverb) and the pack lists particle + its simple verb among its bases; without the particle it is the simple verb ("wir essen", not aufessen; "rufe", rufen, not the noun Ruf).
- Closed classes: a modal's form is the modal whatever the tag ("Kannst du"); a form of haben, sein or werden tagged as a verb is that verb ("habe", not Habe); "sein" before a noun or adjective is the possessive, at a clause's end the verb; a clause's first word before a subject pronoun is a verb ("Wissen Sie …?"); an infinitive after a determiner or preposition is a noun ("das Essen"); a capitalised word inside a sentence is a noun ("mit Haaren": Haar); the contractions (`GERMAN_RULES.contractions`) are contractions, "am" before a superlative its particle.
- CORE: rule A1 takes `WordUse.base` when it is the word itself, or a separable verb (`WordUse.separable`), whatever the pack calls its main part of speech (Aussehen, the noun, is commoner than aussehen); rule 1b reads the grammar's part of speech where no tag is trusted; `TaggedWord.capital` says how a word was written (unknown in capitals). English, Spanish and French hovers are unchanged, row for row (157,458, 67,069 and 78,973 rows).

## What a new learning language needs (German, after L2-1)
- [x] Word pattern and tokenizer: no elisions; ß and umlauts are letters; contractions am, im, zum, zur, beim, ans, ins, vom (`GERMAN_RULES.contractions`); hyphens split ("Corona-Pandemie": both parts known)
- [ ] Pronominal verbs: "sich" anywhere in the clause (L2-3)
- [x] Accents in capitals: none (German writes its umlauts in capitals)
- [x] Adjectives before nouns
- [x] Tagger and grammar: GSD only (HDT's text is academic-only); auxiliaries anywhere in the clause; separable verbs by their particle
- [x] Lemmas: every form, capitalised headwords' too, separable verbs' forms written apart, the treebank's order
- [x] Vocabulary: alt-of senses, head-line labels; case kept in the frequency list
- [ ] Compounds: 1,533 unknown tokens split into two known words (L2-2)
- [ ] Names (L2-2): `names.json` is built (1,908 names, 1,304 mostly capitalised) but rule D stays off for German, where capitals mark nouns
- [ ] Phrases (L2-3)
- [ ] Measured on Netflix (no browser in this session)

## Costs
- Download: `de` 7.12 MB raw (1.28 MB gzipped, 11 files), `de-en` 3.93 MB (1.04 MB, 3 files): de→en 11.1 MB raw, 2.3 MB gzipped (fr→en 11.9 / 2.3 MB). Every file is under 2 MB.
- The learning pack loads in about 50 ms in Node; classifying with the tagger takes 4.5 ms per 1,000 tokens (French 3.6). `de/tagger.json` 133 KB raw, 41 KB gzipped.
- `npm run data:de` takes about a minute; de.wiktionary's 3.1 GB extract is first cut to its German entries' examples and IPA (`kaikki-de-edition-slim.jsonl`, 0.23 GB).

## Still open
- Netflix: not collected (Claude in Chrome was not connected). Collect 5 German Netflix episodes (Dark, How to Sell Drugs Online (Fast), Kleo, Barbaren, Liebes Kind) on profile KEISUKE, muted and paused at once, and judge them in their own packets.
- Not checked in the user's Chrome: the packs are not on npm until their first versions are published by hand, before the merge.
- The polite Sie, Ihr, Ihnen show the lowercase pronoun's meaning first (about 90 tokens).
- Modal particles (mal, ja, doch, denn, halt, eben) show their adverb or interjection senses ("mal": times).
- Adverbial adjectives: GSD tags "natürlich", "einfach", "genau" as adjectives (STTS ADJD) where they are adverbs ("of course", "simply").
- Words of one spelling in lower case and two parts of speech keep kaikki's order without a tag ("wollen": the adjective "woolen" first).

## Suggested order
1. **L2-2 names and vocabulary**: compounds first (1,533 unknown tokens, 2.8% of the corpus): read an unknown word as its last known part with a known modifier before it, with the linking -s-, -es-, -n-, -en-, -e- (a design decision for the hover: the head's meaning, or both parts'); places and persons (2,000+ capitalised unknown tokens: kaikki's place names have proper-noun entries only; persons' names from the names lexicon without rule D, by lexicon and runs); the German edition's English tables second (judged 50 : 15 here) once persons' names are kept out; the polite Sie, Ihr, Ihnen by the written case inside a sentence (the dictionary reads `written` only for pair dictionaries today).
2. **L2-3 phrases, separable verbs, sich**: separable verbs as phrases joined across the clause (the particle's hover shows the verb too: today only the finite verb is read as anfangen), "sich" anywhere in the clause, the slots jemand/jemandem/etwas; modal particles in the middle field; then judge highlights and turn detection on.
3. Netflix corpus and a real-site check in the user's Chrome (de→en on an article, YouTube and Netflix) once `@langle/de` and `@langle/de-en` are on npm.

## Measuring
`data/raw/quality/2026-11-de/`: `corpus/` (with `manifest.json`), `runs/units/`, `runs/l2-1-v1` (first build), `runs/l2-1-v2` (judged), `runs/l2-1-final`, `runs/regress/` (English, Spanish, French before and after), `scripts/hover-packets.py`, `scripts/tables-only.py`, `scripts/manifest.py`, `grab/` (the Chrome grabs with `LEARNING="de"`, and the yt-dlp and HTML fallbacks), `packets/l2-1` (absolute), `packets/ab-v1-v3` (refinements), `packets/tables` (the sources A/B). Rebuild the units and measure with the skill's scripts (`LEARNING=de NATIVE=en`).
