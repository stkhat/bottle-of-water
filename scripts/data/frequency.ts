// Wiktionary "Frequency lists/TV/2006" (CC BY-SA) → public/packs/en/freq.json
// Usage: node scripts/data/frequency.ts   (caches the wikitext in data/raw/freq-en/; run kaikki.ts first)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LemmaPack } from "../../src/core/packs/types.ts";
import {
  RAW_DIR,
  readPack,
  wikitext,
  wiktionaryApi,
  writePack,
} from "./common.ts";

const PREFIX = "Frequency_lists/TV/2006";
const CACHE_DIR = join(RAW_DIR, "freq-en");
const TOP = 30000;

export interface FrequencyRow {
  rank: number;
  words: string[];
}

/** The numbered list pages, e.g. "Wiktionary:Frequency lists/TV/2006/1-1000". */
export const isListPage = (title: string) => /\/\d+-\d+$/.test(title);

/** Reads `{ rank, words }` from the table rows; words are lowercase and unique per row. */
export function parseFrequencyWikitext(text: string) {
  const rows: FrequencyRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.startsWith("|-") || line.startsWith("|}"))
      continue;
    const cells = line.slice(1).split("||");
    if (cells.length < 2) continue;
    const rank = /^\s*(\d+)\s*$/.exec(cells[0]!);
    if (!rank) continue; // header, or a struck-out <s>row</s>
    const words = new Set<string>();
    for (const [, inner = "", suffix] of cells[1]!.matchAll(
      /\[\[([^\]]+)\]\]([^\s[\]|]*)/g,
    )) {
      const [target = "", label] = inner.split("|");
      const word = `${label ?? target.split("#")[0]}${suffix}`
        .trim()
        .toLowerCase();
      if (word) words.add(word);
    }
    if (words.size > 0) rows.push({ rank: Number(rank[1]), words: [...words] });
  }
  return rows;
}

function basesOf(
  word: string,
  lemmas: LemmaPack,
  vocab: ReadonlySet<string>,
): readonly string[] {
  const w = word.replaceAll("’", "'");
  const fromLemmas = Object.hasOwn(lemmas, w) ? [lemmas[w]!].flat() : [];
  if (vocab.has(w)) return [w, ...fromLemmas];
  if (fromLemmas.length > 0) return fromLemmas;
  if (w.endsWith("'s")) return basesOf(w.slice(0, -2), lemmas, vocab);
  return [];
}

/**
 * Base forms in rank order (index 0 = rank 1). A form's rank counts for its base forms;
 * a base keeps its best rank. Words outside the vocabulary are left out.
 */
export function buildFrequency(
  rows: readonly FrequencyRow[],
  lemmas: LemmaPack,
  vocab: Iterable<string>,
  limit = TOP,
) {
  const words = new Set(vocab);
  const seen = new Set<string>();
  const freq: string[] = [];
  for (const row of [...rows].sort((a, b) => a.rank - b.rank)) {
    for (const word of row.words) {
      for (const base of basesOf(word, lemmas, words)) {
        if (seen.has(base)) continue;
        seen.add(base);
        freq.push(base);
        if (freq.length === limit) return freq;
      }
    }
  }
  return freq;
}

async function listPages(): Promise<string[]> {
  const path = join(CACHE_DIR, "pages.json");
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  do {
    const data = await wiktionaryApi<{
      query: { allpages: { title: string }[] };
      continue?: Record<string, string>;
    }>({
      action: "query",
      list: "allpages",
      apprefix: PREFIX,
      apnamespace: "4",
      aplimit: "500",
      ...cont,
    });
    titles.push(...data.query.allpages.map((page) => page.title));
    cont = data.continue ?? {};
  } while (cont.apcontinue);
  const pages = titles.filter(isListPage);
  writeFileSync(path, `${JSON.stringify(pages, null, 2)}\n`);
  return pages;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const rows: FrequencyRow[] = [];
  for (const title of await listPages()) {
    const path = join(CACHE_DIR, `${title.split("/").pop()}.wikitext`);
    rows.push(...parseFrequencyWikitext(await wikitext(title, path)));
  }
  const freq = buildFrequency(
    rows,
    readPack("en/lemmas.json"),
    readPack<string[]>("en/vocab.json"),
  );
  writePack("en/freq.json", freq);
  console.log(
    `freq.json: ${rows.length} ranked rows → ${freq.length} base forms`,
  );
}

if (import.meta.main) await main();
