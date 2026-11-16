// Runs the browser tests on Firefox in CI's Playwright image, on the dev Mac too, where
// Playwright's own Firefox does not launch (docs/testing.md).
// Usage: node scripts/test-firefox.ts [--shards=N] [vitest args, e.g. a test file or --reporter=dot]
//
// Docker runs in a Colima VM (4 CPUs, 4 GB). When the VM is not running, this starts it
// and stops it after, unless another container still runs in it. node_modules (Linux
// builds) lives in a Docker volume per package-lock.json; the first run fills it.
import {
  spawn,
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { playwrightImage } from "./playwright-image.ts";

const VOLUME_PREFIX = "lingo-firefox-node-modules-";

// `--shards=N` (scripts/verify.ts) splits the files over N containers run side by side;
// every other argument goes to Vitest.
const shardsArg = process.argv.find((arg) => arg.startsWith("--shards="));
const shards = Math.max(1, Number(shardsArg?.slice("--shards=".length)) || 1);
const vitestArgs = process.argv.slice(2).filter((arg) => arg !== shardsArg);

function run(
  command: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {},
) {
  return spawnSync(command, args, { ...options, encoding: "utf8" });
}

const ok = (command: string, args: string[]) =>
  run(command, args, { stdio: "ignore" }).status === 0;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (run("docker", ["--version"], { stdio: "ignore" }).error)
  fail(
    "Firefox runs in Docker here. Install Colima and the Docker CLI:\n  brew install colima docker",
  );

let startedColima = false;
if (!ok("docker", ["info"])) {
  if (run("colima", ["version"], { stdio: "ignore" }).error)
    fail(
      "Docker is not running, and Colima is not installed (brew install colima).",
    );
  console.log("Starting Colima (4 CPUs, 4 GB) for the Firefox run…");
  if (!ok("colima", ["start", "--cpu", "4", "--memory", "4"]))
    fail("colima start failed: run it by hand to see why.");
  startedColima = true;
}

let status: number;
try {
  const lock = readFileSync("package-lock.json");
  const volume =
    VOLUME_PREFIX +
    createHash("sha256").update(lock).digest("hex").slice(0, 12);
  // Volumes of older lockfiles only take disk space.
  const volumes = run("docker", ["volume", "ls", "-q"]).stdout.split("\n");
  for (const old of volumes)
    if (old.startsWith(VOLUME_PREFIX) && old !== volume)
      run("docker", ["volume", "rm", old], { stdio: "ignore" });

  const cwd = process.cwd();
  const docker = (script: string, args: string[], tty: boolean) => [
    "run",
    "--rm",
    "--init",
    ...(tty && process.stdout.isTTY ? ["-t"] : []),
    // The same path as here, so failures name files you can open.
    ...["-v", `${cwd}:${cwd}`, "-v", `${volume}:${cwd}/node_modules`],
    ...["-w", cwd],
    playwrightImage(),
    ...["bash", "-c", script, "bash", ...args],
  ];
  // Install once per volume; the mark is written only after a complete install. No
  // install scripts: they set up git hooks and .wxt, which belong to the checkout here.
  const install =
    "[ -f node_modules/.lingo-installed ] || " +
    "{ npm ci --ignore-scripts --no-audit --no-fund && touch node_modules/.lingo-installed; }";
  const test = 'VITEST_BROWSERS=firefox npx vitest run --project browser "$@"';
  if (shards === 1) {
    status =
      run("docker", docker(`${install} && ${test}`, vitestArgs, true), {
        stdio: "inherit",
      }).status ?? 1;
  } else {
    // Each container has a Firefox of its own, so files in different containers do not
    // take each other's active window. The install runs first, in one container only.
    status =
      run("docker", docker(install, [], true), { stdio: "inherit" }).status ??
      1;
    if (status === 0) {
      const codes = await Promise.all(
        Array.from(
          { length: shards },
          (_, i) =>
            new Promise<number>((done) => {
              const args = [...vitestArgs, `--shard=${i + 1}/${shards}`];
              spawn("docker", docker(test, args, false), {
                stdio: "inherit",
              }).on("close", (code) => done(code ?? 1));
            }),
        ),
      );
      status = codes.find((code) => code !== 0) ?? 0;
    }
  }
} finally {
  if (startedColima) {
    const running = run("docker", ["ps", "-q"]).stdout.trim();
    if (running === "") run("colima", ["stop"], { stdio: "ignore" });
    else console.log("Colima keeps running: another container uses it.");
  }
}
process.exit(status);
