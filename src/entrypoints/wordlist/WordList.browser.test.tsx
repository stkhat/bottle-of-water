import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-preact";
import type { TermStatus } from "../../core/classify";
import type { PackStates } from "../../core/packs/state";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import { mergeSettings, type Settings } from "../../core/settings";
import type {
  OccurrenceView,
  Request,
  TermSummary,
} from "../../messaging/protocol";
import { WordList, type WordListDeps } from "./WordList";

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const HOUR = 60 * 60_000;
const at = (month: number, day: number, year = 2026) =>
  new Date(year, month - 1, day, 9, 0).getTime();

const VIDEO = {
  title: "Baking bread from scratch at home",
  platform: "youtube" as const,
  url: "https://www.youtube.com/watch?v=bake1",
};
const ARTICLE = {
  title: "Why patient bakers end up with better bread",
  platform: "web" as const,
  url: "https://www.theweekendtable.example/patient-bakers",
};

const term = (
  key: string,
  status: TermStatus,
  seen: number,
  lastSeen: number,
  short?: string,
): TermSummary => ({
  id: `en:${key}`,
  key,
  display: key,
  kind: key.includes(" ") ? "phrase" : "word",
  status,
  ...(short !== undefined && { short }),
  seen,
  lastSeen,
  createdAt: lastSeen,
});

const TERMS: TermSummary[] = [
  term("tedious", "learning", 2, NOW - HOUR, "退屈な、面倒な"),
  term("figure out", "learning", 3, NOW - 2 * HOUR, "見つけ出す、理解する"),
  term("knead", "learning", 1, at(11, 6), "（パン生地などを）こねる"),
  term("heavy lifting", "learning", 1, at(11, 6) - HOUR),
  term("honestly", "known", 1, at(11, 4), "正直に（言うと）"),
  term("crackle", "known", 5, at(12, 28, 2025), "パチパチ音を立てる"),
];

const occurrence = (
  source: typeof VIDEO | typeof ARTICLE,
  sentence: string,
  seenAt: number,
  origin: "saved" | "encountered",
  timeMs?: number,
): OccurrenceView => ({
  sentence,
  pos: timeMs === undefined ? { textQuote: sentence } : { timeMs },
  seenAt,
  origin,
  source,
  link:
    timeMs === undefined
      ? source.url
      : `${source.url}&t=${Math.floor(timeMs / 1000)}s`,
});

const OCCURRENCES: Record<string, OccurrenceView[]> = {
  "figure out": [
    occurrence(
      VIDEO,
      "So today we're going to figure out how to make bread from scratch.",
      NOW - 2 * HOUR,
      "saved",
      56_000,
    ),
    occurrence(
      ARTICLE,
      "…once you figure out a schedule that fits your week…",
      at(11, 6),
      "encountered",
    ),
  ],
  tedious: [
    occurrence(ARTICLE, "It can feel tedious at first.", at(11, 6), "saved"),
  ],
};

interface FakeOptions {
  terms?: TermSummary[];
  settings?: Partial<Settings>;
  importError?: Error;
  /** Packs not on the device: the dictionary's ("en-ja") fails meanings and lookups. */
  missing?: string[];
}

/** A background behind the word list: terms, lookups, status changes, backups. */
function fake(options: FakeOptions = {}) {
  let terms = [...(options.terms ?? TERMS)];
  const missing = new Set(options.missing ?? []);
  const sent: Request[] = [];
  const downloads: { name: string; text: string }[] = [];
  const spoken: string[] = [];
  const packListeners = new Set<(states: PackStates) => void>();
  const unavailable = () => {
    if (missing.size > 0) throw new PacksUnavailableError([...missing]);
  };
  const deps: WordListDeps = {
    send: (async (request: Request) => {
      sent.push(request);
      switch (request.type) {
        case "getSettings":
          return mergeSettings(options.settings ?? {});
        case "listTermsWithStats":
          if (request.meanings === false)
            return terms.map((t) => {
              const row = { ...t };
              delete row.short;
              return row;
            });
          unavailable();
          return terms;
        case "lookup": {
          unavailable();
          const saved = terms.find((t) => t.key === request.key);
          return {
            // The pack's IPA, also for a phrase no dictionary has.
            ...(request.key === "heavy lifting" && {
              ipa: "/ˈhɛvi ˈlɪftɪŋ/",
            }),
            ...(request.key !== "heavy lifting" && {
              entry: {
                head: request.key,
                kind: request.kind,
                ipa: `/${request.key}/`,
                short: `short of ${request.key}`,
                senses: [],
                // An English definition.
                ...(request.key === "look into" && { glossLang: "en" }),
              },
            }),
            status: saved?.status ?? "new",
            termId: `en:${request.key}`,
            here: [],
            elsewhere: OCCURRENCES[request.key] ?? [],
          };
        }
        case "setStatus":
          terms = terms.map((t) =>
            t.id === request.id ? { ...t, status: request.status } : t,
          );
          return {};
        case "removeTerm":
          terms = terms.filter((t) => t.id !== request.id);
          return null;
        case "saveTerm": {
          const back = TERMS.find((t) => t.key === request.key)!;
          terms = [...terms, { ...back, status: request.status, seen: 1 }];
          return {};
        }
        case "exportJson":
          return '{"format":"lingo-export"}';
        case "importJson":
          if (options.importError) throw options.importError;
          terms = [...terms, term("overnight", "known", 1, NOW - 3 * HOUR)];
          return { terms: 1, sources: 1, occurrences: 1 };
        default:
          throw new Error(`unexpected ${request.type}`);
      }
    }) as WordListDeps["send"],
    now: () => NOW,
    download: (name, text) => downloads.push({ name, text }),
    speak: (text) => spoken.push(text),
    watchPackState(listener) {
      packListeners.add(listener);
      listener({});
      return () => packListeners.delete(listener);
    },
  };
  /** The packs are on the device now: the background says so in `packState`. */
  const packsReady = () => {
    const states: PackStates = Object.fromEntries(
      [...missing].map((pack) => [
        pack,
        { state: "ready", received: 10, total: 10 },
      ]),
    );
    missing.clear();
    for (const listener of [...packListeners]) listener(states);
  };
  return { deps, sent, downloads, spoken, packsReady, packListeners };
}

/** An element's text, or "" while it is not there. */
const textOf = (locator: { query(): Element | null }) =>
  locator.query()?.textContent ?? "";

beforeAll(async () => {
  await page.viewport(1440, 1000);
});
afterEach(() => cleanup());

async function open(options: FakeOptions = {}) {
  const f = fake(options);
  const screen = await render(<WordList deps={f.deps} />);
  const list = screen.getByRole("region", { name: "Saved words" });
  const details = screen.getByRole("complementary", { name: "Word details" });
  /** The heads of the rows shown, top to bottom. */
  const heads = () =>
    [...list.element().querySelectorAll("button [data-head]")].map(
      (el) => el.textContent,
    );
  const row = (head: string) =>
    list.getByRole("button", { name: new RegExp(`^${head}`) });
  if ((options.terms ?? TERMS).length > 0)
    await expect.poll(() => heads().length).toBeGreaterThan(0);
  return { ...f, screen, list, details, heads, row };
}

describe("WordList", () => {
  it("shows the language pair and lists the words of the learning language", async () => {
    const { screen, sent } = await open({
      settings: { learningLang: "es", nativeLang: "en" },
    });
    await expect.element(screen.getByText("Spanish → English")).toBeVisible();
    expect(sent.filter((r) => r.type === "listTermsWithStats")).toEqual([
      { type: "listTermsWithStats", lang: "es" },
    ]);
  });

  it("lists the saved words, recently seen first, with their meaning, status, count and day", async () => {
    const { screen, heads, row } = await open();
    await expect
      .element(screen.getByRole("heading", { name: "Word list", level: 1 }))
      .toBeVisible();
    await expect.element(screen.getByText("English → Japanese")).toBeVisible();
    expect(heads()).toEqual([
      "tedious",
      "figure out",
      "knead",
      "heavy lifting",
      "honestly",
      "crackle",
    ]);
    await expect
      .poll(() => textOf(row("figure out")))
      .toMatch(/^figure outPhrase見つけ出す、理解するLearning3Today$/);
    // A phrase the dictionary does not have: no meaning.
    await expect
      .poll(() => textOf(row("heavy lifting")))
      .toMatch(/^heavy liftingPhraseLearning1Nov 6$/);
    await expect
      .poll(() => textOf(row("crackle")))
      .toMatch(/Known5Dec 28, 2025$/);
  });

  it("marks English definitions as English, in the list and the details", async () => {
    const { details, row } = await open({
      terms: [
        {
          ...term("look into", "learning", 1, NOW - HOUR, "To investigate"),
          glossLang: "en",
        },
        term("tedious", "learning", 2, NOW - 2 * HOUR, "退屈な、面倒な"),
      ],
    });
    await expect
      .element(row("look into").getByText("To investigate"))
      .toHaveAttribute("lang", "en");
    await expect
      .element(row("tedious").getByText("退屈な、面倒な"))
      .toHaveAttribute("lang", "ja");
    await expect
      .element(details.getByText("short of look into"))
      .toHaveAttribute("lang", "en");
    await row("tedious").click();
    await expect
      .element(details.getByText("short of tedious"))
      .toHaveAttribute("lang", "ja");
  });

  it("shows the IPA of a saved phrase no dictionary has", async () => {
    const { details, row } = await open();
    await row("heavy lifting").click();
    await expect
      .element(details.getByRole("heading", { level: 2 }))
      .toHaveTextContent("heavy lifting");
    await expect.element(details.getByText("/ˈhɛvi ˈlɪftɪŋ/")).toBeVisible();
  });

  it("filters by status and kind", async () => {
    const { screen, heads } = await open();
    const status = screen.getByRole("group", { name: "Status" });
    const kind = screen.getByRole("group", { name: "Kind" });
    await status.getByRole("button", { name: "Known" }).click();
    await expect
      .element(status.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(heads()).toEqual(["honestly", "crackle"]);
    await status.getByRole("button", { name: "Learning" }).click();
    await kind.getByRole("button", { name: "Phrases" }).click();
    expect(heads()).toEqual(["figure out", "heavy lifting"]);
    await kind.getByRole("button", { name: "Words" }).click();
    expect(heads()).toEqual(["tedious", "knead"]);
    await status.getByRole("button", { name: "All" }).click();
    await kind.getByRole("button", { name: "All" }).click();
    expect(heads()).toHaveLength(6);
  });

  it("searches heads and meanings, ignoring case", async () => {
    const { screen, heads } = await open();
    const search = screen.getByRole("searchbox", {
      name: "Search saved words",
    });
    await expect
      .element(search)
      .toHaveAttribute("placeholder", "Search words and meanings");
    await search.fill("  KNE ");
    expect(heads()).toEqual(["knead"]);
    await search.fill("理解");
    expect(heads()).toEqual(["figure out"]);
    await search.fill("zzz");
    expect(heads()).toEqual([]);
    await expect
      .element(screen.getByText("No saved words match."))
      .toBeVisible();
  });

  it("sorts A–Z and by most seen", async () => {
    const { screen, heads } = await open();
    const sort = screen.getByRole("combobox", { name: "Sort" });
    await sort.selectOptions("A–Z");
    expect(heads()).toEqual([
      "crackle",
      "figure out",
      "heavy lifting",
      "honestly",
      "knead",
      "tedious",
    ]);
    await sort.selectOptions("Most seen");
    expect(heads()).toEqual([
      "crackle",
      "figure out",
      "tedious",
      "knead",
      "heavy lifting",
      "honestly",
    ]);
  });

  it("shows the first word's details, and another's when its row is picked", async () => {
    const { details, row, spoken } = await open();
    await expect
      .element(details.getByRole("heading", { level: 2 }))
      .toHaveTextContent("tedious");
    await expect
      .element(row("tedious"))
      .toHaveAttribute("aria-pressed", "true");

    await row("figure out").click();
    await expect
      .element(row("figure out"))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(details.getByRole("heading", { level: 2 }))
      .toHaveTextContent("figure out");
    await expect.element(details.getByText("Phrase")).toBeVisible();
    await expect.element(details.getByText("/figure out/")).toBeVisible();
    await expect
      .element(details.getByText("short of figure out"))
      .toBeVisible();
    await expect
      .element(details.getByRole("heading", { name: "Where you saw it · 2" }))
      .toBeVisible();
    const links = details.getByRole("link");
    await expect
      .element(links.nth(0))
      .toHaveAttribute("href", `${VIDEO.url}&t=56s`);
    await expect
      .poll(() => textOf(links.nth(0)))
      .toMatch(
        /Baking bread from scratch at homeYouTube · at 0:56 · Saved hereSo today/,
      );
    await expect
      .element(links.nth(0).getByRole("img", { name: "Video" }))
      .toBeVisible();
    await expect.element(links.nth(1)).toHaveAttribute("href", ARTICLE.url);
    await expect
      .poll(() => textOf(links.nth(1)))
      .toMatch(/theweekendtable\.example · Nov 6…once you/);
    await expect
      .element(links.nth(1).getByRole("img", { name: "Web page" }))
      .toBeVisible();

    await details.getByRole("button", { name: "Play pronunciation" }).click();
    expect(spoken).toEqual(["figure out"]);
  });

  it("changes a word's status from the details", async () => {
    const { details, row, sent } = await open();
    const group = details.getByRole("group", { name: "Word status" });
    await expect
      .element(group.getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    await group.getByRole("button", { name: "Known" }).click();
    expect(sent).toContainEqual({
      type: "setStatus",
      id: "en:tedious",
      status: "known",
    });
    await expect
      .element(group.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => textOf(row("tedious"))).toMatch(/Known/);
  });

  it("removes a word: it leaves the list, its details say Not saved, and it can be saved again", async () => {
    const { details, row, heads, sent } = await open();
    const group = details.getByRole("group", { name: "Word status" });
    await group.getByRole("button", { name: "Remove" }).click();
    expect(sent).toContainEqual({ type: "removeTerm", id: "en:tedious" });
    await expect.poll(heads).not.toContain("tedious");
    await expect
      .element(group.getByRole("button", { name: "Not saved" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(details.getByRole("heading", { level: 2 }))
      .toHaveTextContent("tedious");

    // Saved again from where it was saved before.
    await group.getByRole("button", { name: "Learning" }).click();
    expect(sent).toContainEqual({
      type: "saveTerm",
      lang: "en",
      key: "tedious",
      display: "tedious",
      kind: "word",
      status: "learning",
      source: { ...ARTICLE, lang: "en" },
      sentence: "It can feel tedious at first.",
      pos: { textQuote: "It can feel tedious at first." },
    });
    await expect.element(row("tedious")).toBeVisible();
  });

  it("cannot save a removed word again without anywhere it was seen", async () => {
    const { details, row } = await open();
    await row("knead").click();
    await expect
      .element(details.getByRole("heading", { level: 2 }))
      .toHaveTextContent("knead");
    const group = details.getByRole("group", { name: "Word status" });
    await group.getByRole("button", { name: "Remove" }).click();
    await expect
      .element(group.getByRole("button", { name: "Learning" }))
      .toBeDisabled();
    await expect
      .element(group.getByRole("button", { name: "Known" }))
      .toBeDisabled();
  });

  it("exports and imports through the shared backup buttons", async () => {
    const { screen, downloads, heads } = await open();
    await screen.getByRole("button", { name: "Export" }).click();
    await expect
      .poll(() => downloads)
      .toEqual([
        {
          name: "lingo-backup-2026-11-10.json",
          text: '{"format":"lingo-export"}',
        },
      ]);
    const file = new File(['{"format":"lingo-export"}'], "backup.json", {
      type: "application/json",
    });
    await userEvent.upload(
      screen.getByLabelText("Backup file to import"),
      file,
    );
    await expect.element(screen.getByText("Imported 1 word")).toBeVisible();
    // The list is read again.
    await expect.poll(heads).toContain("overnight");
  });

  it("shows why an import failed", async () => {
    const { screen } = await open({ importError: new Error("Not a backup") });
    const file = new File(["{}"], "x.json", { type: "application/json" });
    await userEvent.upload(
      screen.getByLabelText("Backup file to import"),
      file,
    );
    await expect
      .element(screen.getByText("Could not import: Not a backup"))
      .toBeVisible();
  });

  it("says when nothing is saved yet", async () => {
    const { screen } = await open({ terms: [] });
    await expect.element(screen.getByText("No saved words yet.")).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Word details" }).query(),
    ).toBeNull();
  });

  it("reads the list again when the page is shown again", async () => {
    const { sent } = await open();
    const before = sent.filter((r) => r.type === "listTermsWithStats").length;
    document.dispatchEvent(new Event("visibilitychange"));
    await expect
      .poll(() => sent.filter((r) => r.type === "listTermsWithStats").length)
      .toBe(before + 1);
  });

  it("lists the words without meanings while the dictionary is not on the device, quietly, and with them once it is", async () => {
    const warn = vi.spyOn(console, "warn");
    try {
      const { details, row, sent, packsReady, packListeners } = await open({
        missing: ["en-ja"],
      });
      await expect
        .poll(() => textOf(row("figure out")))
        .toMatch(/^figure outPhraseLearning3Today$/);
      expect(sent.filter((r) => r.type === "listTermsWithStats")).toEqual([
        { type: "listTermsWithStats", lang: "en" },
        { type: "listTermsWithStats", lang: "en", meanings: false },
      ]);
      // The first word's lookup waits too: no details yet.
      await expect
        .poll(() => sent.filter((r) => r.type === "lookup").length)
        .toBe(1);
      expect(details.query()).toBeNull();
      expect(packListeners.size).toBe(1);

      packsReady();
      await expect
        .poll(() => textOf(row("figure out")))
        .toMatch(/^figure outPhrase見つけ出す、理解するLearning3Today$/);
      await expect
        .element(details.getByRole("heading", { level: 2 }))
        .toHaveTextContent("tedious");
      await expect.element(details.getByText("short of tedious")).toBeVisible();
      expect(packListeners.size).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("renders only the rows in view when there are more than 500", async () => {
    const many = Array.from({ length: 1200 }, (_, i) =>
      term(`word${String(i).padStart(4, "0")}`, "learning", 1, NOW - i * 1000),
    );
    const { list, heads } = await open({ terms: many });
    expect(heads().length).toBeLessThan(60);
    expect(heads()[0]).toBe("word0000");
    const scroller = list.element().querySelector<HTMLElement>("[data-rows]")!;
    scroller.scrollTop = 50 * 1000;
    await expect.poll(heads).toContain("word1000");
    expect(heads()).not.toContain("word0000");
    expect(heads().length).toBeLessThan(60);
  });
});
