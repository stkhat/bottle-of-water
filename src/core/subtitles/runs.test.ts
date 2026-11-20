import { describe, expect, it } from "vitest";
import type { Span } from "../classify";
import { cardRuns, runsOn, splitRun } from "./runs";

const word = (start: number, end: number, key: string): Span => ({
  start,
  end,
  key,
  kind: "word",
  category: "new",
});
const phrase = (start: number, end: number, key: string): Span => ({
  start,
  end,
  key,
  kind: "phrase",
  category: "new",
});

describe("runsOn", () => {
  it("goes on where a card does not end its sentence", () => {
    expect(runsOn("habría acabado sin", "embargo la guerra")).toBe(true);
    expect(runsOn("I'll call you as", "soon as I can.")).toBe(true);
    expect(runsOn("a long sentence,", "and its end.")).toBe(true);
  });

  it("stops at a sentence's end, a sound label, a speaker or a song", () => {
    expect(runsOn("It ended.", "and this")).toBe(false);
    expect(runsOn("Really?", "yes")).toBe(false);
    expect(runsOn("hola", "[Música]")).toBe(false);
    expect(runsOn("[Music]", "hello")).toBe(false);
    expect(runsOn("lo que pasa [risas]", "y bueno")).toBe(false);
    expect(runsOn("so I said", ">> right")).toBe(false);
    expect(runsOn("Where are you going", "- Home.")).toBe(false);
    expect(runsOn("and then she sang", "♪ la la ♪")).toBe(false);
    expect(runsOn("", "hello")).toBe(false);
  });

  it("reads the line at the break of a card of several lines", () => {
    expect(runsOn("- Where?\n- In the", "kitchen, I think.")).toBe(true);
    expect(runsOn("first line\nsecond.", "next")).toBe(false);
  });
});

describe("cardRuns", () => {
  const texts = [
    "[Música]",
    "habría acabado sin",
    "embargo la guerra",
    "no terminó.",
    "Otra frase.",
  ];

  it("joins the cards whose sentence runs on, with the cards around as context", () => {
    const runs = cardRuns(texts, [0, 1, 2, 3, 4]);
    expect(runs.map((r) => r.text)).toEqual([
      "[Música]",
      "habría acabado sin embargo la guerra no terminó.",
      "Otra frase.",
    ]);
    expect(runs[1]!.cards).toEqual([
      { card: 1, at: 0 },
      { card: 2, at: 19 },
      { card: 3, at: 37 },
    ]);
    expect(runs[1]!.breaks).toEqual([18, 36]);
    expect([...runs[1]!.asked]).toEqual([1, 2, 3]);
  });

  it("reads the neighbours of the cards asked for as context only", () => {
    const [run] = cardRuns(texts, [2]);
    expect(run!.text).toBe("habría acabado sin embargo la guerra no terminó.");
    expect([...run!.asked]).toEqual([2]);
  });

  it("keeps every offset: a card's line breaks become spaces", () => {
    const [run] = cardRuns(["I'll be there as\nsoon as I can."], [0]);
    expect(run!.text).toBe("I'll be there as soon as I can.");
    expect(run!.breaks).toEqual([]);
  });

  it("cuts a long run, each part with its neighbours", () => {
    const many = ["one", "two", "three", "four"];
    const runs = cardRuns(many, [0, 1, 2, 3], 2);
    expect(runs.map((r) => [r.text, [...r.asked]])).toEqual([
      ["one two three", [0, 1]],
      ["two three four", [2, 3]],
    ]);
  });
});

describe("splitRun", () => {
  const texts = ["acabado sin", "embargo la"];
  const [run] = cardRuns(texts, [0, 1]);

  it("gives each card its spans at its own offsets", () => {
    const spans = [
      word(0, 7, "acabar"),
      phrase(8, 19, "sin embargo"),
      word(20, 22, "la"),
    ];
    const out = splitRun(run!, texts, spans);
    expect(out.get(0)).toEqual([
      word(0, 7, "acabar"),
      {
        ...phrase(8, 11, "sin embargo"),
        part: { index: 0, count: 2, start: 8, end: 11, next: true },
      },
    ]);
    expect(out.get(1)).toEqual([
      {
        ...phrase(0, 7, "sin embargo"),
        part: { index: 1, count: 2, start: 0, end: 7, previous: true },
      },
      word(8, 10, "la"),
    ]);
  });

  it("leaves out the context cards and numbers the parts across them", () => {
    const [second] = cardRuns(texts, [1]);
    const out = splitRun(second!, texts, [phrase(8, 19, "sin embargo")]);
    expect([...out.keys()]).toEqual([1]);
    expect(out.get(1)![0]!.part).toEqual({
      index: 1,
      count: 2,
      start: 0,
      end: 7,
      previous: true,
    });
  });

  it("keeps a phrase with a gap inside one card as it was", () => {
    const one = ["figure it out", "now"];
    const [r] = cardRuns(one, [0, 1]);
    const gap = { index: 0, count: 2, start: 0, end: 13 };
    const spans: Span[] = [
      { ...phrase(0, 6, "figure out"), part: gap },
      word(7, 9, "it"),
      { ...phrase(10, 13, "figure out"), part: { ...gap, index: 1 } },
      word(14, 17, "now"),
    ];
    const out = splitRun(r!, one, spans);
    expect(out.get(0)).toEqual(spans.slice(0, 3));
    expect(out.get(1)).toEqual([word(0, 3, "now")]);
  });

  it("clips a phrase with a gap across cards to each card", () => {
    const two = ["figure it", "out now"];
    const [r] = cardRuns(two, [0, 1]);
    const gap = { index: 0, count: 2, start: 0, end: 13 };
    const out = splitRun(r!, two, [
      { ...phrase(0, 6, "figure out"), part: gap },
      word(7, 9, "it"),
      { ...phrase(10, 13, "figure out"), part: { ...gap, index: 1 } },
      word(14, 17, "now"),
    ]);
    expect(out.get(0)![0]!.part).toEqual({
      index: 0,
      count: 2,
      start: 0,
      end: 9,
      next: true,
    });
    expect(out.get(1)![0]).toEqual({
      ...phrase(0, 3, "figure out"),
      part: { index: 1, count: 2, start: 0, end: 3, previous: true },
    });
  });
});
