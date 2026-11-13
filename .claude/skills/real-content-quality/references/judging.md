# Blind judging

Judging is done by subagents, one packet each, about 100–150 items per packet. A judge reads only the rubric and its packet and writes its verdicts as JSON with a short script. Keep the packets, the key that maps X/Y back to versions, and the results in the study's `packets/` (`data/raw/quality/<study>/`, git-ignored). `scripts/ab-packets.py` builds words and units packets, the key and `RUBRIC.txt` from two `measure.ts` runs; `scripts/ab-tally.py` reads the results back (SKILL.md, Phase 3).

## Packets

- **Words**: an English word, its sentence, and two hover displays X and Y. Each display is written `<dictionary key> — <meaning lines>`, `<word> — (name)` or `<word> — (no meaning)`.
- **Units**: a card or paragraph `text`, and two lists of detected phrases X and Y. Each phrase is written `<surface> [<key>] — <meaning shown>`.
- **Senses** (for sense-choice questions): a word, its sentence, and the entry's short meanings in random order.
- Randomise which version is X per item. Write the key to a separate file the judge never sees.
- Sampling: take the changed items plus a share of the unchanged ones. Re-weight the rates to the corpus afterwards.

## Rubric (words and units)

> You judge two versions (X and Y, in random order) of what a language-learning browser extension shows Japanese learners of English. Do not try to guess which version is which; judge each on its own. Do not read any file other than your packet and this rubric.
>
> PART 1 — "words": for each of X and Y give a verdict:
> - good: the meaning shown is the one the word has in this sentence and a learner can read it at a glance
> - acceptable: the right meaning is there but not first, or is a bare pointer (e.g. "goの過去"), or is overly long, or slightly off
> - wrong: a different sense of the word
> - misleading: unrelated or harmful (a name given a common-noun meaning, a common word wrongly called a name, an interjection given a noun meaning)
>
> Then pref: "X", "Y" or "same" (which one helps the learner more here).
>
> PART 2 — "units": for every phrase in each list give a label and fits (does the meaning shown fit this context):
> - "useful": a real idiom, phrasal verb or fixed expression worth highlighting here
> - "low-value": literal, compositional, a name, or so obvious it adds nothing
> - "wrong-match": those words do not form that expression here
>
> Then list `missed`: expressions in the text that a Japanese intermediate learner would benefit from seeing as one unit and that appear in NEITHER list, each with value "high" (meaning not guessable) or "medium" (common chunk). Then pref "X"/"Y"/"same" for the unit's phrase highlighting overall: consider usefulness and noise, since a learner sees every highlight.
>
> OUTPUT: JSON `{"words":[{"id","X","Y","pref"}], "units":[{"id","X":[{"phrase","label","fits"}],"Y":[…],"missed":[{"expr","value"}],"pref"}]}`. Cover every item. Keep your final message to 5 lines (counts only).

## Rubric (senses)

> For each item give `fit`: the numbers of every listed meaning that is the meaning the word has in THIS sentence (include slightly broad or narrow ones; exclude other senses, other parts of speech, or misleading ones), and `best`: the single best number or null. Judge each item yourself, with no keyword heuristics.

This gives hit@k: whether a fitting sense is among the first k shown. That is how "up to three senses in the hover" was decided (60 / 74 / 81 / 86% for k = 1–4).

## Reading the results

- Report each rate per site (YouTube, articles, Netflix), not just pooled.
- Report preferences only on changed items, e.g. "changed hovers preferred 275 vs 52".
- Report phrases as useful / low-value / wrong-match counts, together with highlights per 1,000 tokens.
- Treat differences under ±4 points as noise (one judge per item).
- A rule tuned on a sample is confirmed only on a fresh sample, or on the held-out site.
