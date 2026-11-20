// Tiny packs served through the real pack loader, as the downloaded files would be.
import { vi } from "vitest";
import {
  createPackLoader,
  type PackFiles,
  type PackName,
} from "../core/packs/load";
import { packBytes, readLock } from "../core/packs/lock";
import type { PackState } from "../core/packs/state";
import { PacksUnavailableError } from "../core/packs/unavailable";
import type { HandlerDeps } from "../background/handlers";

/**
 * A tagger that knows a few words for sure (tagged without scoring) and tags every
 * other one as a noun it is not sure of: "rose" is a past tense, "the" a determiner.
 */
const TEST_TAGGER: PackFiles["en"]["tagger"] = {
  tags: ["NN", "VBD"],
  words: { rose: "VBD", the: "DT" },
  weights: {},
  scale: 10,
};

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
    pos: {
      loaf: ["noun"],
      ferment: ["verb"],
      crust: ["noun"],
      rise: ["verb", "noun"],
      rose: ["noun", "verb"],
    },
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
    tagger: TEST_TAGGER,
    contractions: {},
    capitals: [],
    acronyms: {},
  },
  "en-ja": {
    dict: {
      crust: ["パンの皮", ["パンの皮"]],
      ferment: ["発酵する", ["発酵する"]],
      loaf: ["パンのひと塊", ["パンのひと塊"]],
      // "rise" is a verb first, then a noun (en-ja/pos.json); "rose" a flower first,
      // then a form of "rise".
      rise: ["上がる", ["上がる", "『上昇』"]],
      rose: ["バラ", ["『バラ』", "riseの過去"]],
      the: ["その", ["その"]],
      yeast: ["酵母", ["酵母"]],
    },
    sensePos: { rise: "v n*", rose: "n* v" },
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
  // "i mean"'s short meaning only names its function (a usage note).
  "en-defs": {
    defs: {
      "figure out": [
        ["verb", "To come to understand; to discover."],
        ["verb", "(transitive, informal) To solve (a problem)."],
        ["verb", "Synonym of work out."],
        ["verb", "Synonym of puzzle out: to find a solution by thinking."],
        ["verb", "To calculate an amount."],
      ],
      "i mean": [
        ["particle", "A mild intensifier."],
        ["particle", "A delaying filler."],
      ],
    },
  },
  es: {
    // In shards, as es/lemmas/ is read.
    lemmas: [
      { casas: ["casa", "casar"], comiendo: "comer" },
      { estoy: "estar", una: "un" },
    ],
    // At level 3: "estar" and "un" are known, "comer" is new.
    freq: ["de", "estar", "un", "comer", "casa"],
    ipa: { a: "/a/", comer: "/koˈmeɾ/", escondidas: "/eskonˈdidas/" },
    pos: { casa: ["noun"], casar: ["verb"], comer: ["verb"] },
    vocab: [
      ...["a", "casa", "casar", "comer", "de", "escondidas", "estar"],
      ...["manzana", "un"],
    ],
    phrases: { detect: ["a escondidas"], more: [], gap: [] },
    names: {},
    // Sure of no word: every tag stays under the threshold.
    tagger: { tags: ["NOUN"], words: {}, weights: {}, scale: 10 },
  },
  "es-en": {
    defs: {
      "a escondidas": [["adverb", "secretly"]],
      casa: [["noun", "house"]],
      casar: [["verb", "to marry"]],
      comer: [["verb", "to eat"]],
    },
  },
  fr: {
    lemmas: [{ "l'": "le", maisons: "maison" }],
    freq: ["de", "le", "maison"],
    ipa: { maison: "/mɛ.zɔ̃/" },
    pos: { le: ["article"], maison: ["noun"], "d'accord": ["adverb"] },
    vocab: ["d'accord", "de", "homme", "l'", "le", "maison"],
    phrases: { detect: [], more: [], gap: [] },
    names: {},
    // Sure of no word: every tag stays under the threshold.
    tagger: { tags: ["NOUN"], words: {}, weights: {}, scale: 10 },
  },
  "fr-en": {
    defs: {
      "d'accord": [["adverb", "in agreement"]],
      homme: [["noun", "man"]],
      maison: [["noun", "house"]],
    },
  },
  de: {
    lemmas: [{ häuser: "haus", im: "in" }],
    freq: ["der", "in", "haus"],
    ipa: { haus: "/haʊ̯s/" },
    pos: { der: ["article"], haus: ["noun"], essen: ["noun", "verb"] },
    vocab: ["der", "essen", "haus", "im", "in"],
    phrases: { detect: [], more: [], gap: [] },
    names: {},
    // Sure of no word: every tag stays under the threshold.
    tagger: { tags: ["NOUN"], words: {}, weights: {}, scale: 10 },
  },
  "de-en": {
    defs: {
      essen: [
        ["verb", "to eat"],
        ["noun", "food"],
      ],
      haus: [["noun", "house"]],
      im: [["contraction", "in the; contraction of in + dem"]],
    },
  },
  // "loaf" from the Spanish Wiktionary, "crust" from a translation table (with its
  // English sense as the hint); anything else falls back to en-defs.
  "en-es": {
    dict: {
      crust: [[["noun", "corteza, costra", "outer layer of bread"]], 1],
      loaf: [[["noun", "Pieza de pan."]], 0],
    },
  },
  "en-pt": {
    dict: { loaf: [[["noun", "pão"]], 0] },
  },
  // Translation tables first, then the edition (`afterTables`).
  "en-ru": {
    dict: {
      loaf: [[["noun", "буханка, батон", "block of bread"]], 0],
    },
  },
  "en-fr": {
    dict: { loaf: [[["noun", "pain"]], 0] },
  },
  "en-de": {
    dict: { loaf: [[["noun", "Laib, Brotlaib", "block of bread"]], 0] },
  },
  "en-zh": {
    dict: { loaf: [[["noun", "一条, 一块", "block of bread"]], 0] },
  },
  "en-it": {
    dict: { loaf: [[["noun", "pagnotta", "block of bread"]], 0] },
  },
  // Its own Wiktionary first.
  "en-pl": {
    dict: { loaf: [[["noun", "bochenek"]], 0] },
  },
  // German → French (L3): de.wiktionary's tables first; Essen's capitalised sense marked.
  "de-fr": {
    dict: {
      essen: [
        [
          ["verb", "manger", "Nahrung zu sich nehmen"],
          ["noun", "repas", "Mahlzeit"],
        ],
        0,
        [1],
      ],
      haus: [[["noun", "maison", "Gebäude"]], 0, [0]],
    },
  },
};

const { crust, ferment, loaf, rise, rose, the, yeast } =
  TEST_PACKS["en-ja"].dict;
const { comer, ...esDefs1 } = TEST_PACKS["es-en"].defs;

/**
 * The files behind TEST_PACKS, by path: the EJDict dictionary and the Spanish →
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
      { file: "dict-2.json", first: "rise", last: "yeast" },
    ],
  },
  "/packs/en-ja/dict-1.json": { crust, ferment, loaf },
  "/packs/en-ja/dict-2.json": { rise, rose, the, yeast },
  "/packs/en-ja/phrases.json": TEST_PACKS["en-ja"].phrases,
  "/packs/en-ja/capital.json": TEST_PACKS["en-ja"].capital,
  "/packs/en-ja/pos.json": TEST_PACKS["en-ja"].sensePos,
  "/packs/en-defs/index.json": {
    shards: [{ file: "dict-1.json", first: "figure out", last: "i mean" }],
  },
  "/packs/en-defs/dict-1.json": TEST_PACKS["en-defs"].defs,
  ...Object.fromEntries(
    Object.entries(TEST_PACKS.es)
      .filter(([file]) => file !== "lemmas")
      .map(([file, value]) => [`/packs/es/${file}.json`, value]),
  ),
  "/packs/es/lemmas/index.json": {
    shards: [
      { file: "dict-1.json", first: "casas", last: "comiendo" },
      { file: "dict-2.json", first: "estoy", last: "una" },
    ],
  },
  "/packs/es/lemmas/dict-1.json": TEST_PACKS.es.lemmas[0],
  "/packs/es/lemmas/dict-2.json": TEST_PACKS.es.lemmas[1],
  "/packs/es-en/index.json": {
    shards: [
      { file: "dict-1.json", first: "a escondidas", last: "casar" },
      { file: "dict-2.json", first: "comer", last: "comer" },
    ],
  },
  "/packs/es-en/dict-1.json": esDefs1,
  "/packs/es-en/dict-2.json": { comer },
  ...Object.fromEntries(
    Object.entries(TEST_PACKS.fr)
      .filter(([file]) => file !== "lemmas")
      .map(([file, value]) => [`/packs/fr/${file}.json`, value]),
  ),
  "/packs/fr/lemmas/index.json": {
    shards: [{ file: "dict-1.json", first: "l'", last: "maisons" }],
  },
  "/packs/fr/lemmas/dict-1.json": TEST_PACKS.fr.lemmas[0],
  "/packs/fr-en/index.json": {
    shards: [{ file: "dict-1.json", first: "d'accord", last: "maison" }],
  },
  "/packs/fr-en/dict-1.json": TEST_PACKS["fr-en"].defs,
  ...Object.fromEntries(
    Object.entries(TEST_PACKS.de)
      .filter(([file]) => file !== "lemmas")
      .map(([file, value]) => [`/packs/de/${file}.json`, value]),
  ),
  "/packs/de/lemmas/index.json": {
    shards: [{ file: "dict-1.json", first: "häuser", last: "im" }],
  },
  "/packs/de/lemmas/dict-1.json": TEST_PACKS.de.lemmas[0],
  "/packs/de-en/index.json": {
    shards: [{ file: "dict-1.json", first: "essen", last: "im" }],
  },
  "/packs/de-en/dict-1.json": TEST_PACKS["de-en"].defs,
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
  "/packs/en-ru/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["enwiktionary-translations", "ruwiktionary"],
  },
  "/packs/en-ru/dict-1.json": TEST_PACKS["en-ru"].dict,
  "/packs/en-fr/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["frwiktionary", "enwiktionary-translations"],
  },
  "/packs/en-fr/dict-1.json": TEST_PACKS["en-fr"].dict,
  "/packs/en-de/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["enwiktionary-translations", "dewiktionary"],
  },
  "/packs/en-de/dict-1.json": TEST_PACKS["en-de"].dict,
  "/packs/en-zh/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["enwiktionary-translations", "zhwiktionary", "omw-cmn"],
  },
  "/packs/en-zh/dict-1.json": TEST_PACKS["en-zh"].dict,
  "/packs/en-it/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["enwiktionary-translations", "itwiktionary", "omw-it", "omw-iwn"],
  },
  "/packs/en-it/dict-1.json": TEST_PACKS["en-it"].dict,
  "/packs/en-pl/index.json": {
    shards: [{ file: "dict-1.json", first: "loaf", last: "loaf" }],
    sources: ["plwiktionary", "enwiktionary-translations", "omw-pl"],
  },
  "/packs/en-pl/dict-1.json": TEST_PACKS["en-pl"].dict,
  "/packs/de-fr/index.json": {
    shards: [{ file: "dict-1.json", first: "essen", last: "haus" }],
    sources: [
      "dewiktionary-translations",
      "frwiktionary-translations",
      "frwiktionary-de",
    ],
  },
  "/packs/de-fr/dict-1.json": TEST_PACKS["de-fr"].dict,
};

/**
 * The real pack loader over a stub of the downloaded files (the boundary). Packs in
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

/** Every pack on the device at its lock version; none fetched. */
export function packsOnDevice(): HandlerDeps["packs"] {
  const lock = readLock();
  return {
    lock,
    store: {
      states: async (packs) => {
        const states: Record<string, PackState> = {};
        for (const pack of packs) {
          const total = packBytes(lock.packs[pack as PackName]);
          states[pack] = { state: "ready", received: total, total };
        }
        return states;
      },
      downloaded: async () => [],
      remove: async () => {},
    },
    retry: () => {},
  };
}
