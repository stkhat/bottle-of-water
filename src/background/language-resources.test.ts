import { describe, expect, it } from "vitest";
import { learningLanguages, nativeLanguages } from "../core/languages";
import type { PackName } from "../core/packs/load";
import { PacksUnavailableError } from "../core/packs/unavailable";
import { createLanguageResources } from "./language-resources";
import { filesRead, stubPackLoader as stubLoader } from "./test-packs";

describe("createLanguageResources", () => {
  it("builds the English pack from the bundled packs, with their vocabulary", async () => {
    const resources = createLanguageResources(stubLoader());
    const pack = await resources.pack("en");
    expect(pack.lang).toBe("en");
    expect(pack.lemmas("loaves")).toEqual(["loaf"]);
    expect(pack.rank("loaf")).toBe(2);
    expect(pack.lemmas("dough")).toEqual([]);
  });

  it("classifies with the English pack", async () => {
    const resources = createLanguageResources(stubLoader());
    const pack = await resources.pack("en");
    const classifier = await resources.classifier("en");
    const spans = classifier.classify(pack.tokenize("the loaves ferments"), {
      terms: new Map([["ferment", "learning"]]),
      knownLevel: 1000,
    });
    expect(spans.map((s) => `${s.key}:${s.category}`)).toEqual([
      "the:known",
      "loaf:known",
      "ferment:learning",
    ]);
  });

  it("detects the dictionary phrases of the English pack", async () => {
    const resources = createLanguageResources(stubLoader());
    const pack = await resources.pack("en");
    const classifier = await resources.classifier("en");
    const spans = classifier.classify(pack.tokenize("the yeast gave up"), {
      terms: new Map(),
      knownLevel: 1000,
    });
    expect(spans.map((s) => `${s.key}:${s.kind}:${s.category}`)).toEqual([
      "the:word:known",
      "yeast:word:new",
      "give up:phrase:new",
    ]);
  });

  it("looks phrases up in EJDict's fallbacks: Japanese translations, then English definitions", async () => {
    const resources = createLanguageResources(stubLoader());
    const dictionary = await resources.dictionary("en", "ja");
    expect(dictionary.entry("give up")).toMatchObject({ short: "諦める" });
    expect(dictionary.entry("figure out")).toMatchObject({
      short: "To come to understand",
      glossLang: "en",
    });
  });

  it("looks words up from English to Japanese", async () => {
    const resources = createLanguageResources(stubLoader());
    const dictionary = await resources.dictionary("en", "ja");
    expect(dictionary.entry("loaf")).toMatchObject({
      head: "loaf",
      ipa: "/loʊf/",
      short: "パンのひと塊",
    });
  });

  it("loads each pack once and builds each resource once, even for overlapping calls", async () => {
    const loadPack = stubLoader();
    const resources = createLanguageResources(loadPack);
    const [a, b] = await Promise.all([
      resources.pack("en"),
      resources.pack("en"),
    ]);
    expect(a).toBe(b);
    expect(await resources.pack("en")).toBe(a);
    const classifier = await resources.classifier("en");
    expect(await resources.classifier("en")).toBe(classifier);
    const dictionary = await resources.dictionary("en", "ja");
    expect(await resources.dictionary("en", "ja")).toBe(dictionary);
    expect(filesRead(loadPack)).toEqual([
      "/packs/en-defs/dict-1.json",
      "/packs/en-defs/index.json",
      "/packs/en-ja/dict-1.json",
      "/packs/en-ja/dict-2.json",
      "/packs/en-ja/index.json",
      "/packs/en-ja/phrases.json",
      "/packs/en/freq.json",
      "/packs/en/ipa.json",
      "/packs/en/lemmas.json",
      "/packs/en/phrases.json",
      "/packs/en/pos.json",
      "/packs/en/vocab.json",
    ]);
  });

  it("builds the English pack and the classifier without the dictionary", async () => {
    const loadPack = stubLoader();
    const resources = createLanguageResources(loadPack);
    await resources.classifier("en");
    expect(filesRead(loadPack)).toEqual([
      "/packs/en/freq.json",
      "/packs/en/ipa.json",
      "/packs/en/lemmas.json",
      "/packs/en/phrases.json",
      "/packs/en/pos.json",
      "/packs/en/vocab.json",
    ]);
  });

  it("loads nothing until a resource is first used", () => {
    const loadPack = stubLoader();
    createLanguageResources(loadPack);
    expect(loadPack.fetchJson).not.toHaveBeenCalled();
  });

  it("tries again after a failed load", async () => {
    const failing = new Set<PackName>(["en", "en-ja", "en-defs"]);
    const loadPack = stubLoader(failing);
    const resources = createLanguageResources(loadPack);
    await expect(resources.pack("en")).rejects.toThrow("could not load en");
    await expect(resources.dictionary("en", "ja")).rejects.toThrow(
      "could not load",
    );
    failing.clear();
    expect((await resources.pack("en")).lang).toBe("en");
    expect((await resources.dictionary("en", "ja")).short("loaf")).toBe(
      "パンのひと塊",
    );
  });

  it("names every missing pack a resource needs", async () => {
    const missing = new Set<PackName>(["es", "es-en"]);
    const resources = createLanguageResources(stubLoader(new Set(), missing));
    const dictionary = resources.dictionary("es", "en");
    await expect(dictionary).rejects.toThrow(PacksUnavailableError);
    await expect(dictionary).rejects.toMatchObject({ packs: ["es", "es-en"] });
    await expect(resources.classifier("es")).rejects.toMatchObject({
      packs: ["es"],
    });
    missing.delete("es");
    expect((await resources.pack("es")).lang).toBe("es");
    await expect(resources.dictionary("es", "en")).rejects.toMatchObject({
      packs: ["es-en"],
    });
    missing.clear();
    expect((await resources.dictionary("es", "en")).short("comer")).toBe(
      "to eat",
    );
  });

  it("builds again what used a pack it was told to forget, and keeps the rest", async () => {
    const resources = createLanguageResources(stubLoader());
    const pack = await resources.pack("es");
    const classifier = await resources.classifier("es");
    const dictionary = await resources.dictionary("es", "en");
    const english = await resources.pack("en");
    resources.forget("es-en");
    expect(await resources.dictionary("es", "en")).not.toBe(dictionary);
    expect(await resources.pack("es")).toBe(pack);
    expect(await resources.classifier("es")).toBe(classifier);
    resources.forget("es");
    expect(await resources.pack("es")).not.toBe(pack);
    expect(await resources.classifier("es")).not.toBe(classifier);
    expect(await resources.pack("en")).toBe(english);
  });

  it("builds the Spanish pack from the es pack alone", async () => {
    const loadPack = stubLoader();
    const resources = createLanguageResources(loadPack);
    const pack = await resources.pack("es");
    expect(pack.lang).toBe("es");
    expect(pack.lemmas("comiendo")).toEqual(["comer"]);
    expect(pack.lemmas("casas")).toEqual(["casa", "casar"]);
    expect(pack.rank("comer")).toBe(4);
    expect(pack.ipa("comer")).toBe("/koˈmeɾ/");
    expect(pack.phrases.has("a escondidas")).toBe(true);
    expect(filesRead(loadPack)).toEqual([
      "/packs/es/freq.json",
      "/packs/es/ipa.json",
      "/packs/es/lemmas.json",
      "/packs/es/phrases.json",
      "/packs/es/vocab.json",
    ]);
  });

  it("classifies a Spanish sentence with the Spanish pack", async () => {
    const resources = createLanguageResources(stubLoader());
    const pack = await resources.pack("es");
    const classifier = await resources.classifier("es");
    const spans = classifier.classify(
      pack.tokenize("Estoy comiendo una manzana a escondidas."),
      { terms: new Map([["manzana", "learning"]]), knownLevel: 3 },
    );
    expect(spans.map((s) => `${s.key}:${s.kind}:${s.category}`)).toEqual([
      "estar:word:known",
      "comer:word:new",
      "un:word:known",
      "manzana:word:learning",
      "a escondidas:phrase:new",
    ]);
  });

  it("looks words and phrases up from Spanish to English with the es and es-en packs", async () => {
    const loadPack = stubLoader();
    const resources = createLanguageResources(loadPack);
    const dictionary = await resources.dictionary("es", "en");
    expect(dictionary.from).toBe("es");
    expect(dictionary.to).toBe("en");
    expect(dictionary.entry("comer")).toEqual({
      head: "comer",
      kind: "word",
      ipa: "/koˈmeɾ/",
      short: "to eat",
      senses: [{ pos: "verb", text: "to eat" }],
    });
    expect(dictionary.entry("a escondidas")).toMatchObject({
      kind: "phrase",
      ipa: "/a eskonˈdidas/",
      short: "secretly",
    });
    expect(filesRead(loadPack)).toEqual([
      "/packs/es-en/dict-1.json",
      "/packs/es-en/dict-2.json",
      "/packs/es-en/index.json",
      "/packs/es/freq.json",
      "/packs/es/ipa.json",
      "/packs/es/lemmas.json",
      "/packs/es/phrases.json",
      "/packs/es/vocab.json",
    ]);
  });

  it("loads only the English packs for English", async () => {
    const loadPack = stubLoader();
    const resources = createLanguageResources(loadPack);
    await resources.classifier("en");
    await resources.dictionary("en", "ja");
    expect(filesRead(loadPack).filter((f) => f.includes("/es"))).toEqual([]);
  });

  it("rejects languages it has no packs for", async () => {
    const resources = createLanguageResources(stubLoader());
    await expect(resources.pack("fr")).rejects.toThrow(
      "No language pack for fr",
    );
    await expect(resources.dictionary("en", "fr")).rejects.toThrow(
      "No dictionary from en to fr",
    );
    await expect(resources.dictionary("es", "ja")).rejects.toThrow(
      "No dictionary from es to ja",
    );
    await expect(resources.pack("constructor")).rejects.toThrow(
      "No language pack for constructor",
    );
  });

  it("builds the pack and the dictionaries of every language pair the settings offer", async () => {
    const resources = createLanguageResources(stubLoader());
    for (const learning of learningLanguages()) {
      expect((await resources.pack(learning)).lang).toBe(learning);
      for (const native of nativeLanguages(learning)) {
        const dictionary = await resources.dictionary(learning, native);
        expect([dictionary.from, dictionary.to]).toEqual([learning, native]);
      }
    }
  });
});
