/** A box in viewport coordinates. */
export interface TextBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The selected part of a container's text. */
export interface SelectedOffsets {
  /** Offsets in the container's text (its text nodes in order). */
  from: number;
  to: number;
}

/** Older Chrome's own way to read a selection inside a shadow root. */
interface RootWithSelection {
  getSelection(): Selection | null;
}

/**
 * The selection's range inside `root` (one of Lingo's shadow roots, closed in
 * production): `getComposedRanges` where the browser has it, else the root's own
 * `getSelection` (older Chrome). Undefined when there is no selection or neither exists.
 */
function rangeIn(root: ShadowRoot): AbstractRange | undefined {
  const selection = getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;
  if (typeof selection.getComposedRanges === "function")
    return selection.getComposedRanges({ shadowRoots: [root] })[0];
  const own = (root as Partial<RootWithSelection>).getSelection?.();
  return own && own.rangeCount > 0 ? own.getRangeAt(0) : undefined;
}

const rootOf = (container: Element) => {
  const root = container.getRootNode();
  return root instanceof ShadowRoot ? root : undefined;
};

/** The container's text nodes, in order. */
function textNodes(container: Element): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(node as Text);
  return nodes;
}

/**
 * The offset in the container's text of a boundary point: 0 before the container,
 * its length after it.
 */
function offsetOf(container: Element, node: Node, offset: number): number {
  const all = document.createRange();
  all.selectNodeContents(container);
  const where = all.comparePoint(node, offset);
  if (where < 0) return 0;
  if (where > 0) return all.toString().length;
  all.setEnd(node, offset);
  return all.toString().length;
}

/**
 * The selected part of the container's text (in one of Lingo's shadow roots), clipped
 * to the container. Undefined when nothing in it is selected, when the selection starts
 * or ends outside the shadow root, or when the browser cannot read it.
 */
export function selectedOffsets(
  container: Element,
): SelectedOffsets | undefined {
  const root = rootOf(container);
  const range = root && rangeIn(root);
  if (!root || !range || range.collapsed) return undefined;
  const { startContainer, endContainer } = range;
  if (startContainer.getRootNode() !== root) return undefined;
  if (endContainer.getRootNode() !== root) return undefined;
  const from = offsetOf(container, startContainer, range.startOffset);
  const to = offsetOf(container, endContainer, range.endOffset);
  return from < to ? { from, to } : undefined;
}

/** The text node and offset in it at an offset of the container's text. */
function pointAt(container: Element, offset: number, atEnd: boolean) {
  const nodes = textNodes(container);
  let at = 0;
  for (const node of nodes) {
    const length = node.data.length;
    // A start right at a node's end goes to the next node, an end stays.
    if (offset < at + length || (atEnd && offset === at + length))
      return { node, offset: offset - at };
    at += length;
  }
  const last = nodes.at(-1);
  return last && { node: last, offset: last.data.length };
}

/** A range over a part of the container's text; undefined when it has no text. */
function rangeOfOffsets(
  container: Element,
  from: number,
  to: number,
): Range | undefined {
  const start = pointAt(container, from, false);
  const end = pointAt(container, to, true);
  if (!start || !end) return undefined;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/** Selects a part of the container's text (in one of Lingo's shadow roots). */
export function selectOffsets(container: Element, from: number, to: number) {
  const range = rangeOfOffsets(container, from, to);
  if (!range) return;
  getSelection()?.setBaseAndExtent(
    range.startContainer,
    range.startOffset,
    range.endContainer,
    range.endOffset,
  );
}

/** The box of the first line of a part of the container's text. */
export function boxOfOffsets(
  container: Element,
  from: number,
  to: number,
): TextBox | undefined {
  const rects = [
    ...(rangeOfOffsets(container, from, to)?.getClientRects() ?? []),
  ].filter((r) => r.width > 0);
  const first = rects[0];
  if (!first) return undefined;
  const line = rects.filter(
    (r) => r.top < first.bottom && r.bottom > first.top,
  );
  return {
    left: Math.min(...line.map((r) => r.left)),
    top: Math.min(...line.map((r) => r.top)),
    right: Math.max(...line.map((r) => r.right)),
    bottom: Math.max(...line.map((r) => r.bottom)),
  };
}
