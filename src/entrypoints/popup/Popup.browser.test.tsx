import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-preact";
import type { Counts } from "../../background/term-store";
import { mergeSettings, type Settings } from "../../core/settings";
import type { SyncStatus } from "../../core/sync/backend";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import type { Request } from "../../messaging/protocol";
import { Popup, type PopupDeps } from "./Popup";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const MINUTE = 60_000;

const ARTICLE: PageSummary = {
  supported: true,
  hostname: "theweekendtable.example",
  scope: "page",
  unsaved: 46,
  done: null,
};

const SYNC: SyncStatus = {
  enabled: true,
  bytesUsed: 41 * 1024,
  quotaBytes: 102_400,
  lastSavedAt: NOW - 2 * MINUTE,
  syncedCount: 10,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

interface FakeOptions {
  settings?: Partial<Settings>;
  /** What the active tab answers; undefined when nothing answers. */
  page?: PageSummary;
  counts?: Counts;
  sync?: SyncStatus;
  refreshMs?: number;
}

/** A background, settings storage and active tab behind the popup. */
function fake(options: FakeOptions = {}) {
  let settings = mergeSettings(options.settings ?? {});
  let page = options.page;
  let counts = options.counts ?? { learning: 128, known: 2341, phrases: 37 };
  const listeners = new Set<(s: Settings) => void>();
  const sent: Request[] = [];
  const asked: PageRequest[] = [];
  const deps: PopupDeps = {
    send: (async (request: Request) => {
      sent.push(request);
      switch (request.type) {
        case "getSettings":
          return settings;
        case "setSettings":
          settings = mergeSettings(request.patch, settings);
          for (const l of listeners) l(settings);
          return settings;
        case "counts":
          return counts;
        case "syncStatus":
          return options.sync ?? SYNC;
        default:
          throw new Error(`unexpected ${request.type}`);
      }
    }) as PopupDeps["send"],
    async askPage(request) {
      asked.push(request);
      if (!page) return undefined;
      if (request.type === "pageSaveAll") {
        counts = { ...counts, [request.status]: counts[request.status] + 46 };
        page = {
          ...page,
          unsaved: 0,
          done: { count: page.unsaved, target: request.status },
        };
      } else if (request.type === "pageUndo" && page.done) {
        counts = {
          ...counts,
          [page.done.target]: counts[page.done.target] - page.done.count,
        };
        page = { ...page, unsaved: page.done.count, done: null };
      }
      return page;
    },
    watchSettings(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncName: "Chrome sync",
    openOptions: vi.fn(),
    openWordList: vi.fn(),
    now: () => NOW,
    refreshMs: options.refreshMs ?? 60_000,
  };
  return {
    deps,
    sent,
    asked,
    settings: () => settings,
    setPage(next: PageSummary | undefined) {
      page = next;
    },
    /** A change made elsewhere (another page, another device). */
    changeSettings(patch: Partial<Settings>) {
      settings = mergeSettings(patch, settings);
      for (const l of listeners) l(settings);
    },
  };
}

afterEach(cleanup);

const siteSwitch = (screen: Awaited<ReturnType<typeof render>>) =>
  screen.getByRole("switch", { name: "Use Lingo on this site" });

describe("Popup", () => {
  it("shows the header, the word counts and the highlight chips from the settings", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("Lingo")).toBeVisible();
    await expect.element(screen.getByText("English → Japanese")).toBeVisible();
    await expect.element(screen.getByText("2,341")).toBeVisible();
    await expect.element(screen.getByText("128")).toBeVisible();
    await expect.element(screen.getByText("37")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "New" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("shows the language pair and counts the words of the learning language", async () => {
    const f = fake({ settings: { learningLang: "es", nativeLang: "en" } });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("Spanish → English")).toBeVisible();
    await expect.element(screen.getByText("2,341")).toBeVisible();
    expect(f.sent.filter((r) => r.type === "counts")).toEqual([
      { type: "counts", lang: "es" },
    ]);
  });

  it("switches highlight categories in the settings", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await screen.getByRole("button", { name: "New" }).click();
    await expect
      .element(screen.getByRole("button", { name: "New" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(f.settings().highlight.new).toBe(true);
  });

  it("follows settings changed elsewhere", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await expect
      .element(screen.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "false");
    f.changeSettings({
      highlight: { new: false, learning: true, known: true },
    });
    await expect
      .element(screen.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  describe("On this site", () => {
    it("shows the tab's host and switches Lingo off and on for it", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("theweekendtable.example"))
        .toBeVisible();
      await expect.element(siteSwitch(screen)).toBeChecked();

      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      expect(f.settings().disabledSites).toEqual(["theweekendtable.example"]);

      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual([]);
    });

    it("is off when a parent domain is switched off, and switching on removes that entry", async () => {
      const f = fake({
        page: { ...ARTICLE, supported: false, hostname: "www.example.com" },
        settings: { disabledSites: ["other.org", "example.com"] },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual(["other.org"]);
    });

    it("is hidden, with This page, when nothing in the tab answers", async () => {
      const f = fake({ page: undefined });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByText("On this site").query()).toBeNull();
      expect(screen.getByText("This page").query()).toBeNull();
    });
  });

  describe("This page", () => {
    it("saves every unsaved word of the tab, then undoes it", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This page")).toBeVisible();
      await expect
        .element(screen.getByText("46 words not saved yet"))
        .toBeVisible();

      await screen
        .getByRole("button", { name: "Mark all as Learning" })
        .click();
      await expect
        .element(screen.getByText("46 words marked as Learning"))
        .toBeVisible();
      await expect.element(screen.getByText("174")).toBeVisible();
      expect(f.asked).toContainEqual({
        type: "pageSaveAll",
        status: "learning",
      });

      await screen.getByRole("button", { name: "Undo" }).click();
      await expect
        .element(screen.getByText("46 words not saved yet"))
        .toBeVisible();
      await expect.element(screen.getByText("128")).toBeVisible();
      expect(f.asked).toContainEqual({ type: "pageUndo" });
    });

    it("says This video on a video page", async () => {
      const f = fake({ page: { ...ARTICLE, scope: "video" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This video")).toBeVisible();
    });

    it("is hidden where Lingo does not run, until it does", async () => {
      const f = fake({ page: { ...ARTICLE, supported: false }, refreshMs: 50 });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("theweekendtable.example"))
        .toBeVisible();
      expect(screen.getByText("This page").query()).toBeNull();
      f.setPage(ARTICLE);
      await expect.element(screen.getByText("This page")).toBeVisible();
    });
  });

  describe("sync", () => {
    it("shows when the words were last saved and the space used", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      await expect
        .element(screen.getByText("Sync space: 41 KB of 100 KB used"))
        .toBeVisible();
    });

    it("says not saved yet before the first save", async () => {
      const f = fake({ sync: { ...SYNC, lastSavedAt: undefined } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("Not saved yet")).toBeVisible();
    });

    it("says sync is off, without the space", async () => {
      const f = fake({ sync: { ...SYNC, enabled: false } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("Sync is off")).toBeVisible();
      expect(screen.getByText(/Sync space/).query()).toBeNull();
      expect(screen.getByText(/Saved to/).query()).toBeNull();
    });
  });

  it("opens the word list and the settings", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await screen.getByRole("button", { name: "Word list" }).click();
    expect(f.deps.openWordList).toHaveBeenCalledOnce();
    await screen.getByRole("button", { name: "Settings", exact: true }).click();
    await screen.getByRole("button", { name: "Open settings" }).click();
    expect(f.deps.openOptions).toHaveBeenCalledTimes(2);
  });
});
