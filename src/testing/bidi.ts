// Where characters of a rendered text stand, to check the order bidi text is drawn in.
import { expect } from "vitest";

/**
 * The horizontal middle of the character at `index` (UTF-16) of `element`'s text,
 * which is one text node.
 */
export function charX(element: Element, index: number): number {
  const node = element.firstChild;
  if (!(node instanceof Text)) throw new Error("not a text element");
  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + 1);
  const { left, right } = range.getBoundingClientRect();
  return (left + right) / 2;
}

/**
 * The text in `element` is set right to left as an isolate: its direction is rtl, it
 * is a bidi isolate, and its last character (a final "!" or "…") is drawn left of its
 * first.
 */
export function expectRightToLeft(element: Element) {
  const style = getComputedStyle(element);
  expect(style.direction).toBe("rtl");
  expect(style.unicodeBidi).toBe("isolate");
  const text = element.textContent ?? "";
  expect(charX(element, text.length - 1)).toBeLessThan(charX(element, 0));
}
