// Wiktionary "Frequency lists/Spanish/Mixed 730K" (Leipzig corpora, CC BY-SA): the
// Spanish word forms in rank order, used by es-kaikki.mjs.
// Usage: node scripts/data/es-frequency.mjs   (caches the wikitext in data/raw/freq-es/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fetchText, isMain, RAW_DIR } from "./common.mjs";

const API = "https://en.wiktionary.org/w/api.php";
const MAIN_PAGE = "Wiktionary:Frequency_lists/Spanish/Mixed_730K";
const MAIN_PAGE_RANKS = 10000;
const SUBPAGE_RANKS = 10000;
const CACHE_DIR = join(RAW_DIR, "freq-es");
/** How many frequency-list entries (ranks) the Spanish pack is built from. */
export const ES_FORMS = 150000;
const LINK_LINE = /^\s*\[\[([^\]]+)\]\]\s*$/;
const WORD = /^\p{L}+$/u;

/** The list entries in rank order, as written ("El", "El lugar"): one `[[target|label]]` per line. */
export function parseEsFrequencyWikitext(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const link = LINK_LINE.exec(line);
    if (!link) continue;
    const [target, label] = link[1].split("|");
    const entry = (label ?? target.split("#")[0]).trim();
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Single-word entries, lowercased, in rank order; a form keeps its best rank. */
export function frequencyForms(entries) {
  const forms = new Set();
  for (const entry of entries) {
    const form = entry.toLowerCase();
    if (WORD.test(form)) forms.add(form);
  }
  return [...forms];
}

/** The pages holding the first `ranks` entries: the main page (1–10,000), then subpages of 10,000. */
export function frequencyPageTitles(ranks) {
  const titles = [MAIN_PAGE];
  for (let first = MAIN_PAGE_RANKS + 1; first <= ranks; first += SUBPAGE_RANKS)
    titles.push(`${MAIN_PAGE}/${first}-${first + SUBPAGE_RANKS - 1}`);
  return titles;
}

async function readPage(title) {
  const name = title.includes("/", MAIN_PAGE.length)
    ? title.slice(MAIN_PAGE.length + 1)
    : `1-${MAIN_PAGE_RANKS}`;
  const path = join(CACHE_DIR, `${name}.wikitext`);
  if (!existsSync(path)) {
    console.log(`Fetching ${title}`);
    await sleep(1000); // be polite to the Wiktionary API
    const params = new URLSearchParams({
      action: "parse",
      page: title,
      prop: "wikitext",
      format: "json",
      formatversion: "2",
    });
    const data = JSON.parse(await fetchText(`${API}?${params}`));
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(path, data.parse.wikitext);
  }
  return readFileSync(path, "utf8");
}

/** The first `ranks` entries of the list, fetching the pages not cached yet. */
export async function readEsFrequency(ranks = ES_FORMS) {
  const entries = [];
  for (const title of frequencyPageTitles(ranks))
    entries.push(...parseEsFrequencyWikitext(await readPage(title)));
  return entries.slice(0, ranks);
}

async function main() {
  const entries = await readEsFrequency();
  console.log(
    `Spanish frequency list: ${entries.length} entries → ${frequencyForms(entries).length} single-word forms`,
  );
}

if (isMain(import.meta.url)) await main();
