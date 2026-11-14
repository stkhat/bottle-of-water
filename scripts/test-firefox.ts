// Runs the browser tests on Firefox in CI's Playwright image, on the dev Mac too, where
// Playwright's own Firefox does not launch (docs/testing.md).
// Usage: node scripts/test-firefox.ts [vitest args, e.g. a test file or --reporter=dot]
//
// Docker runs in a Colima VM (4 CPUs, 4 GB). When the VM is not running, this starts it
// and stops it after, unless another container still runs in it. node_modules (Linux
// builds) lives in a Docker volume per package-lock.json; the first run fills it.
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { playwrightImage } from "./playwright-image.ts";

const VOLUME_PREFIX = "lingo-firefox-node-modules-";

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
  // Install once per volume; the mark is written only after a complete install. No
  // install scripts: they set up git hooks and .wxt, which belong to the checkout here.
  const script =
    "[ -f node_modules/.lingo-installed ] || " +
    "{ npm ci --ignore-scripts --no-audit --no-fund && touch node_modules/.lingo-installed; } && " +
    'VITEST_BROWSERS=firefox npx vitest run --project browser "$@"';
  const result = run(
    "docker",
    [
      "run",
      "--rm",
      "--init",
      ...(process.stdout.isTTY ? ["-t"] : []),
      // The same path as here, so failures name files you can open.
      ...["-v", `${cwd}:${cwd}`, "-v", `${volume}:${cwd}/node_modules`],
      ...["-w", cwd],
      playwrightImage(),
      ...["bash", "-c", script, "bash", ...process.argv.slice(2)],
    ],
    { stdio: "inherit" },
  );
  status = result.status ?? 1;
} finally {
  if (startedColima) {
    const running = run("docker", ["ps", "-q"]).stdout.trim();
    if (running === "") run("colima", ["stop"], { stdio: "ignore" });
    else console.log("Colima keeps running: another container uses it.");
  }
}
process.exit(status);
