import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, Span } from "../../core/classify";
import type { PackState, PackStates } from "../../core/packs/state";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
} from "../../core/settings";
import { tokenize } from "../../core/text/tokenize";
import type { Request } from "../../messaging/protocol";
import {
  runArticle,
  startArticle,
  type ArticleDeps,
  type ArticleSession,
} from "./article";
import { highlighted } from "../../testing/article";
import { detectEnglish, settingsListeners } from "../../testing/stubs";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((c) => c()));

function fixture(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  cleanups.push(() => root.remove());
  return root;
}

const CATEGORIES: Record<string, Category> = {
  knead: "new",
  loaves: "known",
  heavy: "learning",
  yeast: "known",
  tangy: "new",
};

/**
 * A background that classifies a few words and records the requests. Packs in
 * `missing` are not on the device: analyze fails with `PacksUnavailableError` until
 * `setPackStates` says they are ready (or `stillMissing` keeps them missing).
 */
function fakeDeps(settings: Settings, missingPacks: readonly string[] = []) {
  const requests: Request[] = [];
  const settingsWatchers = settingsListeners(settings);
  const packListeners = new Set<(states: PackStates) => void>();
  const missing = new Set(missingPacks);
  let packStates: PackStates = {};
  let current = settings;
  let mounted = 0;
  const deps: ArticleDeps = {
    send: (async (request: Request) => {
      requests.push(request);
      if (request.type === "getSettings") return current;
      if (
        missing.size > 0 &&
        ["analyze", "warmDictionary", "recordHistory"].includes(request.type)
      )
        throw new PacksUnavailableError([...missing]);
      if (request.type === "analyze") {
        const spans = request.blocks.map((block) =>
          tokenize(block, "en")
            .filter((t) => t.isWord)
            .map((t): Span => ({
              start: t.start,
              end: t.end,
              key: t.text.toLowerCase(),
              kind: "word",
              category: CATEGORIES[t.text.toLowerCase()] ?? "ignored",
            })),
        );
        return { spans, unsaved: [], saved: [] };
      }
      if (request.type === "warmDictionary") return null;
      if (request.type === "recordHistory")
        return { kept: request.sentences.length };
      throw new Error(`unexpected ${request.type}`);
    }) as ArticleDeps["send"],
    watchSettings: settingsWatchers.watch,
    // As storage.local is read: the states come a little later, unless a change
    // came first.
    watchPackState(listener) {
      packListeners.add(listener);
      const now = packStates;
      setTimeout(() => {
        if (packListeners.has(listener) && packStates === now) listener(now);
      }, 0);
      return () => packListeners.delete(listener);
    },
    detectLanguage: detectEnglish,
    mountUi() {
      mounted++;
      return () => mounted--;
    },
  };
  return {
    deps,
    requests,
    mounted: () => mounted,
    changeSettings(s: Settings) {
      current = s;
      settingsWatchers.emit(s);
    },
    settingsWatchers: settingsWatchers.count,
    /** The background writes `packState`: packs ready there are on the device. */
    setPackStates(
      states: PackStates,
      options: { stillMissing?: boolean } = {},
    ) {
      packStates = states;
      if (!options.stillMissing)
        for (const [pack, state] of Object.entries(states))
          if (state.state === "ready") missing.delete(pack);
      for (const listener of [...packListeners]) listener(states);
    },
    packWatchers: () => packListeners.size,
  };
}

const READY: PackState = { state: "ready", received: 100, total: 100 };
const DOWNLOADING: PackState = {
  state: "downloading",
  received: 40,
  total: 100,
};

const ARTICLE = `
  <p>Most home bakers rush the process. They knead, wait an hour, and bake.</p>
  <p>The loaves let time do the heavy lifting.</p>
  <p>The yeast gives a slightly tangy taste.</p>`;

const settings = (patch: object = {}) => mergeSettings(patch, DEFAULT_SETTINGS);

async function start(
  fake: ReturnType<typeof fakeDeps>,
  root: HTMLElement,
  options: { htmlLang?: string; hostname?: string } = {},
) {
  const session = await startArticle(fake.deps, {
    root,
    htmlLang: options.htmlLang ?? "en",
    hostname: options.hostname ?? "example.com",
  });
  if (session) cleanups.push(() => session.stop());
  return session;
}

describe("startArticle", () => {
  it("analyzes the page's blocks and highlights the categories that are on", async () => {
    const fake = fakeDeps(
      settings({ highlight: { new: true, learning: true } }),
    );
    const root = fixture(ARTICLE);
    const session = await start(fake, root);
    expect(session).toBeDefined();
    expect(fake.mounted()).toBe(1);

    await expect
      .poll(() => highlighted("lingo-new"))
      .toEqual(["knead", "tangy"]);
    expect(highlighted("lingo-learning")).toEqual(["heavy"]);
    expect(CSS.highlights.has("lingo-known")).toBe(false);

    const analyze = fake.requests.filter((r) => r.type === "analyze");
    expect(analyze).toEqual([
      {
        type: "analyze",
        lang: "en",
        blocks: [
          "Most home bakers rush the process. They knead, wait an hour, and bake.",
          "The loaves let time do the heavy lifting.",
          "The yeast gives a slightly tangy taste.",
        ],
        // The page's casing: no word is capitalised inside a sentence.
        casing: { mode: "lower", words: {} },
      },
    ]);
    expect(session!.spans.size).toBe(3);
  });

  it("switches categories on and off when the settings change", async () => {
    const fake = fakeDeps(settings());
    const root = fixture(ARTICLE);
    await start(fake, root);
    await expect.poll(() => highlighted("lingo-learning")).toEqual(["heavy"]);
    expect(CSS.highlights.has("lingo-new")).toBe(false);

    fake.changeSettings(
      settings({ highlight: { new: true, learning: false, known: true } }),
    );
    expect(highlighted("lingo-new")).toEqual(["knead", "tangy"]);
    expect(highlighted("lingo-known")).toEqual(["loaves", "yeast"]);
    expect(CSS.highlights.has("lingo-learning")).toBe(false);
  });

  it("re-analyzes blocks that change and drops highlights of removed ones", async () => {
    const fake = fakeDeps(settings({ highlight: { new: true } }));
    const root = fixture(ARTICLE);
    await start(fake, root);
    await expect
      .poll(() => highlighted("lingo-new"))
      .toEqual(["knead", "tangy"]);

    root.querySelectorAll("p")[2]!.remove();
    const added = document.createElement("p");
    added.textContent = "Knead it again.";
    root.append(added);
    await expect
      .poll(() => highlighted("lingo-new").sort())
      .toEqual(["Knead", "knead"]);
  });

  it("warms the dictionary once, after the first analysis", async () => {
    const fake = fakeDeps(settings({ highlight: { new: true } }));
    const root = fixture(ARTICLE);
    await start(fake, root);
    await expect
      .poll(() => fake.requests.map((r) => r.type))
      .toEqual(["getSettings", "analyze", "warmDictionary", "recordHistory"]);
    expect(fake.requests[2]).toEqual({
      type: "warmDictionary",
      lang: "en",
    });

    const added = document.createElement("p");
    added.textContent = "Knead it again.";
    root.append(added);
    await expect
      .poll(() => fake.requests.map((r) => r.type))
      .toEqual([
        "getSettings",
        "analyze",
        "warmDictionary",
        "recordHistory",
        "analyze",
        "recordHistory",
      ]);
  });

  it("sends the sentences of analyzed blocks to the history, each once", async () => {
    const fake = fakeDeps(settings({ highlight: { new: true } }));
    const root = fixture(ARTICLE);
    await start(fake, root);
    const history = () =>
      fake.requests.filter((r) => r.type === "recordHistory");
    await expect.poll(() => history()).toHaveLength(1);
    const quote = (text: string) => ({ text, pos: { textQuote: text } });
    expect(history()[0]).toEqual({
      type: "recordHistory",
      source: {
        platform: "web",
        url: location.href,
        title: document.title,
        lang: "en",
      },
      sentences: [
        quote("Most home bakers rush the process."),
        quote("They knead, wait an hour, and bake."),
        quote("The loaves let time do the heavy lifting."),
        quote("The yeast gives a slightly tangy taste."),
      ],
      casing: { mode: "lower", words: {} },
    });

    // Analyzed again at another level: nothing new to keep.
    fake.changeSettings(
      settings({ highlight: { new: true }, knownLevel: 5000 }),
    );
    await expect
      .poll(() => fake.requests.filter((r) => r.type === "analyze"))
      .toHaveLength(2);
    // A new block: only its sentences, and not one already sent.
    const added = document.createElement("p");
    added.textContent =
      "Knead it again. The yeast gives a slightly tangy taste.";
    root.append(added);
    await expect.poll(() => history()).toHaveLength(2);
    expect(history()[1]).toMatchObject({
      sentences: [quote("Knead it again.")],
    });
  });

  it("sends nothing to the history while it is switched off", async () => {
    const fake = fakeDeps(
      settings({ highlight: { new: true }, sentenceHistory: false }),
    );
    const root = fixture(ARTICLE);
    await start(fake, root);
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    expect(fake.requests.filter((r) => r.type === "recordHistory")).toEqual([]);
  });

  it("follows the sentence-history switch while the page is open", async () => {
    const fake = fakeDeps(
      settings({ highlight: { new: true }, sentenceHistory: false }),
    );
    const root = fixture(ARTICLE);
    await start(fake, root);
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    const history = () =>
      fake.requests.filter((r) => r.type === "recordHistory");
    const analyzed = () =>
      fake.requests.filter((r) => r.type === "analyze").length;
    const addBlock = async (text: string) => {
      const count = analyzed();
      const added = document.createElement("p");
      added.textContent = text;
      root.append(added);
      await expect.poll(analyzed).toBe(count + 1);
    };

    fake.changeSettings(
      settings({ highlight: { new: true }, sentenceHistory: true }),
    );
    await addBlock("Knead it again.");
    await expect.poll(() => history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({
      sentences: [{ text: "Knead it again." }],
    });

    fake.changeSettings(
      settings({ highlight: { new: true }, sentenceHistory: false }),
    );
    await addBlock("Knead it once more.");
    expect(history()).toHaveLength(1);
  });

  it("does nothing on a page in another language", async () => {
    const fake = fakeDeps(settings());
    const root = fixture(ARTICLE);
    await expect(
      start(fake, root, { htmlLang: "ja" }),
    ).resolves.toBeUndefined();
    expect(fake.mounted()).toBe(0);
    expect(fake.requests.map((r) => r.type)).toEqual(["getSettings"]);
    expect(fake.settingsWatchers()).toBe(0);
  });

  it("does nothing on a host in neverRunOn", async () => {
    const fake = fakeDeps(settings({ neverRunOn: ["example.com"] }));
    const root = fixture(ARTICLE);
    await expect(start(fake, root)).resolves.toBeUndefined();
    expect(fake.mounted()).toBe(0);
  });

  it("detects the language on the page's own text when <html lang> is missing", async () => {
    const fake = fakeDeps(settings());
    const samples: string[] = [];
    fake.deps.detectLanguage = async (text) => {
      samples.push(text);
      return {
        isReliable: true,
        languages: [{ language: "en", percentage: 99 }],
      };
    };
    const root = fixture(ARTICLE.repeat(3));
    await expect(start(fake, root, { htmlLang: "" })).resolves.toBeDefined();
    expect(samples).toHaveLength(1);
    expect(samples[0]).toContain("They knead, wait an hour, and bake.");
  });

  it("stops: highlights, stylesheet, UI and listeners go away", async () => {
    const fake = fakeDeps(settings({ highlight: { new: true } }));
    const root = fixture(ARTICLE);
    const sheets = document.adoptedStyleSheets.length;
    const session = (await start(fake, root)) as ArticleSession;
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    session.stop();
    expect(CSS.highlights.has("lingo-new")).toBe(false);
    expect(document.adoptedStyleSheets.length).toBe(sheets);
    expect(fake.mounted()).toBe(0);
    expect(fake.settingsWatchers()).toBe(0);
  });
});

describe("startArticle without its language data", () => {
  const quiet = () => {
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    cleanups.push(() => vi.restoreAllMocks());
    return () => {
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    };
  };
  const analyzed = (fake: ReturnType<typeof fakeDeps>) =>
    fake.requests.filter((r) => r.type === "analyze").length;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("shows nothing, quietly, while the data is missing, and highlights the page once it is ready", async () => {
    const noWarnings = quiet();
    const fake = fakeDeps(settings({ highlight: { new: true } }), ["en"]);
    const session = (await start(fake, fixture(ARTICLE))) as ArticleSession;
    await expect.poll(() => analyzed(fake)).toBe(1);
    await expect.poll(() => fake.packWatchers()).toBe(1);

    fake.setPackStates({ en: DOWNLOADING });
    await pause();
    expect(analyzed(fake)).toBe(1);
    expect(session.spans.size).toBe(0);
    expect(highlighted("lingo-new")).toEqual([]);

    fake.setPackStates({ en: READY });
    await expect
      .poll(() => highlighted("lingo-new"))
      .toEqual(["knead", "tangy"]);
    // The blocks that waited, in one request; nothing watched any more.
    expect(analyzed(fake)).toBe(2);
    expect(fake.packWatchers()).toBe(0);
    noWarnings();
  });

  it("analyzes again at once when the data was ready by the time it looked", async () => {
    const noWarnings = quiet();
    const fake = fakeDeps(settings({ highlight: { new: true } }), ["en"]);
    // The download ends between the failed request and the look at the states.
    const send = fake.deps.send;
    fake.deps.send = (async (request: Request) => {
      try {
        return await send(request as never);
      } finally {
        if (request.type === "analyze") fake.setPackStates({ en: READY });
      }
    }) as typeof send;
    await start(fake, fixture(ARTICLE));
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    expect(analyzed(fake)).toBe(2);
    noWarnings();
  });

  it("waits for a change when the data still fails with the states it ran on", async () => {
    const noWarnings = quiet();
    const fake = fakeDeps(settings({ highlight: { new: true } }), ["en"]);
    await start(fake, fixture(ARTICLE));
    await expect.poll(() => fake.packWatchers()).toBe(1);
    fake.setPackStates({ en: READY }, { stillMissing: true });
    await expect.poll(() => analyzed(fake)).toBe(2);
    await pause();
    expect(analyzed(fake)).toBe(2);
    expect(fake.packWatchers()).toBe(1);

    fake.setPackStates({ en: DOWNLOADING });
    fake.setPackStates({ en: READY });
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    expect(analyzed(fake)).toBe(3);
    noWarnings();
  });

  it("stops watching the data when it stops", async () => {
    const fake = fakeDeps(settings(), ["en"]);
    const session = (await start(fake, fixture(ARTICLE))) as ArticleSession;
    await expect.poll(() => fake.packWatchers()).toBe(1);
    session.stop();
    expect(fake.packWatchers()).toBe(0);
  });
});

describe("runArticle", () => {
  function run(fake: ReturnType<typeof fakeDeps>, htmlLang = "en") {
    const runner = runArticle(fake.deps, {
      root: fixture(ARTICLE),
      htmlLang,
      hostname: "www.example.com",
    });
    cleanups.push(() => runner.stop());
    return runner;
  }
  const off = (hostname = "www.example.com") => ({
    supported: false,
    hostname,
    scope: "page",
    unsaved: 0,
    done: null,
  });

  it("removes Lingo when the site is switched off and brings it back when switched on", async () => {
    const on = settings({ highlight: { new: true } });
    const fake = fakeDeps(on);
    const runner = run(fake);
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    expect(fake.mounted()).toBe(1);

    fake.changeSettings({ ...on, disabledSites: ["www.example.com"] });
    await expect.poll(() => fake.mounted()).toBe(0);
    expect(CSS.highlights.has("lingo-new")).toBe(false);
    expect(await runner.handlePageRequest({ type: "pageSummary" })).toEqual(
      off(),
    );

    fake.changeSettings(on);
    await expect.poll(() => fake.mounted()).toBe(1);
    await expect.poll(() => highlighted("lingo-new")).toHaveLength(2);
    expect(await runner.handlePageRequest({ type: "pageSummary" })).toEqual({
      supported: true,
      hostname: "www.example.com",
      scope: "page",
      unsaved: 2,
      done: null,
    });
  });

  it("starts once the site is switched on when the page loaded with it off", async () => {
    const fake = fakeDeps(settings({ disabledSites: ["example.com"] }));
    const runner = run(fake);
    expect(await runner.handlePageRequest({ type: "pageSummary" })).toEqual(
      off(),
    );
    expect(fake.mounted()).toBe(0);
    fake.changeSettings(settings());
    await expect.poll(() => fake.mounted()).toBe(1);
  });

  it("on a page in another language, answers with the host and does not start on other changes", async () => {
    const fake = fakeDeps(settings());
    const runner = run(fake, "ja");
    expect(await runner.handlePageRequest({ type: "pageSummary" })).toEqual(
      off(),
    );
    fake.changeSettings(settings({ highlight: { new: true } }));
    expect(await runner.handlePageRequest({ type: "pageSummary" })).toEqual(
      off(),
    );
    expect(fake.requests.map((r) => r.type)).toEqual(["getSettings"]);
  });

  it("stops: the UI and every listener go away", async () => {
    const fake = fakeDeps(settings());
    const runner = run(fake);
    await expect.poll(() => fake.mounted()).toBe(1);
    runner.stop();
    expect(fake.mounted()).toBe(0);
    expect(fake.settingsWatchers()).toBe(0);
  });
});
