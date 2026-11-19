// EJDict-hand (public domain) → data/packs/en-ja/{index,dict-<n>,capital}.json,
// and data/gate/en-capitalized.json (for the quality gate); kaikki.ts writes the vocabulary
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

/**
 * How a headword is written: in lower case, capitalised (Japan, May, McDonald), in
 * capitals only (an acronym: US, WHO, U.S.), or otherwise (iPhone).
 */
function writtenOf(headword: string) {
  if (headword === headword.toLowerCase()) return "lower";
  if (!/^\p{Lu}/u.test(headword)) return "other";
  return /\p{Ll}/u.test(headword) ? "title" : "upper";
}

export interface Ejdict {
  /** `{ headword: [short, senses] }` with lowercase keys. */
  dict: DictPack;
  /**
   * en-ja/capital.json: the senses of the capitalised headwords of single words, by
   * the lowercase key (Japan → 『日本』, May → 『5月』, Paris, David), and those of
   * acronyms by the key in capitals (US → 合衆国, WHO). A key that also has a
   * lowercase headword (japan, may, us) keeps only the lowercase senses in `dict`; a
   * key written only with capitals keeps them in `dict` too, and is listed here only
   * with its capitalised headwords (Paris, not TV).
   */
  capital: DictPack;
}

/**
 * Parses EJDict TSV text. Headwords that differ only in case are one key. A
 * single-word key with a lowercase headword and capitalised ones (may / May, us / US)
 * keeps the lowercase senses; the others go to `capital`. Otherwise the variants are
 * merged, the lowercase headword first (a multi-word key like "jim crow").
 */
export function parseEjdict(text: string): Ejdict {
  type Written = ReturnType<typeof writtenOf>;
  const groups = new Map<string, Record<Written, string[]>>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const senses = line
      .slice(tab + 1)
      .split(" / ")
      .map((s) => s.trim())
      .filter(Boolean);
    if (senses.length === 0) continue;
    /** key → how the line writes it; a line that lists the lowercase headword is lowercase */
    const keys = new Map<string, Written>();
    for (const variant of line.slice(0, tab).split(",")) {
      const headword = variant.trim();
      if (!headword) continue;
      const key = headword.toLowerCase();
      const written = writtenOf(headword);
      if (keys.get(key) !== "lower") keys.set(key, written);
    }
    for (const [key, written] of keys) {
      let group = groups.get(key);
      if (!group)
        groups.set(
          key,
          (group = { lower: [], title: [], upper: [], other: [] }),
        );
      group[written].push(...senses);
    }
  }
  const dict: Record<string, [string, string[]]> = {};
  const capital: Record<string, [string, string[]]> = {};
  const entry = (senses: string[]): [string, string[]] => [
    shortOf(senses),
    senses,
  ];
  for (const [key, { lower, title, upper, other }] of groups) {
    const single = !/\s/.test(key);
    const split = single && lower.length > 0;
    const own = [...new Set(split ? [...lower, ...other] : [])];
    const apart = (senses: string[]) =>
      [...new Set(senses)].filter((sense) => !own.includes(sense));
    if (single && apart(title).length > 0) capital[key] = entry(apart(title));
    if (split && apart(upper).length > 0)
      capital[key.toUpperCase()] = entry(apart(upper));
    const senses = split
      ? own
      : [...new Set([...lower, ...title, ...upper, ...other])];
    // A sense that only says the word abbreviates a capitalised name ("Oklahoma(オク
    // ラホマ州)の略" of OK, "Coca Colaの略称" of coke) is the capitalised word's: it goes
    // with the capitalised senses, under the acronym when the line writes the word in
    // capitals (OK), else capitalised (Coke). Not a headword's only sense.
    const names = single
      ? senses.filter((sense) => NAME_ABBREVIATION.test(sense))
      : [];
    if (names.length > 0 && names.length < senses.length) {
      for (const sense of names) {
        const at = upper.includes(sense) ? key.toUpperCase() : key;
        const moved = [...(capital[at]?.[1] ?? []), sense];
        capital[at] = entry([...new Set(moved)]);
      }
      dict[key] = entry(senses.filter((sense) => !names.includes(sense)));
    } else dict[key] = entry(senses);
  }
  return { dict, capital };
}

/**
 * An EJDict sense that only says its headword abbreviates a capitalised English name,
 * with notes: "Oklahoma(オクラホマ州)の略", "〈U〉《しばしばC-》Coca Colaの略称".
 */
const NAME_ABBREVIATION =
  /^(?:〈[CU]〉|《[^》]*》|\{[^{}\s]{1,4}\}|\s)*[A-Z][A-Za-z.'’ -]*?\s*(?:[(（][^()（）]*[)）])?\s*の略(?:称)?$/u;

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

/**
 * Abbreviations with a period inside that EJDict writes with capitals (U.S., Ph.D.,
 * A.M.), as written, sorted: the vocabulary has them in lower case, but their case
 * matters ("i.d." is inside diameter, "I.D." is not), so the language pack lists how
 * they are written (en/capitals.json).
 */
export function dottedCapitals(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    for (const variant of line.slice(0, tab).split(",")) {
      const headword = variant.trim();
      if (/\s/.test(headword) || !/\.[^.]/.test(headword)) continue;
      if (/\p{Lu}/u.test(headword)) found.add(headword);
    }
  }
  return [...found].sort(byCodeUnit);
}

/**
 * Multi-word headwords EJDict writes only in Title Case, every word capitalised (New
 * York, American Revolution): named entities, lowercase.
 */
export function titleCasePhrases(text: string): Set<string> {
  const lower = new Set<string>();
  const title = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    for (const variant of line.slice(0, tab).split(",")) {
      const headword = variant.trim();
      if (!/\s/.test(headword)) continue;
      const key = headword.toLowerCase().split(/\s+/).join(" ");
      if (headword.split(/\s+/).every((word) => /^\p{Lu}/u.test(word)))
        title.add(key);
      else lower.add(key);
    }
  }
  return new Set([...title].filter((key) => !lower.has(key)));
}

/** EJDict's raw files (data/raw/ejdict/), one after the other. */
export const readEjdictText = () =>
  LETTERS.map((letter) =>
    readFileSync(join(EJDICT_DIR, `${letter}.txt`), "utf8"),
  ).join("\n");

/** EJDict's single-word headwords, sorted by code unit: the vocabulary before rule E. */
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
  const text = readEjdictText();
  const { dict, capital } = parseEjdict(text);
  const index = writeShards("en-ja", dict, PACKS_DIR);
  writePack("en-ja/capital.json", capital);
  writePack("en-capitalized.json", capitalizedOnly(text), GATE_DIR);
  console.log(
    `en-ja: ${Object.keys(dict).length} headwords in ${index.shards.length} shards; ` +
      `en-ja/capital.json: ${Object.keys(capital).length} capitalised headwords`,
  );
}

if (import.meta.main) await main();
