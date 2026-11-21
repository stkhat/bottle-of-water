// Timing of two checkouts on the same units, interleaved (A B, then B A, …) so that the
// machine's load falls on both alike. Settles a CHECK from compare-sweeps.py.
//
//   npx jiti .claude/skills/language-cycle/scripts/timing-ab.ts \
//     --before=<checkout> --after=<checkout> --sweep=<cycles/<c>/<label>> \
//     --pairs=en-ja,es-en [--rounds=5]
//
// (or BEFORE, AFTER, SWEEP, PAIRS, ROUNDS in the environment). The units come from the
// sweep's units/<learning>/units.jsonl. Prints, per pair and number, both medians, the
// median of the per-round ratios (after / before) and in how many rounds after was
// slower; writes timing-ab.json into the sweep folder. A regression: ratio above 1.15,
// slower in at least 4 of 5 rounds, and at least 20 ms slower (loads under ~50 ms move by
// 50%+ between identical runs, measured A/A).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setting } from "../../real-content-quality/scripts/common.ts";

const MEASURE = fileURLToPath(
  new URL("../../real-content-quality/scripts/measure.ts", import.meta.url),
);
const need = (name: string) => {
  const value = setting(name);
  if (!value) throw new Error(`Set --${name}`);
  return value;
};
const BEFORE = resolve(need("before"));
const AFTER = resolve(need("after"));
const SWEEP = resolve(need("sweep"));
const PAIRS = need("pairs").split(",");
const ROUNDS = Number(setting("rounds", "5"));
const sweep = JSON.parse(readFileSync(join(SWEEP, "sweep.json"), "utf8")) as {
  level: number;
};

interface Times {
  msPer1k: number;
  loadMs: Record<string, number>;
}

function measure(repo: string, pair: string): Promise<Times> {
  const [l, n] = pair.split("-") as [string, string];
  const out = mkdtempSync(join(tmpdir(), "timing-ab-"));
  return new Promise((done, fail) => {
    const child = spawn("npx", ["jiti", MEASURE], {
      env: {
        ...process.env,
        REPO: repo,
        UNITS: join(SWEEP, "units", l, "units.jsonl"),
        OUT: out,
        LEARNING: l,
        NATIVE: n,
        LEVEL: String(sweep.level),
      },
      stdio: "ignore",
    });
    child.on("close", (code) => {
      try {
        if (code !== 0) throw new Error(`measure.ts ${repo} ${pair}: exit ${code}`);
        const s = JSON.parse(
          readFileSync(join(out, "summary.json"), "utf8"),
        ) as Times;
        done({ msPer1k: s.msPer1k, loadMs: s.loadMs });
      } catch (e) {
        fail(e as Error);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    });
  });
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const numbers = (t: Times): Record<string, number> => ({
  "ms/1k": t.msPer1k,
  ...Object.fromEntries(
    Object.entries(t.loadMs).map(([k, v]) => [`load ${k}`, v]),
  ),
});

const result: Record<string, Record<string, unknown>> = {};
for (const pair of PAIRS) {
  const before: Record<string, number>[] = [];
  const after: Record<string, number>[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const sides = [
      [BEFORE, before],
      [AFTER, after],
    ] as const;
    for (const [repo, list] of r % 2 === 0 ? sides : [...sides].reverse())
      list.push(numbers(await measure(repo, pair)));
  }
  result[pair] = Object.fromEntries(
    Object.keys(before[0]!).map((k) => {
      const ratios = before.map((b, i) => after[i]![k]! / Math.max(b[k]!, 1));
      return [
        k,
        {
          before: median(before.map((b) => b[k]!)),
          after: median(after.map((a) => a[k]!)),
          ratio: +median(ratios).toFixed(2),
          slowerRounds: ratios.filter((x) => x > 1).length,
        },
      ];
    }),
  );
  for (const [k, v] of Object.entries(result[pair]!))
    console.log(`${pair} ${k}: ${JSON.stringify(v)}`);
}
writeFileSync(
  join(SWEEP, "timing-ab.json"),
  JSON.stringify({ before: BEFORE, after: AFTER, rounds: ROUNDS, result }, null, 1),
);
