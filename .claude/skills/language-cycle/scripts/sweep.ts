// One sweep: every offered language pair measured on its learning language's corpus by
// one checkout. Units are built once per learning language (build-units.ts), then
// measure.ts runs once per pair; both are real-content-quality's scripts.
//
//   npx jiti .claude/skills/language-cycle/scripts/sweep.ts --cycle=<name> \
//     [--repo=<checkout>] [--label=sweep] [--pairs=en-ja,de-fr] [--jobs=3] [--level=3000] \
//     [--repeat=3]
//
// (or CYCLE, REPO, LABEL, PAIRS, JOBS, LEVEL, REPEAT in the environment).
// Pairs: the lock's offered pairs (src/core/packs/packs.lock.json `pairs`), never a hand
// list, so a pair added to the lock is swept from its first cycle. Corpora: corpora.json
// next to this script (learning language → study corpus and the native language of its
// saved tracks). Output under data/raw/quality/cycles/<cycle>/<label>/:
//   units/<learning>/units.jsonl, runs/<pair>/{summary.json,rows.jsonl,log.txt,timing.json},
//   sweep.json
// timing.json: the median of REPEAT runs' classify ms per 1,000 tokens and load times (run
// one pair at a time after the rows), and the pair's packs' raw size (the learning pack
// and DICTIONARY_PACKS[pair]). Timing from two sweeps still moves with the machine's load
// (+140% on the same commit, measured): compare-sweeps.py marks it CHECK only, and
// timing-ab.ts settles it.
import { spawn } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  qualityRoot,
  repo,
  setting,
  shortSha,
} from "../../real-content-quality/scripts/common.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RCQ = join(HERE, "../../real-content-quality/scripts");
const REPO = repo();
const CYCLE = setting("cycle");
if (!CYCLE) throw new Error("Set --cycle=<name> (e.g. c001)");
const LABEL = setting("label", "sweep")!;
const JOBS = Number(setting("jobs", "3"));
const LEVEL = setting("level", "3000")!;
const REPEAT = Math.max(1, Number(setting("repeat", "3")));
const OUT = join(qualityRoot(), "cycles", CYCLE, LABEL);

const corpora = JSON.parse(
  readFileSync(join(HERE, "corpora.json"), "utf8"),
) as Record<string, { corpus: string; native: string }>;
const lock = JSON.parse(
  readFileSync(join(REPO, "src/core/packs/packs.lock.json"), "utf8"),
) as { pairs: Record<string, string[]> };
const offered = Object.entries(lock.pairs).flatMap(([l, natives]) =>
  natives.map((n) => `${l}-${n}`),
);
const wanted = setting("pairs")?.split(",");
const pairs = wanted ? offered.filter((p) => wanted.includes(p)) : offered;
const missing = pairs.filter((p) => !corpora[p.split("-")[0]!]);
if (missing.length)
  throw new Error(`No corpus in corpora.json for ${missing.join(", ")}`);

const { DICTIONARY_PACKS } = (await import(
  `${REPO}/src/core/packs/formats.ts`
)) as { DICTIONARY_PACKS: Record<string, readonly string[]> };

/** Raw bytes of the packs a pair loads (data/packs/<pack>/*). */
function packBytes(pair: string): number {
  const packs = new Set([
    pair.split("-")[0]!,
    ...(DICTIONARY_PACKS[pair] ?? []),
  ]);
  let bytes = 0;
  for (const pack of packs) {
    const dir = join(REPO, "data/packs", pack);
    try {
      for (const f of readdirSync(dir)) bytes += statSync(join(dir, f)).size;
    } catch {
      // a pack this checkout does not have
    }
  }
  return bytes;
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

interface Summary {
  msPer1k: number;
  loadMs: Record<string, number>;
}
const readSummary = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as Summary;

/** Runs one script with jiti; resolves with its exit code, output in `log`. */
function run(script: string, env: Record<string, string>, log: string) {
  return new Promise<number>((done) => {
    const child = spawn("npx", ["jiti", join(RCQ, script)], {
      env: { ...process.env, REPO, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => chunks.push(c));
    child.on("close", (code) => {
      writeFileSync(log, Buffer.concat(chunks));
      done(code ?? 1);
    });
  });
}

/** measure.ts for one pair on this sweep's units, written to `out`. */
function measurePair(pair: string, out: string) {
  const [l, n] = pair.split("-") as [string, string];
  return run(
    "measure.ts",
    {
      UNITS: join(OUT, "units", l, "units.jsonl"),
      OUT: out,
      LEARNING: l,
      NATIVE: n,
      LEVEL,
      STUDY: join(qualityRoot(), corpora[l]!.corpus, ".."),
    },
    join(out, "log.txt"),
  );
}

/** Runs `task` over `items` with at most JOBS at once. */
async function pool<T>(items: T[], task: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, JOBS) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift())
        await task(item);
    }),
  );
}

const started = new Date().toISOString();
const status: Record<string, string> = {};
const learnings = [...new Set(pairs.map((p) => p.split("-")[0]!))];
await pool(learnings, async (l) => {
  const dir = join(OUT, "units", l);
  mkdirSync(dir, { recursive: true });
  const { corpus, native } = corpora[l]!;
  const code = await run(
    "build-units.ts",
    {
      CORPUS: join(qualityRoot(), corpus),
      OUT: dir,
      LEARNING: l,
      NATIVE: native,
    },
    join(dir, "log.txt"),
  );
  status[`units:${l}`] = code === 0 ? "ok" : `exit ${code}`;
  console.log(`units ${l}: ${status[`units:${l}`]}`);
});
await pool(
  pairs.filter((p) => status[`units:${p.split("-")[0]}`] === "ok"),
  async (pair) => {
    const dir = join(OUT, "runs", pair);
    mkdirSync(dir, { recursive: true });
    const code = await measurePair(pair, dir);
    status[pair] = code === 0 ? "ok" : `exit ${code}`;
    console.log(`${pair}: ${status[pair]}`);
  },
);
// Timing: one pair at a time, after the rows, so the runs do not slow each other.
for (const pair of pairs.filter((p) => status[p] === "ok")) {
  const dir = join(OUT, "runs", pair);
  const samples = [readSummary(dir)];
  for (let k = 1; k < REPEAT; k++) {
    const rep = join(dir, `rep-${k}`);
    mkdirSync(rep, { recursive: true });
    if ((await measurePair(pair, rep)) === 0) samples.push(readSummary(rep));
    rmSync(rep, { recursive: true, force: true });
  }
  const timing = {
    samples: samples.length,
    msPer1k: median(samples.map((s) => s.msPer1k)),
    loadMs: Object.fromEntries(
      Object.keys(samples[0]!.loadMs).map((k) => [
        k,
        median(samples.map((s) => s.loadMs[k]!)),
      ]),
    ),
    packBytes: packBytes(pair),
  };
  writeFileSync(join(dir, "timing.json"), JSON.stringify(timing, null, 1));
}
const sweep = {
  repo: REPO,
  sha: shortSha(REPO),
  started,
  finished: new Date().toISOString(),
  jobs: JOBS,
  repeat: REPEAT,
  level: Number(LEVEL),
  corpora,
  pairs,
  status,
};
writeFileSync(join(OUT, "sweep.json"), JSON.stringify(sweep, null, 1));
const failed = Object.entries(status).filter(([, s]) => s !== "ok");
console.log(
  `${OUT}: ${pairs.length - failed.length}/${pairs.length} ok` +
    (failed.length
      ? `; failed ${failed.map(([k]) => k).join(", ")} (see log.txt)`
      : ""),
);
process.exitCode = failed.length ? 1 : 0;
