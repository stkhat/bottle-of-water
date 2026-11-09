// Copies the "check" build (`wxt build --mode check`) into .output/lingo-check, the
// folder loaded unpacked in your own Chrome. The build reloads itself when the
// build-id.txt written here changes (src/background/self-reload.ts).
// Usage: npm run build:check
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD_ID = "build-id.txt";

export function buildId(date, commit) {
  return `${date.toISOString()} ${commit}`;
}

/** Deletes what `to` has and `from` does not (keeping `to`'s build id until the end). */
function prune(from, to, top) {
  for (const entry of readdirSync(to, { withFileTypes: true })) {
    if (top && entry.name === BUILD_ID) continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (!existsSync(source)) rmSync(target, { recursive: true, force: true });
    else if (entry.isDirectory()) prune(source, target, false);
  }
}

/**
 * Makes `to` a copy of `from`, then writes the build id. The id goes last so the
 * extension, which reloads when it changes, never loads a half-copied folder.
 */
export function syncBuild(from, to, id) {
  if (existsSync(to)) prune(from, to, true);
  cpSync(from, to, { recursive: true, force: true });
  writeFileSync(join(to, BUILD_ID), `${id}\n`);
}

function commit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const from = resolve(".output/chrome-mv3-check");
  const to = resolve(".output/lingo-check");
  const id = buildId(new Date(), commit());
  syncBuild(from, to, id);
  console.log(`${to} updated (build ${id})`);
}
