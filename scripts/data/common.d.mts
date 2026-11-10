export const ROOT: string;
export const RAW_DIR: string;
export const PACKS_DIR: string;
export function isMain(url: string): boolean;
export function stringifyPack(
  value: unknown[] | Record<string, unknown>,
): string;
export function writePack(
  relPath: string,
  value: unknown[] | Record<string, unknown>,
  dir?: string,
): void;
export function readPack(relPath: string): unknown;
export function fetchText(url: string): Promise<string>;
export function singleIpa(ipa: string): string | undefined;
