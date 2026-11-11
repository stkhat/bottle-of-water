import { afterEach, describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import { tokenize } from "../../core/text/tokenize";
import {
  createBlockIndex,
  selectionKey,
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

  it("takes 2 to 8 words", () => {
    const { blocks, spans, index } = page(
      "<p>one two three four five six seven eight nine ten</p>",
    );
    const b = blocks[0]!;
    expect(
      snapSelection(select(b, "one", "one"), index, spans),
    ).toBeUndefined();
    expect(
      snapSelection(select(b, "one", "two"), index, spans)?.spans,
    ).toHaveLength(2);
    expect(
      snapSelection(select(b, "one", "eight"), index, spans)?.spans,
    ).toHaveLength(8);
    expect(
      snapSelection(select(b, "one", "nine"), index, spans),
    ).toBeUndefined();
  });

  it("counts the words of a saved phrase inside the selection", () => {
    const { blocks, spans, index } = page("<p>a b c d e f g figure out</p>");
    const b = blocks[0]!;
    const start = b.text.indexOf("figure");
    spans.set(b, [
      ...spans.get(b)!.filter((s) => s.start < start),
      {
        start,
        end: b.text.length,
        key: "figure out",
        kind: "phrase",
        category: "learning",
      },
    ]);
    // "b" … "figure out" is 8 words; "a" … is 9.
    expect(snapSelection(select(b, "b", "out"), index, spans)).toBeDefined();
    expect(snapSelection(select(b, "a", "out"), index, spans)).toBeUndefined();
  });

  it("snaps to the words of a detected phrase, not to the whole phrase", () => {
    const { blocks, spans, index } = page(html);
    const b = blocks[0]!;
    const start = b.text.indexOf("fall back");
    // "fell back" in the page would be keyed "fall back": the keys are base forms.
    spans.set(b, [
      ...spans.get(b)!.filter((s) => s.end <= start),
      {
        start,
        end: start + "fall back".length,
        key: "fall back",
        kind: "phrase",
        category: "new",
      },
      ...spans.get(b)!.filter((s) => s.start >= start + "fall back".length),
    ]);
    const from = b.text.indexOf("rise") + 2;
    const snapped = snapSelection(partial(b, from, start + 2), index, spans);
    expect(b.text.slice(snapped!.start, snapped!.end)).toBe("rise and fall");
    expect(snapped!.spans.map((s) => s.key)).toEqual(["rise", "and", "fall"]);

    const whole = snapSelection(
      partial(b, from, start + "fall b".length),
      index,
      spans,
    );
    expect(whole!.spans.map((s) => s.key)).toEqual([
      "rise",
      "and",
      "fall",
      "back",
    ]);
  });

  it("widens to a whole saved phrase", () => {
    const { blocks, spans, index } = page(html);
    const b = blocks[0]!;
    const start = b.text.indexOf("fall back");
    spans.set(b, [
      ...spans.get(b)!.filter((s) => s.end <= start),
      {
        start,
        end: start + "fall back".length,
        key: "fall back",
        kind: "phrase",
        category: "learning",
      },
    ]);
    const from = b.text.indexOf("rise") + 2;
    const snapped = snapSelection(partial(b, from, start + 2), index, spans);
    expect(b.text.slice(snapped!.start, snapped!.end)).toBe(
      "rise and fall back",
    );
  });

  it("widens to every part of a saved phrase with a gap, counting each part's words", () => {
    const { blocks, spans, index } = page("<p>a b c d e figure it out now</p>");
    const b = blocks[0]!;
    const at = (word: string) => b.text.indexOf(word);
    const whole = { start: at("figure"), end: at("out") + "out".length };
    const part = (word: string, i: number): Span => ({
      start: at(word),
      end: at(word) + word.length,
      key: "figure out",
      kind: "phrase",
      category: "learning",
      part: { index: i, count: 2, ...whole },
    });
    spans.set(
      b,
      spans.get(b)!.map((s) => {
        const word = b.text.slice(s.start, s.end);
        return word === "figure"
          ? part(word, 0)
          : word === "out"
            ? part(word, 1)
            : s;
      }),
    );

    const snapped = snapSelection(select(b, "it", "now"), index, spans);
    expect(b.text.slice(snapped!.start, snapped!.end)).toBe(
      "figure it out now",
    );
    expect(snapped!.spans.map((s) => s.key)).toEqual([
      "figure out",
      "it",
      "figure out",
      "now",
    ]);
    expect(selectionKey(snapped!)).toBe("figure it out now");

    const start = at("figure");
    const fromFigure = snapSelection(
      partial(b, start + 2, at("it") + 1),
      index,
      spans,
    );
    expect(b.text.slice(fromFigure!.start, fromFigure!.end)).toBe(
      "figure it out",
    );
    // "a" … "out" is 8 words; "a" … "now" is 9.
    expect(snapSelection(select(b, "a", "out"), index, spans)).toBeDefined();
    expect(snapSelection(select(b, "a", "now"), index, spans)).toBeUndefined();
  });

  it("keys a selection by its words' keys", () => {
    const { blocks, spans, index } = page(html);
    const b = blocks[0]!;
    const snapped = snapSelection(select(b, "rise", "fall"), index, spans);
    expect(selectionKey(snapped!)).toBe("rise and fall");
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
