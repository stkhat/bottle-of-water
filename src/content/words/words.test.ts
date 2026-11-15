import { describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import type { TermBrief } from "../../messaging/protocol";
import { listWords, toWordRows, wordId } from "./words";

const span = (
  start: number,
  end: number,
  key: string,
  category: Span["category"],
  kind: Span["kind"] = "word",
): Span => ({ start, end, key, kind, category });

describe("listWords", () => {
  it("gives each term every place it shows, in reading order, over every unit, with its span's index", () => {
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
          { unit: "a", start: 0, end: 5, span: 0 },
          { unit: "a", start: 10, end: 15, span: 1 },
          { unit: "c", start: 25, end: 30, span: 1 },
        ],
      },
      {
        key: "from scratch",
        kind: "phrase",
        head: "from scratch",
        category: "learning",
        places: [{ unit: "c", start: 6, end: 18, span: 0 }],
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
    expect(row!.places).toEqual([{ unit: 0, start: 0, end: 13, span: 0 }]);
  });
});

describe("wordId", () => {
  it("tells a phrase from a word with the same key", () => {
    expect(wordId({ kind: "word", key: "rise" })).not.toBe(
      wordId({ kind: "phrase", key: "rise" }),
    );
  });
});

describe("toWordRows with your meanings", () => {
  const fold = {
    key: "fold",
    kind: "word" as const,
    head: "fold",
    category: "learning" as const,
    count: 4,
    places: [
      "Give it a fold.",
      "One more fold.",
      "Fold the flour in.",
      "A fold.",
    ],
  };
  const meanings = [
    { key: "m-dough", line: "（パン生地の）折り込み", ai: true as const },
    { key: "m-mix", line: "（料理で）…をさっくり混ぜる" },
  ];
  const rowsOf = (summaries: Record<string, TermBrief>, word = fold) =>
    toWordRows(
      [word],
      {
        filter: "all",
        sort: "order",
        summaries,
        learningLang: "en",
        nativeLang: "ja",
        sentence: (w, place) => w.places[place]!,
      },
      () => ({}),
    );

  it("groups the places by the meaning chosen there, in order of first appearance, the others last", () => {
    const [row] = rowsOf({
      fold: {
        status: "learning",
        short: "折り目、ひだ",
        meanings,
        chosen: [
          { sentence: "Fold the flour in.", key: "m-mix" },
          { sentence: "One more fold.", key: "m-dough" },
          { sentence: "A fold.", key: "m-dough" },
        ],
      },
    });
    expect(row!.groups).toEqual([
      {
        meaning: { text: "（パン生地の）折り込み", lang: "ja" },
        places: [1, 3],
      },
      {
        meaning: { text: "（料理で）…をさっくり混ぜる", lang: "ja" },
        places: [2],
      },
      { places: [0] },
    ]);
    // The places with none show under the dictionary's short meaning.
    expect(row).toMatchObject({ short: "折り目、ひだ", shortLang: "ja" });
    expect(row).not.toHaveProperty("mine");
  });

  it("leaves out the line of places with none when every place has a meaning", () => {
    const one = { ...fold, places: ["One more fold."], count: 1 };
    const [row] = rowsOf(
      {
        fold: {
          status: "learning",
          meanings,
          chosen: [{ sentence: "One more fold.", key: "m-dough" }],
        },
      },
      one,
    );
    expect(row!.groups).toEqual([
      { meaning: { text: "（パン生地の）折り込み", lang: "ja" }, places: [0] },
    ]);
  });

  it("shows meanings chosen only elsewhere on one line, joined, instead of the short meaning", () => {
    const [row] = rowsOf({
      fold: {
        status: "learning",
        short: "折り目、ひだ",
        meanings: [
          ...meanings,
          { key: "m-en", line: "To bend", lineLang: "en" },
        ],
        // A choice in a sentence no place has groups nothing.
        chosen: [{ sentence: "Elsewhere.", key: "m-mix" }],
      },
    });
    expect(row).not.toHaveProperty("groups");
    expect(row).toMatchObject({
      short: "（パン生地の）折り込み · （料理で）…をさっくり混ぜる · To bend",
      // Lines in two languages: the native one stands for the line.
      shortLang: "ja",
      mine: true,
    });
  });

  it("leaves a term without meanings of the user's as it was", () => {
    const [row] = rowsOf({
      fold: { status: "learning", short: "To fold", glossLang: "en" },
    });
    expect(row).toMatchObject({ short: "To fold", shortLang: "en" });
    expect(row).not.toHaveProperty("groups");
    expect(row).not.toHaveProperty("mine");
  });
});
