import type { Span, TermKind } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import type { TermBrief } from "../../messaging/protocol";
import { visibleSpans } from "../../ui/video/terms";

/** A category a row of "Words in this video" can have. */
export type WordCategory = "new" | "learning" | "known";

/** The Words tab's filter chips. */
export type WordsFilter = "all" | WordCategory;

/** A word or phrase of the video, in the Words tab. */
export interface VideoWord {
  key: string;
  kind: TermKind;
  /** A word's key; a phrase as written where it first appears. */
  head: string;
  category: WordCategory;
  /** How many times the transcript shows it. */
  count: number;
  /** Its first occurrence: the cue and the index of its span in that cue's spans. */
  first: { cue: number; span: number };
}

/**
 * The words and phrases of the classified cards, grouped by key and kind, in order of
 * first appearance. Leaves out what the transcript does not highlight (`visibleSpans`)
 * and words known only by the frequency level: a known span counts only once its
 * summary says it is saved as known.
 */
export function videoWords(
  cues: readonly Cue[],
  spans: readonly (readonly Span[] | null)[],
  summaries: Readonly<Record<string, TermBrief>>,
): VideoWord[] {
  const rows = new Map<string, VideoWord>();
  spans.forEach((list, cue) => {
    if (!list) return;
    for (const [span, index] of visibleSpans(list)) {
      const { key, kind, category } = span;
      if (category === "ignored") continue;
      if (
        category === "known" &&
        (!Object.hasOwn(summaries, key) || summaries[key]!.status !== "known")
      )
        continue;
      const id = `${kind}\n${key}`;
      const row = rows.get(id);
      if (row) {
        row.count++;
        continue;
      }
      const text = cues[cue]?.text ?? "";
      rows.set(id, {
        key,
        kind,
        head:
          kind === "phrase"
            ? text.slice(span.start, span.end).replaceAll("\n", " ")
            : key,
        category,
        count: 1,
        first: { cue, span: index },
      });
    }
  });
  return [...rows.values()];
}

/** How many rows each filter chip shows. */
export function filterCounts(
  rows: readonly VideoWord[],
): Record<WordsFilter, number> {
  const counts = { all: rows.length, new: 0, learning: 0, known: 0 };
  for (const row of rows) counts[row.category]++;
  return counts;
}

/** The rows a filter chip shows. */
export function filterRows(
  rows: readonly VideoWord[],
  filter: WordsFilter,
): VideoWord[] {
  return filter === "all"
    ? [...rows]
    : rows.filter((row) => row.category === filter);
}
