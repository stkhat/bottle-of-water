import { describe, expect, it } from "vitest";
import { matchSense, meaningKey, orderMeanings } from "./meanings";

describe("meaningKey", () => {
  it("is the base64url SHA-256 of the term, where it came from and the text", async () => {
    const key = await meaningKey("en:fold", "dictionary", "折り目、ひだ");
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await meaningKey("en:fold", "dictionary", "折り目、ひだ")).toBe(key);
  });

  it("differs for another term, origin or text", async () => {
    const keys = await Promise.all([
      meaningKey("en:fold", "dictionary", "折り目"),
      meaningKey("en:folds", "dictionary", "折り目"),
      meaningKey("en:fold", "ai", "折り目"),
      meaningKey("en:fold", "dictionary", "折り目 "),
    ]);
    expect(new Set(keys).size).toBe(4);
  });

  it("keeps the parts apart: no separator can make two of them one", async () => {
    expect(await meaningKey("en:a", "ai", "b c")).not.toBe(
      await meaningKey("en:a b", "ai", "c"),
    );
  });
});

describe("matchSense", () => {
  const senses = [
    { pos: "noun", text: "折り目、ひだ" },
    { pos: "noun", text: "折り重ねること、折り畳み" },
    { pos: "verb", text: "…を折り畳む、折り重ねる" },
    { text: "囲い" },
  ];

  it("finds the sense with the same part of speech and pack text", () => {
    expect(
      matchSense({ pos: "verb", text: "…を折り畳む、折り重ねる" }, senses),
    ).toBe(2);
    expect(matchSense({ text: "囲い" }, senses)).toBe(3);
  });

  it("finds it again after a pack update reorders the senses", () => {
    const reordered = [senses[2]!, senses[0]!, senses[3]!, senses[1]!];
    expect(
      matchSense({ pos: "noun", text: "折り重ねること、折り畳み" }, reordered),
    ).toBe(3);
  });

  it("matches nothing with another part of speech or text", () => {
    expect(matchSense({ pos: "verb", text: "折り目、ひだ" }, senses)).toBe(-1);
    expect(matchSense({ pos: "noun", text: "折り目" }, senses)).toBe(-1);
    expect(matchSense({ pos: "noun", text: "囲い" }, senses)).toBe(-1);
  });
});

describe("orderMeanings", () => {
  const m = (key: string, count: number, lastAt: number) => ({
    key,
    count,
    lastAt,
  });

  it("puts the meaning chosen here first, then the most chosen, then the newest", () => {
    const meanings = [m("a", 1, 10), m("b", 3, 5), m("c", 1, 20), m("d", 2, 1)];
    expect(orderMeanings(meanings).map((x) => x.key)).toEqual([
      "b",
      "d",
      "c",
      "a",
    ]);
    expect(orderMeanings(meanings, "a").map((x) => x.key)).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
  });

  it("leaves the list it was given as it was", () => {
    const meanings = [m("a", 1, 1), m("b", 2, 1)];
    orderMeanings(meanings);
    expect(meanings.map((x) => x.key)).toEqual(["a", "b"]);
  });
});
