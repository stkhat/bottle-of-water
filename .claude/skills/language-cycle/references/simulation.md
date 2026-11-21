# Learner simulation

## What a packet is
`sim-packets.py` picks, per learning language, 6 documents spread over YouTube, Netflix and articles and 7 consecutive cards or paragraphs from each (42 units), seeded by the cycle number. Every pair of that learning language gets the same units, rendered with its own rows:
- `NEW "word" → meaning`: a highlighted word and its hover lines (what the hover card shows);
- `PHRASE "words" → meaning`: a phrase highlight;
- `not highlighted, hoverable`: known words of rank ≥ 1,000 (a learner at the level may still not know them) with their hovers;
- `NO MEANING`: tokens outside the vocabulary (no hover at all);
- `treated as names`: tokens shown as names (no highlight);
- `[shown machine-translated from English]`: a meaning that exists only as an English definition, translated by the browser at display time;
- the subtitle line, when the corpus has the site's translation into that native.

The key file maps packet ids (U3, w12, p1) back to rows (doc, unit, start, key, part of speech, pack file, hoverKind), so findings can be checked against `rows.jsonl` and clustered by mechanism.

## Limits (not findings)
- Meanings translated at display time are shown in English: the learner judges their content, not the translation.
- Subtitle lines exist only for the corpus's own native (ja for English, en for Spanish, French and German); other natives see "not available here".
- Hover-card layout, Details, the dictionary window, saving and speed are not in the packet. Speed comes from the sweep (`timing.json`, `timing-ab.ts`); layout from the real-site check.

## Findings
`BRIEF.txt` (written by `sim-packets.py`; the brief text lives in the script) lists the kinds: wrong-meaning, misleading, missing-hover, noise-highlight, missed-expression, wrong-name, unreadable, untranslated, wrong-split, other; severity 3 (misunderstood) / 2 (real effort) / 1 (annoyance). One session line per pair: units read, understood, expressions the learner would save, an overall note.

## Reading the tally
- **Same words, several natives**: the strongest signal. ≥ 3 natives on the same words → LEARNING/CORE (tagger, phrase detection, vocabulary, names, sense order, short lines). One native → that native's data or rules.
- **Mechanisms**: kind × hoverKind × pack file × POS. A big `wrong-meaning / dict / defs / verb` cluster is a sense-choice rule; `unreadable / translated / defs` is the English-definition fallback; `noise-highlight / - / phrase` is phrase precision.
- **Pair hot spots**: a pair whose weight per unit for a kind is ≥ 2× its learning language's median. Look for a source or recipe difference first.
- Sonnet over-reports subjective things (a meaning "could be more natural"). Weight severity 1 findings low; confirm any cluster in the rows before picking it.

## Personas
Level 3000 is the default (the extension's default known-word level). Each cycle one learning language also runs at 1000 or 8000 in rotation, because density and sense choice look different to a beginner and to an advanced learner. Record the rotation in the log.
