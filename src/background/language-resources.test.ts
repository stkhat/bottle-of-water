import { describe, expect, it } from "vitest";
import type { PackName } from "../core/packs/load";
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

  it("rejects languages it has no packs for", async () => {
    const resources = createLanguageResources(stubLoader());
    await expect(resources.pack("fr")).rejects.toThrow(
      "No language pack for fr",
    );
    await expect(resources.dictionary("en", "fr")).rejects.toThrow(
      "No dictionary from en to fr",
    );
  });
});
