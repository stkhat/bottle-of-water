import type { Span } from "./classify";
import { separatorKey, spacedKey, wordsOfKey } from "./phrases/key";

/** A selection snapped to whole words of one text. */
export interface SnappedWords {
  start: number;
  end: number;
  /** The word (and saved phrase) spans inside it. */
  spans: Span[];
  /** How many words it has (a saved phrase kept whole counts its words). */
  words: number;
}

/**
 * A phrase as its words, so a selection snaps to whole words rather than to a phrase
 * the user did not choose: a detected (unsaved) phrase, and a saved one the selection
 * (`from` to `to`) covers only part of. Its words are separated only by spaces, and
 * its key has one base form per word (no slot another word fills). A saved phrase the
 * selection covers whole stays whole, and so does a saved phrase with a slot, one
 * whose key writes other separators ("wh-what") and the parts of a phrase with a gap.
 */
function wordsOf(span: Span, text: string, from: number, to: number): Span[] {
  if (span.kind !== "phrase" || span.part || span.slot) return [span];
  if (!spacedKey(span.key)) return [span];
  const keys = span.key.split(" ");
  const words = [...text.slice(span.start, span.end).matchAll(/\S+/g)];
  if (words.length !== keys.length) return [span];
  const spans = words.map((word, i): Span => ({
    start: span.start + word.index,
    end: span.start + word.index + word[0].length,
    key: keys[i]!,
    kind: "word",
    category: span.category,
  }));
  const saved = span.category !== "new";
  return saved && spans.every((s) => s.end > from && s.start < to)
    ? [span]
    : spans;
}

/** The most words a selection takes (user, 2026-11-19: a longer one is cut to these). */
const MAX_SELECTED_WORDS = 8;

/**
 * How many words a span covers: its key's words (a phrase's key has one word per word),
 * or for a part of a phrase with a gap, its text's.
 */
const wordCount = (span: Span, text: string) =>
  wordsOfKey(span.part ? text.slice(span.start, span.end) : span.key).length ||
  1;

/** The parts of a phrase with a gap are the same phrase. */
const samePhrase = (a: Span, b: Span) =>
  a.part !== undefined &&
  b.part !== undefined &&
  a.part.start === b.part.start &&
  a.part.end === b.part.end;

/**
 * The text from `from` to `to` as whole words (2026-11-19): widened to whole words,
 * every part of a phrase with a gap included, and a saved phrase with a slot (a
 * detected phrase, and a saved one it covers only part of, count as their words).
 * Punctuation may separate the words ("wh-what", "well, I think"), a line break may
 * not. `spans` are the text's spans in text order.
 *
 * `anchor`: the end the selection grows from (the drag's start). From there it takes
 * at most 8 words and stops at a line break; a phrase with a gap is taken whole or not
 * at all. Without an anchor, a selection of more than 8 words or across a line break
 * gives undefined (a page's own selection, which may be meant for copying).
 *
 * Undefined when it is collapsed or has no word.
 */
export function snapWords(
  text: string,
  spans: readonly Span[],
  from: number,
  to: number,
  anchor?: "start" | "end",
): SnappedWords | undefined {
  if (from >= to) return undefined;
  // A part of a phrase with a gap widens the selection to the whole phrase.
  let start = from;
  let end = to;
  for (const { part, start: first, end: last } of spans)
    if (part && last > from && first < to) {
      start = Math.min(start, part.start);
      end = Math.max(end, part.end);
    }
  const inside = spans
    .flatMap((s) => wordsOf(s, text, start, end))
    .filter((s) => s.end > start && s.start < end);
  // Taken from the anchor on.
  const order = anchor === "end" ? [...inside].reverse() : inside;
  const taken: Span[] = [];
  let words = 0;
  for (const span of order) {
    const previous = taken.at(-1);
    const between =
      previous &&
      (anchor === "end"
        ? text.slice(span.end, previous.start)
        : text.slice(previous.end, span.start));
    const count = wordCount(span, text);
    if (
      (between !== undefined && between.includes("\n")) ||
      words + count > MAX_SELECTED_WORDS
    ) {
      if (anchor === undefined) return undefined;
      break;
    }
    taken.push(span);
    words += count;
  }
  // A phrase with a gap cut short goes whole.
  for (let i = 0; i < taken.length; i++) {
    const span = taken[i]!;
    if (!span.part) continue;
    const parts = taken.filter((s) => samePhrase(s, span)).length;
    if (parts === span.part.count) continue;
    const first = taken.findIndex((s) => samePhrase(s, span));
    for (const dropped of taken.splice(first))
      words -= wordCount(dropped, text);
    break;
  }
  if (taken.length === 0) return undefined;
  if (anchor === "end") taken.reverse();
  return {
    start: taken[0]!.start,
    end: taken.at(-1)!.end,
    spans: taken,
    words,
  };
}

/**
 * The selected words' keys joined by what separates them in `text` (`separatorKey`:
 * "rise and fall", "wh-what", "well, i think"; `spans` from `snapWords` on `text`).
 * Each part of a phrase with a gap gives the words of the phrase's key it stands for
 * ("figure it out" for the parts of `figure out` and the word "it").
 */
export function selectionKey(text: string, spans: readonly Span[]): string {
  let key = "";
  /** Words of the key that the phrase's earlier parts gave. */
  let given = 0;
  spans.forEach((span, i) => {
    if (i > 0) key += separatorKey(text.slice(spans[i - 1]!.end, span.start));
    if (!span.part) {
      key += span.key;
      return;
    }
    if (span.part.index === 0) given = 0;
    const count = wordCount(span, text);
    key += span.key
      .split(" ")
      .slice(given, given + count)
      .join(" ");
    given += count;
  });
  return key;
}
