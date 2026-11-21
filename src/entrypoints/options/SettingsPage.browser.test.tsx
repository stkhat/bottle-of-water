import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-preact";
import type {
  CloudStatus,
  HistoryStatus,
  ImportResult,
  PackStatus,
  Request,
  SyncStatus,
} from "../../messaging/protocol";
import type { PackState, PackStates } from "../../core/packs/state";
import type { SupportLinks } from "../../core/links";
import { mergeSettings, type Settings } from "../../core/settings";
import type { ExplanationProvider } from "../../core/explain/provider";
import type { LanguagePair } from "../../core/packs/pairs";
import { fakeExplanationProvider } from "../../testing/explain";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";
import { listeners, settingsListeners } from "../../testing/stubs";

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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

/** Connected to Google Drive, saved 2 minutes ago, checked 1 minute ago. */
const CONNECTED: CloudStatus = {
  available: ["googleDrive"],
  provider: "googleDrive",
  lastSavedAt: NOW - 2 * MINUTE,
  lastCheckedAt: NOW - MINUTE,
  bytes: 1.4 * 1024 * 1024,
  devices: 3,
};
/** Not connected, in a build that can connect to Google Drive. */
const CAN_CONNECT: CloudStatus = {
  available: ["googleDrive"],
  bytes: 0,
  devices: 0,
};

interface FakeOptions {
  settings?: Partial<Settings>;
  /** What `cloudStatus` answers first (default: a build with no provider). */
  cloud?: CloudStatus;
  /** The on-device AI (default: none, as in Firefox). */
  explainProvider?: ExplanationProvider;
  lastExport?: number | null;
  importResult?: ImportResult | Error;
  history?: HistoryStatus;
  /** What `packStatus` answers for the settings (default: `japanese()`). */
  packStatus?: (settings: Settings) => PackStatus;
  /** The Support Langle links (default: none set). */
  links?: Partial<SupportLinks>;
}

const MB = 1024 * 1024;
const HISTORY: HistoryStatus = { bytes: 18 * MB, cap: 50 * MB, pages: 1240 };

function fake(options: FakeOptions = {}) {
  let settings = mergeSettings(options.settings ?? {});
  let lastExport = options.lastExport ?? null;
  let history = options.history ?? HISTORY;
  let cloud: CloudStatus = options.cloud ?? {
    available: [],
    bytes: 0,
    devices: 0,
  };
  const settingsWatchers = settingsListeners(settings);
  const packWatchers = listeners<PackStates>();
  const removed = new Set<string>();
  const sent: Request[] = [];
  const downloads: { name: string; text: string }[] = [];
  const deps: SettingsDeps = {
    send: (async (request: Request) => {
      sent.push(request);
      switch (request.type) {
        case "getSettings":
          return settings;
        case "setSettings":
          settings = mergeSettings(request.patch, settings);
          settingsWatchers.emit(settings);
          return settings;
        case "syncStatus":
          return { ...SYNC, enabled: settings.syncEnabled };
        case "cloudStatus":
          return cloud;
        case "cloudConnect":
          cloud = { ...CONNECTED, provider: request.provider };
          settings = mergeSettings(
            { cloudProvider: request.provider },
            settings,
          );
          settingsWatchers.emit(settings);
          return null;
        case "cloudDisconnect":
          cloud = { available: cloud.available, bytes: 0, devices: 0 };
          settings = mergeSettings({ cloudProvider: "none" }, settings);
          settingsWatchers.emit(settings);
          return null;
        case "lastExport":
          return lastExport;
        case "exportJson":
          lastExport = NOW;
          return '{"format":"langle-export"}';
        case "historyStatus":
          return history;
        case "clearHistory":
          history = { ...history, bytes: 0, pages: 0 };
          return null;
        case "packStatus": {
          const status = options.packStatus?.(settings) ?? japanese();
          return {
            ...status,
            others: status.others.filter((o) => !removed.has(o.pack)),
          };
        }
        case "retryPacks":
          return null;
        case "removePack":
          removed.add(request.pack);
          return null;
        case "importJson": {
          const result = options.importResult ?? {
            terms: 3,
            sources: 1,
            occurrences: 2,
          };
          if (result instanceof Error) throw result;
          return result;
        }
        default:
          throw new Error(`unexpected ${request.type}`);
      }
    }) as SettingsDeps["send"],
    watchSettings: settingsWatchers.watch,
    watchPackState: packWatchers.watch,
    env: {
      name: "Chrome",
      syncName: "Chrome sync",
      features: { fileSystemAccess: true },
    },
    ...(options.explainProvider && {
      explainProvider: options.explainProvider,
    }),
    version: "0.1.0",
    noticesUrl: "chrome-extension://langle/notices.html",
    links: {
      coffee: "",
      feedback: "",
      sponsor: "",
      review: "",
      ...options.links,
    },
    now: () => NOW,
    download: (name, text) => downloads.push({ name, text }),
    refreshMs: 60_000,
  };
  return {
    deps,
    sent,
    downloads,
    settings: () => settings,
    changeSettings(patch: Partial<Settings>) {
      settings = mergeSettings(patch, settings);
      settingsWatchers.emit(settings);
    },
    /** The background writes `packState`. */
    setPackStates(states: PackStates) {
      packWatchers.emit(states);
    },
  };
}

const MB_ = 1024 * 1024;
const ready = (total: number): PackState => ({
  state: "ready",
  received: total,
  total,
});
/** The Spanish pair's packs (3.0 and 3.4 MB), downloaded, in these states. */
const spanish = (
  es: PackState,
  esEn: PackState,
  others: PackStatus["others"] = [],
): PackStatus => ({
  pair: {
    packs: [
      { pack: "es", size: 3 * MB_, ...es },
      { pack: "es-en", size: 3.4 * MB_, ...esEn },
    ],
  },
  others,
});
/** The default pair's packs (English → Japanese, 32 MB), downloaded. */
const japanese = (others: PackStatus["others"] = []): PackStatus => ({
  pair: {
    packs: [
      { pack: "en", size: 6 * MB_, ...ready(6 * MB_) },
      { pack: "en-ja", size: 7 * MB_, ...ready(7 * MB_) },
      { pack: "en-defs", size: 19 * MB_, ...ready(19 * MB_) },
    ],
  },
  others,
});

beforeAll(async () => {
  await page.viewport(1200, 800);
});
afterEach(() => {
  cleanup();
  scrollTo(0, 0);
  vi.unstubAllGlobals();
});

async function open(options: FakeOptions = {}) {
  const f = fake(options);
  const screen = await render(<SettingsPage deps={f.deps} />);
  await expect
    .element(screen.getByRole("heading", { name: "About" }))
    .toBeVisible();
  return { ...f, screen };
}

const optionLabels = (select: Element) =>
  [...(select as HTMLSelectElement).options].map((o) => o.label);

const setSettingsPatches = (sent: Request[]) =>
  sent.flatMap((r) => (r.type === "setSettings" ? [r.patch] : []));

const section = (screen: Awaited<ReturnType<typeof render>>, name: string) =>
  screen.getByRole("region", { name });

describe("SettingsPage", () => {
  it("has a section and a nav link for each group, the first one current", async () => {
    const { screen } = await open();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    for (const name of [
      "Languages",
      "Appearance",
      "New-word level",
      "Highlighting",
      "Dictionaries and AI",
      "Video subtitles",
      "Sites",
      "Sentence history",
      "Sync and backup",
      "About",
    ]) {
      await expect.element(section(screen, name)).toBeInTheDocument();
      await expect.element(nav.getByRole("link", { name })).toBeInTheDocument();
    }
    await expect
      .element(nav.getByRole("link", { name: "Languages" }))
      .toHaveAttribute("aria-current", "true");
  });

  it("marks the section scrolled into view in the nav", async () => {
    const { screen } = await open();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    document.getElementById("video")!.scrollIntoView();
    await expect
      .element(nav.getByRole("link", { name: "Video subtitles" }))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(nav.getByRole("link", { name: "Languages" }))
      .not.toHaveAttribute("aria-current");
  });

  it("offers only the languages that exist", async () => {
    const { screen } = await open();
    const learning = screen.getByRole("combobox", {
      name: /Learning language/,
    });
    await expect.element(learning).toHaveDisplayValue("English");
    expect(optionLabels(learning.element())).toEqual([
      "English",
      "Spanish (Español)",
      "French (Français)",
      "German (Deutsch)",
    ]);
    const native = screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("Japanese (日本語)");
    expect(optionLabels(native.element())).toEqual([
      "Japanese (日本語)",
      "Spanish (Español)",
      "Portuguese (Português)",
      "Russian (Русский)",
      "French (Français)",
      "German (Deutsch)",
      "Chinese, Simplified (简体中文)",
      "Italian (Italiano)",
      "Polish (Polski)",
      "Thai (ภาษาไทย)",
      "Hindi (हिन्दी)",
      "Arabic (العربية)",
    ]);
    const ui = screen.getByRole("combobox", { name: /Interface language/ });
    await expect.element(ui).toHaveDisplayValue("English");
    expect(optionLabels(ui.element())).toEqual(["English"]);
  });

  it("offers as your language only those with a dictionary for the learning language", async () => {
    const { screen } = await open({
      settings: { learningLang: "es", nativeLang: "en" },
    });
    await expect
      .element(screen.getByRole("combobox", { name: /Learning language/ }))
      .toHaveDisplayValue("Spanish (Español)");
    const native = screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("English");
    expect(optionLabels(native.element())).toEqual(["English"]);
    await expect
      .element(
        screen.getByRole("slider", {
          name: "Treat the 3,000 most common Spanish words as known",
        }),
      )
      .toBeVisible();
  });

  it("offers French → English, with French words in the level", async () => {
    const { screen } = await open({
      settings: { learningLang: "fr", nativeLang: "en" },
    });
    await expect
      .element(screen.getByRole("combobox", { name: /Learning language/ }))
      .toHaveDisplayValue("French (Français)");
    const native = screen.getByRole("combobox", { name: /Your language/ });
    expect(optionLabels(native.element())).toEqual(["English"]);
    await expect
      .element(
        screen.getByRole("slider", {
          name: "Treat the 3,000 most common French words as known",
        }),
      )
      .toBeVisible();
  });

  it("offers German → English and German → French, with German words in the level", async () => {
    const { screen } = await open({
      settings: { learningLang: "de", nativeLang: "en" },
    });
    await expect
      .element(screen.getByRole("combobox", { name: /Learning language/ }))
      .toHaveDisplayValue("German (Deutsch)");
    const native = screen.getByRole("combobox", { name: /Your language/ });
    expect(optionLabels(native.element())).toEqual([
      "English",
      "French (Français)",
    ]);
    await expect
      .element(
        screen.getByRole("slider", {
          name: "Treat the 3,000 most common German words as known",
        }),
      )
      .toBeVisible();
  });

  it("changes your language with the learning language, in one change", async () => {
    const f = await open();
    const learning = f.screen.getByRole("combobox", {
      name: /Learning language/,
    });
    await userEvent.selectOptions(learning, "Spanish (Español)");
    const native = f.screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("English");
    expect(setSettingsPatches(f.sent)).toEqual([
      { learningLang: "es", nativeLang: "en" },
    ]);
    await expect.poll(() => f.settings().nativeLang).toBe("en");
    await userEvent.selectOptions(learning, "English");
    await expect.element(native).toHaveDisplayValue("Japanese (日本語)");
    expect(setSettingsPatches(f.sent)).toEqual([
      { learningLang: "es", nativeLang: "en" },
      { learningLang: "en", nativeLang: "ja" },
    ]);
  });

  it("starts the translator's model download when a language is chosen", async () => {
    const created: string[] = [];
    vi.stubGlobal("Translator", {
      availability: async (pair: {
        sourceLanguage: string;
        targetLanguage: string;
      }) => (pair.sourceLanguage === "es" ? "available" : "downloadable"),
      create: async (pair: {
        sourceLanguage: string;
        targetLanguage: string;
      }) => {
        created.push(`${pair.sourceLanguage}>${pair.targetLanguage}`);
        return { translate: async (text: string) => text, destroy() {} };
      },
    });
    const f = await open({
      settings: { learningLang: "es", nativeLang: "en" },
    });
    const learning = f.screen.getByRole("combobox", {
      name: /Learning language/,
    });
    expect(created).toEqual([]);
    await userEvent.selectOptions(learning, "English");
    // English → Japanese: the definitions' model is the subtitles' one.
    await expect.poll(() => created).toEqual(["en>ja"]);
    await userEvent.selectOptions(learning, "Spanish (Español)");
    // Spanish → English is there already, and nothing translates into English.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(created).toEqual(["en>ja"]);
  });

  describe("Language data", () => {
    const SPANISH = { learningLang: "es", nativeLang: "en" };
    const dataRow = (screen: Awaited<ReturnType<typeof render>>) =>
      section(screen, "Languages").getByText("Language data");

    it("shows the chosen pair's size and its download's share, then Downloaded", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), {
            state: "downloading",
            received: 0.4 * MB_,
            total: 3.4 * MB_,
          }),
      });
      const languages = section(f.screen, "Languages");
      await expect.element(dataRow(f.screen)).toBeVisible();
      await expect
        .element(
          languages.getByText(
            "Words and dictionaries Langle keeps on this device.",
          ),
        )
        .toBeVisible();
      await expect
        .element(languages.getByText("Spanish → English"))
        .toBeVisible();
      await expect.element(languages.getByText("6.4 MB")).toBeVisible();
      await expect
        .element(languages.getByText("Downloading · 53%"))
        .toBeVisible();

      f.setPackStates({ "es-en": ready(3.4 * MB_) });
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      expect(languages.getByText(/Downloading/).query()).toBeNull();
    });

    it("shows an update downloading while the older data is in use", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), {
            state: "downloading",
            received: 1.7 * MB_,
            total: 3.4 * MB_,
            updating: true,
          }),
      });
      await expect
        .element(section(f.screen, "Languages").getByText("Downloading · 73%"))
        .toBeVisible();
    });

    it("says the download failed, and Retry asks the background to try again", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), {
            state: "failed",
            received: 0,
            total: 3.4 * MB_,
            error: "HTTP 404",
          }),
      });
      const languages = section(f.screen, "Languages");
      await expect
        .element(languages.getByText("Couldn't download"))
        .toBeVisible();
      await languages.getByRole("button", { name: "Retry" }).click();
      expect(f.sent).toContainEqual({ type: "retryPacks" });
      f.setPackStates({
        "es-en": { state: "downloading", received: 0, total: 3.4 * MB_ },
      });
      await expect
        .element(languages.getByText("Downloading · 46%"))
        .toBeVisible();
    });

    it("lists data the chosen pair does not use, by its pair, and Remove deletes its packs", async () => {
      const f = await open({
        packStatus: () =>
          japanese([
            { pack: "es", size: 3 * MB_ },
            { pack: "es-en", size: 6.1 * MB_ },
          ]),
      });
      const languages = section(f.screen, "Languages");
      await expect.element(dataRow(f.screen)).toBeVisible();
      await expect
        .element(languages.getByText("Spanish → English"))
        .toBeVisible();
      await expect
        .element(languages.getByText("Not used by your languages now · 9.1 MB"))
        .toBeVisible();
      await expect
        .element(languages.getByText("English → Japanese"))
        .toBeVisible();

      await languages
        .getByRole("button", { name: "Remove Spanish → English data" })
        .click();
      await expect
        .element(languages.getByText("Spanish → English"))
        .not.toBeInTheDocument();
      // The chosen pair's data stays.
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      expect(
        f.sent.flatMap((r) => (r.type === "removePack" ? [r.pack] : [])),
      ).toEqual(["es", "es-en"]);
    });

    it("lists other data under the chosen pair's", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), ready(3.4 * MB_), [
            { pack: "en-ja", size: 9.1 * MB_ },
          ]),
      });
      const languages = section(f.screen, "Languages");
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      const chosen = languages.getByText("Spanish → English").element();
      const other = languages.getByText("English → Japanese").element();
      expect(
        chosen.compareDocumentPosition(other) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("shows the default pair's data, and asks again for another pair", async () => {
      const f = await open({
        packStatus: (s) =>
          s.learningLang === "es"
            ? spanish(ready(3 * MB_), {
                state: "downloading",
                received: 0,
                total: 3.4 * MB_,
              })
            : japanese(),
      });
      const languages = section(f.screen, "Languages");
      await expect
        .element(languages.getByText("English → Japanese"))
        .toBeVisible();
      await expect.element(languages.getByText("32.0 MB")).toBeVisible();
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      await userEvent.selectOptions(
        f.screen.getByRole("combobox", { name: /Learning language/ }),
        "Spanish (Español)",
      );
      await expect
        .element(languages.getByText("Downloading · 46%"))
        .toBeVisible();
      expect(languages.getByText("English → Japanese").query()).toBeNull();
    });
  });

  it("sets the new-word level with the slider", async () => {
    const f = await open();
    const slider = f.screen.getByRole("slider", {
      name: "Treat the 3,000 most common English words as known",
    });
    await expect.element(slider).toHaveValue("3000");
    const input = slider.element() as HTMLInputElement;
    input.value = "5500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await expect
      .element(
        f.screen.getByText(
          "Treat the 5,500 most common English words as known",
        ),
      )
      .toBeVisible();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await expect.poll(() => f.settings().knownLevel).toBe(5500);
  });

  it("switches highlight categories and what happens to unsaved words", async () => {
    const f = await open();
    const newWords = f.screen.getByRole("switch", {
      name: "Highlight New words",
    });
    await expect.element(newWords).not.toBeChecked();
    await newWords.click();
    await expect.element(newWords).toBeChecked();
    expect(f.settings().highlight.new).toBe(true);

    const unsaved = f.screen.getByRole("group", {
      name: "New words you didn't save",
    });
    const keep = unsaved.getByRole("button", { name: "Keep as New" });
    const known = unsaved.getByRole("button", { name: "Mark as Known" });
    await expect.element(keep).toHaveAttribute("aria-pressed", "true");
    await expect.element(known).toHaveAttribute("aria-pressed", "false");
    await known.click();
    await expect.poll(() => f.settings().unsavedAtEnd).toBe("known");
    await expect.element(known).toHaveAttribute("aria-pressed", "true");
    await expect.element(keep).toHaveAttribute("aria-pressed", "false");
  });

  it("picks the theme, System by default", async () => {
    const f = await open();
    const theme = f.screen.getByRole("group", { name: "Theme" });
    const system = theme.getByRole("button", { name: "System" });
    const dark = theme.getByRole("button", { name: "Dark" });
    await expect.element(system).toHaveAttribute("aria-pressed", "true");
    await expect.element(dark).toHaveAttribute("aria-pressed", "false");
    await dark.click();
    await expect.poll(() => f.settings().theme).toBe("dark");
    await expect.element(dark).toHaveAttribute("aria-pressed", "true");
    await expect.element(system).toHaveAttribute("aria-pressed", "false");
  });

  it("follows settings changed elsewhere", async () => {
    const f = await open();
    const known = f.screen.getByRole("switch", {
      name: "Highlight Known words",
    });
    await expect.element(known).not.toBeChecked();
    f.changeSettings({
      highlight: { new: false, learning: true, known: true },
      knownLevel: 8000,
    });
    await expect.element(known).toBeChecked();
    await expect
      .element(
        f.screen.getByText(
          "Treat the 8,000 most common English words as known",
        ),
      )
      .toBeVisible();
  });

  it("turns dictionaries off and on", async () => {
    const f = await open();
    const reverso = f.screen.getByRole("checkbox", { name: "Reverso Context" });
    await expect.element(reverso).toBeChecked();
    await reverso.click();
    await expect.element(reverso).not.toBeChecked();
    expect(f.settings().dictionaries.reverso).toBe(false);
  });

  describe("On-device AI", () => {
    const AI_TEXT =
      "Chrome's built-in AI explains a word in the sentence you met it in, in the dictionary window. It runs on this device.";
    const UNKNOWN = "Explain words the dictionary doesn't have";

    it("downloads the model: Download, Downloading with its percentage, Ready", async () => {
      let progress: ((loaded: number) => void) | undefined;
      let finish: (() => void) | undefined;
      const { provider } = fakeExplanationProvider({
        availability: "downloadable",
      });
      const asked: LanguagePair[] = [];
      const availability = provider.availability.bind(provider);
      provider.availability = (pair) => {
        asked.push(pair);
        return availability(pair);
      };
      provider.download = (_pair, onProgress) => {
        progress = onProgress;
        return new Promise<void>((resolve) => (finish = resolve));
      };
      const f = await open({ explainProvider: provider });
      const ai = section(f.screen, "Dictionaries and AI");
      await expect.element(ai.getByText("On-device AI")).toBeVisible();
      await expect.element(ai.getByText(AI_TEXT)).toBeVisible();
      expect(asked).toEqual([{ learning: "en", native: "ja" }]);

      await ai.getByRole("button", { name: "Download" }).click();
      await expect
        .element(ai.getByRole("status"))
        .toHaveTextContent("Downloading0%");
      progress!(0.42);
      await expect
        .element(ai.getByRole("status"))
        .toHaveTextContent("Downloading42%");
      finish!();
      await expect.element(ai.getByText("Ready")).toBeVisible();
      expect(ai.getByRole("button", { name: "Download" }).query()).toBeNull();
    });

    it("reads the model again for another pair, and shows Ready when it is there", async () => {
      const { provider } = fakeExplanationProvider();
      const f = await open({ explainProvider: provider });
      const ai = section(f.screen, "Dictionaries and AI");
      await expect.element(ai.getByText("Ready")).toBeVisible();
      provider.availability = async (pair) =>
        pair.native === "pt" ? "unavailable" : "ready";
      f.changeSettings({ nativeLang: "pt" });
      await expect.poll(() => ai.getByText("On-device AI").query()).toBeNull();
      expect(ai.getByRole("switch", { name: UNKNOWN }).query()).toBeNull();
    });

    it("switches explaining words without an entry, on by default", async () => {
      const { provider } = fakeExplanationProvider();
      const f = await open({ explainProvider: provider });
      const ai = section(f.screen, "Dictionaries and AI");
      const unknown = ai.getByRole("switch", { name: UNKNOWN });
      await expect.element(unknown).toHaveAttribute("aria-checked", "true");
      await expect
        .element(
          ai.getByText(
            "As soon as the dictionary window opens. Words with an entry are explained when you press Explain in context.",
          ),
        )
        .toBeVisible();
      await unknown.click();
      await expect.element(unknown).toHaveAttribute("aria-checked", "false");
      expect(f.settings().explainUnknown).toBe(false);
      expect(setSettingsPatches(f.sent)).toContainEqual({
        explainUnknown: false,
      });
    });

    it("shows no rows where the pair cannot run, nor without a provider", async () => {
      const { provider } = fakeExplanationProvider({
        availability: "unavailable",
      });
      const f = await open({ explainProvider: provider });
      await expect
        .element(section(f.screen, "Dictionaries and AI"))
        .toBeVisible();
      expect(f.screen.getByText("On-device AI").query()).toBeNull();
      expect(f.screen.getByText(UNKNOWN).query()).toBeNull();
      cleanup();

      const without = await open();
      expect(without.screen.getByText("On-device AI").query()).toBeNull();
      expect(without.screen.getByText(/built-in AI/).query()).toBeNull();
      expect(without.screen.getByText(UNKNOWN).query()).toBeNull();
    });
  });

  it("picks the subtitle position and the translation switches", async () => {
    const f = await open();
    const group = f.screen.getByRole("group", { name: "Subtitle position" });
    const inVideo = group.getByRole("button", { name: /In the video/ });
    const below = group.getByRole("button", { name: /Below the video/ });
    await expect.element(inVideo).toHaveAttribute("aria-pressed", "true");
    await below.click();
    await expect.element(below).toHaveAttribute("aria-pressed", "true");
    await expect.element(inVideo).toHaveAttribute("aria-pressed", "false");
    expect(f.settings().subtitlePosition).toBe("belowVideo");

    await f.screen
      .getByRole("switch", { name: "Show translation in the transcript" })
      .click();
    await expect.poll(() => f.settings().transcriptTranslation).toBe(false);
    expect(f.settings().subtitleTranslation).toBe(true);
  });

  describe("sites", () => {
    it("switches Langle off for a kind of site", async () => {
      const f = await open();
      await f.screen
        .getByRole("switch", { name: "Run Langle on Netflix" })
        .click();
      await expect.poll(() => f.settings().sites.netflix).toBe(false);
      await expect
        .element(
          f.screen.getByRole("switch", {
            name: "Run Langle on Articles on other sites",
          }),
        )
        .toBeChecked();
    });

    it("switches the YouTube comments on their own", async () => {
      const f = await open();
      const comments = f.screen.getByRole("switch", {
        name: "Run Langle on YouTube comments",
      });
      await expect.element(comments).toBeChecked();
      await expect
        .element(
          f.screen.getByText(
            "Highlights and dictionary in the comments under a video.",
          ),
        )
        .toBeVisible();
      await comments.click();
      await expect.poll(() => f.settings().sites.youtubeComments).toBe(false);
      expect(f.settings().sites.youtube).toBe(true);
    });

    it("lists, adds and removes sites it never runs on", async () => {
      const f = await open({ settings: { neverRunOn: ["mail.google.com"] } });
      const sites = section(f.screen, "Sites");
      await expect.element(sites.getByText("mail.google.com")).toBeVisible();

      await sites.getByRole("button", { name: "+ Add site" }).click();
      const input = sites.getByRole("textbox", {
        name: "Site to never run on",
      });
      await expect.element(input).toHaveFocus();
      await input.fill("not a site");
      await userEvent.keyboard("{Enter}");
      await expect
        .element(sites.getByText("Enter a site such as example.com"))
        .toBeVisible();
      expect(f.settings().neverRunOn).toEqual(["mail.google.com"]);

      await input.fill("https://Docs.example.com/page");
      await userEvent.keyboard("{Enter}");
      await expect.element(sites.getByText("docs.example.com")).toBeVisible();
      expect(f.settings().neverRunOn).toEqual([
        "mail.google.com",
        "docs.example.com",
      ]);
      expect(input.query()).toBeNull();

      await sites
        .getByRole("button", { name: "Remove mail.google.com" })
        .click();
      await expect
        .poll(() => f.settings().neverRunOn)
        .toEqual(["docs.example.com"]);
    });

    it("cancels adding a site with Escape", async () => {
      const f = await open();
      const sites = section(f.screen, "Sites");
      await sites.getByRole("button", { name: "+ Add site" }).click();
      await sites
        .getByRole("textbox", { name: "Site to never run on" })
        .fill("example.com");
      await userEvent.keyboard("{Escape}");
      await expect
        .element(sites.getByRole("button", { name: "+ Add site" }))
        .toBeVisible();
      expect(f.settings().neverRunOn).toEqual([]);
    });
  });

  describe("sentence history", () => {
    it("comes after Sites in the nav", async () => {
      const { screen } = await open();
      const links = screen
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link")
        .elements()
        .map((a) => a.textContent);
      expect(
        links.slice(links.indexOf("Sites"), links.indexOf("Sites") + 2),
      ).toEqual(["Sites", "Sentence history"]);
    });

    it("shows the switch, the space used and the pages kept", async () => {
      const f = await open();
      const history = section(f.screen, "Sentence history");
      await expect
        .element(
          history.getByText(
            "Sentences from pages and videos you open with Langle on, kept on this device so the dictionary can show where you met a word before you saved it.",
          ),
        )
        .toBeVisible();
      await expect
        .element(
          history.getByText(
            "Never synced. Pages on your Never run on list are not kept.",
          ),
        )
        .toBeVisible();
      await expect
        .element(history.getByRole("switch", { name: "Keep sentence history" }))
        .toBeChecked();
      await expect.element(history.getByText("Space used")).toBeVisible();
      await expect.element(history.getByText("18 MB of 50 MB")).toBeVisible();
      await expect
        .element(
          history.getByText(
            "1,240 pages and videos · the oldest are removed first when space runs out",
          ),
        )
        .toBeVisible();
      await expect
        .element(history.getByText("Saved words and their sources stay."))
        .toBeVisible();
    });

    it("says nothing is kept when there are no pages", async () => {
      const f = await open({ history: { bytes: 0, cap: 50 * MB, pages: 0 } });
      const history = section(f.screen, "Sentence history");
      await expect.element(history.getByText("Nothing kept yet")).toBeVisible();
      await expect.element(history.getByText("0 MB of 50 MB")).toBeVisible();
    });

    it("counts one page alone, and a little data as 1 MB of the bar", async () => {
      const f = await open({
        history: { bytes: 2048, cap: 50 * MB, pages: 1 },
      });
      const history = section(f.screen, "Sentence history");
      await expect
        .element(
          history.getByText(
            "1 page or video · the oldest are removed first when space runs out",
          ),
        )
        .toBeVisible();
      await expect.element(history.getByText("1 MB of 50 MB")).toBeVisible();
      const fill = history
        .element()
        .querySelector<HTMLElement>('[aria-hidden="true"] > span')!;
      expect(fill.style.width).toBe("1%");
    });

    it("turns sentence history off and on", async () => {
      const f = await open();
      const toggle = section(f.screen, "Sentence history").getByRole("switch", {
        name: "Keep sentence history",
      });
      await toggle.click();
      await expect.element(toggle).not.toBeChecked();
      await expect.poll(() => f.settings().sentenceHistory).toBe(false);
      expect(setSettingsPatches(f.sent)).toEqual([{ sentenceHistory: false }]);
    });

    it("clears the history and shows that nothing is kept", async () => {
      const f = await open();
      const history = section(f.screen, "Sentence history");
      await expect.element(history.getByText(/^1,240 pages/)).toBeVisible();
      await history.getByRole("button", { name: "Clear" }).click();
      await expect.element(history.getByText("Nothing kept yet")).toBeVisible();
      await expect.element(history.getByText("0 MB of 50 MB")).toBeVisible();
      expect(f.sent).toContainEqual({ type: "clearHistory" });
    });
  });

  describe("sync and backup", () => {
    it("names the browser's sync and shows the space used and the last save", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      const toggle = sync.getByRole("switch", {
        name: "Sync word status with Chrome sync",
      });
      await expect.element(toggle).toBeChecked();
      await expect.element(sync.getByText("41 KB of 100 KB")).toBeVisible();
      await expect
        .element(sync.getByText("Last saved 2 minutes ago"))
        .toBeVisible();

      await toggle.click();
      await expect.element(toggle).not.toBeChecked();
      expect(f.settings().syncEnabled).toBe(false);
      await expect.element(sync.getByText("Sync is off")).toBeVisible();
      expect(f.screen.getByText(/Synced/).query()).toBeNull();
    });

    it("exports a dated backup file and shows when", async () => {
      const f = await open({ lastExport: null });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(sync.getByText(/Never exported\./)).toBeVisible();
      await sync.getByRole("button", { name: "Export" }).click();
      await expect
        .element(sync.getByText(/Last export: just now\./))
        .toBeVisible();
      expect(f.downloads).toEqual([
        {
          name: "langle-backup-2026-11-10.json",
          text: '{"format":"langle-export"}',
        },
      ]);
    });

    it("says how long ago the last export was", async () => {
      const f = await open({ lastExport: NOW - 12 * DAY });
      await expect
        .element(
          section(f.screen, "Sync and backup").getByText(
            /Last export: 12 days ago\./,
          ),
        )
        .toBeVisible();
    });

    it("imports a backup file and says how many words came in", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      const file = new File(['{"format":"langle-export"}'], "backup.json", {
        type: "application/json",
      });
      const input =
        f.screen.container.querySelector<HTMLInputElement>(
          'input[type="file"]',
        )!;
      await userEvent.upload(input, file);
      await expect.element(sync.getByText("Imported 3 words")).toBeVisible();
      expect(f.sent).toContainEqual({
        type: "importJson",
        json: '{"format":"langle-export"}',
      });
    });

    it("shows why an import failed", async () => {
      const f = await open({ importResult: new Error("Not a Langle export") });
      const input =
        f.screen.container.querySelector<HTMLInputElement>(
          'input[type="file"]',
        )!;
      await userEvent.upload(
        input,
        new File(["{}"], "x.json", { type: "application/json" }),
      );
      await expect
        .element(
          section(f.screen, "Sync and backup").getByText(
            "Could not import: Not a Langle export",
          ),
        )
        .toBeVisible();
    });

    it("lists your own cloud storage as coming later in a build that cannot connect", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Your own cloud storage"))
        .toBeVisible();
      await expect.element(sync.getByText("Coming later")).toBeVisible();
      expect(sync.getByRole("button", { name: /Connect/ }).query()).toBeNull();
      await expect
        .element(
          f.screen.getByText(
            "Langle has no server. Your words are kept in this browser and, if you like, synced through Chrome sync.",
          ),
        )
        .toBeVisible();
    });
  });

  describe("your own cloud storage", () => {
    const LEAD =
      "Langle has no server. Your words are kept in this browser and, if you like, synced through Chrome sync or your own Google Drive.";
    const DESC =
      "Google Drive. Everything is saved there, in a folder only Langle can open.";
    const syncSwitch = (sync: ReturnType<typeof section>) =>
      sync.getByRole("switch", { name: "Sync word status with Chrome sync" });

    it("offers Google Drive after the backup file, and Connect connects", async () => {
      const f = await open({ cloud: CAN_CONNECT });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(sync.getByText(LEAD)).toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Save everything, including sources and sentences, to your Google Drive, for when Chrome sync space runs out.",
          ),
        )
        .toBeVisible();
      const rows = [...sync.element().querySelectorAll(".row")].map(
        (row) => row.textContent ?? "",
      );
      expect(rows.at(-2)).toMatch(/^Backup file/);
      expect(rows.at(-1)).toMatch(/^Your own cloud storage/);
      expect(sync.getByText("Coming later").query()).toBeNull();

      await sync.getByRole("button", { name: "Connect Google Drive" }).click();
      await expect.element(sync.getByText(DESC)).toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("shows where it stands while connected, without browser sync's switch and space", async () => {
      const f = await open({
        cloud: CONNECTED,
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(sync.getByText(LEAD)).toBeVisible();
      await expect
        .element(sync.getByText("Your own cloud storage"))
        .toBeVisible();
      await expect.element(sync.getByText(DESC)).toBeVisible();
      await expect
        .element(sync.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      await expect.element(sync.getByText("1.4 MB · 3 devices")).toBeVisible();
      await expect
        .element(sync.getByText("Last checked other devices: 1 minute ago"))
        .toBeVisible();
      expect(syncSwitch(sync).query()).toBeNull();
      expect(sync.getByText("Sync space").query()).toBeNull();
      expect(
        sync.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
      await expect
        .element(sync.getByRole("button", { name: "Export" }))
        .toBeVisible();
      expect(f.screen.getByText(/Synced/).query()).toBeNull();
    });

    it("names the account this device is connected with", async () => {
      const f = await open({
        cloud: { ...CONNECTED, account: "alex.kim@gmail.com" },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(
          sync.getByText(
            "Google Drive (alex.kim@gmail.com). Everything is saved there, in a folder only Langle can open.",
          ),
        )
        .toBeVisible();
    });

    it("disconnects, and browser sync's switch comes back", async () => {
      const f = await open({
        cloud: CONNECTED,
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await sync.getByRole("button", { name: "Disconnect" }).click();
      await expect.element(syncSwitch(sync)).toBeVisible();
      await expect
        .element(sync.getByRole("button", { name: "Connect Google Drive" }))
        .toBeVisible();
      expect(f.sent).toContainEqual({ type: "cloudDisconnect" });
    });

    it("asks to reconnect, with Reconnect and Disconnect", async () => {
      const f = await open({
        cloud: {
          ...CONNECTED,
          error: "reconnect",
          lastSavedAt: NOW - 3 * HOUR,
        },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      const line = sync.getByText("Reconnect needed");
      await expect.element(line).toBeVisible();
      expect(getComputedStyle(line.element()).color).toBe("rgb(180, 35, 24)");
      await expect.element(sync.getByText("1.4 MB · 3 devices")).toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Last saved 3 hours ago. New changes wait on this device until you reconnect.",
          ),
        )
        .toBeVisible();
      expect(sync.getByText(/Last checked/).query()).toBeNull();
      await expect
        .element(sync.getByRole("button", { name: "Disconnect" }))
        .toBeVisible();
      await sync.getByRole("button", { name: "Reconnect" }).click();
      await expect
        .element(sync.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("says the storage is full, with Disconnect only", async () => {
      const f = await open({
        cloud: { ...CONNECTED, error: "full", lastSavedAt: NOW - 2 * DAY },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Google Drive storage is full"))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Last saved 2 days ago. Langle saves again when there is space; nothing is lost on this device.",
          ),
        )
        .toBeVisible();
      expect(
        sync.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
      await expect
        .element(sync.getByRole("button", { name: "Disconnect" }))
        .toBeVisible();
    });

    it("asks for an update when another device saved with a newer Langle", async () => {
      const f = await open({
        cloud: { ...CONNECTED, error: "update" },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Update Langle on this device"))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Another device saved with a newer Langle, so its changes are not read here yet. Last saved 2 minutes ago.",
          ),
        )
        .toBeVisible();
      expect(
        sync.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
    });

    it("shows a retry as saved: it goes on by itself", async () => {
      const f = await open({
        cloud: { ...CONNECTED, error: "retrying" },
        settings: { cloudProvider: "googleDrive" },
      });
      await expect
        .element(
          section(f.screen, "Sync and backup").getByText(
            "Saved to Google Drive · 2 minutes ago",
          ),
        )
        .toBeVisible();
    });

    it("asks to connect on this device too when another device chose Google Drive", async () => {
      const f = await open({
        cloud: CAN_CONNECT,
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(syncSwitch(sync)).toBeVisible();
      await expect
        .element(sync.getByText("Connect Google Drive on this device too"))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Your other devices save to Google Drive. Each device signs in once.",
          ),
        )
        .toBeVisible();
      await sync.getByRole("button", { name: "Connect", exact: true }).click();
      await expect.element(sync.getByText(DESC)).toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("offers Also save to Google Drive in Sentence history only while connected", async () => {
      const f = await open({ cloud: CAN_CONNECT });
      const history = section(f.screen, "Sentence history");
      await expect
        .element(
          history.getByText(
            "Never synced. Pages on your Never run on list are not kept.",
          ),
        )
        .toBeVisible();
      expect(history.getByText(/Also save to/).query()).toBeNull();

      await section(f.screen, "Sync and backup")
        .getByRole("button", { name: "Connect Google Drive" })
        .click();
      const also = history.getByRole("switch", {
        name: "Also save to Google Drive",
      });
      await expect.element(also).toBeChecked();
      await expect
        .element(
          history.getByText(
            "Your other devices can show these sentences too. Applies to all your devices.",
          ),
        )
        .toBeVisible();
      await expect
        .element(
          history.getByText("Pages on your Never run on list are not kept.", {
            exact: true,
          }),
        )
        .toBeVisible();
      await also.click();
      await expect.element(also).not.toBeChecked();
      expect(f.settings().cloudHistory).toBe(false);
      expect(setSettingsPatches(f.sent)).toEqual([{ cloudHistory: false }]);
    });
  });

  it("has no Articles section: Sync and backup comes right before About", async () => {
    const { screen } = await open();
    const links = screen
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link")
      .elements()
      .map((a) => a.textContent);
    expect(links.slice(-2)).toEqual(["Sync and backup", "About"]);
    expect(links).not.toContain("Articles");
    expect(
      screen
        .getByRole("switch", { name: "Highlight only the article" })
        .elements(),
    ).toHaveLength(0);
  });

  it("shows the version, a one-line credit and the Licenses link", async () => {
    const f = await open();
    const about = section(f.screen, "About");
    await expect
      .element(
        about.getByText(
          "Langle 0.1.0 · Data: Wiktionary (CC BY-SA), EJDict-hand, wordnets, Universal Dependencies · Licenses",
        ),
      )
      .toBeVisible();
    const link = about.getByRole("link", { name: "Licenses" });
    await expect
      .element(link)
      .toHaveAttribute("href", "chrome-extension://langle/notices.html");
    await expect.element(link).toHaveAttribute("target", "_blank");
    // One line at the mock's width (it was five).
    await page.viewport(1440, 900);
    try {
      const text = link.element().parentElement!;
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
      expect(text.getBoundingClientRect().height).toBeLessThan(
        lineHeight * 1.5,
      );
    } finally {
      await page.viewport(1200, 800);
    }
  });

  describe("Support Langle", () => {
    const LINKS: SupportLinks = {
      coffee: "https://ko-fi.example/langle",
      review: "https://store.example/langle/reviews",
      feedback: "https://forms.example/langle",
      sponsor: "https://langle.example/sponsor",
    };

    it("sits under the section nav with Ko-fi, Rate, feedback and the sponsor page, each in a new tab", async () => {
      const { screen } = await open({ links: LINKS });
      const box = section(screen, "Support Langle");
      await expect
        .element(box)
        .toHaveTextContent(
          "Support LangleLangle is free. Your support keeps me going and lets Langle keep growing.Buy me a coffeeRate LangleSend feedbackBecome a sponsor",
        );
      const links = box.getByRole("link").elements();
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        LINKS.coffee,
        LINKS.review,
        LINKS.feedback,
        LINKS.sponsor,
      ]);
      for (const a of links) expect(a.getAttribute("target")).toBe("_blank");
      // The left column, right under the nav; no nav entry of its own.
      const nav = screen
        .getByRole("navigation", { name: "Settings sections" })
        .element();
      expect(nav.nextElementSibling).toBe(box.element());
      expect(nav.querySelector("a[href='#support']")).toBeNull();
      const [coffee, rate] = links.map((a) => getComputedStyle(a));
      expect(coffee!.backgroundColor).toBe("rgb(11, 127, 101)");
      expect(coffee!.height).toBe("40px");
      expect(rate!.borderColor).toBe("rgb(143, 211, 188)");
      expect(rate!.color).toBe("rgb(7, 92, 73)");
      expect(getComputedStyle(box.element()).backgroundColor).toBe(
        "rgb(230, 246, 240)",
      );
    });

    it("leaves out a link whose page does not exist yet, and the box without any", async () => {
      const { screen } = await open({ links: { feedback: LINKS.feedback } });
      const box = section(screen, "Support Langle");
      expect(
        box
          .getByRole("link")
          .elements()
          .map((a) => a.textContent),
      ).toEqual(["Send feedback"]);
      cleanup();

      const none = await open();
      expect(
        none.screen.getByRole("region", { name: "Support Langle" }).query(),
      ).toBeNull();
    });

    it("keeps the whole left column in reach in a short window", async () => {
      await page.viewport(1200, 500);
      try {
        const { screen } = await open({ links: LINKS });
        const sponsor = section(screen, "Support Langle").getByRole("link", {
          name: "Become a sponsor",
        });
        const column = sponsor.element().closest("section")!.parentElement!;
        expect(column.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          innerHeight,
        );
        sponsor.element().scrollIntoView();
        const box = sponsor.element().getBoundingClientRect();
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(innerHeight);
      } finally {
        await page.viewport(1200, 800);
      }
    });
  });
});
