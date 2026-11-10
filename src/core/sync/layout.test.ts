import { describe, expect, it } from "vitest";
import { chunkKey, itemBytes, langOfKey, metaKey } from "./layout";

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

  it("counts an item as the key plus its JSON, in UTF-8 bytes", () => {
    expect(itemBytes("sync:en:0", "abc")).toBe(9 + 5);
    expect(itemBytes("k", { chunks: 2 })).toBe(1 + 12);
    expect(itemBytes("k", "é")).toBe(1 + 4);
  });
});
