# Tidy-up cycle

Per-language rules pile up: each study adds a branch, a table field, a recipe option, a note and a few scripts. A tidy-up makes them fewer and more general **without changing what any learner sees**, unless a deletion is deliberate and measured.

Run it every third cycle, or earlier when the inventory grew ≥ 15% since the last tidy or a pair was added since. It replaces steps 1–6 of that cycle.

## 1. Inventory
```
npx jiti .claude/skills/language-cycle/scripts/rule-inventory.ts --out=<c>/inventory.json --before=<last tidy's inventory.json>
npx jiti .claude/skills/language-cycle/scripts/sweep.ts --cycle=<c> --label=before
```
The inventory lists:
- **branches**: code comparing a language value with a code (`lang === "zh"`). Each is a rule hidden from the per-language tables.
- **tables** keyed by language (NATIVE_LANGUAGES, RECIPES, …): fields per entry, one-off fields (set by one language), same-value fields (set to the same value by ≥ 3 languages: default candidates).
- **language files** (`tagging/de.ts`, `scripts/data/es-kaikki.ts`) and their lines.
- **docs**: lines of `*-quality.md`, architecture.md, status.md.
- **repeated study scripts**: the same script name in ≥ 2 study folders.

## 2. Work items (one PR each, smallest first; Sonnet subagents for mechanical ones)
1. **Branches → tables or general rules.** A branch on a language becomes a field of that language's entry (`zh` simplified/variant codes → a field of the native), or a rule driven by the data's own structure.
2. **Same-value fields → defaults.** A field most entries set to the same value becomes the interface's default; entries keep only what differs.
3. **Duplicated rules → one CORE rule.** Two languages' files doing the same thing (two taggers' partitive rule, two recipes' reversed-gloss filter) become one function with a per-language parameter.
4. **Ablation of one-off rules.** Turn a rule off on a branch, sweep its pairs, compare. Zero changed rows → delete it. Changed rows → keep it, unless a blind A/B on those rows shows no loss; then it is a deliberate deletion with its numbers.
5. **Study scripts → the skills.** A script repeated across study folders (packet builders, tallies, line dumps, pack diffs) becomes one parametrised script in real-content-quality or language-cycle `scripts/`, and future studies use it.
6. **Docs.** Shipped rules live in architecture.md's layer sections, one place each; `*-quality.md` keep method, numbers and history and link to architecture.md instead of restating rules; status.md keeps current state only.

## 3. Acceptance
- For every code PR: `sweep.ts --label=after-<item>` and `compare-sweeps.py --before <c>/before`: **0 changed rows in every pair**, or only the deliberate deletions, each listed in the PR with its measured effect.
- `npm run verify` green; inventory totals smaller (branches, one-off and same-value fields, repeated scripts, note lines).
- Log: inventory before → after, items done, items left for the next tidy.
