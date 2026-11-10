// Prints the numbers recorded in docs/status.md ("Data").
// Usage: node scripts/data/stats.mjs   (after npm run data:build)
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isMain, PACKS_DIR, readPack } from "./common.mjs";
import { readDictPacks } from "./ejdict.mjs";

/** Every file under public/packs/, as paths relative to it, sorted. */
function packFiles(dir = PACKS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory()
        ? packFiles(path)
        : [relative(PACKS_DIR, path)];
    })
    .sort();
}

/** Share of the top `top` base forms of the frequency list that have IPA. */
export function ipaCoverage(freq, ipa, top) {
  const words = freq.slice(0, top);
  const withIpa = words.filter((word) => Object.hasOwn(ipa, word)).length;
  return { words: words.length, withIpa, ratio: withIpa / words.length };
}

function main() {
  const dict = readDictPacks();
  const freq = readPack("en/freq.json");
  const ipa = readPack("en/ipa.json");
  const { words, withIpa, ratio } = ipaCoverage(freq, ipa, 20000);
  console.log(
    `Vocabulary (single-word headwords): ${readPack("en/vocab.json").length}`,
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
  for (const file of packFiles()) {
    const size = statSync(join(PACKS_DIR, file)).size;
    total += size;
    console.log(`${file}: ${(size / 1e6).toFixed(2)} MB`);
  }
  console.log(`Total: ${(total / 1e6).toFixed(2)} MB`);
}

if (isMain(import.meta.url)) main();
