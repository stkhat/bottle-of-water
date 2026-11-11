// Prints the numbers recorded in docs/notes/data-sizes.md and each language pair's
// coverage for the quality gate; fails when a pair the lock offers is under the gate.
// Usage: node scripts/data/stats.ts [--json]   (after npm run data:build, data:es and data:native)
//   --json: only the gate report, as JSON
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { PackLock } from "../../src/core/packs/lock.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import {
  DOWNLOAD_PACKS_DIR,
  PACKS_DIR,
  readDictPacks,
  readPack,
  ROOT,
} from "./common.ts";
import { PACKS } from "./formats.ts";
import { GATE, gateReport, type PairReport } from "./gate.ts";
import { LOCK_PATH } from "./publish.ts";

/** Every file under `root` (public/packs/ or data/packs/), as paths relative to it, sorted. */
function packFiles(root: string, dir = root): string[] {
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
export function ipaCoverage(
  freq: readonly string[],
  ipa: Readonly<Record<string, string>>,
  top: number,
) {
  const words = freq.slice(0, top);
  const withIpa = words.filter((word) => Object.hasOwn(ipa, word)).length;
  return { words: words.length, withIpa, ratio: withIpa / words.length };
}

/** How many patterns are detected, kept for selections only (more) and have a gap. */
export function patternCounts({ detect, more, gap }: PhrasePatterns) {
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
export function phraseMeanings(
  { detect, more }: PhrasePatterns,
  dict: object,
  ja: object,
  defs: object,
) {
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

function describePatterns(patterns: PhrasePatterns) {
  const { patterns: all, detect, more, gap } = patternCounts(patterns);
  return `${all} (${detect} detected, ${more} more; ${gap} with a gap)`;
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** One line per pair: coverage of the top content words and phrases, by source. */
export function describeGate(report: readonly PairReport[]) {
  return report.flatMap(({ pair, tops, phrases, passes }) => [
    `${pair}: ${passes ? "passes" : "under"} the gate (needs ${percent(GATE.share)} of the top ${GATE.top} content words)`,
    ...[...Object.entries(tops), ["phrases", phrases] as const].map(
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
export function failingOffered(
  report: readonly Pick<PairReport, "pair" | "passes">[],
  offered: PackLock["pairs"] | undefined,
) {
  return report
    .filter(({ pair, passes }) => {
      const [learning = "", native = ""] = pair.split("-");
      return !passes && (offered?.[learning] ?? []).includes(native);
    })
    .map(({ pair }) => pair);
}

function checkGate(report: readonly PairReport[]) {
  const { pairs } = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as PackLock;
  const failing = failingOffered(report, pairs);
  for (const pair of failing)
    console.error(`${pair} is offered but under the quality gate`);
  if (failing.length > 0) process.exitCode = 1;
}

type Words = readonly string[];
type Table = Readonly<Record<string, unknown>>;

function main() {
  const report = gateReport();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    checkGate(report);
    return;
  }
  const en = <T>(file: string) => readPack<T>(file, PACKS.en.dir);
  const es = <T>(file: string) => readPack<T>(file, PACKS.es.dir);
  const dict = readDictPacks(PACKS["en-ja"].dir);
  const freq = en<Words>("freq.json");
  const ipa = en<Record<string, string>>("ipa.json");
  const { words, withIpa, ratio } = ipaCoverage(freq, ipa, 20000);
  console.log(
    `Vocabulary (single-word headwords): ${en<Words>("vocab.json").length}`,
  );
  console.log(`Dictionary headwords: ${Object.keys(dict).length}`);
  console.log(
    `Lemma entries (inflected forms): ${Object.keys(en<Table>("lemmas.json")).length}`,
  );
  console.log(`Words with IPA: ${Object.keys(ipa).length}`);
  console.log(
    `Words with parts of speech: ${Object.keys(en<Table>("pos.json")).length}`,
  );
  console.log(`Frequency list: ${freq.length} base forms`);
  console.log(
    `IPA coverage, top ${words} base forms: ${withIpa} (${(ratio * 100).toFixed(1)}%)`,
  );
  const patterns = en<PhrasePatterns>("phrases.json");
  const phrases = phraseMeanings(
    patterns,
    dict,
    readPack<Table>("phrases.json", PACKS["en-ja"].dir),
    readDictPacks(PACKS["en-defs"].dir),
  );
  console.log(`Phrase patterns: ${describePatterns(patterns)}`);
  console.log(
    `Phrase meanings (all ${phrases.phrases} patterns): ${phrases.ejdict} EJDict, ` +
      `${phrases.ja} Japanese translations, ${phrases.defs} English definitions, ${phrases.none} none`,
  );
  const esFreq = es<Words>("freq.json");
  const esIpa = es<Record<string, string>>("ipa.json");
  const esCoverage = ipaCoverage(esFreq, esIpa, 20000);
  console.log("Spanish (es, es-en):");
  console.log(`  Vocabulary: ${es<Words>("vocab.json").length}`);
  console.log(
    `  Lemma entries (inflected forms): ${Object.keys(es<Table>("lemmas.json")).length}`,
  );
  console.log(`  Words with IPA: ${Object.keys(esIpa).length}`);
  console.log(`  Frequency list: ${esFreq.length} base forms`);
  console.log(
    `  IPA coverage, top ${esCoverage.words} base forms: ${esCoverage.withIpa} (${(esCoverage.ratio * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Dictionary terms: ${Object.keys(readDictPacks(PACKS["es-en"].dir)).length}`,
  );
  console.log(
    `  Phrase patterns: ${describePatterns(es<PhrasePatterns>("phrases.json"))}`,
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

if (import.meta.main) main();
