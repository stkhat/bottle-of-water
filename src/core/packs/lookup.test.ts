import { describe, expect, it } from "vitest";
import { lookup } from "./lookup";
import type { DictPack } from "./types";

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
  quiet: ["静かな", ["静かな,音のしない", "静けさ"]],
  "figure of speech": ["比喩", ["比喩(ひゆ)[的表現],言葉のあや"]],
};
const pos = {
  dough: ["noun"],
  ferment: ["noun", "verb"],
  fast: ["adjective", "adverb", "verb", "noun"],
  quiet: ["adjective", "noun"],
};

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
  it("infers verbs from the gloss ending or …を", () => {
    expect(lookup("ferment", dict, pos)?.senses).toEqual([
      { text: "発酵体" },
      { pos: "verb", text: "…を発酵させる" },
      { pos: "verb", text: "発酵する" },
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
  it("infers adjectives and adverbs, accepting only the word's parts of speech", () => {
    expect(lookup("fast", dict, pos)?.senses.map((s) => s.pos)).toEqual([
      "adjective",
      "adverb",
      "verb",
      undefined,
    ]);
  });
  it("gives no label when the inferred part of speech is not the word's", () => {
    expect(lookup("quiet", dict, { quiet: ["noun", "verb"] })?.senses).toEqual([
      { text: "静かな,音のしない" },
      { text: "静けさ" },
    ]);
    expect(lookup("quiet", dict, pos)?.senses[0]?.pos).toBe("adjective");
  });
  it("gives undefined for a term not in the dictionary", () => {
    expect(lookup("zzyzx", dict, pos)).toBeUndefined();
  });
});
