// Test helper: tiny packs served through the real pack loader, as the bundled files would be.
import { vi } from "vitest";
import {
  createPackLoader,
  type PackFiles,
  type PackName,
} from "../core/packs/load";

export const TEST_PACKS: PackFiles = {
  en: {
    lemmas: { loaves: "loaf", ferments: "ferment", gave: "give" },
    // "yeast" is ranked 2,500: known at the default level (3,000), new at 2,000.
    freq: [
      "the",
      "loaf",
      ...Array.from({ length: 2497 }, (_, i) => `filler${i}`),
      "yeast",
    ],
    ipa: { loaf: "/loʊf/" },
    pos: { loaf: ["noun"], ferment: ["verb"], crust: ["noun"] },
    vocab: [
      ...["crust", "ferment", "figure", "from", "give", "loaf", "out"],
      ...["scratch", "the", "up", "yeast"],
    ],
    // Meanings: "figure out" in the English definitions, the others in the Japanese
    // translations of phrases.
    phrases: ["figure out", "from scratch", "give up"],
  },
  "en-ja": {
    dict: {
      crust: ["パンの皮", ["パンの皮"]],
      ferment: ["発酵する", ["発酵する"]],
      loaf: ["パンのひと塊", ["パンのひと塊"]],
      the: ["その", ["その"]],
      yeast: ["酵母", ["酵母"]],
    },
    phrases: {
      "from scratch": ["最初から", ["最初から", "ゼロから"]],
      "give up": ["諦める", ["諦める", "やめる"]],
    },
  },
  "en-defs": {
    defs: {
      "figure out": [
        "To come to understand",
        [["verb", "To come to understand; to discover."]],
      ],
    },
  },
};

const { crust, ferment, loaf, the, yeast } = TEST_PACKS["en-ja"].dict;

/** The bundled files behind TEST_PACKS, by path: the EJDict dictionary is split into two shards. */
export const TEST_FILES: Readonly<Record<string, unknown>> = {
  ...Object.fromEntries(
    Object.entries(TEST_PACKS.en).map(([file, value]) => [
      `/packs/en/${file}.json`,
      value,
    ]),
  ),
  "/packs/en-ja/index.json": {
    shards: [
      { file: "dict-1.json", first: "crust", last: "loaf" },
      { file: "dict-2.json", first: "the", last: "yeast" },
    ],
  },
  "/packs/en-ja/dict-1.json": { crust, ferment, loaf },
  "/packs/en-ja/dict-2.json": { the, yeast },
  "/packs/en-ja/phrases.json": TEST_PACKS["en-ja"].phrases,
  "/packs/en-defs/index.json": {
    shards: [{ file: "dict-1.json", first: "figure out", last: "figure out" }],
  },
  "/packs/en-defs/dict-1.json": TEST_PACKS["en-defs"].defs,
};

/**
 * The real pack loader over a stub of the extension's files (the boundary). Packs in
 * `fail` cannot be read; `fetchJson` records every file read.
 */
export function stubPackLoader(fail: ReadonlySet<PackName> = new Set()) {
  const fetchJson = vi.fn(async (path: string) => {
    const name = path.split("/")[2] as PackName;
    if (fail.has(name)) throw new Error(`could not load ${name}`);
    if (!Object.hasOwn(TEST_FILES, path)) throw new Error(`not found: ${path}`);
    return TEST_FILES[path];
  });
  return Object.assign(createPackLoader(fetchJson), { fetchJson });
}

/** The pack files `loadPack` has read so far, sorted. */
export function filesRead(loadPack: ReturnType<typeof stubPackLoader>) {
  return loadPack.fetchJson.mock.calls.map(([path]) => path).sort();
}
