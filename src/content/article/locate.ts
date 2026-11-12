import type { Span } from "../../core/classify";
import { snapWords, type SnappedWords } from "../../core/selection";
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
export interface Snapped extends SnappedWords {
  block: TextBlock;
}

/**
 * A selection of 2–8 words inside one block, snapped by `snapWords`. Undefined when it
 * is collapsed, spans blocks, or does not snap.
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
  const snapped = snapWords(block.text, blockSpans, from, to);
  return snapped && { block, ...snapped };
}
