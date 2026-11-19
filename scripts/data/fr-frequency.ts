// hermitdave/FrequencyWords 2018 French list (OpenSubtitles 2018 counts, content
// CC BY-SA 4.0): the French word forms in rank order, used by fr-kaikki.ts. The same
// counts as Wiktionary's "Frequency lists/French/OpenSubtitles Top 20K", which has only
// 20,000 forms.
// Usage: node scripts/data/fr-frequency.ts   (caches the list in data/raw/freq-fr/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchText, RAW_DIR } from "./common.ts";

const CACHE_DIR = join(RAW_DIR, "freq-fr");
const LIST_PATH = join(CACHE_DIR, "hermitdave-2018-fr_full.txt");
/** The repository's default branch on 2026-11-19 (last commit 2022-02-07). */
const COMMIT = "525f9b560de45753a5ea01069454e72e9aa541c6";
const LIST_URL = `https://raw.githubusercontent.com/hermitdave/FrequencyWords/${COMMIT}/content/2018/fr/fr_full.txt`;
/** How many list entries (ranks) the French pack is built from, as the Spanish one. */
export const FR_FORMS = 150000;
/**
 * A French word as the list and the tokenizer write it, in lower case: letters with
 * inner apostrophes ("aujourd'hui") and an elided word's final one ("l'", "jusqu'").
 * The list, like the tokenizer, splits at hyphens' places differently ("peut-être" is
 * one entry): hyphenated entries are left out.
 */
export const FRENCH_WORD = /^\p{L}+(?:'\p{L}+)*'?$/u;

/** The list's lines ("de 8435682") as forms in rank order. */
export function parseFrequencyWords(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(" ")[0]!.trim())
    .filter(Boolean);
}

/** Single-word entries, lowercased with ' for ’, in rank order; a form keeps its best rank. */
export function frenchForms(entries: readonly string[]) {
  const forms = new Set<string>();
  for (const entry of entries) {
    const form = entry.toLowerCase().replaceAll("’", "'");
    if (FRENCH_WORD.test(form)) forms.add(form);
  }
  return [...forms];
}

/** The first `ranks` entries of the list, downloading it once. */
export async function readFrFrequency(ranks = FR_FORMS) {
  if (!existsSync(LIST_PATH)) {
    console.log(`Downloading ${LIST_URL}`);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(LIST_PATH, await fetchText(LIST_URL));
  }
  return parseFrequencyWords(readFileSync(LIST_PATH, "utf8")).slice(0, ranks);
}

async function main() {
  const entries = await readFrFrequency();
  console.log(
    `French frequency list: ${entries.length} entries → ${frenchForms(entries).length} single-word forms`,
  );
}

if (import.meta.main) await main();
