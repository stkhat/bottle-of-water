// hermitdave/FrequencyWords 2018 French list (`frequency-words.ts`): the French word
// forms in rank order, used by fr-kaikki.ts. The same counts as Wiktionary's "Frequency
// lists/French/OpenSubtitles Top 20K", which has only 20,000 forms.
// Usage: node scripts/data/fr-frequency.ts   (caches the list in data/raw/freq-fr/)
import { readFrequencyWords } from "./frequency-words.ts";

/** How many list entries (ranks) the French pack is built from, as the Spanish one. */
export const FR_FORMS = 150000;
/**
 * A French word as the list and the tokenizer write it, in lower case: letters with
 * inner apostrophes ("aujourd'hui") and an elided word's final one ("l'", "jusqu'"),
 * and hyphenated compounds ("peut-être", "c'est-à-dire"), which the tokenizer reads
 * whole where the pack has them as words.
 */
export const FRENCH_WORD = /^\p{L}+(?:['-]\p{L}+)*'?$/u;

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
export const readFrFrequency = (ranks = FR_FORMS) =>
  readFrequencyWords("fr", ranks);

async function main() {
  const entries = await readFrFrequency();
  console.log(
    `French frequency list: ${entries.length} entries → ${frenchForms(entries).length} single-word forms`,
  );
}

if (import.meta.main) await main();
