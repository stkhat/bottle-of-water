// packs.lock.json is written by `npm run data:publish`. Test builds override it with
// WXT_ variables (`import.meta.env`, from the environment or .env.<mode>), never in
// production mode; the build hook in wxt.config.ts reads the same variables from
// `process.env` to choose which packs to copy into the build.
//   WXT_PACKS_DOWNLOAD=es,es-en  → those packs are downloaded (not bundled)
//   WXT_PACK_MIRRORS=http://localhost:4719/mirror/{package}@{version}/{file},…
//                                → these URL templates replace the mirrors
import lockFile from "./packs.lock.json";
import type { PackName } from "./load";

/** One file of a pack version: its path in the pack (and in the npm package), size and SHA-256 (hex). */
export interface PackLockFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface PackLockEntry {
  /** The npm package the files are published in. */
  readonly package: string;
  readonly version: string;
  /** The data format of the files; a stored version in another format is not used. */
  readonly format: number;
  /** True: the files are in the extension (/packs/<pack>/). False: they are downloaded. */
  readonly bundled: boolean;
  readonly files: readonly PackLockFile[];
}

export interface PackLock {
  readonly v: 1;
  /** URL templates with {package}, {version} and {file}, tried in order. */
  readonly mirrors: readonly string[];
  readonly packs: Readonly<Record<PackName, PackLockEntry>>;
  /**
   * The language pairs offered (those passing the quality gate): learning language →
   * native languages, the default first.
   */
  readonly pairs: Readonly<Record<string, readonly string[]>>;
}

/** Bytes of a pack version's files. */
export const packBytes = (entry: Pick<PackLockEntry, "files">) =>
  entry.files.reduce((sum, file) => sum + file.size, 0);

/** The environment variables that override the lock in builds other than production. */
export interface LockEnv {
  readonly WXT_PACKS_DOWNLOAD?: string;
  readonly WXT_PACK_MIRRORS?: string;
}

const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * The lock with the environment's overrides applied, in any mode but "production":
 * the packs in WXT_PACKS_DOWNLOAD are not bundled, and WXT_PACK_MIRRORS replaces the
 * mirrors. Throws on a pack the lock does not have.
 */
export function applyOverrides(
  lock: PackLock,
  env: LockEnv,
  mode: string,
): PackLock {
  if (mode === "production") return lock;
  const download = list(env.WXT_PACKS_DOWNLOAD);
  const mirrors = list(env.WXT_PACK_MIRRORS);
  if (download.length === 0 && mirrors.length === 0) return lock;
  for (const name of download)
    if (!Object.hasOwn(lock.packs, name))
      throw new Error(`WXT_PACKS_DOWNLOAD: unknown pack ${name}`);
  const packs = Object.fromEntries(
    Object.entries(lock.packs).map(([name, entry]) => [
      name,
      download.includes(name) ? { ...entry, bundled: false } : entry,
    ]),
  ) as PackLock["packs"];
  return {
    ...lock,
    mirrors: mirrors.length > 0 ? mirrors : lock.mirrors,
    packs,
  };
}

declare global {
  interface ImportMetaEnv {
    readonly WXT_PACKS_DOWNLOAD?: string;
    readonly WXT_PACK_MIRRORS?: string;
  }
}

let current: PackLock | undefined;

/** The lock this build uses (with the overrides of a test build). */
export function readLock(): PackLock {
  current ??= applyOverrides(
    lockFile as PackLock,
    {
      WXT_PACKS_DOWNLOAD: import.meta.env.WXT_PACKS_DOWNLOAD,
      WXT_PACK_MIRRORS: import.meta.env.WXT_PACK_MIRRORS,
    },
    import.meta.env.MODE,
  );
  return current;
}
