// EJDict-hand (public domain) → public/packs/en-ja/dict.json
// Usage: node scripts/data/ejdict.mjs   (downloads missing raw files into data/raw/ejdict/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchText, isMain, RAW_DIR, writePack } from "./common.mjs";

const COMMIT = "2dd9e71ffcefce89b4d946ce07bf51fa0573aac0";
const BASE_URL = `https://raw.githubusercontent.com/kujirahand/EJDict/${COMMIT}/src/`;
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
export const EJDICT_DIR = join(RAW_DIR, "ejdict");

/** Removes 《…》 notes (nested too), 『』 marks and 〈C〉/〈U〉, and cuts at the first `;`. */
export function cleanShort(sense) {
  let out = "";
  let depth = 0;
  for (const ch of sense) {
    if (ch === "《") depth++;
    else if (ch === "》") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  out = out.replace(/[『』]/g, "").replace(/〈[CU]〉/g, "");
  const semicolon = out.indexOf(";");
  if (semicolon >= 0) out = out.slice(0, semicolon);
  return out.trim();
}

function shortOf(senses) {
  for (const sense of senses) {
    const short = cleanShort(sense);
    if (short) return short;
  }
  // Every sense is only a note (e.g. "were"): keep the note text.
  return cleanShort(senses[0].replace(/[《》]/g, ""));
}

/** Parses EJDict TSV text into `{ headword: [short, senses] }` with lowercase keys. */
export function parseEjdict(text) {
  // Headwords that differ only in case (May / may) are merged; the lowercase one comes first.
  const groups = new Map();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const senses = line
      .slice(tab + 1)
      .split(" / ")
      .map((s) => s.trim())
      .filter(Boolean);
    if (senses.length === 0) continue;
    const keys = new Map();
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
  const dict = {};
  for (const [key, { lower, other }] of groups) {
    const senses = [...new Set([...lower, ...other])];
    dict[key] = [shortOf(senses), senses];
  }
  return dict;
}

/** The words Lingo knows: single-word headwords. */
export function vocabularyOf(dict) {
  return Object.keys(dict).filter((key) => !key.includes(" "));
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
  writePack("en-ja/dict.json", dict);
  console.log(
    `dict.json: ${Object.keys(dict).length} headwords, ${vocabularyOf(dict).length} single words`,
  );
}

if (isMain(import.meta.url)) await main();
