import { describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import { listWords, wordId } from "./words";

const span = (
  start: number,
  end: number,
  key: string,
  category: Span["category"],
  kind: Span["kind"] = "word",
): Span => ({ start, end, key, kind, category });

describe("listWords", () => {
  it("gives each term every place it shows, in reading order, over every unit", () => {
    const units = [
      {
        unit: "a",
        text: "Knead it, knead it.",
        spans: [span(0, 5, "knead", "new"), span(10, 15, "knead", "new")],
      },
      { unit: "b", text: "Not yet.", spans: null },
      {
        unit: "c",
        text: "Start from\nscratch, then knead.",
        spans: [
          span(6, 18, "from scratch", "learning", "phrase"),
          span(25, 30, "knead", "new"),
        ],
      },
    ];
    expect(listWords(units, {})).toEqual([
      {
        key: "knead",
        kind: "word",
        head: "knead",
        category: "new",
        places: [
          { unit: "a", start: 0, end: 5 },
          { unit: "a", start: 10, end: 15 },
          { unit: "c", start: 25, end: 30 },
        ],
      },
      {
        key: "from scratch",
        kind: "phrase",
        head: "from scratch",
        category: "learning",
        places: [{ unit: "c", start: 6, end: 18 }],
      },
    ]);
  });

  it("puts a phrase with a gap in its places as a whole", () => {
    const whole = { start: 0, end: 13 };
    const part = (start: number, end: number, index: number): Span => ({
      ...span(start, end, "figure out", "learning", "phrase"),
      part: { index, count: 2, ...whole },
    });
    const [row] = listWords(
      [
        {
          unit: 0,
          text: "Figure it out.",
          spans: [part(0, 6, 0), part(10, 13, 1)],
        },
      ],
      {},
    );
    expect(row!.places).toEqual([{ unit: 0, start: 0, end: 13 }]);
  });
});

describe("wordId", () => {
  it("tells a phrase from a word with the same key", () => {
    expect(wordId({ kind: "word", key: "rise" })).not.toBe(
      wordId({ kind: "phrase", key: "rise" }),
    );
  });
});
