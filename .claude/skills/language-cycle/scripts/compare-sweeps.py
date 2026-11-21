#!/usr/bin/env python3
"""Two sweeps (sweep.ts) -> what moved, per pair.

  python3 -I .claude/skills/language-cycle/scripts/compare-sweeps.py \
      --before <cycles/<c>/<label>> --after <cycles/<c>/<label>> [--out compare.md] [--samples 5]

Per pair, from summary.json `all` and timing.json:
- quality numbers (unknown share, New and phrase highlights per 1,000 tokens, names, words
  with no entry, hovers translated at display, lines over the width cap, cards with no
  native line), with WORSE flags where the direction is clear and MOVED where it is a
  trade-off (density);
- timing (median classify ms per 1,000 tokens, load times), marked CHECK only: two sweeps
  run at different times move with the machine's load (+140% on the same commit), so a
  CHECK is settled with timing-ab.ts, which interleaves the two checkouts' runs;
- the packs' raw size (deterministic: WORSE above +5%);
- rows that changed: rows are matched by (doc, unit, start, kind) and compared on key,
  category, verdict and hover. A tidy-up's acceptance is zero changed rows.

Exit code 2 when any WORSE flag is raised, so a caller can stop on it.
"""
import argparse
import json
import os
import sys

QUALITY = [
    # name, path in summary["all"], kind: "worse-up" (higher is worse), "moved"
    ("unknown %", "unknownPct", "worse-up", 0.2),
    ("New /1k", "newPer1k", "moved", 0.05),
    ("phrases /1k", "phrasesPer1k", "moved", 0.05),
    ("names", "names", "moved", 0.05),
    ("no entry", "noEntry", "worse-up", 0.10),
    ("translated", "translatedAtDisplay", "worse-up", 0.10),
    ("over cap", "linesOverCap", "worse-up", 0.10),
    ("no native", "cardsNoNative", "worse-up", 0.05),
]
TIMING = [("ms/1k", "msPer1k", 0.15)]
LOAD_LIMIT = 0.20
SIZE_LIMIT = 0.05


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def row_key(r):
    return (r["doc"], r.get("unit"), r.get("start"), r["kind"])


def row_view(r):
    return (r.get("key"), r.get("category"), r.get("verdict"), tuple(r.get("hover") or ()))


def changed_rows(before, after, samples):
    def read(path):
        out = {}
        if not os.path.exists(path):
            return out
        with open(path) as f:
            for line in f:
                if line.strip():
                    r = json.loads(line)
                    out[row_key(r)] = r
        return out

    a, b = read(before), read(after)
    keys = set(a) | set(b)
    diff = [k for k in keys if (k in a) != (k in b) or row_view(a[k]) != row_view(b[k])]
    diff.sort(key=lambda k: tuple(str(x) for x in k))
    shown = []
    for k in diff[:samples]:
        ra, rb = a.get(k), b.get(k)
        r = rb or ra
        shown.append({
            "surface": r.get("surface"),
            "sentence": (r.get("sentence") or "")[:120],
            "before": row_view(ra) if ra else None,
            "after": row_view(rb) if rb else None,
        })
    return len(diff), len(keys), shown


def rel(a, b):
    if a == 0:
        return 0.0 if b == 0 else float("inf")
    return (b - a) / abs(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--out")
    ap.add_argument("--samples", type=int, default=5)
    args = ap.parse_args()

    sb, sa = load(os.path.join(args.before, "sweep.json")), load(os.path.join(args.after, "sweep.json"))
    lines = [f"# Sweep {args.before} -> {args.after}", ""]
    if sb and sa:
        lines.append(f"Before {sb['sha']} (jobs {sb['jobs']}), after {sa['sha']} (jobs {sa['jobs']}).")
        if sb["jobs"] != sa["jobs"]:
            lines.append("WARNING: different JOBS, timing is not comparable.")
        lines.append("")
    pairs = sorted(set((sb or {}).get("pairs", [])) | set((sa or {}).get("pairs", [])))
    flags = []
    table = ["| pair | metric | before | after | change | flag |", "|---|---|---|---|---|---|"]
    rowlines = ["", "## Changed rows", "", "| pair | changed | of | samples |", "|---|---|---|---|"]
    details = []
    for pair in pairs:
        b = load(os.path.join(args.before, "runs", pair, "summary.json"))
        a = load(os.path.join(args.after, "runs", pair, "summary.json"))
        if not a or not b:
            flags.append((pair, "missing", "WORSE" if not a else "NEW"))
            table.append(f"| {pair} | (summary) | {'yes' if b else '-'} | {'yes' if a else '-'} | | {'WORSE' if not a else 'NEW'} |")
            continue
        for name, key, kind, limit in QUALITY:
            vb, va = b["all"].get(key, 0), a["all"].get(key, 0)
            if vb == va:
                continue
            change = va - vb if key == "unknownPct" else rel(vb, va)
            big = abs(change) > limit
            flag = ""
            if big and kind == "worse-up" and change > 0:
                flag = "WORSE"
            elif big:
                flag = "MOVED"
            shown = f"{change:+.2f} pt" if key == "unknownPct" else f"{change:+.1%}"
            table.append(f"| {pair} | {name} | {vb} | {va} | {shown} | {flag} |")
            if flag:
                flags.append((pair, name, flag))
        tb = load(os.path.join(args.before, "runs", pair, "timing.json")) or {}
        ta = load(os.path.join(args.after, "runs", pair, "timing.json")) or {}
        if tb and ta:
            for name, key, limit in TIMING:
                c = rel(tb[key], ta[key])
                flag = "CHECK" if c > limit else ""
                if abs(c) > 0.05 or flag:
                    table.append(f"| {pair} | {name} | {tb[key]} | {ta[key]} | {c:+.0%} | {flag} |")
                if flag:
                    flags.append((pair, name, flag))
            for k in ta["loadMs"]:
                vb, va = tb["loadMs"].get(k), ta["loadMs"][k]
                if vb is None:
                    continue
                c = rel(vb, va)
                # Loads under 100 ms move by tens of percent with scheduling noise.
                flag = "CHECK" if c > LOAD_LIMIT and va - vb > 50 else ""
                if flag or abs(c) > 0.10:
                    table.append(f"| {pair} | load {k} ms | {vb} | {va} | {c:+.0%} | {flag} |")
                if flag:
                    flags.append((pair, f"load {k}", flag))
            c = rel(tb["packBytes"], ta["packBytes"])
            if c:
                flag = "WORSE" if c > SIZE_LIMIT else ""
                table.append(f"| {pair} | pack MB | {tb['packBytes']/1e6:.2f} | {ta['packBytes']/1e6:.2f} | {c:+.1%} | {flag} |")
                if flag:
                    flags.append((pair, "pack size", flag))
        n, total, shown = changed_rows(
            os.path.join(args.before, "runs", pair, "rows.jsonl"),
            os.path.join(args.after, "runs", pair, "rows.jsonl"),
            args.samples,
        )
        rowlines.append(f"| {pair} | {n} | {total} | {len(shown)} below |" if n else f"| {pair} | 0 | {total} | |")
        if shown:
            details.append(f"### {pair}")
            for s in shown:
                details.append(f"- `{s['surface']}`: {s['before']} -> {s['after']} — {s['sentence']}")
            details.append("")

    worse = [f for f in flags if f[2] == "WORSE"]
    count = lambda name: sum(f[2] == name for f in flags)
    lines.append(f"Flags: {len(worse)} WORSE, {count('MOVED')} MOVED, {count('CHECK')} CHECK (timing).")
    for pair, name, flag in flags:
        lines.append(f"- {flag} {pair}: {name}")
    lines += ["", "## Numbers (changed only)", ""] + table + rowlines + [""] + details
    text = "\n".join(lines) + "\n"
    if args.out:
        with open(args.out, "w") as f:
            f.write(text)
        print(f"{args.out}: {len(worse)} WORSE, {len(flags) - len(worse)} other flags")
    else:
        sys.stdout.write(text)
    sys.exit(2 if worse else 0)


if __name__ == "__main__":
    main()
