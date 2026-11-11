// The sentence history brought into a newly saved term, with the real stores on IndexedDB.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
} from "../core/settings";
import type { LingoDb } from "./db";
import { createHandlers, type Handle } from "./handlers";
import { createHistoryStore } from "./history-store";
import { createLanguageResources } from "./language-resources";
import type { SourceInput } from "../messaging/protocol";
import { createTermStore, MAX_OCCURRENCES, type TermStore } from "./term-store";
import { fakeClock } from "../testing/clock";
import { freshDb } from "../testing/db";
import { replyValue } from "../testing/handlers";
import { bundledPacks, stubPackLoader } from "../testing/packs";
import { ARTICLE } from "../testing/sources";
import { createTranslationCache } from "./translation-cache";

const ARTICLE_A: SourceInput = {
  ...ARTICLE,
  url: "https://example.com/bread?utm_source=feed",
};
const VIDEO_B: SourceInput = {
  platform: "youtube",
  url: "https://youtu.be/abc",
  title: "Baking",
  lang: "en",
};
const ARTICLE_C: SourceInput = {
  platform: "web",
  url: "https://example.org/cake",
  title: "Cake",
  lang: "en",
};

let db: LingoDb;
let store: TermStore;
let handle: Handle;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  clock = fakeClock();
  db = freshDb();
  store = createTermStore(db, { now: clock.now });
  let settings: Settings = mergeSettings({}, DEFAULT_SETTINGS);
  handle = createHandlers({
    store,
    history: createHistoryStore(db, { now: clock.now }),
    translations: createTranslationCache(db, { now: clock.now }),
    settings: {
      get: async () => settings,
      set: async (patch) => (settings = mergeSettings(patch, settings)),
    },
    resources: createLanguageResources(stubPackLoader()),
    packs: bundledPacks(),
    sync: { status: () => Promise.reject(new Error("not used")) },
    openOptionsPage: async () => {},
  });
});

const value = replyValue(() => handle);

const keep = (source: SourceInput, ...texts: string[]) =>
  value({
    type: "recordHistory",
    source,
    sentences: texts.map((text) => ({ text, pos: { textQuote: text } })),
  });

const saveYeast = (sentence = "Fresh yeast.") =>
  value({
    type: "saveTerm",
    lang: "en",
    key: "yeast",
    display: "yeast",
    kind: "word",
    status: "learning",
    source: ARTICLE_C,
    sentence,
    pos: { textQuote: sentence },
  });

const brief = async () =>
  (await store.occurrencesOf("en:yeast")).map(
    (o) => `${o.origin}:${o.sentence}@${o.source.title}:${o.seenAt}`,
  );

describe("saving a term brings its kept sentences in", () => {
  it("adds them as encountered occurrences with their sources and times", async () => {
    await keep(ARTICLE_A, "Add the yeast.", "The loaf.");
    clock.tick();
    await value({
      type: "recordHistory",
      source: VIDEO_B,
      sentences: [
        {
          text: "Yeast makes it rise.",
          translation: "酵母で膨らむ。",
          pos: { timeMs: 65_000 },
        },
      ],
    });
    clock.tick();

    // Before saving, the history is "seen elsewhere".
    const before = await value({
      type: "lookup",
      lang: "en",
      key: "yeast",
      sourceUrl: ARTICLE_C.url,
    });
    expect(before.elsewhere.map((o) => o.sentence)).toEqual([
      "Yeast makes it rise.",
      "Add the yeast.",
    ]);

    await saveYeast();
    expect(await brief()).toEqual([
      "saved:Fresh yeast.@Cake:1002000",
      "encountered:Yeast makes it rise.@Baking:1001000",
      "encountered:Add the yeast.@Bread:1000000",
    ]);
    const [, video] = await store.occurrencesOf("en:yeast");
    expect(video).toMatchObject({
      translation: "酵母で膨らむ。",
      pos: { timeMs: 65_000 },
      source: {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=abc",
        title: "Baking",
        lang: "en",
        firstSeen: 1_001_000,
        lastSeen: 1_001_000,
      },
    });

    // Saved now: the lookup gives its occurrences, with links back.
    const after = await value({
      type: "lookup",
      lang: "en",
      key: "yeast",
      sourceUrl: ARTICLE_C.url,
    });
    expect(after.here.map((o) => o.sentence)).toEqual(["Fresh yeast."]);
    expect(after.elsewhere.map((o) => o.link)).toEqual([
      "https://www.youtube.com/watch?v=abc&t=65s",
      "https://example.com/bread",
    ]);
  });

  it("does not duplicate a sentence the term was saved from", async () => {
    await keep(ARTICLE_C, "Fresh yeast.");
    clock.tick();
    await saveYeast("Fresh yeast.");
    expect(await brief()).toEqual(["saved:Fresh yeast.@Cake:1001000"]);
  });

  it("imports once: saving the term again, or importing twice, adds nothing", async () => {
    await keep(ARTICLE_A, "Add the yeast.");
    clock.tick();
    await saveYeast();
    clock.tick();
    await saveYeast();
    expect(await brief()).toEqual([
      "saved:Fresh yeast.@Cake:1002000",
      "encountered:Add the yeast.@Bread:1000000",
    ]);

    const rows = (await store.occurrencesOf("en:yeast"))
      .filter((o) => o.origin === "encountered")
      .map((o) => ({
        source: o.source,
        sentence: o.sentence,
        pos: o.pos,
        seenAt: o.seenAt,
      }));
    expect(await store.importOccurrences("en:yeast", rows)).toBe(0);
    expect(await brief()).toHaveLength(2);
  });

  it("imports again after the term was removed and saved again", async () => {
    await keep(ARTICLE_A, "Add the yeast.");
    clock.tick();
    const term = await saveYeast();
    await value({ type: "removeTerm", id: term.id });
    clock.tick();
    await saveYeast();
    expect(await brief()).toEqual([
      "saved:Fresh yeast.@Cake:1002000",
      "encountered:Add the yeast.@Bread:1000000",
    ]);
  });

  it("keeps a source's newer title when an older sentence comes in", async () => {
    await keep(ARTICLE_A, "Add the yeast.");
    clock.tick();
    await saveYeast();
    clock.tick();
    await store.saveTerm({
      lang: "en",
      key: "loaf",
      display: "loaf",
      kind: "word",
      status: "learning",
      source: { ...ARTICLE_A, title: "Bread, renamed" },
      sentence: "A loaf.",
      pos: { textQuote: "A loaf." },
    });
    await store.importOccurrences("en:yeast", [
      {
        source: ARTICLE_A,
        sentence: "Old yeast.",
        pos: { textQuote: "Old yeast." },
        seenAt: 500,
      },
    ]);
    const old = (await store.occurrencesOf("en:yeast")).find(
      (o) => o.sentence === "Old yeast.",
    );
    expect(old?.source).toMatchObject({
      title: "Bread, renamed",
      firstSeen: 500,
      lastSeen: 1_002_000,
    });
  });

  it("does not import into a term that is not saved", async () => {
    expect(
      await store.importOccurrences("en:yeast", [
        {
          source: ARTICLE_C,
          sentence: "Yeast.",
          pos: { textQuote: "Yeast." },
          seenAt: 1,
        },
      ]),
    ).toBe(0);
    expect(await store.occurrencesOf("en:yeast")).toEqual([]);
  });

  it("stays within the occurrence limit, keeping the saved sentence", async () => {
    const texts = Array.from(
      { length: MAX_OCCURRENCES + 5 },
      (_, i) => `Yeast number ${"x".repeat(i + 1)}.`,
    );
    for (const text of texts) {
      await keep(ARTICLE_A, text);
      clock.tick();
    }
    await saveYeast();
    const occurrences = await store.occurrencesOf("en:yeast");
    expect(occurrences).toHaveLength(MAX_OCCURRENCES);
    expect(occurrences[0]).toMatchObject({
      origin: "saved",
      sentence: "Fresh yeast.",
    });
    // The newest kept sentences are the ones brought in.
    expect(occurrences.at(-1)?.sentence).toBe(texts.at(-(MAX_OCCURRENCES - 1)));
  });
});
