# Turkish quality on real content (2026-11-21)

How good English → Turkish hover meanings (`en-tr`, for Turkish speakers learning English) are on real videos and articles after tr-1, and what tr-2 changed. Default settings: known level 3000, nothing saved. Method as in the real-content-quality skill (`.claude/skills/real-content-quality/SKILL.md`); the pair's sources and gate are in [translation-data-expansion](translation-data-expansion.md) "tr-1".

## Method

- **Corpus**: the 2026-11 English corpus of the translation-quality study, reused (no new collection): 171,625 word tokens over YouTube, Netflix and articles (`data/raw/quality/2026-11/runs/units-87d8606/units.jsonl`, git-ignored).
- **Pipeline**: the skill's `measure.ts` with `NATIVE=tr` (and the other natives for the shared rules) over main 6413ad0 and over each prototype. Study folder `data/raw/quality/r4-tr/q/` (git-ignored): runs, packets, results and the helper scripts (`run.sh`, `diff.py`, `packdiff.py`, `lost.py`, `case.py`, `f3.py`, `prefs.py`, `tab2.py`).
- **Judging**: `judge` subagents (Opus), one per packet. Baseline: 6 packets of main, Turkish beside Chinese (a pair with tables first and an edition). A/B: main against the tr-2 build, one packet per site (YouTube, articles, Netflix), versions shown as X and Y in random order; the same for Thai and Indonesian, whose packs the main-part-of-speech rule changes most. Rates re-weighted to the corpus; one judge per item, so differences under ±4 points are noise.

## Results

Baseline (main, re-weighted to the corpus):

|          | good | acceptable | wrong | misleading | missing |
| -------- | ---- | ---------- | ----- | ---------- | ------- |
| tr words | 72%  | 18%        | 8%    | 1%         | 0%      |
| zh words | 68%  | 22%        | 9%    | 0%         | 1%      |

Phrase meaning fits (yes / partly / no): tr 62 / 23 / 15%, zh 61 / 20 / 19%. Turkish starts level with Chinese: tr-1's tables-first order already gives the common words their table rows (be → olmak, you → sen, have → sahip olmak). What is wrong comes a class at a time: a term whose tables translate only a lesser sense (down → kuş tüyü, the feathers; own → sahip olmak for "my own"), English left in Vikisözlük's glosses (guerdon), and Turkish's many light-verb phrases, which the frequency order left in the source's order (then → bir zamanlar; need → gereksinmek, rank 1.9 million).

A/B, main against tr-2:

| site     | good before → after | wrong + misleading before → after | changed words preferred after / before / same | changed phrase units after / before |
| -------- | ------------------- | --------------------------------- | --------------------------------------------- | ----------------------------------- |
| YouTube  | 72 → 73%            | 6 → 5%                            | 19 / 9 / 42                                   | 6 / 1                               |
| articles | 67 → 68%            | 13 → 13%                          | 24 / 10 / 36                                  | 0 / 1                               |
| Netflix  | 63 → 64%            | 12 → 11%                          | 17 / 9 / 44                                   | 11 / 3                              |

About 9% of word tokens change (686 distinct words). All changed words: tr-2 preferred 60, main 28, same 122 (an earlier build, before the phrase step and with the dropped lowering: 54 / 34 / 122, its losses January → "büyük ay", teach → "ders vermek", sign → "kol çekmek"). That build weighed a phrase one step more per word; the shipped one weighs it two, which changes 1.7% of tokens more (January → ocak, February → şubat, while → -ken, ensure → sağlamak, against respect → saymak, dance → oynamak, text → yazmak): one step against two, blind, preferred 36 / 32 on those words, good unchanged on every site. The main-part-of-speech rule, shared, judged where it changes most: Thai (1,011 tokens) tr-2 preferred 59, main 33, same 29, good 52 → 52%, 48 → 48%, 71 → 72%; Indonesian (675 tokens) 48 / 34 / 28, good 65 → 65%, 57 → 57%, 63 → 63%.

Numbers that need no judge (tr, main → tr-2): tokens 171,625; New 85.9 and phrases 27.1 per 1,000 tokens, unchanged; no entry 98 tokens, unchanged; names 1,284; translated at display 6,010 → 6,018 tokens; lines over the cap 81, unchanged.

## Root causes

- **The tables' only sense is a lesser one** (CORE): the main part of speech that decides whether a later source supplies a term (`mergeSources`, U1-6) was set only where English Wiktionary's first part of speech agrees with the tables' first sense, so for a term the tables give, nothing checked the tables themselves. down's Turkish rows translate only the noun (feathers), own's only the verb; Vikisözlük has the adverb and the adjective. An interjection row is no lesser sense, though: great's Thai row ยอดเยี่ยม (great!) is the adjective said alone, and the Thai adjectives English Wiktionary glosses "great" are slang (ช้าง) and formal (โอฬารึก) words.
- **English left as a gloss** (NATIVE, the edition): Vikisözlük writes some senses in English (guerdon: "A reward, prize or recompense for a service"), and Wikisłownik, Wikizionario and Wiktionnaire do too (pl tint: "it isn't"; fr oomph: "Sex appeal"). The hygiene rules caught pointers, placeholders and labels, not a gloss in the learning language.
- **Phrases kept in the source's order** (NATIVE): the frequency order (id-2) leaves a sense with a phrase in it as it is, since a phrase's words say little of its own use. Turkish says many verbs as a noun and a light verb (telefon etmek, sebep olmak, fark etmek), so most of its senses hold one, and the order never applied: then → "bir zamanlar" (once upon a time) before "o zaman"; need → "gereksinmek" (rank 1,880,265) before "lazım olmak".
- **Sentence-case capitals** (NATIVE, left as they are): Vikisözlük opens 1.5% of its English entries' glosses with a capital ("Kadın garson", "Bir taraftan öbürüne doğru"), Wikisłownik 3.5%, where a capital says something (Włoch, an Italian; Bóg; "Pica pica"). No rate tells the two apart.

## What was tested

| Idea                                                                                      | Result                                                                                                                                                                                               | Decision                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main part of speech from the tables' most translated sense, for terms the tables give     | tr down → aşağı (88 tokens), own → kendi (79); A/B th 59 / 33, id 48 / 34 preferred after / before on changed words; worse: tr absolutely → "mutlak" (30), th great → ช้าง (127, the slang adjective first)            | Refined: not for an adjective or adverb whose rows translate only its interjection (next row)                                                                                                                                                                                                                                                                 |
| The same, but not for an adjective or adverb whose rows translate only its interjection (the word said alone) | th great → ยอดเยี่ยม (134 tokens), tr absolutely → kesinlikle (30), as on main; nothing else changes in any pair. Also for nouns and verbs: id attention → "siap" (the command), zh get out → 滚, th timber → ไม้ล้ม, worse | Recommended for adjectives and adverbs only |
| The same for every term, whatever source it was taken from                                | pl will → wola, pt phone and human lost the edition's main sense                                                                                                                                     | Refined: only terms taken from the tables                                                                                                                                                                                                                                   |
| The same where the tables lack the term's main part of speech entirely                    | don't → cevaplama, gone → zayi                                                                                                                                                                       | Refined: only where the native tables have the term                                                                                                                                                                                                                         |
| Leave out a gloss written in English                                                      | tr guerdon; pl lost "that is" (that's), es and fr lost abbreviations' expansions (BBC, MO), fr William Shakespeare                                                                                   | Refined: not a contraction's, nor one that spells the headword out (242 tr abbreviations with a Turkish translation in brackets kept: "Food and Agriculture Organization (BM Gıda ve Tarım Teşkilatı)"), nor an example holding the headword with other words in lower case |
| Phrases ranked as their rarest word (Turkish)                                             | then → o zaman, need → lazım olmak, cause → sebep olmak, threaten → tehdit etmek, realize → fark etmek; worse: January → "büyük ay", teach → "ders vermek", sign → "kol çekmek", blame → "suç atmak" | Refined: two steps (16×) rarer per word after the first (one step still put January → "büyük ay" first)                                                                                                                                                                                                                             |
| Lower a sentence-case gloss's first word in an edition that capitalises only some glosses | tr 255 glosses ("kadın garson"); pl lowered Włoch, Bóg, "I wojna światowa", "Pica pica", "Ojcze nasz", even when the edition's own headwords and the next word were checked                          | Dropped: the capital rates (tr 1.5%, pl 3.5%) do not separate a sentence's capital from a meaningful one, and the gain is cosmetic                                                                                                                                          |

## Fixes by layer

| Layer  | Rule                                                                                                                                                                                                                                                                                                                                                                   | Where                                   | Measured   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| CORE   | A term taken from the translation tables whose first sense is not of English Wiktionary's first part of speech has as its main part of speech that of the sense most languages translate (`readTranslationTables` `mainPos`), so a later source with that part of speech supplies it (`mergeSources` "lacks"; `from` is the tag of the source the term was taken from); not an adjective or adverb whose rows translate only its interjection, the word said alone (great!, absolutely!) | `recipe.ts`, `native.ts`                | tr down → aşağı (88 tokens), own → kendi (79), best → en iyi (86), private → özel (19), extra → figüran; th kid → เด็ก, private → ส่วนตัว; great and absolutely keep their interjection rows (ยอดเยี่ยม, kesinlikle); id kind → jenis, type → jenis; it off → fuori (92); ar store → متجر; worse: hi fit → आना |
| NATIVE | A gloss written in English (two words or more, notes aside, each an English term and none a word of the edition's) is left out, but a contraction's and one that spells the headword out (its initials, the headword itself, a name around it)                                                                                                                         | `recipe.ts` `readEdition` (`inEnglish`) | glosses left out: tr 81 (guerdon), pl 41, de 25, zh 13, it 13, th 11, pt 4, fr 4, ru 3, es 1; tr keeps 242 abbreviations' expansions with their Turkish translation |
| NATIVE | `reverseGlosses.phrasesByRank` (Turkish): the frequency order also orders a sense with phrases, a phrase ranking as its rarest word and two steps (16×) more per word after the first                                                                                                                                                                                     | `native.ts` `byFrequency`, `recipes.ts` | then → o zaman (422 tokens), need → "gereksinim duymak / lazım olmak", not gereksinmek (209), never → hiç (171), mean → anlamına gelmek (135), cause → sebep olmak, threaten → tehdit etmek, realize → fark etmek, scientist → bilim adamı, January → ocak, while → -ken; worse: require → icap etmek, respect → saymak |

Other natives over the same corpus (main → tr-2, hover tokens changed): th 1,011 and id 675 (the main part of speech, judged above), it 175 (off → fuori), zh 91 (get out → 离开, junior → 低级的), ar 87 (store → متجر), hi 84 (fit → आना, worse), ru 18 (unlike), pl 3, pt 2, es 0. en-ja is not rebuilt (EJDict).

## Packs

`en-tr` 2026.1121.4 (3.94 MB); `en-th` 2026.1121.7; `en-ru` 2026.1121.6; `en-ar`, `en-de`, `en-es`, `en-fr`, `en-hi`, `en-it`, `en-pl`, `en-pt`, `en-zh` 2026.1121.5; `en-id` 2026.1121.4. `en-defs` 2026.1121.9, `en-ja` and the learning packs unchanged. Gate: en-tr passes by (a): top 5,000 91.1% (tables 3,950, reverse glosses 320, the edition 265, reversed tables 20), top 2,000 95.4%, tokens 97.5%, phrases 10.8%; every offered pair passes.

## Still open

- **absolutely → kesinlikle** (30 tokens) is the interjection only, as on main; the adverb's sense ("absolutely necessary": tamamen) waits for a source that ranks it.
- **outside's English example** ("It may last a week at the outside"): "at" and "a" are Turkish words too, so the gloss is not all English.
- **would / could → "Was or were determined to"**: en-defs' first definition, machine translated at display.
- **kid → oğlak, will → istek, people → millet, pile → pil, 'em → me**: a table row's first word, or the tables' most translated sense (kid's goat), is not the common use.
- **US**: Vikisözlük has no capitalised US entry, so the hover is the English definition, machine translated.
- **Long form-of prose** from Vikisözlük over the width cap (does: 64 characters; 81 tokens over the cap against zh's 1).
- **A light verb against a plain verb**: how much rarer a phrase is than its rarest word has no measure in a word list; one step a word put January → "büyük ay" first, two put respect → saymak and text → yazmak before saygı duymak and mesaj atmak (blind, 36 / 32). A phrase list with counts (OpenSubtitles n-grams) would rank phrases themselves.
- **Edition prose split at its commas**: the frequency order reads a sentence with commas as a list (the's third line: "bugün, şu an, hâlihazırda anlamı verir"; admin: "Bir forum" first).

## Real-site check (2026-11-22)

Check build from main (en-tr 2026.1121.4, en-defs 2026.1121.9, both served by the first mirror, jsDelivr, after one purge of en-tr's files), in the developer's Chrome, learning English and native Turkish through the settings channel. Sites: the English Wikipedia article "Alan Turing" (the test words were added as two paragraphs of the page, so they run through the article analysis), the YouTube Ken Robinson TED talk and Netflix Friends (watch/70274124). Videos muted. Hovers were real mouse moves.

Passed:
- Turkish letters (ı İ ş ğ ç ö ü) render correctly in the hover card, the phrase card, the dictionary window (article panel and the in-video window) and the dual-subtitle Turkish line on YouTube and Netflix. No clipping or overlap: the hover card, the dictionary panel and the Turkish subtitle line sit as in the mock; long lines wrap inside the card.
- Hover lines (Turkish, one per line): calm down → "sakinleşmek / sakinleştirmek"; sit down → "oturmak"; own → "kendi"; decay (noun context) → "parçalanma / bozunum" (the window lists çürümek first: the card follows the sentence's part of speech, the window the dictionary order); particular → "belli, belirli / değişik / özel, özgü"; then → "o zaman / sonra / ondan sonra"; need and needed (with "needed → need") → "gereksinim duymak / lazım olmak"; mean and means → "anlamına gelmek / demek istemek / tasarlamak"; sorry → "pardon / efendim / üzgün"; phone → "aramak"; ATM → "bankamatik"; absolutely → "kesinlikle"; extra → "ekstra"; Mr → "bay, sayın, efendi." with two longer rows; Dr → "doktor"; Mrs → "sayın, hanımefendi."; best → "en iyi"; January → "ocak"; great → "büyük"; across → "öbür tarafına / karşısında / Bir taraftan öbürüne doğru" (the capitalised edition gloss keeps its capital); Mongolia → "Moğolistan"; laughter → "kahkaha" (window: "kahkaha, gülüş"); know → "bilmek / tanımak / haberi olmak". A capitalised name with no entry (Smith, Paris, Turing, a made-up word) gets no card.
- A word without a Turkish meaning (inquest, morphogenesis): the first hover shows the English definition, the next (after Chrome's Translator has run) "genellikle jüri önünde" with the "Machine translation" mark. The first hover of such a word stays English by design (the translation is asked on the first hover).
- Phrase card: a selection ("and sit down. This is my") shows "ve otur" with the "Machine translation" mark and the word row "down — aşağı, aşağıya".
- Dual subtitles: YouTube "Aman tanrım,… (Kahkaha)" and Netflix "bilmiyorum.", "Neden? Bunu neden yapasın ki?". The Turkish line is the sentence's translation, so it can span two English cues.

Found, not fixed (data or ranking, larger than a small fix):
- **private** shows "er" (the soldier) before "özel, kişisel, hususi" in "my own private house": the noun row of a table leads although the sentence needs the adjective, unlike decay. Worth a look at how the hover picks the part of speech for a word that has a noun and an adjective sense.
- **never** shows only "hiç"; "asla" is the common equivalent.
- **FAO** is a card titled "fao" (lowercased) with the English expansion "Food and Agriculture Organization" and no Turkish; ATM has a Turkish word and keeps its capitals. Abbreviations lose their case in the card title.
- **mr** (all lowercase) is "millirem: One thousandth of a rem" in English; "Mr" is correct. Lowercase "mr" is rare in running text.
- Sorry lists the interjection rows ("pardon", "efendim") before "üzgün" (the adjective); fine for the exclamation, weak for "I am sorry".

Error log: 16 entries, all `info` (the pack mirrors of en-defs, each served by jsDelivr, 163 to 964 ms per 2 MB file); no warnings or errors, including no mirror failures. Cleared and read back empty. Settings restored to the saved object and read back equal (learning en, native ja, videoOn.youtube false again).

## Measuring

```
Q=data/raw/quality/r4-tr/q
npm run data:native -- tr th id                      # rebuild the pairs the rules touch
DEFS=1 sh $Q/run.sh <label> tr th id zh pl it pt      # rebuild en-defs, measure each native
python3 -I $Q/diff.py $Q/runs/base-tr $Q/runs/<label>-tr
python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py --before $Q/runs/base-tr --after $Q/runs/<label>-tr --out $Q/packets/<tag> --tag <tag> --packets 1
python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py --key $Q/packets/<tag>/key-<tag>.json $Q/packets/<tag>/result-*.json
python3 -I $Q/prefs.py $Q/packets/<tag> <tag>        # the changed words each version won
```
