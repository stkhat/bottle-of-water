// Wiktionary "Frequency lists/German/TV and movie subtitles (2009)" (Matthias Buchmeier,
// CC BY-SA, GFDL or LGPL; 25 million words of subtitles): the German word forms in rank
// order, as written, used by de-kaikki.ts. The list keeps case, which German needs: it
// ranks the noun "Essen" and the verb "essen" apart, and "Reisen" (Reise's plural) apart
// from "reisen".
// Usage: node scripts/data/de-frequency.ts   (caches the wikitext in data/raw/freq-de/)
import { join } from "node:path";
import { RAW_DIR, wikitext } from "./common.ts";

const CACHE_DIR = join(RAW_DIR, "freq-de");
const PAGE = "User:Matthias Buchmeier/German_frequency_list";
const PAGE_RANKS = 5000;
/** How many list entries (ranks) the German pack is built from, as the Spanish one. */
export const DE_FORMS = 150000;
/**
 * A German word as the tokenizer keeps it, in lower case: letters (ß and umlauts
 * among them), with an apostrophe inside ("geht's", "gibt's").
 */
export const GERMAN_WORD = /^\p{L}+(?:'\p{L}+)*$/u;

/** A list line: its count, then the form as a link ("489637 [[Ich]]"). */
const LINE = /^\s*\d+\s+\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]\s*$/;

/** The list's forms in rank order, as written ("Ich", "ist", "ich"). */
export function parseDeFrequencyWikitext(text: string) {
  const forms: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const form = LINE.exec(line)?.[1]?.trim();
    if (form) forms.push(form);
  }
  return forms;
}

/** Single-word forms as written, with ' for ’, in rank order; each spelling once. */
export function germanWritten(entries: readonly string[]) {
  const forms = new Set<string>();
  for (const entry of entries) {
    const form = entry.replaceAll("’", "'");
    if (GERMAN_WORD.test(form)) forms.add(form);
  }
  return [...forms];
}

/** The written forms in lower case, in rank order; a form keeps its best rank. */
export const germanForms = (written: readonly string[]) => [
  ...new Set(written.map((form) => form.toLowerCase())),
];

/** The first `ranks` entries of the list, fetching the pages not cached yet. */
export async function readDeFrequency(ranks = DE_FORMS) {
  const entries: string[] = [];
  for (let first = 1; first <= ranks; first += PAGE_RANKS) {
    const range = `${first}-${first + PAGE_RANKS - 1}`;
    const text = await wikitext(
      `${PAGE}-${range}`,
      join(CACHE_DIR, `tv2009-${range}.wikitext`),
    );
    entries.push(...parseDeFrequencyWikitext(text));
  }
  return entries.slice(0, ranks);
}

async function main() {
  const entries = await readDeFrequency();
  const written = germanWritten(entries);
  console.log(
    `German frequency list: ${entries.length} entries → ${written.length} single-word spellings, ` +
      `${germanForms(written).length} lower-case forms`,
  );
}

if (import.meta.main) await main();
