// Test helper: the real background (handlers, TermStore on IndexedDB, classifier and
// dictionary) over a small stub pack, answering in-process instead of through messaging.
import { createHandlers } from "../../background/handlers";
import { createLanguageResources } from "../../background/language-resources";
import { bundledPacks } from "../../background/test-packs";
import { openLingoDb } from "../../background/db";
import { createHistoryStore } from "../../background/history-store";
import { createTermStore } from "../../background/term-store";
import { createTranslationCache } from "../../background/translation-cache";
import { createBrowserEnv } from "../../core/browser-env";
import { createPackLoader, type PackFiles } from "../../core/packs/load";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../../core/settings";
import type { send } from "../../messaging/client";
import type { Request } from "../../messaging/protocol";

/** Ranked within 29: known at any level. The rare words come after rank 3,400: new. */
const COMMON = [
  "the",
  "they",
  "and",
  "a",
  "it",
  "can",
  "feel",
  "at",
  "first",
  "you",
  "is",
  "no",
  "more",
  "so",
  "each",
  "back",
  "to",
  "its",
  "once",
  "out",
  "bake",
  "of",
  "in",
  "with",
  "this",
  "page",
  "end",
  "make",
  "mind",
];
const filler = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `filler${from + i}`);
/** Ranked 2,430: known at 3,000, new at 2,000. */
const DOUGH = ["dough"];
const RARE = [
  "knead",
  "loaf",
  "tedious",
  "figure",
  "schedule",
  "trace",
  "rise",
  "fall",
  "cause",
  "tangy",
  "crackle",
  "yeast",
  "starch",
  "from",
  "scratch",
  "give",
  "up",
];

const DICT: Record<string, readonly [string, readonly string[]]> = {
  knead: ["（生地を）こねる", ["（生地を）こねる；練る"]],
  loaf: ["（パンの）ひと塊", ["（パンなどの）ひと塊"]],
  tedious: ["退屈な、面倒な", ["退屈な；うんざりする；面倒な"]],
  figure: ["数字、姿、人物", ["数字；姿；人物"]],
  rise: ["上昇", ["上昇；増加"]],
  fall: ["下落", ["下落；落下"]],
  tangy: ["ぴりっとした、酸味のある", ["ぴりっとする；酸味の効いた"]],
  dough: ["パン生地", ["パン生地"]],
  make: ["作る", ["作る；こしらえる"]],
  mind: ["心、精神", ["心；精神"]],
};

const vocab = [...new Set([...COMMON, ...DOUGH, ...RARE])].sort();
for (const word of vocab) DICT[word] ??= [`${word}の訳`, [`${word}の訳`]];

/**
 * Dictionary phrases: "figure out" has an English definition, the others Japanese.
 * "figure out" is a phrasal verb: saved, it matches with a gap ("figure it out").
 * "make up one's mind" has a slot: matched only when saved or selected.
 */
const PHRASES = {
  detect: ["figure out", "from scratch", "give up"],
  more: ["make up one's mind"],
  gap: ["figure out"],
};
const JA_PHRASES: Record<string, readonly [string, readonly string[]]> = {
  "from scratch": ["最初から", ["最初から", "ゼロから"]],
  "give up": ["諦める", ["諦める", "やめる"]],
  "make up one's mind": ["決心する、決める", ["決心する", "決める"]],
};
const DEFS: PackFiles["en-defs"]["defs"] = {
  "figure out": [
    "To come to understand",
    [["verb", "To come to understand; to discover or find a solution."]],
  ],
};

const PACKS: Pick<PackFiles, "en" | "en-ja" | "en-defs"> = {
  en: {
    lemmas: {
      loaves: "loaf",
      crackles: "crackle",
      starches: "starch",
      gave: "give",
      made: "make",
    },
    freq: [
      ...COMMON,
      ...filler(0, 2400),
      ...DOUGH,
      ...filler(2400, 1000),
      ...RARE,
    ],
    ipa: { tedious: "/ˈtiːdiəs/", loaf: "/loʊf/", knead: "/niːd/" },
    pos: { tedious: ["adjective"], loaf: ["noun"], knead: ["verb"] },
    vocab,
    phrases: PHRASES,
  },
  "en-ja": { dict: DICT, phrases: JA_PHRASES },
  "en-defs": { defs: DEFS },
};

const FILES: Readonly<Record<string, unknown>> = {
  ...Object.fromEntries(
    Object.entries(PACKS.en).map(([file, value]) => [
      `/packs/en/${file}.json`,
      value,
    ]),
  ),
  "/packs/en-ja/index.json": {
    shards: [{ file: "dict-1.json", first: vocab[0], last: vocab.at(-1) }],
  },
  "/packs/en-ja/dict-1.json": DICT,
  "/packs/en-ja/phrases.json": JA_PHRASES,
  "/packs/en-defs/index.json": {
    shards: [{ file: "dict-1.json", first: "figure out", last: "figure out" }],
  },
  "/packs/en-defs/dict-1.json": DEFS,
};

let dbCount = 0;

/**
 * A background for content-script tests. `send` answers like the real one and
 * records every request; `settings` can be changed with `setSettings` requests.
 */
export function testBackground(initial: Partial<Settings> = {}) {
  let settings = mergeSettings(initial, DEFAULT_SETTINGS);
  const db = openLingoDb(`lingo-content-test-${Date.now()}-${dbCount++}`);
  const store = createTermStore(db);
  let optionsOpened = 0;
  const handle = createHandlers({
    store,
    history: createHistoryStore(db),
    translations: createTranslationCache(db),
    settings: {
      get: async () => settings,
      set: async (patch: SettingsPatch) => {
        settings = mergeSettings(patch, settings);
        return settings;
      },
    },
    resources: createLanguageResources(
      createPackLoader(async (path) => {
        if (!Object.hasOwn(FILES, path)) throw new Error(`not found: ${path}`);
        return FILES[path];
      }),
    ),
    packs: bundledPacks(),
    sync: {
      status: async () => ({
        enabled: false,
        bytesUsed: 0,
        quotaBytes: 0,
        syncedCount: 0,
        localOnlyCount: 0,
        droppedKnownCount: 0,
      }),
    },
    env: () => createBrowserEnv(),
    openOptionsPage: async () => {
      optionsOpened++;
    },
  });
  const requests: Request[] = [];
  const sendFn = (async (request: Request) => {
    requests.push(request);
    const reply = await handle(request);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }) as typeof send;

  return {
    send: sendFn,
    requests,
    /** Requests of one type, without their `type`. */
    sent<T extends Request["type"]>(type: T) {
      return requests.filter(
        (r): r is Extract<Request, { type: T }> => r.type === type,
      );
    },
    settings: () => settings,
    /** How many times the options page was opened. */
    optionsOpened: () => optionsOpened,
    async close() {
      db.close();
      await db.delete();
    },
  };
}
