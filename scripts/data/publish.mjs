// Writes the pack lock file (src/core/packs/packs.lock.json) and an npm package folder
// for each pack in data/packs/ (data/publish/<pack>/, git-ignored; `npm publish` is run
// by hand from there).
// Usage: npm run data:publish [-- --download es,es-en]
//   --download: the packs the extension downloads instead of bundling (data/packs/
//   packs only). Every other pack is bundled.
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { isMain, ROOT } from "./common.mjs";
import { PACKS } from "./formats.mjs";

/** Where the extension fetches a downloaded pack's files from, tried in order. */
export const MIRRORS = [
  "https://cdn.jsdelivr.net/npm/{package}@{version}/{file}",
  "https://unpkg.com/{package}@{version}/{file}",
];
export const LOCK_PATH = join(ROOT, "src", "core", "packs", "packs.lock.json");
export const PUBLISH_DIR = join(ROOT, "data", "publish");

/** Every file under `dir`: its path relative to `dir` (with "/"), size and SHA-256, sorted by path. */
export function listPackFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const bytes = readFileSync(join(entry.parentPath, entry.name));
      return {
        path: relative(dir, join(entry.parentPath, entry.name))
          .split(sep)
          .join("/"),
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The version prefix for files built on `date`, as plain semver parts: the UTC year,
 * then month × 100 + day (Nov 11 → "2026.1111", Jan 5 → "2026.105"), so later dates
 * compare higher.
 */
export function dateVersion(date) {
  return `${date.getUTCFullYear()}.${(date.getUTCMonth() + 1) * 100 + date.getUTCDate()}`;
}

const sameFiles = (a, b) =>
  a.length === b.length &&
  a.every(
    (file, i) =>
      file.path === b[i].path &&
      file.size === b[i].size &&
      file.sha256 === b[i].sha256,
  );

/**
 * A pack's version: the previous one while its files are unchanged, else
 * `<dateVersion>.<n>`, where n is 0 for the day's first changed build and one more
 * than the previous version's for each later build that day.
 */
export function nextVersion(files, previous, now = new Date()) {
  if (previous && sameFiles(files, previous.files)) return previous.version;
  const day = dateVersion(now);
  const [, previousDay, n] =
    /^(\d+\.\d+)\.(\d+)$/.exec(previous?.version ?? "") ?? [];
  return `${day}.${previousDay === day ? Number(n) + 1 : 0}`;
}

/** Fails on a folder next to the packs' folders that no pack in `packs` is. */
function checkFolders(packs) {
  const dirs = new Set(Object.values(packs).map((info) => info.dir));
  for (const root of new Set([...dirs].map((d) => dirname(d)))) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true }))
      if (entry.isDirectory() && !dirs.has(join(root, entry.name)))
        throw new Error(
          `${relative(ROOT, join(root, entry.name))}: ${entry.name} is not a known pack (add it to scripts/data/formats.mjs)`,
        );
  }
}

/**
 * The lock for the packs' files as they are now. `previous` is the current lock (its
 * versions are kept for unchanged packs); `download` names the packs that are not
 * bundled, which must be downloadable (data/packs/).
 */
export function buildLock(
  packs,
  { previous, download = [], now = new Date() } = {},
) {
  for (const name of download) {
    if (!Object.hasOwn(packs, name)) throw new Error(`Unknown pack: ${name}`);
    if (!packs[name].downloadable)
      throw new Error(
        `${name} is always bundled: only the packs in data/packs/ can be downloaded`,
      );
  }
  checkFolders(packs);
  const entries = Object.keys(packs)
    .sort()
    .map((name) => {
      const info = packs[name];
      const files = existsSync(info.dir) ? listPackFiles(info.dir) : [];
      if (files.length === 0)
        throw new Error(`${name} has no files in ${relative(ROOT, info.dir)}`);
      const entry = {
        package: info.package,
        version: nextVersion(files, previous?.packs?.[name], now),
        format: info.format,
        bundled: !download.includes(name),
        files,
      };
      return [name, entry];
    });
  return { v: 1, mirrors: MIRRORS, packs: Object.fromEntries(entries) };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

/** The lock as written: keys sorted, two-space indents. */
export function stringifyLock(lock) {
  return `${JSON.stringify(sortKeys(lock), null, 2)}\n`;
}

function packageJson(info, entry) {
  return {
    name: info.package,
    version: entry.version,
    description: `${info.description}, for the Lingo browser extension`,
    license: info.license.spdx,
    files: entry.files.map((file) => file.path),
    publishConfig: { access: "public" },
  };
}

function licenseText(info) {
  return [
    `The data files in this package (${info.package}) are licensed under the`,
    `${info.license.name}:`,
    info.license.url,
    "",
    "They are derived from:",
    ...info.sources.map(
      (s) =>
        `- ${s.title} (${s.url})${s.via ? `, ${s.via}` : ""}. By ${s.by}. License: ${s.license}.`,
    ),
    "",
    `Changes from the sources: ${info.changes}.`,
    "",
  ].join("\n");
}

function readme(info) {
  return [
    `# ${info.package}`,
    "",
    `${info.title} for the Lingo browser extension: ${info.description}.`,
    "",
    "The files are JSON data that the extension downloads, checks against the SHA-256 values it ships with and reads. They contain no code.",
    "",
    "## Sources",
    "",
    ...info.sources.map(
      (s) =>
        `- [${s.title}](${s.url})${s.via ? `, ${s.via}` : ""}: ${s.used}. By ${s.by}. License: ${s.license}.`,
    ),
    "",
    "## License",
    "",
    `[${info.license.name}](${info.license.url}). The files were changed from the sources: ${info.changes}. See \`LICENSE\`.`,
    "",
  ].join("\n");
}

/** Writes data/publish/<pack>/ for each downloadable pack (the folder is replaced). */
export function writePackages(packs, lock, publishDir = PUBLISH_DIR) {
  rmSync(publishDir, { recursive: true, force: true });
  const written = [];
  for (const [name, info] of Object.entries(packs)) {
    if (!info.downloadable) continue;
    const entry = lock.packs[name];
    const out = join(publishDir, name);
    mkdirSync(out, { recursive: true });
    for (const file of entry.files)
      cpSync(join(info.dir, file.path), join(out, file.path));
    writeFileSync(
      join(out, "package.json"),
      `${JSON.stringify(packageJson(info, entry), null, 2)}\n`,
    );
    writeFileSync(join(out, "LICENSE"), licenseText(info));
    writeFileSync(join(out, "README.md"), readme(info));
    written.push(name);
  }
  return written;
}

/** Writes the lock and the npm package folders. Returns the lock and the packages written. */
export function publish({
  packs = PACKS,
  lockPath = LOCK_PATH,
  publishDir = PUBLISH_DIR,
  download = [],
  now = new Date(),
} = {}) {
  const previous = existsSync(lockPath)
    ? JSON.parse(readFileSync(lockPath, "utf8"))
    : undefined;
  const lock = buildLock(packs, { previous, download, now });
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, stringifyLock(lock));
  return { lock, previous, packages: writePackages(packs, lock, publishDir) };
}

function main() {
  const { values } = parseArgs({ options: { download: { type: "string" } } });
  const download = (values.download ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const { lock, previous, packages } = publish({ download });
  for (const [name, entry] of Object.entries(lock.packs)) {
    const was = previous?.packs?.[name]?.version;
    const change = was === entry.version ? "unchanged" : `was ${was ?? "new"}`;
    const size = entry.files.reduce((n, f) => n + f.size, 0);
    console.log(
      `${name} ${entry.version} (${change}), format ${entry.format}, ` +
        `${entry.bundled ? "bundled" : "downloaded"}, ${entry.files.length} files, ${(size / 1e6).toFixed(2)} MB`,
    );
  }
  console.log(`Wrote ${relative(ROOT, LOCK_PATH)}`);
  if (packages.length > 0)
    console.log(
      `Wrote ${packages.map((name) => relative(ROOT, join(PUBLISH_DIR, name))).join(", ")}`,
    );
}

if (isMain(import.meta.url)) main();
