import { describe, expect, it } from "vitest";
import { learningLanguages, nativeLanguages } from "../languages";
import { readLock } from "./lock";
import { packsFor, pairOfPack } from "./pairs";

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

describe("pairOfPack", () => {
  it("names the offered pair a pack's data belongs to", () => {
    expect(pairOfPack("es")).toEqual({ learning: "es", native: "en" });
    expect(pairOfPack("es-en")).toEqual({ learning: "es", native: "en" });
    expect(pairOfPack("en-defs")).toEqual({ learning: "en", native: "ja" });
  });

  it("names a pair for every pack of the lock", () => {
    for (const pack of Object.keys(readLock().packs))
      expect(pairOfPack(pack)).toBeDefined();
  });

  it("names none for a pack no offered pair uses", () => {
    expect(pairOfPack("fr")).toBeUndefined();
    expect(pairOfPack("constructor")).toBeUndefined();
  });
});
