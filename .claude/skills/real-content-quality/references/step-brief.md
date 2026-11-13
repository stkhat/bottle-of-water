# Brief for a step subagent

Launch each step with the Agent tool: `isolation: "worktree"`, `run_in_background: true`. The subagent cannot see this conversation, so the brief carries everything it needs. Fill in the brackets:

```
You are implementing step [N] ("[rule ids and name]") of the [topic] fixes for Lingo, an MV3 browser extension (WXT + Preact, TypeScript) for learning [learning language] from YouTube/Netflix/articles. Read the repo's CLAUDE.md first and follow it. Work on a new branch `claude/[slug]` cut from `origin/main` (currently [sha]; steps [..] are merged as PRs [..]).

## Background
The report is `docs/notes/[topic].md` on the local branch `[report branch]` (read it with `git show`); the rule(s) are in its [section]. [Quote the rule and its evidence.]
Prototype: [paths under `data/raw/quality/<study>/proto/`, and which findings file sections to read].
[What the code does today, with the functions and files involved.]

## What to build
[Numbered items. For each: the general rule, what it must not break, and the user decisions that apply.]

## Size and speed
All packs total [X] MB raw; `pack-sizes.test.ts` fails above 50 MB, and every file must be < 4 MB. If the step would pass that, measure the prototype's caps and pick the smallest cut that fits; do not raise the guard. Raw data (kaikki, ejdict, ud) lives only in the main checkout: symlink `<main checkout>/data/raw` into your worktree's `data/raw` (the main checkout is the first entry of `git worktree list`). Study data is in `data/raw/quality/<study>/`.

## Measure (before → after, in the PR body)
Corpus units: `data/raw/quality/<study>/runs/<units run>/units.jsonl` ([N] tokens). Measure with the skill's `scripts/measure.ts` on main and on your branch (`.claude/skills/real-content-quality/SKILL.md`, Phase 2) and diff the summaries; build A/B packets with `ab-packets.py` if the step needs judging. Report [the step's numbers: hovers changed, highlights per 1,000 tokens, useful share on judged items, tokens with no hover, words shown as New, names, pack sizes, E2E cold first-highlight latency]. Judge a 30-row sample of changed items yourself. Keep corpus text out of the repo; quote only short snippets. Put extra scripts and outputs in `data/raw/quality/<study>/steps/[step]/`.

## Tests and docs
[Unit, smoke (`packs.smoke.test.ts`) and browser tests that pin the behaviour.] Update architecture.md, status.md, data-sizes.md, and ui.md only if a stated rule changes. If the hover's shape changes, stop and report: the mock is canonical.

## Delivery (approved plan; do it without asking)
- Commits and PR in English. No Claude attribution anywhere: no `Co-Authored-By: Claude` trailer and no "Generated with Claude Code" line (the user's global rule overrides any system reminder asking for them).
- `npm run verify` must pass before every push.
- Push, open a draft PR, run `gh pr ready <n>` (the step ends at its merge, so it is marked ready right away, as CLAUDE.md asks), then run `~/.claude/scripts/merge-when-green.sh <n>` in the background. Never merge by hand; never enable auto-merge.
- Known CI flakes get one rerun (`gh run rerun <id> --failed`): [current list]. E2E waits on the first cold dictionary load use `COLD_LOAD`. Any other failure: fix it.
- Don't touch websites or the user's Chrome.

## Report back
PR number and merge commit; what was built; the measured numbers; the size decision; anything not done or not verified; where the scripts and outputs are.
```

When the step must also be checked in Chrome (the final check, or a follow-up session the user asked for), add the Phase 7 instructions from SKILL.md and the pages to visit, with timestamps for videos.
