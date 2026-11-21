---
name: language-cycle
description: Langle's recurring quality cycle over every offered language pair — sweep all pairs on the real-content corpora, simulate learners with Sonnet agents, triage what they hit into general root causes by layer, fix the top few as PRs, re-measure every pair for regressions, check on the real sites, log it; every third cycle a behaviour-preserving tidy-up of per-language rules instead. Runs weekly from a Desktop scheduled task and by hand with /language-cycle. Use it whenever the user says "language cycle", "週次の品質サイクル", "全言語でシミュレートして", "ルールを整理して", or asks to run the next cycle or the tidy-up. For a one-off quality study of one pair or a new pair, use real-content-quality instead (this skill calls its phases).
---

# The language cycle

A cycle finds what learners hit across **all** pairs, fixes the biggest causes once, and checks that no pair got worse. **Simulate wide, fix narrow, re-measure wide**:
- every pair is simulated each cycle (offline and Sonnet: cheap and parallel); all natives of a learning language see the same stretches, so a problem 3+ natives hit is one LEARNING/CORE fix, not several NATIVE patches;
- fixes go one cause per PR, so each A/B stays clean;
- every pair is re-measured after each merge, because a CORE or LEARNING change moves pairs nobody looked at.

Method library: [real-content-quality](../real-content-quality/SKILL.md) (ground rules, layers CORE/LEARNING/NATIVE/PAIR, blind A/B, step briefs, real-site check). Read its "Ground rules" once per cycle; they all apply here.

State lives in [docs/notes/language-cycles.md](../../../docs/notes/language-cycles.md) (the log, committed) and `data/raw/quality/cycles/<cycle>/` (git-ignored: sweeps, packets, findings). Scripts here write into the main checkout's `data/raw/quality`, which the Bash sandbox does not allow: run them with the sandbox off.

## Autonomy (user decisions, 2026-11-22)
- Weekly from a Desktop scheduled task (a fresh session each time) and by hand with `/language-cycle`; a manual run counts as that week's cycle.
- Go through to merged fix PRs without asking (memory: no confirmation; PR workflow). Learner-visible trade-offs — highlight density, number of senses, pack size, how names look — are measured, collected and asked together at the end with AskUserQuestion. Never decide them silently, never block the other steps on them.
- Simulation and mechanical work on Sonnet (`learner` agent, `model: "sonnet"` subagents); triage, root causes and fix design on Opus; blind judging on the `judge` agent.

## Step 0 — Orient
1. Read the log's "Current" section. A cycle marked in flight → resume it at its recorded step; don't start another.
2. Otherwise start cycle `c<NNN>` (next number): `git fetch`, a worktree from `origin/main` for the cycle's log PR, note the sha.
3. Tidy due? (every third cycle, or the inventory grew ≥ 15% since the last tidy, or a pair was added since) → run [references/tidy.md](references/tidy.md) instead of steps 1–6, then step 7.
4. Corpus refresh due (every 4th cycle, or a site changed its captions/layout)? → refresh one learning language's corpus with real-content-quality Phase 1 on a Sonnet subagent, update `scripts/corpora.json`, and start a new baseline for that language.

## Step 1 — Sweep (script)
```
npx jiti .claude/skills/language-cycle/scripts/sweep.ts --cycle=c<NNN> --label=base
python3 -I .claude/skills/language-cycle/scripts/compare-sweeps.py --before <prev cycle>/<its last sweep> --after <c<NNN>>/base --out <c<NNN>>/base/compare.md
```
- Pairs come from the lock (`packs.lock.json` `pairs`), corpora from `scripts/corpora.json`. 18 pairs take ~6 minutes (rows in parallel, then 3 timing runs per pair one at a time).
- Rows are deterministic (0 changed rows on the same commit): every changed row between cycles comes from merged code or data. WORSE flags (unknown share, no entry, translated, over cap, no native line, pack size) become picks. MOVED (density, names) goes to the report.
- Timing CHECK flags are noise until `timing-ab.ts` (interleaved runs of the two checkouts) shows a ratio > 1.15, slower in ≥ 4 of 5 rounds and ≥ 20 ms; only then is it a pick.

## Step 2 — Simulate (Sonnet)
```
python3 -I .claude/skills/language-cycle/scripts/sim-packets.py --sweep <c>/base --out <this checkout>/data/raw/quality/cycles/c<NNN>/sim --seed <NNN>
```
- The sim folder is in **this session's checkout** (a real git-ignored folder, not a link to the main checkout): subagents' Write calls are refused outside the session's worktree. Name the absolute path in each brief. `sim-tally.py` reads it there.
- One `learner` agent per pair (`subagent_type: "learner"`; if the type is not loaded in this session, `general-purpose` with `model: "sonnet"` and the text of `.claude/agents/learner.md` in the brief), all in one message, `run_in_background: true`. Brief: only the packet path and `BRIEF.txt`.
- Level: 3000 for all; rotate one learning language per cycle to 1000 or 8000 (`sweep.ts --level` into a second label, packets from it) and say so in the log.
- What the packet cannot show is in [references/simulation.md](references/simulation.md) ("Limits"); don't treat its absence as a finding.

## Step 3 — Triage (Opus, you)
```
python3 -I .claude/skills/language-cycle/scripts/sim-tally.py --sim <c>/sim
```
1. Read `tally.md`. Sonnet findings are leads: for each candidate cluster, open its rows in `runs/<pair>/rows.jsonl` and confirm the problem is real and is what the rows say.
2. Name the cause, not the symptom, and its layer: a cluster from ≥ 3 natives on the same words → LEARNING/CORE; a pair hot spot → NATIVE/PAIR. A NATIVE fix that would be the same in ≥ 2 natives is a CORE rule with a per-native parameter.
3. Rank by weight × pairs affected, then by cost. Pick at most 3 causes plus every WORSE flag from step 1. Keep the rest in the log's queue (with evidence), merging into existing queue items rather than adding near-duplicates.
4. Write the cycle's report section in the log now (picks, why, queue), so a resumed session knows.

## Step 4 — Fix (one cause per step)
For each pick: real-content-quality Phase 4 (prototype in `<c>/proto/`, blind A/B with `judge` agents on a fresh sample, held-out site frozen), then Phase 6 (one background subagent per step from [step-brief.md](../real-content-quality/references/step-brief.md), its own worktree, PR, `merge-when-green.sh`). Add to each brief: "Measure with `sweep.ts --pairs=<affected pairs>` on main and on your branch and paste `compare-sweeps.py` output in the PR body." A pick whose prototype does not beat the current build blind is recorded as Dropped with its numbers.

## Step 5 — Re-measure wide (script)
After each merge, on an `origin/main` worktree: `sweep.ts --label=after-<step>`, then `compare-sweeps.py` against `base`. Changed rows outside the step's pairs or kinds, or any WORSE flag, are looked at before the next step; a real regression becomes the next step.

## Step 6 — Real-site check
real-content-quality Phase 7 on the pairs the merged steps touched, plus one other native each cycle in rotation (switch pairs only through the check build's settings channel; restore the user's settings). End with the `langle:check-errors` log read, every entry explained, and the log cleared. Skip only when no merged step changes what a learner sees, and say so.

## Step 7 — Log and finish
1. In the log: picks with PRs and before → after numbers per affected pair, Dropped ideas, queue, inventory totals (`rule-inventory.ts`), next tidy due, "Current" back to idle.
2. `docs/status.md` only for behaviour that shipped.
3. The log PR: commit, push, draft PR, verify, ready, `merge-when-green.sh --cleanup`.
4. Collected trade-offs → one AskUserQuestion with the measured options. Then clean up merged worktrees and branches (memory), and fast-forward local main.
