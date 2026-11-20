// hermitdave/FrequencyWords 2018 Spanish list (`frequency-words.ts`, OpenSubtitles
// counts, as French's): the Spanish word forms in rank order, used by es-kaikki.ts.
// Usage: node scripts/data/es-frequency.ts   (caches the list in data/raw/freq-es/)
import { readFrequencyWords } from "./frequency-words.ts";

/**
 * How many frequency-list entries (ranks) the Spanish pack is built from: the forms
 * said at least 4 times in the list's 423 million words. A list of subtitles holds
 * fewer of written Spanish's words than a list of written text does: its first 150,000
 * entries (French reads as many, said 13 times or more in 318 million words) reached
 * 31,854 vocabulary words where Wiktionary's "Mixed 730K" reached 36,663, and an
 * article's words went unknown (abiótico, acentuación). 400,000 reach 45,398 (2026-11-21).
 */
export const ES_FORMS = 400000;
const WORD = /^\p{L}+$/u;

/** Single-word entries, lowercased, in rank order; a form keeps its best rank. */
export function frequencyForms(entries: readonly string[]) {
  const forms = new Set<string>();
  for (const entry of entries) {
    const form = entry.toLowerCase();
    if (WORD.test(form)) forms.add(form);
  }
  return [...forms];
}

/** The first `ranks` entries of the list, downloading it once. */
export const readEsFrequency = (ranks = ES_FORMS) =>
  readFrequencyWords("es", ranks);

async function main() {
  const entries = await readEsFrequency();
  console.log(
    `Spanish frequency list: ${entries.length} entries → ${frequencyForms(entries).length} single-word forms`,
  );
}

if (import.meta.main) await main();
