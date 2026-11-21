# Language cycles

The log of the weekly language cycle ([skill](../../.claude/skills/language-cycle/SKILL.md), [development](../development.md) "Language quality cycle"). Newest cycle first. Data for each cycle is in `data/raw/quality/cycles/<cycle>/` (git-ignored).

## Current
- State: idle
- Last cycle: c000 (2026-11-22, baseline `bda1bda`); last sweep: `cycles/c000/base`
- Next: c001 (normal cycle). Next tidy-up: c002 (every third cycle: c002, c005, …), or earlier when the inventory grows ≥ 15% over c000's or a pair is added
- Level rotation: c001 runs `es` also at level 1000; then `fr` 8000, `de` 1000, `en` 8000, …
- Corpus refresh: due at c004 (corpora as of 2026-11: `en` 2026-11 round 2, `es`, `fr`, `de` from their L1/L2 studies)

## Queue
Causes found and not yet fixed, by layer, with evidence. A cycle picks from here and from its own findings.

Ranked; c001 picks from the top unless its own sweep shows a WORSE flag.

**LEARNING/CORE (en; ≥ 3 natives on the same words)**
1. **Hover senses ignore the token's part of speech.** `looming` → loom (weaving), `netted` → net (fishing net), `checked` → cheque, `still` (adverb) → a photo still, `centred` (verb) → centre (noun), `slash` → the punctuation, `dip` → dunk, `stirring` → stir a liquid, `won` → the Korean currency: 12–14 natives each. In `en-es` rows, 4,610 of 14,714 New words (31%) have no POS (1,110 of them inflected forms such as `looming`, `netted`, `gathered`), and where a POS is known the senses are still in dictionary order (`use`, `act`, `checked` tagged verb show noun senses first). Cause: sense order does not follow the tagged POS, and the tagger leaves inflected forms untagged. One rule in the hover builder, all 14 English natives.
2. **Acronyms and capitalised names looked up as common words.** `CAT` (Climate Action Tracker) → cat, `Stack Overflow` → stack + overflow, `Python` → the snake, `Prime Minister` → prime + minister (priest): 12–14 natives each. 615 all-caps New words in `en-es`. Cause: an all-caps token with no all-caps entry falls back to its lowercase entry; a mid-sentence run of capitalised words with no phrase entry is split into words. `US` → EE. UU. and `UN` → ONU work because those entries exist, so the rule is "all-caps or mid-sentence capitalised run without its own entry → name", not a list.
3. **Missed expressions.** The biggest mechanism (126 findings, all 18 pairs): `missing out`, `ice pack`, `centred on`, `feel like` (sense), German split verbs `davon ausgehen`, `zur Welt kommen`, `für verrückt halten`, `auf … aufmerksam machen`. Cause to confirm: inflected and separated phrasal verbs are not matched, and some phrases are not in the pack. Measure match rate per form first.
4. **Translated phrase senses: one wrong sense only.** `go back to` → "To stem from" (14 natives), `here we go` → frustration (14), `heat up` → an English gloss. Cause: en-defs keeps a rare sense as the only one for some phrases. Phrase-sense ordering in the en-defs build.
5. **Missing entries for informal and tech words.** `PJs`, `backend` are `ignored` (no entry); `gotta` has an entry but is Known and not highlighted (12–14 natives). Learning-data coverage (slang/clipped forms, tech vocabulary).
6. **Phrase precision.** `by the way` matched in "a career by the way that…" across a caption line break (13 natives); `give me` highlighted as a phrase (14). Phrase matches across a line break, and very easy phrases highlighted.

**NATIVE/PAIR (hot spots, ≥ 2× the other natives' median)**
- `en-id` wrong-meaning 1.76 vs 0.79 per unit: nouns for verbs (`forcing` → daya, `awarded` → anugerah), `Atlantic` → the atlas vertebra, `Barely` → hanya. Mostly cause 1 plus thin en-id senses; recheck after 1.
- `en-it`, `en-ru`, `en-fr` unreadable 0.26–0.29 vs 0.10: long English definitions translated at display (`takedown`, `wrestled`, `neighbourhoods`, `contained`) where a one-word gloss exists. Short-line choice for the en-defs fallback.
- `en-de` noise-highlight 0.26 vs 0.12; `en-ja`, `en-pt`, `en-ru` wrong-split 0.12 vs 0.05 (small; look after 6).

**de-fr / de-en (one learning language, two natives)**
- Separable verbs shown with the wrong sense or as the noun: `lehnte … ab` → "appuyer", `stufte … zurück` → "accusatif pluriel de Stufe", `auftrat`, `geladen` (invited). `daß` (old spelling) and `Komparserie`, `pauschal` have no entry. Cause 3 for German plus German lemma coverage.

## c000 — 2026-11-22 (baseline and dry run)

Main at `bda1bda`. Sweep only, no fixes: the baseline every later cycle compares with, and a dry run of the simulation.

### Sweep
Level 3000. `translated at display`: hovers that exist only as an English definition, translated by the browser at display time. Same-commit sweeps give identical rows (0 changed of 157,212 in en-ja); timing moved by up to +150% between two sweeps of the same commit, so timing is compared with `timing-ab.ts`, never across days.

| pair | tokens | unknown % | New /1k | phrases /1k | no entry | translated at display | over cap | ms/1k | dictionary load ms | packs MB |
|---|---|---|---|---|---|---|---|---|---|---|
| de-en | 70,944 | 6.73 | 124 | 5.1 | 4 | 0 | 9 | 12.74 | 43 | 6.8 |
| de-fr | 70,944 | 6.73 | 124 | 5.1 | 4 | 971 | 27 | 13.09 | 85 | 11.0 |
| en-ja | 171,625 | 1.97 | 86.8 | 27.2 | 0 | 3,132 | 328 | 10.92 | 236 | 38.1 |
| en-es | 171,625 | 1.97 | 85.7 | 27.1 | 118 | 2,611 | 269 | 10.17 | 240 | 35.0 |
| en-pt | 171,625 | 1.97 | 85.9 | 27.1 | 65 | 4,355 | 237 | 16.92 | 291 | 33.0 |
| en-ru | 171,625 | 1.97 | 87 | 27.1 | 48 | 3,142 | 257 | 17.86 | 370 | 37.3 |
| en-fr | 171,625 | 1.97 | 85.9 | 27.1 | 30 | 2,314 | 296 | 14.96 | 401 | 36.2 |
| en-de | 171,625 | 1.97 | 85.6 | 27.2 | 59 | 3,206 | 245 | 10.24 | 246 | 36.7 |
| en-zh | 171,625 | 1.97 | 87 | 27.1 | 63 | 4,788 | 1 | 11.15 | 308 | 35.6 |
| en-it | 171,625 | 1.97 | 85.6 | 27.1 | 60 | 2,393 | 33 | 10.21 | 226 | 35.3 |
| en-pl | 171,625 | 1.97 | 86.1 | 27.2 | 33 | 1,091 | 314 | 10.78 | 238 | 35.1 |
| en-th | 171,625 | 1.97 | 86.6 | 27.1 | 111 | 4,104 | 0 | 9.9 | 236 | 35.5 |
| en-hi | 171,625 | 1.97 | 86.6 | 27.1 | 103 | 16,360 | 0 | 13.66 | 229 | 31.3 |
| en-ar | 171,625 | 1.97 | 86.7 | 27.1 | 82 | 6,537 | 6 | 19.11 | 359 | 33.1 |
| en-id | 171,625 | 1.97 | 85.3 | 27.1 | 230 | 6,431 | 4 | 21.14 | 399 | 32.5 |
| en-tr | 171,625 | 1.97 | 85.8 | 27.1 | 98 | 6,017 | 81 | 15.9 | 317 | 31.9 |
| es-en | 72,835 | 3.02 | 85.3 | 13.3 | 0 | 0 | 2 | 11.44 | 70 | 7.9 |
| fr-en | 82,121 | 3.54 | 84.8 | 24.6 | 0 | 0 | 2 | 8.64 | 46 | 6.1 |

### Simulation
Seed 0, level 3000, 42 units per pair (the same stretches for every native of a learning language), one Sonnet learner per pair: 1,090 findings, 104 clusters reported by ≥ 3 natives, 8 pair hot spots (`cycles/c000/sim/tally.md`). Units understood: 27–38 of 42 (lowest `en-hi` 27, `en-ar`/`en-id`/`en-th`/`en-tr` 29; highest `en-pt` 38). Every top cluster was checked against `en-es` rows; all were real. The triage is the Queue above: no fixes in c000 (dry run).

Dry-run lessons, now in the skill: subagents can write only inside the session's worktree, so the sim folder is a real folder there; display-translated meanings appear in English in the packet, so "unreadable" means long, not untranslated.

### Rule inventory (c000)
`rule-inventory.ts` at `bda1bda`: 18 branches on a language code (mostly `lang_code !== "en"` filters in the data scripts and `zh` script variants), 4 per-language tables (NATIVE_LANGUAGES 15 entries / 11 fields, RECIPES 13 / 6, the test packs, LEARNING_RECIPES) with 6 one-off fields and 12 same-value fields, 21 language-named files (4,243 lines), 1,874 lines of `*-quality.md` notes, and 24 study scripts repeated across study folders (`diff.py`, `packets.py`, `base_packets.py`, `base_tally.py`, `bysource.py`, `packdiff.py`, `lines.ts`, `variants.sh` in each of the round-4 natives' studies). Inventory JSON: `cycles/c000/inventory.json`.
