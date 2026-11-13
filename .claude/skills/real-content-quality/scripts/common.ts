// Settings and paths shared by build-units.ts and measure.ts.
//
// Every setting comes from `--name=value` or the environment variable NAME. Study data
// lives in the main checkout's git-ignored data/raw/quality/<study>/ (worktrees symlink
// data/raw to it): corpus/ (and manifest.json), runs/<label>/ (units.jsonl, rows.jsonl,
// summary.json), packets/. STUDY defaults to the newest study there.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A setting: `--name=value`, else the environment variable NAME, else `fallback`. */
export function setting(name: string, fallback?: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (flag) return flag.slice(name.length + 3);
  return process.env[name.toUpperCase()] ?? fallback;
}

/** The checkout this script is in. */
export const SCRIPT_REPO = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

/** The checkout whose code and packs are run: REPO, default this one. */
export const repo = () => resolve(setting("repo") ?? SCRIPT_REPO);

/** data/raw/quality in the main checkout (the first entry of `git worktree list`). */
export function qualityRoot(): string {
  const list = execFileSync(
    "git",
    ["-C", SCRIPT_REPO, "worktree", "list", "--porcelain"],
    { encoding: "utf8" },
  );
  const main = /^worktree (.+)$/m.exec(list)?.[1] ?? SCRIPT_REPO;
  return join(main, "data/raw/quality");
}

/** STUDY: a directory, or a name under data/raw/quality; default the newest there. */
export function studyDir(): string {
  const study = setting("study");
  if (study?.includes("/")) return resolve(study);
  const root = qualityRoot();
  const name =
    study ?? (existsSync(root) ? readdirSync(root).sort().at(-1) : undefined);
  if (!name) throw new Error(`No study under ${root}: set STUDY or CORPUS`);
  return join(root, name);
}

/** The checkout's short commit, for default run labels. */
export const shortSha = (dir: string) =>
  execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();

export const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8"));

export const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);

/** One line of units.jsonl: a transcript card or an article paragraph. */
export interface Unit {
  /** "yt:<id>", "nf:<id>", "ar:<id>" */
  doc: string;
  site: "youtube" | "netflix" | "article";
  i: number;
  /** Start time, seconds ("12.3") or as the site showed it ("0:04"). */
  t?: string;
  text: string;
  /** The card's line in the native language ("" when it has none). Older runs: `ja`. */
  native?: string;
  /** Where that line came from (siteTrack, siteAutoTranslate, …). Older runs: `jaSource`. */
  nativeSource?: string;
  /** YouTube's machine translation aligned to the card, when a human track is shown. */
  tlang?: string;
  ja?: string;
  jaSource?: string;
}
