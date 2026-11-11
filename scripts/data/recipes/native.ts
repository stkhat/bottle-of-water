// The English → <native> pair dictionaries, each built by its recipe → data/packs/
// en-<native>/{index,dict-<n>}.json. index.json names the sources, and each entry carries
// the index of its own (docs/specs/architecture.md "Native meanings and the quality gate").
// Usage: node scripts/data/recipes/native.ts <native>…   (e.g. es; run the English
// scripts first and download the native edition, see docs/development.md "Language data")
import { join } from "node:path";
import type { LemmaPack } from "../../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../../src/core/phrases/pattern.ts";
import {
  DOWNLOAD_PACKS_DIR,
  KAIKKI_PATH,
  RAW_DIR,
  readPack,
  writeShards,
} from "../common.ts";
import {
  mergeSources,
  readEdition,
  readTranslationTables,
  termKeyOf,
} from "./recipe.ts";

/** The tag of English Wiktionary's translation tables in a pair pack's sources. */
export const TABLES_TAG = "enwiktionary-translations";

/**
 * The recipe of each English → native dictionary: the native language's Wiktionary
 * edition first, then English Wiktionary's translation tables into it (`langCodes`:
 * the codes kaikki gives that language's translations).
 */
const RECIPES: Readonly<
  Record<
    string,
    { edition: { tag: string; file: string }; tables: { langCodes: string[] } }
  >
> = {
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
  native: string,
  {
    termKey,
    rawDir = RAW_DIR,
    englishPath = KAIKKI_PATH,
  }: {
    termKey: (headword: string) => string | undefined;
    rawDir?: string;
    englishPath?: string;
  },
) {
  const recipe = Object.hasOwn(RECIPES, native) ? RECIPES[native] : undefined;
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

/** The term keys English packs file meanings under: vocabulary words and phrase patterns. */
function englishTermKey() {
  const phrases = readPack<PhrasePatterns>("en/phrases.json");
  return termKeyOf({
    vocab: new Set(readPack<string[]>("en/vocab.json")),
    lemmas: readPack<LemmaPack>("en/lemmas.json"),
    phrases: new Set([...phrases.detect, ...phrases.more]),
  });
}

async function main() {
  const natives = process.argv.slice(2);
  if (natives.length === 0) throw new Error("Name the native languages: es…");
  const termKey = englishTermKey();
  for (const native of natives) {
    const { dict, sources, counts, stats } = await buildPairDictionary(native, {
      termKey,
    });
    const index = writeShards(`en-${native}`, dict, DOWNLOAD_PACKS_DIR, {
      sources,
    });
    console.log(
      `en-${native}: ${stats.terms} terms (` +
        Object.entries(counts)
          .map(([tag, n]) => `${n} ${tag}`)
          .join(", ") +
        `) in ${index.shards.length} shards; ${stats.unparsable} unparsable lines`,
    );
    if (stats.unparsable > 0) process.exitCode = 1;
  }
}

if (import.meta.main) await main();
