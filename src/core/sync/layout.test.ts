import { describe, expect, it } from "vitest";
import {
  chunkIndexOf,
  chunkKey,
  itemBytes,
  langOfKey,
  metaKey,
} from "./layout";

describe("sync layout", () => {
  it("names the meta and chunk keys of a language", () => {
    expect(metaKey("en")).toBe("sync:en:meta");
    expect(chunkKey("en", 0)).toBe("sync:en:0");
    expect(chunkKey("en", 12)).toBe("sync:en:12");
  });

  it("finds the language of a sync key", () => {
    expect(langOfKey("sync:en:meta")).toBe("en");
    expect(langOfKey("sync:pt-BR:3")).toBe("pt-BR");
    expect(langOfKey("settings")).toBeUndefined();
    expect(langOfKey("sync:en")).toBeUndefined();
  });

  it("finds the number of a chunk key of the language", () => {
    expect(chunkIndexOf("en", "sync:en:0")).toBe(0);
    expect(chunkIndexOf("en", "sync:en:12")).toBe(12);
    expect(chunkIndexOf("en", "sync:en:meta")).toBeUndefined();
    expect(chunkIndexOf("en", "sync:es:0")).toBeUndefined();
    expect(chunkIndexOf("pt", "sync:pt-BR:0")).toBeUndefined();
  });

  it("counts an item as the key plus its JSON, in UTF-8 bytes", () => {
    expect(itemBytes("sync:en:0", "abc")).toBe(9 + 5);
    expect(itemBytes("k", { chunks: 2 })).toBe(1 + 12);
    expect(itemBytes("k", "é")).toBe(1 + 4);
  });
});
