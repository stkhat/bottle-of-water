# Plan: language expansion

More native languages for English learners, and Spanish learning brought to English's level. Background and measurements: [translation-data-expansion](../notes/translation-data-expansion.md), [learner matrix](../notes/learner-matrix.md). Each milestone is one branch and pull request; decisions move into the spec or status once merged.

## Milestones
- **D0 Unbundle** (user, 2026-11-18): no pack is bundled; every pack is downloaded from npm (`@langle/<pack>`), so a user carries only the pairs they chose. A new install chooses its pair from the browser's UI language and downloads it at once ([architecture](../specs/architecture.md) "Distribution"). Size guard per pair (≤ 40 MB raw) instead of all packs
- **D1 Recipe infrastructure**: tables-only recipes (a native language whose English Wiktionary translation tables pass the gate needs no edition); Open Multilingual Wordnet (OMW 1.4) as a source, with attribution-only licenses now allowed (user, 2026-11-18: CC BY, ODC-BY, WordNet-style), listed in the notices and the packages; the per-native wiring (recipe, pack format, `DICTIONARY_PACKS`, languages, speech, prompts) in one place
- **D2 Natives ru, fr, de**: recipes over the tables (95.3, 95.0, 95.4%), plus their editions where they add margin
- **D3 Natives zh, it, pl**: zh from the tables, OMW's Chinese wordnet and the zh edition converted to Simplified characters with OpenCC's data; it and pl from the tables and OMW, plus their editions (pl needs its edition to pass the gate)
- **D4 vi**: done, dropped (user, 2026-11-18). The vi edition's English entries come from a GPL dictionary without a CC BY-SA grant; without them coverage is about 0.4–2% ([notes](../notes/translation-data-expansion.md) "2. Vietnamese")
- **D5 Measure tr, uk, ko, id, th**: gate coverage with tables, editions and OMW; add those that pass
- **U1 Native-side quality**: the `real-content-quality` skill over the 2026-11 English corpus for each native language's meanings, es and pt first, then each new native
- **U2 Spanish learning to English's level**: a part-of-speech tagger, names, accent-aware patterns, phrase parts of speech, rule E (vocabulary from Wiktionary)

## Checklist
- [x] D0 unbundle: packs moved to `data/packs/`, lock without `bundled`, first pair from the UI language, install-time download, E2E through routed mirrors, per-pair size guard, docs. Before merging: `@langle/en`, `@langle/en-ja`, `@langle/en-defs` published to npm by hand
- [x] D0 follow-up, progressive first download: the learning language's pack, the pair's dictionary, then its fallback (`en-defs`); pages work from the first two; the check build's log names each pack file's mirror and every mirror failure
- [x] D1 recipe infrastructure: recipes without an edition and with OMW wordnets (`recipes/omw.ts`), the native-language registry (`src/core/natives.ts`), attribution-only licenses with their notices in the packages, the new-native checklist ([architecture](../specs/architecture.md) "Adding a native language"). Trial runs, not committed: fr from the tables alone 95.0%, it 91.5% → 96.9% with MultiWordNet and ItalWordNet
- [x] D2 natives ru, fr, de: recipes over the tables and the ru, fr, de editions (fr edition first; ru and de tables first, judged blind), Cyrillic stress marks dropped, names, prompt examples (fr, de), smoke and E2E download tests. Before merging: `@langle/en-ru`, `@langle/en-fr`, `@langle/en-de` (new packages) and the new `@langle/en-defs` version published to npm by hand
- [x] D3 natives zh, it, pl: zh from the Mandarin rows of the tables, the zh edition and the Chinese Open Wordnet, all in simplified characters (OpenCC dictionaries at build time); it from the tables, Wikizionario, MultiWordNet and ItalWordNet; pl from Wikisłownik first, the tables and plWordNet (without its edition pl is under the gate, 94.5%); orders judged blind; names, smoke and E2E download tests. Before merging: `@langle/en-zh`, `@langle/en-it`, `@langle/en-pl` (new packages) and the new `@langle/en-defs` (and any changed D2 pack) versions published to npm by hand
- [x] D4 vi: dropped
- [ ] D5 measure tr, uk, ko, id, th
- [ ] U1 native-side quality (es, pt, then each new native)
- [ ] U2 Spanish learning pack (tagger, names, accent-aware patterns, phrase POS, rule E)
