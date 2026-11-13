import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import type { ShardIndex } from "../../src/core/packs/types.ts";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const RAW_DIR = join(ROOT, "data", "raw");
/** Packs that are always bundled (en, en-ja, en-defs). */
export const PACKS_DIR = join(ROOT, "public", "packs");
/** Packs that can be downloaded: bundled or not as their lock entry says. */
export const DOWNLOAD_PACKS_DIR = join(ROOT, "data", "packs");
/** Word lists the quality gate reads; not part of any pack. */
export const GATE_DIR = join(ROOT, "data", "gate");
export const KAIKKI_PATH = join(RAW_DIR, "kaikki-en.jsonl");
/**
 * The words rule E adds to the English vocabulary (`kaikki.ts` writes it;
 * `frequency.ts` ranks those its list lacks, the quality gate leaves them out).
 */
export const WIKTIONARY_WORDS_PATH = join(GATE_DIR, "en-wiktionary-words.json");
/** How often the example corpus writes each English vocabulary word (`kaikki.ts`); not shipped. */
export const EXAMPLE_COUNTS_PATH = join(RAW_DIR, "en-example-counts.json");
/** Largest dictionary shard file. AMO's linter refuses text files over 5 MB. */
const SHARD_MAX_BYTES = 2_000_000;

export const byCodeUnit = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Deterministic JSON: object keys sorted by code unit, one entry per line, so rebuilt
 * packs give small, stable diffs. With `lists`, an object's values (arrays) are written
 * one item per line too.
 */
export function stringifyPack(
  value: object,
  { lists = false }: { lists?: boolean } = {},
): string {
  const lines = Array.isArray(value)
    ? value.map((item) => JSON.stringify(item))
    : Object.keys(value)
        .sort(byCodeUnit)
        .map((key) => {
          const item = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${lists ? stringifyPack(item as object).trimEnd() : JSON.stringify(item)}`;
        });
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (lines.length === 0) return `${open}${close}\n`;
  return `${open}\n${lines.join(",\n")}\n${close}\n`;
}

/** Writes `value` to <dir>/<relPath> (public/packs/ by default). */
export function writePack(
  relPath: string,
  value: object,
  dir = PACKS_DIR,
  options: { lists?: boolean } = {},
) {
  const path = join(dir, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyPack(value, options));
}

/** Reads <dir>/<relPath> (public/packs/ by default). */
export function readPack<T>(relPath: string, dir = PACKS_DIR): T {
  return JSON.parse(readFileSync(join(dir, relPath), "utf8")) as T;
}

/**
 * Splits a dictionary into shards of consecutive headwords (sorted by code unit), each
 * filled as far as `maxBytes` allows once written with stringifyPack, so the split only
 * changes when the data does.
 */
export function shardDict<V>(
  dict: Readonly<Record<string, V>>,
  maxBytes = SHARD_MAX_BYTES,
) {
  // stringifyPack writes "{\n", the lines joined by ",\n", then "\n}\n".
  const lineBytes = (key: string) =>
    Buffer.byteLength(`${JSON.stringify(key)}:${JSON.stringify(dict[key])}`) +
    2;
  const groups: string[][] = [];
  let keys: string[] = [];
  let size = 0;
  for (const key of Object.keys(dict).sort(byCodeUnit)) {
    const line = lineBytes(key);
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
    dict: Object.fromEntries(group.map((key) => [key, dict[key]!])),
  }));
  for (const shard of shards)
    if (Buffer.byteLength(stringifyPack(shard.dict)) > maxBytes)
      throw new Error(`${shard.file} is over ${maxBytes} bytes`);
  const index: ShardIndex = {
    shards: groups.map((group, i) => ({
      file: shards[i]!.file,
      first: group[0]!,
      last: group.at(-1)!,
    })),
  };
  return { index, shards };
}

/**
 * Writes <dir>/<pack>/: `dict` in shards and their index.json (with `extra`), removing
 * the old shards.
 */
export function writeShards(
  pack: string,
  dict: Readonly<Record<string, unknown>>,
  dir: string,
  extra: Readonly<Record<string, unknown>> = {},
): ShardIndex {
  const packDir = join(dir, pack);
  if (existsSync(packDir))
    for (const file of readdirSync(packDir))
      if (/^(dict-\d+|index)\.json$/.test(file)) rmSync(join(packDir, file));
  const { index, shards } = shardDict(dict);
  for (const shard of shards)
    writePack(`${pack}/${shard.file}`, shard.dict, dir);
  writePack(`${pack}/index.json`, { ...index, ...extra }, dir);
  return index;
}

/** A sharded dictionary in `packDir` (as writeShards wrote it), as one object. */
export function readDictPacks<V>(packDir: string): Record<string, V> {
  const { shards } = readPack<ShardIndex>("index.json", packDir);
  return Object.fromEntries(
    shards.flatMap(({ file }) =>
      Object.entries(readPack<Record<string, V>>(file, packDir)),
    ),
  );
}

export interface KaikkiTranslation {
  lang_code?: string;
  word?: unknown;
  sense?: unknown;
}
type Categories = (string | { name?: unknown } | null)[];
export interface KaikkiSense {
  glosses?: unknown[];
  tags?: string[];
  categories?: Categories;
  topics?: unknown[];
  form_of?: { word?: unknown }[];
  alt_of?: unknown;
  translations?: KaikkiTranslation[];
}
/** An entry of kaikki.org's wiktextract JSONL, as far as the scripts read it. */
export interface KaikkiEntry {
  word: string;
  lang_code?: string;
  pos?: string;
  senses?: KaikkiSense[];
  sounds?: { ipa?: unknown; tags?: string[]; note?: string }[];
  forms?: { form?: unknown; tags?: string[] }[];
  translations?: KaikkiTranslation[];
  categories?: Categories;
}

/**
 * Streams a kaikki JSONL file, calling `onEntry` with each entry that has a word.
 * `skipLine` drops a line before it is parsed (and counted).
 */
export async function eachEntry(
  path: string,
  onEntry: (entry: KaikkiEntry) => void,
  skipLine?: (line: string) => boolean,
) {
  const stats = { entries: 0, unparsable: 0 };
  const lines = createInterface({
    input: createReadStream(path, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim() || skipLine?.(line)) continue;
    let entry: Partial<KaikkiEntry> | null;
    try {
      entry = JSON.parse(line) as Partial<KaikkiEntry> | null;
    } catch {
      stats.unparsable++;
      continue;
    }
    stats.entries++;
    if (typeof entry?.word === "string") onEntry(entry as KaikkiEntry);
  }
  return stats;
}

const POS_LABELS: Readonly<Record<string, string>> = {
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  pron: "pronoun",
  conj: "conjunction",
  intj: "interjection",
  det: "determiner",
  num: "numeral",
  name: "proper noun",
  abbrev: "abbreviation",
  postp: "postposition",
  prep_phrase: "prepositional phrase",
};

/** kaikki part-of-speech code → readable label (adj → adjective). */
export const posLabel = (pos: string) =>
  Object.hasOwn(POS_LABELS, pos) ? POS_LABELS[pos]! : pos.replaceAll("_", " ");

const USER_AGENT =
  "LingoDataImport/0.1 (https://github.com/stkhat/bottle-of-water)";

export async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

/** English Wiktionary's API, a second after the previous call to be polite. */
export async function wiktionaryApi<T>(
  params: Record<string, string>,
): Promise<T> {
  await sleep(1000);
  const query = new URLSearchParams({
    ...params,
    format: "json",
    formatversion: "2",
  });
  return JSON.parse(
    await fetchText(`https://en.wiktionary.org/w/api.php?${query}`),
  ) as T;
}

/** A Wiktionary page's wikitext, fetched once into the cache file `path`. */
export async function wikitext(title: string, path: string) {
  if (!existsSync(path)) {
    console.log(`Fetching ${title}`);
    const data = await wiktionaryApi<{ parse: { wikitext: string } }>({
      action: "parse",
      page: title,
      prop: "wikitext",
    });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data.parse.wikitext);
  }
  return readFileSync(path, "utf8");
}
