// The real background (handlers, TermStore on IndexedDB, classifier and dictionary)
// over a small stub pack, answering in-process instead of through messaging.
import { createHandlers } from "../background/handlers";
import { createLanguageResources } from "../background/language-resources";
import { openLingoDb } from "../background/db";
import { createHistoryStore } from "../background/history-store";
import { createTermStore } from "../background/term-store";
import { createTranslationCache } from "../background/translation-cache";
import {
  createPackLoader,
  type PackFiles,
  type PackName,
} from "../core/packs/load";
import { applyOverrides, readLock } from "../core/packs/lock";
import {
  packUsable,
  type PackState,
  type PackStates,
} from "../core/packs/state";
import { PacksUnavailableError } from "../core/packs/unavailable";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../core/settings";
import type { send } from "../messaging/client";
import type { Request } from "../messaging/protocol";
import { settingsListeners } from "./stubs";

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
  // Names, when the document always capitalises them (rule D): "Mark" is a given name
  // whose capitalised sense is about one person (ignored); "Japan" a place that keeps
  // its capitalised meaning.
  "mark",
  "japan",
];

/** The names lexicon (en/names.json). */
const NAMES = { mark: "gs", japan: "p" };
/** EJDict's capitalised headwords (en-ja/capital.json). */
const CAPITAL: Record<string, readonly [string, readonly string[]]> = {
  mark: ["聖マルコ", ["聖マルコ(『St.~』)"]],
  japan: ["日本", ["『日本』"]],
};

const DICT: Record<string, readonly [string, readonly string[]]> = {
  mark: ["跡", ["『跡』", "印"]],
  japan: ["黒い漆", ["黒い漆(うるし)"]],
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
    names: NAMES,
    // Sure of no word: no tag counts (rules A1 and A2 change nothing here).
    tagger: { tags: ["NN", "VB"], words: {}, weights: {}, scale: 10 },
  },
  "en-ja": { dict: DICT, phrases: JA_PHRASES, capital: CAPITAL, sensePos: {} },
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
  "/packs/en-ja/capital.json": CAPITAL,
  "/packs/en-ja/pos.json": {},
  "/packs/en-defs/index.json": {
    shards: [{ file: "dict-1.json", first: "figure out", last: "figure out" }],
  },
  "/packs/en-defs/dict-1.json": DEFS,
};

let dbCount = 0;

export interface TestBackgroundOptions {
  /**
   * Packs that are downloaded and not on the device yet: requests that need them fail
   * with `PacksUnavailableError` until `setPackStates` says they are usable.
   */
  missingPacks?: readonly PackName[];
}

/**
 * A background for content-script tests. `send` answers like the real one (and
 * `send` in messaging/client.ts) and records every request; `settings` can be changed
 * with `setSettings` requests.
 */
export function testBackground(
  initial: Partial<Settings> = {},
  options: TestBackgroundOptions = {},
) {
  let settings = mergeSettings(initial, DEFAULT_SETTINGS);
  const settingsWatchers = settingsListeners(settings);
  const missing = new Set<string>(options.missingPacks);
  // A build that downloads the missing packs; the others are bundled.
  const lock = applyOverrides(
    readLock(),
    { WXT_PACKS_DOWNLOAD: [...missing].join(",") },
    "test",
  );
  let packStates: PackStates = {};
  const packListeners = new Set<(states: PackStates) => void>();
  let retries = 0;
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
        const pack = path.split("/")[2]!;
        if (missing.has(pack)) throw new PacksUnavailableError([pack]);
        if (!Object.hasOwn(FILES, path)) throw new Error(`not found: ${path}`);
        return FILES[path];
      }),
    ),
    packs: {
      lock,
      store: {
        async states(names) {
          const result: Record<string, PackState> = {};
          for (const name of names)
            if (Object.hasOwn(lock.packs, name))
              if (!lock.packs[name as PackName].bundled)
                result[name] = Object.hasOwn(packStates, name)
                  ? packStates[name]!
                  : { state: "downloading", received: 0, total: 0 };
          return result;
        },
        downloaded: async () => [],
        remove: async () => {},
      },
      retry: () => {
        retries++;
      },
    },
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
    openOptionsPage: async () => {
      optionsOpened++;
    },
  });
  const requests: Request[] = [];
  const sendFn = (async (request: Request) => {
    requests.push(request);
    const reply = await handle(request);
    if (!reply.ok) {
      if (reply.code === "packsUnavailable")
        throw new PacksUnavailableError(reply.packs);
      throw new Error(reply.error);
    }
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
    watchSettings: settingsWatchers.watch,
    /** A change made elsewhere: stored, then told to the watchers as `storage.onChanged` does. */
    changeSettings(patch: SettingsPatch) {
      settings = mergeSettings(patch, settings);
      settingsWatchers.emit(settings);
    },
    optionsOpened: () => optionsOpened,
    /**
     * `watchPackState`: the states a moment later (as storage.local is read, and
     * dropped when a change came first), then each `setPackStates`.
     */
    watchPackState(listener: (states: PackStates) => void) {
      packListeners.add(listener);
      const now = packStates;
      setTimeout(() => {
        if (packListeners.has(listener) && packStates === now) listener(now);
      }, 0);
      return () => {
        packListeners.delete(listener);
      };
    },
    /**
     * The background writes `packState`: the packs it says are usable are on the
     * device from now on.
     */
    setPackStates(states: PackStates) {
      packStates = states;
      for (const [pack, state] of Object.entries(states))
        if (packUsable(state)) missing.delete(pack);
      for (const listener of [...packListeners]) listener(states);
    },
    packWatchers: () => packListeners.size,
    retries: () => retries,
    async close() {
      db.close();
      await db.delete();
    },
  };
}
