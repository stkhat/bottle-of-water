import type { Span, TermKind, WordStatus } from "../../core/classify";
import { collapseSpaces } from "../../core/text/sentences";
import type { TermBrief } from "../../messaging/protocol";
import { visibleSpans } from "../../ui/video/terms";

/** A Words list's filter chips: every row, or one status. */
export type WordsFilter = "all" | WordStatus;

/** A Words list's sort: first appearance, A–Z by head, or most occurrences first. */
export type WordsSort = "order" | "az" | "count";

/** A piece of text a list reads its terms from: a transcript card, an article's block. */
export interface WordsUnit<U> {
  unit: U;
  text: string;
  /** Its classified spans; null while not classified. */
  spans: readonly Span[] | null;
}

/** Where a term shows: its unit and its offsets there (a phrase with a gap as a whole). */
export interface Occurrence<U> {
  unit: U;
  start: number;
  end: number;
}

/** A word or phrase of a page, as a Words list shows it. */
export interface ListWord<U> {
  key: string;
  kind: TermKind;
  /** A word's key; a phrase as written where it first appears. */
  head: string;
  category: WordStatus;
  /** Every place it shows, in reading order (as many as it occurs). */
  places: Occurrence<U>[];
}

/** A list row's id: unique per term (a phrase may share a word's key). */
export const wordId = (word: { kind: TermKind; key: string }) =>
  `${word.kind}\n${word.key}`;

/**
 * The words and phrases of the classified units, grouped by key and kind, in order of
 * first appearance, each with its places in reading order. Leaves out what the text
 * does not highlight (`visibleSpans`) and words known only by the frequency level: a
 * known span counts only once its summary says it is saved as known. A phrase with a
 * gap counts once, by its first part.
 */
export function listWords<U>(
  units: Iterable<WordsUnit<U>>,
  summaries: Readonly<Record<string, TermBrief>>,
): ListWord<U>[] {
  const rows = new Map<string, ListWord<U>>();
  for (const { unit, text, spans } of units) {
    if (!spans) continue;
    for (const [span] of visibleSpans(spans)) {
      const { key, kind, category } = span;
      if (category === "ignored" || (span.part && span.part.index > 0))
        continue;
      if (
        category === "known" &&
        (!Object.hasOwn(summaries, key) || summaries[key]!.status !== "known")
      )
        continue;
      // A phrase with a gap as a whole.
      const { start, end } = span.part ?? span;
      const place = { unit, start, end };
      const id = wordId(span);
      const row = rows.get(id);
      if (row) {
        row.places.push(place);
        continue;
      }
      rows.set(id, {
        key,
        kind,
        head: kind === "phrase" ? collapseSpaces(text.slice(start, end)) : key,
        category,
        places: [place],
      });
    }
  }
  return [...rows.values()];
}

/** How many rows each filter chip shows. */
export function filterCounts(
  rows: readonly { category: WordStatus }[],
): Record<WordsFilter, number> {
  const counts = { all: rows.length, new: 0, learning: 0, known: 0 };
  for (const row of rows) counts[row.category]++;
  return counts;
}

/** The rows a filter chip shows. */
export function filterRows<R extends { category: WordStatus }>(
  rows: readonly R[],
  filter: WordsFilter,
): R[] {
  return filter === "all"
    ? [...rows]
    : rows.filter((row) => row.category === filter);
}

/**
 * The rows in a sort's order: as they are (first appearance), A–Z by head in the
 * learning language, or most occurrences first. Ties keep their order.
 */
export function sortRows<R extends { head: string; count: number }>(
  rows: readonly R[],
  sort: WordsSort,
  lang: string,
): R[] {
  const sorted = [...rows];
  if (sort === "az") {
    const collator = new Intl.Collator(lang);
    sorted.sort((a, b) => collator.compare(a.head, b.head));
  } else if (sort === "count") sorted.sort((a, b) => b.count - a.count);
  return sorted;
}
