// UD German GSD (CC BY-SA 4.0): the treebank's lemmas, which order a German form's
// bases (de-kaikki.ts), and the German tagger's training sentences (de-tagger.ts).
// German HDT is not used: its text may be distributed for academic use only.
// Usage: node scripts/data/de-treebank.ts   (downloads missing raw files into data/raw/ud-german/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchText, RAW_DIR } from "./common.ts";
import { lemmaCounts } from "./es-tagger.ts";

const UD_DIR = join(RAW_DIR, "ud-german");
/** The treebank at the commit its lemmas were read from: its default branch on 2026-11-19. */
export const GSD = {
  commit: "f223fbc336bcbf445ccc3a9c05d5833023cb6148",
  prefix: "de_gsd-ud",
} as const;
const SPLITS = ["train", "dev", "test"] as const;

/** A raw file of the treebank, as downloaded into data/raw/ud-german/. */
export const gsdPath = (file: string) => join(UD_DIR, `GSD-${file}`);

/** Downloads the treebank's missing raw files. */
export async function downloadGsd() {
  mkdirSync(UD_DIR, { recursive: true });
  const files = [
    "LICENSE.txt",
    "README.md",
    ...SPLITS.map((split) => `${GSD.prefix}-${split}.conllu`),
  ];
  for (const file of files) {
    if (existsSync(gsdPath(file))) continue;
    console.log(`Downloading UD_German-GSD ${file}`);
    const url = `https://raw.githubusercontent.com/UniversalDependencies/UD_German-GSD/${GSD.commit}/${file}`;
    writeFileSync(gsdPath(file), await fetchText(url));
  }
}

/** The training sentences' lemma counts (`lemmaCounts`). */
export async function germanTreebankLemmas() {
  await downloadGsd();
  return lemmaCounts([
    readFileSync(gsdPath(`${GSD.prefix}-train.conllu`), "utf8"),
  ]);
}

async function main() {
  const { byForm, byLemma } = await germanTreebankLemmas();
  console.log(
    `UD German GSD (train): ${byLemma.size} lemmas, ${byForm.size} form-lemma pairs`,
  );
}

if (import.meta.main) await main();
