// Prints the numbers recorded in docs/status.md ("Data").
// Usage: node scripts/data/stats.mjs   (after npm run data:build)
import { statSync } from "node:fs";
import { join } from "node:path";
import { isMain, PACKS_DIR, readPack } from "./common.mjs";
import { vocabularyOf } from "./ejdict.mjs";

const FILES = [
  "en/lemmas.json",
  "en/ipa.json",
  "en/freq.json",
  "en/pos.json",
  "en-ja/dict.json",
];

/** Share of the top `top` base forms of the frequency list that have IPA. */
export function ipaCoverage(freq, ipa, top) {
  const words = freq.slice(0, top);
  const withIpa = words.filter((word) => Object.hasOwn(ipa, word)).length;
  return { words: words.length, withIpa, ratio: withIpa / words.length };
}

function main() {
  const dict = readPack("en-ja/dict.json");
  const freq = readPack("en/freq.json");
  const ipa = readPack("en/ipa.json");
  const { words, withIpa, ratio } = ipaCoverage(freq, ipa, 20000);
  console.log(
    `Vocabulary (single-word headwords): ${vocabularyOf(dict).length}`,
  );
  console.log(`Dictionary headwords: ${Object.keys(dict).length}`);
  console.log(
    `Lemma entries (inflected forms): ${Object.keys(readPack("en/lemmas.json")).length}`,
  );
  console.log(`Words with IPA: ${Object.keys(ipa).length}`);
  console.log(
    `Words with parts of speech: ${Object.keys(readPack("en/pos.json")).length}`,
  );
  console.log(`Frequency list: ${freq.length} base forms`);
  console.log(
    `IPA coverage, top ${words} base forms: ${withIpa} (${(ratio * 100).toFixed(1)}%)`,
  );
  let total = 0;
  for (const file of FILES) {
    const size = statSync(join(PACKS_DIR, file)).size;
    total += size;
    console.log(`${file}: ${(size / 1e6).toFixed(2)} MB`);
  }
  console.log(`Total: ${(total / 1e6).toFixed(2)} MB`);
}

if (isMain(import.meta.url)) main();
