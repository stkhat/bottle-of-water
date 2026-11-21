#!/usr/bin/env python3
"""A sweep (sweep.ts) -> one learner-simulation packet per pair.

  python3 -I .claude/skills/language-cycle/scripts/sim-packets.py \
      --sweep <cycles/<c>/<label>> --out <cycles/<c>/sim> --seed <n> \
      [--pairs en-ja,es-en] [--docs 6] [--stretch 7] [--repo <checkout>]

A packet is what a learner would meet while watching or reading: --docs documents (as
even across YouTube, Netflix and articles as the corpus allows) and --stretch consecutive
cards or paragraphs from each, in order, with what Langle shows on them. All natives of a
learning language get the same stretches (the seed is per learning language), so a
problem several natives report on the same words points at the learning language or the
core, and one only a single native reports points at that native or pair.

Per pair it writes <pair>.txt (the packet), <pair>.key.json (packet ids -> rows) and, once,
BRIEF.txt (what the learner agent does and the output shape). The learner writes
findings-<pair>.jsonl next to them; sim-tally.py reads all of it.
"""
import argparse
import json
import os
import random
from collections import defaultdict

BRIEF = """\
You are a language learner using Langle, a browser extension that highlights words and
phrases in videos and articles and shows their meaning when you hover them. Your packet
names your native language, the language you are learning and your level.

Read the packet's units in order, as if you were watching or reading. For each unit, do
what a real learner at your level would do: read the line, look at the highlights, hover
what you do not understand (its meaning is in the packet), and decide whether you now
understand the line. Report every place where Langle let you down or got in your way:

  wrong-meaning      the hover's meaning is wrong for this word or phrase in this line
  misleading         a meaning that is right somewhere but sends you the wrong way here
  missing-hover      a word you needed has no meaning (listed under NO MEANING), or a
                     meaning is missing from a highlight
  noise-highlight    a highlight that is not worth a learner's attention (too easy, a
                     name, a fragment, a phrase that is not one)
  missed-expression  an expression you needed (idiom, phrasal verb, set phrase) that is
                     not highlighted as one
  wrong-name         a name treated as a word, or a word treated as a name
  unreadable         a meaning you cannot use: too long, a definition instead of a
                     translation, the wrong script, markup, English where your own
                     language was expected
  untranslated       a meaning shown in the learning language or English although you
                     need your own language
  wrong-split        the highlight covers the wrong span (half a phrase, two words joined)
  other              anything else that would make a learner stop or give up

Be a learner, not a linguist: report what would hurt understanding or waste attention,
and judge meanings by whether they help in this line. A meaning marked "shown machine-
translated" will be shown translated into your language by the browser; judge whether
its content would help once translated. Do not report the same problem twice in one
unit. Use only the packet; read no other file.

OUTPUT: write findings-<pair>.jsonl in the packet's folder in one Write call, one JSON
object per line:
  {"unit": "U3", "target": "w12" or null, "surface": "<the words>", "kind": "<a kind
   above>", "severity": 1|2|3, "note": "<at most 25 English words: what went wrong>",
   "expected": "<at most 15 words: what would have helped, in any language>"}
severity: 3 = I misunderstood or could not understand the line; 2 = it cost me real
effort; 1 = a small annoyance.
The last line is one session object:
  {"session": true, "units": <units read>, "understood": <units you understood after
   using Langle>, "wouldSave": ["<expressions you would save to study>"],
   "overall": "<at most 40 English words>"}
Reply with at most 3 lines: number of findings by severity and anything you could not do.
"""


def read_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def language_names(repo):
    with open(os.path.join(repo, "src/i18n/locales/en.json")) as f:
        messages = json.load(f)
    return {k.split(".", 1)[1]: v for k, v in messages.items() if k.startswith("languageName.")}


def manifest_titles(sweep):
    root = os.path.abspath(os.path.join(sweep, "..", "..", ".."))
    with open(os.path.join(sweep, "sweep.json")) as f:
        corpora = json.load(f)["corpora"]
    titles = {}
    prefix = {"youtube": "yt", "netflix": "nf", "article": "ar", "articles": "ar"}
    for learning, c in corpora.items():
        path = os.path.join(root, c["corpus"], "manifest.json")
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for m in json.load(f):
                p = prefix.get(m.get("kind"), m.get("kind"))
                titles[(learning, f"{p}:{m['id']}")] = (
                    m.get("title", ""), m.get("genre", ""), m.get("channel_or_show", ""))
    return titles


def choose(units, docs, stretch, rng):
    """(doc, [unit indexes]) stretches, spread over sites."""
    by_doc = defaultdict(list)
    for u in units:
        by_doc[u["doc"]].append(u)
    by_site = defaultdict(list)
    for doc, us in sorted(by_doc.items()):
        if len(us) >= stretch:
            by_site[us[0]["site"]].append(doc)
    sites = sorted(by_site)
    chosen = []
    while len(chosen) < docs and any(by_site[s] for s in sites):
        for s in sites:
            if by_site[s] and len(chosen) < docs:
                doc = by_site[s].pop(rng.randrange(len(by_site[s])))
                us = sorted(by_doc[doc], key=lambda u: u["i"])
                # Skip the first cards (intros, music) when the document is long enough.
                lo = min(len(us) - stretch, max(0, len(us) // 10))
                start = rng.randint(lo, len(us) - stretch)
                chosen.append((doc, [u["i"] for u in us[start:start + stretch]]))
    return chosen


def hover_text(r):
    hover = r.get("hover") or []
    if not hover:
        return "(no meaning)"
    text = " / ".join(hover)
    if r.get("hoverKind") == "translated":
        return f"[shown machine-translated from English] {text}"
    if r.get("hoverKind") == "literal":
        return f"[literal machine translation] {text}"
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--pairs")
    ap.add_argument("--docs", type=int, default=6)
    ap.add_argument("--stretch", type=int, default=7)
    ap.add_argument("--level", type=int)
    ap.add_argument("--repo", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))
    args = ap.parse_args()

    with open(os.path.join(args.sweep, "sweep.json")) as f:
        sweep = json.load(f)
    pairs = args.pairs.split(",") if args.pairs else sweep["pairs"]
    level = args.level or sweep["level"]
    names = language_names(args.repo)
    titles = manifest_titles(args.sweep)
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "BRIEF.txt"), "w") as f:
        f.write(BRIEF)

    stretches = {}
    unit_text = {}
    for learning in sorted({p.split("-")[0] for p in pairs}):
        units = read_jsonl(os.path.join(args.sweep, "units", learning, "units.jsonl"))
        unit_text[learning] = {(u["doc"], u["i"]): u for u in units}
        rng = random.Random(f"{args.seed}:{learning}")
        stretches[learning] = choose(units, args.docs, args.stretch, rng)

    for pair in pairs:
        learning, native = pair.split("-")
        rows_path = os.path.join(args.sweep, "runs", pair, "rows.jsonl")
        if not os.path.exists(rows_path):
            print(f"{pair}: no rows, skipped")
            continue
        wanted = {(d, i) for d, idx in stretches[learning] for i in idx}
        rows = defaultdict(list)
        with open(rows_path) as f:
            for line in f:
                r = json.loads(line)
                if (r["doc"], r["unit"]) in wanted:
                    rows[(r["doc"], r["unit"])].append(r)
        corpus_native = sweep["corpora"][learning]["native"]
        out = [
            f"PACKET {pair}",
            f"You are a native speaker of {names.get(native, native)} learning "
            f"{names.get(learning, learning)}. You know the {level} most common "
            f"{names.get(learning, learning)} words; Langle highlights the others as NEW.",
            "Each unit: the line, its subtitle translation when the site shows one in your",
            "language, then what Langle shows. Ids: U<n> units, w<n> words, p<n> phrases.",
            "",
        ]
        key = {}
        n = 0
        for doc, idx in stretches[learning]:
            title, genre, show = titles.get((learning, doc), ("", "", ""))
            out.append(f"=== {doc.split(':')[0]} · {title} ({genre}{', ' + show if show else ''})")
            for i in idx:
                n += 1
                uid = f"U{n}"
                u = unit_text[learning][(doc, i)]
                key[uid] = {"doc": doc, "unit": i, "targets": {}}
                out.append(f"[{uid}] {u['text']}")
                if native == corpus_native and u.get("native"):
                    out.append(f"  SUBTITLE ({names.get(native, native)}): {u['native']}")
                elif native != corpus_native and u["site"] != "article":
                    out.append("  SUBTITLE: (the site's translation is not available here)")
                rs = sorted(rows[(doc, i)], key=lambda r: (r["start"], r["kind"]))
                shown, unknown, names_seen, known = [], [], [], []
                w = p = 0
                for r in rs:
                    if r["kind"] == "phrase":
                        p += 1
                        tid = f"p{p}"
                        shown.append(f"  {tid} PHRASE \"{r['surface']}\" → {hover_text(r)}")
                    elif r["verdict"] == "unknown":
                        unknown.append(r["surface"])
                        continue
                    elif r["verdict"] == "name":
                        names_seen.append(r["surface"])
                        continue
                    else:
                        w += 1
                        tid = f"w{w}"
                        if r["category"] == "new":
                            shown.append(f"  {tid} NEW \"{r['surface']}\" → {hover_text(r)}")
                        elif r.get("rank", 0) >= 1000 or not r.get("hover"):
                            # Known words a learner might still hover: the less common ones.
                            known.append(f"{tid} {r['surface']} → {hover_text(r)}")
                        else:
                            continue
                    key[uid]["targets"][tid] = {
                        k: r.get(k) for k in ("start", "kind", "surface", "key", "pos", "from", "hoverKind", "category")
                    }
                out += shown or ["  (no highlights)"]
                if known:
                    out.append("  not highlighted, hoverable: " + "; ".join(known))
                if unknown:
                    out.append("  NO MEANING (not in Langle's vocabulary): " + ", ".join(unknown))
                if names_seen:
                    out.append("  treated as names (no highlight): " + ", ".join(names_seen))
            out.append("")
        with open(os.path.join(args.out, f"{pair}.txt"), "w") as f:
            f.write("\n".join(out) + "\n")
        with open(os.path.join(args.out, f"{pair}.key.json"), "w") as f:
            json.dump({"pair": pair, "level": level, "units": key}, f, ensure_ascii=False)
        print(f"{pair}: {n} units, {sum(len(k['targets']) for k in key.values())} targets, {len(chr(10).join(out))} chars")


if __name__ == "__main__":
    main()
