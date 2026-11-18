# Native-language quality: English → Spanish and Portuguese (2026-11-18)

What learners of English whose native language is Spanish (52M learners) or Portuguese (25M) see on real content, which of the English → Japanese rules ([translation-quality.md](translation-quality.md)) have no native or pair counterpart yet, and what the next native languages (ru, fr, de, zh, it, pl) need. Learning language English, default settings (known level 3000, nothing saved). The learning side (tagger, phrase detection, names by casing) is the same for every native language; this study is about the native side: the pair dictionary, its short lines, its pointers, capitalised meanings and display-time translation.

## Method
- **Corpus**: the 2026-11 study's units (`data/raw/quality/2026-11/runs/units-87d8606/units.jsonl`, 171,709 word tokens of YouTube, Netflix and article English; see translation-quality.md "Method").
- **Runs**: `measure.ts` from the skill, on main at f7578b4 with `NATIVE=ja`, `es` and `pt`, into `runs/native-<lang>-f7578b4/`. The three runs share every token, so a row can be compared across natives.
- **Baseline judging**: 228 word tokens (New words and names in any native, plus known words; re-weighted to the corpus by stratum) and 132 phrase highlights, each shown as ja, es and pt see it, judged by six judge subagents that saw only a rubric and their packet (`packets/native-u1/base/`). One judge per item: read differences under about ±4 points as noise.
- **Prototype**: a copy of the checkout with the candidate fixes (`proto/native-u1/repo/`, diff in `proto/native-u1/scripts/proto-runtime.diff`, data build in `repo/scripts/data/recipes/proto.ts`), measured with the same `measure.ts`.
- **Blind A/B**, current build against the prototype, Spanish and Portuguese judged separately, X/Y random per item (`packets/native-u1/ab1-*`, `ab2-*`, `ab3-*`; 60 changed + 25 unchanged words per packet, case-only changes not counted as changes):
  - round 1 (tuning): YouTube and articles;
  - round 2: prototype v7 on a fresh sample, Netflix held out;
  - round 3: the final prototype (v10), frozen after round 2, on a fresh sample of all three sites.
- **Display-time translation**: Chrome's Translator cannot run offline, so 100 English short meanings that the es run translates at display (token-weighted sample) were translated by a subagent acting as a literal machine translator, then cut by the shipped `translatedLine` (`proto/native-u1/mt/`). This measures line lengths and cuts, not Chrome's quality.
- **Not measurable on this corpus**: cards with no native line. The corpus has Japanese tracks and `tlang=ja` only; Spanish and Portuguese tracks were never collected.

## Results (current build, f7578b4)
Word tokens shown to the learner (verdict New or Known, 152,844 tokens; 3,979 unknown tokens are the same for all):

| | ja | es | pt |
|---|---|---|---|
| Hover from the pair dictionary | 95.8% | 93.3% (edition 89.7, tables 3.6) | 91.3% (edition 83.2, tables 8.1) |
| Hover is an English definition, translated at display | 1,445 (0.9%) | 2,140 (1.4%) | 4,420 (2.9%) |
| **Shown word with no hover at all** | **0** | **2,635 (1.7%)** | **3,386 (2.2%)** |
| Names (no highlight, no hover) | 1,051 | 1,496 | 1,496 |
| Capitalised words (not names) with no hover | 0 | 1,627 | 1,631 |
| Hovers whose line is cut with "…" | 3.6% | 8.4% | 10.0% |
| Lines over the width cap | 328 (pointers) | 2 | 0 |
| First line points to another English word, not followed | – | 1,321 | 939 |
| Phrase highlights per 1,000 tokens | 26.7 | 26.7 | 26.7 |
| Phrase highlights with a native meaning | 53.3% | 75.7% | 67.6% |

Judged on the same tokens (baseline packets, re-weighted to the corpus):

| | ja | es | pt |
|---|---|---|---|
| Hover good | 52% | 64% | 57% |
| Acceptable | 27% | 24% | 36% |
| Wrong or misleading | 21% | 10% | 5% |
| Missing (no meaning for a word worth looking up) | 0% | 2.3% | 2.3% |
| Phrase meaning fits (yes / partly / no), all | 46 / 28 / 26% | 55 / 30 / 15% | 52 / 27 / 21% |
| … native meaning | 75 / 11 / 14% | 71 / 19 / 10% | 72 / 16 / 11% |
| … English definition, translated | 12 / 48 / 40% | 18 / 54 / 28% | 11 / 49 / 40% |

- On ordinary words the Wiktionary editions do better than EJDict: they have modern senses (cloud, link, text message, cell phone) and every sense carries its part of speech, so A2 needs no inference. Spanish has the fewest wrong senses.
- Portuguese's high "acceptable" share is the edition describing instead of translating, mostly closed-class words: "you" → caso nominativo da segunda pessoa do…, "and" → equivalente à conjunção e:, "to" → marca o verbo seguinte como infinitivo.
- The failures concentrate in classes a random sample rarely hits: forms with no entry (I'm, has, told, says), homographs that lost their verb-form sense (are → área), and names (Japan → an English varnish definition; January, London, China → "(name)").
- Phrase highlights are the same for every native language; Spanish and Portuguese have a native meaning for more of them than Japanese, because English Wiktionary's translation tables cover more phrases in Spanish and Portuguese.

## Root causes
1. **The data build drops form-of senses** (CORE data build, `isUsable`): kaikki marks them `form-of` with the target in `form_of`. That loses es 3,429 and pt 2,879 senses:
   - forms whose only senses are forms get no entry at all (told, has, says, took, children);
   - homographs keep only their other meaning: are → área (502 tokens), does → plural of doe.
2. **Rule A1 assumes every headword has an entry** (CORE, `chooseKey`): a vocabulary word (EJDict's headwords) that the pair dictionary lacks keeps its own key, so it has no hover. EJDict has all of them; the editions do not. Effect: es 2,635 and pt 3,386 shown words with no hover.
3. **Pointers are read only in Japanese and English syntax** (NATIVE, `GlossReader.pointer` missing for es/pt): an edition sense the source did not tag stays a meaning, so it is neither followed nor used by A1:
   - "Pasado simple del verbo (to) see" (saw), "Tercera persona del singular … del verbo (to) do" (does): 901 such senses in es, 85 in pt;
   - the source's own form-of senses give the syntax, so it can be learned (below).
4. **Capitalised headwords are skipped** (PAIR/NATIVE, `termKeyOf` takes lowercase vocabulary words, `readEdition` skips proper nouns), and the pair dictionary has no `capitalMeaning` and ignores `written`:
   - Japan → the English definition of japan lacquer, Mr → one thousandth of a rem;
   - January, Texas, London, China → "(name)": 445 more name tokens than ja;
   - I'm, I've, British, American, England, Thursday → no hover: 1,627 tokens.
   - The editions have exactly what EJDict's capitalised headwords give en-ja: es "Japan: Japón.", "January: Enero.", and English Wiktionary's translation tables have the same for every native language.
5. **The short-line rules for Latin-script glosses are the English ones** (NATIVE, `pairLine` → `definitionLine`):
   - Wikcionario writes glosses as sentences: "Más. Comparativo de much" shows both sentences; Wikcionário closes glosses with ":" before examples ("dizer:");
   - Wikcionario capitalises every gloss (Ser, Enero), while table words are lower case (terminar), so lines mix case and "Enero" looks like a name;
   - sense subscripts leak (Senegal₁, Segundo₂);
   - long description glosses are cut hard at 40 characters with "…" (8–10% of hovers; ja 3.6%).
6. **A pointer's target lines are not ordered by the tag** (CORE, `shortLines` follow): told → tell's noun senses (a poker "tell") first; could → can's "lata" (tin).
7. **Sense cap in file order** (PAIR data build, `MAX_SENSES` = 4 per term over all its entries): an entry listed after a full one never gets in (pt "say": four adverb, conjunction and noun senses, no verb).
8. **Editions describe closed-class words** (PAIR, source quality): pt "you", "it", "he" → caso nominativo…; es "you" → Pronombre de segunda persona singular…. Tables translate them, but the edition wins the whole term (one source per term).
9. **Display-time translation is cut by the English rule** (NATIVE, `translatedLine` for non-Japanese: `capLine` at 40): over the 100 stand-in translations (median 37 characters es, 39 pt; p90 108 and 105), 46% (es) and 49% (pt) of lines are cut; at 50 characters, 38% and 37%. A cut at a comma reads well ("Aumentar la velocidad de un motor"); a hard cut often stops mid-clause ("Alguien que es un ejemplo prototípico…").
10. **Contractions without a pair entry show an English definition of their first word** (CORE, en-defs pointer resolution): pt we're → "Excluding the person(s) being addressed…", they're, you've, she's (≈900 tokens in pt); es and ja have contraction entries.

## What was tested
| Idea | Result | Decision |
|---|---|---|
| Keep form-of senses as pointers to their target (kaikki `form_of`, else the last English headword in the gloss) | Forms get entries: told → pasado simple del verbo tell + tell's meanings; are → ser / estar | **Recommended** (with the next three) |
| Learn each edition's pointer templates from its own form-of senses (gloss with the target replaced, ≥ 3 targets) and apply them to untagged senses | es: 8 templates, 278 more pointers in the pack (901 senses across all entries); pt: 51 templates, 10 more (pt tags its forms better) | **Recommended** |
| A1: a headword the dictionary has no entry for goes to a base that has one (the tag's first) | No-hover tokens es 2,635 → 126, pt 3,386 → 69 (with the capitalised entries); ja unchanged (0 hovers changed) | **Recommended** |
| A1: an auxiliary whose first pointer names a base whose main part of speech is not a verb goes to the verb base ("does": plural of doe → do) | Fixes does/doe; ja unchanged | **Recommended** |
| Capitalised headwords from the edition (proper nouns too) and the translation tables, kept apart like `en-ja/capital.json`, used by `written` and `capitalMeaning` | Japan → Japón, January → enero, Thursday → jueves, I'm → contracción de I y am, British → británico. Names es 1,496 → 1,310, pt → 1,240 (ja 1,051) | **Recommended** |
| Drop capitalised senses whose gloss is shared by ≥ 10 headwords (a class: Apellido ×130, Nombre de pila de varón ×80) | Louis, Michael, Churchill stay names. At ≥ 3 it also dropped francés, árabe, navidad (synonym headwords), so 10 | **Recommended** |
| A person's name first (names lexicon main kind given name or surname) keeps no capitalised "word" meaning | es/pt: Einstein → gênio, Frank → franco, Mary → a given-name class become names. ja: 12 tokens lose a meaning (Oscar, Carolina, Harvard). With `personName` (any g/s kind) ja lost every month: dropped | Refined: apply to Wiktionary-derived capital meanings only |
| Native case for edition glosses: the first word lower-cased when the native edition writes that word in lower case, unless it repeats the headword (Ser, Pero, Enero → ser, pero, enero; Japón, China stay) | es 25,044 glosses, pt 220; capitalised months become "word" meanings | **Recommended** |
| Latin-script line: first sentence only, no closing ":", no sense subscripts (not H₂O) | Más. Comparativo de much → más; dizer: → dizer | **Recommended** |
| A pointer line wider than the cap is left out while a meaning shows | is → ser / estar instead of "Tercera persona del singular del…" | Recommended (see decisions) |
| Hide every pointer line (pointers only steer) | Judges preferred the base word alone for said, been, knew, but best → "bom" (good) without "superlativo de good" misleads | Dropped; a decision for the user below |
| Followed lines in rule A2's order, by the tag or else the pointer sense's part of speech | told → contar, narrar first; could → poder | **Recommended** |
| Own meanings before pointers in each entry | Participles lost their own entry to A1 (retired → retirar, hiding → esconderijo) | Dropped |
| An edition term that only points yields to the tables when they have the term | pt used → usado, acostumado (the edition had only "passado … do verbo use") | **Recommended** |
| Senses: 4 in file order plus the first sense of every other part of speech (≤ 6) | pt say → dizer; but mistagged words now show the new sense first (speaks/NN → jerga, step → andar) | Refined: keep, revisit with tagger errors |
| Closed-class words take the tables' entry | pt you → o / tu / você, it → ele / o / pegador, this → este / um / tão: table senses are in arbitrary order | Dropped as a whole; a sense-order rule for tables is needed first |
| At a sentence start, a lowercase entry alone (no capitalised senses joined) | Who → no OMS, Is → no EI. Mid-sentence capitals in ASR still join (It's → TI) | Recommended for every pair (ja joins today) |
| Latin cap 50 instead of 40 for translated lines | Cut lines 46 → 38% (es), 49 → 37% (pt) on the stand-in translations | Not judged; a decision below |

**Blind A/B of the final prototype** (round 3, fresh sample, frozen; corpus-weighted hover rates; changed hovers: es 8.3–9.8% of word tokens, pt 15.2–16.5%):

| | es YouTube | es Netflix | es articles | pt YouTube | pt Netflix | pt articles |
|---|---|---|---|---|---|---|
| Good | 72 → 73% | 54 → 55% | 78 → 81% | 80 → 82% | 45 → 48% | 73 → 78% |
| Wrong or misleading | 11 → 9% | 14 → 12% | 7 → 5% | 4 → 2% | 12 → 9% | 6 → 5% |
| Missing | 1 → 0% | 1 → 0% | 3 → 0% | 3 → 0% | 3 → 0% | 5 → 0% |
| Changed hovers preferred (prototype vs current) | 33 vs 6 | 33 vs 8 | 45 vs 8 | 28 vs 5 | 34 vs 5 | 48 vs 5 |

- On the changed hovers alone (180 per language): es good 27 → 45%, wrong or misleading 38 → 13%, missing 20 → 0%; pt good 33 → 56%, wrong or misleading 26 → 8%, missing 24 → 0%.
- Round 2 (v7, Netflix held out) agreed: changed hovers preferred es 93 vs 12, pt 134 vs 17.
- Where the current build won, it was mostly the pointer line: "sold → pasado simple del verbo sell / vender" against "sell → vender". Also posbalance with a wrong tag (embraces → abrazo first), and It's → TI.

## Recommended fixes, by layer
### CORE (every pair)
| Rule | What it does | Evidence |
|---|---|---|
| A1 no-entry fallback | A headword the pair dictionary lacks goes to a base it has, the tag's first | No-hover tokens es 2,635 → 126, pt 3,386 → 69; ja unchanged |
| A1 auxiliary base | An auxiliary whose first pointer names a non-verb base goes to the verb base | does (doe) → do; ja unchanged |
| A2 on followed lines | A pointer's target lines in the tag's order, else in the pointer sense's part of speech | told → contar first, not "a tell" |
| Form-of senses kept as pointers (data build) | kaikki's `form_of` target, else the last English headword in the gloss; pointer-only terms yield to the next source when it has the term | es +552, pt +411 pointer senses; are → ser / estar |
| Capitalised headwords (data build) | Every pair keeps its source's capitalised entries apart under the lowercase key (the `capital.json` design of en-ja), from the edition (proper nouns included) and the translation tables | Japan → Japón, January → enero; names es −186, pt −256 tokens |
| Sentence-start lookup | Without a written case, the lowercase entry alone when there is one | Who ≠ OMS; to measure on ja |
| Contractions | A contraction without a pair entry shows its expansion and its words' native meanings, never the first word's English definition | pt ≈ 900 tokens of we're, they're, you've |

### NATIVE (per gloss language)
| Part | Japanese (today) | Spanish / Portuguese (needed) |
|---|---|---|
| `pointer(sense)` | "Xの過去", "=X" | Learned from the edition's own form-of senses (templates with ≥ 3 targets), plus kaikki's `form_of` |
| Sense separator, first sense | ; ／ ・ and a space between glosses | ";" and a sentence end (". " before a capital); a closing ":" removed |
| Gloss case | – | First word as the native edition writes that word (lower case for common words) |
| Cap | 25 wide characters | 40 Latin characters for glosses (decision below for translations) |
| `translatedLine` | Keeps the main verb (last) | Head-first: cut at the last comma that fits, else at a space with "…" (today's `capLine`) |
| Capital meaning "name" vs "word" | Katakana-only gloss = the name | A gloss that is the name (capitalised words, function words allowed) = "name"; a lower-case gloss = "word"; a gloss equal to the headword (Texas → Texas) = no meaning |
| POS of senses | Inferred from glosses (sense-labels) | Given by the edition (rule A2 works as is) |

### PAIR (per source)
- **Wikcionario (es)**: sense subscripts (Senegal₁) removed; glosses sentence-cased; a few glosses mix a meaning and a pointer ("Sí, variante gráfica y prosódica de yes"): not yet handled.
- **Wikcionário (pt)**: closing ":" before examples; mislabelled English entries (the English "are" glossed as forms of a Portuguese verb, "am" as a bird) and noisy `form_of` targets ("particípio"): read the target from the gloss when `form_of` names no English headword.
- **Translation tables**: sense order is the table order, not frequency; their first word per sense is the line.
- **Class glosses** for capitalised headwords (Apellido, Nombre de pila de varón, prenome masculino) are found by repetition across headwords (≥ 10), not by a list.

## What a new native language needs
A checklist for the D2/D3 steps (ru, fr, de, zh, it, pl), in the order to do it:
1. **Recipe**: the edition (kaikki extract) and the translation tables' language codes (`RECIPES`); gate ≥ 95% (`npm run data:stats`).
2. **Form-of senses**: count the edition's English senses tagged `form-of` / `alt-of` and how many name an English headword in `form_of`; run the template learner (`proto/native-u1/scripts/templates.py`) and read its top 20 templates and its untagged matches.
3. **Capitalised headwords**: count the edition's proper-noun entries for English words and the tables' capitalised entries; check Japan, January, Monday, English, London, I'm; list glosses shared by ≥ 10 headwords (class glosses) and check the threshold does not drop synonyms.
4. **Gloss shape**: sentence case, separators, closing marks, subscripts, how long the glosses are (share over the cap), whether closed-class words are described rather than translated.
5. **Script**: Latin, Cyrillic (ru, pl use the Latin rules; ru the same with Cyrillic case) or CJK (zh: wide characters, the Japanese-style cap; no case, so the gloss-case and capital "name"/"word" rules need the CJK shape instead).
6. **Measure**: `measure.ts` with `NATIVE=<lang>` against ja on the same units; the numbers of "Results" above (no-hover tokens, names, cut lines, translated at display, phrases with a native meaning).
7. **Judge**: a baseline packet with ja as reference (`base_packets.py`), then a blind A/B of the fixes (`ab_packets_ci.py`, which ignores case-only changes) on a fresh sample.
8. **Site translations**: collect the native language's caption tracks (YouTube human tracks and `tlang`, Netflix subtitles) for a few videos and episodes, so cards with no native line can be measured; this study could not.

## Costs and decisions
Decided by the user (2026-11-18):
- **Bundle size is no longer a constraint**. The prototype packs grow en-es 4.65 → 5.00 MB and en-pt 3.69 → 4.05 MB (+0.08 / +0.10 MB gzipped). Step D0 (PR #113) makes every pack downloaded and replaces the 50 MB all-packs guard with a per-pair guard of 40 MB raw; en→es is 31.67 MB and en→pt 30.70 MB today, so the capitalised entries fit. Still recommended: the lookup falls back to the capitalised entry when there is no lowercase one, instead of storing lowercase copies (saves 0.27 MB across the two pairs).
- **Pointer lines for Latin-script natives: Option A**, as the prototype does: a pointer line shows when it fits the line cap ("pasado simple del verbo sell / vender") and is left out when it is wider, while a meaning shows ("is" → ser / estar). Measured alternatives: never showing verb-inflection pointers but keeping comparative and superlative ones (best → bom alone misleads); always showing them, as Japanese does. In round 3 (Option A) the prototype was preferred 221 vs 37; 20 of the 37 were a verb-form pointer line the learner did not need (sold, knew, been, telling).
- **Width cap for translated lines in Latin scripts**: set by the mock's hover card. The fix step measures how many Latin characters fit the card's width and uses that number (40 today; 25 wide characters ≈ 50 Latin). For reference, over the stand-in translations a cap of 40 cuts 46% (es) and 49% (pt) of lines, a cap of 50 cuts 38% and 37%.
- **One source per term stays**. Portuguese closed-class words would be better translated by the tables, but their senses come in an arbitrary order, and mixing sources per sense would break attribution per term.

Unchanged: names in caseless text (a learning-side rule).

## Still open
- Wrong sense within the right part of speech: the same as en-ja, now the largest remaining class for es/pt too (Netflix good 48–55%).
- Mistags made visible by POS-balanced senses (speaks/NN → jerga); a tag confidence per sense move, not per word, may be needed.
- English definitions translated at display: fit 11–18% "yes" on phrases for every native; this is C2 (definition ranking), not native-specific.
- Glosses mixing a meaning and a pointer ("Sí, variante … de yes", "estos, estas, plural de this"): cut the pointer item with the learned templates.
- Chrome's real translations into es/pt were not measured (stand-in only), nor Netflix es/pt subtitle alignment.
- Classify time doubled in the prototype runs (5.2 → 9.8 ms per 1,000 tokens): the prototype reads `process.env` and rebuilds senses per call; a real build should not cost this, but measure it.

## Suggested order
Step 1 starts now, from main. Steps 2–5 run after D1 (`claude/native-infra`: a native-language registry and recipe changes, in progress), since they change the recipes and the pair dictionary D1 reworks.
1. **CORE A1 fallback and auxiliary base** (small, deterministic; ja unchanged): measured alone on today's packs, no-hover tokens es 2,635 → 1,849 and pt 3,386 → 1,859 (`runs/proto-{es,pt}-a1only`); the rest needs steps 2 and 3. Every future native benefits.
2. **Form-of pointers in the data build, learned pointer templates, followed lines in A2's order, pointer-only terms yield** (data rebuild of en-es and en-pt, the pair dictionary reads pointer senses): are → ser/estar, told → contar; expected changed hovers ~10% (es) and ~15% (pt) of tokens, preferred as in round 3. Pointer lines as decided (Option A).
   - **Done in U1-2** (PR on `claude/native-pointers`, stacked on D3, all eight recipe natives; outputs in `steps/u1-2/`). Built as above, plus: an auxiliary's `pos` is "auxiliary", which keeps its pointer however wide ("has been" → "Tercera persona … de have", tener: U1-1's guard lifted where the edition has the form); a followed target is ordered by the pointer sense's own part of speech before the tag (by the tag alone, en-ja's mistagged made/NN went to 作り,型); a template whose targets are all words of the edition's own language is no pointer syntax (pl's form_of links "me" → ja); an untagged word whose entry is only pointers, the first to a word that is none of its bases, goes to its base (de "is": "Plural des Substantivs i").
   - Measured (`measure.ts`, before = D3 + U1-1): shown words with no hover es 2,074 → 1,847, pt 2,286 → 1,858, fr 2,344 → 2,058, de 2,286 → 1,913, zh 2,484 → 2,419, it 2,486 → 2,283, pl 2,434 → 2,064, ru 2,250 (unchanged: its tables come first and its edition has 80 pointer senses), ja 0; first lines that are a pointer not followed es 244 → 1, pt 21 → 0, fr 190 → 0, it 29 → 0, pl 147 → 1,172 (contraction expansions: that's → "that is / that has", step 5); changed hovers ja 21 tokens (0.01%: target order), es 2.5%, pt 1.1%, ru 0.1%, fr 3.6%, de 2.1%, zh 0.7%, it 1.1%, pl 2.4% — far below the ~10–15% expected, since U1-1 had already sent most forms to their base. Lines over the 50 cap: es 2 → 565, pt 0 → 225, fr 0 → 621, de 0 → 226, pl 0 → 621 (auxiliaries' whole pointers); hovers cut with "…" slightly down everywhere.
   - Judged blind on a fresh sample (60 changed + 20 unchanged words per language from YouTube and articles; Netflix held out, 40 + 15, code frozen): changed words' wrong + misleading + missing before → after: es 16 → 4 (Netflix 12 → 4), pt 22 → 6 (16 → 4), fr 18 → 5 (9 → 0), ru 8 → 2 (6 → 1); good 26 → 10, 27 → 9, 27 → 7, 7 → 2 (Netflix 15 → 8, 16 → 4, 21 → 6, 7 → 1), as a fitting pointer line before the base's meaning is "acceptable" in the rubric (sold → "Pasado simple del verbo sell", vender). Preferences on changed words: es 24 vs 22 (Netflix 19 vs 12), pt 26 vs 24 (16 vs 17), fr 23 vs 28 (17 vs 20), ru 9 vs 9 (6 vs 9). Corpus-weighted, every rate moves under a point (es good 83.4 → 82.4%, wrong 10.4 → 9.9%). The round-3 preference (221 vs 37) came mostly from words that had no meaning before U1-1. Fitting pointer lines first on non-auxiliaries: es 2,232, pt 984, fr 2,990, de 2,416, it 1,205, pl 1,650 tokens — the measure of what hiding them (the alternative to Option A) would change.
   - **Decision changed (2026-11-18, after these results)**: the user first asked to hide verb-inflection pointers on non-auxiliaries, then left the presentation for non-Japanese natives to us, following language-learning practice (comprehension first, form awareness second). Built: by the pointer sense's grammatical kind (its part of speech), in a spaced script a verb inflection on a non-auxiliary comes **second**, after its base's first meaning (sold → vender, "Pasado simple del verbo sell"), when it fits the cap (pl's are all wider, so pl shows the base alone); auxiliaries and every other form (comparatives, superlatives, plurals) keep the pointer first; Chinese (a dense script) keeps Option A, as Japanese shows its pointers; the dictionary window keeps every pointer. No pack change. Hovers that move from Option A: es 1,965, pt 924, ru 184, fr 2,647, de 2,213, it 1,060, pl 4 tokens; ja and zh 0. The corpus measures above are unchanged (the same lines, reordered).
   - Judged three ways on the same frozen sample (same items, seed 1202, Netflix held out; each judge saw before (U1-1), Option A and meaning-first as X/Y/Z in random order, the same rubric). Changed words, before / Option A / meaning-first:

     | | good | wrong + misleading + missing | best |
     |---|---|---|---|
     | es YT+art. (60) | 28 / 10 / 33 | 18 / 4 / 4 | 12 / 18 / 37 |
     | es Netflix (40) | 16 / 8 / 23 | 11 / 3 / 4 | 6 / 11 / 24 |
     | pt YT+art. (60) | 30 / 9 / 35 | 21 / 3 / 8 | 8 / 18 / 40 |
     | pt Netflix (40) | 18 / 4 / 19 | 16 / 5 / 5 | 3 / 12 / 25 |
     | fr YT+art. (60) | 27 / 6 / 29 | 20 / 3 / 6 | 15 / 11 / 35 |
     | fr Netflix (40) | 24 / 6 / 30 | 9 / 0 / 2 | 5 / 8 / 29 |
     | ru YT+art. (20) | 7 / 2 / 12 | 10 / 2 / 5 | 3 / 5 / 11 |
     | ru Netflix (16) | 7 / 1 / 11 | 6 / 1 / 4 | 2 / 3 / 11 |

     ("best" counts a version for every item where it shows the display the judge chose, so an item where Option A and meaning-first show the same lines counts for both.) Meaning-first keeps most of Option A's fixes and gets the "good" back; where it loses to Option A on wrong senses, the base's first meaning is the wrong sense of the base, which the pointer first had hidden (could → "Boîte de conserve", tin). Corpus-weighted, good es 78.7 / 77.6 / 79.0%, fr 78.4 / 76.8 / 78.5%, wrong es 10.6 / 9.9 / 9.9%.
3. **Capitalised headwords for pairs** (`capital.json` per pair, `capitalMeaning`, `written`, class glosses, persons rule for Wiktionary-derived meanings; the lookup falls back to the capitalised entry instead of lowercase copies): Japan → Japón, months and nationalities shown; names es 1,496 → ~1,310, pt → ~1,240. Fits the per-pair guard of D0.
   - **Done in U1-3** (PR on `claude/native-capitals`, all eight recipe natives; outputs in `steps/u1-3/`; architecture "Capitalised headwords of the recipe pairs"). Built as the study recommended, plus what the other natives needed: "word" or "name" is read from the native edition's own entry for the gloss (a capitalised gloss the edition has in lower case is a word: Wikcionario's "Mayo" is the month, not the place; a capitalised common noun is a word only where the edition capitalises its nouns, German, and the name where it does not, Russian files Япония as a noun; zh headwords compared in simplified characters), the shape only where the edition has neither (and never in a caseless script: zh "Oh" → "a surname from Korean"); a class gloss is compared whole when it is only a note ("(английская фамилия)" ×656); acronyms are kept apart from capitalised headwords as en-ja keeps EJDict's. Pair format 3: `capital.json`, the first shard.
   - Measured (`measure.ts`, before = main at e99c76c), per native: names; capitalised words that are no names with no hover; shown words with no hover; hovers changed:

     | | names | capitalised, no hover | shown, no hover | changed |
     |---|---|---|---|---|
     | ja | 1,051 → 1,051 | 0 → 0 | 0 → 0 | 0 |
     | es | 1,496 → 1,310 | 1,625 → 70 | 1,847 → 126 | 2,601 (1.75%) |
     | pt | 1,496 → 1,231 | 1,630 → 46 | 1,858 → 69 | 2,768 (1.86%) |
     | fr | 1,496 → 1,218 | 1,617 → 179 | 2,058 → 442 | 2,578 (1.73%) |
     | de | 1,496 → 1,316 | 1,627 → 161 | 1,913 → 267 | 2,385 (1.60%) |
     | ru | 1,496 → 1,041 | 1,605 → 958 | 2,250 → 1,504 | 1,920 (1.29%) |
     | zh | 1,496 → 1,040 | 1,606 → 207 | 2,419 → 847 | 2,741 (1.84%) |
     | it | 1,496 → 1,282 | 1,619 → 205 | 2,283 → 699 | 2,489 (1.67%) |
     | pl | 1,496 → 1,125 | 1,620 → 784 | 2,064 → 1,093 | 2,122 (1.42%) |

     Capitalised words shown as an English definition translated at display drop too (es 403 → 147, fr 309 → 119, pl 259 → 33). What stays without a hover is mostly contractions no source of the pair has: ru and pl lack I'm (764 tokens), fr, de, it, zh, ru lack I'll (128), and ru, zh, it has/did, pl gonna (step 5). The changed hovers: I'm (764: contracción de I y am, chuis, ich bin, 我是), I've, I'll, British, American, England, Thursday, US (EE. UU.), CEO (PDG), Dr, York, Japan (Japón; de keeps Japan a name, as German writes it so), London (Лондон, Londres).
   - Judged blind on changed hovers (a fresh sample, seed 1903, 60 changed + 20 unchanged words per language from YouTube and articles; Netflix held out, 40 + 15; code frozen; the judged build merged acronyms into the capitalised headwords, fixed after it, below). Changed words before → after:

     | | good | wrong + misleading + missing | preferred after vs before |
     |---|---|---|---|
     | es YT+art. (60) | 13 → 46 | 42 → 3 | 49 vs 1 |
     | es Netflix (40) | 6 → 27 | 33 → 2 | 36 vs 1 |
     | fr YT+art. (60) | 15 → 39 | 41 → 1 | 48 vs 11 |
     | fr Netflix (40) | 12 → 22 | 26 → 9 | 24 vs 7 |
     | de YT+art. (60) | 13 → 44 | 44 → 8 | 48 vs 4 |
     | de Netflix (40) | 16 → 24 | 21 → 6 | 23 vs 7 |
     | zh YT+art. (60) | 18 → 39 | 40 → 6 | 52 vs 6 |
     | zh Netflix (40) | 11 → 33 | 23 → 4 | 32 vs 2 |

     Missing goes to 0 on changed words everywhere. Corpus-weighted, the change is about a point of "good" (es YouTube and articles 69.2 → 70.1%, Netflix 91.8 → 92.8%; fr 74.2 → 74.8%, de 74.2 → 75.0%, zh 54.5 → 55.2%), as only 1.5–2% of tokens change. Where judges preferred before: a capitalised function word shown as an acronym (And → ET, It's → IT, If → Indice de citations, Who → OMS, His → KIS: fr 6 of 18, de 4 of 11, so acronyms were kept apart, which changes 18–157 tokens per native from the judged build, all of them such words); a capitalised noun's proper sense first where the common one was meant (West → Occident, City → Cité de Londres, Crown); a person's or place's name now shown with a native gloss or description (Michael → "Prénom masculin équivalent à Michel", Windsor → "Ville d'Angleterre", Washington → 华盛顿州) where "(name)" was judged better.
   - Presentation choices for non-Japanese natives (ours to make, user 2026-11-18), by language-learning practice and the judging above: (1) a capitalised word shows its capitalised meaning first, then the common word's, as en-ja does (Turkey → Turquía, pavo; May → mayo, poder): a learner reading "Turkey" mid-sentence means the country; (2) a place whose native name differs is a word with that name (London → Londres, Japan → Japón), as ja's Germany → ドイツ: country, city and nationality names are early vocabulary, and judges rated them good; a place written the same (Paris → París aside from accents, German Japan) stays a name: nothing to learn; (3) a person's name stays a name ("(name)"), whatever gloss the source gives (Frank → franco, Einstein → gênio); (4) where the page does not say how a word is written, the lowercase entry alone: joined, "It's" showed IT on 332 es tokens and "And" ET on 887 fr tokens (the study's recommendation, now taken for the pairs; ja still joins, to measure in step 5); (5) acronyms only for words written in capitals.
   - Not done: contractions the sources lack (step 5); a few names whose native spelling the edition also files as a common word stay words and show it (ru Einstein → Эйнштейн, zh Helen → 海伦); pt God shows the edition's interjection sense first; en-defs still keeps the English definitions of words every pair now covers through a capitalised entry (thursday, january): a later `data:en-defs` could leave them out.
4. **Latin-script short lines** (first sentence, closing marks, subscripts, native case): cosmetic but on every Wikcionario gloss (25,000 in es); the translated-line cap is the number of Latin characters that fit the mock's hover card, measured in this step.
   - **Done in U1-4** (PR on `claude/native-short-lines`; all eight recipe natives, and every pair's untranslated English fallback; outputs in `steps/u1-4/`; architecture "Short lines": "The native cap", "Recipe pairs' edition glosses", "Repeats", and "Native meanings": "The native side of the glosses"). Built, with the problems found in the study and in the 2026-11-18 real-site check:
     - CORE: an English definition shown until Chrome's translator has translated it is one line within the English cap of 40 (it showed 140+ characters in five rows); a line that repeats an earlier one apart from punctuation is left out (davvero / davvero?, 的 / ...的); case and brackets count (de Morgen / morgen).
     - NATIVE, runtime (`editionLine`, every recipe native): sense subscripts and an opening ellipsis dropped (pl "…służący do tworzenia pytań", the cut at both ends); a label of several words in brackets that opens a gloss dropped; first sentence only (fr "Tout à l'heure. Note d'usage : …", "Enfant . Note…"); what a qualifier introduces ("De un recurso o sustancia, generalmente alimento: consumir, usar"; pl "często przed gerund: mój, swój"; de „you are…:" du bist); the translations a description is followed by (es you: "tú, vos, usted…", pt you: "tu, você", ru the: "этот, тот"); no closing marks.
     - NATIVE, data build: gloss case where the edition opens its glosses with capitals (es 24,748 glosses, fr 64,410; the study counted 25,044 in es): the edition's own headwords and the forms their entries list decide; in pt, pl, ru, it the capital is the word's (pl "Meksykanin"), in de a noun's, so nothing changes there. Glosses and table words with no letter of the native script left out beside ones in it (zh be: "or implied" → 是; ru 19, zh 70). A closed-class term an edition only describes comes from the next source that translates it (pl the → ten; es 1, pt 5, fr 9, pl 2 terms); most descriptions carry their translations in the same gloss, which the line rule shows instead.
     - The cap (`NATIVE_CAP`, 50 display width for every native; was 40 for non-Japanese glosses and translations): measured in the mock's hover card (`.pop`: 290 px, 14 px padding, so 260 px of 15 px Inter), rendering 6,000 edition lines per language and the 200 stand-in translations in that box with the extension's Inter (Chromium, `steps/u1-4/card-width.json`): a row holds 17 wide characters, so Japanese's cap of 25 takes two rows; Latin lines of up to 60 characters all fit two rows (es, pt, fr, pl, de, it), Cyrillic up to 58 (ru, 0.56 em a letter against 0.49), and a Latin letter is half a wide one. 50 is Japanese's width and fits two rows in both scripts. Pointers: one that comes second (a verb inflection) takes the native cap, one that comes first (a plural, a degree) keeps 40 (judging below).
   - Measured (`measure.ts`, before = main at a05e248), over shown word tokens: dictionary hovers with a line cut with "…"; lines wider than the cap of 50 (whole auxiliary pointers, unchanged by design); hovers shown in English until translated whose line was over 40 → now cut (of all such hovers); shown words with no hover (unchanged); hovers changed, and changed apart from case:

     | | cut with "…" | over 50 | English fallback over 40 → cut | no hover | changed | beyond case |
     |---|---|---|---|---|---|---|
     | ja | 3.8 → 3.8% | 328 → 328 | 733 → 0 (321 cut of 1,445) | 0 | 0 | 0 |
     | es | 8.26 → 1.86% | 563 → 563 | 667 → 0 (259 of 1,333) | 126 | 94.3% | 14.6% |
     | pt | 9.79 → 1.04% | 225 → 225 | 1,832 → 1 (556 of 3,744) | 69 | 22.0% | 22.0% |
     | ru | 4.83 → 4.81% | 0 → 0 | 2,585 → 1 (732 of 4,458) | 1,077 | 5.3% | 5.3% |
     | fr | 24.92 → 3.19% | 621 → 621 | 2,196 → 0 (664 of 3,795) | 442 | 93.9% | 34.7% |
     | de | 0.06 → 0.01% | 226 → 226 | 1,692 → 1 (584 of 4,291) | 209 | 0.9% | 0.9% |
     | zh | 7.81 → 7.80% | 0 → 0 | 2,740 → 0 (1,156 of 5,652) | 478 | 6.7% | 6.7% |
     | it | 0.32 → 0.04% | 0 → 0 | 2,368 → 0 (498 of 3,761) | 474 | 1.0% | 1.0% |
     | pl | 12.02 → 1.71% | 621 → 621 | 1,045 → 0 (228 of 2,110) | 1,093 | 27.0% | 27.0% |

     ja's dictionary hovers are unchanged; only its English fallback is capped. zh's and ru's remaining "cut" lines are mostly the source's own placeholders ("越……越……"). Classify time unchanged (6.6–7.9 ms per 1,000 tokens).
   - Judged blind on a fresh sample (seed 2004; per language 50 hovers changed beyond case, 10 changed in case only, 20 unchanged from YouTube and articles; Netflix held out, 35 + 5 + 15; code frozen; `steps/u1-4/packets/`). Changed beyond case, preferred after vs before, and good, before → after:

     | | YT + articles: preferred | good | Netflix: preferred | good |
     |---|---|---|---|---|
     | es | 25 vs 4 | 26 → 25 | 13 vs 3 | 15 → 21 |
     | fr | 12 vs 2 | 33 → 34 | 19 vs 3 | 23 → 27 |
     | pl | 14 vs 5 | 29 → 31 | 10 vs 3 | 22 → 22 |
     | zh | 15 vs 5 | 24 → 27 | 9 vs 4 | 20 → 21 |
     | ru | 15 vs 3 | 19 → 22 | 14 vs 6 | 16 → 19 |

     In all 146 vs 38; wrong + misleading + missing on changed hovers moved by one at most per packet. Most "after" wins read as "a translation instead of a description or a cut line"; case-only changes were judged "same" in es and fr (14 of 15 and 15 of 15), worse in pl (11 of 15 preferred before: "meksykanin", "kościół", "chińczyk"). Corpus-weighted "good" moved −0.3 to +4.3 points.
   - Fixed after judging, from the losses (general rules, `steps/u1-4/packets-fix/`): (1) the case rule only in an edition that opens its glosses with capitals and does not capitalise its nouns (es, fr; the pl and ru capitals are the words' own); (2) a bracket of one word, or a Chinese note without spaces, stays (fr "(Ne) … pas", zh "（现多）点燃", judged better kept); (3) pointers: the judged build let every pointer of up to 50 show, and ru "teeth" → "форма множественного числа существительного tooth" first lost to зуб alone; a confirmation round (judged build against 40 for every pointer, seed 2105) showed the opposite for verb inflections shown second (pl 31 vs 6, es 20 vs 7, fr 11 vs 9 for showing them: "said" → mówić, "forma czasu przeszłego…"), so a pointer that comes second takes the native cap and one that comes first keeps 40. In the same round the pl case fix was preferred 7 vs 0 and zh's kept notes 14 vs 2. The final build differs from the judged one on 0.02–0.8% of tokens per native.
   - Presentation choices for non-Japanese natives (ours, by learning practice and this judging): lines as the native language writes them (lower case for common words where the edition only capitalises by convention); a translation rather than a description where the gloss has both; a grammar note after the meaning may be as long as the line cap, one before it stays short.
   - Not done: a few glosses' second sentence is the translation (es we're: "Contracción de we are. Nosotros somos…" now shows the first); Wiktionnaire's placeholder "Définition manquante ou à compléter" and "→ voir X" references; ru label abbreviations before a capital ("истор. Британия" → "истор"); case variants joined from a capitalised and a lowercase entry (es "Congreso / congreso"); a qualifier rule miss (es laughter: "El sonido de la risa: cualquier sonido similar" → the part after the colon).
5. **Contractions and sentence-start lookup** (CORE): pt we're/they're (~900 tokens); measure the sentence-start rule on ja too.
6. **Then the next natives** with the checklist above, starting with fr, de, ru (recipes only, per translation-data-expansion.md).

## Measuring
Everything is in the study folder `data/raw/quality/2026-11/` (git-ignored):
- runs: `runs/native-{ja,es,pt}-f7578b4/` (current build), `runs/proto-{es,pt}-v10/` (final prototype; v1–v9 are the tuning steps), `runs/proto-ja-v8/` (ja with the CORE changes);
- prototype: `proto/native-u1/repo/` (checkout copy; `FIXES` for the data build, `RFIX` for runtime switches), `proto/native-u1/scripts/` (analysis, packets, tallies, `run.sh`), `proto/native-u1/mt/` (stand-in translations);
- packets and results: `packets/native-u1/{base,ab1-*,ab2-*,ab3-*}/`, judges' results in `proto/native-u1/results/` and `packets/native-u1/base/`.
