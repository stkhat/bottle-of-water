"""Blind A/B packets from two measure.ts runs (references/judging.md).

  python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py \
    --before <run dir> --after <run dir> --out <packets dir> \
    [--sites youtube,article,netflix] [--packets 1] [--seed 11] [--tag ab] \
    [--words-changed 70] [--words-same 60] [--units-changed 30] [--units-same 25]

Each run dir holds rows.jsonl and summary.json (measure.ts); the unit texts come from the
units.jsonl the after run's summary names. Per site, the documents are split into
--packets packets. Words: tokens whose hover differs between the runs, plus a sample
of unchanged ones, each pair of displays at most once per packet. Units: cards or
paragraphs (6+ words) whose phrase highlights differ, plus a sample of unchanged ones.
X/Y is random per item. Writes packet-<tag>-<site>-<n>.json, key-<tag>.json (never give
it to a judge: X/Y → before/after, changed flags, corpus counts for re-weighting, both
summaries) and RUBRIC.txt (the words-and-units rubric from references/judging.md).
"""

import argparse
import collections
import json
import os
import random
import re

p = argparse.ArgumentParser()
p.add_argument("--before", required=True)
p.add_argument("--after", required=True)
p.add_argument("--out", required=True)
p.add_argument("--sites", default="youtube,article,netflix")
p.add_argument("--packets", type=int, default=1, help="packets per site")
p.add_argument("--seed", type=int, default=11)
p.add_argument("--tag", default="ab")
p.add_argument("--words-changed", type=int, default=70)
p.add_argument("--words-same", type=int, default=60)
p.add_argument("--units-changed", type=int, default=30)
p.add_argument("--units-same", type=int, default=25)
a = p.parse_args()
R = random.Random(a.seed)
HERE = os.path.dirname(os.path.abspath(__file__))


def jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load(run):
    with open(os.path.join(run, "summary.json"), encoding="utf-8") as f:
        summary = json.load(f)
    words, phrases = {}, collections.defaultdict(list)
    for r in jsonl(os.path.join(run, "rows.jsonl")):
        if r["kind"] == "word":
            words[(r["doc"], r["unit"], r["start"])] = r
        else:
            phrases[(r["doc"], r["unit"])].append(r)
    return summary, words, phrases


sb, wb, pb = load(a.before)
sa, wa, pa = load(a.after)
units = {}
for path in sa["units"]:
    for u in jsonl(path):
        units[(u["doc"], u["i"])] = u


def meaning(r):
    if r["hoverKind"] == "literal":
        return "(literal translation)"
    return " / ".join(r["hover"]) or "(no meaning)"


def word_display(r):
    if r["verdict"] == "name":
        return f"{r['surface']} — (name)"
    if r["verdict"] == "unknown":
        return f"{r['surface']} — (no meaning)"
    return f"{r['key']} — {meaning(r)}"


def phrase_list(rows):
    return sorted(
        {f"{r['surface']} [{r['key']}] — {meaning(r)[:60]}" for r in rows}
    )


# Candidates per site and document.
words = collections.defaultdict(lambda: collections.defaultdict(list))
unit_items = collections.defaultdict(lambda: collections.defaultdict(list))
population = collections.defaultdict(collections.Counter)
for key, after in wa.items():
    before = wb.get(key)
    if not before or before["verdict"] == after["verdict"] == "unknown":
        continue
    x, y = word_display(before), word_display(after)
    changed = x != y
    population[after["site"]]["words changed" if changed else "words same"] += 1
    words[after["site"]][key[0]].append((changed, before, after, x, y))
for key, u in units.items():
    if len(u["text"].split()) < 6 or "♪" in u["text"]:
        continue
    x, y = phrase_list(pb.get(key, [])), phrase_list(pa.get(key, []))
    changed = x != y
    population[u["site"]]["units changed" if changed else "units same"] += 1
    unit_items[u["site"]][key[0]].append((changed, u, x, y))

os.makedirs(a.out, exist_ok=True)
items = {}
for site in a.sites.split(","):
    docs = sorted(set(words[site]) | set(unit_items[site]))
    R.shuffle(docs)
    for n in range(a.packets):
        ds = docs[n::a.packets]
        name = f"{a.tag}-{site}-{n}"
        packet = {"words": [], "units": []}

        pool = [c for d in ds for c in words[site][d]]
        R.shuffle(pool)
        seen, pick = set(), []
        for want_changed, limit in ((True, a.words_changed), (False, a.words_same)):
            k = 0
            for changed, before, after, x, y in pool:
                if k >= limit:
                    break
                if changed != want_changed or (x, y) in seen:
                    continue
                seen.add((x, y))
                pick.append((changed, before, after, x, y))
                k += 1
        R.shuffle(pick)
        for j, (changed, before, after, x, y) in enumerate(pick):
            iid = f"{name}-w{j}"
            flip = R.random() < 0.5
            packet["words"].append(
                {
                    "id": iid,
                    "word": after["surface"],
                    "sentence": after["sentence"],
                    "X": y if flip else x,
                    "Y": x if flip else y,
                }
            )
            items[iid] = {
                "X": "after" if flip else "before",
                "changed": changed,
                "site": site,
                "kind": "word",
                "category": after["verdict"],
            }

        pool = [c for d in ds for c in unit_items[site][d]]
        R.shuffle(pool)
        pick = []
        for want_changed, limit in ((True, a.units_changed), (False, a.units_same)):
            pick += [c for c in pool if c[0] == want_changed][:limit]
        R.shuffle(pick)
        for j, (changed, u, x, y) in enumerate(pick):
            iid = f"{name}-u{j}"
            flip = R.random() < 0.5
            packet["units"].append(
                {"id": iid, "text": u["text"], "X": y if flip else x, "Y": x if flip else y}
            )
            items[iid] = {
                "X": "after" if flip else "before",
                "changed": changed,
                "site": site,
                "kind": "unit",
            }

        with open(os.path.join(a.out, f"packet-{name}.json"), "w", encoding="utf-8") as f:
            json.dump(packet, f, ensure_ascii=False, indent=1)
        changed_words = sum(items[w["id"]]["changed"] for w in packet["words"])
        changed_units = sum(items[u["id"]]["changed"] for u in packet["units"])
        print(
            f"{name}: {len(ds)} docs, {len(packet['words'])} words ({changed_words} changed),"
            f" {len(packet['units'])} units ({changed_units} changed)"
        )

key = {
    "meta": {
        "before": os.path.abspath(a.before),
        "after": os.path.abspath(a.after),
        "seed": a.seed,
        "population": {s: dict(c) for s, c in population.items()},
        "summary": {
            s: {"before": sb.get(s), "after": sa.get(s)}
            for s in ["all", *a.sites.split(",")]
        },
    },
    "items": items,
}
with open(os.path.join(a.out, f"key-{a.tag}.json"), "w", encoding="utf-8") as f:
    json.dump(key, f, ensure_ascii=False, indent=1)

# The rubric, from the blockquote under "## Rubric (words and units)".
with open(os.path.join(HERE, "..", "references", "judging.md"), encoding="utf-8") as f:
    md = f.read()
block = re.search(r"## Rubric \(words and units\)\n+((?:>.*\n)+)", md)
if block:
    rubric = "\n".join(re.sub(r"^> ?", "", line) for line in block.group(1).splitlines())
    with open(os.path.join(a.out, "RUBRIC.txt"), "w", encoding="utf-8") as f:
        f.write(rubric.strip() + "\n")
print("population", json.dumps(key["meta"]["population"]))
