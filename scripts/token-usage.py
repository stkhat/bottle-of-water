"""Where Claude Code tokens go in this project's sessions (docs/notes/token-usage.md).

Reads the local transcripts in ~/.claude/projects/*<PROJECT>*/ (parent sessions and their
subagents/) and prints price-weighted totals. Read-only; nothing leaves the machine.

  python3 -I scripts/token-usage.py [sessions|subagents|attribution|cap|all] [--since YYYY-MM-DD]

Weights are relative prices (input 1, cache write 1.25, cache read 0.1, output 5), so shares
compare like cost. PROJECT defaults to "langle".
"""

import collections
import glob
import json
import os
import re
import statistics
import sys

W = {"inp": 1.0, "cw": 1.25, "cr": 0.1, "out": 5.0}
ROOT = os.path.expanduser("~/.claude/projects")
PROJECT = os.environ.get("PROJECT", "langle")
CHARS_PER_TOKEN = 3.5


def transcripts(since):
    for f in glob.glob(f"{ROOT}/*{PROJECT}*/**/*.jsonl", recursive=True):
        recs = []
        for line in open(f, encoding="utf-8"):
            try:
                recs.append(json.loads(line))
            except ValueError:
                pass
        first = min((r["timestamp"] for r in recs if r.get("timestamp")), default="")
        if since and first[:10] < since:
            continue
        rel = f[len(ROOT) + 1 :].split("/")
        yield {"path": f, "sub": "/subagents/" in f, "session": rel[1].removesuffix(".jsonl"), "first": first, "recs": recs}


def calls(recs):
    """One entry per API call: (context tokens, usage dict). Streamed chunks share a message id."""
    seen = set()
    for r in recs:
        m = r.get("message") or {}
        u = m.get("usage")
        if not u or m.get("id") in seen:
            continue
        seen.add(m.get("id"))
        d = {
            "inp": u.get("input_tokens") or 0,
            "cw": u.get("cache_creation_input_tokens") or 0,
            "cr": u.get("cache_read_input_tokens") or 0,
            "out": u.get("output_tokens") or 0,
        }
        yield d["inp"] + d["cw"] + d["cr"], d, m.get("model")


def cost(u):
    return sum(W[k] * u[k] for k in W)


def blocks(recs):
    for r in recs:
        cont = (r.get("message") or {}).get("content")
        if isinstance(cont, str):
            yield r, {"type": "text", "text": cont}
        elif isinstance(cont, list):
            for b in cont:
                if isinstance(b, dict):
                    yield r, b


def result_chars(b):
    c = b.get("content")
    if isinstance(c, list):
        return sum(len(x.get("text", "")) if x.get("type") == "text" else 5000 for x in c if isinstance(x, dict))
    return len(str(c or ""))


def bash_kind(cmd):
    c = re.sub(r"^(cd [^&;]+(&&|;)\s*)+", "", cmd.strip())
    if re.search(r"\bsleep\b|\buntil\b|\bwhile\b", c):
        return "wait/poll loop"
    for pat, kind in [
        (r"npm run verify", "verify"),
        (r"npm (run )?test|vitest", "tests"),
        (r"npm run check|tsc|eslint", "check"),
        (r"playwright|test:e2e", "e2e"),
        (r"npm run (build|dev)|wxt", "build"),
    ]:
        if re.search(pat, c):
            return kind
    head = c.split()[0] if c.split() else ""
    if head in ("gh", "git"):
        return f"{head} {c.split()[1] if len(c.split()) > 1 else ''}".strip()
    if head in ("python3", "python", "node", "npx", "tsx"):
        return f"script ({head})"
    if head in ("grep", "rg", "find", "ls", "cat", "head", "tail", "wc", "sed", "awk", "jq"):
        return f"read: {head}"
    return "other"


def tool_names(recs):
    names = {}
    for _, b in blocks(recs):
        if b.get("type") == "tool_use":
            n = b.get("name", "?")
            if n == "Bash":
                n = "Bash " + bash_kind((b.get("input") or {}).get("command", ""))
            elif n.startswith("mcp__"):
                n = "mcp " + n.split("__")[1]
            names[b.get("id")] = n
    return names


def sessions(ts):
    per = collections.defaultdict(lambda: {"main": collections.Counter(), "sub": collections.Counter(), "nsub": 0, "turns": [0, 0], "maxctx": 0, "first": ""})
    model = collections.Counter()
    results = collections.Counter()
    nres = collections.Counter()
    for t in ts:
        s = per[t["session"]]
        s["nsub"] += t["sub"]
        if not t["sub"]:
            s["first"] = t["first"]
        for ctx, u, m in calls(t["recs"]):
            s["sub" if t["sub"] else "main"].update(u)
            s["turns"][t["sub"]] += 1
            if not t["sub"]:
                s["maxctx"] = max(s["maxctx"], ctx)
            model[(m, "sub" if t["sub"] else "main")] += cost(u)
        names = tool_names(t["recs"])
        for _, b in blocks(t["recs"]):
            if b.get("type") == "tool_result":
                k = names.get(b.get("tool_use_id"), "?")
                results[k] += result_chars(b)
                nres[k] += 1
    total = sum(cost(s["main"]) + cost(s["sub"]) for s in per.values())
    print(f"sessions={len(per)} weighted={total / 1e6:.0f}M")
    for part in ("main", "sub"):
        agg = collections.Counter()
        for s in per.values():
            agg.update(s[part])
        print(f"  {part:4}", "  ".join(f"{k} {W[k] * agg[k] / total * 100:4.1f}%" for k in W))
    print("\nTop sessions: weighted M (main+sub), subagents, turns main/sub, max parent ctx, date")
    for k, s in sorted(per.items(), key=lambda kv: -(cost(kv[1]["main"]) + cost(kv[1]["sub"])))[:15]:
        c = cost(s["main"]) + cost(s["sub"])
        print(f"  {c / 1e6:6.1f} ({cost(s['main']) / 1e6:5.1f}+{cost(s['sub']) / 1e6:5.1f}) {s['nsub']:4d} {s['turns'][0]:4d}/{s['turns'][1]:5d} {s['maxctx'] / 1e3:4.0f}k {s['first'][:10]} {k[:8]}")
    print("\nModel share:")
    for (m, part), c in model.most_common(6):
        print(f"  {c / total * 100:5.1f}% {m} {part}")
    print("\nTool results (M chars, count):")
    for k, n in results.most_common(15):
        print(f"  {n / 1e6:6.2f}M {nres[k]:6d}  {k}")


def subagents(ts):
    rows = []
    for t in ts:
        if not t["sub"]:
            continue
        meta = {}
        mp = t["path"].removesuffix(".jsonl") + ".meta.json"
        if os.path.exists(mp):
            meta = json.load(open(mp))
        cs = list(calls(t["recs"]))
        if not cs:
            continue
        u = collections.Counter()
        for _, d, _ in cs:
            u.update(d)
        rows.append({
            "cost": cost(u), "turns": len(cs), "first": cs[0][0], "avg": sum(c for c, _, _ in cs) / len(cs),
            "max": max(c for c, _, _ in cs), "model": next((m for _, _, m in cs if m and m != "<synthetic>"), "?"), "type": meta.get("agentType", "?"), "desc": meta.get("description", ""),
        })
    total = sum(r["cost"] for r in rows)
    print(f"subagents={len(rows)} weighted={total / 1e6:.0f}M")
    print(f"  median turns {statistics.median(r['turns'] for r in rows):.0f}, median first ctx {statistics.median(r['first'] for r in rows) / 1e3:.0f}k, "
          f"median avg ctx {statistics.median(r['avg'] for r in rows) / 1e3:.0f}k")
    print("\nTop subagents: weighted M, turns, first/avg/max ctx, type, model, description")
    for r in sorted(rows, key=lambda r: -r["cost"])[:20]:
        print(f"  {r['cost'] / 1e6:5.1f} {r['turns']:4d} {r['first'] / 1e3:4.0f}k/{r['avg'] / 1e3:4.0f}k/{r['max'] / 1e3:4.0f}k {r['type'][:16]:16} {str(r['model'])[-10:]:10} {r['desc'][:50]}")


def attribution(ts):
    """Cache-read cost of each kind of content: its tokens x the API calls it stays in context for."""
    attr = collections.Counter()
    for t in ts:
        names = tool_names(t["recs"])
        events = []
        seen = set()
        for r, b in blocks(t["recs"]):
            m = r.get("message") or {}
            if m.get("usage") and m.get("id") not in seen:
                seen.add(m.get("id"))
                events.append(("call", (m["usage"].get("cache_read_input_tokens") or 0)))
            kind = b.get("type")
            if kind == "text":
                events.append(("add", "assistant text" if r.get("type") == "assistant" else "user text (briefs, skills, reminders)", len(b.get("text", ""))))
            elif kind == "tool_use":
                n = b.get("name", "?")
                events.append(("add", "tool input: " + ("mcp" if n.startswith("mcp__") else n), len(json.dumps(b.get("input") or {}))))
            elif kind == "tool_result":
                events.append(("add", "result: " + names.get(b.get("tool_use_id"), "?"), result_chars(b)))
        ncalls = sum(1 for e in events if e[0] == "call")
        if not ncalls:
            continue
        first = next(e[1] for e in events if e[0] == "call")
        attr["start-up context (system prompt, tools)"] += first * ncalls
        left = ncalls
        for e in events:
            if e[0] == "call":
                left -= 1
            else:
                attr[e[1]] += e[2] / CHARS_PER_TOKEN * left
    total = sum(attr.values())
    print("Share of attributed cache reads (the rest is thinking and reminders not in transcripts):")
    for k, v in attr.most_common(20):
        print(f"  {v / total * 100:5.1f}%  {k}")


def cap(ts):
    """Replay every transcript as if auto-compact fired at a context cap (crude: same turns afterwards)."""
    seqs = [[(ctx, d) for ctx, d, _ in calls(t["recs"])] for t in ts]
    seqs = [s for s in seqs if s]

    def run(limit):
        tot = 0.0
        for s in seqs:
            reset = s[0][0] + 15000  # start-up context plus a summary
            off = 0
            for ctx, d in s:
                e = ctx - off
                if e < 0:  # a real compaction happened here
                    off, e = 0, ctx
                if limit and e > limit:
                    tot += 0.1 * e + 5 * 12000 + 1.25 * reset  # the compaction call and the rewritten cache
                    off, e = ctx - reset, reset
                tot += 0.1 * max(0, e - d["cw"]) + 1.25 * d["cw"] + 5 * d["out"]
        return tot

    base = run(None)
    print(f"no cap: {base / 1e6:.0f}M weighted")
    for limit in (500_000, 400_000, 300_000, 200_000):
        print(f"  cap {limit // 1000}k: {(1 - run(limit) / base) * 100:3.0f}% less")


def main(argv):
    since = argv[argv.index("--since") + 1] if "--since" in argv else None
    what = next((a for a in argv if a in ("sessions", "subagents", "attribution", "cap", "all")), "all")
    ts = list(transcripts(since))
    for name, fn in [("sessions", sessions), ("subagents", subagents), ("attribution", attribution), ("cap", cap)]:
        if what in (name, "all"):
            print(f"\n== {name}")
            fn(ts)


if __name__ == "__main__":
    main(sys.argv[1:])
