// The word tokens the hover meets on real content, for the quality gate's token rule
// (gate.ts, docs/specs/architecture.md "Native meanings and the quality gate"): each
// key the hover looks up, with how many tokens of the corpus have it. Only these counts
// are committed (data/gate/<lang>-tokens.json), never the corpus text.
// Input: the rows of the real-content runner (`.claude/skills/real-content-quality/
// scripts/measure.ts`) over a corpus. English's are round 4's (M0a): the 2026-11 corpus
// (YouTube, Netflix, articles) with NATIVE=ja,
//   data/raw/quality/r4/runs/base-ja/rows.jsonl (git-ignored).
// Counted: word tokens whose hover shows lines (not ignored), names (capitalised
// headwords) apart.
// Usage: node scripts/data/gate-tokens.ts <lang> <rows.jsonl>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { byCodeUnit, GATE_DIR } from "./common.ts";

/** One token of the runner's rows (`rows.jsonl`): the fields read here. */
export interface RunnerRow {
  doc: string;
  unit: number;
  start: number;
  kind: string;
  key: string;
  category?: string;
  hoverKind?: string;
  capital?: boolean;
}

/** Where a learning language's token counts are kept. */
export const tokensPath = (lang: string) =>
  join(GATE_DIR, `${lang}-tokens.json`);

/** A token the gate counts: a word whose hover shows lines, not a name. */
const counted = (row: RunnerRow) =>
  row.kind === "word" &&
  row.category !== "ignored" &&
  (row.hoverKind === "dict" || row.hoverKind === "translated") &&
  !row.capital;

/**
 * How many counted tokens each key has, keys sorted. A token the rows list twice
 * (the same document, unit and start) counts once.
 */
export function tokenCounts(rows: Iterable<RunnerRow>) {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const at = `${row.doc}\u0000${row.unit}\u0000${row.start}`;
    if (!counted(row) || seen.has(at)) continue;
    seen.add(at);
    counts[row.key] = (counts[row.key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => byCodeUnit(a, b)),
  );
}

/** One key per line, so a regenerated list diffs by key. */
export const stringifyCounts = (counts: Readonly<Record<string, number>>) =>
  `{\n${Object.entries(counts)
    .map(([key, n]) => `${JSON.stringify(key)}:${n}`)
    .join(",\n")}\n}\n`;

function main() {
  const [lang, path] = process.argv.slice(2);
  if (!lang || !path)
    throw new Error(
      "usage: node scripts/data/gate-tokens.ts <lang> <rows.jsonl>",
    );
  const rows = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunnerRow);
  const counts = tokenCounts(rows);
  writeFileSync(tokensPath(lang), stringifyCounts(counts));
  const tokens = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `${tokensPath(lang)}: ${Object.keys(counts).length} keys, ${tokens} tokens`,
  );
}

if (import.meta.main) main();
