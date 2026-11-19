import { describe, expect, it } from "vitest";
import { createLanguagePack } from "./language-pack";
import { ENGLISH_RULES } from "../phrases/en";
import { SPANISH_RULES } from "../phrases/es";
import { FRENCH_RULES } from "../phrases/fr";

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
  contractions: { "i'm": ["I am"], "it's": ["it is", "it has"] },
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

  it("says what a contraction is short for, by its key", () => {
    expect(pack.expansions("i'm")).toEqual(["I am"]);
    expect(pack.expansions("it's")).toEqual(["it is", "it has"]);
    expect(pack.expansions("loaf")).toEqual([]);
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

  it("gives the same base forms however often and among however many words it is asked", () => {
    expect(pack.lemmas("Better")).toEqual(["better", "good", "well"]);
    for (let i = 0; i < 25_000; i++) pack.lemmas(`word${i}`);
    expect(pack.lemmas("Better")).toEqual(["better", "good", "well"]);
    expect(pack.lemmas("loaves")).toEqual(["loaf"]);
    expect(pack.lemmas("Loaves")).toEqual(["loaf"]);
  });

  it("ranks base forms by frequency, Infinity when not listed", () => {
    expect(pack.rank("the")).toBe(1);
    expect(pack.rank("figure")).toBe(4);
    expect(pack.rank("loaf")).toBe(Infinity);
  });

  it("reads a contraction of known words as a word, ranked as its rarest word", () => {
    const withClitics = createLanguagePack("en", {
      lemmas: { did: "do" },
      freq: ["the", "what", "do", "you"],
      ipa: {},
      vocab: new Set(["the", "what", "do", "you", "loaf"]),
      patterns: { detect: [], more: [], gap: [] },
      contractions: {
        "what'd": ["what did", "what would"],
        "you'd": ["you had"],
        "loaf'd": ["loaf would"],
      },
    });
    expect(withClitics.lemmas("What’d")).toEqual(["what'd"]);
    expect(withClitics.rank("what'd")).toBe(3);
    expect(withClitics.rank("loaf'd")).toBe(Infinity);
    expect(withClitics.lemmas("whatever'd")).toEqual([]);
  });

  it("ranks an abbreviation the list does not rank by its letters", () => {
    const dotted = createLanguagePack("en", {
      lemmas: {},
      freq: ["the", "us"],
      ipa: {},
      vocab: new Set(["the", "us", "u.s.", "e.g."]),
      patterns: { detect: [], more: [], gap: [] },
      capitals: ["U.S."],
    });
    expect(dotted.lemmas("U.S")).toEqual(["u.s."]);
    expect(dotted.lemmas("e.g")).toEqual(["e.g."]);
    expect(dotted.capitalOnly("u.s.")).toBe(false);
    expect(dotted.rank("u.s.")).toBe(2);
    expect(dotted.rank("e.g.")).toBe(Infinity);
  });

  it("knows a capital-only word only as it is written", () => {
    const withCapitals = createLanguagePack("en", {
      lemmas: { aeds: "aed" },
      freq: ["the"],
      ipa: {},
      vocab: new Set(["the"]),
      patterns: { detect: [], more: [], gap: [] },
      capitals: ["AED", "AI", "Tokyo", "iPhone"],
    });
    expect(withCapitals.lemmas("AI")).toEqual(["ai"]);
    expect(withCapitals.lemmas("AI’s")).toEqual(["ai"]);
    expect(withCapitals.lemmas("ai")).toEqual([]);
    expect(withCapitals.lemmas("Ai")).toEqual([]);
    expect(withCapitals.lemmas("Tokyo")).toEqual(["tokyo"]);
    expect(withCapitals.lemmas("tokyo")).toEqual([]);
    expect(withCapitals.lemmas("iPhone")).toEqual(["iphone"]);
    expect(withCapitals.lemmas("Iphone")).toEqual([]);
    expect(withCapitals.lemmas("AEDs")).toEqual(["aed"]);
    expect(withCapitals.lemmas("aeds")).toEqual([]);
    expect(withCapitals.capitalOnly("ai")).toBe(true);
    expect(withCapitals.capitalOnly("the")).toBe(false);
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

  it("has no contractions without their table", () => {
    expect(es.expansions("del")).toEqual([]);
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

  it("spells a word capitals left without its accent the one known way", () => {
    const accented = createLanguagePack("es", {
      lemmas: { están: "estar", policía: "policía" },
      freq: [],
      ipa: {},
      vocab: new Set(["estar", "policía", "inglés", "íngles", "berlín"]),
      patterns: { detect: [], more: [], gap: [] },
      names: { berlín: "p" },
    });
    expect(accented.accented("estan")).toBe("están");
    expect(accented.accented("policia")).toBe("policía");
    // A name ("berlín") is left alone, and so is a word with two known spellings.
    expect(accented.accented("berlin")).toBeUndefined();
    expect(accented.accented("ingles")).toBeUndefined();
    expect(pack.accented("estan")).toBeUndefined();
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

describe("createLanguagePack (fr)", () => {
  const fr = createLanguagePack("fr", {
    lemmas: [{ "l'": "le", été: ["être", "aller"], élèves: "élève" }],
    freq: ["de", "le", "être"],
    ipa: {},
    vocab: new Set([
      ...["de", "le", "être", "été", "aller", "élève", "homme"],
      ...["côte", "côté"],
    ]),
    patterns: { detect: [], more: [], gap: [] },
  });
  const words = (text: string) =>
    fr
      .tokenize(text)
      .filter((token) => token.isWord)
      .map((token) => token.text);

  it("has French's phrase rules and lists a form's likelier base first", () => {
    expect(fr.rules).toBe(FRENCH_RULES);
    expect(fr.basesInOrder).toBe(true);
    expect(fr.lemmas("été")).toEqual(["été", "être", "aller"]);
  });

  it("splits an elided word off the next one, unless the whole is a word", () => {
    expect(words("L'homme a été")).toEqual(["L'", "homme", "a", "été"]);
    const withWhole = createLanguagePack("fr", {
      lemmas: {},
      freq: [],
      ipa: {},
      vocab: new Set(["d'accord", "accord"]),
      patterns: { detect: [], more: [], gap: [] },
    });
    expect(
      withWhole
        .tokenize("D’accord")
        .filter((token) => token.isWord)
        .map((token) => token.text),
    ).toEqual(["D’accord"]);
  });

  it("spells a word capitals left without its accents, several a word", () => {
    expect(fr.accented("ete")).toBe("été");
    expect(fr.accented("eleves")).toBe("élèves");
    expect(fr.accented("etre")).toBe("être");
    // Two known spellings: left alone.
    expect(fr.accented("cote")).toBeUndefined();
  });
});
