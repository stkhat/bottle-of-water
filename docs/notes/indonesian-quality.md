# Indonesian quality on real content (2026-11-21)

How good English → Indonesian hover meanings (`en-id`, for Indonesian speakers learning English) are on real videos and articles after id-1, and what id-2 changed. Default settings: known level 3000, nothing saved. Method as in the real-content-quality skill (`.claude/skills/real-content-quality/SKILL.md`); the pair's sources and gate are in [translation-data-expansion](translation-data-expansion.md) "id-1".

## Method

- **Corpus**: the 2026-11 English corpus of the translation-quality study, reused (no new collection): 171,625 word tokens over YouTube, Netflix and articles (`data/raw/quality/2026-11/runs/units-87d8606/units.jsonl`, git-ignored).
- **Pipeline**: the skill's `measure.ts` with `NATIVE=id` (and the other natives for the shared rules) over main 3efe5d6 and over each prototype. Study folder `data/raw/quality/r4-id/q/` (git-ignored): runs, packets, results and the helper scripts (`run.sh`, `diff.py`, `packdiff.py`, `bysource.py`, `showbad.py`, `tab.py`, `cmp.py`).
- **Judging**: `judge` subagents (Opus), one per packet. Baseline: 6 packets of main, Indonesian beside Chinese (a pair with tables first and a wordnet). A/B: main against the id-2 build, one packet per site (YouTube, articles, Netflix), versions shown as X and Y in random order; the same for Hindi and Arabic, whose packs the frequency order changes most. Rates re-weighted to the corpus; one judge per item, so differences under ±4 points are noise.

## Results

Baseline (main, re-weighted to the corpus):

|          | good | acceptable | wrong | misleading | missing |
| -------- | ---- | ---------- | ----- | ---------- | ------- |
| id words | 57%  | 18%        | 22%   | 3%         | 0%      |
| zh words | 62%  | 21%        | 17%   | 0%         | 0%      |

Phrase meaning fits (yes / partly / no): id 39 / 26 / 35%, zh 43 / 33 / 24%. Indonesian is below Chinese on words, much of the gap on the commonest ones: the → si (the article of personal names; 6,379 tokens), can → boleh, people → rakyat, do → buat, these and those with no entry. By source of the word tokens: tables 106,102, S1 (reverse glosses) 21,091, the id edition 8,406, Wordnet Bahasa 4,999, other 5,166. Names (1,424 against zh's 1,119) are by design: London, Iran, September have their headword as the meaning.

A/B, main against id-2 (about 16% of word tokens change, 1,457 distinct words):

| site     | good before → after | wrong + misleading before → after | changed words preferred after / before / same | changed phrase units after / before |
| -------- | ------------------- | --------------------------------- | --------------------------------------------- | ----------------------------------- |
| YouTube  | 56 → 56%            | 20 → 17%                          | 28 / 17 / 25                                  | 9 / 6                               |
| articles | 66 → 67%            | 14 → 12%                          | 25 / 11 / 34                                  | 13 / 1                              |
| Netflix  | 59 → 60%            | 6 → 5%                            | 19 / 14 / 37                                  | 10 / 5                              |

All changed words: id-2 preferred 72, main 42, same 96. Hindi (16% of tokens change, mostly by the frequency order): id-2 preferred 43, main 27, same 80; good 51 → 53% (articles), 71 → 73% (Netflix), 70 → 69% (YouTube). Arabic (21%): id-2 preferred 42, main 35, same 73; good 71 → 71%, 70 → 71%, 67 → 69%: within noise, kept so that one rule serves every native with a frequency list. The Hindi and Arabic packets were judged before the last refinement (spellings of one word move as one), which changed 40 more Hindi tokens and 3 Arabic ones back to main's lines.

Numbers that need no judge (id, main → id-2): tokens 171,625; New 85.3 and phrases 27.1 per 1,000 tokens, unchanged; no entry 681 → 230 tokens; translated at display 5,975 → 6,429 (yeah, against and others lost a wrong line and show the English definition translated); lines over the cap 4.

## Root causes

- **A row's or synset's words in no order of use** (NATIVE): English Wiktionary's table rows and Wordnet Bahasa's synsets list a sense's words in no order of use, and the line shows the first: the → si, sang, itu; can → boleh, bisa; people → rakyat, masyarakat, orang; have → mempunyai, memiliki. S1 was already ordered by FrequencyWords (id-1); the tables and the wordnet were not.
- **English inflections with no entry** (CORE): these and those (450 tokens) have no translation table of their own; their entries are only "plural of this / that", and the lemma table does not map them, so the hover had nothing.
- **Prose read as a list** (CORE, S1): a gloss written as a sentence with commas was split at its commas, and a short piece of it named an English term: something → refleksi, kewajiban; off → hubristik. A part after a colon ("third person plural pronoun: they, them, their") is a list and must stay one.
- **A wordnet sense of another part of speech** (CORE): the wordnet files yeah under the adverb synset yea.r.01, whose Indonesian lemma is tapi ("but"). The tables' and S1's senses are already held to the English word's parts of speech (`fitsEnglishPos`); the wordnet's were not.
- **Malay lemmas in Wordnet Bahasa** (PAIR, not fixed): crackle → berdetus, dispatch → menghantar, classify → mengelaskan. OMW 1.4's omw-id carries no variety or confidence tag that tells the Malay ones apart; the frequency order puts the Indonesian word first where the synset has one.
- **S1's narrow and honorific lines** (PAIR, not fixed): helpless → kronis, vegetarian → nabati, his / him / her → beliau (the respectful third person), you know → "yang tau tau aja".

## What was tested

| Idea                                                | Result                                                                                                               | Decision                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Order a sense's words by the frequency list         | id 72 / 42 and hi 43 / 27 preferred after / before on changed words; ar 42 / 35                                      | Recommended, for every native with a frequency list                                            |
| The same order across spellings of one word         | Hindi अंग्रेजी (the subtitles' spelling) went before अंग्रेज़ी for English, फुटबॉल before फ़ुटबॉल, सख्त before सख़्त | Refined: spellings `NativeLanguage.spelling` folds together move as one, in the source's order |
| Drop an S1 part with a long item that names no term | something's, off's and you know's stray lines gone; the pronoun lines after a colon lost they, we, us                | Refined: a colon ends a part too                                                               |
| A variety tag to drop Wordnet Bahasa's Malay lemmas | omw-id has none per lemma                                                                                            | Dropped; the frequency order covers part of it                                                 |

## Fixes by layer

| Layer  | Rule                                                                                                                                                                                                                                                                                                  | Where                                                            | Measured                                                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NATIVE | A sense's words in the order the frequency list ranks them, in steps of 4× in rank (source order within a step and for unranked words); a sense with a phrase among its words keeps its order; spellings of one word move as one (`byFrequency`, natives with `reverseGlosses.frequency`: id, hi, ar) | `native.ts`, with `alternativeSpelling`, on every source's lines | id the → itu (6,379 tokens), can → bisa (612), people → orang (296), do → melakukan (834), your → kamu, but → tapi, father → ayah, face → wajah; worse: since → dari (74), say → bicara (246), about's third line → akan; hi you → आप; worse: me → मैं, want → इच्छा; ar they → هم; worse: to → على |
| CORE   | An English word whose every sense is an inflection of one term ("plural of this"), with no entry, not lemmatised and not written only capitalised (Hades), takes its base's sense of its part of speech, else its first, with the form-of gloss as the hint (`inflectionOf`, `withInflections`)       | `recipe.ts` `readTranslationTables` (`formOf`), `native.ts`      | id these → ini (278), those → itu (172); no entry 681 → 230 tokens; every pair from the tables gains the same terms                                                                                                                                                                                 |
| CORE   | S1: a gloss part (between semicolons, or after a colon) with a comma item of four words or more that names no term is prose, and none of its items names a term (`proseItems`)                                                                                                                        | `reverse-glosses.ts`                                             | id something loses refleksi, kewajiban (222 tokens); off loses hubristik (91); hi 17,882 → 17,840 terms, ar 26,500 → 26,276                                                                                                                                                                         |
| CORE   | A wordnet sense counts only in a part of speech the English word has (`fitsEnglishPos`, as for the tables and S1)                                                                                                                                                                                     | `omw.ts` `readWordnetMeanings`                                   | id yeah loses tapi (505 tokens; the English definition translated); zh 41 tokens, th 189                                                                                                                                                                                                            |
| CORE   | A term's short line follows its first sense once the sense's words are reordered or converted, unless the source set a short of its own                                                                                                                                                               | `recipe.ts` `convertTerms`                                       | no stale short (do → buat over melakukan)                                                                                                                                                                                                                                                           |

Other natives over the same corpus (main → id-2, hover tokens changed): ja 0, it 10, pl 6, zh 41 (the wordnet's parts of speech), th 291: lost leaves the wordnet's noun and adjective senses (คนใกล้ตาย, "people about to die") for the edition's pointer to lose (เสีย), broke gains พัง; worse, whether → จะ first (29 tokens), an S1 item the colon now separates. The smoke test's first lines for en-id are unchanged.

## Packs

`en-id` 2026.1121.2 (4.62 MB), `en-hi` 2026.1121.4, `en-ar` 2026.1121.3, `en-de`, `en-ru`, `en-th` 2026.1121.4, `en-es`, `en-fr`, `en-it`, `en-pl`, `en-pt`, `en-zh` 2026.1121.3 (the inflections, and the frequency order for id, hi, ar), `en-defs` 2026.1121.8 (fewer terms every pair leaves out). `en-ja` and the learning packs unchanged. Gate: en-id passes by (a): top 5,000 94.5% (S1 1,094, tables 2,859, the edition 209, Wordnet Bahasa 565), top 2,000 96.5%, tokens 97.5%, phrases 11.5%; en-ar by (a), top 5,000 91.4%; en-hi by (b), tokens 91.1%.

## Still open

- **you know → "yang tau tau aja"** (306 tokens): an S1 phrase entry whose gloss ("if you know, you know, IYKYK") names the phrase itself.
- **be → berada**: the tables' first rows for be are "to occupy a place" and "to exist"; Indonesian has no copula, so no line fits the copula.
- **of → "rumah Andi"**: a table row holding a usage example in place of a word.
- **his / him / her → beliau**: S1's honorific pronoun first.
- **Wordnet Bahasa's Malay lemmas** (berdetus, menghantar, mengelaskan): no tag in OMW 1.4; comparing with omw-zsm per synset is untested.
- **since → dari, say → bicara / bilang**: the frequency order puts the commoner but less fitting word first where a row mixes senses.
- From id-1, not addressed: berulang2 (the edition's "2" for reduplication), engage → bertunangan, case duplicates in synsets (cheerio), therefore → jadi, incoming → baru, helpless → kronis, vegetarian → nabati, interrupt → sarung (a homograph's rank), know's third line → setubuh, you → dasar.

## Real-site check (2026-11-21)

Check build at main aeb4807 (en-id 2026.1121.2, en-defs 2026.1121.8, both served by jsDelivr), learning en, native id, in the user's Chrome; settings saved and restored through `langle:check-settings`; every video muted. Sites: the English Wikipedia article "Jakarta", YouTube (Ken Robinson, TED), Netflix (Friends, watch/70274124).

Layout: the hover card, the phrase card, the dictionary window and the Indonesian line under the English subtitle (YouTube, machine translation `tlang=id`) and in the transcript cards all fit; no clipping or overlap (the one overlap, Wikipedia's own link preview over the card, is the site's). Netflix has no Indonesian track for this title (tracks: en, ja), and Netflix has no site machine translation, so there is no second line there by design.

Hover results (card text):

| Word | Card |
| --- | --- |
| the, these | these → ini |
| can, people, do / did | bisa; orang; do → melakukan (the main verb "she did"; the auxiliary in "What do you do?" shows no card) |
| your, something | kamu / kalian; sesuatu |
| yeah | YA, marked "Machine translation" (Chrome's translation of the definition "Yes"; the upper case is its output) |
| off | af (see below) |
| since | dari / karena |
| say / said | bicara / bilang |
| you know | "yang tau tau aja" (known) |
| his / him / her | beliau |
| be | berada / ada |
| of (Wikipedia) | rumah Andi / dari (known) |
| extend, border, registered, VOC, according to | memperpanjang / menyampaikan / jemba; perbatasan; terdaftar; the two-line gloss of the Dutch company; menurut / mengikuti |
| Jakarta, Shakespeare (names) | IPA only (Shakespeare) or the name itself (Jakarta) |
| unpredictability (no Indonesian meaning) | the English definition at first; once Chrome's en → id model was downloaded (the first click on the page starts it) "kualitas yang tidak dapat diprediksi", marked "Machine translation", in the card and in the dictionary window |

New findings, not fixed here (each is a pack rebuild):
- **off → af**: the only row left is a noun "af" (tagged noun, for the adverb in "off the beat"); expected: mati / lepas / jauh.
- **myrrh → kemenyan**: kemenyan is frankincense; myrrh is mur (the transcript line, machine translated, says "minyak mur").
- **squander → menguras** (drain): menyia-nyiakan is the sense.
- **Hover of a known word after a pointer move inside the transcript** needs a real mouse move into the word; a scripted pointer event does not open it (a check-tooling note, not a bug).

Error log: 16 `info` records (the language data's mirrors: every file of en-defs and en-id from jsDelivr, 330 to 553 ms each), no `warning` or `error`. Cleared and read back empty. Settings read back equal to the saved object.

## Measuring

```
Q=data/raw/quality/r4-id/q
npm run data:native -- id hi ar                        # rebuild the pairs the rules touch
DEFS=1 sh $Q/run.sh <label> id hi ar th zh ja it pl    # rebuild en-defs, measure each native
python3 -I $Q/diff.py $Q/runs/base-id $Q/runs/<label>-id
python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py --before $Q/runs/base-id --after $Q/runs/<label>-id --out $Q/packets/<tag> --tag <tag> --packets 3
python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py --key $Q/packets/<tag>/key-<tag>.json $Q/packets/<tag>/result-*.json
```
