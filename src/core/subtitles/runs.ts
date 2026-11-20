import type { Span } from "../classify";
import { isSoundLabel, SENTENCE_END } from "./cues";

/**
 * Transcript cards classified as the text they are part of. A card ends where its
 * sentence does when the track says so (punctuation, a sound label, a speaker change),
 * but also where it only pauses or grows too long: speech recognition without
 * punctuation, a long sentence split in two. There the sentence runs on into the next
 * card, and a phrase or a word's grammar may too ("sin | embargo", "as | soon as").
 * Such cards are classified together as one text, and each card takes its part of the
 * spans: a phrase across two cards is a part in each.
 */

/** A card that starts with a speaker change: ">>" or a speaker's dash ("- How much?", "-Wo?"). */
const SPEAKER_START = /^(?:>>|[-‐–—])/;
/** A ♪ that opens a card: a song starts. */
const SONG_START = /^♪/;

/** The text before a card's first line break or after its last, trimmed. */
const firstLine = (text: string) => text.trimStart().split("\n")[0]!.trim();
const lastLine = (text: string) => text.trimEnd().split("\n").at(-1)!.trim();

/**
 * Whether the sentence of the card `text` goes on in the `next` card: the card does not
 * end a sentence (`SENTENCE_END`), neither side of the break is a sound label, and the
 * next card opens no speaker's line and no song.
 */
export function runsOn(text: string, next: string): boolean {
  const end = lastLine(text);
  const start = firstLine(next);
  if (end === "" || start === "") return false;
  if (SENTENCE_END.test(end) || isSoundLabel(end) || isSoundLabel(start))
    return false;
  // A label at the break ("[Music] hola", "lo que [risas]") ends the speech on its side.
  if (/[\])）]$/.test(end) || /^[[(（]/.test(start)) return false;
  return !SPEAKER_START.test(start) && !SONG_START.test(start);
}

/** Cards classified together: their texts as one. */
export interface CardRun {
  text: string;
  /** Where its cards meet: the offset of the space between each two (`ClassifyOptions.breaks`). */
  breaks: readonly number[];
  /** Its cards in order, each with where its text starts in `text`. */
  cards: readonly { card: number; at: number }[];
  /**
   * The cards asked for (not the ones around them, read only as context): each gets its
   * spans from the run.
   */
  asked: ReadonlySet<number>;
}

/**
 * A line break inside a card that is only layout: not before a speaker's dash line
 * ("- How much?\n- Two."), which starts another speaker's sentence and stays a break.
 */
const LAYOUT_BREAK = /\n(?![-‐–—])/g;

/** The most cards one run holds (a request's worth); a longer one goes on in the next. */
const MAX_RUN_CARDS = 50;

/**
 * The texts that classify the cards at `indices` of `texts`: each run of cards whose
 * sentence runs on (`runsOn`) is one text, with the card before it and the card after
 * it read as context when the sentence runs on from or into them. Cards are joined by a
 * space, and so are the lines of a card (a line break in a card is layout, no
 * sentence end), except before a speaker's dash line: every character keeps its offset. A run of more than `maxCards` cards asked for is
 * cut, each part with its neighbours as context.
 */
export function cardRuns(
  texts: readonly string[],
  indices: Iterable<number>,
  maxCards = MAX_RUN_CARDS,
): CardRun[] {
  const sorted = [...new Set(indices)]
    .filter((i) => i >= 0 && i < texts.length)
    .sort((a, b) => a - b);
  const on = (i: number) =>
    i >= 0 && i + 1 < texts.length && runsOn(texts[i]!, texts[i + 1]!);
  const runs: CardRun[] = [];
  let k = 0;
  while (k < sorted.length) {
    const asked = [sorted[k]!];
    k++;
    while (
      k < sorted.length &&
      sorted[k] === asked.at(-1)! + 1 &&
      on(asked.at(-1)!) &&
      asked.length < maxCards
    )
      asked.push(sorted[k++]!);
    const first = asked[0]!;
    const last = asked.at(-1)!;
    const cards = [
      ...(on(first - 1) ? [first - 1] : []),
      ...asked,
      ...(on(last) ? [last + 1] : []),
    ];
    let text = "";
    const breaks: number[] = [];
    const placed = cards.map((card) => {
      if (text !== "") {
        breaks.push(text.length);
        text += " ";
      }
      const at = text.length;
      text += texts[card]!.replace(LAYOUT_BREAK, " ");
      return { card, at };
    });
    runs.push({ text, breaks, cards: placed, asked: new Set(asked) });
  }
  return runs;
}

/** A phrase's extent: the whole phrase for a part of one with a gap, else the span's. */
const extentOf = (span: Span) => span.part ?? span;

/**
 * Each asked card's spans from the spans of its run's text, in text order. A span inside
 * one card moves to the card's offsets as it is. A phrase that one card does not hold
 * whole is cut at the cards' joins: each piece is a part of it (`Span.part`) whose whole
 * phrase is clipped to its card, marked as going on in the card before (`previous`) or
 * after (`next`), and the parts are numbered across the cards.
 */
export function splitRun(
  run: CardRun,
  texts: readonly string[],
  spans: readonly Span[],
): Map<number, Span[]> {
  const out = new Map<number, Span[]>();
  for (const card of run.asked) out.set(card, []);
  const ranges = run.cards.map(({ card, at }) => ({
    card,
    start: at,
    end: at + texts[card]!.length,
  }));
  /** The cards a range overlaps, as indices in `ranges`. */
  const overlapping = (start: number, end: number) => {
    const found: number[] = [];
    ranges.forEach((range, i) => {
      if (start < range.end && end > range.start) found.push(i);
    });
    return found;
  };
  /** How many pieces each phrase across cards was cut into so far, by its extent. */
  const pieces = new Map<string, number>();
  const counts = new Map<string, number>();
  const id = (span: Span) => {
    const { start, end } = extentOf(span);
    return `${span.key}\n${start}\n${end}`;
  };
  const across = (span: Span) => {
    const { start, end } = extentOf(span);
    return overlapping(start, end).length > 1;
  };
  for (const span of spans)
    if (across(span))
      counts.set(
        id(span),
        (counts.get(id(span)) ?? 0) + overlapping(span.start, span.end).length,
      );
  for (const span of spans) {
    if (!across(span)) {
      const [i] = overlapping(span.start, span.end);
      const range = i === undefined ? undefined : ranges[i];
      if (!range) continue;
      const list = out.get(range.card);
      if (!list) continue;
      list.push(shifted(span, range.start));
      continue;
    }
    const whole = extentOf(span);
    for (const i of overlapping(span.start, span.end)) {
      const range = ranges[i]!;
      const index = pieces.get(id(span)) ?? 0;
      pieces.set(id(span), index + 1);
      const list = out.get(range.card);
      if (!list) continue;
      const clip = (n: number) =>
        Math.min(Math.max(n, range.start), range.end) - range.start;
      list.push({
        ...span,
        start: clip(span.start),
        end: clip(span.end),
        part: {
          index,
          count: counts.get(id(span))!,
          start: clip(whole.start),
          end: clip(whole.end),
          ...(whole.start < range.start && { previous: true as const }),
          ...(whole.end > range.end && { next: true as const }),
        },
      });
    }
  }
  return out;
}

function shifted(span: Span, by: number): Span {
  if (by === 0) return span;
  const moved: Span = { ...span, start: span.start - by, end: span.end - by };
  if (span.part)
    moved.part = {
      ...span.part,
      start: span.part.start - by,
      end: span.part.end - by,
    };
  return moved;
}
