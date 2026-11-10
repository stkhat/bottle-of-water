import { describe, expect, it } from "vitest";
import { createEnglishPack, createLanguagePack } from "./language-pack";

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
  phrases: new Set(["figure out"]),
});

describe("createEnglishPack", () => {
  it("is the English pack", () => {
    expect(pack.lang).toBe("en");
  });

  it("has the dictionary phrases", () => {
    expect(pack.phrases.has("figure out")).toBe(true);
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

describe("createLanguagePack", () => {
  const es = createLanguagePack("es", {
    lemmas: { comiendo: "comer", casas: ["casa", "casar"], para: "parar" },
    freq: ["de", "para", "comer"],
    ipa: { a: "/a/", comer: "/koˈmeɾ/", escondidas: "/eskonˈdidas/" },
    vocab: new Set(["a", "casa", "casar", "comer", "de", "escondidas"]),
    phrases: new Set(["a escondidas"]),
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

  it("has the dictionary phrases", () => {
    expect([...es.phrases]).toEqual(["a escondidas"]);
  });
});
