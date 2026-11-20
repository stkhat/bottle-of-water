// Spanish's two frequency lists (`frequency-lists.ts`), used by es-kaikki.ts: what
// people say, hermitdave/FrequencyWords 2018 Spanish (`frequency-words.ts`,
// OpenSubtitles counts, as French's), and what people write, Wiktionary's "Frequency
// lists/Spanish/Mixed 730K" (Leipzig corpora: Wikipedia and news, CC BY-SA). A form
// ranks by the better of its two ranks.
// Usage: node scripts/data/es-frequency.ts   (caches both lists in data/raw/freq-es/)
import { join } from "node:path";
import { RAW_DIR, wikitext } from "./common.ts";
import type { FrequencyLists } from "./frequency-lists.ts";
import { readFrequencyWords } from "./frequency-words.ts";

/**
 * How many subtitle-list entries (ranks) the Spanish pack is built from: the forms
 * said at least 4 times in the list's 423 million words. A list of subtitles holds
 * fewer of written Spanish's words than a list of written text does: its first 150,000
 * entries (French reads as many, said 13 times or more in 318 million words) reached
 * 31,854 vocabulary words where Wiktionary's "Mixed 730K" reached 36,663, and an
 * article's words went unknown (abiótico, acentuación). 400,000 reach 45,398 (2026-11-21).
 */
export const ES_FORMS = 400000;
/** How many entries of the written-text list are read: as many as before 2026-11-21. */
export const ES_TEXT_FORMS = 150000;
const TEXT_PAGE = "Wiktionary:Frequency_lists/Spanish/Mixed_730K";
const TEXT_PAGE_RANKS = 10000;
const TEXT_SUBPAGE_RANKS = 10000;
const CACHE_DIR = join(RAW_DIR, "freq-es");
const LINK_LINE = /^\s*\[\[([^\]]+)\]\]\s*$/;
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

/** The first `ranks` entries of the subtitle list, downloading it once. */
export const readEsFrequency = (ranks = ES_FORMS) =>
  readFrequencyWords("es", ranks);

/** The written list's entries in rank order, as written ("El", "El lugar"): one `[[target|label]]` per line. */
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

/** The written list's pages holding the first `ranks` entries: the main page (1–10,000), then subpages of 10,000. */
export function frequencyPageTitles(ranks: number) {
  const titles = [TEXT_PAGE];
  for (
    let first = TEXT_PAGE_RANKS + 1;
    first <= ranks;
    first += TEXT_SUBPAGE_RANKS
  )
    titles.push(`${TEXT_PAGE}/${first}-${first + TEXT_SUBPAGE_RANKS - 1}`);
  return titles;
}

/** The first `ranks` entries of the written list, fetching the pages not cached yet. */
export async function readEsTextFrequency(ranks = ES_TEXT_FORMS) {
  const entries: string[] = [];
  for (const title of frequencyPageTitles(ranks)) {
    const name = title.includes("/", TEXT_PAGE.length)
      ? title.slice(TEXT_PAGE.length + 1)
      : `1-${TEXT_PAGE_RANKS}`;
    const text = await wikitext(title, join(CACHE_DIR, `${name}.wikitext`));
    entries.push(...parseEsFrequencyWikitext(text));
  }
  return entries.slice(0, ranks);
}

/** Spanish's lists as single-word forms: the subtitle list and the written one. */
export const esFrequencyLists = async (): Promise<FrequencyLists> => ({
  spoken: frequencyForms(await readEsFrequency()),
  text: frequencyForms(await readEsTextFrequency()),
});

async function main() {
  const { spoken, text = [] } = await esFrequencyLists();
  console.log(
    `Spanish frequency lists: ${spoken.length} single-word forms said, ${text.length} written`,
  );
}

if (import.meta.main) await main();
