import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-preact";
import type {
  CloudStatus,
  Counts,
  PackStatus,
  Request,
  SyncStatus,
} from "../../messaging/protocol";
import type { PackState, PackStates } from "../../core/packs/state";
import type { SupportLinks } from "../../core/links";
import { mergeSettings, type Settings } from "../../core/settings";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import { Popup, type PopupDeps } from "./Popup";
import { listeners, settingsListeners } from "../../testing/stubs";

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
  termsInCloud: false,
  bytesUsed: 41 * 1024,
  quotaBytes: 102_400,
  lastSavedAt: NOW - 2 * MINUTE,
  syncedCount: 10,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

/** Connected to Google Drive, saved 2 minutes ago. */
const CONNECTED: CloudStatus = {
  available: ["googleDrive"],
  provider: "googleDrive",
  lastSavedAt: NOW - 2 * MINUTE,
  lastCheckedAt: NOW - MINUTE,
  bytes: 1.4 * 1024 * 1024,
  devices: 3,
};

interface FakeOptions {
  settings?: Partial<Settings>;
  /** What the active tab answers; undefined when nothing answers. */
  page?: PageSummary;
  counts?: Counts;
  sync?: SyncStatus;
  /** What `cloudStatus` answers first (default: a build with no provider). */
  cloud?: CloudStatus;
  refreshMs?: number;
  /** What `packStatus` answers for the settings (default: `JAPANESE`). */
  packStatus?: (settings: Settings) => PackStatus;
  /** The footer's links (default: none set). */
  links?: Partial<SupportLinks>;
}

const readyPack = (pack: string, size: number) =>
  ({ pack, size, state: "ready", received: size, total: size }) as const;

/** The default pair's packs (English → Japanese), downloaded. */
const JAPANESE: PackStatus = {
  pair: {
    packs: [
      readyPack("en", 6_500_000),
      readyPack("en-ja", 7_700_000),
      readyPack("en-defs", 20_500_000),
    ],
  },
  others: [],
};

/** The Spanish pair's packs, downloaded, in these states. */
const spanish = (es: PackState, esEn: PackState): PackStatus => ({
  pair: {
    packs: [
      { pack: "es", size: 3_000_000, ...es },
      { pack: "es-en", size: 3_500_000, ...esEn },
    ],
  },
  others: [],
});

/** A background, settings storage and active tab behind the popup. */
function fake(options: FakeOptions = {}) {
  let settings = mergeSettings(options.settings ?? {});
  let page = options.page;
  let counts = options.counts ?? { learning: 128, known: 2341, phrases: 37 };
  let cloud: CloudStatus = options.cloud ?? {
    available: [],
    bytes: 0,
    devices: 0,
  };
  const settingsWatchers = settingsListeners(settings);
  const packWatchers = listeners<PackStates>();
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
          settingsWatchers.emit(settings);
          return settings;
        case "counts":
          return counts;
        case "syncStatus":
          return options.sync ?? SYNC;
        case "cloudStatus":
          return cloud;
        case "cloudCheck":
          return null;
        case "cloudConnect":
          cloud = { ...CONNECTED, provider: request.provider };
          return null;
        case "packStatus":
          return options.packStatus?.(settings) ?? JAPANESE;
        case "retryPacks":
          return null;
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
    watchSettings: settingsWatchers.watch,
    watchPackState: packWatchers.watch,
    syncName: "Chrome sync",
    links: {
      coffee: "",
      feedback: "",
      sponsor: "",
      review: "",
      ...options.links,
    },
    openTab: vi.fn(),
    openOptions: vi.fn(),
    openWordList: vi.fn(),
    close: vi.fn(),
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
      settingsWatchers.emit(settings);
    },
    /** The background writes `packState`. */
    setPackStates(states: PackStates) {
      packWatchers.emit(states);
    },
    packWatchers: packWatchers.count,
  };
}

afterEach(cleanup);

const siteSwitch = (screen: Awaited<ReturnType<typeof render>>) =>
  screen.getByRole("switch", { name: "Use Langle on this site" });

describe("Popup", () => {
  it("shows the header, the word counts and the highlight chips from the settings", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("Langle")).toBeVisible();
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

  describe("Langle switch", () => {
    const langleSwitch = (screen: Awaited<ReturnType<typeof render>>) =>
      screen.getByRole("switch", { name: "Use Langle", exact: true });

    it("sits in the header, after the settings button", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(langleSwitch(screen)).toBeChecked();
      const gear = screen.getByRole("button", { name: "Open settings" });
      expect(
        gear.element().compareDocumentPosition(langleSwitch(screen).element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        langleSwitch(screen)
          .element()
          .compareDocumentPosition(siteSwitch(screen).element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("switches Langle off everywhere, leaving only the header and sync, and back on", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();

      await langleSwitch(screen).click();
      await expect.element(langleSwitch(screen)).not.toBeChecked();
      expect(f.settings().enabled).toBe(false);
      await expect.element(siteSwitch(screen)).not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Learning" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("2,341")).not.toBeInTheDocument();
      await expect
        .element(screen.getByText("This page"))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      await expect
        .element(screen.getByText("English → Japanese"))
        .toBeVisible();

      await langleSwitch(screen).click();
      await expect.element(langleSwitch(screen)).toBeChecked();
      expect(f.settings().enabled).toBe(true);
      await expect.element(siteSwitch(screen)).toBeVisible();
      await expect.element(screen.getByText("2,341")).toBeVisible();
    });

    it("hides the language data line while off", async () => {
      const f = fake({
        settings: { learningLang: "es", nativeLang: "en", enabled: false },
        packStatus: () =>
          spanish(
            { state: "downloading", received: 0, total: 3_000_000 },
            { state: "downloading", received: 0, total: 3_500_000 },
          ),
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(langleSwitch(screen)).not.toBeChecked();
      await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
    });

    it("follows a switch made elsewhere", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(langleSwitch(screen)).toBeChecked();
      f.changeSettings({ enabled: false });
      await expect.element(langleSwitch(screen)).not.toBeChecked();
      await expect.element(siteSwitch(screen)).not.toBeInTheDocument();
    });
  });

  describe("On this site", () => {
    it("shows the tab's host and switches Langle off and on for it", async () => {
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

    it("sits between On this site and the highlight chips", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      const heading = screen.getByText("This page");
      await expect.element(heading).toBeVisible();
      const chips = screen.getByRole("button", {
        name: "Learning",
        exact: true,
      });
      await expect.element(chips).toBeVisible();
      expect(
        siteSwitch(screen)
          .element()
          .compareDocumentPosition(heading.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        heading.element().compareDocumentPosition(chips.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("says This video on a video page", async () => {
      const f = fake({ page: { ...ARTICLE, scope: "video" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This video")).toBeVisible();
    });

    it("Show words on this page opens the page's Words list and closes the popup", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      const show = screen.getByRole("button", {
        name: "Show words on this page",
      });
      await expect.element(show).toBeVisible();
      // Right under the heading line, above Mark all (mock Toolbar).
      const buttons = [...screen.container.querySelectorAll("button")].map(
        (b) => b.textContent,
      );
      expect(buttons.indexOf("Show words on this page")).toBe(
        buttons.indexOf("Mark all as Learning") - 1,
      );
      const style = getComputedStyle(show.element());
      expect(style.height).toBe("40px");
      expect(style.borderTopLeftRadius).toBe("8px");
      expect(style.borderTopColor).toBe("rgb(213, 216, 224)");
      expect(style.fontWeight).toBe("600");
      expect(show.element().querySelector("svg")).not.toBeNull();

      await show.click();
      expect(f.asked).toContainEqual({ type: "pageShowWords" });
      await vi.waitFor(() => expect(f.deps.close).toHaveBeenCalled());
    });

    it("has no Show words on a video page (its Words tab is there)", async () => {
      const f = fake({ page: { ...ARTICLE, scope: "video" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This video")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Show words on this page" }).query(),
      ).toBeNull();
    });

    it("is hidden where Langle does not run, until it does", async () => {
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

  describe("your own cloud storage", () => {
    const connected = { cloudProvider: "googleDrive" } as const;

    it("asks the background to read the other devices' changes when it opens", async () => {
      const f = fake();
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent.filter((r) => r.type === "cloudCheck")).toHaveLength(1);
      expect(screen.getByText(/Google Drive/).query()).toBeNull();
    });

    it("shows the last save, the size and the devices instead of browser sync", async () => {
      const f = fake({ cloud: CONNECTED, settings: connected });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      await expect
        .element(screen.getByText("1.4 MB · 3 devices"))
        .toBeVisible();
      expect(screen.getByText(/Chrome sync/).query()).toBeNull();
      expect(screen.getByText(/Sync space/).query()).toBeNull();
      expect(screen.getByText(/Last checked/).query()).toBeNull();
    });

    it("asks to connect on this device too, above the counts, and Connect connects", async () => {
      const f = fake({
        cloud: { available: ["googleDrive"], bytes: 0, devices: 0 },
        settings: connected,
      });
      const screen = await render(<Popup deps={f.deps} />);
      const note = screen.getByText("Connect Google Drive on this device too");
      await expect.element(note).toBeVisible();
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      const counts = screen.getByText("Phrases", { exact: true });
      expect(
        note.element().compareDocumentPosition(counts.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await screen.getByRole("button", { name: "Connect" }).click();
      await expect
        .element(screen.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("does not offer Google Drive when no device chose it", async () => {
      const f = fake({
        cloud: { available: ["googleDrive"], bytes: 0, devices: 0 },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      expect(screen.getByText(/Google Drive/).query()).toBeNull();
    });

    it("says Reconnect needed in red, and Reconnect connects again", async () => {
      const f = fake({
        cloud: {
          ...CONNECTED,
          error: "reconnect",
          lastSavedAt: NOW - 3 * 60 * MINUTE,
        },
        settings: connected,
      });
      const screen = await render(<Popup deps={f.deps} />);
      const line = screen.getByText("Reconnect needed");
      await expect.element(line).toBeVisible();
      expect(getComputedStyle(line.element()).color).toBe("rgb(180, 35, 24)");
      await expect
        .element(screen.getByText("Last saved to Google Drive 3 hours ago"))
        .toBeVisible();
      await screen.getByRole("button", { name: "Reconnect" }).click();
      await expect
        .element(screen.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("says the storage is full or an update is needed in the same red line, without a button", async () => {
      for (const [error, text] of [
        ["full", "Google Drive storage is full"],
        ["update", "Update Langle on this device"],
      ] as const) {
        const f = fake({ cloud: { ...CONNECTED, error }, settings: connected });
        const screen = await render(<Popup deps={f.deps} />);
        const line = screen.getByText(text);
        await expect.element(line).toBeVisible();
        expect(getComputedStyle(line.element()).color).toBe("rgb(180, 35, 24)");
        await expect
          .element(screen.getByText("Last saved to Google Drive 2 minutes ago"))
          .toBeVisible();
        expect(
          screen.getByRole("button", { name: /Connect/ }).query(),
        ).toBeNull();
        cleanup();
      }
    });
  });

  describe("language data", () => {
    const SPANISH = { learningLang: "es", nativeLang: "en" };
    const ready = (total: number): PackState => ({
      state: "ready",
      received: total,
      total,
    });

    it("shows the download under the header while the pair's data is missing, and nothing once it is there", async () => {
      const f = fake({
        settings: SPANISH,
        page: ARTICLE,
        packStatus: () =>
          spanish(ready(3_000_000), {
            state: "downloading",
            received: 0,
            total: 3_500_000,
          }),
      });
      const screen = await render(<Popup deps={f.deps} />);
      const line = screen.getByRole("status");
      await expect
        .element(line)
        .toHaveTextContent("Downloading Spanish data · 46%");
      // Under the header, before the rest of the popup.
      const header = screen.getByText("Spanish → English").element();
      const site = screen.getByText("On this site").element();
      expect(
        header.compareDocumentPosition(line.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        line.element().compareDocumentPosition(site) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      f.setPackStates({
        "es-en": {
          state: "downloading",
          received: 2_500_000,
          total: 3_500_000,
        },
      });
      await expect
        .element(line)
        .toHaveTextContent("Downloading Spanish data · 84%");

      f.setPackStates({ es: ready(3_000_000), "es-en": ready(3_500_000) });
      await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
      expect(f.sent.filter((r) => r.type === "packStatus")).toHaveLength(1);
    });

    it("says the download failed, and Retry asks the background to try again", async () => {
      const f = fake({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3_000_000), {
            state: "failed",
            received: 0,
            total: 3_500_000,
            error: "HTTP 404",
          }),
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByRole("status"))
        .toMatchTextContent("Couldn't download Spanish data");
      await screen.getByRole("button", { name: "Retry" }).click();
      expect(f.sent).toContainEqual({ type: "retryPacks" });

      f.setPackStates({
        "es-en": { state: "downloading", received: 0, total: 3_500_000 },
      });
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent("Downloading Spanish data · 46%");
    });

    it("treats a pack updating while its older version is in use as there", async () => {
      const f = fake({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3_000_000), {
            state: "downloading",
            received: 0,
            total: 3_500_000,
            updating: true,
          }),
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByRole("status").query()).toBeNull();
    });

    it("shows nothing for a pair whose data is on the device, and asks again for another pair", async () => {
      const f = fake({
        packStatus: (s) =>
          s.learningLang === "es"
            ? spanish(ready(3_000_000), {
                state: "downloading",
                received: 0,
                total: 3_500_000,
              })
            : JAPANESE,
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByRole("status").query()).toBeNull();

      f.changeSettings(SPANISH);
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent("Downloading Spanish data · 46%");
    });

    it("stops watching the data when it closes", async () => {
      const f = fake();
      const screen = await render(<Popup deps={f.deps} />);
      await expect.poll(() => f.packWatchers()).toBe(1);
      await screen.unmount();
      expect(f.packWatchers()).toBe(0);
    });
  });

  it("opens the word list and the settings from the header icons", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    const wordList = screen.getByRole("button", { name: "Word list" });
    const gear = screen.getByRole("button", { name: "Open settings" });
    await expect.element(wordList).toBeVisible();
    // The word list sits just left of the gear.
    expect(wordList.element().nextElementSibling).toBe(gear.element());
    expect(
      screen.getByRole("button", { name: "Settings", exact: true }).query(),
    ).toBeNull();

    await wordList.click();
    expect(f.deps.openWordList).toHaveBeenCalledOnce();
    await gear.click();
    expect(f.deps.openOptions).toHaveBeenCalledOnce();
  });
});

describe("Support Langle", () => {
  const LINKS = {
    review: "https://store.example/langle/reviews",
    coffee: "https://ko-fi.example/langle",
  };
  const nudge = (screen: Awaited<ReturnType<typeof render>>) =>
    screen.getByRole("status").filter({ hasText: "Nice work!" });
  const footer = (screen: Awaited<ReturnType<typeof render>>) =>
    screen.getByRole("navigation", { name: "Support Langle" });

  it("asks once for a rating when Learning reaches 100 words, pointing at Rate", async () => {
    const f = fake({
      links: LINKS,
      counts: { learning: 100, known: 2341, phrases: 37 },
    });
    const screen = await render(<Popup deps={f.deps} />);
    await expect
      .element(nudge(screen))
      .toHaveTextContent(
        "Nice work! You've hit 100 words in Learning.Enjoying Langle? A quick rating below helps other learners find it.",
      );
    const rate = footer(screen).getByRole("link", { name: "Rate" });
    expect(getComputedStyle(rate.element()).color).toBe("rgb(26, 79, 181)");
    expect(getComputedStyle(rate.element()).backgroundColor).toBe(
      "rgb(234, 240, 253)",
    );
    // The bubble sits right above the footer.
    expect(
      nudge(screen).element().getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(footer(screen).element().getBoundingClientRect().top);
  });

  it("does not ask at 99 Learning words, and Rate is not highlighted", async () => {
    const f = fake({
      links: LINKS,
      counts: { learning: 99, known: 2341, phrases: 37 },
    });
    const screen = await render(<Popup deps={f.deps} />);
    const rate = footer(screen).getByRole("link", { name: "Rate" });
    await expect.element(rate).toBeVisible();
    expect(nudge(screen).query()).toBeNull();
    expect(getComputedStyle(rate.element()).color).toBe("rgb(90, 96, 117)");
  });

  it("Rate opens the store's review page and the nudge never comes back", async () => {
    const f = fake({ links: LINKS });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(nudge(screen)).toBeVisible();
    await footer(screen).getByRole("link", { name: "Rate" }).click();
    await expect.poll(() => f.deps.openTab).toHaveBeenCalledWith(LINKS.review);
    expect(f.settings().rateNudgeDone).toBe(true);
    expect(nudge(screen).query()).toBeNull();

    await screen.unmount();
    const again = await render(<Popup deps={f.deps} />);
    await expect.element(footer(again)).toBeVisible();
    expect(nudge(again).query()).toBeNull();
  });

  it("× dismisses the nudge for good without opening anything", async () => {
    const f = fake({ links: LINKS });
    const screen = await render(<Popup deps={f.deps} />);
    await nudge(screen).getByRole("button", { name: "Dismiss" }).click();
    await expect.element(nudge(screen)).not.toBeInTheDocument();
    expect(f.settings().rateNudgeDone).toBe(true);
    expect(f.deps.openTab).not.toHaveBeenCalled();
  });

  it("the nudge stays away once answered on another device", async () => {
    const f = fake({ links: LINKS });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(nudge(screen)).toBeVisible();
    f.changeSettings({ rateNudgeDone: true });
    await expect.element(nudge(screen)).not.toBeInTheDocument();
  });

  it("Buy me a coffee opens the Ko-fi page, also while Langle is off", async () => {
    const f = fake({ links: LINKS, settings: { enabled: false } });
    const screen = await render(<Popup deps={f.deps} />);
    const coffee = footer(screen).getByRole("link", {
      name: "Buy me a coffee if you enjoy Langle",
    });
    await coffee.click();
    expect(f.deps.openTab).toHaveBeenCalledWith(LINKS.coffee);
    expect(f.settings().rateNudgeDone).toBe(false);
  });

  it("leaves out a link whose page does not exist yet, and the footer without any", async () => {
    const f = fake({ links: { coffee: LINKS.coffee } });
    const screen = await render(<Popup deps={f.deps} />);
    await expect
      .element(footer(screen).getByRole("link", { name: /Buy me a coffee/ }))
      .toBeVisible();
    expect(screen.getByRole("link", { name: "Rate" }).query()).toBeNull();
    // No Rate to point at: no nudge either.
    expect(nudge(screen).query()).toBeNull();
    await screen.unmount();

    const none = await render(<Popup deps={fake().deps} />);
    await expect.element(none.getByText("2,341")).toBeVisible();
    expect(none.getByRole("navigation").query()).toBeNull();
  });
});
