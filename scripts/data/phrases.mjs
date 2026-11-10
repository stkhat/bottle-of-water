// Dictionary phrases (idioms, phrasal verbs, prepositional phrases) from EJDict and the
// kaikki.org English Wiktionary extract (CC BY-SA) → public/packs/en/phrases.json,
// public/packs/en-ja/phrases.json (Japanese translations) and
// public/packs/en-defs/{index,dict-<n>}.json (English definitions)
// Usage: node scripts/data/phrases.mjs [path]   (default data/raw/kaikki-en.jsonl; run ejdict.mjs and frequency.mjs first)
import { createReadStream, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { isMain, PACKS_DIR, readPack, writePack } from "./common.mjs";
import { readDictPacks, shardDict } from "./ejdict.mjs";
import { KAIKKI_PATH, posLabel } from "./kaikki.mjs";

/** Words that stand for any person or thing ("make up one's mind"): such entries are patterns, not phrases. */
export const PLACEHOLDER_WORDS = new Set([
  "one's",
  "someone",
  "something",
  "oneself",
  "somebody",
  "sb",
  "sth",
]);
/**
 * kaikki phrases starting with one of these are left out: detection matches by base form,
 * so "be on" would match every "is on" / "was on".
 */
export const AUXILIARIES = new Set(["be", "have", "do"]);
const WORD = /^[a-z][a-z']*$/;
const UNUSABLE_TAGS = new Set([
  "form-of",
  "alt-of",
  "obsolete",
  "archaic",
  "misspelling",
]);
const PHRASE_POS = new Set(["phrase", "prep_phrase"]);
// Glosses that only point at the words' literal meanings ("see on, the").
const LITERAL_GLOSS = /^Used other than figuratively or idiomatically/;
/** An idiomatic sense counts only when a word of the phrase is rarer than this rank ("in it" does not). */
export const IDIOM_COMMON_RANK = 100;
/** A phrase or prepositional-phrase entry counts only when a word is rarer than this rank ("on the" does not). */
export const PHRASE_COMMON_RANK = 1000;
const MAX_SENSES = 4;
// The top-level headword, which kaikki writes right before the language.
const HEADWORD =
  /"word": ("(?:[^"\\]|\\.)*"), "lang": "English", "lang_code": "en"/;
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** The phrase key of a headword (words lowercased, joined by single spaces), or undefined when it is not a phrase Lingo can match. */
function phraseKey(headword, words) {
  const parts = headword.trim().toLowerCase().split(/ +/);
  if (parts.length < 2) return undefined;
  for (const part of parts)
    if (!WORD.test(part) || !words.has(part) || PLACEHOLDER_WORDS.has(part))
      return undefined;
  return parts.join(" ");
}

function isUsable(sense) {
  const glosses = sense.glosses;
  if (!Array.isArray(glosses) || glosses.length === 0) return false;
  if (typeof glosses.at(-1) !== "string" || !glosses.at(-1).trim())
    return false;
  if (LITERAL_GLOSS.test(glosses.at(-1).trim())) return false;
  if (Array.isArray(sense.form_of) || Array.isArray(sense.alt_of)) return false;
  return !(sense.tags ?? []).some((tag) => UNUSABLE_TAGS.has(tag));
}

function inCategory(categories, part) {
  return (categories ?? []).some((category) => {
    const name = typeof category === "string" ? category : category?.name;
    return typeof name === "string" && name.toLowerCase().includes(part);
  });
}

/** Wiktionary's "non-constituents" are word sequences that are not units ("on the", "of a"). */
function isNonConstituent(entry) {
  return (
    inCategory(entry.categories, "non-constituents") ||
    (entry.senses ?? []).some((sense) =>
      inCategory(sense.categories, "non-constituents"),
    )
  );
}

/**
 * Whether a usable sense makes its entry a phrase: a phrasal verb always; an idiomatic
 * sense when a word is outside the top IDIOM_COMMON_RANK; a phrase or prepositional
 * phrase when a word is outside the top PHRASE_COMMON_RANK.
 */
function isPhraseSense(entry, sense, rarestRank) {
  if (inCategory(sense.categories, "phrasal verbs")) return true;
  if (
    (sense.tags ?? []).includes("idiomatic") &&
    rarestRank > IDIOM_COMMON_RANK
  )
    return true;
  return PHRASE_POS.has(entry.pos) && rarestRank > PHRASE_COMMON_RANK;
}

function japaneseOf(translations, out) {
  for (const translation of translations ?? []) {
    if (translation?.lang_code !== "ja") continue;
    const word =
      typeof translation.word === "string" ? translation.word.trim() : "";
    if (word && !out.includes(word)) out.push(word);
  }
}

/** The first sense cut at the first `;`, without a final period. */
function shortOf(text) {
  const semicolon = text.indexOf(";");
  const cut = (semicolon >= 0 ? text.slice(0, semicolon) : text).trim();
  return cut.endsWith(".") ? cut.slice(0, -1).trimEnd() : cut;
}

/**
 * Streams the kaikki JSONL and builds the phrase list (EJDict multi-word headwords plus
 * kaikki idioms, phrasal verbs and phrases), Japanese translations for the phrases EJDict
 * lacks, and English definitions for those neither has.
 */
export async function importPhrases(path, vocab, dict, freq) {
  const words = new Set(vocab);
  const ranks = new Map(freq.map((word, i) => [word, i + 1]));
  const rarestRankOf = (key) =>
    Math.max(...key.split(" ").map((word) => ranks.get(word) ?? Infinity));
  const stats = { entries: 0, unparsable: 0 };
  // key → { phrase, senses: [pos, text][], senseJa, topJa: string[] }, entries merged in file order
  const found = new Map();
  const lines = createInterface({
    input: createReadStream(path, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const headword = HEADWORD.exec(line);
    if (headword && !headword[1].includes(" ")) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.unparsable++;
      continue;
    }
    if (entry.lang_code !== "en" || typeof entry.word !== "string") continue;
    if (!entry.word.trim().includes(" ")) continue;
    stats.entries++;
    const key = phraseKey(entry.word, words);
    if (!key || isNonConstituent(entry)) continue;
    if (AUXILIARIES.has(key.slice(0, key.indexOf(" ")))) continue;
    let item = found.get(key);
    if (!item)
      found.set(
        key,
        (item = { phrase: false, senses: [], senseJa: [], topJa: [] }),
      );
    japaneseOf(entry.translations, item.topJa);
    const rarestRank = rarestRankOf(key);
    const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
    for (const sense of entry.senses ?? []) {
      if (!isUsable(sense)) continue;
      item.phrase ||= isPhraseSense(entry, sense, rarestRank);
      item.senses.push([pos, sense.glosses.at(-1).trim()]);
      japaneseOf(sense.translations, item.senseJa);
    }
  }

  const fromEjdict = Object.keys(dict)
    .filter((key) => key.includes(" ") && phraseKey(key, words) === key)
    .sort(byCodeUnit);
  const fromKaikki = [...found]
    .filter(([, item]) => item.phrase)
    .map(([key]) => key)
    .sort(byCodeUnit);
  const phrases = [...new Set([...fromEjdict, ...fromKaikki])].sort(byCodeUnit);
  const ja = {};
  const defs = {};
  for (const key of fromKaikki) {
    if (Object.hasOwn(dict, key)) continue;
    const item = found.get(key);
    const translations = [...new Set([...item.senseJa, ...item.topJa])];
    if (translations.length > 0) {
      ja[key] = [translations[0], translations];
      continue;
    }
    const senses = item.senses.slice(0, MAX_SENSES);
    defs[key] = [shortOf(senses[0][1]), senses];
  }
  return {
    phrases,
    defs,
    ja,
    stats: {
      ...stats,
      phrases: phrases.length,
      fromEjdict: fromEjdict.length,
      fromKaikki: fromKaikki.length,
      ja: Object.keys(ja).length,
      defs: Object.keys(defs).length,
    },
  };
}

/** Writes the phrase list, the Japanese translations and the English definition shards; removes old shards. */
export function writePhrasePacks({ phrases, defs, ja }) {
  const dir = join(PACKS_DIR, "en-defs");
  if (existsSync(dir))
    for (const name of readdirSync(dir))
      if (/^(dict-\d+|index)\.json$/.test(name)) rmSync(join(dir, name));
  const { index, shards } = shardDict(defs);
  for (const shard of shards) writePack(`en-defs/${shard.file}`, shard.dict);
  writePack("en-defs/index.json", index);
  writePack("en/phrases.json", phrases);
  writePack("en-ja/phrases.json", ja);
  return { index };
}

async function main() {
  const dict = readDictPacks();
  const vocab = readPack("en/vocab.json");
  const freq = readPack("en/freq.json");
  const path = process.argv[2] ?? KAIKKI_PATH;
  const result = await importPhrases(path, vocab, dict, freq);
  const { index } = writePhrasePacks(result);
  const { stats } = result;
  console.log(
    `phrases: ${stats.entries} multi-word entries (${stats.unparsable} unparsable); ` +
      `${stats.phrases} phrases (${stats.fromEjdict} from EJDict, ${stats.fromKaikki} from kaikki); ` +
      `${stats.ja} with Japanese translations, ${stats.defs} with English definitions ` +
      `in ${index.shards.length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main();
