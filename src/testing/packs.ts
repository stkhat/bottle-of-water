// Tiny packs served through the real pack loader, as the bundled files would be.
import { vi } from "vitest";
import {
  createPackLoader,
  type PackFiles,
  type PackName,
} from "../core/packs/load";
import { readLock } from "../core/packs/lock";
import { PacksUnavailableError } from "../core/packs/unavailable";
import type { HandlerDeps } from "../background/handlers";

const TEST_PACKS: PackFiles = {
  en: {
    // "rose" is a word of its own and a form of "rise".
    lemmas: {
      loaves: "loaf",
      ferments: "ferment",
      gave: "give",
      made: "make",
      rose: "rise",
    },
    // "yeast" is ranked 2,500: known at the default level (3,000), new at 2,000.
    freq: [
      "the",
      "loaf",
      ...Array.from({ length: 2497 }, (_, i) => `filler${i}`),
      "yeast",
    ],
    ipa: { loaf: "/loʊf/", yeast: "/jist/" },
    pos: { loaf: ["noun"], ferment: ["verb"], crust: ["noun"] },
    vocab: [
      ...["crust", "ferment", "figure", "from", "give", "loaf", "out"],
      ...["rise", "rose", "scratch", "the", "up", "yeast"],
    ],
    // Meanings: "figure out" in the English definitions, the others in the Japanese
    // translations of phrases. "figure out" is a phrasal verb: saved, it matches with a
    // gap ("figure it out"). "make up one's mind" has a slot: matched only when saved or
    // selected.
    phrases: {
      detect: ["figure out", "from scratch", "give up"],
      more: ["make up one's mind"],
      gap: ["figure out"],
    },
    // A given name whose capitalised headword is about one person, and a place.
    names: { crust: "gs", yeast: "p" },
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
    capital: {
      crust: ["聖クラスト", ["聖クラスト"]],
      yeast: ["イースト国", ["イースト国"]],
    },
  },
  // "figure out" has more senses than are translated (four), a labelled one and
  // pointers: the background asks the translation cache for cleaned definitions only.
  "en-defs": {
    defs: {
      "figure out": [
        "To come to understand",
        [
          ["verb", "To come to understand; to discover."],
          ["verb", "(transitive, informal) To solve (a problem)."],
          ["verb", "Synonym of work out."],
          ["verb", "Synonym of puzzle out: to find a solution by thinking."],
          ["verb", "To calculate an amount."],
        ],
      ],
    },
  },
  es: {
    lemmas: {
      comiendo: "comer",
      casas: ["casa", "casar"],
      estoy: "estar",
      una: "un",
    },
    // At level 3: "estar" and "un" are known, "comer" is new.
    freq: ["de", "estar", "un", "comer", "casa"],
    ipa: { a: "/a/", comer: "/koˈmeɾ/", escondidas: "/eskonˈdidas/" },
    vocab: [
      ...["a", "casa", "casar", "comer", "de", "escondidas", "estar"],
      ...["manzana", "un"],
    ],
    phrases: { detect: ["a escondidas"], more: [], gap: [] },
  },
  "es-en": {
    defs: {
      "a escondidas": ["secretly", [["adverb", "secretly"]]],
      casa: ["house", [["noun", "house"]]],
      casar: ["to marry", [["verb", "to marry"]]],
      comer: ["to eat", [["verb", "to eat"]]],
    },
  },
  // "loaf" from the Spanish Wiktionary, "crust" from a translation table (with its
  // English sense as the hint); anything else falls back to en-defs.
  "en-es": {
    dict: {
      crust: [
        "corteza",
        [["noun", "corteza, costra", "outer layer of bread"]],
        1,
      ],
      loaf: ["hogaza", [["noun", "Pieza de pan."]], 0],
    },
  },
  "en-pt": {
    dict: { loaf: ["pão", [["noun", "pão"]], 0] },
  },
};

const { crust, ferment, loaf, the, yeast } = TEST_PACKS["en-ja"].dict;
const { comer, ...esDefs1 } = TEST_PACKS["es-en"].defs;

/**
 * The bundled files behind TEST_PACKS, by path: the EJDict dictionary and the Spanish →
 * English one are each split into two shards.
 */
const TEST_FILES: Readonly<Record<string, unknown>> = {
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
  "/packs/en-ja/capital.json": TEST_PACKS["en-ja"].capital,
  "/packs/en-defs/index.json": {
    shards: [{ file: "dict-1.json", first: "figure out", last: "figure out" }],
  },
  "/packs/en-defs/dict-1.json": TEST_PACKS["en-defs"].defs,
  ...Object.fromEntries(
    Object.entries(TEST_PACKS.es).map(([file, value]) => [
      `/packs/es/${file}.json`,
      value,
    ]),
  ),
  "/packs/es-en/index.json": {
    shards: [
      { file: "dict-1.json", first: "a escondidas", last: "casar" },
      { file: "dict-2.json", first: "comer", last: "comer" },
    ],
  },
  "/packs/es-en/dict-1.json": esDefs1,
  "/packs/es-en/dict-2.json": { comer },
  "/packs/en-es/index.json": {
    shards: [{ file: "dict-1.json", first: "crust", last: "loaf" }],
    sources: ["eswiktionary", "enwiktionary-translations"],
  },
  "/packs/en-es/dict-1.json": TEST_PACKS["en-es"].dict,
  "/packs/en-pt/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["ptwiktionary", "enwiktionary-translations"],
  },
  "/packs/en-pt/dict-1.json": TEST_PACKS["en-pt"].dict,
};

/**
 * The real pack loader over a stub of the extension's files (the boundary). Packs in
 * `fail` cannot be read; packs in `missing` are not on the device (not downloaded);
 * `fetchJson` records every file read.
 */
export function stubPackLoader(
  fail: ReadonlySet<PackName> = new Set(),
  missing: ReadonlySet<PackName> = new Set(),
) {
  const fetchJson = vi.fn(async (path: string) => {
    const name = path.split("/")[2] as PackName;
    if (fail.has(name)) throw new Error(`could not load ${name}`);
    if (missing.has(name)) throw new PacksUnavailableError([name]);
    if (!Object.hasOwn(TEST_FILES, path)) throw new Error(`not found: ${path}`);
    return TEST_FILES[path];
  });
  return Object.assign(createPackLoader(fetchJson), { fetchJson });
}

/** The pack files `loadPack` has read so far, sorted. */
export function filesRead(loadPack: ReturnType<typeof stubPackLoader>) {
  return loadPack.fetchJson.mock.calls.map(([path]) => path).sort();
}

/** The downloaded packs of a build that bundles every pack: none stored, none fetched. */
export function bundledPacks(): HandlerDeps["packs"] {
  return {
    lock: readLock(),
    store: {
      states: async () => ({}),
      downloaded: async () => [],
      remove: async () => {},
    },
    retry: () => {},
  };
}
