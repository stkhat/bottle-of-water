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
  // Japanese translations of phrases EJDict lacks.
  phrases: {
    "figure out": ["（訳されない）", ["（訳されない）"]],
    "give up": ["諦める", ["諦める", "『やめる』"]],
  },
  // English definitions of phrases neither has.
  defs: {
    "give up": ["(unused)", [["verb", "(unused)"]]],
    "from scratch": [
      "From the beginning",
      [
        ["prepositional phrase", "From the beginning, from zero."],
        ["adverb", "Without using anything already made."],
      ],
    ],
  },
  pos: { dough: ["noun"], tangy: ["adjective"], give: ["verb"] },
  ipa: {
    dough: "/doʊ/",
    figure: "/ˈfɪɡjɚ/",
    out: "/aʊt/",
    give: "/ɡɪv/",
    up: "/ʌp/",
    from: "/fɹʌm/",
    scratch: "/skɹætʃ/",
  },
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

  it("takes a phrase EJDict lacks from the Japanese translations, without labels", () => {
    expect(dictionary.short("Give up")).toBe("諦める");
    expect(dictionary.entry("give up")).toEqual({
      head: "give up",
      kind: "phrase",
      ipa: "/ɡɪv ʌp/",
      short: "諦める",
      senses: [{ text: "諦める" }, { text: "やめる" }],
    });
  });

  it("takes a phrase neither has from the English definitions, marked as English", () => {
    expect(dictionary.short("from scratch")).toBe("From the beginning");
    expect(dictionary.entry("from scratch")).toEqual({
      head: "from scratch",
      kind: "phrase",
      ipa: "/fɹʌm skɹætʃ/",
      short: "From the beginning",
      glossLang: "en",
      senses: [
        { pos: "prepositional phrase", text: "From the beginning, from zero." },
        { pos: "adverb", text: "Without using anything already made." },
      ],
    });
  });

  it("marks only English definitions with their language", () => {
    expect(dictionary.entry("dough")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("figure out")).not.toHaveProperty("glossLang");
    expect(dictionary.entry("give up")).not.toHaveProperty("glossLang");
  });

  it("leaves out the IPA when there is none", () => {
    expect(dictionary.entry("tangy")).not.toHaveProperty("ipa");
  });

  it("gives undefined for an unknown term", () => {
    expect(dictionary.short("zzyzx")).toBeUndefined();
    expect(dictionary.entry("zzyzx")).toBeUndefined();
    expect(dictionary.entry("figure it out")).toBeUndefined();
    expect(dictionary.short("figure it out")).toBeUndefined();
  });
});
