// `npm run verify`: everything a push needs, in two lanes at once. The host lane runs
// check, unit, browser tests on Chromium, then builds and E2E; the Firefox lane runs the
// browser tests in CI's Playwright image (scripts/test-firefox.ts), which uses the Docker
// VM's own CPUs. Each lane's output goes to a log; the console gets one line per stage
// and, when one fails, the part of its log that says why. The first failure stops the
// other lane.
//
// When everything passes, the tested tree (the working tree as `git add -A` would commit
// it) is recorded as verified, and the pre-push hook (scripts/pre-push.ts) lets a push of
// that tree through.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Stage {
  name: string;
  args: string[];
  env?: Record<string, string>;
}

const LANES: Record<string, Stage[]> = {
  host: [
    { name: "check", args: ["run", "check"] },
    { name: "unit", args: ["test", "--", "--reporter=dot"] },
    {
      name: "browser (Chromium)",
      args: ["run", "test:browser", "--", "--reporter=dot"],
      env: { VITEST_BROWSERS: "chromium" },
    },
    {
      name: "builds and E2E",
      args: ["run", "test:e2e:build", "--", "--reporter=dot"],
    },
  ],
  firefox: [
    {
      name: "browser (Firefox)",
      args: [
        "run",
        "test:browser:firefox",
        "--",
        "--shards=3",
        "--reporter=dot",
      ],
    },
  ],
};

const VERIFIED_FILE = "lingo-verified";
const VERIFIED_KEEP = 50;

// Kept stripped of colour codes so the excerpts read as plain text.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
export const stripAnsi = (text: string) => text.replace(ANSI, "");

// Where a failure's story starts, strongest first: Vitest's summary of failed tests,
// Playwright's numbered failures, a failed file or assertion, then tool errors (tsc,
// ESLint, Prettier, knip). Passing tests log errors on purpose, so a weaker marker is
// used only when no stronger one is in the log.
const FAILURE_MARKERS = [
  /Failed Tests \d+/,
  /^\s+\d+\) \[/,
  /\bFAIL\b|AssertionError|✘|✗|×/,
  /\berror\b|\[warn\]|Unused|Unlisted|Code style issues/i,
];

/** The part of a failed stage's log worth reading: from where it says why, else its end. */
export function failureExcerpt(log: string, max = 60): string {
  const lines = stripAnsi(log).split(/\r?\n/);
  let first = -1;
  for (const marker of FAILURE_MARKERS) {
    first = lines.findIndex((line) => marker.test(line));
    if (first !== -1) break;
  }
  const from = first === -1 ? Math.max(0, lines.length - max) : first;
  return lines
    .slice(from, from + max)
    .join("\n")
    .trimEnd();
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(0)}s`;

function git(args: string[], env?: NodeJS.ProcessEnv): string {
  const result = spawnSync("git", args, { encoding: "utf8", env });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

/** The tree `git add -A && git commit` would record now, without touching the index. */
export function workingTree(): string {
  const dir = mkdtempSync(join(tmpdir(), "lingo-verify-"));
  try {
    const index = join(dir, "index");
    const current = git(["rev-parse", "--git-path", "index"]);
    if (existsSync(current)) copyFileSync(current, index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(["add", "-A"], env);
    return git(["write-tree"], env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Trees `verify` passed on, newest last (shared by every worktree of the repository). */
export function verifiedFile(): string {
  return join(git(["rev-parse", "--git-common-dir"]), VERIFIED_FILE);
}

export function readVerified(file = verifiedFile()): string[] {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function recordVerified(tree: string): void {
  const file = verifiedFile();
  const trees = readVerified(file).filter((t) => t !== tree);
  trees.push(tree);
  writeFileSync(file, trees.slice(-VERIFIED_KEEP).join("\n") + "\n");
}

interface LaneResult {
  lane: string;
  ok: boolean;
  failed?: { stage: Stage; log: string };
}

const running = new Map<string, ChildProcess>();
let stopping = false;

function runStage(
  lane: string,
  stage: Stage,
  logFile: string,
): Promise<number> {
  return new Promise((done) => {
    appendFileSync(logFile, `\n> ${stage.name}: npm ${stage.args.join(" ")}\n`);
    const child = spawn("npm", stage.args, {
      env: { ...process.env, ...stage.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      // A group of its own, so stopping the lane reaches everything it started.
      detached: true,
    });
    running.set(lane, child);
    const write = (chunk: Buffer) => appendFileSync(logFile, chunk);
    child.stdout?.on("data", write);
    child.stderr?.on("data", write);
    child.on("close", (code) => {
      running.delete(lane);
      done(code ?? 1);
    });
  });
}

async function runLane(lane: string, logDir: string): Promise<LaneResult> {
  const logFile = join(logDir, `${lane}.log`);
  writeFileSync(logFile, "");
  for (const stage of LANES[lane] ?? []) {
    if (stopping) return { lane, ok: false };
    const started = Date.now();
    const offset = readFileSync(logFile).length;
    const code = await runStage(lane, stage, logFile);
    const took = seconds(Date.now() - started);
    if (stopping && code !== 0) {
      console.log(`- ${stage.name} stopped (${took})`);
      return { lane, ok: false };
    }
    if (code !== 0) {
      console.log(`✗ ${stage.name} (${took})`);
      stopOthers(lane);
      const log = readFileSync(logFile, "utf8").slice(offset);
      return { lane, ok: false, failed: { stage, log } };
    }
    console.log(`✓ ${stage.name} (${took})`);
  }
  return { lane, ok: true };
}

function stopOthers(except: string): void {
  stopping = true;
  for (const [lane, child] of running) {
    if (lane === except || child.pid === undefined) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

async function main(): Promise<number> {
  const started = Date.now();
  const logDir = resolve(git(["rev-parse", "--git-path", "lingo-verify"]));
  mkdirSync(logDir, { recursive: true });
  const tree = workingTree();

  const results = await Promise.all(
    Object.keys(LANES).map((lane) => runLane(lane, logDir)),
  );
  const total = seconds(Date.now() - started);
  const failures = results.filter((r) => r.failed);
  if (failures.length > 0 || results.some((r) => !r.ok)) {
    for (const { lane, failed } of failures) {
      if (!failed) continue;
      console.log(
        `\n── ${failed.stage.name} failed (full log: ${join(logDir, `${lane}.log`)})`,
      );
      console.log(failureExcerpt(failed.log));
    }
    console.log(`\nverify failed (${total})`);
    return 1;
  }
  if (workingTree() === tree) {
    recordVerified(tree);
    console.log(`\nverify passed (${total}); this tree may be pushed`);
  } else {
    console.log(
      `\nverify passed (${total}), but files changed while it ran: run it again before pushing`,
    );
  }
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      stopOthers("");
      process.exit(130);
    });
  process.exit(await main());
}
