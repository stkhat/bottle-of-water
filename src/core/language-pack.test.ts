import { describe, expect, it } from "vitest";
import { createEnglishPack } from "./language-pack";

const pack = createEnglishPack({
  lemmas: { loaves: "loaf", figured: "figure", better: ["good", "well"] },
  freq: ["the", "you", "good", "figure"],
  ipa: { figure: "/ˈfɪɡjɚ/", out: "/aʊt/" },
  vocab: new Set([
    "the",
    "you",
    "good",
    "well",
    "better",
    "figure",
    "out",
    "loaf",
  ]),
});

describe("createEnglishPack", () => {
  it("is the English pack", () => {
    expect(pack.lang).toBe("en");
  });

  it("gives the base forms of a word", () => {
    expect(pack.lemmas("Loaves")).toEqual(["loaf"]);
    expect(pack.lemmas("figured")).toEqual(["figure"]);
    expect(pack.lemmas("better")).toEqual(["better", "good", "well"]);
  });

  it("gives no base forms for an unknown word", () => {
    expect(pack.lemmas("zzyzx")).toEqual([]);
  });

  it("ranks base forms by frequency, Infinity when not listed", () => {
    expect(pack.rank("the")).toBe(1);
    expect(pack.rank("figure")).toBe(4);
    expect(pack.rank("loaf")).toBe(Infinity);
  });

  it("gives the IPA of words and phrases", () => {
    expect(pack.ipa("figure")).toBe("/ˈfɪɡjɚ/");
    expect(pack.ipa("figure out")).toBe("/ˈfɪɡjɚ aʊt/");
    expect(pack.ipa("loaf")).toBeUndefined();
  });

  it("tokenizes text in English", () => {
    expect(pack.tokenize("you’re").map((t) => t.text)).toEqual(["you’re"]);
  });
});
