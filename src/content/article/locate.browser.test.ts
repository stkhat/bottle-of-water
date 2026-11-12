import { afterEach, describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import { tokenize } from "../../core/text/tokenize";
import {
  createBlockIndex,
  snapSelection,
  spanAtPoint,
  type SpanMap,
} from "./locate";
import { collectBlocks, rangeOf, type TextBlock } from "./page-text";

const roots: HTMLElement[] = [];
afterEach(() => roots.splice(0).forEach((r) => r.remove()));

/** A page with its blocks, word spans (key = lowercased word) and an index. */
function page(html: string) {
  const root = document.createElement("div");
  root.style.cssText = "font: 20px/1.6 Georgia, serif; width: 600px";
  root.innerHTML = html;
  document.body.prepend(root);
  roots.push(root);
  const blocks = collectBlocks(root);
  const spans: SpanMap = new Map(
    blocks.map((b) => [
      b,
      tokenize(b.text, "en")
        .filter((t) => t.isWord)
        .map((t): Span => ({
          start: t.start,
          end: t.end,
          key: t.text.toLowerCase(),
          kind: "word",
          category: "new",
        })),
    ]),
  );
  const index = createBlockIndex();
  index.add(blocks);
  return { root, blocks, spans, index };
}

function rectOf(block: TextBlock, text: string) {
  const start = block.text.indexOf(text);
  return rangeOf(block, start, start + text.length).getBoundingClientRect();
}

const textOf = (ref: { block: TextBlock; span: Span } | undefined) =>
  ref && ref.block.text.slice(ref.span.start, ref.span.end);

describe("spanAtPoint", () => {
  it("finds the span under a point, inside nested inline elements", () => {
    const { blocks, spans, index } = page(
      "<p>They <b>knead</b>, wait an hour, and bake.</p><p>The yeast works.</p>",
    );
    const knead = rectOf(blocks[0]!, "knead");
    const found = spanAtPoint(
      knead.left + 3,
      knead.top + knead.height / 2,
      index,
      spans,
    );
    expect(textOf(found)).toBe("knead");
    expect(found!.block).toBe(blocks[0]);

    const yeast = rectOf(blocks[1]!, "yeast");
    expect(
      textOf(
        spanAtPoint(
          yeast.right - 2,
          yeast.top + yeast.height / 2,
          index,
          spans,
        ),
      ),
    ).toBe("yeast");
  });

  it("finds nothing over spaces, punctuation or past the end of a line", () => {
    const { root, blocks, spans, index } = page(
      "<p>They knead, then bake.</p>",
    );
    const comma = rectOf(blocks[0]!, ",");
    expect(
      spanAtPoint(comma.left + 1, comma.top + 8, index, spans),
    ).toBeUndefined();
    const box = root.getBoundingClientRect();
    expect(
      spanAtPoint(box.right - 5, comma.top + 8, index, spans),
    ).toBeUndefined();
  });

  it("finds nothing in blocks that are not indexed", () => {
    const { blocks, spans, index } = page("<p>They knead.</p>");
    index.remove(blocks);
    const knead = rectOf(blocks[0]!, "knead");
    expect(
      spanAtPoint(knead.left + 3, knead.top + 8, index, spans),
    ).toBeUndefined();
  });
});

function select(block: TextBlock, from: string, to: string) {
  const start = block.text.indexOf(from);
  const end = block.text.indexOf(to) + to.length;
  return rangeOf(block, start, end);
}

/** A range from inside one word to inside another. */
function partial(block: TextBlock, start: number, end: number) {
  return rangeOf(block, start, end);
}

describe("snapSelection", () => {
  const html =
    "<p>Keep notes, so you can trace each <i>rise and</i> fall back to its cause.</p><p>Other text here.</p>";

  it("snaps a selection inside one block to whole words", () => {
    const { blocks, spans, index } = page(html);
    const b = blocks[0]!;
    const from = b.text.indexOf("rise") + 2;
    const to = b.text.indexOf("fall") + 2;
    const snapped = snapSelection(partial(b, from, to), index, spans);
    expect(snapped).toBeDefined();
    expect(b.text.slice(snapped!.start, snapped!.end)).toBe("rise and fall");
    expect(snapped!.spans.map((s) => s.key)).toEqual(["rise", "and", "fall"]);
    expect(snapped!.block).toBe(b);
  });

  it("rejects selections across blocks or across punctuation", () => {
    const { blocks, spans, index } = page(html);
    const across = document.createRange();
    const b0 = blocks[0]!;
    const b1 = blocks[1]!;
    across.setStart(b0.pieces.at(-1)!.node, 2);
    across.setEnd(b1.pieces[0]!.node, 5);
    expect(snapSelection(across, index, spans)).toBeUndefined();
    expect(
      snapSelection(select(b0, "notes", "you"), index, spans),
    ).toBeUndefined();
  });

  it("rejects a collapsed selection", () => {
    const { blocks, spans, index } = page(html);
    const b = blocks[0]!;
    expect(snapSelection(partial(b, 3, 3), index, spans)).toBeUndefined();
  });
});
