import { describe, expect, it } from "vitest";
import { learningLanguages, nativeLanguages } from "../languages";
import { readLock } from "./lock";
import { packsFor, pairsOfPack } from "./pairs";

describe("packsFor", () => {
  it("lists the language's pack, then the dictionary's other packs", () => {
    expect(packsFor("en", "ja")).toEqual(["en", "en-ja", "en-defs"]);
    expect(packsFor("es", "en")).toEqual(["es", "es-en"]);
  });

  it("lists what has a recipe of a pair Lingo does not offer", () => {
    expect(packsFor("en", "fr")).toEqual(["en"]);
    expect(packsFor("fr", "ja")).toEqual([]);
    expect(packsFor("constructor", "toString")).toEqual([]);
  });

  it("names packs of the lock for every pair the settings offer", () => {
    const { packs } = readLock();
    for (const learning of learningLanguages())
      for (const native of nativeLanguages(learning)) {
        const needed = packsFor(learning, native);
        expect(needed.length).toBeGreaterThan(1);
        for (const pack of needed) expect(Object.keys(packs)).toContain(pack);
      }
  });
});

describe("pairsOfPack", () => {
  it("names the offered pair a pack's data belongs to", () => {
    expect(pairsOfPack("es")[0]).toEqual({ learning: "es", native: "en" });
    expect(pairsOfPack("es-en")[0]).toEqual({ learning: "es", native: "en" });
    expect(pairsOfPack("en-defs")[0]).toEqual({ learning: "en", native: "ja" });
  });

  it("names a pair for every pack of the lock", () => {
    for (const pack of Object.keys(readLock().packs))
      expect(pairsOfPack(pack)[0]).toBeDefined();
  });

  it("names none for a pack no offered pair uses", () => {
    expect(pairsOfPack("fr")[0]).toBeUndefined();
    expect(pairsOfPack("constructor")[0]).toBeUndefined();
  });
});
