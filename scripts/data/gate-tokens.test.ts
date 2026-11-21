import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readPack } from "./common.ts";
import { PACKS } from "./formats.ts";
import {
  type RunnerRow,
  stringifyCounts,
  tokenCounts,
  tokensPath,
} from "./gate-tokens.ts";

const row = (start: number, key: string, more: Partial<RunnerRow> = {}) => ({
  doc: "yt:a",
  unit: 0,
  start,
  kind: "word",
  key,
  category: "new",
  hoverKind: "dict",
  ...more,
});

describe("tokenCounts", () => {
  it("counts the shown words by key, names and hidden hovers apart", () => {
    expect(
      tokenCounts([
        row(0, "run"),
        row(4, "ran", { hoverKind: "translated" }),
        row(8, "run"),
        row(12, "japan", { capital: true }),
        row(18, "um", { category: "ignored", hoverKind: "none" }),
        row(21, "zzz", { hoverKind: "none" }),
        row(25, "look up", { kind: "phrase" }),
        row(0, "run"),
      ]),
    ).toEqual({ ran: 1, run: 2 });
  });
  it("sorts the keys by code unit", () => {
    expect(
      Object.keys(tokenCounts([row(0, "b"), row(1, "a"), row(2, "B")])),
    ).toEqual(["B", "a", "b"]);
  });
});

describe("stringifyCounts", () => {
  it("writes one key per line, as JSON", () => {
    const text = stringifyCounts({ a: 1, "don't": 2 });
    expect(text).toBe('{\n"a":1,\n"don\'t":2\n}\n');
    expect(JSON.parse(text)).toEqual({ a: 1, "don't": 2 });
  });
});

describe("the committed English counts", () => {
  const counts = JSON.parse(readFileSync(tokensPath("en"), "utf8")) as Record<
    string,
    number
  >;
  it("hold round 4's corpus: 143,211 tokens", () => {
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(143_211);
  });
  it("are lower-case word keys the English pack knows", () => {
    const vocab = new Set(readPack<string[]>("vocab.json", PACKS.en.dir));
    const lemmas = readPack<object>("lemmas.json", PACKS.en.dir);
    const contractions = readPack<object>("contractions.json", PACKS.en.dir);
    const unknown = Object.keys(counts).filter(
      (key) =>
        !vocab.has(key) &&
        !Object.hasOwn(lemmas, key) &&
        !Object.hasOwn(contractions, key),
    );
    expect(Object.keys(counts).every((key) => key === key.toLowerCase())).toBe(
      true,
    );
    expect(unknown.length).toBeLessThan(Object.keys(counts).length / 100);
  });
});
