// Wiktionary "Frequency lists/Spanish/Mixed 730K" (Leipzig corpora, CC BY-SA): the
// Spanish word forms in rank order, used by es-kaikki.ts.
// Usage: node scripts/data/es-frequency.ts   (caches the wikitext in data/raw/freq-es/)
import { join } from "node:path";
import { RAW_DIR, wikitext } from "./common.ts";

const MAIN_PAGE = "Wiktionary:Frequency_lists/Spanish/Mixed_730K";
const MAIN_PAGE_RANKS = 10000;
const SUBPAGE_RANKS = 10000;
const CACHE_DIR = join(RAW_DIR, "freq-es");
/** How many frequency-list entries (ranks) the Spanish pack is built from. */
export const ES_FORMS = 150000;
const LINK_LINE = /^\s*\[\[([^\]]+)\]\]\s*$/;
const WORD = /^\p{L}+$/u;

/** The list entries in rank order, as written ("El", "El lugar"): one `[[target|label]]` per line. */
export function parseEsFrequencyWikitext(text: string) {
  const entries: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const link = LINK_LINE.exec(line);
    if (!link) continue;
    const [target = "", label] = link[1]!.split("|");
    const entry = (label ?? target.split("#")[0]!).trim();
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Single-word entries, lowercased, in rank order; a form keeps its best rank. */
export function frequencyForms(entries: readonly string[]) {
  const forms = new Set<string>();
  for (const entry of entries) {
    const form = entry.toLowerCase();
    if (WORD.test(form)) forms.add(form);
  }
  return [...forms];
}

/** The pages holding the first `ranks` entries: the main page (1–10,000), then subpages of 10,000. */
export function frequencyPageTitles(ranks: number) {
  const titles = [MAIN_PAGE];
  for (let first = MAIN_PAGE_RANKS + 1; first <= ranks; first += SUBPAGE_RANKS)
    titles.push(`${MAIN_PAGE}/${first}-${first + SUBPAGE_RANKS - 1}`);
  return titles;
}

/** The first `ranks` entries of the list, fetching the pages not cached yet. */
export async function readEsFrequency(ranks = ES_FORMS) {
  const entries: string[] = [];
  for (const title of frequencyPageTitles(ranks)) {
    const name = title.includes("/", MAIN_PAGE.length)
      ? title.slice(MAIN_PAGE.length + 1)
      : `1-${MAIN_PAGE_RANKS}`;
    const text = await wikitext(title, join(CACHE_DIR, `${name}.wikitext`));
    entries.push(...parseEsFrequencyWikitext(text));
  }
  return entries.slice(0, ranks);
}

async function main() {
  const entries = await readEsFrequency();
  console.log(
    `Spanish frequency list: ${entries.length} entries → ${frequencyForms(entries).length} single-word forms`,
  );
}

if (import.meta.main) await main();
