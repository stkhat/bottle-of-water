import { afterEach, describe, expect, it } from "vitest";
import type { Category, Span } from "../../core/classify";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
} from "../../core/settings";
import { tokenize } from "../../core/text/tokenize";
import type { Request } from "../../messaging/protocol";
import { startArticle, type ArticleDeps, type ArticleSession } from "./article";

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

/** A background that classifies a few words and records the requests. */
function fakeDeps(settings: Settings) {
  const requests: Request[] = [];
  const listeners: ((s: Settings) => void)[] = [];
  let mounted = 0;
  const deps: ArticleDeps = {
    send: (async (request: Request) => {
      requests.push(request);
      if (request.type === "getSettings") return settings;
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
      throw new Error(`unexpected ${request.type}`);
    }) as ArticleDeps["send"],
    watchSettings(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    detectLanguage: async () => ({
      isReliable: true,
      languages: [{ language: "en", percentage: 99 }],
    }),
    mountUi() {
      mounted++;
      return () => mounted--;
    },
  };
  return {
    deps,
    requests,
    mounted: () => mounted,
    changeSettings: (s: Settings) => listeners.forEach((l) => l(s)),
    listeners,
  };
}

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

const highlighted = (name: string) =>
  [...(CSS.highlights.get(name) ?? [])]
    .map((r) => (r as Range).toString())
    .sort();

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
      .poll(() => highlighted("lingo-new"))
      .toEqual(["Knead", "knead"]);
  });

  it("warms the dictionary once, after the first analysis", async () => {
    const fake = fakeDeps(settings({ highlight: { new: true } }));
    const root = fixture(ARTICLE);
    await start(fake, root);
    await expect
      .poll(() => fake.requests.map((r) => r.type))
      .toEqual(["getSettings", "analyze", "warmDictionary"]);
    expect(fake.requests.at(-1)).toEqual({
      type: "warmDictionary",
      lang: "en",
    });

    const added = document.createElement("p");
    added.textContent = "Knead it again.";
    root.append(added);
    await expect
      .poll(() => fake.requests.map((r) => r.type))
      .toEqual(["getSettings", "analyze", "warmDictionary", "analyze"]);
  });

  it("does nothing on a page in another language", async () => {
    const fake = fakeDeps(settings());
    const root = fixture(ARTICLE);
    await expect(
      start(fake, root, { htmlLang: "ja" }),
    ).resolves.toBeUndefined();
    expect(fake.mounted()).toBe(0);
    expect(fake.requests.map((r) => r.type)).toEqual(["getSettings"]);
    expect(fake.listeners).toHaveLength(0);
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
    expect(fake.listeners).toHaveLength(0);
  });
});
