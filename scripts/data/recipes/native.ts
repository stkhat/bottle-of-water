// The English → <native> pair dictionaries, each built by its recipe → data/packs/
// en-<native>/{index,dict-<n>}.json. index.json names the sources, and each entry carries
// the index of its own (docs/specs/architecture.md "Native meanings and the quality gate").
// Usage: node scripts/data/recipes/native.ts <native>…   (e.g. es; run the English
// scripts first and download the recipe's raw files, see docs/development.md "Language
// data")
import { join } from "node:path";
import type { RecipeNative } from "../../../src/core/natives.ts";
import type { LemmaPack } from "../../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../../src/core/phrases/pattern.ts";
import {
  PACKS_DIR,
  KAIKKI_PATH,
  RAW_DIR,
  readPack,
  writeShards,
} from "../common.ts";
import { readWordnet, readWordnetMeanings } from "./omw.ts";
import { simplifiedConverter } from "./simplified.ts";
import {
  convertTerms,
  lastScriptForm,
  mergeSources,
  readEdition,
  readTranslationTables,
  termKeyOf,
  type SourceTerm,
  type TermKey,
} from "./recipe.ts";
import { RECIPES, TABLES_TAG, type Recipe } from "./recipes.ts";

/** The English wordnet, which links the pack's terms to the other wordnets' synsets. */
const ENGLISH_WORDNET = "omw-en";

const wordnetPath = (rawDir: string, id: string) =>
  join(rawDir, "omw", "omw-1.4", id, `${id}.xml`);

/** Reads the sources of `native`'s recipe (or of `recipe`) and merges them. */
export async function buildPairDictionary(
  native: string,
  {
    termKey,
    rawDir = RAW_DIR,
    englishPath = KAIKKI_PATH,
    recipe = Object.hasOwn(RECIPES, native)
      ? RECIPES[native as RecipeNative]
      : undefined,
  }: {
    termKey: TermKey;
    rawDir?: string;
    englishPath?: string;
    recipe?: Recipe;
  },
) {
  if (!recipe) throw new Error(`No recipe for en-${native}`);
  const { edition, tables, wordnets = [], simplified } = recipe;
  const [editionTerms, tableTerms] = await Promise.all([
    edition
      ? readEdition(join(rawDir, edition.file), termKey, {
          trimPeriod: true,
          native,
        })
      : undefined,
    readTranslationTables(englishPath, {
      ...tables,
      termKey,
      ...(simplified && { word: lastScriptForm }),
    }),
  ]);
  const sources: { tag: string; terms: Map<string, SourceTerm> }[] = [];
  const editionSource = edition &&
    editionTerms && { tag: edition.tag, terms: editionTerms.terms };
  if (editionSource && !edition.afterTables) sources.push(editionSource);
  sources.push({ tag: TABLES_TAG, terms: tableTerms.terms });
  if (editionSource && edition.afterTables) sources.push(editionSource);
  if (wordnets.length > 0) {
    const english = readWordnet(wordnetPath(rawDir, ENGLISH_WORDNET));
    for (const id of wordnets)
      sources.push({
        tag: id,
        terms: readWordnetMeanings({
          english,
          native: readWordnet(wordnetPath(rawDir, id)),
          termKey,
        }),
      });
  }
  if (simplified) {
    const toSimplified = simplifiedConverter();
    for (const { terms } of sources) convertTerms(terms, toSimplified);
  }
  const merged = mergeSources(sources);
  return {
    ...merged,
    stats: {
      unparsable:
        (editionTerms?.stats.unparsable ?? 0) + tableTerms.stats.unparsable,
      terms: Object.keys(merged.dict).length,
      pointers: editionTerms?.stats.pointers ?? 0,
      templates: editionTerms?.stats.templates ?? 0,
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
    const index = writeShards(`en-${native}`, dict, PACKS_DIR, {
      sources,
    });
    console.log(
      `en-${native}: ${stats.terms} terms (` +
        Object.entries(counts)
          .map(([tag, n]) => `${n} ${tag}`)
          .join(", ") +
        `) in ${index.shards.length} shards; ${stats.pointers} pointer senses read in ${stats.templates} templates; ${stats.unparsable} unparsable lines`,
    );
    if (stats.unparsable > 0) process.exitCode = 1;
  }
}

if (import.meta.main) await main();
