import { describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import type { Cue } from "../../core/subtitles/types";
import type { TermBrief } from "../../messaging/protocol";
import { filterCounts, filterRows, sortRows } from "../words/words";
import type { SubtitleLine } from "../../core/subtitles/cues";
import { placeOf, videoWords, type VideoPlace, type VideoWord } from "./words";

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

/** Places in cards without lines: each at its card's start. */
const on = (...cards: number[]): VideoPlace[] =>
  cards.map((card) => ({ card, line: -1, startMs: 0 }));

const rows = () => videoWords(CUES, [], SPANS, SUMMARIES);

describe("videoWords", () => {
  it("lists each word and phrase once, in order of first appearance, with its count and places", () => {
    expect(rows()).toEqual<VideoWord[]>([
      {
        key: "give up",
        kind: "phrase",
        head: "Give up",
        category: "new",
        count: 2,
        places: on(0, 3),
      },
      {
        key: "loaf",
        kind: "word",
        head: "loaf",
        category: "learning",
        count: 3,
        places: on(0, 1),
      },
      {
        key: "rise",
        kind: "word",
        head: "rise",
        category: "known",
        count: 1,
        places: on(1),
      },
      {
        key: "tangy",
        kind: "word",
        head: "tangy",
        category: "new",
        count: 1,
        places: on(3),
      },
      {
        key: "rise",
        kind: "phrase",
        head: "Rise again",
        category: "new",
        count: 1,
        places: on(4),
      },
    ]);
  });

  it("leaves out ignored words, words known only by their level, and known words not answered yet", () => {
    const keys = rows().map((row) => row.key);
    for (const key of ["3", "i", "the", "on"]) expect(keys).not.toContain(key);
  });

  it("lists a level-known word once it is saved as known", () => {
    const saved = videoWords(CUES, [], SPANS, {
      ...SUMMARIES,
      the: { status: "known" },
    });
    expect(saved.find((row) => row.key === "the")).toEqual({
      key: "the",
      kind: "word",
      head: "the",
      category: "known",
      count: 2,
      places: on(0, 1),
    });
  });

  it("counts only the spans the transcript shows", () => {
    const overlapping: (Span[] | null)[] = [
      [span(0, 4, "loaf", "new"), span(0, 9, "loaf rose", "new", "phrase")],
    ];
    expect(
      videoWords([cue("Loaf rose.")], [], overlapping, {}).map((r) => [
        r.key,
        r.count,
      ]),
    ).toEqual([["loaf", 1]]);
  });

  it("counts a phrase with a gap once, headed by its whole match", () => {
    const text = "Figure it out, then figure\nthem out.";
    const whole = (start: number, end: number) => ({ start, end });
    const part = (
      start: number,
      end: number,
      index: number,
      match: { start: number; end: number },
    ): Span => ({
      ...span(start, end, "figure out", "learning", "phrase"),
      part: { index, count: 2, ...match },
    });
    const first = whole(0, 13);
    const second = whole(20, 35);
    const spans: (Span[] | null)[] = [
      [
        part(0, 6, 0, first),
        span(7, 9, "it", "new"),
        part(10, 13, 1, first),
        part(20, 26, 0, second),
        span(27, 31, "them", "new"),
        part(32, 35, 1, second),
      ],
    ];
    expect(videoWords([cue(text)], [], spans, {})).toEqual<VideoWord[]>([
      {
        key: "figure out",
        kind: "phrase",
        head: "Figure it out",
        category: "learning",
        count: 2,
        places: on(0),
      },
      {
        key: "it",
        kind: "word",
        head: "it",
        category: "new",
        count: 1,
        places: on(0),
      },
      {
        key: "them",
        kind: "word",
        head: "them",
        category: "new",
        count: 1,
        places: on(0),
      },
    ]);
  });

  it("is empty before anything is classified", () => {
    expect(
      videoWords(
        CUES,
        [],
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

describe("sortRows", () => {
  const row = (head: string, count: number) => ({ head, count });
  const ROWS = [
    row("figure out", 2),
    row("Dough", 7),
    row("bunch", 1),
    row("proof", 3),
    row("éclair", 3),
    row("channel", 1),
  ];
  const heads = (sort: Parameters<typeof sortRows>[1], lang = "en") =>
    sortRows(ROWS, sort, lang).map((r) => r.head);

  it("keeps first appearance for In order", () => {
    expect(heads("order")).toEqual(ROWS.map((r) => r.head));
  });

  it("sorts A–Z by head in the learning language, ignoring case and accents first", () => {
    expect(heads("az")).toEqual([
      "bunch",
      "channel",
      "Dough",
      "éclair",
      "figure out",
      "proof",
    ]);
    // Swedish puts "ä" after "z"; English next to "a".
    const words = [row("zon", 1), row("äpple", 1), row("apa", 1)];
    expect(sortRows(words, "az", "sv").map((r) => r.head)).toEqual([
      "apa",
      "zon",
      "äpple",
    ]);
    expect(sortRows(words, "az", "en").map((r) => r.head)).toEqual([
      "apa",
      "äpple",
      "zon",
    ]);
  });

  it("puts the most seen first, ties in order of first appearance", () => {
    expect(heads("count")).toEqual([
      "Dough",
      "proof",
      "éclair",
      "figure out",
      "bunch",
      "channel",
    ]);
  });

  it("leaves the rows it is given as they are", () => {
    const before = ROWS.map((r) => r.head);
    sortRows(ROWS, "az", "en");
    expect(ROWS.map((r) => r.head)).toEqual(before);
  });
});

describe("places", () => {
  it("lists each card a term shows in once, in order, with the count of every occurrence", () => {
    const spans: (Span[] | null)[] = [
      [span(0, 4, "loaf", "new"), span(5, 9, "loaf", "new")],
      null,
      [span(0, 4, "loaf", "new")],
    ];
    const [loaf] = videoWords(
      [cue("loaf loaf"), cue("…"), cue("loaf")],
      [],
      spans,
      {},
    );
    expect(loaf).toMatchObject({ count: 3, places: on(0, 2) });
  });
});

describe("places in subtitle lines", () => {
  // One long card said as two lines, then a card of one line.
  const text = "It is an open question whether he will succeed in turning";
  const second = text.indexOf("whether");
  const cues: Cue[] = [
    { startMs: 296_000, endMs: 301_000, text },
    { startMs: 301_000, endMs: 303_000, text: "Argentina around." },
  ];
  const lines: SubtitleLine[] = [
    { startMs: 296_000, endMs: 298_500, card: 0, start: 0, end: second - 1 },
    {
      startMs: 298_500,
      endMs: 301_000,
      card: 0,
      start: second,
      end: text.length,
    },
    { startMs: 301_000, endMs: 303_000, card: 1, start: 0, end: 17 },
  ];
  const at = (word: string) => text.indexOf(word);

  it("puts a term in the line it starts in, at that line's start", () => {
    expect(placeOf(cues, lines, 0, at("open"))).toEqual({
      card: 0,
      line: 0,
      startMs: 296_000,
    });
    expect(placeOf(cues, lines, 0, at("in turning"))).toEqual({
      card: 0,
      line: 1,
      startMs: 298_500,
    });
    expect(placeOf(cues, lines, 1, 0)).toEqual({
      card: 1,
      line: 2,
      startMs: 301_000,
    });
  });

  it("falls back to the card's start where the card has no lines", () => {
    expect(placeOf(cues, [], 1, 5)).toEqual({
      card: 1,
      line: -1,
      startMs: 301_000,
    });
  });

  it("lists a term once per line: twice in a line is one place, two lines of a card two", () => {
    const spans: Span[][] = [
      [
        span(at("is"), at("is") + 2, "be", "new"),
        span(at("will"), at("will") + 4, "will", "new"),
        span(
          at("in turning"),
          at("in turning") + 10,
          "in turn",
          "new",
          "phrase",
        ),
        span(at("an"), at("an") + 2, "an", "new"),
        span(at("whether"), at("whether") + 7, "whether", "new"),
        span(at("he"), at("he") + 2, "he", "new"),
        span(at("succeed"), at("succeed") + 7, "be", "new"),
      ],
      [span(0, 9, "argentina", "new")],
    ];
    const words = videoWords(cues, lines, spans, {});
    const placesOf = (key: string) =>
      words.find((word) => word.key === key)!.places.map((p) => p.startMs);
    expect(placesOf("in turn")).toEqual([298_500]);
    expect(placesOf("be")).toEqual([296_000, 298_500]);
    expect(placesOf("argentina")).toEqual([301_000]);
  });
});
