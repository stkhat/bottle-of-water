import { describe, expect, it } from "vitest";
import { createEnJaDictionary } from "./dictionary";

const dictionary = createEnJaDictionary({
  dict: {
    dough: [
      "練り粉,こね粉,生パン",
      ["練り粉,こね粉,生パン", "《おもに米俗》金銭,ぜに"],
    ],
    "figure out": ["…を理解する", ["…を理解する", "…を計算する"]],
    tangy: ["ぴりっとする", ["ぴりっとする,刺激的な"]],
  },
  pos: { dough: ["noun"], tangy: ["adjective"] },
  ipa: { dough: "/doʊ/", figure: "/ˈfɪɡjɚ/", out: "/aʊt/" },
});

describe("createEnJaDictionary", () => {
  it("translates from English to Japanese", () => {
    expect(dictionary.from).toBe("en");
    expect(dictionary.to).toBe("ja");
  });

  it("gives a word's short translation", () => {
    expect(dictionary.short("dough")).toBe("練り粉,こね粉,生パン");
    expect(dictionary.short("Dough")).toBe("練り粉,こね粉,生パン");
  });

  it("gives a word's entry with IPA and labeled senses", () => {
    expect(dictionary.entry("dough")).toEqual({
      head: "dough",
      kind: "word",
      ipa: "/doʊ/",
      short: "練り粉,こね粉,生パン",
      senses: [
        { pos: "noun", text: "練り粉,こね粉,生パン" },
        { pos: "noun", text: "《おもに米俗》金銭,ぜに" },
      ],
    });
  });

  it("gives a phrase's entry with its words' IPA joined", () => {
    expect(dictionary.entry(" Figure  out ")).toEqual({
      head: "figure out",
      kind: "phrase",
      ipa: "/ˈfɪɡjɚ aʊt/",
      short: "…を理解する",
      senses: [{ text: "…を理解する" }, { text: "…を計算する" }],
    });
  });

  it("leaves out the IPA when there is none", () => {
    expect(dictionary.entry("tangy")).not.toHaveProperty("ipa");
  });

  it("gives undefined for an unknown term", () => {
    expect(dictionary.short("zzyzx")).toBeUndefined();
    expect(dictionary.entry("zzyzx")).toBeUndefined();
    expect(dictionary.entry("figure it out")).toBeUndefined();
  });
});
