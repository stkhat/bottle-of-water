// git pre-push hook: a branch may be pushed only once `npm run verify` passed on the tree
// it pushes (scripts/verify.ts records each tree it passed on). Tags and deletions pass.
// In an emergency, `git push --no-verify` skips it.
// stdin: one "<local ref> <local sha> <remote ref> <remote sha>" line per ref pushed.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVerified } from "./verify.ts";

const ZERO = /^0+$/;

/** The commits a push needs verified: branch updates that change something. */
export function pushedCommits(stdin: string): { ref: string; sha: string }[] {
  const commits: { ref: string; sha: string }[] = [];
  for (const line of stdin.split("\n")) {
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || !remoteRef) continue;
    if (ZERO.test(localSha)) continue; // deleting a remote branch
    if (!remoteRef.startsWith("refs/heads/")) continue; // tags
    if (localSha === remoteSha) continue; // already there
    commits.push({ ref: remoteRef.slice("refs/heads/".length), sha: localSha });
  }
  return commits;
}

function treeOf(sha: string): string {
  const result = spawnSync("git", ["rev-parse", `${sha}^{tree}`], {
    encoding: "utf8",
  });
  return result.stdout.trim();
}

function main(): number {
  const verified = new Set(readVerified());
  const unverified = pushedCommits(readFileSync(0, "utf8")).filter(
    ({ sha }) => !verified.has(treeOf(sha)),
  );
  if (unverified.length === 0) return 0;
  for (const { ref, sha } of unverified)
    console.error(
      `${ref} (${sha.slice(0, 7)}): npm run verify has not passed on this tree`,
    );
  console.error(
    "Run `npm run verify` (it records the tree when it passes), then push again.",
  );
  return 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main());
}
