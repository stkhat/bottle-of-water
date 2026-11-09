import { describe, expect, it, vi } from "vitest";
import { createPackLoader } from "./load";

const files: Record<string, unknown> = {
  "/packs/en/lemmas.json": { loaves: "loaf" },
  "/packs/en/freq.json": ["you", "the"],
  "/packs/en/ipa.json": { loaf: "/loʊf/" },
  "/packs/en/pos.json": { loaf: ["noun"] },
  "/packs/en-ja/dict.json": { loaf: ["パン", ["パン"]] },
};
const stubFetch = () =>
  vi.fn(async (path: string) => {
    if (!Object.hasOwn(files, path)) throw new Error(`not found: ${path}`);
    return files[path];
  });

describe("createPackLoader", () => {
  it("loads every file of a pack", async () => {
    const loadPack = createPackLoader(stubFetch());
    expect(await loadPack("en")).toEqual({
      lemmas: { loaves: "loaf" },
      freq: ["you", "the"],
      ipa: { loaf: "/loʊf/" },
      pos: { loaf: ["noun"] },
    });
    expect(await loadPack("en-ja")).toEqual({
      dict: { loaf: ["パン", ["パン"]] },
    });
  });

  it("fetches each file only once, even for overlapping calls", async () => {
    const fetchJson = stubFetch();
    const loadPack = createPackLoader(fetchJson);
    const [a, b] = await Promise.all([loadPack("en"), loadPack("en")]);
    const c = await loadPack("en");
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });

  it("tries again after a failed load", async () => {
    const fetchJson = stubFetch();
    fetchJson.mockRejectedValueOnce(new Error("offline"));
    const loadPack = createPackLoader(fetchJson);
    await expect(loadPack("en-ja")).rejects.toThrow("offline");
    expect(await loadPack("en-ja")).toEqual({
      dict: { loaf: ["パン", ["パン"]] },
    });
  });
});
