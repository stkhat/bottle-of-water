// Prints the numbers recorded in docs/status.md ("Data").
// Usage: node scripts/data/stats.mjs   (after npm run data:build and npm run data:es)
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

/** How many patterns are detected, kept for selections only (more) and have a gap. */
export function patternCounts({ detect, more, gap }) {
  return {
    patterns: detect.length + more.length,
    detect: detect.length,
    more: more.length,
    gap: gap.length,
  };
}

/**
 * How many phrase patterns (detected and the others) have a meaning from EJDict, the
 * Japanese translations, the English definitions, or none.
 */
export function phraseMeanings({ detect, more }, dict, ja, defs) {
  const phrases = [...detect, ...more];
  const counts = {
    phrases: phrases.length,
    ejdict: 0,
    ja: 0,
    defs: 0,
    none: 0,
  };
  for (const phrase of phrases) {
    if (Object.hasOwn(dict, phrase)) counts.ejdict++;
    else if (Object.hasOwn(ja, phrase)) counts.ja++;
    else if (Object.hasOwn(defs, phrase)) counts.defs++;
    else counts.none++;
  }
  return counts;
}

function describePatterns(patterns) {
  const { patterns: all, detect, more, gap } = patternCounts(patterns);
  return `${all} (${detect} detected, ${more} more; ${gap} with a gap)`;
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
  const patterns = readPack("en/phrases.json");
  const phrases = phraseMeanings(
    patterns,
    dict,
    readPack("en-ja/phrases.json"),
    readDictPacks("en-defs"),
  );
  console.log(`Phrase patterns: ${describePatterns(patterns)}`);
  console.log(
    `Phrase meanings (all ${phrases.phrases} patterns): ${phrases.ejdict} EJDict, ` +
      `${phrases.ja} Japanese translations, ${phrases.defs} English definitions, ${phrases.none} none`,
  );
  const esFreq = readPack("es/freq.json");
  const esIpa = readPack("es/ipa.json");
  const esCoverage = ipaCoverage(esFreq, esIpa, 20000);
  console.log("Spanish (es, es-en):");
  console.log(`  Vocabulary: ${readPack("es/vocab.json").length}`);
  console.log(
    `  Lemma entries (inflected forms): ${Object.keys(readPack("es/lemmas.json")).length}`,
  );
  console.log(`  Words with IPA: ${Object.keys(esIpa).length}`);
  console.log(`  Frequency list: ${esFreq.length} base forms`);
  console.log(
    `  IPA coverage, top ${esCoverage.words} base forms: ${esCoverage.withIpa} (${(esCoverage.ratio * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Dictionary terms: ${Object.keys(readDictPacks("es-en")).length}`,
  );
  console.log(
    `  Phrase patterns: ${describePatterns(readPack("es/phrases.json"))}`,
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
