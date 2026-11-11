/**
 * The page's prose as blocks of text: the text nodes under one block-level element,
 * joined, with a map back to the nodes so a span of a block becomes a `Range`.
 */

/** One text node of a block and where its text starts in the block's text. */
export interface TextPiece {
  readonly node: Text;
  readonly start: number;
}

export interface TextBlock {
  /** The nearest block-level ancestor of the block's text nodes. */
  readonly element: Element;
  /**
   * The text nodes' text in document order, tabs and line breaks turned into spaces
   * (so offsets stay 1:1 with the nodes). A `<br>` or a nested block between two
   * nodes adds one "\n", which belongs to no node.
   */
  readonly text: string;
  readonly pieces: readonly TextPiece[];
}

export interface BlockChange {
  removed: TextBlock[];
  added: TextBlock[];
}

/** Elements whose text is not prose to learn from. */
const SKIPPED =
  "script, style, noscript, template, textarea, input, select, code, pre, [contenteditable], svg, math";

/** Lingo's own hosts (`lingo-article`, …). Their UI lives in shadow roots. */
const isLingoElement = (node: Node): boolean =>
  node instanceof Element && node.localName.startsWith("lingo-");

const isInlineDisplay = (display: string) =>
  display.startsWith("inline") ||
  display === "contents" ||
  display.startsWith("ruby");

function isSkipped(element: Element, style: CSSStyleDeclaration): boolean {
  return (
    isLingoElement(element) ||
    element.matches(SKIPPED) ||
    style.display === "none"
  );
}

interface Draft {
  element: Element;
  text: string;
  pieces: TextPiece[];
  /** A `<br>` or nested block came after the last text. */
  broken: boolean;
}

const newDraft = (element: Element): Draft => ({
  element,
  text: "",
  pieces: [],
  broken: false,
});

const LINE_CHARS = /[\t\n\r\f]/g;

/** Which text nodes are read; every one by default. */
export type AcceptText = (node: Text) => boolean;

const acceptAll: AcceptText = () => true;

function visit(
  element: Element,
  draft: Draft,
  out: Draft[],
  accept: AcceptText,
) {
  let visible: boolean | undefined;
  for (const child of element.childNodes) {
    if (child instanceof Text) {
      if (child.data === "" || !accept(child)) continue;
      visible ??= getComputedStyle(element).visibility === "visible";
      if (!visible) continue;
      if (draft.broken && draft.text !== "") draft.text += "\n";
      draft.broken = false;
      draft.pieces.push({ node: child, start: draft.text.length });
      draft.text += child.data.replace(LINE_CHARS, " ");
    } else if (child instanceof Element) {
      if (child.localName === "br") {
        draft.broken = true;
        continue;
      }
      const style = getComputedStyle(child);
      if (isSkipped(child, style)) continue;
      if (isInlineDisplay(style.display)) {
        visit(child, draft, out, accept);
      } else {
        draft.broken = true;
        const inner = newDraft(child);
        out.push(inner);
        visit(child, inner, out, accept);
      }
    }
  }
}

/** True when `element` or one of its ancestors is skipped or not displayed. */
function isExcluded(element: Element): boolean {
  for (let el: Element | null = element; el; el = el.parentElement)
    if (isSkipped(el, getComputedStyle(el))) return true;
  return false;
}

/**
 * The blocks of `root` (taken as a block) and of the blocks nested in it, in document
 * order. Skips `script, style, noscript, textarea, input, select, code, pre,
 * [contenteditable], svg` and the like, hidden elements and text, Lingo's own hosts,
 * and blocks with only whitespace. Nothing is collected when `root` or an ancestor
 * is skipped or hidden. Only text nodes `accept` takes are read (all by default).
 */
export function collectBlocks(
  root: Element,
  accept: AcceptText = acceptAll,
): TextBlock[] {
  if (isExcluded(root)) return [];
  const drafts = [newDraft(root)];
  visit(root, drafts[0]!, drafts, accept);
  return drafts
    .filter((d) => d.text.trim() !== "")
    .map(({ element, text, pieces }) => ({ element, text, pieces }));
}

/** The index of the last piece starting at or before `offset`. */
function pieceIndex(block: TextBlock, offset: number): number {
  let lo = 0;
  let hi = block.pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (block.pieces[mid]!.start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The DOM position of a block offset; an offset between pieces snaps to the next piece. */
function position(block: TextBlock, offset: number, isEnd: boolean) {
  const i = pieceIndex(block, offset);
  const piece = block.pieces[i]!;
  const length = piece.node.data.length;
  const within = offset - piece.start;
  if (within <= length || i === block.pieces.length - 1) {
    return { node: piece.node, offset: Math.max(0, Math.min(within, length)) };
  }
  // In the "\n" after this piece: an end stays at this piece, a start moves on.
  if (isEnd) return { node: piece.node, offset: length };
  return { node: block.pieces[i + 1]!.node, offset: 0 };
}

/** A Range over `[start, end)` of a block's text. */
export function rangeOf(block: TextBlock, start: number, end: number): Range {
  const range = document.createRange();
  const from = position(block, start, false);
  const to = position(block, end, true);
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

/** The block offset of a DOM position inside one of the block's text nodes. */
export function blockOffset(
  block: TextBlock,
  node: Node,
  offset: number,
): number | undefined {
  const piece = block.pieces.find((p) => p.node === node);
  return piece && piece.start + offset;
}

/** The element itself when it is a block, else its nearest block-level ancestor within `root`. */
function nearestBlock(node: Node, root: Element): Element {
  let el = node instanceof Element ? node : node.parentElement;
  while (el && el !== root && root.contains(el)) {
    if (!isInlineDisplay(getComputedStyle(el).display)) return el;
    el = el.parentElement;
  }
  return root;
}

const sameBlock = (a: TextBlock, b: TextBlock) =>
  a.element === b.element &&
  a.text === b.text &&
  a.pieces.length === b.pieces.length &&
  a.pieces.every((p, i) => p.node === b.pieces[i]!.node);

const byDocumentOrder = (a: TextBlock, b: TextBlock) =>
  a.element === b.element
    ? 0
    : a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;

export interface PageText {
  /** The current blocks, in document order. */
  blocks(): readonly TextBlock[];
  disconnect(): void;
}

export interface PageTextOptions {
  /** Called with the blocks that went away and the new ones after page changes. */
  onChange?: (change: BlockChange) => void;
  /** How long changes are gathered before the blocks are re-collected (ms). */
  debounceMs?: number;
  /** Which text nodes are read (`collectBlocks`); every one by default. */
  acceptText?: AcceptText;
}

/**
 * The blocks under `root`, kept up to date: a MutationObserver gathers changed
 * subtrees for `debounceMs` (300 ms) after the first change, then re-collects their
 * blocks. Blocks whose element, text and nodes are unchanged stay the same objects.
 * Lingo's own hosts coming and going cause no change.
 */
export function createPageText(
  root: Element,
  options: PageTextOptions = {},
): PageText {
  const { onChange, debounceMs = 300, acceptText = acceptAll } = options;
  const collect = (el: Element) => collectBlocks(el, acceptText);
  let blocks = collect(root);
  const dirty = new Set<Element>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    timer = undefined;
    const roots = [...dirty].filter(
      (el) =>
        el.isConnected &&
        ![...dirty].some((other) => other !== el && other.contains(el)),
    );
    dirty.clear();

    const stale = (b: TextBlock) =>
      !b.element.isConnected || roots.some((r) => r.contains(b.element));
    const fresh = roots.flatMap(collect);
    const old = blocks.filter(stale);
    const kept = blocks.filter((b) => !stale(b));

    const removed = old.filter((o) => !fresh.some((f) => sameBlock(o, f)));
    const added: TextBlock[] = [];
    for (const f of fresh) {
      const same = old.find((o) => sameBlock(o, f));
      if (same) kept.push(same);
      else {
        kept.push(f);
        added.push(f);
      }
    }
    blocks = kept.sort(byDocumentOrder);
    if (removed.length || added.length)
      onChange?.({ removed, added: added.sort(byDocumentOrder) });
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        if (nodes.length > 0 && nodes.every(isLingoElement)) continue;
      }
      if (!root.contains(record.target)) continue;
      dirty.add(nearestBlock(record.target, root));
    }
    if (dirty.size > 0 && timer === undefined)
      timer = setTimeout(flush, debounceMs);
  });
  observer.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  return {
    blocks: () => blocks,
    disconnect() {
      observer.disconnect();
      clearTimeout(timer);
      dirty.clear();
    },
  };
}
