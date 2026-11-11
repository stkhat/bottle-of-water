import type { Span } from "../../core/classify";
import { blockOffset, rangeOf, type TextBlock } from "./page-text";

/** The spans of each analyzed block. */
export type SpanMap = Map<TextBlock, readonly Span[]>;

export interface SpanRef {
  block: TextBlock;
  span: Span;
}

/** Which block a text node belongs to. */
export interface BlockIndex {
  add(blocks: readonly TextBlock[]): void;
  remove(blocks: readonly TextBlock[]): void;
  blockOf(node: Node): TextBlock | undefined;
}

export function createBlockIndex(): BlockIndex {
  const byNode = new Map<Node, TextBlock>();
  return {
    add(blocks) {
      for (const block of blocks)
        for (const piece of block.pieces) byNode.set(piece.node, block);
    },
    remove(blocks) {
      for (const block of blocks)
        for (const piece of block.pieces)
          if (byNode.get(piece.node) === block) byNode.delete(piece.node);
    },
    blockOf: (node) => byNode.get(node),
  };
}

/** The caret position at a viewport point (`caretPositionFromPoint`, else `caretRangeFromPoint`). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position && { node: position.offsetNode, offset: position.offset };
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range
    ? { node: range.startContainer, offset: range.startOffset }
    : null;
}

const contains = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/** The span whose text is under a viewport point, if any. */
export function spanAtPoint(
  x: number,
  y: number,
  index: BlockIndex,
  spans: ReadonlyMap<TextBlock, readonly Span[]>,
): SpanRef | undefined {
  const caret = caretAt(x, y);
  if (!caret) return undefined;
  const block = index.blockOf(caret.node);
  const blockSpans = block && spans.get(block);
  if (!block || !blockSpans) return undefined;
  const offset = blockOffset(block, caret.node, caret.offset);
  if (offset === undefined) return undefined;
  for (const span of blockSpans) {
    if (span.start > offset) break;
    if (span.end < offset) continue;
    const rects = rangeOf(block, span.start, span.end).getClientRects();
    if ([...rects].some((r) => contains(r, x, y))) return { block, span };
  }
  return undefined;
}

/** A selection snapped to whole words of one block. */
export interface Snapped {
  block: TextBlock;
  start: number;
  end: number;
  /** The word (and saved phrase) spans inside it. */
  spans: Span[];
}

/**
 * A detected (unsaved) phrase as its words, so a selection snaps to whole words
 * rather than to a phrase the user did not choose. Its words are separated only by
 * spaces, and its key has one base form per word. Saved phrases stay whole, and so do
 * the parts of a saved phrase with a gap.
 */
function wordsOf(span: Span, text: string): Span[] {
  if (span.kind !== "phrase" || span.category !== "new") return [span];
  const keys = span.key.split(" ");
  const words = [...text.slice(span.start, span.end).matchAll(/\S+/g)];
  if (words.length !== keys.length) return [span];
  return words.map((word, i) => ({
    start: span.start + word.index,
    end: span.start + word.index + word[0].length,
    key: keys[i]!,
    kind: "word",
    category: span.category,
  }));
}

const MIN_PHRASE_WORDS = 2;
const MAX_PHRASE_WORDS = 8;

const wordsIn = (text: string) => text.split(/\s+/).length;

/**
 * How many words a span covers: its key's words (a phrase's key has one word per word),
 * or for a part of a phrase with a gap, its text's.
 */
const wordCount = (span: Span, text: string) =>
  wordsIn(span.part ? text.slice(span.start, span.end) : span.key);

/**
 * A selection of 2–8 words inside one block, widened to whole words and whole saved
 * phrases, every part of a phrase with a gap included (a detected phrase counts as its
 * words). Undefined when it is collapsed, spans blocks, has fewer or more words, or
 * its words are separated by anything but spaces (a saved phrase only matches words
 * joined by spaces).
 */
export function snapSelection(
  range: Range,
  index: BlockIndex,
  spans: ReadonlyMap<TextBlock, readonly Span[]>,
): Snapped | undefined {
  if (range.collapsed) return undefined;
  const block = index.blockOf(range.startContainer);
  if (!block || index.blockOf(range.endContainer) !== block) return undefined;
  const blockSpans = spans.get(block);
  const from = blockOffset(block, range.startContainer, range.startOffset);
  const to = blockOffset(block, range.endContainer, range.endOffset);
  if (!blockSpans || from === undefined || to === undefined) return undefined;

  // A part of a phrase with a gap widens the selection to the whole phrase.
  let start = from;
  let end = to;
  for (const { part, start: first, end: last } of blockSpans)
    if (part && last > from && first < to) {
      start = Math.min(start, part.start);
      end = Math.max(end, part.end);
    }
  const inside = blockSpans
    .flatMap((s) => wordsOf(s, block.text))
    .filter((s) => s.end > start && s.start < end);
  const words = inside.reduce((n, s) => n + wordCount(s, block.text), 0);
  if (words < MIN_PHRASE_WORDS || words > MAX_PHRASE_WORDS) return undefined;
  for (let i = 1; i < inside.length; i++) {
    const between = block.text.slice(inside[i - 1]!.end, inside[i]!.start);
    if (!/^[^\S\n]+$/.test(between)) return undefined;
  }
  return {
    block,
    start: inside[0]!.start,
    end: inside.at(-1)!.end,
    spans: inside,
  };
}

/**
 * The selected words' keys joined by single spaces. Each part of a phrase with a gap
 * gives the words of the phrase's key it stands for ("figure it out" for the parts of
 * `figure out` and the word "it").
 */
export function selectionKey({ block, spans }: Snapped): string {
  const keys: string[] = [];
  /** Words of the key that the phrase's earlier parts gave. */
  let given = 0;
  for (const span of spans) {
    if (!span.part) {
      keys.push(span.key);
      continue;
    }
    if (span.part.index === 0) given = 0;
    const count = wordCount(span, block.text);
    keys.push(...span.key.split(" ").slice(given, given + count));
    given += count;
  }
  return keys.join(" ");
}
