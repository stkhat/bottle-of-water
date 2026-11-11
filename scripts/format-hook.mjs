// Claude Code PostToolUse hook (stdin JSON): formats the edited file with Prettier.
// Files Prettier ignores or cannot parse are left alone; a hook failure never blocks the edit.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let filePath;
try {
  filePath = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof filePath === "string") {
  try {
    execFileSync(
      "npx",
      [
        "--no-install",
        "prettier",
        "--write",
        "--ignore-unknown",
        "--log-level=warn",
        filePath,
      ],
      {
        cwd: process.env.CLAUDE_PROJECT_DIR,
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
  } catch {
    // syntax error mid-edit, or the file is outside the project
  }
}
