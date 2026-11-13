"""Tally judged A/B packets back to the versions (references/judging.md, "Reading the results").

  python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py \
    --key <packets dir>/key-<tag>.json <result.json> [<result.json> …] [--json <out.json>]

A result is a judge's JSON for one packet: {"words": [{"id", "X", "Y", "pref"}],
"units": [{"id", "X": [{"phrase", "label", "fits"}], "Y": [...], "missed": [...], "pref"}]}.
Per site it prints:
- hover verdict rates (good / acceptable / wrong / misleading) for before and after,
  re-weighted to the corpus: rate = p·rate(changed) + (1−p)·rate(unchanged), p being
  the share of changed words in the corpus (the key's population counts);
- preferences on changed and on unchanged words (after / before / same);
- phrase labels per version (useful / low-value / wrong-match, and how many fit), unit
  preferences on changed units, missed expressions by value, and phrase highlights per
  1,000 tokens from the two runs' summaries.
One judge per item: treat differences under about 4 points as noise.
"""

import argparse
import collections
import json

p = argparse.ArgumentParser()
p.add_argument("--key", required=True)
p.add_argument("--json", help="also write the numbers here")
p.add_argument("results", nargs="+")
a = p.parse_args()

with open(a.key, encoding="utf-8") as f:
    key = json.load(f)
items, meta = key["items"], key["meta"]
VERDICTS = ["good", "acceptable", "wrong", "misleading"]
LABELS = ["useful", "low-value", "wrong-match"]

verdicts = collections.defaultdict(collections.Counter)  # (site, changed, version)
prefs = collections.defaultdict(collections.Counter)  # (site, kind, changed)
labels = collections.defaultdict(collections.Counter)  # (site, version)
missed = collections.defaultdict(collections.Counter)  # site
unknown_ids = 0


def version(item, side):
    return item["X"] if side == "X" else ("after" if item["X"] == "before" else "before")


def preference(item, pref):
    return "same" if pref not in ("X", "Y") else version(item, pref)


for path in a.results:
    with open(path, encoding="utf-8") as f:
        result = json.load(f)
    for w in result.get("words", []):
        item = items.get(w["id"])
        if not item:
            unknown_ids += 1
            continue
        for side in "XY":
            verdicts[(item["site"], item["changed"], version(item, side))][w[side]] += 1
        prefs[(item["site"], "word", item["changed"])][preference(item, w["pref"])] += 1
    for u in result.get("units", []):
        item = items.get(u["id"])
        if not item:
            unknown_ids += 1
            continue
        for side in "XY":
            for d in u.get(side, []):
                c = labels[(item["site"], version(item, side))]
                c[d["label"]] += 1
                if d.get("fits"):
                    c["fits"] += 1
        prefs[(item["site"], "unit", item["changed"])][preference(item, u["pref"])] += 1
        for m in u.get("missed", []):
            missed[item["site"]][m["value"]] += 1


def rate(counter, names):
    total = sum(counter.values())
    return sum(counter[n] for n in names) / total if total else None


out = {}
sites = sorted({i["site"] for i in items.values()})
for site in sites:
    pop = meta["population"].get(site, {})
    changed_n, same_n = pop.get("words changed", 0), pop.get("words same", 0)
    share = changed_n / (changed_n + same_n) if changed_n + same_n else 0
    row = {"changedShare": round(share, 4)}
    for ver in ("before", "after"):
        rates = {}
        for v in VERDICTS + ["bad"]:
            names = ["wrong", "misleading"] if v == "bad" else [v]
            rc = rate(verdicts[(site, True, ver)], names)
            rs = rate(verdicts[(site, False, ver)], names)
            if rc is None and rs is None:
                rates[v] = None
            else:
                rc = rs if rc is None else rc
                rs = rc if rs is None else rs
                rates[v] = round(share * rc + (1 - share) * rs, 4)
        row[ver] = rates
        row[f"judged {ver}"] = {
            "changed": sum(verdicts[(site, True, ver)].values()),
            "unchanged": sum(verdicts[(site, False, ver)].values()),
        }
    row["pref words changed"] = dict(prefs[(site, "word", True)])
    row["pref words unchanged"] = dict(prefs[(site, "word", False)])
    row["phrases before"] = dict(labels[(site, "before")])
    row["phrases after"] = dict(labels[(site, "after")])
    row["pref units changed"] = dict(prefs[(site, "unit", True)])
    row["pref units unchanged"] = dict(prefs[(site, "unit", False)])
    row["missed"] = dict(missed[site])
    summary = meta["summary"].get(site) or {}
    row["phrasesPer1k"] = {
        ver: (summary.get(ver) or {}).get("phrasesPer1k") for ver in ("before", "after")
    }
    out[site] = row

    pct = lambda x: "  –" if x is None else f"{100 * x:3.0f}%"  # noqa: E731
    print(f"== {site}  (changed words in corpus: {100 * share:.2f}%)")
    for ver in ("before", "after"):
        r = row[ver]
        judged = row[f"judged {ver}"]
        print(
            f"  {ver:6} hovers  good {pct(r['good'])}  acceptable {pct(r['acceptable'])}"
            f"  wrong {pct(r['wrong'])}  misleading {pct(r['misleading'])}"
            f"  (judged {judged['changed']} changed + {judged['unchanged']} unchanged)"
        )
    print(f"  pref on changed words  {row['pref words changed']}  unchanged {row['pref words unchanged']}")
    for ver in ("before", "after"):
        c = row[f"phrases {ver}"]
        print(
            f"  {ver:6} phrases " + "  ".join(f"{n} {c.get(n, 0)}" for n in LABELS)
            + f"  fits {c.get('fits', 0)}  per 1k tokens {row['phrasesPer1k'][ver]}"
        )
    print(f"  pref on changed units  {row['pref units changed']}  unchanged {row['pref units unchanged']}")
    print(f"  missed  {row['missed']}")
if unknown_ids:
    print(f"warning: {unknown_ids} judged ids are not in the key")
if a.json:
    with open(a.json, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
