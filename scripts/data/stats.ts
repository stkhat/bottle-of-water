// Prints the numbers recorded in docs/notes/data-sizes.md and each language pair's
// coverage for the quality gate; fails when a pair the lock offers is under the gate.
// Usage: node scripts/data/stats.ts [--json]   (after npm run data:build, data:es, data:fr, data:de and data:native)
//   --json: only the gate report, as JSON
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { PackLock } from "../../src/core/packs/lock.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import { PACKS_DIR, readDictPacks, readPack } from "./common.ts";
import { PACKS } from "./formats.ts";
import { GATE, gateReport, type PairReport } from "./gate.ts";
import { LOCK_PATH } from "./publish.ts";

/** Every file under `root` (data/packs/), as paths relative to it, sorted. */
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
  const dict = readDictPacks(PACKS["en-ja"].dir);
  const freq = en<Words>("freq.json");
  const ipa = en<Record<string, string>>("ipa.json");
  const { words, withIpa, ratio } = ipaCoverage(freq, ipa, 20000);
  console.log(
    `Vocabulary (EJDict's single-word headwords and rule E's words): ${en<Words>("vocab.json").length}`,
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
  for (const [lang, name] of [
    ["es", "Spanish"],
    ["fr", "French"],
    ["de", "German"],
  ] as const) {
    const read = <T>(file: string) => readPack<T>(file, PACKS[lang].dir);
    const freq = read<Words>("freq.json");
    const ipa = read<Record<string, string>>("ipa.json");
    const coverage = ipaCoverage(freq, ipa, 20000);
    console.log(`${name} (${lang}, ${lang}-en):`);
    console.log(`  Vocabulary: ${read<Words>("vocab.json").length}`);
    console.log(
      `  Lemma entries (inflected forms): ${Object.keys(readDictPacks(join(PACKS[lang].dir, "lemmas"))).length}`,
    );
    console.log(`  Words with IPA: ${Object.keys(ipa).length}`);
    console.log(`  Frequency list: ${freq.length} base forms`);
    console.log(
      `  IPA coverage, top ${coverage.words} base forms: ${coverage.withIpa} (${(coverage.ratio * 100).toFixed(1)}%)`,
    );
    console.log(
      `  Dictionary terms: ${Object.keys(readDictPacks(PACKS[`${lang}-en`].dir)).length}`,
    );
    console.log(
      `  Phrase patterns: ${describePatterns(read<PhrasePatterns>("phrases.json"))}`,
    );
  }
  let total = 0;
  for (const file of packFiles(PACKS_DIR)) {
    const size = statSync(join(PACKS_DIR, file)).size;
    total += size;
    console.log(`${file}: ${(size / 1e6).toFixed(2)} MB`);
  }
  console.log(`Total: ${(total / 1e6).toFixed(2)} MB`);
  console.log("Quality gate:");
  for (const line of describeGate(report)) console.log(`  ${line}`);
  checkGate(report);
}

if (import.meta.main) main();
