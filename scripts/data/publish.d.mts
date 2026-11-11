import type { PackInfo } from "./formats.mjs";

export interface PackLockFile {
  path: string;
  size: number;
  sha256: string;
}
export interface PackLockEntry {
  package: string;
  version: string;
  format: number;
  bundled: boolean;
  files: PackLockFile[];
}
export interface PackLock {
  v: 1;
  mirrors: string[];
  packs: Record<string, PackLockEntry>;
}
export const MIRRORS: string[];
export const LOCK_PATH: string;
export const PUBLISH_DIR: string;
export function listPackFiles(dir: string): PackLockFile[];
export function dateVersion(date: Date): string;
export function nextVersion(
  files: PackLockFile[],
  previous: PackLockEntry | undefined,
  now?: Date,
): string;
export function buildLock(
  packs: Readonly<Record<string, PackInfo>>,
  options?: { previous?: PackLock; download?: string[]; now?: Date },
): PackLock;
export function stringifyLock(lock: PackLock): string;
export function writePackages(
  packs: Readonly<Record<string, PackInfo>>,
  lock: PackLock,
  publishDir?: string,
): string[];
export function publish(options?: {
  packs?: Readonly<Record<string, PackInfo>>;
  lockPath?: string;
  publishDir?: string;
  download?: string[];
  now?: Date;
}): { lock: PackLock; previous: PackLock | undefined; packages: string[] };
