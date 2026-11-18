// Publishes the npm package of each pack whose version, as the committed
// lock names it, is not on npm yet. Run by .github/workflows/packs.yml (trusted
// publishing, no token) or by hand after `npm login`: a package's first version has to
// be published by hand, since npm lets a package take a trusted publisher only once it
// exists.
// Usage: npm run data:npm-publish [-- --dry-run]
//   --dry-run: `npm publish --dry-run` for each version not on npm yet.
// The lock is read as it is, never rewritten: run `npm run data:publish` and commit
// first. Files that differ from the lock stop it before anything is published, since
// the extension would refuse them (each file is checked against the lock's SHA-256).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { PackLock, PackLockFile } from "../../src/core/packs/lock.ts";
import { PACKS, type PackInfo } from "./formats.ts";
import {
  listPackFiles,
  LOCK_PATH,
  PUBLISH_DIR,
  writePackages,
} from "./publish.ts";

type Packs = Readonly<Record<string, PackInfo>>;

const sameFiles = (a: readonly PackLockFile[], b: readonly PackLockFile[]) =>
  a.length === b.length &&
  a.every(
    (file, i) =>
      file.path === b[i]?.path &&
      file.size === b[i]?.size &&
      file.sha256 === b[i]?.sha256,
  );

/** Why the lock does not describe the packs' files as they are; empty when it does. */
export function lockProblems(packs: Packs, lock: PackLock): string[] {
  const problems: string[] = [];
  for (const [name, info] of Object.entries(packs)) {
    const entry = lock.packs[name as keyof PackLock["packs"]];
    if (!entry) {
      problems.push(`${name}: not in the lock`);
      continue;
    }
    if (entry.package !== info.package)
      problems.push(
        `${name}: the lock names ${entry.package}, formats.ts ${info.package}`,
      );
    if (!sameFiles(listPackFiles(info.dir), entry.files))
      problems.push(`${name}: its files differ from the lock`);
  }
  return problems;
}

export interface NpmPackage {
  name: string;
  version: string;
  dir: string;
}

/** The packages to publish: those whose version is not on npm yet. */
export function unpublished(
  packages: readonly NpmPackage[],
  isPublished: (pkg: NpmPackage) => boolean,
) {
  return packages.filter((pkg) => !isPublished(pkg));
}

/** Whether npm has this version; false only when npm answers E404. */
function onNpm({ name, version }: NpmPackage) {
  const view = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf8",
  });
  if (view.status === 0) return view.stdout.trim() === version;
  if (/\bE404\b/.test(view.stderr)) return false;
  throw new Error(`npm view ${name}@${version} failed:\n${view.stderr}`);
}

function main() {
  const { values } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false } },
  });
  const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as PackLock;
  const problems = lockProblems(PACKS, lock);
  if (problems.length > 0) {
    console.error(
      `The lock does not match the pack files (run npm run data:publish and commit):\n${problems.join("\n")}`,
    );
    process.exit(1);
  }
  const packages = writePackages(PACKS, lock).map((pack) => {
    const dir = join(PUBLISH_DIR, pack);
    const { name, version } = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ) as NpmPackage;
    return { name, version, dir };
  });
  const toPublish = unpublished(packages, onNpm);
  for (const pkg of packages)
    if (!toPublish.includes(pkg))
      console.log(`${pkg.name}@${pkg.version} is on npm`);
  for (const pkg of toPublish) {
    console.log(`Publishing ${pkg.name}@${pkg.version}`);
    const args = ["publish", ...(values["dry-run"] ? ["--dry-run"] : [])];
    const run = spawnSync("npm", args, { cwd: pkg.dir, stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
  if (toPublish.length === 0) console.log("Nothing to publish");
}

if (import.meta.main) main();
