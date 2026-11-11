// Prints the numbers recorded in docs/status.md ("Data") and each language pair's
// coverage for the quality gate; fails when a pair the lock offers is under the gate.
// Usage: node scripts/data/stats.mjs [--json]   (after npm run data:build, data:es and data:native)
//   --json: only the gate report, as JSON
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  DOWNLOAD_PACKS_DIR,
  isMain,
  PACKS_DIR,
  readPack,
  ROOT,
} from "./common.mjs";
import { readDictPacks } from "./ejdict.mjs";
import { GATE, gateReport } from "./gate.mjs";
import { LOCK_PATH } from "./publish.mjs";

/** Every file under `root` (public/packs/ or data/packs/), as paths relative to it, sorted. */
function packFiles(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory()
        ? packFiles(root, path)
        : [relative(root, path)];
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

const percent = (share) => `${(share * 100).toFixed(1)}%`;

/** One line per pair: coverage of the top content words and phrases, by source. */
export function describeGate(report) {
  return report.flatMap(({ pair, tops, phrases, passes }) => [
    `${pair}: ${passes ? "passes" : "under"} the gate (needs ${percent(GATE.share)} of the top ${GATE.top} content words)`,
    ...[...Object.entries(tops), ["phrases", phrases]].map(
      ([top, c]) =>
        `  ${top === "phrases" ? "phrases" : `top ${top}`}: ${c.covered}/${c.terms} (${percent(c.share)})` +
        (Object.keys(c.bySource).length > 0
          ? `; ${Object.entries(c.bySource)
              .map(([source, n]) => `${source} ${n}`)
              .join(", ")}`
          : ""),
    ),
  ]);
}

/** The pairs `offered` (the lock's `pairs`) that the report puts under the gate. */
export function failingOffered(report, offered) {
  return report
    .filter(({ pair, passes }) => {
      const [learning, native] = pair.split("-");
      return !passes && (offered?.[learning] ?? []).includes(native);
    })
    .map(({ pair }) => pair);
}

function checkGate(report) {
  const { pairs } = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
  const failing = failingOffered(report, pairs);
  for (const pair of failing)
    console.error(`${pair} is offered but under the quality gate`);
  if (failing.length > 0) process.exitCode = 1;
}

function main() {
  const report = gateReport();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    checkGate(report);
    return;
  }
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
  const esFreq = readPack("es/freq.json", DOWNLOAD_PACKS_DIR);
  const esIpa = readPack("es/ipa.json", DOWNLOAD_PACKS_DIR);
  const esCoverage = ipaCoverage(esFreq, esIpa, 20000);
  console.log("Spanish (es, es-en):");
  console.log(
    `  Vocabulary: ${readPack("es/vocab.json", DOWNLOAD_PACKS_DIR).length}`,
  );
  console.log(
    `  Lemma entries (inflected forms): ${Object.keys(readPack("es/lemmas.json", DOWNLOAD_PACKS_DIR)).length}`,
  );
  console.log(`  Words with IPA: ${Object.keys(esIpa).length}`);
  console.log(`  Frequency list: ${esFreq.length} base forms`);
  console.log(
    `  IPA coverage, top ${esCoverage.words} base forms: ${esCoverage.withIpa} (${(esCoverage.ratio * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Dictionary terms: ${Object.keys(readDictPacks("es-en", DOWNLOAD_PACKS_DIR)).length}`,
  );
  console.log(
    `  Phrase patterns: ${describePatterns(readPack("es/phrases.json", DOWNLOAD_PACKS_DIR))}`,
  );
  let total = 0;
  for (const root of [PACKS_DIR, DOWNLOAD_PACKS_DIR]) {
    let subtotal = 0;
    for (const file of packFiles(root)) {
      const size = statSync(join(root, file)).size;
      subtotal += size;
      console.log(`${file}: ${(size / 1e6).toFixed(2)} MB`);
    }
    console.log(`${relative(ROOT, root)}: ${(subtotal / 1e6).toFixed(2)} MB`);
    total += subtotal;
  }
  console.log(`Total: ${(total / 1e6).toFixed(2)} MB`);
  console.log("Quality gate:");
  for (const line of describeGate(report)) console.log(`  ${line}`);
  checkGate(report);
}

if (isMain(import.meta.url)) main();
