import { describe, expect, it } from "vitest";
import { lookup } from "./lookup";
import type { DictPack } from "../packs/types";

const dict: DictPack = {
  dough: [
    "練り粉,こね粉,生パン",
    ["練り粉,こね粉,生パン", "《おもに米俗》金銭,ぜに"],
  ],
  ferment: [
    "発酵体",
    ["〈C〉発酵体", "…を発酵させる", "発酵する", "〈U〉発酵"],
  ],
  fast: ["速い", ["『速い』,急速な", "『速く』,急速に", "断食する", "断食"]],
  "figure of speech": ["比喩", ["比喩(ひゆ)[的表現],言葉のあや"]],
};
const pos = {
  dough: ["noun"],
  ferment: ["noun", "verb"],
  fast: ["adjective", "adverb", "verb", "noun"],
};
// As the data build labels them (en-ja/pos.json).
const labels = { ferment: "n v v n", fast: "a* r* v n~" };

describe("lookup", () => {
  it("gives the short gloss and the senses", () => {
    expect(lookup("figure of speech", dict, pos)).toEqual({
      short: "比喩",
      senses: [{ text: "比喩(ひゆ)[的表現],言葉のあや" }],
    });
  });
  it("lowercases the term", () => {
    expect(lookup("Dough", dict, pos)?.short).toBe("練り粉,こね粉,生パン");
  });
  it("gives every sense the only part of speech", () => {
    expect(lookup("dough", dict, pos)?.senses).toEqual([
      { pos: "noun", text: "練り粉,こね粉,生パン" },
      { pos: "noun", text: "《おもに米俗》金銭,ぜに" },
    ]);
  });
  it("labels the senses of a word with several parts of speech as the data build did", () => {
    expect(lookup("ferment", dict, pos, labels)?.senses).toEqual([
      { pos: "noun", text: "発酵体" },
      { pos: "verb", text: "…を発酵させる" },
      { pos: "verb", text: "発酵する" },
      { pos: "noun", text: "発酵" },
    ]);
    expect(lookup("fast", dict, pos, labels)?.senses).toEqual([
      { pos: "adjective", core: true, text: "速い,急速な" },
      { pos: "adverb", core: true, text: "速く,急速に" },
      { pos: "verb", text: "断食する" },
      { pos: "noun", posBy: "weak", text: "断食" },
    ]);
  });
  it("reads nothing from the glosses themselves: no labels, no parts of speech", () => {
    expect(lookup("ferment", dict, pos)?.senses).toEqual([
      { text: "発酵体" },
      { text: "…を発酵させる" },
      { text: "発酵する" },
      { text: "発酵" },
    ]);
  });
  it("removes 『』 emphasis and 〈C〉/〈U〉 markers from the shown text", () => {
    expect(lookup("fast", dict, pos)?.senses.map((s) => s.text)).toEqual([
      "速い,急速な",
      "速く,急速に",
      "断食する",
      "断食",
    ]);
  });
  it("gives undefined for a term not in the dictionary", () => {
    expect(lookup("zzyzx", dict, pos)).toBeUndefined();
  });
});
