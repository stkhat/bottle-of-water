// English definitions of English words and phrases from the kaikki.org English
// Wiktionary extract (CC BY-SA) → public/packs/en-defs/{index,dict-<n>}.json: the
// fallback of every English dictionary (shown in English, or translated at display
// time by the browser's translator).
// Usage: node scripts/data/en-defs.ts [path]   (default data/raw/kaikki-en.jsonl; run ejdict.ts, kaikki.ts and phrases.ts first)
import type { DefsPack, LemmaPack } from "../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import { KAIKKI_PATH, PACKS_DIR, readPack, writeShards } from "./common.ts";
import { readEdition, termKeyOf } from "./recipes/recipe.ts";

/**
 * The English definitions of the vocabulary words and of every phrase pattern
 * (detected or not): up to four distinct usable senses each, as [pos, text], with the
 * first one's text up to its first `;` as the short meaning.
 */
export async function buildEnDefs(
  path: string,
  {
    vocab,
    lemmas,
    phrases,
  }: { vocab: string[]; lemmas: LemmaPack; phrases: PhrasePatterns },
) {
  const termKey = termKeyOf({
    vocab: new Set(vocab),
    lemmas,
    phrases: new Set([...phrases.detect, ...phrases.more]),
  });
  const { terms, stats } = await readEdition(path, termKey);
  const defs: Record<string, DefsPack[string]> = {};
  for (const [key, { short, senses }] of terms)
    defs[key] = [short, senses as [string, string][]];
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

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { defs, stats } = await buildEnDefs(path, {
    vocab: readPack("en/vocab.json"),
    lemmas: readPack("en/lemmas.json"),
    phrases: readPack("en/phrases.json"),
  });
  const index = writeShards("en-defs", defs, PACKS_DIR);
  console.log(
    `en-defs: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.words} words and ${stats.phrases} phrases in ${index.shards.length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
