// Keeps every CLAUDE.md short. Details belong in docs/.
// Usage: node scripts/check-claude-md.mjs          check all CLAUDE.md files
//        node scripts/check-claude-md.mjs --hook   Claude Code PostToolUse hook (stdin JSON)
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT = 150;
const SKIP_DIRS = new Set(["node_modules", ".git", ".output", ".wxt", "data"]);

export function countLines(text) {
  if (text === "") return 0;
  const lines = text.split(/\r\n|\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

export function checkFiles(paths, limit = LIMIT) {
  const offending = [];
  for (const path of paths) {
    const lines = countLines(readFileSync(path, "utf8"));
    if (lines > limit) offending.push({ path, lines });
  }
  return offending;
}

function findClaudeMdFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        found.push(...findClaudeMdFiles(join(dir, entry.name)));
      }
    } else if (entry.name === "CLAUDE.md") {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function runHook() {
  let filePath;
  try {
    filePath = JSON.parse(readStdin())?.tool_input?.file_path;
  } catch {
    return 0;
  }
  if (typeof filePath !== "string" || basename(filePath) !== "CLAUDE.md") {
    return 0;
  }
  let offending;
  try {
    offending = checkFiles([filePath]);
  } catch {
    return 0; // missing or unreadable file: nothing to check
  }
  if (offending.length === 0) return 0;
  process.stderr.write(
    `CLAUDE.md has ${offending[0].lines} lines; the limit is ${LIMIT}. ` +
      `Move details to docs/ and link them from CLAUDE.md.\n`,
  );
  return 2;
}

function runCheck() {
  const offending = checkFiles(findClaudeMdFiles(resolve(".")));
  if (offending.length === 0) return 0;
  for (const { path, lines } of offending) {
    console.error(`${path}: ${lines} lines (limit ${LIMIT})`);
  }
  console.error("Move details to docs/ and link them from CLAUDE.md.");
  return 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(process.argv.includes("--hook") ? runHook() : runCheck());
}
