// EJDict-hand (public domain) → public/packs/en-ja/{index,dict-<n>}.json,
// public/packs/en/vocab.json and data/gate/en-capitalized.json (for the quality gate)
// Usage: node scripts/data/ejdict.ts   (downloads missing raw files into data/raw/ejdict/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanShort } from "../../src/core/lexicon/short-lines.ts";
import type { DictPack } from "../../src/core/packs/types.ts";
import {
  byCodeUnit,
  fetchText,
  GATE_DIR,
  PACKS_DIR,
  RAW_DIR,
  writePack,
  writeShards,
} from "./common.ts";

const COMMIT = "2dd9e71ffcefce89b4d946ce07bf51fa0573aac0";
const BASE_URL = `https://raw.githubusercontent.com/kujirahand/EJDict/${COMMIT}/src/`;
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const EJDICT_DIR = join(RAW_DIR, "ejdict");

function shortOf(senses: string[]) {
  for (const sense of senses) {
    const short = cleanShort(sense);
    if (short) return short;
  }
  // Every sense is only a note (e.g. "were"): keep the note text.
  return cleanShort(senses[0]!.replace(/[《》]/g, ""));
}

/** Parses EJDict TSV text into `{ headword: [short, senses] }` with lowercase keys. */
export function parseEjdict(text: string): DictPack {
  // Headwords that differ only in case (May / may) are merged; the lowercase one comes first.
  const groups = new Map<string, { lower: string[]; other: string[] }>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const senses = line
      .slice(tab + 1)
      .split(" / ")
      .map((s) => s.trim())
      .filter(Boolean);
    if (senses.length === 0) continue;
    const keys = new Map<string, boolean>();
    for (const variant of line.slice(0, tab).split(",")) {
      const headword = variant.trim();
      if (!headword) continue;
      const key = headword.toLowerCase();
      keys.set(key, keys.get(key) || headword === key);
    }
    for (const [key, isLower] of keys) {
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { lower: [], other: [] }));
      (isLower ? group.lower : group.other).push(...senses);
    }
  }
  const dict: Record<string, [string, string[]]> = {};
  for (const [key, { lower, other }] of groups) {
    const senses = [...new Set([...lower, ...other])];
    dict[key] = [shortOf(senses), senses];
  }
  return dict;
}

/**
 * Single-word headwords EJDict writes only with capitals (David, Paris, TV): names and
 * abbreviations, lowercase and sorted. The quality gate does not count them.
 */
export function capitalizedOnly(text: string) {
  const lower = new Set<string>();
  const capitalized = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    for (const variant of line.slice(0, tab).split(",")) {
      const headword = variant.trim().replace(/\.$/, "");
      if (!headword || /\s/.test(headword)) continue;
      const key = headword.toLowerCase();
      (headword === key ? lower : capitalized).add(key);
    }
  }
  return [...capitalized].filter((key) => !lower.has(key)).sort(byCodeUnit);
}

/** The words Lingo knows: single-word headwords, sorted by code unit. */
export function vocabularyOf(dict: DictPack) {
  return Object.keys(dict)
    .filter((key) => !key.includes(" "))
    .sort(byCodeUnit);
}

async function download() {
  mkdirSync(EJDICT_DIR, { recursive: true });
  for (const letter of LETTERS) {
    const path = join(EJDICT_DIR, `${letter}.txt`);
    if (existsSync(path)) continue;
    console.log(`Downloading ${letter}.txt`);
    writeFileSync(path, await fetchText(`${BASE_URL}${letter}.txt`));
  }
}

async function main() {
  await download();
  const text = LETTERS.map((letter) =>
    readFileSync(join(EJDICT_DIR, `${letter}.txt`), "utf8"),
  ).join("\n");
  const dict = parseEjdict(text);
  const index = writeShards("en-ja", dict, PACKS_DIR);
  const vocab = vocabularyOf(dict);
  writePack("en/vocab.json", vocab);
  writePack("en-capitalized.json", capitalizedOnly(text), GATE_DIR);
  console.log(
    `en-ja: ${Object.keys(dict).length} headwords in ${index.shards.length} shards; ` +
      `en/vocab.json: ${vocab.length} single words`,
  );
}

if (import.meta.main) await main();
