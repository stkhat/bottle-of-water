// The English → <native> pair dictionaries, each built by its recipe from human-made
// sources in order → data/packs/en-<native>/{index,dict-<n>}.json. Per term the first
// source that has it supplies all of it; index.json names the sources, and each entry
// carries the index of its own (docs/specs/2026-11-11-language-data-scaling-design.md §3).
// Usage: node scripts/data/recipes/native.mjs <native>…   (e.g. es; run the English
// scripts first and download the native edition, see docs/plans/2026-11-11-m9d-native-languages.md)
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  DOWNLOAD_PACKS_DIR,
  isMain,
  RAW_DIR,
  readPack,
  writePack,
} from "../common.mjs";
import { shardDict } from "../ejdict.mjs";
import { KAIKKI_PATH } from "../kaikki.mjs";
import {
  mergeSources,
  readEdition,
  readTranslationTables,
  termKeyOf,
} from "./recipe.mjs";

/** The tag of English Wiktionary's translation tables in a pair pack's sources. */
export const TABLES_TAG = "enwiktionary-translations";

/**
 * The recipe of each English → native dictionary: the native language's Wiktionary
 * edition first, then English Wiktionary's translation tables into it (`langCodes`:
 * the codes kaikki gives that language's translations; `word` rewrites or drops a
 * translated word).
 */
export const RECIPES = {
  es: {
    edition: { tag: "eswiktionary", file: "kaikki-es-edition.jsonl" },
    tables: { langCodes: ["es"] },
  },
  pt: {
    edition: { tag: "ptwiktionary", file: "kaikki-pt-edition.jsonl" },
    tables: { langCodes: ["pt"] },
  },
};

/** Reads the sources of `native`'s recipe and merges them. */
export async function buildPairDictionary(
  native,
  { termKey, rawDir = RAW_DIR, englishPath = KAIKKI_PATH },
) {
  const recipe = RECIPES[native];
  if (!recipe) throw new Error(`No recipe for en-${native}`);
  const [edition, tables] = await Promise.all([
    readEdition(join(rawDir, recipe.edition.file), termKey, {
      trimPeriod: true,
    }),
    readTranslationTables(englishPath, { ...recipe.tables, termKey }),
  ]);
  const merged = mergeSources([
    { tag: recipe.edition.tag, terms: edition.terms },
    { tag: TABLES_TAG, terms: tables.terms },
  ]);
  return {
    ...merged,
    stats: {
      unparsable: edition.stats.unparsable + tables.stats.unparsable,
      terms: Object.keys(merged.dict).length,
    },
  };
}

/** Writes en-<native>/: the shards and index.json with the sources; removes old shards. */
export function writePairPack(
  name,
  { dict, sources },
  dir = DOWNLOAD_PACKS_DIR,
) {
  const packDir = join(dir, name);
  if (existsSync(packDir))
    for (const file of readdirSync(packDir))
      if (/^(dict-\d+|index)\.json$/.test(file)) rmSync(join(packDir, file));
  const { index, shards } = shardDict(dict);
  for (const shard of shards)
    writePack(`${name}/${shard.file}`, shard.dict, dir);
  writePack(`${name}/index.json`, { ...index, sources }, dir);
  return { index };
}

/** The term keys English packs file meanings under: vocabulary words and phrase patterns. */
export function englishTermKey() {
  const phrases = readPack("en/phrases.json");
  return termKeyOf({
    vocab: new Set(readPack("en/vocab.json")),
    lemmas: readPack("en/lemmas.json"),
    phrases: new Set([...phrases.detect, ...phrases.more]),
  });
}

async function main() {
  const natives = process.argv.slice(2);
  if (natives.length === 0) throw new Error("Name the native languages: es…");
  const termKey = englishTermKey();
  for (const native of natives) {
    const result = await buildPairDictionary(native, { termKey });
    const { index } = writePairPack(`en-${native}`, result);
    console.log(
      `en-${native}: ${result.stats.terms} terms (` +
        Object.entries(result.counts)
          .map(([tag, n]) => `${n} ${tag}`)
          .join(", ") +
        `) in ${index.shards.length} shards; ${result.stats.unparsable} unparsable lines`,
    );
    if (result.stats.unparsable > 0) process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) await main();
