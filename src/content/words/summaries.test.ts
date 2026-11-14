import { describe, expect, it } from "vitest";
import type { Span } from "../../core/classify";
import type { send as sendFn } from "../../messaging/client";
import type { Request, TermBrief } from "../../messaging/protocol";
import { createStore } from "../store";
import { createTranslationQueue } from "../translate/queue";
import type { TranslationProvider } from "../translate/translator";
import { createSummaries } from "./summaries";

const EN_JA = { from: "en", to: "ja" };
const DEFINITION = "To come to understand";

/** What the background answers: an English definition, a usage note, a Japanese meaning. */
const BRIEFS: Record<string, TermBrief> = {
  "figure out": {
    short: `(transitive) ${DEFINITION}`,
    glossLang: "en",
    definition: DEFINITION,
    status: "new",
  },
  "look into": {
    short: "To investigate",
    glossLang: "en",
    definition: "To investigate",
    status: "new",
  },
  "i mean": {
    short: "A mild intensifier",
    glossLang: "en",
    usageNote: true,
    status: "new",
  },
  loaf: { short: "パンのひと塊", status: "new" },
};

const span = (key: string): Span => ({
  start: 0,
  end: key.length,
  key,
  kind: key.includes(" ") ? "phrase" : "word",
  category: "new",
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The summaries of a page over a fake background and the given translator. */
async function setup(provider: TranslationProvider) {
  const sent: Request[] = [];
  const asked: string[] = [];
  const send = (async (request: Request) => {
    sent.push(request);
    if (request.type === "termSummaries")
      return Object.fromEntries(request.keys.map((key) => [key, BRIEFS[key]]));
    return null;
  }) as typeof sendFn;
  const translator = createTranslationQueue(() => ({
    ...provider,
    translate(text) {
      asked.push(text);
      return provider.translate(text);
    },
  }));
  const store = createStore({ summaries: {} as Record<string, TermBrief> });
  const controller = new AbortController();
  const summaries = createSummaries({
    send,
    store,
    translator,
    lang: () => "en",
    nativeLang: () => "ja",
    active: () => true,
    waitFor: () => {},
    signal: controller.signal,
  });
  summaries.classified(Object.keys(BRIEFS).map(span), new Set());
  await flush();
  const brief = (key: string) => store.get().summaries[key];
  const cached = () =>
    sent.flatMap((r) => (r.type === "cacheTranslations" ? r.items : []));
  return { summaries, translator, brief, cached, asked, controller };
}

const japanese: TranslationProvider = {
  translate: async (text) => `ja(${text})`,
};

describe("createSummaries: meanings in lists", () => {
  it("translates the English definitions of the rows shown, and keeps them in the cache", async () => {
    const { summaries, brief, cached, asked } = await setup(japanese);
    expect(brief("figure out")).toEqual(BRIEFS["figure out"]);
    summaries.shown([
      { key: "figure out", head: "figure out" },
      { key: "loaf", head: "loaf" },
    ]);
    await flush();
    expect(brief("figure out")).toEqual({
      short: `ja(${DEFINITION})`,
      machineTranslated: true,
      status: "new",
    });
    expect(brief("loaf")).toEqual(BRIEFS.loaf);
    // Rows not shown wait.
    expect(brief("look into")).toEqual(BRIEFS["look into"]);
    expect(asked).toEqual([DEFINITION]);
    expect(cached()).toEqual([
      { text: DEFINITION, translated: `ja(${DEFINITION})` },
    ]);
  });

  it("translates a row shown before its meaning came", async () => {
    const { summaries, brief } = await setup(japanese);
    summaries.shown([{ key: "knead", head: "knead" }]);
    BRIEFS.knead = {
      short: "To work dough",
      glossLang: "en",
      definition: "To work dough",
      status: "new",
    };
    try {
      summaries.classified([span("knead")], new Set());
      await flush();
      await flush();
      expect(brief("knead")).toMatchObject({ short: "ja(To work dough)" });
    } finally {
      delete BRIEFS.knead;
    }
  });

  it("shows the term's literal translation for a usage note, as the hover card does", async () => {
    const { summaries, brief, cached, asked } = await setup(japanese);
    summaries.shown([{ key: "i mean", head: "I mean" }]);
    await flush();
    expect(brief("i mean")).toEqual({
      short: "ja(I mean)",
      machineTranslated: true,
      status: "new",
    });
    expect(asked).toEqual(["I mean"]);
    // The cache keeps definitions only.
    expect(cached()).toEqual([]);
  });

  it("picks up a translation the hover card or the window makes, shown or not", async () => {
    const { translator, brief, asked } = await setup(japanese);
    await translator.translate("To investigate", "hover", EN_JA);
    expect(brief("look into")).toEqual({
      short: "ja(To investigate)",
      machineTranslated: true,
      status: "new",
    });
    await translator.translate(DEFINITION, "window", EN_JA);
    expect(brief("figure out")).toMatchObject({ short: `ja(${DEFINITION})` });
    expect(asked).toEqual(["To investigate", DEFINITION]);
  });

  it("keeps the saved status a translation arrives after", async () => {
    const { summaries, translator, brief } = await setup(japanese);
    summaries.note([["look into", "learning"]]);
    await translator.translate("To investigate", "hover", EN_JA);
    expect(brief("look into")).toMatchObject({
      short: "ja(To investigate)",
      status: "learning",
    });
  });

  it("keeps the English without a translator", async () => {
    const { summaries, brief, cached } = await setup({
      translate: async () => undefined,
    });
    summaries.shown([
      { key: "figure out", head: "figure out" },
      { key: "i mean", head: "I mean" },
    ]);
    await flush();
    expect(brief("figure out")).toEqual(BRIEFS["figure out"]);
    expect(brief("i mean")).toEqual(BRIEFS["i mean"]);
    expect(cached()).toEqual([]);
  });

  it("keeps the English while the translator is not ready, and translates the rows once it is", async () => {
    let ready = false;
    const opens: unknown[] = [];
    const { summaries, translator, brief } = await setup({
      async open(options) {
        opens.push(options);
        return ready;
      },
      translate: async (text) => `ja(${text})`,
    });
    summaries.shown([{ key: "figure out", head: "figure out" }]);
    await flush();
    expect(brief("figure out")).toEqual(BRIEFS["figure out"]);
    // Lists never start the model's download.
    expect(opens).toEqual([{ download: false }]);
    // The dictionary window's click got the model: its translation comes, then the row's.
    ready = true;
    await translator.translate("To investigate", "window", EN_JA);
    await flush();
    expect(brief("figure out")).toMatchObject({ short: `ja(${DEFINITION})` });
  });

  it("stops following translations once the page moves on", async () => {
    const { summaries, translator, brief, controller, asked } =
      await setup(japanese);
    controller.abort();
    summaries.shown([{ key: "figure out", head: "figure out" }]);
    await translator.translate("To investigate", "hover", EN_JA);
    await flush();
    expect(brief("look into")).toEqual(BRIEFS["look into"]);
    expect(brief("figure out")).toEqual(BRIEFS["figure out"]);
    expect(asked).toEqual(["To investigate"]);
  });
});
