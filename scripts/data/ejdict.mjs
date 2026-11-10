// EJDict-hand (public domain) → public/packs/en-ja/{index,dict-<n>}.json and
// public/packs/en/vocab.json
// Usage: node scripts/data/ejdict.mjs   (downloads missing raw files into data/raw/ejdict/)
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  fetchText,
  isMain,
  PACKS_DIR,
  RAW_DIR,
  readPack,
  stringifyPack,
  writePack,
} from "./common.mjs";

const COMMIT = "2dd9e71ffcefce89b4d946ce07bf51fa0573aac0";
const BASE_URL = `https://raw.githubusercontent.com/kujirahand/EJDict/${COMMIT}/src/`;
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
export const EJDICT_DIR = join(RAW_DIR, "ejdict");
/** Largest dictionary shard file. AMO's linter refuses text files over 5 MB. */
export const SHARD_MAX_BYTES = 2_000_000;
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

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

/** The words Lingo knows: single-word headwords, sorted by code unit. */
export function vocabularyOf(dict) {
  return Object.keys(dict)
    .filter((key) => !key.includes(" "))
    .sort(byCodeUnit);
}

/**
 * Splits the dictionary into shards of consecutive headwords (sorted by code unit),
 * each filled as far as `maxBytes` allows once written with stringifyPack, so the
 * split only changes when the data does.
 */
export function shardDict(dict, maxBytes = SHARD_MAX_BYTES) {
  const bytes = (value) => Buffer.byteLength(stringifyPack(value));
  // stringifyPack writes "{\n", the lines joined by ",\n", then "\n}\n".
  const lineBytes = (key) =>
    Buffer.byteLength(`${JSON.stringify(key)}:${JSON.stringify(dict[key])}`);
  const groups = [];
  let keys = [];
  let size = 0;
  for (const key of Object.keys(dict).sort(byCodeUnit)) {
    const line = lineBytes(key) + 2;
    if (3 + line > maxBytes)
      throw new Error(`The entry "${key}" alone is over ${maxBytes} bytes`);
    if (keys.length > 0 && 3 + size + line > maxBytes) {
      groups.push(keys);
      keys = [];
      size = 0;
    }
    keys.push(key);
    size += line;
  }
  if (keys.length > 0) groups.push(keys);
  const shards = groups.map((group, i) => ({
    file: `dict-${i + 1}.json`,
    dict: Object.fromEntries(group.map((key) => [key, dict[key]])),
  }));
  for (const shard of shards)
    if (bytes(shard.dict) > maxBytes)
      throw new Error(`${shard.file} is over ${maxBytes} bytes`);
  return {
    index: {
      shards: groups.map((group, i) => ({
        file: shards[i].file,
        first: group[0],
        last: group.at(-1),
      })),
    },
    shards,
  };
}

/** Writes the dictionary shards, their index and the vocabulary; removes old shards. */
export function writeDictPacks(dict) {
  const dir = join(PACKS_DIR, "en-ja");
  if (existsSync(dir))
    for (const name of readdirSync(dir))
      if (/^dict(-\d+)?\.json$/.test(name)) rmSync(join(dir, name));
  const { index, shards } = shardDict(dict);
  for (const shard of shards) writePack(`en-ja/${shard.file}`, shard.dict);
  writePack("en-ja/index.json", index);
  writePack("en/vocab.json", vocabularyOf(dict));
  return { index, shards };
}

/** Reads a written sharded dictionary (en-ja by default) back from its shards, as one object. */
export function readDictPacks(dir = "en-ja") {
  const { shards } = readPack(`${dir}/index.json`);
  return Object.fromEntries(
    shards.flatMap(({ file }) => Object.entries(readPack(`${dir}/${file}`))),
  );
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
  const { shards } = writeDictPacks(dict);
  console.log(
    `en-ja: ${Object.keys(dict).length} headwords in ${shards.length} shards; ` +
      `en/vocab.json: ${vocabularyOf(dict).length} single words`,
  );
}

if (isMain(import.meta.url)) await main();
