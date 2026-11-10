import { describe, expect, it, vi } from "vitest";
import { createPackLoader } from "./load";

const files: Record<string, unknown> = {
  "/packs/en/lemmas.json": { loaves: "loaf" },
  "/packs/en/freq.json": ["you", "the"],
  "/packs/en/ipa.json": { loaf: "/loʊf/" },
  "/packs/en/pos.json": { loaf: ["noun"] },
  "/packs/en/vocab.json": ["dough", "loaf"],
  "/packs/en-ja/index.json": {
    shards: [
      { file: "dict-1.json", first: "dough", last: "dough" },
      { file: "dict-2.json", first: "loaf", last: "yeast" },
    ],
  },
  "/packs/en-ja/dict-1.json": { dough: ["練り粉", ["練り粉"]] },
  "/packs/en-ja/dict-2.json": {
    loaf: ["パン", ["パン"]],
    yeast: ["酵母", ["酵母"]],
  },
};
const stubFetch = () =>
  vi.fn(async (path: string) => {
    if (!Object.hasOwn(files, path)) throw new Error(`not found: ${path}`);
    return files[path];
  });

const DICT = {
  dough: ["練り粉", ["練り粉"]],
  loaf: ["パン", ["パン"]],
  yeast: ["酵母", ["酵母"]],
};

describe("createPackLoader", () => {
  it("loads every file of the English pack", async () => {
    const loadPack = createPackLoader(stubFetch());
    expect(await loadPack("en")).toEqual({
      lemmas: { loaves: "loaf" },
      freq: ["you", "the"],
      ipa: { loaf: "/loʊf/" },
      pos: { loaf: ["noun"] },
      vocab: ["dough", "loaf"],
    });
  });

  it("loads the dictionary from the shards its index lists, as one dictionary", async () => {
    const fetchJson = stubFetch();
    const loadPack = createPackLoader(fetchJson);
    expect(await loadPack("en-ja")).toEqual({ dict: DICT });
    expect(fetchJson.mock.calls.map(([path]) => path)).toEqual([
      "/packs/en-ja/index.json",
      "/packs/en-ja/dict-1.json",
      "/packs/en-ja/dict-2.json",
    ]);
  });

  it("reads all the shards at once", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const fetchJson = vi.fn(async (path: string) => {
      if (path !== "/packs/en-ja/index.json") await held;
      return files[path];
    });
    const load = createPackLoader(fetchJson)("en-ja");
    await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(3));
    release();
    expect(await load).toEqual({ dict: DICT });
  });

  it("keeps a headword such as __proto__ as an ordinary entry", async () => {
    const proto = JSON.parse('{"__proto__":["原型",["原型"]]}') as unknown;
    const loadPack = createPackLoader(async (path) =>
      path.endsWith("index.json")
        ? { shards: [{ file: "dict-1.json", first: "x", last: "x" }] }
        : proto,
    );
    const { dict } = await loadPack("en-ja");
    expect(Object.hasOwn(dict, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(dict)).toBe(Object.prototype);
  });

  it("fetches each file only once, even for overlapping calls", async () => {
    const fetchJson = stubFetch();
    const loadPack = createPackLoader(fetchJson);
    const [a, b] = await Promise.all([loadPack("en"), loadPack("en")]);
    const c = await loadPack("en");
    expect(a).toBe(b);
    expect(c).toBe(a);
    await Promise.all([loadPack("en-ja"), loadPack("en-ja")]);
    expect(fetchJson).toHaveBeenCalledTimes(5 + 3);
  });

  it("tries again after a failed load", async () => {
    const fetchJson = stubFetch();
    fetchJson.mockImplementationOnce(
      async () => files["/packs/en-ja/index.json"],
    );
    fetchJson.mockRejectedValueOnce(new Error("offline"));
    const loadPack = createPackLoader(fetchJson);
    await expect(loadPack("en-ja")).rejects.toThrow("offline");
    expect(await loadPack("en-ja")).toEqual({ dict: DICT });
  });
});
