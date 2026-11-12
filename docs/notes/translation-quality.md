# Translation quality on real content (measured 2026-11-13)

How good are the meanings, phrases and translations Lingo shows on real YouTube videos, Netflix episodes and news articles, and what should change. Learning language English, native language Japanese, default settings (known level 3000, nothing saved).

## Method
- **Corpus** (about 48,500 word tokens), collected in the user's Chrome with the check build:
  - YouTube, 10 videos: TED talk (Tim Urban, manual en + ja), BBC World Service explainer, Late Show interview (Steve Carell), Kurzgesagt, Joshua Weissman cooking (24 min), teen school vlog (ASR only), SNL sketch, Obama on the WTF podcast (ASR, 67 min), Crash Course World History, MKBHD headphone review (manual en + ja). Captions came from the player's own timedtext request, re-fetched for `en`, `ja` and `tlang=ja` (see [youtube-captions.md](youtube-captions.md)). Two videos have a human Japanese track; the other eight get YouTube's auto-translation, which is what Lingo shows there.
  - Netflix, Friends, 5 episodes picked at random (seeded): S1E5, S2E10, S2E22, S4E21, S9E21. Cards (English + aligned Japanese track) were read from the check build's open-shadow transcript, i.e. exactly what Lingo shows. Three episodes have ALL-CAPS closed captions.
  - Articles, 10: BBC (teen therapy-speak, UK economy, new frog species), AP (prostate screening, college football penalty, Hera asteroid probe), Guardian (Chinese battery-swapping e-trucks, Manchester United, Judy Collins interview), NPR (home sales). Title + body paragraphs, boilerplate removed.
  - Copyrighted text stays out of the repo; this note quotes only short fragments.
- **Pipeline**: the corpus was run offline through Lingo's own code (`createLanguagePack` + `createClassifier` + `createEnJaDictionary`, `captionCards` for video cards), giving every span's key, category, hover meaning (`entry.short`) and source. Spot checks in the real UI (article highlights on NPR; hover cards on Friends: *both*, *psyched*, *back*) matched the offline output. The check build's error log was empty at the end.
- **Judging**: Claude judged stratified samples against the sentence: 480 word hovers (per site 100 New + 60 Known), 185 cards/paragraphs for phrase recall and precision, all 471 detected phrase keys, 272 machine-translated definitions and 100 subtitle lines. The on-device translator (Chrome Translator API, en→ja) and the on-device language model (Prompt API) were run in the user's Chrome 157. One judge, no second rater: treat counts as ±5 points.

## Results at a glance
| | YouTube | Netflix | Articles |
|---|---|---|---|
| Word hover: good / acceptable | 59% / 21% | 57% / 21% | 46% / 20% |
| Word hover: wrong or misleading | 21% | 22% | **34%** |
| Right sense present in the dictionary window, when the hover is not good | 42 of 66 | 37 of 69 | 56 of 86 |
| Tokens with no hover at all (besides "I", "a") | 2.4% | 3.4% | 5.3% |
| Phrase spans per 1,000 tokens | 18 | 17 | 18 |
| Detected phrases judged useful (sample) | 9 of 15 | 7 of 12 | 16 of 31 |
| Expressions a learner needs that were missed (sample) | 76 (19 high-value) | 44 (15) | 65 (14) |
| Phrase meanings that come from an English definition + MT | 55% | 47% | 68% |
| Cards without a Japanese line (spoken lines) | 1.5% | **28%** | – |

## 1. Is the meaning shown right for the context?
About a quarter of hovers (123 of 480) show a wrong or misleading meaning, a fifth more are only "acceptable". Causes of the 221 not-good hovers (20 "other", mostly bare pointers, and 3 slang are not in the table):

| cause | count | examples (shown → right here) |
|---|---|---|
| First sense isn't the one used | 78 | fine "will be fine" → 罰金; battery → 砲兵中隊; fleet → 艦隊; hike "rate hike" → ハイキングする; breakthrough → 敵陣突破; miss "what did I miss" → 未婚婦人; just → 正しい (277 hovers in the corpus); please → 喜ばせる |
| Dictionary gap (no right sense) | 31 | gaslighting → ガス灯; trolled → 輪唱する; plunge (stocks) → 突っ込む; floss → まゆのけば; ew → enlisted woman; bye → 二の次の事 |
| Wrong part of speech | 30 | decline (noun) → …を断る; strain (noun) → 引っ張る; trapped → わな; my "oh my" → 私の |
| Inflected form is its own headword | 16 | decided → 明白な; used → 使い古しの; wearing → 疲労させる; supposed → 想像上の; greater → 郊外を含んでいる; psyched → 心理的にまいらせる; plus bare pointers (was → beの…過去形) |
| Proper noun given a common meaning | 17 | Amazon → ギリシア神話の女武者; Freeman → 自由民; Twain → 二つ; China → 磁器; OXFORD (dateline) → 短靴; AP → antipersonnel; Mark, Bobby → 跡, 巡査 |
| Part of an undetected phrase | 18 | kind "kind of" → 親切な; right "right now" → 右の; maintenance "high-maintenance" |
| Long dumps | 8 | of, so, have, can, should: 100–300 characters (4.6% of all word hovers are over 50 characters) |

Mechanisms behind these (code):
- The hover is always `entry.short`, EJDict's first sense, chosen at build time; the sentence is never used.
- A word's key is `bases[0]`, which is the surface form when it is itself an EJDict headword, so *decided*, *used*, *left*, *found* show the derived adjective/noun entry or a "…の過去" pointer instead of the verb.
- Names are only ignored when EJDict lacks them; captions in ALL CAPS and lower-case ASR make capitalisation useless as a signal.

## 2. Phrase detection
- **Precision**: of 58 detected phrases in the samples, 32 useful, 18 low value, 8 wrong matches. Wrong matches come from noun + particle: *trucks in* China → "truck in", *punch in* the gut → "punch in" (clock in), *staff up*, *add oil*, *over medium*, *lay for*, *says the words* → "say the word". Low value: proper names and transparent compounds from EJDict (American Revolution, New York → ニューヨーク州, high school, home office, slave trade) and literal uses (talk about ×40 in the corpus).
- **Recall is low**: 185 missed expressions in 185 sampled units, 48 of them high value. The misses are mostly conversational chunks, which carry the meaning in talks, podcasts and sitcoms: *you know* (×9 in the YouTube sample), *I mean*, *kind of*, *sort of*, *pretty much*, *good for you*, *my goodness*, *for God's sake*, *think less of*, *put our heads together*, *sleep with*; separated phrasal verbs (*break them up*); and news collocations (*in turn*, *took shape*, *go unnoticed*, *a punch in the gut*, *caters to*). 174 of the 185 are not in the phrase data at all: the build drops kaikki entries made only of common words (section 6, B), so they cannot even be matched by selecting them.
- **Phrase meanings are often the wrong sense**:
  - Wiktionary-ja gives the first translation-table word: break up → 壊れる (Friends: 別れる), shut up → 封鎖する, hang up → 掛ける, go over → 眇める, write down → 値引きする, check out → 試験する, go out → 出る.
  - EJDict / en-defs first senses: number one → 本人自身, at home → 家庭への気軽な招待, die hard → 頑固な保守主義者, talk about → "Used to draw attention to the speaker's characterization…", end up → "To bring to a conclusion", what's going on → "An informal greeting", knock on → a rugby foul, get it in → "to have sex".
  - Of 272 phrases shown through an English definition, the definition fits the sentence in 55%; 26% are the wrong sense and 19% are wrong matches.

## 3. Coverage: words with no meaning
All non-ignored tokens have an entry (EJDict covers the whole vocabulary). The tokens with no hover (2.4–5.3%) are:
- **Names** (the largest group): Ross, Rachel, Joey, Stephen, Wang, Napoleon… Leaving them without a hover is right; the problem is the names that *do* get a hover (section 1).
- **Interjections and fillers**: um (94), ooh, hmm, mm, ew (gets a wrong one), uh.
- **Informal spellings**: cuz, wanna, kinda, ya, anymore.
- **Modern and technical words** not in EJDict: app(s), website, emails, meetup, YouTube, Google, AI, USB, TikTok, chemo, cisplatin, testicular, intramuscular, umami, procrastinator(s).
- **Splits**: hyphen prefixes (non-, multi-), "Realtor.com", roman numerals (XVI, II), drop caps ("E" + "very" on the Guardian).
All of these come from one root cause, a vocabulary made of EJDict headwords only (section 6, E). Names should stay unhighlighted but could show "(name)".

## 4. Machine translation
- **Definitions** (272 phrases, Chrome Translator): good 111, awkward 129, wrong 24, empty 8 ("Synonym of X" cleaned to nothing). Only 51 are both the right sense and a good translation; 101 of the 111 unhelpful ones fail because of the definition, not the MT. MT-side issues: "To X" becomes a purpose clause (…ために, 17 cases), synonym lists come back duplicated (集まる、集まる), 35 are over 30 characters.
- **Subtitle lines** (adequacy 1–5): YouTube auto-translation (tlang) 4.2 (TED 4.0, tech 4.4) vs Chrome Translator 3.3 (TED 3.0, tech 3.2, Friends 3.5). Keep the current order (site track → tlang → built-in). Chrome MT fails on fragments of a sentence, names and titles ("Wait But Why" → なぜですか), slang ("What'd I miss" → 何が恋しかったの), ALL-CAPS input (3.15 vs 3.75 on mixed case), ♪ lines (garbage quotes), and stays in です/ます in casual dialogue. Adding the previous line as context helped 0 of 29 lines and made 4 worse.
- **Phrase selected by the user, translated literally**: 15 of 30 common idioms come out literally wrong (under the weather → 天気の下で, hang in there → そこにぶら下がってください, hook up → フックアップします).
- **Site translations**: on Netflix, 28% of spoken cards have no Japanese line and about 12% show a neighbour card's line: Japanese subtitles are condensed and re-cut, and `alignByOverlap` gives each Japanese cue to one card only. YouTube tlang lines spill into the next card on ~20% of lines (12 of 59).

## 5. Context-aware sense choice: what was tried
- **Matching glosses against the card's Japanese line** (human track or tlang): of 282 hovers with a Japanese line, it would fix about 7 and break about 7. Not worth it.
- **On-device language model** (Chrome Prompt API, Gemini Nano, available in Chrome 157 pages and extensions): for each sampled word with 2+ senses, the model got the sentence and the first 4 senses and returned a number. Median 0.47 s per word.
  It changed the sense on 266 of 374 words (71%). Where the first sense was wrong or misleading (93), its pick was right for 35 and close for 17; where the first sense was good or acceptable (173), it broke 44 and made 59 only close. Overall about 72% of hovers would fit (right or close) against 70% today: no net gain. Its mistakes: rare usage labels for function words (an → ampere), the wrong entity for names (Shania Twain → Mark Twain), and senses that match the topic rather than the sentence (oil in a recipe → petroleum).
  Conclusion: a small model asked to pick freely is not reliable enough to replace the first sense; it is useful only inside a narrower question (section 6, A4).

## 6. Root causes and general fixes
Each fix below is a rule or a data source that applies to every word, phrase and page (and to other language pairs through the same parts), not a list of hand-fixed entries. Hand-curated overrides (a reviewed meaning for the top N words, an allowlist of chunks) were considered and left out: they fix the sampled cases but not the long tail, and every new language pair would need its own.

### A. Choose the sense from the sentence (words and phrases alike)
Root cause: the hover is one string fixed at build time (`short`, the first sense), and a word's key is its surface form when that is a headword. Causes "first sense", "wrong part of speech", "inflected headword", "too long" and most wrong phrase meanings (about 60% of all bad hovers).
1. **Base form before derived headword.** When a token has more than one base (`lemmas`), look up the base whose part of speech fits the sentence; a surface entry that is only a pointer ("…の過去", "=yes") is followed to its target. Generic over the lemma and POS data; fixes decided, used, wearing, left, was/had pointers.
2. **Part-of-speech tagging in the language pack.** A small tagger per language (a `LanguagePack` part, so it stays browser-neutral) tags each sentence once. Senses already carry a POS (EJDict via `pos.json`/`inferPos`, Wiktionary senses natively), so the hover shows the first sense *of the tagged POS*. The same tag also gates phrase matching (B3).
3. **Short line per part of speech, built by rule.** Store the first sense of each POS (cut at the first sense separator, capped length) instead of one `short`; the hover picks by tag. Removes the 100–300-character dumps without touching any entry by hand.
4. **On-device model where the browser has one** (feature-detected; Chrome's Prompt API today, nothing in Firefox): rank the senses of the hovered term against the sentence, falling back to 1–3. Tested in section 5: asked freely, Gemini Nano fixes and breaks about as many as it improves, so use it only for a narrower question — among the senses of the tagged part of speech, and only to override when it is confident (for example, when asking "does sense 1 fit? yes/no" first returns no).

### B. Phrase data and detection
Root cause of low recall: the build drops kaikki entries whose words are all common (`isPhraseSense` with `IDIOM_COMMON_RANK` = 100 and `PHRASE_COMMON_RANK` = 1000). Of the 185 missed expressions, 174 are not in the phrase data at all, including *you know*, *sort of*, *pretty much*, *in turn*, *take shape*, *instead of*, *all right*, *in a way*, *think less of*, *good for you*; they cannot even be matched by selecting them. The noise problem PR #28 fought (come to, live in) is real, but the cure was applied to the data instead of to the highlighting.
1. **Import every multi-word entry** (idioms, phrasal verbs, phrases, prepositional phrases, interjections, multi-word nouns), regardless of word rank. All of them stay matchable when the user selects or saves them.
2. **Decide what to auto-highlight by a computed idiomaticity score**, not by word rank: source tags (idiomatic, phrasal verb, interjection, "set phrase"), and a compositionality test done at build time — does the phrase's gloss share its content with its words' own glosses? (*live in* = 住む ≈ live = 住む → literal; *break up* = 別れる vs break/up → idiomatic; *sort of* = ある程度 vs sort = 種類 → idiomatic). Optionally weight by how frequent the phrase is in a subtitle n-gram list. This replaces `isCommonPair` and lets the same rule work for Spanish and future packs.
3. **Grammar check on matches** using the tagger from A2: a phrasal-verb pattern needs its first word tagged as a verb; a pattern whose particle starts the following noun phrase is not a phrasal verb. Drops *trucks in*, *punch in* (the gut), *staff up*, *add oil*, *over medium*, *link in* — the 19% wrong matches among MT-defined phrases.
4. **Named entities are not highlighted as phrases** (American Revolution, New York, Catholic Church): entries that are proper nouns in the source, or capitalised throughout, stay available for lookup but not for auto-highlighting.

### C. Phrase meanings
1. Show several senses with their English hints for translation-table sources (as `createPairDictionary` already does for es/pt) instead of the first word, and let A2/A4 pick among them.
2. Rank English-definition senses by their labels from the source: demote usage notes ("Used to…"), vulgar, archaic, sports and other domain-labelled senses; resolve "Synonym of X" to X's entry. Generic over all en-defs entries.

### D. Names
Root cause: EJDict includes many names and place names as common words, and casing is unreliable (ALL-CAPS captions, lower-case ASR).
- Add a proper-noun lexicon as a pack part (kaikki's proper-noun entries: given names, surnames, places, organisations).
- Per document, learn casing: a word seen capitalised mid-sentence in mixed-case text of the same page or video is a name there; in ALL-CAPS text rely on the lexicon. A run of capitalised words that is not a dictionary phrase is one name.
- A token judged a name shows "(name)" (or nothing) instead of a common-noun meaning.

### E. Coverage
Root cause: the vocabulary is EJDict's headwords only. Use every English kaikki headword with a definition as the vocabulary (meanings for words EJDict lacks come from the English definition translated at display time, exactly like phrases today). This covers modern and technical words (app, website, meetup, troll, gaslighting, chemo), interjections (um, ew, ooh, hmm) and informal spellings (wanna, cuz, kinda), which kaikki lists with their POS. Split handling (hyphen prefixes, `example.com`, drop caps) is a tokenizer rule.

### F. Machine translation
1. **Normalise every input by rule**: sentence-case ALL-CAPS lines, split "- A. - B." speaker turns, strip ♪ and [sound] labels, drop a definition's leading "To " and labels. **Post-process by rule**: trim purpose endings (ために／するには) produced from infinitives, remove repeated items, cap the hover length.
2. **Translate sentences, not cards**: when the built-in translator is the source, translate the whole sentence the card belongs to and show the part for the card (as YouTube's tlang already does), instead of fragments. Do not add the previous line as context (tested: no gain).
3. **Label literal translations** of user-selected phrases as literal, or show the sentence translation with the phrase marked, since half of idioms come out word for word.

### G. Site translation alignment
Root cause: `alignByOverlap` gives each translation cue to exactly one card, so a condensed Japanese line that spans two English cards leaves the second empty (Netflix: 28% of spoken cards). Align many-to-many: a cue is shown on every card it overlaps substantially (later ones dimmed), or cards are joined to the translation's segmentation, as `alignAsrSentences` already does for YouTube ASR. Cards with no overlapping cue at all can fall back to the built-in translator, marked.

### Suggested order
A1 and B3/D (small, deterministic) → B1–B2 (data rebuild; biggest gain in recall) → A2–A3 and C (tagger + per-POS short lines) → E, F, G → A4 (Chrome-only enhancement, natural fit for phase 3's "Ask AI").

### Measuring
Keep this evaluation repeatable: the offline run over a fixed corpus (the scripts in this session were throwaway) could become `npm run eval:quality` over freely licensed text plus the existing caption fixtures, reporting hover coverage, phrase counts and the gate numbers, so each fix above is checked against the same baseline.
