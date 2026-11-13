import { describe, expect, it } from "vitest";
import { createLanguagePack } from "./language-pack";
import { ENGLISH_RULES } from "../phrases/en";
import { SPANISH_RULES } from "../phrases/es";

const pack = createLanguagePack("en", {
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
  patterns: {
    detect: ["figure out"],
    more: ["make up one's mind"],
    gap: ["figure out"],
    pos: { detect: "v", more: "-" },
    intransitive: ["figure out"],
  },
});

describe("createLanguagePack (en)", () => {
  it("is the English pack", () => {
    expect(pack.lang).toBe("en");
  });

  it("has the dictionary's phrase patterns, and the ones to detect as a set", () => {
    expect(pack.patterns.more).toEqual(["make up one's mind"]);
    expect([...pack.phrases]).toEqual(["figure out"]);
  });

  it("has the patterns' parts of speech and transitivity", () => {
    expect(pack.phrasePos("figure out")).toEqual(["verb"]);
    expect(pack.phrasePos("make up one's mind")).toEqual([]);
    expect(pack.intransitive("figure out")).toBe(true);
    expect(pack.intransitive("make up one's mind")).toBe(false);
  });

  it("has the English phrase rules", () => {
    expect(pack.rules).toBe(ENGLISH_RULES);
  });

  it("has one phrase matcher, over its patterns and base forms", () => {
    expect(pack.matcher).toBe(pack.matcher);
    const input = pack.matcher.prepare(pack.tokenize("you figured it out"));
    expect(
      pack.matcher.longestAt(input, 1, "saved", new Set(["figure out"])),
    ).toEqual({ key: "figure out", words: [1, 3] });
    expect(pack.matcher.longestAt(input, 1, "detect")).toBeUndefined();
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
    expect(pack.ipa("figure")).toBe("/ˈfɪɡjər/");
    expect(pack.ipa("figure out")).toBe("/ˈfɪɡjər aʊt/");
    expect(pack.ipa("loaf")).toBeUndefined();
  });

  it("tokenizes text in English", () => {
    expect(pack.tokenize("you’re").map((t) => t.text)).toEqual(["you’re"]);
  });
});

describe("createLanguagePack", () => {
  const es = createLanguagePack("es", {
    lemmas: { comiendo: "comer", casas: ["casa", "casar"], para: "parar" },
    freq: ["de", "para", "comer"],
    ipa: { a: "/a/", comer: "/koˈmeɾ/", escondidas: "/eskonˈdidas/" },
    vocab: new Set(["a", "casa", "casar", "comer", "de", "escondidas"]),
    patterns: { detect: ["a escondidas"], more: [], gap: [] },
  });

  it("is the pack of the language it is given", () => {
    expect(es.lang).toBe("es");
  });

  it("tokenizes text in that language", () => {
    expect(
      es
        .tokenize("¿Qué comiste? ¡Mañana, señor!")
        .filter((t) => t.isWord)
        .map((t) => t.text),
    ).toEqual(["Qué", "comiste", "Mañana", "señor"]);
  });

  it("gives the base forms of a word, the word itself first when it is in the vocabulary", () => {
    expect(es.lemmas("Comiendo")).toEqual(["comer"]);
    expect(es.lemmas("casas")).toEqual(["casa", "casar"]);
    expect(es.lemmas("casa")).toEqual(["casa"]);
    expect(es.lemmas("para")).toEqual(["parar"]);
    expect(es.lemmas("comiste")).toEqual([]);
  });

  it("ranks base forms by frequency", () => {
    expect(es.rank("comer")).toBe(3);
    expect(es.rank("Comer")).toBe(3);
    expect(es.rank("casa")).toBe(Infinity);
  });

  it("gives the IPA of words and phrases", () => {
    expect(es.ipa("comer")).toBe("/koˈmeɾ/");
    expect(es.ipa("a escondidas")).toBe("/a eskonˈdidas/");
  });

  it("has the dictionary phrases and the language's phrase rules", () => {
    expect([...es.phrases]).toEqual(["a escondidas"]);
    expect(es.rules).toBe(SPANISH_RULES);
  });

  it("has no slots or gaps for a language without phrase rules", () => {
    const xx = createLanguagePack("xx", {
      lemmas: {},
      freq: [],
      ipa: {},
      vocab: new Set(),
      patterns: { detect: [], more: [], gap: [] },
    });
    expect(xx.rules).toEqual({ slots: new Map(), maxGap: 0 });
  });
});
