import type { Span, TermKind, WordStatus } from "../../core/classify";
import { lowerBound, type SubtitleLine } from "../../core/subtitles/cues";
import type { Cue } from "../../core/subtitles/types";
import type { TermBrief } from "../../messaging/protocol";
import { listWords } from "../words/words";

/**
 * Where a term shows: its transcript card, the subtitle line of that card it starts in
 * (an index in the lines; -1 when the card has none) and when that line starts. A long
 * card plays as several lines, so the line's start is where the term is heard, not the
 * card's.
 */
export interface VideoPlace {
  card: number;
  line: number;
  startMs: number;
}

/** A word or phrase of the video, in the Words tab. */
export interface VideoWord {
  key: string;
  kind: TermKind;
  /** A word's key; a phrase as written where it first appears. */
  head: string;
  category: WordStatus;
  /** How many times the transcript shows it. */
  count: number;
  /** The subtitle lines it shows in, each once, in order. */
  places: VideoPlace[];
}

/**
 * The place of the text at `offset` in card `card`: the last of the card's lines that
 * starts at or before it (lines are sorted by time, so a card's lines are together and
 * in order); the card's own start when it has no line.
 */
export function placeOf(
  cues: readonly Cue[],
  lines: readonly SubtitleLine[],
  card: number,
  offset: number,
): VideoPlace {
  let line = -1;
  for (
    let i = lowerBound(lines.length, (i) => lines[i]!.card < card);
    i < lines.length && lines[i]!.card === card && lines[i]!.start <= offset;
    i++
  )
    line = i;
  return {
    card,
    line,
    startMs: line < 0 ? cues[card]!.startMs : lines[line]!.startMs,
  };
}

/**
 * The words and phrases of the classified cards (`listWords`), each with the subtitle
 * lines it shows in: a chip each in the Words tab.
 */
export function videoWords(
  cues: readonly Cue[],
  lines: readonly SubtitleLine[],
  spans: readonly (readonly Span[] | null)[],
  summaries: Readonly<Record<string, TermBrief>>,
): VideoWord[] {
  const units = spans.map((list, cue) => ({
    unit: cue,
    text: cues[cue]?.text ?? "",
    spans: list,
  }));
  return listWords(units, summaries).map(
    ({ key, kind, head, category, places }) => {
      const at: VideoPlace[] = [];
      for (const { unit, start } of places) {
        const place = placeOf(cues, lines, unit, start);
        const last = at[at.length - 1];
        // Places are in reading order: the same line twice comes in a row.
        if (last?.card !== place.card || last.line !== place.line)
          at.push(place);
      }
      return { key, kind, head, category, count: places.length, places: at };
    },
  );
}
