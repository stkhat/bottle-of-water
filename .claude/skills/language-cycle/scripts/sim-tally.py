#!/usr/bin/env python3
"""Learner findings (sim-packets.py, learner agents) -> clusters for triage.

  python3 -I .claude/skills/language-cycle/scripts/sim-tally.py --sim <cycles/<c>/sim> \
      [--out <sim>/tally.md]

Each finding is joined to its row through <pair>.key.json (key, part of speech, the pack
its meaning came from, hoverKind). Then three views, all sorted by weight (sum of
severities):

1. Same words, several natives: findings on the same unit and words of one learning
   language from natives of different pairs. Reported by >= 3 natives -> the cause is
   most likely in the learning language or the core (LEARNING/CORE); by 1 -> the native
   or the pair (NATIVE/PAIR).
2. Mechanisms: kind x where the meaning came from (hoverKind, pack file) x part of speech,
   across all pairs; a large cluster is a rule to look at, whatever the words.
3. Pair hot spots: per pair and kind, findings per unit read, against the median of the
   other natives of the same learning language; >= 2x the median marks the pair.

Also: units understood per pair (from the session lines) and malformed lines.
Writes tally.md and clusters.json; findings are leads to check against rows.jsonl, not
verdicts.
"""
import argparse
import glob
import json
import os
import re
import statistics
from collections import defaultdict


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sim", required=True)
    ap.add_argument("--out")
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()

    findings, sessions, bad = [], {}, []
    for path in sorted(glob.glob(os.path.join(args.sim, "findings-*.jsonl"))):
        pair = os.path.basename(path)[len("findings-"):-len(".jsonl")]
        with open(os.path.join(args.sim, f"{pair}.key.json")) as f:
            key = json.load(f)["units"]
        with open(path) as f:
            for n, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    x = json.loads(line)
                except json.JSONDecodeError:
                    bad.append(f"{pair}:{n}")
                    continue
                if x.get("session"):
                    sessions[pair] = x
                    continue
                unit = key.get(x.get("unit"), {})
                target = unit.get("targets", {}).get(x.get("target") or "", {})
                x.update(
                    pair=pair,
                    learning=pair.split("-")[0],
                    native=pair.split("-")[1],
                    doc=unit.get("doc"),
                    docUnit=unit.get("unit"),
                    row=target,
                    severity=int(x.get("severity") or 1),
                )
                findings.append(x)

    lines = [f"# Learner simulation tally ({len(findings)} findings, {len(sessions)} sessions)", ""]
    if bad:
        lines += [f"Malformed lines: {', '.join(bad)}", ""]

    # Sessions.
    lines += ["## Sessions", "", "| pair | units | understood | findings | weight | would save |", "|---|---|---|---|---|---|"]
    per_pair = defaultdict(list)
    for x in findings:
        per_pair[x["pair"]].append(x)
    for pair in sorted(set(per_pair) | set(sessions)):
        s = sessions.get(pair, {})
        fs = per_pair[pair]
        lines.append(
            f"| {pair} | {s.get('units', '?')} | {s.get('understood', '?')} | {len(fs)} | "
            f"{sum(x['severity'] for x in fs)} | {len(s.get('wouldSave', []))} |")
    lines.append("")

    # 1. Same words, several natives.
    same = defaultdict(list)
    for x in findings:
        same[(x["learning"], x["doc"], x["docUnit"], norm(x.get("surface")))].append(x)
    clusters1 = []
    for (learning, doc, unit, surface), xs in same.items():
        natives = sorted({x["native"] for x in xs})
        clusters1.append({
            "learning": learning, "doc": doc, "unit": unit, "surface": surface,
            "natives": natives, "layer": "LEARNING/CORE" if len(natives) >= 3 else "NATIVE/PAIR",
            "kinds": sorted({x["kind"] for x in xs}),
            "weight": sum(x["severity"] for x in xs),
            "key": next((x["row"].get("key") for x in xs if x["row"].get("key")), None),
            "from": sorted({str(x["row"].get("from")) for x in xs if x["row"]}),
            "notes": [f"{x['native']}: {x.get('note', '')}" for x in xs][:6],
        })
    clusters1.sort(key=lambda c: (-len(c["natives"]), -c["weight"]))
    multi = [c for c in clusters1 if len(c["natives"]) >= 3]
    lines += [f"## 1. Same words, several natives ({len(multi)} reported by >= 3 natives)", ""]
    for c in clusters1[: args.top]:
        lines.append(
            f"- **{c['surface']}** ({c['learning']}, {c['doc']}#{c['unit']}, key `{c['key']}`) — "
            f"{len(c['natives'])} natives [{' '.join(c['natives'])}], {', '.join(c['kinds'])}, "
            f"weight {c['weight']}, from {', '.join(c['from']) or '-'} → {c['layer']}")
        for note in c["notes"][:3]:
            lines.append(f"  - {note}")
    lines.append("")

    # 2. Mechanisms.
    mech = defaultdict(list)
    for x in findings:
        r = x["row"]
        source = r.get("from") or "-"
        source = source.split("/")[-1] if "/" in source else source
        mech[(x["kind"], r.get("hoverKind") or "-", source, r.get("kind") or "-", r.get("pos") or "-")].append(x)
    clusters2 = sorted(
        ({"kind": k[0], "hoverKind": k[1], "file": k[2], "rowKind": k[3], "pos": k[4],
          "count": len(xs), "weight": sum(x["severity"] for x in xs),
          "pairs": sorted({x["pair"] for x in xs}),
          "examples": [f"{x['pair']} \"{x.get('surface')}\": {x.get('note', '')}" for x in xs[:4]]}
         for k, xs in mech.items()),
        key=lambda c: -c["weight"])
    lines += ["## 2. Mechanisms (kind × hoverKind × pack file × row kind × POS)", "",
              "| kind | hoverKind | file | row | pos | n | weight | pairs |", "|---|---|---|---|---|---|---|---|"]
    for c in clusters2[: args.top]:
        lines.append(
            f"| {c['kind']} | {c['hoverKind']} | {c['file']} | {c['rowKind']} | {c['pos']} | {c['count']} | "
            f"{c['weight']} | {len(c['pairs'])} |")
    lines.append("")
    for c in clusters2[:8]:
        lines.append(f"- {c['kind']} / {c['hoverKind']} / {c['file']} / {c['pos']}:")
        lines += [f"  - {e}" for e in c["examples"]]
    lines.append("")

    # 3. Pair hot spots.
    rate = defaultdict(float)
    for x in findings:
        units = sessions.get(x["pair"], {}).get("units") or 40
        rate[(x["pair"], x["kind"])] += x["severity"] / units
    by_learning_kind = defaultdict(dict)
    for (pair, kind), r in rate.items():
        by_learning_kind[(pair.split("-")[0], kind)][pair] = r
    hot = []
    for (learning, kind), rates in by_learning_kind.items():
        pairs = [p for p in per_pair if p.startswith(learning + "-")]
        for pair in pairs:
            others = [rates.get(p, 0.0) for p in pairs if p != pair]
            if len(others) < 2:
                continue
            med = statistics.median(others)
            mine = rates.get(pair, 0.0)
            if mine >= 0.1 and mine >= 2 * max(med, 0.02):
                hot.append({"pair": pair, "kind": kind, "rate": round(mine, 2), "median": round(med, 2)})
    hot.sort(key=lambda h: -h["rate"])
    lines += ["## 3. Pair hot spots (weight per unit >= 2x the other natives' median)", ""]
    lines += [f"- {h['pair']} {h['kind']}: {h['rate']} vs {h['median']} → NATIVE/PAIR" for h in hot] or ["- none"]
    lines.append("")

    text = "\n".join(lines) + "\n"
    out = args.out or os.path.join(args.sim, "tally.md")
    with open(out, "w") as f:
        f.write(text)
    with open(os.path.join(os.path.dirname(out), "clusters.json"), "w") as f:
        json.dump({"sameWords": clusters1, "mechanisms": clusters2, "hotSpots": hot,
                   "sessions": sessions}, f, ensure_ascii=False, indent=1)
    print(f"{out}: {len(findings)} findings, {len(multi)} multi-native clusters, {len(hot)} hot spots")


if __name__ == "__main__":
    main()
