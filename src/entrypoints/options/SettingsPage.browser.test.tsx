import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-preact";
import type { ImportResult } from "../../background/term-store";
import { mergeSettings, type Settings } from "../../core/settings";
import type { HistoryStatus } from "../../background/history-store";
import type { SyncStatus } from "../../core/sync/backend";
import type { Request } from "../../messaging/protocol";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

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
  builtInAi?: boolean;
  lastExport?: number | null;
  importResult?: ImportResult | Error;
  history?: HistoryStatus;
}

const MB = 1024 * 1024;
const HISTORY: HistoryStatus = { bytes: 18 * MB, cap: 50 * MB, pages: 1240 };

function fake(options: FakeOptions = {}) {
  let settings = mergeSettings(options.settings ?? {});
  let lastExport = options.lastExport ?? null;
  let history = options.history ?? HISTORY;
  const listeners = new Set<(s: Settings) => void>();
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
          for (const l of listeners) l(settings);
          return settings;
        case "syncStatus":
          return { ...SYNC, enabled: settings.syncEnabled };
        case "lastExport":
          return lastExport;
        case "exportJson":
          lastExport = NOW;
          return '{"format":"lingo-export"}';
        case "historyStatus":
          return history;
        case "clearHistory":
          history = { ...history, bytes: 0, pages: 0 };
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
    watchSettings(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    env: {
      name: "Chrome",
      syncName: "Chrome sync",
      features: {
        translator: true,
        builtInAi: options.builtInAi ?? true,
        highlightUnderline: true,
        fileSystemAccess: true,
      },
    },
    version: "0.1.0",
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
      for (const l of listeners) l(settings);
    },
  };
}

beforeAll(async () => {
  await page.viewport(1200, 800);
});
afterEach(() => {
  cleanup();
  scrollTo(0, 0);
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
    ]);
    const native = screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("Japanese (日本語)");
    expect(optionLabels(native.element())).toEqual(["Japanese (日本語)"]);
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

  it("mentions the browser's built-in AI only where there is one", async () => {
    const withAi = await open({ builtInAi: true });
    const ai = section(withAi.screen, "Dictionaries and AI");
    await expect
      .element(
        ai.getByText(
          "Uses Chrome's built-in AI on your device, or your own API key.",
        ),
      )
      .toBeVisible();
    await expect.element(ai.getByText("Coming later")).toBeVisible();
    cleanup();

    const without = await open({ builtInAi: false });
    await expect
      .element(
        section(without.screen, "Dictionaries and AI").getByText(
          "Uses your own API key.",
        ),
      )
      .toBeVisible();
    expect(without.screen.getByText(/built-in AI/).query()).toBeNull();
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
    it("switches Lingo off for a kind of site", async () => {
      const f = await open();
      await f.screen
        .getByRole("switch", { name: "Run Lingo on Netflix" })
        .click();
      await expect.poll(() => f.settings().sites.netflix).toBe(false);
      await expect
        .element(
          f.screen.getByRole("switch", {
            name: "Run Lingo on Articles on other sites",
          }),
        )
        .toBeChecked();
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
            "Sentences from pages and videos you open with Lingo on, kept on this device so the dictionary can show where you met a word before you saved it.",
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
        .querySelector<HTMLElement>('[aria-hidden="true"] > div')!;
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
          name: "lingo-backup-2026-11-10.json",
          text: '{"format":"lingo-export"}',
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
      const file = new File(['{"format":"lingo-export"}'], "backup.json", {
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
        json: '{"format":"lingo-export"}',
      });
    });

    it("shows why an import failed", async () => {
      const f = await open({ importResult: new Error("Not a Lingo export") });
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
            "Could not import: Not a Lingo export",
          ),
        )
        .toBeVisible();
    });

    it("lists your own cloud storage as coming later", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Your own cloud storage"))
        .toBeVisible();
      await expect.element(sync.getByText("Coming later")).toBeVisible();
    });
  });

  it("shows the version and the data notices", async () => {
    const f = await open();
    await expect
      .element(
        section(f.screen, "About").getByText(
          "Lingo 0.1.0 · English–Japanese dictionary: EJDict-hand (public domain) · Word forms, frequency data, phrase meanings and the Spanish–English dictionary: Wiktionary (CC BY-SA)",
        ),
      )
      .toBeVisible();
  });
});
