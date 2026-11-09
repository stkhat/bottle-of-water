import type { TextBlock } from "./page-text";

/** Total text of the blocks inside an element. */
const textIn = (element: Element, blocks: readonly TextBlock[]) =>
  blocks.reduce(
    (n, b) => (element.contains(b.element) ? n + b.text.length : n),
    0,
  );

/**
 * The last block of the page's main content: inside the `article` with the most text,
 * else `main` / `[role=main]`, else the parent of the block with the most text.
 */
export function lastMainBlock(
  root: Element,
  blocks: readonly TextBlock[],
): TextBlock | undefined {
  if (blocks.length === 0) return undefined;
  const pick = (selector: string) => {
    let best: Element | undefined;
    let most = 0;
    for (const element of root.querySelectorAll(selector)) {
      const length = textIn(element, blocks);
      if (length > most) {
        most = length;
        best = element;
      }
    }
    return best;
  };
  const longest = blocks.reduce((a, b) =>
    b.text.length > a.text.length ? b : a,
  );
  const container =
    pick("article") ??
    pick("main, [role=main]") ??
    longest.element.parentElement ??
    longest.element;
  return blocks.findLast((b) => container.contains(b.element));
}

export interface EndWatcher {
  /** Watches the last block of the main content among `blocks` (after page changes). */
  update(blocks: readonly TextBlock[]): void;
  disconnect(): void;
}

/** Calls `onReached` once, when the last block of the main content comes into view. */
export function watchEndOfArticle(
  root: Element,
  onReached: () => void,
): EndWatcher {
  let target: Element | undefined;
  let reached = false;
  const observer = new IntersectionObserver((entries) => {
    if (reached || !entries.some((e) => e.isIntersecting)) return;
    reached = true;
    observer.disconnect();
    onReached();
  });
  return {
    update(blocks) {
      if (reached) return;
      const element = lastMainBlock(root, blocks)?.element;
      if (element === target) return;
      if (target) observer.unobserve(target);
      target = element;
      if (target) observer.observe(target);
    },
    disconnect: () => observer.disconnect(),
  };
}
