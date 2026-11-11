// English definitions of English words and phrases from the kaikki.org English
// Wiktionary extract (CC BY-SA) → public/packs/en-defs/{index,dict-<n>}.json: the
// fallback of every English dictionary (shown in English, or translated at display
// time by the browser's translator).
// Usage: node scripts/data/en-defs.mjs [path]   (default data/raw/kaikki-en.jsonl; run ejdict.mjs, kaikki.mjs and phrases.mjs first)
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isMain, PACKS_DIR, readPack, writePack } from "./common.mjs";
import { shardDict } from "./ejdict.mjs";
import { KAIKKI_PATH } from "./kaikki.mjs";
import { readEdition, termKeyOf } from "./recipes/recipe.mjs";

/**
 * The English definitions of the vocabulary words and of every phrase pattern
 * (detected or not): up to four distinct usable senses each, as [pos, text], with the
 * first one's text up to its first `;` as the short meaning.
 */
export async function buildEnDefs(path, { vocab, lemmas, phrases }) {
  const termKey = termKeyOf({
    vocab: new Set(vocab),
    lemmas,
    phrases: new Set([...phrases.detect, ...phrases.more]),
  });
  const { terms, stats } = await readEdition(path, termKey);
  const defs = {};
  for (const [key, { short, senses }] of terms) defs[key] = [short, senses];
  const phraseCount = Object.keys(defs).filter((key) =>
    key.includes(" "),
  ).length;
  return {
    defs,
    stats: {
      ...stats,
      words: Object.keys(defs).length - phraseCount,
      phrases: phraseCount,
    },
  };
}

/** Writes the definition shards and their index, removing old shards. */
export function writeEnDefs(defs, dir = PACKS_DIR) {
  const packDir = join(dir, "en-defs");
  if (existsSync(packDir))
    for (const name of readdirSync(packDir))
      if (/^(dict-\d+|index)\.json$/.test(name)) rmSync(join(packDir, name));
  const { index, shards } = shardDict(defs);
  for (const shard of shards)
    writePack(`en-defs/${shard.file}`, shard.dict, dir);
  writePack("en-defs/index.json", index, dir);
  return { index };
}

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { defs, stats } = await buildEnDefs(path, {
    vocab: readPack("en/vocab.json"),
    lemmas: readPack("en/lemmas.json"),
    phrases: readPack("en/phrases.json"),
  });
  const { index } = writeEnDefs(defs);
  console.log(
    `en-defs: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.words} words and ${stats.phrases} phrases in ${index.shards.length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main();
