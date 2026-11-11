import { describe, expect, it, vi } from "vitest";
import { createPackLoader } from "./load";

const files: Record<string, unknown> = {
  "/packs/en/lemmas.json": { loaves: "loaf" },
  "/packs/en/freq.json": ["you", "the"],
  "/packs/en/ipa.json": { loaf: "/loʊf/" },
  "/packs/en/pos.json": { loaf: ["noun"] },
  "/packs/en/vocab.json": ["dough", "loaf"],
  "/packs/en/phrases.json": {
    detect: ["figure out", "give up"],
    more: ["make up one's mind"],
    gap: ["figure out", "give up"],
  },
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
  "/packs/en-ja/phrases.json": { "give up": ["諦める", ["諦める", "やめる"]] },
  "/packs/en-defs/index.json": {
    shards: [{ file: "dict-1.json", first: "figure out", last: "figure out" }],
  },
  "/packs/en-defs/dict-1.json": {
    "figure out": ["To come to understand", [["verb", "To calculate."]]],
  },
  "/packs/es/lemmas.json": { comiendo: "comer", casas: ["casa", "casar"] },
  "/packs/es/freq.json": ["de", "comer"],
  "/packs/es/ipa.json": { comer: "/koˈmeɾ/" },
  "/packs/es/vocab.json": ["casa", "casar", "comer", "de"],
  "/packs/es/phrases.json": { detect: ["a escondidas"], more: [], gap: [] },
  "/packs/es-en/index.json": {
    shards: [
      { file: "dict-1.json", first: "casa", last: "casar" },
      { file: "dict-2.json", first: "comer", last: "comer" },
    ],
  },
  "/packs/es-en/dict-1.json": {
    casa: ["house", [["noun", "house"]]],
    casar: ["to marry", [["verb", "to marry"]]],
  },
  "/packs/es-en/dict-2.json": { comer: ["to eat", [["verb", "to eat"]]] },
};
const stubFetch = () =>
  vi.fn(async (path: string) => {
    if (!Object.hasOwn(files, path)) throw new Error(`not found: ${path}`);
    return files[path];
  });

const PHRASES = { "give up": ["諦める", ["諦める", "やめる"]] };

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
      phrases: {
        detect: ["figure out", "give up"],
        more: ["make up one's mind"],
        gap: ["figure out", "give up"],
      },
    });
  });

  it("loads the dictionary from the shards its index lists, as one dictionary, with its phrases", async () => {
    const fetchJson = stubFetch();
    const loadPack = createPackLoader(fetchJson);
    expect(await loadPack("en-ja")).toEqual({ dict: DICT, phrases: PHRASES });
    expect(fetchJson.mock.calls.map(([path]) => path).sort()).toEqual([
      "/packs/en-ja/dict-1.json",
      "/packs/en-ja/dict-2.json",
      "/packs/en-ja/index.json",
      "/packs/en-ja/phrases.json",
    ]);
  });

  it("loads the English definitions from their shards", async () => {
    const fetchJson = stubFetch();
    const loadPack = createPackLoader(fetchJson);
    expect(await loadPack("en-defs")).toEqual({
      defs: {
        "figure out": ["To come to understand", [["verb", "To calculate."]]],
      },
    });
    expect(fetchJson.mock.calls.map(([path]) => path)).toEqual([
      "/packs/en-defs/index.json",
      "/packs/en-defs/dict-1.json",
    ]);
  });

  it("loads every file of the Spanish pack", async () => {
    const fetchJson = stubFetch();
    expect(await createPackLoader(fetchJson)("es")).toEqual({
      lemmas: { comiendo: "comer", casas: ["casa", "casar"] },
      freq: ["de", "comer"],
      ipa: { comer: "/koˈmeɾ/" },
      vocab: ["casa", "casar", "comer", "de"],
      phrases: { detect: ["a escondidas"], more: [], gap: [] },
    });
    expect(fetchJson.mock.calls.map(([path]) => path).sort()).toEqual([
      "/packs/es/freq.json",
      "/packs/es/ipa.json",
      "/packs/es/lemmas.json",
      "/packs/es/phrases.json",
      "/packs/es/vocab.json",
    ]);
  });

  it("loads the Spanish → English definitions from their shards", async () => {
    const fetchJson = stubFetch();
    expect(await createPackLoader(fetchJson)("es-en")).toEqual({
      defs: {
        casa: ["house", [["noun", "house"]]],
        casar: ["to marry", [["verb", "to marry"]]],
        comer: ["to eat", [["verb", "to eat"]]],
      },
    });
    expect(fetchJson.mock.calls.map(([path]) => path)).toEqual([
      "/packs/es-en/index.json",
      "/packs/es-en/dict-1.json",
      "/packs/es-en/dict-2.json",
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
    await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(4));
    release();
    expect(await load).toEqual({ dict: DICT, phrases: PHRASES });
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
    expect(fetchJson).toHaveBeenCalledTimes(6 + 4);
  });

  it("tries again after a failed load", async () => {
    const fetchJson = stubFetch();
    fetchJson.mockImplementationOnce(
      async () => files["/packs/en-ja/index.json"],
    );
    fetchJson.mockRejectedValueOnce(new Error("offline"));
    const loadPack = createPackLoader(fetchJson);
    await expect(loadPack("en-ja")).rejects.toThrow("offline");
    expect(await loadPack("en-ja")).toEqual({ dict: DICT, phrases: PHRASES });
  });
});
