// One heavy test run at a time on this machine, across every worktree of the repository.
// `verify` and the Firefox runs share the host's CPUs and one 4-CPU Docker VM: two at
// once (parallel sessions) time tests out, and the run that ends first stops Colima under
// the other. A run waits for the one before it instead.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Set for the lock holder's children, so a run inside `verify` does not wait for it. */
const HELD = "LANGLE_TEST_LOCK";
const POLL_MS = 2000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Whether the lock file's text names a holder that still runs. An empty text is a lock
 * being written: it counts as held.
 */
export function held(text: string, alive = isAlive): boolean {
  if (text === "") return true;
  const pid = Number(text.split(" ")[0]);
  return Number.isInteger(pid) && pid > 0 && alive(pid);
}

function lockFile(): string {
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
  }).stdout.trim();
  return join(common, "langle-test.lock");
}

function read(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** Waits for the lock, then holds it until this process exits. */
export async function takeTestLock(): Promise<void> {
  if (process.env[HELD]) return;
  const file = lockFile();
  const mine = `${process.pid} ${process.cwd()}\n`;
  let told = false;
  for (;;) {
    try {
      writeFileSync(file, mine, { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const text = read(file);
    if (text === undefined) continue;
    if (!held(text)) {
      // A holder that died without letting go (killed, or a stopped Firefox run).
      if (read(file) === text) rmSync(file, { force: true });
      continue;
    }
    if (!told) {
      const where = text.trim().split(" ").slice(1).join(" ");
      console.log(`Waiting for another test run to finish (${where})…`);
      told = true;
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
  process.env[HELD] = String(process.pid);
  process.on("exit", () => {
    if (read(file) === mine) rmSync(file, { force: true });
  });
}
