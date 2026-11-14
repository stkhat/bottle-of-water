import type { Span, TermKind, WordStatus } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import type { TermBrief } from "../../messaging/protocol";
import { listWords } from "../words/words";

/** A word or phrase of the video, in the Words tab. */
export interface VideoWord {
  key: string;
  kind: TermKind;
  /** A word's key; a phrase as written where it first appears. */
  head: string;
  category: WordStatus;
  /** How many times the transcript shows it. */
  count: number;
  /** The transcript cards (indexes in the cues) it shows in, each once, in order. */
  cards: number[];
}

/**
 * The words and phrases of the classified cards (`listWords`), each with the cards it
 * shows in: a chip each in the Words tab.
 */
export function videoWords(
  cues: readonly Cue[],
  spans: readonly (readonly Span[] | null)[],
  summaries: Readonly<Record<string, TermBrief>>,
): VideoWord[] {
  const units = spans.map((list, cue) => ({
    unit: cue,
    text: cues[cue]?.text ?? "",
    spans: list,
  }));
  return listWords(units, summaries).map(
    ({ key, kind, head, category, places }) => ({
      key,
      kind,
      head,
      category,
      count: places.length,
      cards: [...new Set(places.map((place) => place.unit))],
    }),
  );
}
