# Token usage in Langle sessions

Measured 2026-11-20 over every local Claude Code transcript of this project (2026-11-07 → 2026-11-20): 44 parent sessions and 545 subagents. Rerun with `python3 -I scripts/token-usage.py [sessions|subagents|attribution|cap] [--since YYYY-MM-DD]`.

Tokens are weighted by relative price (input 1, cache write 1.25, cache read 0.1, output 5), so shares compare like cost.

## Where it went

| | share |
| --- | --- |
| Subagents | 80% |
| Parent sessions | 20% |
| Cache reads (re-reading the context every turn) | 74% |
| Cache writes | 15% |
| Output (incl. thinking) | 11% |
| Opus 5.5 / Sonnet + Haiku | 99% / < 1% |

- **Cost ≈ turns × context size.** With `"model": "opus[1m]"` and no compaction cap, long subagents kept growing: the 30 costliest ran 200–460 turns at an average context of 300–490k tokens (peaks 600–800k). One such subagent costs as much as ~150 typical ones (median: 5 turns, 83k average context).
- **Five sessions were 2/3 of everything**: the language-expansion and data-quality rounds (real-content-quality skill), each with 40–126 subagents.
- **Iteration loops drive the turn count.** One step made 284 single Edits to one heuristic script, each turn re-reading ~450k tokens.
- **Blind judges**: 363 agents, 8%. Each started with the full general-purpose toolset (79 tools, ~60k tokens of start-up context) to read one rubric and one packet.

What fills the context, weighted by how many later calls it stays for (`attribution`; ~27% is thinking and reminders the transcripts don't hold):

| | share |
| --- | --- |
| Start-up context (system prompt, tools) | 17% |
| Briefs, skill bodies, reminders | 17% |
| Output of `sed`/`cat`/`grep` and Read | 26% |
| Bash command text (long inline scripts) | 9% |
| Edit/Write inputs | 7% |
| ToolSearch schemas | 4% |

Docs were not the problem: reads of architecture.md / status.md were targeted (~4k chars each on average).

## What was changed

- **Auto-compact at 300k** (`"autoCompactWindow": 300000` in the user's `~/.claude/settings.json`). Replaying the logs with a cap: 400k −17%, 300k −25%, 200k −32% (crude: assumes the same turns after compaction). 300k keeps the risk of losing detail mid-step low.
- **`judge` agent type** (`.claude/agents/judge.md`): Opus, Read/Write only, so a judge starts small.
- **Model routing** (user decision): judges and judgement-driven work stay on Opus; collection, measurement runs, fixed-checklist checks and mechanical edits pass `model: "sonnet"`.
- **Step size**: one subagent per measurable fix; stop at ~150 turns or ~250k context with a handoff note and continue in a fresh subagent.
- **Turn and output habits** in CLAUDE.md "Token budget" and the step brief: batch independent calls, script files instead of inline scripts, small outputs, read by range.

Not changed: global effort (`high`), user-level plugin and skill lists (a few % at most), `CLAUDE_CODE_SUBAGENT_MODEL` (it would move judges and design work too).

## Checking it worked

After the next large session, rerun the script with `--since`: subagent transcripts should show compactions near 300k, the average context of the top subagents should drop below ~200k, and Sonnet's share should rise.
