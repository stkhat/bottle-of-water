import { describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import type { TermBrief } from "../../messaging/protocol";
import { filterCounts, filterRows, videoWords, type VideoWord } from "./words";

const cue = (text: string): Cue => ({ startMs: 0, endMs: 1000, text });
const span = (
  start: number,
  end: number,
  key: string,
  category: Span["category"],
  kind: Span["kind"] = "word",
): Span => ({ start, end, key, kind, category });

const CUES: Cue[] = [
  cue("Give\nup the loaf."),
  cue("The loaf rose. 3 loaves."),
  cue("Not classified yet."),
  cue("I gave up on tangy."),
  cue("Rise again."),
];

const SPANS: (Span[] | null)[] = [
  [
    span(0, 7, "give up", "new", "phrase"),
    span(8, 11, "the", "known"),
    span(12, 16, "loaf", "learning"),
  ],
  [
    span(0, 3, "the", "known"),
    span(4, 8, "loaf", "learning"),
    span(9, 13, "rise", "known"),
    span(15, 16, "3", "ignored"),
    span(17, 23, "loaf", "learning"),
  ],
  null,
  // Not in text order: refs keep each span's index in the cue's list.
  [
    span(13, 18, "tangy", "new"),
    span(0, 1, "i", "ignored"),
    span(2, 9, "give up", "new", "phrase"),
    span(10, 12, "on", "known"),
  ],
  // A phrase with the key of a word: a row of its own.
  [span(0, 10, "rise", "new", "phrase")],
];

const SUMMARIES: Record<string, TermBrief> = {
  "give up": { short: "諦める", status: "new" },
  the: { short: "その", status: "new" },
  loaf: { short: "パンのひと塊", status: "learning" },
  rise: { short: "上昇", status: "known" },
  // "on" and "tangy": not answered yet.
};

const rows = () => videoWords(CUES, SPANS, SUMMARIES);

describe("videoWords", () => {
  it("lists each word and phrase once, in order of first appearance, with its count", () => {
    expect(rows()).toEqual<VideoWord[]>([
      {
        key: "give up",
        kind: "phrase",
        head: "Give up",
        category: "new",
        count: 2,
        first: { cue: 0, span: 0 },
      },
      {
        key: "loaf",
        kind: "word",
        head: "loaf",
        category: "learning",
        count: 3,
        first: { cue: 0, span: 2 },
      },
      {
        key: "rise",
        kind: "word",
        head: "rise",
        category: "known",
        count: 1,
        first: { cue: 1, span: 2 },
      },
      {
        key: "tangy",
        kind: "word",
        head: "tangy",
        category: "new",
        count: 1,
        first: { cue: 3, span: 0 },
      },
      {
        key: "rise",
        kind: "phrase",
        head: "Rise again",
        category: "new",
        count: 1,
        first: { cue: 4, span: 0 },
      },
    ]);
  });

  it("leaves out ignored words, words known only by their level, and known words not answered yet", () => {
    const keys = rows().map((row) => row.key);
    for (const key of ["3", "i", "the", "on"]) expect(keys).not.toContain(key);
  });

  it("lists a level-known word once it is saved as known", () => {
    const saved = videoWords(CUES, SPANS, {
      ...SUMMARIES,
      the: { status: "known" },
    });
    expect(saved.find((row) => row.key === "the")).toEqual({
      key: "the",
      kind: "word",
      head: "the",
      category: "known",
      count: 2,
      first: { cue: 0, span: 1 },
    });
  });

  it("counts only the spans the transcript shows", () => {
    const overlapping: (Span[] | null)[] = [
      [span(0, 4, "loaf", "new"), span(0, 9, "loaf rose", "new", "phrase")],
    ];
    expect(
      videoWords([cue("Loaf rose.")], overlapping, {}).map((r) => [
        r.key,
        r.count,
      ]),
    ).toEqual([["loaf", 1]]);
  });

  it("is empty before anything is classified", () => {
    expect(
      videoWords(
        CUES,
        CUES.map(() => null),
        {},
      ),
    ).toEqual([]);
  });
});

describe("filterCounts and filterRows", () => {
  it("counts the rows of each filter", () => {
    expect(filterCounts(rows())).toEqual({
      all: 5,
      new: 3,
      learning: 1,
      known: 1,
    });
  });

  it("keeps the rows of a category, or all of them", () => {
    const keys = (filter: Parameters<typeof filterRows>[1]) =>
      filterRows(rows(), filter).map((row) => `${row.key}/${row.kind}`);
    expect(keys("all")).toEqual([
      "give up/phrase",
      "loaf/word",
      "rise/word",
      "tangy/word",
      "rise/phrase",
    ]);
    expect(keys("new")).toEqual([
      "give up/phrase",
      "tangy/word",
      "rise/phrase",
    ]);
    expect(keys("learning")).toEqual(["loaf/word"]);
    expect(keys("known")).toEqual(["rise/word"]);
  });
});
