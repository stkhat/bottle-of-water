# YouTube transcript cards and their translations (studied 2026-11-15)

How well Lingo cuts YouTube captions into transcript cards and puts the right translation under each card, measured on 58 real videos, with the root causes and the fixes prototyped against them. Method: [translation-quality.md](translation-quality.md) and the `real-content-quality` skill.

## Method
- **Corpus**: 28 new videos collected in the user's Chrome for this study (study `2026-11-cards`: 6 with a manual English and a human Japanese track, 11 manual English only, 11 auto-generated; UK, Australian and US speakers; talks, documentaries, sketches, stand-up, interviews, press conferences, vlogs, a 2013 let's-play, a lyric video, two Shorts; 338 minutes), plus the 30 videos of round 2 of the 2026-11 study as a second sample. Each video has its raw json3 tracks: English, the human Japanese track if any, and YouTube's translation into Japanese (`tlang`).
- **Pipeline**: `captionCards` of `origin/main` (06b0db7) and of each prototype ran offline over every video and every translation path the extension can take: manual + human track, manual + YouTube's translation, auto-generated + YouTube's translation, and auto-generated alone (card shapes only; the browser's translator is not reproduced). A spot check of one video's transcript in the real UI matched the offline cards card for card.
- **Judging**: blind A/B by subagents over the same ~20-second windows of both versions (X/Y in random order); for every card, its boundaries (good, mid-sentence, merged, fragment, too long) and its translation (ok, partial, has a neighbour's text, misplaced, empty). 126 windows in the first round and 78 in the second (3 in 4 chosen where the versions differ), one judge per window: treat differences under about ±4 points as noise.
- Copyrighted text stays in the study folder; quotes here are short.

## Results (current build)
Judged rates per card, both samples together (new / round 2):

| Path | Cards a whole sentence | Translation matches the card |
|---|---|---|
| Manual + YouTube's translation | 74% / 61% | 79% / 69% |
| Manual + human track | 60% / 82% | 58% / 86% |
| Auto-generated + YouTube's translation | 71% / 55% | 70% / 52% |

Counted without a judge (current build):
- Manual tracks: 16–22% of cards end mid-sentence with the next card going on in lower case; with YouTube's translation, 11% of cards that hold a whole English sentence show a Japanese cut mid-sentence (YouTube spreads each translated sentence over the cues it covers, so a card cut mid-sentence gets a cut translation, sometimes mid-word: 交通 | 手段).
- Auto-generated + YouTube's translation: 4.3% of round 2's cards hold a speaker change `>>` inside them (up to 1 card in 7 on talk shows), 0.3% of the new sample's.
- One human Japanese track (`UF8uR6Z6KLc`) covers only the first two minutes: 87% of its cards show no Japanese.

## Root causes
1. **Manual cards stop at three cues or about 25 words, not at the sentence end** (`sentenceCards`). Of the cards that end mid-sentence in the new sample, 64% stopped at 25 words and 30% at three cues; sentences run to 30 words at p90 and 38–40 at p95. Some tracks cut cues by length, so sentences also end inside cues ("But is this fair? After all, …"); a card made of whole cues cannot follow them.
2. **The translation follows its own sentences, the cards do not.** YouTube translates sentence by sentence for manual tracks too, not cue by cue, so any card boundary that is not a sentence boundary splits a translated sentence at an arbitrary character.
3. **Translated sentence ends were timed at the start of the piece holding them.** For a manual track each translated piece is a whole cue, so a sentence end inside it was dated up to a cue early; with short sentences in a row (dialogue), the alignment shifted the translations by one card. Measured on 18 punctuated auto-generated tracks, the end marks land on the English word boundaries (median offset 0 ms), so dating each mark when it is said is exact there and right for cues.
4. **A speaker change is only a likely boundary in `alignAsrSentences`**: cards end only where the translation has a sentence end, so `>>` stays inside a card whenever YouTube's translation runs two speakers into one sentence (talk shows, interviews).
5. **Human tracks merge short sentences.** A translator often puts two short English sentences into one Japanese line ("They feel fear and doubt. They procrastinate." → one line). With sentence cards the line covers both cards and shows on both (rule G).
6. **Auto-generated tracks without punctuation** (older uploads, some news and Shorts): YouTube's translated sentence ends drift from the English boundaries by a few words, and inside one event YouTube places the translated pieces at a steady pace from the event's start (about 90 ms each), not over the words they translate. Time alone cannot place them.

## What was tested
| Idea | Result | Decision |
|---|---|---|
| v1: manual cues get word times spread over their characters and go through the auto-generated rules (`alignAsrSentences` with YouTube's translation, sentence rules and the 30-word cap otherwise); a speaker change always ends a card | translations cut mid-sentence 11.4 → 1.8%, `>>` inside cards 4.3 → 0%; but dialogue translations shifted by one card (cause 3) | Refined |
| v2: date each translated sentence end when it is said, not when its piece starts | manual + translation: translations too short or too long for their card 4.5 → 0.2%, cut mid-sentence 1.8 → 0.5% | Recommended |
| v3: a long sentence without a translation to follow is split by the same priors as with one (clause marks, balance), not at its largest pause; a speaker split cuts the translation only between clauses | manual + human: cards ending mid-sentence 12.9 → 8.7% | Recommended |
| v4: as v3, but a card boundary only between cues (the video keeps showing whole cues) | translation matches as in v3, but 14–20% of cards still end mid-sentence (v3: 8–10%) | Option (see Decisions) |
| v5: with a human track, two sentences a translated line covers at least half of each stay one card (up to 30 words) | the same line on two cards in a row 4.8 → 1.1%; judged translation matches 60 → 65%, preferred 16 vs 2 | Recommended |
| v6: spread each translated event's text over the event's time instead of YouTube's offsets | no change on the misaligned Short; the order inside the event is not in time | Dropped |

Judged, current build vs v3 (new / round 2):

| Path | Whole sentence | Translation matches | Windows preferred |
|---|---|---|---|
| Manual + YouTube's translation | 74 → 94% / 61 → 92% | 79 → 92% / 69 → 94% | 15 vs 5 / 14 vs 4 |
| Manual + human track (v3) | 60 → 78% / 82 → 91% | 58 → 68% / 86 → 77% | 8 vs 6 / 4 vs 3 |
| Auto-generated + YouTube's translation | 71 → 72% / 55 → 60% | 70 → 72% / 52 → 63% (misplaced 6 → 0%) | 5 vs 4 / 8 vs 2 |
| Auto-generated alone | 68 → 63% / 58 → 54% | – | 1 vs 2 / 1 vs 2 |

The human-track drop in round 2 is cause 5 (a merged Japanese line on two sentence cards); the auto-generated-alone change is within noise (6 windows each).

Second round, fresh windows from both samples:
- Manual + human track, current build vs v5 (30 windows): whole sentence 78 → 90%, translation matches 60 → 65% (empty 13% in both: mostly the partial track), preferred 16 vs 2.
- Manual + YouTube's translation, v4 vs v5 (30 windows): whole sentence 77 → 88%, translation matches 81 → 82%, preferred 9 vs 9. v5's misplaced (6%) and empty (4%) translations come from a lyric video, where a leading ♪ ("♪ When she was just small ♪") became a card of its own and shifted every translation by one, and from two speakers in one cue that YouTube translated as one sentence ("- Jay Martel. - Nice to meet you."). The ♪ case is a fix of its own: a ♪ that opens a line starts a sentence, it does not end one.

Costs measured:
- Building the cards: 4 ms per video (was 0.5 ms).
- v3 shows 21–23% of manual cues as two subtitle lines in the video (a cue whose sentence ends inside it), and lines shorter than 0.7 s go from 167 to 616 in the new sample. v4 changes nothing in the video.
- The unit tests of `src/core/subtitles` and `src/content/video` pass unchanged with v5.

## Netflix (held out, measured 2026-11-15)
The rules were frozen as decided (v7 = v4, cards only between cues, plus v5's human-track join, plus a speaker's dash line keeping its own line in the card) and run on 10 episodes collected for this check: Stranger Things, Peaky Blinders, Sex Education, Young Sheldon and Our Planet, two episodes each (seed 20261115; The Good Place could not be played and one Sex Education pick played another clip, so both were replaced), raw English (IMSC closed captions or subtitles) and Japanese (IMSC subtitles) tracks.
- Counted: cards 6,162 → 5,792; the same Japanese line on two cards in a row 4.3 → 0.1%; speech cards with no Japanese 4.3 → 4.3%. The first v7 run joined a two-speaker cue's lines with a space ("- How much? - Two hundred pounds."); keeping the dash line on its own line fixes it and is part of the step.
- Judged blind (40 windows, 30 where the versions differ): whole sentence 86 → 89%, mid-sentence 5.5 → 1.0%, merged 6.8 → 9.2%; translation matches 75 → 84%, a neighbour's text 10.7 → 1.8%; preferred 12 vs 0 (18 the same).
- v5 (cuts inside cues) on the same episodes: speech cards with no Japanese 4.3 → 11.6%, since a condensed Japanese line can only go to one part of a split cue. This confirms v4/v7 for Netflix too.

## Recommended fixes by layer
| Layer | Fix | Evidence |
|---|---|---|
| CORE | Cards are the original's sentences however the site cut its cues: a manual cue's words get times spread over its characters, and manual and auto-generated tracks go through the same sentence rules (`alignAsrSentences` with the site's translation, punctuation and the 30-word cap without it) | above |
| CORE | Each translated sentence end is dated when it is said | cause 3 |
| CORE | A speaker change (`>>`, a dash at a line start) always ends a card; the translation is cut between clauses near it, or each clause goes to the side it ends on | cause 4 |
| CORE | A long sentence is split by clause marks and balance, also without a translation | v3 |
| CORE | With a human track, sentences one translated line covers at least half of each stay one card, up to 30 words | cause 5 |
| LEARNING | Nothing new: sentence ends, clause marks and speaker marks are already per-language data (`SENTENCE_END`, `EN_STARTERS`) | – |
| NATIVE | Nothing new: the translation's sentence and clause marks (。、 / . ,) are already read per script | – |

## What a new pair needs
Nothing beyond today's: the learning language's sentence and clause punctuation (already in `SENTENCE_END` and `SPLIT_AFTER`), and the native script's sentence and clause marks for the site's translation.

## Costs and decisions for you
1. **Video subtitle lines for manual tracks.** v3/v5 cut a manual cue in two lines when a sentence ends inside it (21–23% of cues; the times of the two parts are estimated from the characters); v4 keeps every cue whole in the video but leaves 14–20% of cards ending mid-sentence. Judged against each other, v4 and v5 tie (9 vs 9): v5's better boundaries (77 → 88%) are offset by its new misplaced translations. A third way keeps whole cues in the video and sentence cards in the transcript, but a subtitle line then spans two cards, which needs `SubtitleLine` to hold several card ranges (subtitle, selection, Words tab). Recommendation: v4 now (no change in the video, the translation gains of v5), the third way later if the remaining mid-sentence cards matter. **Decided (2026-11-15): v4.**
2. **Netflix.** `captionCards` is shared, so these rules change Netflix cards too. The corpus has no raw Netflix tracks (only rendered cards), so Netflix is unmeasured; it is the held-out site. **Decided (2026-11-15): measure Netflix (raw TTML of a few episodes) before the manual-track change ships; the auto-generated step does not wait for it.**
3. **Partial human track.** A human track that covers only part of the video (one of 10 here) leaves most cards empty. Falling back to YouTube's translation when the human track covers less than half of the speech would fix it.

## Checked on the real sites (2026-11-15, check build of main e09ffe4)
In the user's Chrome, after PRs #87 and #89:
- YouTube, manual + YouTube's translation (`u1hVAhIVa-4`): the transcript matches the offline cards card for card (396); the video shows each cue whole, also where a sentence ends inside a cue (the v4 trade-off: the next card starts with the cue's tail, "movie is based on. And we were…").
- YouTube, auto-generated + translation (`LT5Y8DUfQt4`): no card holds `>>` inside it (723 cards); `>> [laughter]` and `>> Live singing…?` are separate cards, the label card without Japanese.
- YouTube, human track (`fxbCHn6gE3U`): sentence cards with their human lines.
- Netflix (Peaky Blinders S1E4): a two-speaker cue stays one card ("- How much? - Two hundred pounds." / 金額は？２００ポンド); the transcript shows its line break as a space, as before.
- Error logs on YouTube and Netflix: empty, cleared.
- Found on the way, not caused by these steps: some YouTube manual tracks carry `<i>…</i>` in the caption text, and Lingo shows the tags literally in the card and the subtitle ("this <i>Craigslist</i> ad"); YouTube itself renders them as italics. **Fixed** (PR #90): the json3 parser drops tags whose name starts with a letter; English cards with a tag 21 → 0, translations 4 → 0, every other card unchanged. Sound labels in auto-generated tracks get word highlights ("[applause]" as New).

## Still open
- Auto-generated tracks without punctuation and fast Shorts (cause 6): about 1 card in 4 has part of a neighbour's translation or misses part of its own. Time cannot fix it; a lexical anchor (dictionary or loanword matches between the English and the translation) might.
- Older auto-generated tracks: YouTube refused `tlang` for two 2011–2013 videos in every try (HTTP 429 on that request only); not studied what the extension shows then.

## Suggested order
1. CORE: date translated sentence ends when said, speaker changes always end a card (small, auto-generated tracks only; `>>` inside cards 4.3 → 0%). **Done** (PR #87, 2026-11-15): auto-generated + YouTube's translation, new / round 2: `>>` inside cards 0.3 → 0% / 4.3 → 0%; cards with no Japanese 0.1 → 0.2% / 0 → 2.1% (of round 2's 91, 62 are sound labels before a `>>`, 29 speech whose translated clause YouTube put after the change); other paths card for card unchanged. Translated end marks right on an English sentence boundary 11.5 → 34.3% (18 punctuated tracks, median distance 336 → 153 ms; p90 1.13 → 1.24 s). Of 30 changed places read by hand, 14 better, 7 same, 9 worse: a clause on the wrong side of a `>>` (Japanese word order, or a 「[笑い]」 label opening the clause said at the change), a few late-dated ends shifting translations by one card, and boundaries moved by a word in unpunctuated tracks. Possible follow-up: a bracketed label in the translation as a clause of its own.
2. CORE: manual tracks through the sentence rules, with the line decision (1 above), the human-track join (v5), a ♪ that opens a line starting a sentence, and a speaker's dash line kept on its own line in the card. Netflix measured (section above): ready to ship as v7. **Done** (PR #89, 2026-11-15), main → PR, new / round 2: manual + YouTube's translation, translations cut mid-sentence 11.4 → 0.4% / 11.5 → 0.1%, cards ending mid-sentence 16.4 → 14.3% / 22.0 → 19.7%; manual + human track, cards ending mid-sentence 19.9 → 13.0% / 17.2 → 10.5%, same line on two cards 2.9 → 1.3%; Netflix (10 episodes) same line on two cards 264 → 6 places, cards ending mid-sentence 1.1 → 0.2%, speech cards with no Japanese unchanged (167). Subtitle lines in the video equal the cues on every manual path; auto-generated paths card for card unchanged. Beyond v7: YouTube's translation of a manual track keeps the English line breaks, which v7 had turned into spaces inside Japanese ("…セリフ で、"); the lines of a translated piece are now joined with the translation's joiner (cards with such a space 528 → 2 / 396 → 6). Of 30 changed places read by hand, 24 better, 4 same, 2 worse (a clause of a human translation on the wrong card after a split at a comma; a label cue written with dashes, "-[gasping] -[laughter]", that `isSoundLabel` does not see as a label, joined with speech). Not judged blind; not checked on the real sites yet.
3. Fallback for a partial human track.

## Measuring
Study folder `data/raw/quality/2026-11-cards/` (git-ignored): `corpus/` (28 videos and `manifest.json`), `runs/<version>-<sample>.jsonl` (cards per path), `proto/` (versions `base`, `v1`–`v6` as source trees, `cards-run.ts`, `cards-metrics.py`, `split-reasons.ts`, `line-cost.ts`, `card-packets.py`, `card-tally.py`), `packets/` (packets, keys, `RUBRIC-cards.txt`, results).
