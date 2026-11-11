import type { TextBlock } from "./page-text";

export interface EndWatcher {
  /** Watches `last`, the main content's last block (`findMainContent`), after page changes. */
  update(last: TextBlock | undefined): void;
  disconnect(): void;
}

/** Calls `onReached` once, when the last block of the main content comes into view. */
export function watchEndOfArticle(onReached: () => void): EndWatcher {
  let target: Element | undefined;
  let reached = false;
  const observer = new IntersectionObserver((entries) => {
    if (reached || !entries.some((e) => e.isIntersecting)) return;
    reached = true;
    observer.disconnect();
    onReached();
  });
  return {
    update(last) {
      if (reached) return;
      const element = last?.element;
      if (element === target) return;
      if (target) observer.unobserve(target);
      target = element;
      if (target) observer.observe(target);
    },
    disconnect: () => observer.disconnect(),
  };
}
