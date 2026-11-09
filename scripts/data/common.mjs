// Shared helpers for the data import scripts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const RAW_DIR = join(ROOT, "data", "raw");
export const PACKS_DIR = join(ROOT, "public", "packs");
const USER_AGENT =
  "LingoDataImport/0.1 (https://github.com/stkhat/bottle-of-water)";

/** True when the module at `url` is the script Node was started with. */
export function isMain(url) {
  return (
    Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(url)
  );
}

/**
 * Deterministic JSON: object keys sorted by code unit, one entry per line,
 * so regenerated packs give small, stable diffs.
 */
export function stringifyPack(value) {
  const lines = Array.isArray(value)
    ? value.map((item) => JSON.stringify(item))
    : Object.keys(value)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (lines.length === 0) return `${open}${close}\n`;
  return `${open}\n${lines.join(",\n")}\n${close}\n`;
}

/** Writes `value` to public/packs/<relPath>. */
export function writePack(relPath, value) {
  const path = join(PACKS_DIR, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyPack(value));
}

export function readPack(relPath) {
  return JSON.parse(readFileSync(join(PACKS_DIR, relPath), "utf8"));
}

export async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}
