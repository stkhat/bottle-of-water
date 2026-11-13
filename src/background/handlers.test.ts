import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { TermIndex } from "../core/classify";
import type { PackName } from "../core/packs/load";
import { applyOverrides, readLock, type PackLock } from "../core/packs/lock";
import type { PackState } from "../core/packs/state";
import { blockCasing, documentCasing } from "../core/text/casing";
import { tokenize } from "../core/text/tokenize";
import type {
  AnalyzeResult,
  Reply,
  Request,
  SourceInput,
  SyncStatus,
  TermRecord,
  TermSummary,
} from "../messaging/protocol";
import type { OccurrenceRecord, SourceRecord } from "./db";
import { createHandlers, type Handle, type HandlerDeps } from "./handlers";
import type { HistoryItem, HistoryStore } from "./history-store";
import { createLanguageResources } from "./language-resources";
import type { DownloadedPack, PackStore } from "./pack-store";
import { getSettings, setSettings } from "./settings-store";
import type {
  ImportedOccurrence,
  OccurrenceWithSource,
  TermStore,
} from "./term-store";
import { replyValue } from "../testing/handlers";
import { filesRead, stubPackLoader } from "../testing/packs";
import { ARTICLE } from "../testing/sources";
import type { TranslationCache } from "./translation-cache";

type FakeStore = { [K in keyof TermStore]: Mock<TermStore[K]> };

/** A TermStore whose methods record their calls; tests give the answers they need. */
function fakeStore(): FakeStore {
  const fail = (name: string) => async () => {
    throw new Error(`unexpected call to ${name}`);
  };
  return {
    saveTerm: vi.fn(fail("saveTerm")),
    setStatus: vi.fn(fail("setStatus")),
    removeTerm: vi.fn(fail("removeTerm")),
    recordEncounters: vi.fn(fail("recordEncounters")),
    saveAll: vi.fn(fail("saveAll")),
    undoSaveAll: vi.fn(fail("undoSaveAll")),
    counts: vi.fn(fail("counts")),
    termIndex: vi.fn(async (): Promise<TermIndex> => new Map()),
    listTerms: vi.fn(fail("listTerms")),
    occurrencesOf: vi.fn(async (): Promise<OccurrenceWithSource[]> => []),
    occurrenceStats: vi.fn(fail("occurrenceStats")),
    exportJson: vi.fn(fail("exportJson")),
    importJson: vi.fn(fail("importJson")),
    applySynced: vi.fn(fail("applySynced")),
    languages: vi.fn(fail("languages")),
    getMeta: vi.fn(fail("getMeta")),
    setMeta: vi.fn(fail("setMeta")),
    onChange: vi.fn(() => () => {}),
    importOccurrences: vi.fn(fail("importOccurrences")),
  };
}

type FakeHistory = { [K in keyof HistoryStore]: Mock<HistoryStore[K]> };

/** A HistoryStore like `fakeStore()`: nothing kept unless a test says so. */
function fakeHistory(): FakeHistory {
  const fail = (name: string) => async () => {
    throw new Error(`unexpected call to ${name}`);
  };
  return {
    record: vi.fn(fail("record")),
    find: vi.fn(async (): Promise<ImportedOccurrence[]> => []),
    status: vi.fn(fail("status")),
    clear: vi.fn(fail("clear")),
    forgetHost: vi.fn(fail("forgetHost")),
  };
}

type FakeTranslations = {
  [K in keyof TranslationCache]: Mock<TranslationCache[K]>;
} & {
  /** The cached translations, by `${pair}:${text}`. */
  rows: Map<string, string>;
};

/** A TranslationCache over a Map that records its calls. */
function fakeTranslations(): FakeTranslations {
  const rows = new Map<string, string>();
  return {
    rows,
    get: vi.fn(async (pair: string, texts: readonly string[]) =>
      Object.fromEntries(
        texts.flatMap((text): [string, string][] => {
          const translated = rows.get(`${pair}:${text}`);
          return translated === undefined ? [] : [[text, translated]];
        }),
      ),
    ),
    put: vi.fn(async (pair, items) => {
      for (const { text, translated } of items)
        rows.set(`${pair}:${text}`, translated);
    }),
    clearPair: vi.fn(async () => {
      throw new Error("unexpected call to clearPair");
    }),
  };
}

type FakePacks = {
  lock: PackLock;
  store: {
    [K in "states" | "downloaded" | "remove"]: Mock<PackStore[K]>;
  };
  retry: Mock<() => void>;
};

/** The lock of a build that downloads es and es-en. */
const DOWNLOAD_LOCK = applyOverrides(
  readLock(),
  { WXT_PACKS_DOWNLOAD: "es,es-en" },
  "test",
);

/** A pack's size in the lock. */
const lockSize = (pack: PackName) =>
  DOWNLOAD_LOCK.packs[pack].files.reduce((sum, file) => sum + file.size, 0);

/** Downloaded packs: none stored and no state unless a test says so. */
function fakePacks(): FakePacks {
  return {
    lock: DOWNLOAD_LOCK,
    store: {
      states: vi.fn(async () => ({})),
      downloaded: vi.fn(async (): Promise<DownloadedPack[]> => []),
      remove: vi.fn(async () => {}),
    },
    retry: vi.fn(),
  };
}

const SYNC_STATUS: SyncStatus = {
  enabled: true,
  bytesUsed: 120,
  quotaBytes: 102_400,
  syncedCount: 3,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

const LOAF: TermRecord = {
  id: "en:loaf",
  lang: "en",
  key: "loaf",
  display: "loaves",
  kind: "word",
  status: "learning",
  createdAt: 1_000,
  updatedAt: 1_000,
};

const SOURCE = ARTICLE;

let store: FakeStore;
let history: FakeHistory;
let translations: FakeTranslations;
let sync: { status: Mock<() => Promise<SyncStatus>> };
let deps: HandlerDeps;
let handle: Handle;
let openOptionsPage: Mock<() => Promise<void>>;
let loadPack: ReturnType<typeof stubPackLoader>;
let packs: FakePacks;

beforeEach(() => {
  fakeBrowser.reset();
  store = fakeStore();
  history = fakeHistory();
  translations = fakeTranslations();
  sync = { status: vi.fn(async () => SYNC_STATUS) };
  loadPack = stubPackLoader();
  packs = fakePacks();
  openOptionsPage = vi.fn(async () => {});
  deps = {
    store,
    history,
    translations,
    settings: { get: getSettings, set: setSettings },
    resources: createLanguageResources(loadPack),
    packs,
    sync,
    openOptionsPage,
  };
  handle = createHandlers(deps);
});

const value = replyValue(() => handle);

describe("handlers: routing", () => {
  it("answers getSettings and setSettings from the settings store", async () => {
    expect(await value({ type: "getSettings" })).toMatchObject({
      knownLevel: 3000,
    });
    expect(
      await value({ type: "setSettings", patch: { knownLevel: 5000 } }),
    ).toMatchObject({ knownLevel: 5000 });
    expect(await getSettings()).toMatchObject({ knownLevel: 5000 });
  });

  it("opens the options page for openOptions (content scripts cannot)", async () => {
    expect(await value({ type: "openOptions" })).toBeNull();
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it("answers syncStatus from the sync backend", async () => {
    expect(await value({ type: "syncStatus" })).toEqual(SYNC_STATUS);
  });

  it("answers lastExport with when the data was last exported, or null", async () => {
    store.getMeta.mockResolvedValueOnce(undefined);
    expect(await value({ type: "lastExport" })).toBeNull();
    store.getMeta.mockResolvedValueOnce(5_000);
    expect(await value({ type: "lastExport" })).toBe(5_000);
    expect(store.getMeta).toHaveBeenCalledWith("lastExportAt");
  });

  it("passes saveTerm's input to the store", async () => {
    store.saveTerm.mockResolvedValue(LOAF);
    const input = {
      lang: "en",
      key: "loaf",
      display: "loaves",
      kind: "word",
      status: "learning",
      source: SOURCE,
      sentence: "Two loaves of bread.",
      pos: { textQuote: "Two loaves of bread." },
    } as const;
    expect(await value({ type: "saveTerm", ...input })).toEqual(LOAF);
    expect(store.saveTerm).toHaveBeenCalledWith(input);
  });

  it.each<{
    request: Request;
    method: keyof TermStore;
    args: unknown[];
    result: unknown;
    expected?: unknown;
  }>([
    {
      request: { type: "setStatus", id: "en:loaf", status: "known" },
      method: "setStatus",
      args: ["en:loaf", "known"],
      result: { ...LOAF, status: "known" },
    },
    {
      request: { type: "removeTerm", id: "en:loaf" },
      method: "removeTerm",
      args: ["en:loaf"],
      result: undefined,
      expected: null,
    },
    {
      request: {
        type: "recordEncounters",
        source: SOURCE,
        items: [
          {
            termId: "en:loaf",
            sentence: "A loaf.",
            pos: { textQuote: "A loaf." },
          },
        ],
      },
      method: "recordEncounters",
      args: [
        SOURCE,
        [
          {
            termId: "en:loaf",
            sentence: "A loaf.",
            pos: { textQuote: "A loaf." },
          },
        ],
      ],
      result: 1,
    },
    {
      request: {
        type: "saveAll",
        lang: "en",
        keys: ["yeast", "crust"],
        status: "learning",
        source: SOURCE,
      },
      method: "saveAll",
      args: ["en", ["yeast", "crust"], "learning", SOURCE],
      result: { batchId: "b1", count: 2 },
    },
    {
      request: { type: "undoSaveAll", batchId: "b1" },
      method: "undoSaveAll",
      args: ["b1"],
      result: 2,
    },
    {
      request: { type: "counts", lang: "en" },
      method: "counts",
      args: ["en"],
      result: { learning: 1, known: 2, phrases: 0 },
    },
    {
      request: { type: "exportJson" },
      method: "exportJson",
      args: [],
      result: '{"format":"lingo-export"}',
    },
    {
      request: { type: "importJson", json: "{}" },
      method: "importJson",
      args: ["{}"],
      result: { terms: 1, sources: 0, occurrences: 0 },
    },
  ])("routes $request.type to the store", async (c) => {
    const method = store[c.method] as Mock;
    method.mockResolvedValue(c.result);
    expect(await value(c.request)).toEqual(
      "expected" in c ? c.expected : c.result,
    );
    expect(method).toHaveBeenCalledWith(...c.args);
  });
});

describe("handlers: errors", () => {
  it("answers an error for unknown requests", async () => {
    expect(await handle({ type: "nope" })).toEqual({
      ok: false,
      error: "Unknown request: nope",
    });
    for (const request of [undefined, null, "counts", 3, {}, { type: 3 }])
      expect(await handle(request)).toEqual({
        ok: false,
        error: "Unknown request",
      });
  });

  it("does not treat inherited object properties as request types", async () => {
    expect(await handle({ type: "toString" })).toEqual({
      ok: false,
      error: "Unknown request: toString",
    });
  });

  it("turns a failure into an error reply", async () => {
    store.setStatus.mockRejectedValue(new Error("No saved term en:dough"));
    const reply: Reply = await handle({
      type: "setStatus",
      id: "en:dough",
      status: "known",
    });
    expect(reply).toEqual({ ok: false, error: "No saved term en:dough" });
  });

  it("answers an error for languages without packs", async () => {
    expect(
      await handle({ type: "analyze", lang: "fr", blocks: ["Bonjour"] }),
    ).toEqual({ ok: false, error: "No language pack for fr" });
  });
});

describe("handlers: language data", () => {
  const ready = (pack: PackName): PackState => ({
    state: "ready",
    received: lockSize(pack),
    total: lockSize(pack),
  });

  /** Handlers whose packs in `missing` are not on the device. */
  function withMissing(...missing: PackName[]) {
    return createHandlers({
      ...deps,
      resources: createLanguageResources(
        stubPackLoader(new Set(), new Set(missing)),
      ),
    });
  }

  it("answers packsUnavailable with the packs a request needs that are not on the device", async () => {
    await setSettings({ learningLang: "es", nativeLang: "en" });
    const handle = withMissing("es", "es-en");
    const analyzed = await handle({
      type: "analyze",
      lang: "es",
      blocks: ["Estoy comiendo."],
    });
    expect(analyzed).toEqual({
      ok: false,
      error: "Language data not available: es",
      code: "packsUnavailable",
      packs: ["es"],
    });
    expect(JSON.parse(JSON.stringify(analyzed))).toEqual(analyzed);
    expect(await handle({ type: "lookup", lang: "es", key: "comer" })).toEqual({
      ok: false,
      error: "Language data not available: es, es-en",
      code: "packsUnavailable",
      packs: ["es", "es-en"],
    });
  });

  it("names only the packs that are missing", async () => {
    await setSettings({ learningLang: "es", nativeLang: "en" });
    const handle = withMissing("es-en");
    expect(
      await handle({ type: "analyze", lang: "es", blocks: ["Estoy."] }),
    ).toMatchObject({ ok: true });
    expect(await handle({ type: "warmDictionary", lang: "es" })).toMatchObject({
      ok: false,
      code: "packsUnavailable",
      packs: ["es-en"],
    });
  });

  it("classifies without the tags' choices while the dictionary is not on the device", async () => {
    const handle = withMissing("en-ja");
    const reply = await handle({
      type: "analyze",
      lang: "en",
      blocks: ["The yeast rose."],
    });
    expect(reply).toMatchObject({ ok: true });
    const { spans } = (reply as { value: AnalyzeResult }).value;
    expect(spans[0]!.find((s) => s.start === 10)).toMatchObject({
      key: "rose",
    });
    expect(spans[0]!.some((s) => "pos" in s)).toBe(false);
  });

  it("lists the word list's rows without meanings, and without the dictionary, when asked", async () => {
    await setSettings({ learningLang: "es", nativeLang: "en" });
    const comer: TermRecord = {
      id: "es:comer",
      lang: "es",
      key: "comer",
      display: "comiendo",
      kind: "word",
      status: "learning",
      createdAt: 500,
      updatedAt: 500,
    };
    store.listTerms.mockResolvedValue([comer]);
    store.occurrenceStats.mockResolvedValue(
      new Map([["es:comer", { count: 2, lastSeen: 900 }]]),
    );
    const handle = withMissing("es-en");
    expect(
      await handle({ type: "listTermsWithStats", lang: "es" }),
    ).toMatchObject({ ok: false, code: "packsUnavailable", packs: ["es-en"] });
    expect(
      await handle({ type: "listTermsWithStats", lang: "es", meanings: false }),
    ).toEqual({
      ok: true,
      value: [
        {
          id: "es:comer",
          key: "comer",
          display: "comiendo",
          kind: "word",
          status: "learning",
          seen: 2,
          lastSeen: 900,
          createdAt: 500,
        },
      ],
    });
  });

  it("gives no data row for a pair whose packs are all bundled, and lists the other downloaded packs", async () => {
    packs.store.downloaded.mockResolvedValue([
      { pack: "es", version: "2026.1111.0", size: 120 },
      { pack: "es-en", version: "2026.1111.0", size: 80 },
    ]);
    expect(await value({ type: "packStatus" })).toEqual({
      pair: { bundled: true, packs: [] },
      others: [
        { pack: "es", size: 120 },
        { pack: "es-en", size: 80 },
      ],
    });
  });

  it("gives the state and size of each downloaded pack of the pair", async () => {
    await setSettings({ learningLang: "es", nativeLang: "en" });
    const downloading: PackState = {
      state: "downloading",
      received: 1000,
      total: lockSize("es-en"),
    };
    packs.store.states.mockResolvedValue({
      es: ready("es"),
      "es-en": downloading,
    });
    packs.store.downloaded.mockResolvedValue([
      { pack: "es", version: "2026.1111.0", size: lockSize("es") },
    ]);
    expect(await value({ type: "packStatus" })).toEqual({
      pair: {
        bundled: false,
        packs: [
          { pack: "es", size: lockSize("es"), ...ready("es") },
          { pack: "es-en", size: lockSize("es-en"), ...downloading },
        ],
      },
      others: [],
    });
    expect(packs.store.states).toHaveBeenCalledWith(["es", "es-en"]);
  });

  it("starts the current pair's downloads again for retryPacks", async () => {
    expect(await value({ type: "retryPacks" })).toBeNull();
    expect(packs.retry).toHaveBeenCalledTimes(1);
  });

  it("removes a downloaded pack and the machine translations of the pairs that use it", async () => {
    packs.store.downloaded.mockResolvedValue([
      { pack: "es", version: "2026.1111.0", size: 120 },
      { pack: "es-en", version: "2026.1111.0", size: 80 },
    ]);
    translations.clearPair.mockResolvedValue();
    expect(await value({ type: "removePack", pack: "es-en" })).toBeNull();
    expect(packs.store.remove).toHaveBeenCalledWith("es-en");
    expect(translations.clearPair.mock.calls).toEqual([["es>en"]]);
    expect(await value({ type: "removePack", pack: "es" })).toBeNull();
    expect(packs.store.remove).toHaveBeenLastCalledWith("es");
    expect(translations.clearPair.mock.calls).toEqual([["es>en"], ["es>en"]]);
  });

  it("removes nothing that is not downloaded, and nothing the chosen languages use", async () => {
    packs.store.downloaded.mockResolvedValue([
      { pack: "es", version: "2026.1111.0", size: 120 },
    ]);
    expect(await value({ type: "removePack", pack: "es-en" })).toBeNull();
    await setSettings({ learningLang: "es", nativeLang: "en" });
    expect(await value({ type: "removePack", pack: "en-defs" })).toBeNull();
    expect(await handle({ type: "removePack", pack: "es" })).toEqual({
      ok: false,
      error: "es is used by the chosen languages",
    });
    expect(
      await handle({ type: "removePack", pack: 3 } as unknown as Request),
    ).toEqual({ ok: false, error: "No pack to remove" });
    expect(packs.store.remove).not.toHaveBeenCalled();
    expect(translations.clearPair).not.toHaveBeenCalled();
  });
});

/** The casing of a document made of `blocks`, as the content scripts send it. */
const casingOf = (blocks: string[]) =>
  documentCasing(blocks.map((b) => blockCasing(tokenize(b, "en"), "en")));

describe("handlers: analyze", () => {
  it("classifies each block and lists the distinct unsaved and saved keys", async () => {
    store.termIndex.mockResolvedValue(
      new Map([
        ["crust", "learning"],
        ["the", "known"],
      ]),
    );
    const blocks = ["The loaves ferments.", "Yeast ferments the crust."];
    const result = await value({ type: "analyze", lang: "en", blocks });
    expect(store.termIndex).toHaveBeenCalledWith("en");
    const brief = result.spans.map((spans, i) =>
      spans.map(
        (s) => `${blocks[i]!.slice(s.start, s.end)}=${s.key}:${s.category}`,
      ),
    );
    expect(brief).toEqual([
      ["The=the:known", "loaves=loaf:known", "ferments=ferment:new"],
      [
        "Yeast=yeast:known",
        "ferments=ferment:new",
        "the=the:known",
        "crust=crust:learning",
      ],
    ]);
    expect(result.unsaved).toEqual(["ferment"]);
    // "loaf" is known by its rank, not saved.
    expect(result.saved).toEqual(["the", "crust"]);
  });

  it("does not load the dictionary for a language without a tagger or names", async () => {
    await setSettings({ learningLang: "es", nativeLang: "en" });
    await value({ type: "analyze", lang: "es", blocks: ["Una casa."] });
    expect(
      filesRead(loadPack).filter((p) => !p.startsWith("/packs/es/")),
    ).toEqual([]);
  });

  it("chooses a word's key and part of speech by its tag (rules A1 and A2), with the dictionary", async () => {
    // The test tagger knows "rose" as a past tense: its key is the verb it is a form
    // of, and its lookup shows that verb's senses (its span's part of speech).
    const blocks = ["The yeast rose."];
    const result = await value({ type: "analyze", lang: "en", blocks });
    const rose = result.spans[0]!.find((s) => s.start === 10);
    expect(rose).toMatchObject({ key: "rise", pos: "verb", category: "new" });
    expect(result.unsaved).toContain("rise");
    expect(filesRead(loadPack)).toContain("/packs/en-ja/pos.json");
    // A word the tagger is not sure of keeps its key and gets no part of speech.
    const yeast = result.spans[0]!.find((s) => s.key === "yeast");
    expect(yeast).not.toHaveProperty("pos");
  });

  it("keeps a saved word's key whatever its tag says", async () => {
    store.termIndex.mockResolvedValue(new Map([["rose", "learning"]]));
    const result = await value({
      type: "analyze",
      lang: "en",
      blocks: ["The yeast rose."],
    });
    expect(result.spans[0]!.find((s) => s.start === 10)).toMatchObject({
      key: "rose",
      category: "learning",
      pos: "verb",
    });
  });

  it("takes a word the document always capitalises for a name: ignored, no dictionary meaning kept", async () => {
    // "crust" is a given name in the test lexicon; its capitalised headword is about
    // one person. "Yeast" is capitalised inside a sentence: its capitalised senses count.
    const blocks = ["We met Crust in town.", "Crust waved at the Yeast shop."];
    const result = await value({
      type: "analyze",
      lang: "en",
      blocks,
      casing: casingOf(blocks),
    });
    const crust = result.spans[0]!.find((s) => s.key === "crust");
    expect(crust).toMatchObject({ category: "ignored", name: true });
    expect(result.spans[1]!.find((s) => s.key === "yeast")).toMatchObject({
      category: "known",
      capital: true,
    });
  });

  it("reads no names from a caseless document or a casing it cannot read", async () => {
    const upper = ["WE MET CRUST IN TOWN.", "CRUST WAVED."];
    const caseless = await value({
      type: "analyze",
      lang: "en",
      blocks: upper,
      casing: casingOf(upper),
    });
    expect(caseless.spans.flat().some((s) => s.name || s.capital)).toBe(false);
    const broken = await value({
      type: "analyze",
      lang: "en",
      blocks: ["We met Crust."],
      casing: { mode: "mixed", words: { crust: "many" } } as never,
    });
    expect(broken.spans.flat().some((s) => s.name)).toBe(false);
  });

  it("uses the known level from the settings", async () => {
    await setSettings({ knownLevel: 2000 });
    expect(
      await value({ type: "analyze", lang: "en", blocks: ["Yeast", ""] }),
    ).toEqual({
      spans: [
        [{ start: 0, end: 5, key: "yeast", kind: "word", category: "new" }],
        [],
      ],
      unsaved: ["yeast"],
      saved: [],
    });
  });
});

describe("handlers: matchSelection", () => {
  const TEXT = "She made up her mind. Then she gave up.";
  /** The request for a selection of `words` (the first time they are in TEXT). */
  const selecting = (words: string, lang = "en") => {
    const start = TEXT.indexOf(words);
    return {
      type: "matchSelection" as const,
      lang,
      text: TEXT,
      start,
      end: start + words.length,
    };
  };

  /** Where `words` are in TEXT (the first time). */
  const at = (words: string) => ({
    start: TEXT.indexOf(words),
    end: TEXT.indexOf(words) + words.length,
  });

  it("gives the pattern the selected words stand for, slots filled", async () => {
    expect(await value(selecting("made up her mind"))).toEqual({
      key: "make up one's mind",
      ...at("made up her mind"),
    });
  });

  it("lets the sentence complete a selection that is part of a longer pattern", async () => {
    expect(await value(selecting("made up"))).toEqual({
      key: "make up one's mind",
      ...at("made up her mind"),
    });
  });

  it("takes every word the selection touches", async () => {
    const { start, end } = selecting("made up her mind");
    expect(
      await value({
        ...selecting("made up her mind"),
        start: start + 2,
        end: end - 1,
      }),
    ).toEqual({ key: "make up one's mind", ...at("made up her mind") });
  });

  it("gives no key when the selection matches no pattern", async () => {
    expect(await value(selecting("mind. Then she"))).toEqual({});
    expect(await value(selecting("She made"))).toEqual({});
  });

  it("does not load the dictionary", async () => {
    await value(selecting("made up her mind"));
    expect(
      filesRead(loadPack).filter((p) => !p.startsWith("/packs/en/")),
    ).toEqual([]);
  });

  it("answers an error for a language without a pack", async () => {
    expect(await handle(selecting("made up", "fr"))).toEqual({
      ok: false,
      error: "No language pack for fr",
    });
  });
});

const OCCURRENCE_BASE: Omit<OccurrenceRecord, "sourceId" | "sentence" | "pos"> =
  {
    termId: "en:loaf",
    seenAt: 0,
    origin: "encountered",
  };

function occurrence(
  id: number,
  source: SourceRecord,
  sentence: string,
  pos: OccurrenceRecord["pos"],
): OccurrenceWithSource {
  return {
    ...OCCURRENCE_BASE,
    id,
    sourceId: source.id,
    sentence,
    pos,
    seenAt: id,
    source,
  };
}

const BREAD: SourceRecord = {
  id: "s-bread",
  platform: "web",
  url: "https://example.com/bread",
  title: "Bread",
  lang: "en",
  firstSeen: 0,
  lastSeen: 0,
};
const VIDEO: SourceRecord = {
  id: "s-video",
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=abc",
  title: "Baking video",
  lang: "en",
  firstSeen: 0,
  lastSeen: 0,
};

describe("handlers: listTermsWithStats", () => {
  it("gives each saved term with its short meaning, how often and when it was last seen", async () => {
    const lookUp: TermRecord = {
      id: "en:look up",
      lang: "en",
      key: "look up",
      display: "looked up",
      kind: "phrase",
      status: "known",
      createdAt: 500,
      updatedAt: 700,
    };
    store.listTerms.mockResolvedValue([lookUp, LOAF]);
    store.occurrenceStats.mockResolvedValue(
      new Map([["en:loaf", { count: 3, lastSeen: 9_000 }]]),
    );
    expect(await value({ type: "listTermsWithStats", lang: "en" })).toEqual([
      {
        id: "en:look up",
        key: "look up",
        display: "looked up",
        kind: "phrase",
        status: "known",
        // No dictionary entry: no short meaning. No occurrences: seen when saved.
        seen: 0,
        lastSeen: 500,
        createdAt: 500,
      },
      {
        id: "en:loaf",
        key: "loaf",
        display: "loaves",
        kind: "word",
        status: "learning",
        short: "パンのひと塊",
        seen: 3,
        lastSeen: 9_000,
        createdAt: 1_000,
      },
    ]);
    expect(store.listTerms).toHaveBeenCalledWith("en");
    expect(store.occurrenceStats).toHaveBeenCalledWith("en");
  });
  it("gives the language of a short meaning that is not in the native language", async () => {
    const term = (key: string): TermRecord => ({
      id: `en:${key}`,
      lang: "en",
      key,
      display: key,
      kind: "phrase",
      status: "learning",
      createdAt: 1,
      updatedAt: 1,
    });
    store.listTerms.mockResolvedValue([term("figure out"), term("give up")]);
    store.occurrenceStats.mockResolvedValue(new Map());
    const [figureOut, giveUp] = (await value({
      type: "listTermsWithStats",
      lang: "en",
    })) as TermSummary[];
    expect(figureOut).toMatchObject({
      short: "To come to understand",
      glossLang: "en",
    });
    expect(giveUp).toMatchObject({ short: "諦める" });
    expect(giveUp).not.toHaveProperty("glossLang");
  });
});

describe("handlers: termSummaries", () => {
  it("gives each term's short meaning and saved status, new when not saved", async () => {
    store.termIndex.mockResolvedValue(
      new Map([
        ["loaf", "learning"],
        ["give up", "known"],
      ]),
    );
    expect(
      await value({
        type: "termSummaries",
        lang: "en",
        keys: ["loaf", "give up", "figure out", "sourdough"],
      }),
    ).toEqual({
      loaf: { short: "パンのひと塊", status: "learning" },
      "give up": { short: "諦める", status: "known" },
      "figure out": {
        short: "To come to understand",
        glossLang: "en",
        status: "new",
      },
      // No dictionary entry: no short meaning.
      sourdough: { status: "new" },
    });
    expect(store.termIndex).toHaveBeenCalledWith("en");
  });

  it("answers an empty list with nothing", async () => {
    expect(
      await value({ type: "termSummaries", lang: "en", keys: [] }),
    ).toEqual({});
  });

  it("uses the dictionary of the native language from the settings", async () => {
    await setSettings({ nativeLang: "fr" });
    expect(
      await handle({
        type: "termSummaries",
        lang: "en",
        keys: ["loaf"],
      }),
    ).toEqual({ ok: false, error: "No dictionary from en to fr" });
  });
});

describe("handlers: warmDictionary", () => {
  it("loads the dictionary of the native language before any lookup", async () => {
    expect(filesRead(loadPack)).toEqual([]);
    expect(await value({ type: "warmDictionary", lang: "en" })).toBeNull();
    expect(filesRead(loadPack)).toContain("/packs/en-ja/index.json");
  });
});

describe("handlers: lookup", () => {
  beforeEach(() => {
    store.termIndex.mockResolvedValue(new Map([["loaf", "learning"]]));
    store.occurrencesOf.mockResolvedValue([
      occurrence(3, BREAD, "A warm loaf.", { textQuote: "A warm loaf." }),
      occurrence(2, VIDEO, "Shape the loaf.", { timeMs: 12_500 }),
      occurrence(1, BREAD, "Two loaves.", { textQuote: "Two loaves." }),
    ]);
  });

  it("gives the entry, the saved status and the occurrences here and elsewhere", async () => {
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      sourceUrl: "https://example.com/bread?utm_source=feed#top",
    });
    expect(store.occurrencesOf).toHaveBeenCalledWith("en:loaf");
    expect(result).toEqual({
      entry: {
        head: "loaf",
        kind: "word",
        ipa: "/loʊf/",
        short: "パンのひと塊",
        lines: ["パンのひと塊"],
        senses: [{ pos: "noun", text: "パンのひと塊" }],
      },
      ipa: "/loʊf/",
      status: "learning",
      termId: "en:loaf",
      here: [
        {
          sentence: "A warm loaf.",
          pos: { textQuote: "A warm loaf." },
          seenAt: 3,
          origin: "encountered",
          source: { title: "Bread", platform: "web", url: BREAD.url },
          link: BREAD.url,
        },
        {
          sentence: "Two loaves.",
          pos: { textQuote: "Two loaves." },
          seenAt: 1,
          origin: "encountered",
          source: { title: "Bread", platform: "web", url: BREAD.url },
          link: BREAD.url,
        },
      ],
      elsewhere: [
        {
          sentence: "Shape the loaf.",
          pos: { timeMs: 12_500 },
          seenAt: 2,
          origin: "encountered",
          source: {
            title: "Baking video",
            platform: "youtube",
            url: VIDEO.url,
          },
          link: "https://www.youtube.com/watch?v=abc&t=12s",
        },
      ],
    });
  });

  it("shows the senses of the part of speech the page's tag gives first (rule A2)", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    // A part of speech that is not a string (a page's mistake) is left out.
    const lookUp = async (pos?: string | number) =>
      (
        await value({
          type: "lookup",
          lang: "en",
          key: "rise",
          ...(pos !== undefined && { pos: pos as string }),
        })
      ).entry;
    // "rise": 上がる (a verb), then 上昇 (a noun).
    expect(await lookUp()).toMatchObject({ lines: ["上がる", "上昇"] });
    expect(await lookUp("verb")).toMatchObject({ lines: ["上がる", "上昇"] });
    const noun = await lookUp("noun");
    expect(noun).toMatchObject({ short: "上がる", lines: ["上昇", "上がる"] });
    // The senses keep the dictionary's order.
    expect(noun?.senses.map((s) => s.text)).toEqual(["上がる", "上昇"]);
    expect(await lookUp(3)).toMatchObject({ lines: ["上がる", "上昇"] });
  });

  it("matches the video here whatever form its URL takes", async () => {
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      sourceUrl: "https://youtu.be/abc?t=30",
    });
    expect(result).toMatchObject({
      here: [{ sentence: "Shape the loaf." }],
      elsewhere: [{ sentence: "A warm loaf." }, { sentence: "Two loaves." }],
    });
  });

  it("puts every occurrence elsewhere without a usable source URL", async () => {
    for (const sourceUrl of [undefined, "not a url"]) {
      const result = await value({
        type: "lookup",
        lang: "en",
        key: "loaf",
        ...(sourceUrl !== undefined && { sourceUrl }),
      });
      expect(result).toMatchObject({ here: [] });
      expect((result as { elsewhere: unknown[] }).elsewhere).toHaveLength(3);
    }
  });

  it("calls an unsaved term new and leaves out a missing entry", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    expect(
      await value({
        type: "lookup",
        lang: "en",
        key: "sourdough",
      }),
    ).toEqual({
      status: "new",
      termId: "en:sourdough",
      here: [],
      elsewhere: [],
    });
  });

  it("gives the IPA of a phrase no dictionary has", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    expect(
      await value({
        type: "lookup",
        lang: "en",
        key: "yeast loaf",
      }),
    ).toEqual({
      ipa: "/jist loʊf/",
      status: "new",
      termId: "en:yeast loaf",
      here: [],
      elsewhere: [],
    });
  });

  it("gives an English definition with its language", async () => {
    store.occurrencesOf.mockResolvedValue([]);
    expect(
      await value({
        type: "lookup",
        lang: "en",
        key: "figure out",
      }),
    ).toMatchObject({
      entry: { short: "To come to understand", glossLang: "en" },
    });
  });

  it("gives a capitalised word its capitalised senses first, a lowercase one none", async () => {
    const lines = async (written?: "capital" | "lower") =>
      (
        await value({
          type: "lookup",
          lang: "en",
          key: "yeast",
          ...(written && { written }),
        })
      ).entry?.lines;
    expect(await lines("capital")).toEqual(["イースト国", "酵母"]);
    expect(await lines("lower")).toEqual(["酵母"]);
    expect(await lines()).toEqual(["酵母", "イースト国"]);
  });

  it("loads the dictionary on the first lookup", async () => {
    expect(filesRead(loadPack)).toEqual([]);
    await value({ type: "lookup", lang: "en", key: "loaf" });
    expect(filesRead(loadPack)).toContain("/packs/en-ja/index.json");
  });

  it("looks up in the dictionary of the native language from the settings", async () => {
    await setSettings({ nativeLang: "fr" });
    expect(await handle({ type: "lookup", lang: "en", key: "loaf" })).toEqual({
      ok: false,
      error: "No dictionary from en to fr",
    });
  });
});

describe("handlers: machine translations of English definitions", () => {
  // "figure out" has only an English definition (en-defs): see src/testing/packs.ts.
  const SHORT = "To come to understand";
  const SENSES = [
    "To come to understand; to discover.",
    "To solve (a problem).",
    "to find a solution by thinking.",
  ];
  const cache = (pair: string, entries: Record<string, string>) => {
    for (const [text, translated] of Object.entries(entries))
      translations.rows.set(`${pair}:${text}`, translated);
  };
  const lookUp = (key: string) => value({ type: "lookup", lang: "en", key });

  it("gives the cached translations of the short meaning and the first four senses, by cleaned English", async () => {
    cache("en>ja", {
      [SHORT]: "理解するようになる",
      [SENSES[1]!]: "（問題を）解く。",
      [SENSES[2]!]: "考えて解決策を見つける。",
      "To calculate an amount.": "量を計算する。",
    });
    const result = await lookUp("figure out");
    // Labels are dropped, pointers left out, the fifth sense not asked for.
    expect(translations.get).toHaveBeenCalledExactlyOnceWith("en>ja", [
      SHORT,
      ...SENSES,
    ]);
    expect(result.translations).toEqual({
      [SHORT]: "理解するようになる",
      [SENSES[1]!]: "（問題を）解く。",
      [SENSES[2]!]: "考えて解決策を見つける。",
    });
    // The entry itself stays in English.
    expect(result.entry).toMatchObject({ short: SHORT, glossLang: "en" });
  });

  it("leaves translations out when none is cached", async () => {
    expect(await lookUp("figure out")).not.toHaveProperty("translations");
  });

  it("does not read the cache for a meaning in the native language", async () => {
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
    });
    expect(result).not.toHaveProperty("translations");
    expect(translations.get).not.toHaveBeenCalled();
  });

  it("does not read the cache when the definitions are in the native language", async () => {
    await setSettings({ nativeLang: "en" });
    const definition = {
      short: SHORT,
      lines: [SHORT],
      senses: [{ text: SENSES[0]! }],
      glossLang: "en",
    };
    handle = createHandlers({
      ...deps,
      resources: {
        ...deps.resources,
        dictionary: async (from, to) => ({
          from,
          to,
          short: () => SHORT,
          entry: (term) => ({ head: term, kind: "phrase", ...definition }),
          outline: () => undefined,
          capitalMeaning: () => undefined,
        }),
      },
    });
    cache("en>en", { [SHORT]: "unexpected" });
    expect(await lookUp("figure out")).not.toHaveProperty("translations");
    expect(translations.get).not.toHaveBeenCalled();
  });

  it("still answers when the cache cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    translations.get.mockRejectedValue(new Error("cache gone"));
    const result = await lookUp("figure out");
    expect(result).toMatchObject({ entry: { short: SHORT }, status: "new" });
    expect(result).not.toHaveProperty("translations");
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("keeps translations sent with cacheTranslations under the learning and native language", async () => {
    expect(
      await value({
        type: "cacheTranslations",
        lang: "en",
        items: [{ text: SHORT, translated: "理解するようになる" }],
      }),
    ).toBeNull();
    expect(translations.put).toHaveBeenCalledExactlyOnceWith("en>ja", [
      { text: SHORT, translated: "理解するようになる" },
    ]);
    expect((await lookUp("figure out")).translations).toEqual({
      [SHORT]: "理解するようになる",
    });
  });

  it("keeps at most 16 translations per request and skips empty or oversized ones", async () => {
    const items = [
      { text: "", translated: "空" },
      { text: "To quit.", translated: "  " },
      { text: "x".repeat(1001), translated: "長い" },
      { text: "To quit.", translated: "y".repeat(4001) },
      ...Array.from({ length: 20 }, (_, i) => ({
        text: `Sense ${i}.`,
        translated: `意味 ${i}。`,
      })),
    ];
    await value({ type: "cacheTranslations", lang: "en", items });
    const [, kept] = translations.put.mock.calls[0]!;
    expect(kept).toHaveLength(16);
    expect(kept[0]).toEqual({ text: "Sense 0.", translated: "意味 0。" });
    expect(kept.at(-1)).toEqual({ text: "Sense 15.", translated: "意味 15。" });
  });

  it("keeps nothing for a language without a pack, or when nothing is left to keep", async () => {
    for (const request of [
      { lang: "fr", items: [{ text: SHORT, translated: "comprendre" }] },
      { lang: "en", items: [] },
      { lang: "en", items: [{ text: " ", translated: "空" }] },
      { lang: "en", items: [{ text: 1, translated: null }] },
      { lang: "en", items: "not a list" },
    ])
      expect(await handle({ type: "cacheTranslations", ...request })).toEqual({
        ok: true,
        value: null,
      });
    expect(translations.put).not.toHaveBeenCalled();
  });

  it("gives a cached translation of the short meaning in termSummaries, marked machine translated", async () => {
    cache("en>ja", { [SHORT]: "理解するようになる" });
    expect(
      await value({
        type: "termSummaries",
        lang: "en",
        keys: ["figure out", "loaf"],
      }),
    ).toEqual({
      "figure out": {
        short: "理解するようになる",
        machineTranslated: true,
        status: "new",
      },
      loaf: { short: "パンのひと塊", status: "new" },
    });
    expect(translations.get).toHaveBeenCalledExactlyOnceWith("en>ja", [SHORT]);
    expect(translations.put).not.toHaveBeenCalled();
  });

  it("gives a cached translation of the short meaning in listTermsWithStats", async () => {
    cache("en>ja", { [SHORT]: "理解するようになる" });
    store.listTerms.mockResolvedValue([
      {
        id: "en:figure out",
        lang: "en",
        key: "figure out",
        display: "figured out",
        kind: "phrase",
        status: "learning",
        createdAt: 1,
        updatedAt: 1,
      },
      LOAF,
    ]);
    store.occurrenceStats.mockResolvedValue(new Map());
    const [figureOut, loaf] = await value({
      type: "listTermsWithStats",
      lang: "en",
    });
    expect(figureOut).toMatchObject({
      short: "理解するようになる",
      machineTranslated: true,
    });
    expect(figureOut).not.toHaveProperty("glossLang");
    expect(loaf).toMatchObject({ short: "パンのひと塊" });
    expect(loaf).not.toHaveProperty("machineTranslated");
  });

  it("does not use a cached translation of a short meaning that is a usage note", async () => {
    // Kept before the definition counted as a usage note: the hover now translates
    // the phrase itself.
    cache("en>ja", { "A mild intensifier": "マイルドなインテンシファイア" });
    expect(
      await value({ type: "termSummaries", lang: "en", keys: ["i mean"] }),
    ).toEqual({
      "i mean": { short: "A mild intensifier", glossLang: "en", status: "new" },
    });
    expect(translations.get).not.toHaveBeenCalled();
  });

  it("does not read the cache for lists without English definitions", async () => {
    await value({
      type: "termSummaries",
      lang: "en",
      keys: ["loaf"],
    });
    expect(translations.get).not.toHaveBeenCalled();
  });
});

const PAGE: SourceInput = {
  platform: "web",
  url: "https://news.example.com/bread",
  title: "Bread news",
  lang: "en",
};

/** Sends recordHistory with one sentence per text and returns the items kept. */
async function recordedKeys(
  texts: string[],
  source: SourceInput = PAGE,
): Promise<string[][]> {
  history.record.mockImplementation(async (_source, items) => items.length);
  await value({
    type: "recordHistory",
    source,
    sentences: texts.map((text) => ({ text, pos: { textQuote: text } })),
  });
  const items = history.record.mock.calls.at(-1)![1];
  return items.map((item) => [...item.keys]);
}

describe("handlers: recordHistory", () => {
  it("keeps the sentences with their keys and says how many were kept", async () => {
    history.record.mockResolvedValue(1);
    const sentences = [
      {
        text: "The loaves ferments.",
        translation: "パンが発酵する。",
        pos: { timeMs: 3_000 },
      },
    ];
    expect(
      await value({ type: "recordHistory", source: PAGE, sentences }),
    ).toEqual({ kept: 1 });
    const expected: HistoryItem[] = [
      { ...sentences[0]!, keys: ["en:ferment"] },
    ];
    expect(history.record).toHaveBeenCalledWith(PAGE, expected);
  });

  it("leaves out the 300 most common base forms", async () => {
    // "the" and "loaf" are ranked 1 and 2; "yeast" 2,500; "ferment" is not ranked.
    expect(await recordedKeys(["The loaves ferments the yeast."])).toEqual([
      ["en:ferment", "en:yeast"],
    ]);
    expect(await recordedKeys(["The loaf."])).toEqual([[]]);
  });

  it("indexes every base form of a word", async () => {
    expect(await recordedKeys(["A rose."])).toEqual([["en:rose", "en:rise"]]);
    // "casa" is ranked 5 in the Spanish test pack, "casar" not at all.
    expect(await recordedKeys(["Dos casas."], { ...PAGE, lang: "es" })).toEqual(
      [["es:casar"]],
    );
  });

  it("indexes the dictionary phrases the classifier finds", async () => {
    expect(await recordedKeys(["They gave up."])).toEqual([
      ["en:give", "en:up", "en:give up"],
    ]);
  });

  it("indexes saved phrases of the source's language only", async () => {
    store.termIndex.mockImplementation(async (lang) =>
      lang === "en" ? new Map([["yeast loaf", "learning"]]) : new Map(),
    );
    expect(await recordedKeys(["Yeast loaf."])).toEqual([
      ["en:yeast", "en:yeast loaf"],
    ]);

    store.termIndex.mockImplementation(async (lang) =>
      lang === "es" ? new Map([["yeast loaf", "learning"]]) : new Map(),
    );
    expect(await recordedKeys(["Yeast loaf."])).toEqual([["en:yeast"]]);
    expect(store.termIndex).toHaveBeenLastCalledWith("en");
  });

  it("indexes a saved phrase with a gap once", async () => {
    store.termIndex.mockResolvedValue(new Map([["figure out", "learning"]]));
    expect(await recordedKeys(["They figure it out."])).toEqual([
      ["en:figure", "en:out", "en:figure out"],
    ]);
  });

  it("leaves the document's names out", async () => {
    const texts = ["We met Crust and the yeast."];
    history.record.mockImplementation(async (_source, items) => items.length);
    await value({
      type: "recordHistory",
      source: PAGE,
      sentences: texts.map((text) => ({ text, pos: { textQuote: text } })),
      casing: casingOf([...texts, "Crust waved."]),
    });
    expect(history.record.mock.calls.at(-1)![1][0]!.keys).toEqual(["en:yeast"]);
    expect(await recordedKeys(texts)).toEqual([["en:crust", "en:yeast"]]);
  });

  it("gives each key once per sentence", async () => {
    expect(await recordedKeys(["Yeast, yeast and more yeast."])).toEqual([
      ["en:yeast"],
    ]);
  });

  it("keeps nothing when sentence history is off", async () => {
    await setSettings({ sentenceHistory: false });
    expect(
      await value({
        type: "recordHistory",
        source: PAGE,
        sentences: [{ text: "Yeast.", pos: { textQuote: "Yeast." } }],
      }),
    ).toEqual({ kept: 0 });
    expect(history.record).not.toHaveBeenCalled();
  });

  it.each([
    { neverRunOn: ["news.example.com"] },
    { neverRunOn: ["Example.com"] },
    { disabledSites: ["example.com"] },
  ])(
    "keeps nothing from a blocked host ($neverRunOn $disabledSites)",
    async (patch) => {
      await setSettings(patch);
      expect(
        await value({
          type: "recordHistory",
          source: PAGE,
          sentences: [{ text: "Yeast.", pos: { textQuote: "Yeast." } }],
        }),
      ).toEqual({ kept: 0 });
      expect(history.record).not.toHaveBeenCalled();
    },
  );

  it("still keeps sentences from other hosts", async () => {
    await setSettings({ disabledSites: ["example.org", "ws.example.com"] });
    expect(await recordedKeys(["Yeast."])).toEqual([["en:yeast"]]);
  });

  it("keeps nothing for a language without a pack, or a source without a URL", async () => {
    for (const source of [
      { ...PAGE, lang: "fr" },
      { ...PAGE, url: "not a url" },
    ]) {
      expect(
        await value({
          type: "recordHistory",
          source,
          sentences: [{ text: "Levure.", pos: { textQuote: "Levure." } }],
        }),
      ).toEqual({ kept: 0 });
    }
    expect(history.record).not.toHaveBeenCalled();
    expect(filesRead(loadPack)).toEqual([]);
  });
});

describe("handlers: incognito tabs", () => {
  const INCOGNITO = { tab: { incognito: true } };

  it("keeps no sentence history from an incognito tab", async () => {
    history.record.mockResolvedValue(1);
    expect(
      await handle(
        {
          type: "recordHistory",
          source: PAGE,
          sentences: [{ text: "Yeast.", pos: { textQuote: "Yeast." } }],
        },
        INCOGNITO,
      ),
    ).toEqual({ ok: true, value: { kept: 0 } });
    expect(history.record).not.toHaveBeenCalled();
    expect(filesRead(loadPack)).toEqual([]);
  });

  it("records no encounters from an incognito tab", async () => {
    store.recordEncounters.mockResolvedValue(1);
    expect(
      await handle(
        {
          type: "recordEncounters",
          source: SOURCE,
          items: [
            {
              termId: "en:loaf",
              sentence: "A loaf.",
              pos: { textQuote: "A loaf." },
            },
          ],
        },
        INCOGNITO,
      ),
    ).toEqual({ ok: true, value: 0 });
    expect(store.recordEncounters).not.toHaveBeenCalled();
  });

  it("still records from a normal tab", async () => {
    history.record.mockResolvedValue(1);
    expect(
      await handle(
        {
          type: "recordHistory",
          source: PAGE,
          sentences: [{ text: "Yeast.", pos: { textQuote: "Yeast." } }],
        },
        { tab: { incognito: false } },
      ),
    ).toEqual({ ok: true, value: { kept: 1 } });
    expect(history.record).toHaveBeenCalledTimes(1);
  });
});

describe("handlers: historyStatus and clearHistory", () => {
  it("answers historyStatus from the history store", async () => {
    history.status.mockResolvedValue({ bytes: 2_048, cap: 50, pages: 3 });
    expect(await value({ type: "historyStatus" })).toEqual({
      bytes: 2_048,
      cap: 50,
      pages: 3,
    });
  });

  it("clears the history for clearHistory", async () => {
    history.clear.mockResolvedValue();
    expect(await value({ type: "clearHistory" })).toBeNull();
    expect(history.clear).toHaveBeenCalledTimes(1);
  });
});

const KEPT: ImportedOccurrence[] = [
  {
    sentence: "Shape the loaf.",
    translation: "パンを成形する。",
    pos: { timeMs: 12_500 },
    seenAt: 9_000,
    source: {
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=abc",
      title: "Baking video",
      lang: "en",
    },
  },
  {
    sentence: "A warm loaf.",
    pos: { textQuote: "A warm loaf." },
    seenAt: 8_000,
    source: {
      platform: "web",
      url: "https://example.org/cake",
      title: "Cake",
      lang: "en",
    },
  },
];

describe("handlers: lookup from the sentence history", () => {
  it("gives an unsaved term's kept sentences from other sources as elsewhere", async () => {
    history.find.mockResolvedValue(KEPT);
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      sourceUrl: "https://example.com/bread",
    });
    expect(history.find).toHaveBeenCalledWith("en:loaf", {
      excludeUrl: "https://example.com/bread",
    });
    expect(result).toMatchObject({ status: "new", here: [] });
    expect(result.elsewhere).toEqual([
      {
        sentence: "Shape the loaf.",
        translation: "パンを成形する。",
        pos: { timeMs: 12_500 },
        seenAt: 9_000,
        origin: "encountered",
        source: {
          title: "Baking video",
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=abc",
        },
        link: "https://www.youtube.com/watch?v=abc&t=12s",
      },
      {
        sentence: "A warm loaf.",
        pos: { textQuote: "A warm loaf." },
        seenAt: 8_000,
        origin: "encountered",
        source: {
          title: "Cake",
          platform: "web",
          url: "https://example.org/cake",
        },
        link: "https://example.org/cake",
      },
    ]);
  });

  it("still answers when the history cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    history.find.mockRejectedValue(new Error("history gone"));
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
      sourceUrl: "https://example.com/bread",
    });
    expect(result).toMatchObject({ status: "new", here: [], elsewhere: [] });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("gives a saved term's occurrences, not the history", async () => {
    store.termIndex.mockResolvedValue(new Map([["loaf", "learning"]]));
    history.find.mockResolvedValue(KEPT);
    const result = await value({
      type: "lookup",
      lang: "en",
      key: "loaf",
    });
    expect(result.elsewhere).toEqual([]);
    expect(history.find).not.toHaveBeenCalled();
  });
});

// The import itself: history-import.browser.test.ts.
describe("handlers: saving brings the kept sentences in", () => {
  const input = {
    lang: "en",
    key: "loaf",
    display: "loaf",
    kind: "word",
    status: "learning",
    source: SOURCE,
    sentence: "A loaf.",
    pos: { textQuote: "A loaf." },
  } as const;

  it.each([
    ["finding the kept sentences", "find"],
    ["importing them", "import"],
  ] as const)(
    "still answers with the saved term when %s fails",
    async (_, failing) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      store.saveTerm.mockResolvedValue(LOAF);
      if (failing === "find")
        history.find.mockRejectedValue(new Error("history gone"));
      else {
        history.find.mockResolvedValue(KEPT);
        store.importOccurrences.mockRejectedValue(new Error("quota"));
      }
      expect(await value({ type: "saveTerm", ...input })).toEqual(LOAF);
      expect(error).toHaveBeenCalledTimes(1);
      error.mockRestore();
    },
  );

  it("does not import for save all", async () => {
    store.saveAll.mockResolvedValue({ batchId: "b1", count: 1 });
    history.find.mockResolvedValue(KEPT);
    await value({
      type: "saveAll",
      lang: "en",
      keys: ["loaf"],
      status: "learning",
      source: SOURCE,
    });
    expect(history.find).not.toHaveBeenCalled();
    expect(store.importOccurrences).not.toHaveBeenCalled();
  });
});
