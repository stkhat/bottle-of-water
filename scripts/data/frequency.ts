// Wiktionary "Frequency lists/TV/2006" (CC BY-SA) → public/packs/en/freq.json, with the
// words rule E adds that the list lacks placed by the example corpus (`rankByExamples`)
// Usage: node scripts/data/frequency.ts   (caches the wikitext in data/raw/freq-en/; run kaikki.ts first)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { LemmaPack } from "../../src/core/packs/types.ts";
import {
  byCodeUnit,
  EXAMPLE_COUNTS_PATH,
  GATE_DIR,
  RAW_DIR,
  readPack,
  WIKTIONARY_WORDS_PATH,
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

/** Ranks per block when the list's typical example count is read (`rankByExamples`). */
const BLOCK = 1000;

/**
 * The frequency list with the `words` it lacks placed by how often the example corpus
 * writes them (`counts`, with their inflected forms; the list's words' counts are read
 * too): a word goes where the list's words are written about as often. The list is
 * read in blocks of `block` ranks (the last one takes the rest), each with its median
 * count, never more than an earlier block's; a word ranks between the midpoints of the
 * last block written more often than it and the first written as often or less,
 * interpolated on the log of the counts, or at the start when it is written more often
 * than the first block. A word written less often than the last block, or never,
 * stays unranked. Ties: the list's own word first, then the more frequent, then
 * code-unit order.
 */
export function rankByExamples(
  freq: readonly string[],
  words: Iterable<string>,
  counts: Readonly<Record<string, number>>,
  block = BLOCK,
): string[] {
  const countOf = (word: string) =>
    Object.hasOwn(counts, word) ? counts[word]! : 0;
  const medians: { at: number; count: number }[] = [];
  // The last block takes the rest when less than a block would be left after it.
  for (let start = 0; start < freq.length;) {
    const end = freq.length - start < 2 * block ? freq.length : start + block;
    const found = freq
      .slice(start, end)
      .map(countOf)
      .sort((a, b) => a - b);
    const median = Math.max(1, found[Math.floor(found.length / 2)]!);
    medians.push({
      at: start + found.length / 2,
      count: Math.min(median, medians.at(-1)?.count ?? Infinity),
    });
    start = end;
  }
  const rankOf = (count: number) => {
    const next = medians.findIndex((m) => m.count <= count);
    if (next <= 0) return next;
    const before = medians[next - 1]!;
    const after = medians[next]!;
    const share =
      (Math.log(before.count) - Math.log(count)) /
      (Math.log(before.count) - Math.log(after.count));
    return before.at + (after.at - before.at) * share;
  };
  const listed = new Set(freq);
  const placed = [...new Set(words)].flatMap((word) => {
    const count = countOf(word);
    const at = listed.has(word) || count <= 0 ? -1 : rankOf(count);
    return at < 0 ? [] : [{ word, at, count, own: false }];
  });
  return [
    ...freq.map((word, i) => ({ word, at: i, count: 0, own: true })),
    ...placed,
  ]
    .sort(
      (a, b) =>
        a.at - b.at ||
        Number(b.own) - Number(a.own) ||
        b.count - a.count ||
        byCodeUnit(a.word, b.word),
    )
    .map(({ word }) => word);
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
  const listed = buildFrequency(
    rows,
    readPack("en/lemmas.json"),
    readPack<string[]>("en/vocab.json"),
  );
  // The words rule E adds, which the list may lack, placed by the example corpus.
  const freq = rankByExamples(
    listed,
    readPack<string[]>(basename(WIKTIONARY_WORDS_PATH), GATE_DIR),
    JSON.parse(readFileSync(EXAMPLE_COUNTS_PATH, "utf8")) as Record<
      string,
      number
    >,
  );
  writePack("en/freq.json", freq);
  console.log(
    `freq.json: ${rows.length} ranked rows → ${listed.length} base forms, ` +
      `${freq.length - listed.length} more placed by the example corpus`,
  );
}

if (import.meta.main) await main();
