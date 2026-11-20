import type { Span, TermKind, WordStatus } from "../../core/classify";
import { lowerBound, type SubtitleLine } from "../../core/subtitles/cues";
import { joinerFor } from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import type { TermBrief } from "../../messaging/protocol";
import { collapseSpaces } from "../../core/text/sentences";
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
  /** Its first occurrence: the card and the index of its span there. */
  first: { cue: number; span: number };
}

/**
 * A card's text on one line, as saving a term from it records its sentence: its line
 * breaks joined as the language joins lines.
 */
export const flatCue = (text: string, lang: string) =>
  text.split("\n").join(joinerFor(lang));

/** A part of the phrase `key` that goes on in the card on that side (`SpanPart`). */
function pieceIn(
  list: readonly Span[] | null | undefined,
  key: string,
  side: "previous" | "next",
): Span | undefined {
  const found = (list ?? []).filter(
    (span) => span.key === key && span.kind === "phrase" && span.part?.[side],
  );
  // The part nearest the card the phrase goes on from.
  return side === "next" ? found.at(-1) : found[0];
}

/**
 * A phrase across transcript cards (`splitRun`: its parts marked `previous`, `next`),
 * from the span of one of its parts: the cards it is in, its words as written (the
 * gap's too) and the cards' text, each joined as the language joins lines. Undefined
 * for a span that one card holds whole.
 */
export function acrossCards(
  cues: readonly Cue[],
  spans: readonly (readonly Span[] | null)[],
  cue: number,
  span: Span,
  flat: (text: string) => string,
):
  | { first: number; last: number; surface: string; sentence: string }
  | undefined {
  if (!span.part?.previous && !span.part?.next) return undefined;
  const pieces = new Map<number, Span>([[cue, span]]);
  let first = cue;
  for (let s: Span | undefined = span; s?.part?.previous; first--) {
    s = pieceIn(spans[first - 1], span.key, "next");
    if (!s) break;
    pieces.set(first - 1, s);
  }
  let last = cue;
  for (let s: Span | undefined = span; s?.part?.next; last++) {
    s = pieceIn(spans[last + 1], span.key, "previous");
    if (!s) break;
    pieces.set(last + 1, s);
  }
  first = Math.min(...pieces.keys());
  last = Math.max(...pieces.keys());
  const lines: string[] = [];
  const texts: string[] = [];
  for (let c = first; c <= last; c++) {
    const text = cues[c]?.text ?? "";
    const piece = pieces.get(c)!;
    const { start, end } = piece.part ?? piece;
    lines.push(text.slice(start, end));
    texts.push(text);
  }
  return {
    first,
    last,
    surface: flat(lines.join("\n")),
    sentence: flat(texts.join("\n")),
  };
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
      // A phrase across cards as its words in all of them.
      const { unit: firstCue, span: firstSpan } = places[0]!;
      const firstOne = spans[firstCue]?.[firstSpan];
      const across =
        firstOne &&
        acrossCards(cues, spans, firstCue, firstOne, (text) =>
          collapseSpaces(text),
        );
      const at: VideoPlace[] = [];
      for (const { unit, start } of places) {
        const place = placeOf(cues, lines, unit, start);
        const last = at[at.length - 1];
        // Places are in reading order: the same line twice comes in a row.
        if (last?.card !== place.card || last.line !== place.line)
          at.push(place);
      }
      const { unit: cue, span } = places[0]!;
      return {
        key,
        kind,
        head: across?.surface ?? head,
        category,
        count: places.length,
        places: at,
        first: { cue, span },
      };
    },
  );
}
