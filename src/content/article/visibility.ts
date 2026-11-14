import type { TextBlock } from "./page-text";

export interface VisibleBlocks {
  /** Watches blocks; each is analyzed once, when it first comes near the viewport. */
  add(blocks: readonly TextBlock[]): void;
  /**
   * Queues watched blocks for analysis now, near the viewport or not (the page's Words
   * list covers them all); blocks already queued or analyzed are left as they are.
   * Returns the blocks taken before they came near: `reached` gets each of them when
   * it does.
   */
  now(blocks: readonly TextBlock[]): TextBlock[];
  /** Stops watching blocks (and drops them if they wait for analysis). */
  remove(blocks: readonly TextBlock[]): void;
  /** Resolves once every block handed over so far has been analyzed (or dropped). */
  idle(): Promise<void>;
  disconnect(): void;
}

export interface VisibleBlocksOptions {
  /** Most blocks per `analyze` call. */
  maxBlocks?: number;
  /** Most characters per `analyze` call; a longer block goes alone. */
  maxChars?: number;
  /** How far around the viewport counts as near (IntersectionObserver rootMargin). */
  rootMargin?: string;
  /** Blocks analyzed early (`now`) that have now come near the viewport. */
  reached?: (blocks: TextBlock[]) => void;
}

const byDocumentOrder = (a: TextBlock, b: TextBlock) =>
  a.element === b.element
    ? 0
    : a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;

/** Takes the first batch off `queue` (in place) within the limits. */
function takeBatch(
  queue: TextBlock[],
  maxBlocks: number,
  maxChars: number,
): TextBlock[] {
  let count = 0;
  let chars = 0;
  while (
    count < queue.length &&
    count < maxBlocks &&
    (count === 0 || chars + queue[count]!.text.length <= maxChars)
  ) {
    chars += queue[count]!.text.length;
    count++;
  }
  return queue.splice(0, count);
}

/** Splits blocks into batches within the limits, in the order given. */
export function batches(
  blocks: readonly TextBlock[],
  maxBlocks = 20,
  maxChars = 20_000,
): TextBlock[][] {
  const queue = [...blocks];
  const out: TextBlock[][] = [];
  while (queue.length > 0) out.push(takeBatch(queue, maxBlocks, maxChars));
  return out;
}

/**
 * Hands blocks to `analyze` as they come within half a viewport of the visible area
 * (IntersectionObserver), in document order, in batches of at most 20 blocks and
 * 20,000 characters. One batch is analyzed at a time; a failed batch is skipped.
 */
export function watchVisibleBlocks(
  analyze: (batch: TextBlock[]) => Promise<unknown>,
  options: VisibleBlocksOptions = {},
): VisibleBlocks {
  const {
    maxBlocks = 20,
    maxChars = 20_000,
    rootMargin = "50% 0px 50% 0px",
    reached,
  } = options;
  const watched = new Map<Element, TextBlock>();
  /** Blocks `now` took before they came near, still watched for when they do. */
  const early = new Map<Element, TextBlock>();
  const queue: TextBlock[] = [];
  let running = false;
  let stopped = false;
  let waiters: (() => void)[] = [];

  function settle() {
    if (running || (queue.length > 0 && !stopped)) return;
    const done = waiters;
    waiters = [];
    for (const resolve of done) resolve();
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0 && !stopped) {
        queue.sort(byDocumentOrder);
        const batch = takeBatch(queue, maxBlocks, maxChars);
        try {
          await analyze(batch);
        } catch (error) {
          console.warn("Lingo:", error);
        }
      }
    } finally {
      running = false;
      settle();
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const near: TextBlock[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const ahead = early.get(entry.target);
        if (ahead) {
          observer.unobserve(entry.target);
          early.delete(entry.target);
          near.push(ahead);
          continue;
        }
        const block = watched.get(entry.target);
        if (!block) continue;
        observer.unobserve(entry.target);
        watched.delete(entry.target);
        queue.push(block);
      }
      if (near.length > 0) reached?.(near);
      void pump();
    },
    { rootMargin },
  );

  return {
    add(blocks) {
      for (const block of blocks) {
        const previous = watched.get(block.element);
        if (previous === block || early.get(block.element) === block) continue;
        if (early.delete(block.element)) observer.unobserve(block.element);
        watched.set(block.element, block);
        if (previous) observer.unobserve(block.element);
        observer.observe(block.element);
      }
    },
    now(blocks) {
      const taken: TextBlock[] = [];
      for (const block of blocks) {
        if (watched.get(block.element) !== block) continue;
        watched.delete(block.element);
        // Still observed, now for when it comes near.
        early.set(block.element, block);
        queue.push(block);
        taken.push(block);
      }
      void pump();
      return taken;
    },
    remove(blocks) {
      for (const block of blocks) {
        if (watched.get(block.element) === block) {
          watched.delete(block.element);
          observer.unobserve(block.element);
        }
        if (early.get(block.element) === block) {
          early.delete(block.element);
          observer.unobserve(block.element);
        }
        const i = queue.indexOf(block);
        if (i >= 0) queue.splice(i, 1);
      }
      settle();
    },
    idle() {
      if (!running && (queue.length === 0 || stopped)) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
    disconnect() {
      stopped = true;
      observer.disconnect();
      watched.clear();
      early.clear();
      queue.length = 0;
      settle();
    },
  };
}
