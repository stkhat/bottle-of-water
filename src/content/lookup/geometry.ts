/** A box in viewport coordinates. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function boxOf(element: Element): Box;
export function boxOf(element: Element | null | undefined): Box | null;
export function boxOf(element: Element | null | undefined): Box | null {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Fallback line height (× font size) for `line-height: normal`. */
const NORMAL_LINE_HEIGHT = 1.2;

function lineHeightOf(element: Element | null, rect: DOMRect): number {
  if (!element) return rect.height;
  const style = getComputedStyle(element);
  const value = parseFloat(style.lineHeight);
  if (Number.isFinite(value)) return value;
  return Math.max(rect.height, parseFloat(style.fontSize) * NORMAL_LINE_HEIGHT);
}

/**
 * The boxes of a word or phrase as the mock draws its word buttons: the text with 2px
 * on each side, as tall as the line. One box per line the range runs over.
 */
export function wordBoxes(range: Range): Box[] {
  const node = range.startContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return [...range.getClientRects()]
    .filter((r) => r.width > 0)
    .map((r) => {
      const lineHeight = lineHeightOf(element, r);
      const top = r.top + r.height / 2 - lineHeight / 2;
      return {
        left: r.left - 2,
        right: r.right + 2,
        top,
        bottom: top + lineHeight,
      };
    });
}
