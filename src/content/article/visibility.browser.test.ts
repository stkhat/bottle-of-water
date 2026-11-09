import { afterEach, describe, expect, it } from "vitest";
import { collectBlocks, type TextBlock } from "./page-text";
import { batches, watchVisibleBlocks, type VisibleBlocks } from "./visibility";

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((c) => c());
  window.scrollTo(0, 0);
});

function fixture(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  cleanups.push(() => root.remove());
  return root;
}

function watch(options: Parameters<typeof watchVisibleBlocks>[1] = {}) {
  const batches: TextBlock[][] = [];
  const watcher = watchVisibleBlocks(async (batch) => {
    batches.push(batch);
  }, options);
  cleanups.push(() => watcher.disconnect());
  return { batches, watcher };
}

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) =>
      left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
    step(n);
  });

const paragraphs = (count: number, style: string) =>
  Array.from(
    { length: count },
    (_, i) => `<p style="${style}">Paragraph ${i}</p>`,
  ).join("");

describe("watchVisibleBlocks", () => {
  it("analyzes only blocks near the viewport, then more as the page scrolls", async () => {
    const root = fixture(paragraphs(60, "height: 200px; margin: 0"));
    const blocks = collectBlocks(root);
    const { batches, watcher } = watch();
    watcher.add(blocks);

    await expect.poll(() => batches.length).toBeGreaterThan(0);
    await frames(3);
    const near = innerHeight * 1.5; // the viewport plus half of it below
    const first = batches.flat();
    expect(first.length).toBeGreaterThan(0);
    expect(first[0]).toBe(blocks[0]);
    for (const block of first)
      expect(block.element.getBoundingClientRect().top).toBeLessThan(near);
    expect(first.length).toBeLessThan(blocks.length / 2);

    window.scrollTo(0, document.documentElement.scrollHeight);
    await expect.poll(() => batches.flat().includes(blocks.at(-1)!)).toBe(true);
    // Each block is analyzed once.
    expect(new Set(batches.flat()).size).toBe(batches.flat().length);
  });

  it("sends at most 20 blocks per batch, in document order", async () => {
    const root = fixture(
      paragraphs(45, "height: 2px; margin: 0; overflow: hidden"),
    );
    const blocks = collectBlocks(root);
    const { batches, watcher } = watch();
    watcher.add(blocks);
    await expect.poll(() => batches.flat().length).toBe(45);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(batches.flat()).toEqual(blocks);
  });

  it("keeps a batch within 20,000 characters; a longer block goes alone", async () => {
    const long = (n: number) => "word ".repeat(n / 5);
    const root = fixture(
      [long(9000), long(9000), long(9000), long(25000), "short"]
        .map(
          (t) => `<p style="height: 2px; margin: 0; overflow: hidden">${t}</p>`,
        )
        .join(""),
    );
    const blocks = collectBlocks(root);
    const { batches, watcher } = watch();
    watcher.add(blocks);
    await expect.poll(() => batches.flat().length).toBe(5);
    expect(batches.map((b) => b.map((x) => x.text.length))).toEqual([
      [9000, 9000],
      [9000],
      [25000],
      [5],
    ]);
  });

  it("takes custom batch limits", async () => {
    const root = fixture(
      paragraphs(5, "height: 2px; margin: 0; overflow: hidden"),
    );
    const { batches, watcher } = watch({ maxBlocks: 2 });
    watcher.add(collectBlocks(root));
    await expect.poll(() => batches.flat().length).toBe(5);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it("analyzes the next batch only after the previous one finished", async () => {
    const root = fixture(
      paragraphs(30, "height: 2px; margin: 0; overflow: hidden"),
    );
    let release!: () => void;
    const calls: TextBlock[][] = [];
    const watcher: VisibleBlocks = watchVisibleBlocks((batch) => {
      calls.push(batch);
      return new Promise<void>((resolve) => (release = resolve));
    });
    cleanups.push(() => watcher.disconnect());
    watcher.add(collectBlocks(root));
    await expect.poll(() => calls.length).toBe(1);
    await frames(3);
    expect(calls.length).toBe(1);
    release();
    await expect.poll(() => calls.length).toBe(2);
    release();
  });

  it("keeps going after a batch fails", async () => {
    const root = fixture(
      paragraphs(25, "height: 2px; margin: 0; overflow: hidden"),
    );
    const calls: TextBlock[][] = [];
    const watcher = watchVisibleBlocks(async (batch) => {
      calls.push(batch);
      if (calls.length === 1) throw new Error("background gone");
    });
    cleanups.push(() => watcher.disconnect());
    watcher.add(collectBlocks(root));
    await expect.poll(() => calls.flat().length).toBe(25);
  });

  it("does not analyze removed blocks", async () => {
    const root = fixture(
      paragraphs(3, "height: 2px; margin: 0; overflow: hidden") +
        `<div style="height: 5000px"></div>` +
        paragraphs(2, "height: 2px; margin: 0; overflow: hidden"),
    );
    const blocks = collectBlocks(root);
    const { batches, watcher } = watch();
    watcher.add(blocks);
    await expect.poll(() => batches.flat().length).toBe(3);
    watcher.remove(blocks.slice(3, 4));
    window.scrollTo(0, document.documentElement.scrollHeight);
    await expect.poll(() => batches.flat().length).toBe(4);
    await frames(3);
    expect(batches.flat()).not.toContain(blocks[3]);
    expect(batches.flat()).toContain(blocks[4]);
  });
});

describe("batches", () => {
  it("splits blocks into batches by count and length, in the order given", () => {
    const root = fixture(
      "<p>aaaa</p><p>bbbb</p><p>cccc</p><p>dddddddddd</p><p>e</p>",
    );
    const blocks = collectBlocks(root).filter((b) => b.element !== root);
    const texts = (list: TextBlock[][]) =>
      list.map((b) => b.map((x) => x.text));
    expect(texts(batches(blocks, 2, 100))).toEqual([
      ["aaaa", "bbbb"],
      ["cccc", "dddddddddd"],
      ["e"],
    ]);
    expect(texts(batches(blocks, 20, 9))).toEqual([
      ["aaaa", "bbbb"],
      ["cccc"],
      ["dddddddddd"],
      ["e"],
    ]);
    expect(batches([], 20, 9)).toEqual([]);
  });
});
