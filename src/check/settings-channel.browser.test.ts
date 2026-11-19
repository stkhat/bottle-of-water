import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../core/settings";
import { packsFor } from "../core/packs/pairs";
import {
  answerSettingsRequests,
  SETTINGS_MESSAGE_TYPE,
  type SettingsPageReply,
} from "./settings-channel";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  document.querySelectorAll("iframe").forEach((frame) => frame.remove());
});

/** The background's settings and the packs' state, in memory. */
function background(packState: Record<string, unknown> = {}) {
  let stored = mergeSettings({});
  const writes: SettingsPatch[] = [];
  const pairChosen = vi.fn();
  return {
    writes,
    pairChosen,
    stored: () => stored,
    deps: {
      getSettings: async () => stored,
      setSettings: async (patch: SettingsPatch): Promise<Settings> => {
        writes.push(patch);
        stored = mergeSettings(patch, stored);
        return stored;
      },
      packStates: async () => packState as never,
      pairChosen,
    },
  };
}

/** What a web page does (docs/development.md "Checking in your own Chrome"). */
function askFromPage(
  action: string,
  settings?: unknown,
  win: Window = window,
): Promise<SettingsPageReply> {
  return new Promise((resolve) => {
    const id = String(Math.random());
    const onMessage = (e: MessageEvent) => {
      const data = e.data as SettingsPageReply;
      if (data?.type !== SETTINGS_MESSAGE_TYPE || !data.reply || data.id !== id)
        return;
      win.removeEventListener("message", onMessage);
      resolve(data);
    };
    win.addEventListener("message", onMessage);
    win.postMessage({ type: SETTINGS_MESSAGE_TYPE, action, id, settings }, "*");
  });
}

describe("answerSettingsRequests", () => {
  it("gets the settings", async () => {
    const bg = background();
    stops.push(answerSettingsRequests({ window, ...bg.deps }));
    expect(await askFromPage("get")).toMatchObject({
      ok: true,
      settings: {
        learningLang: "en",
        nativeLang: "ja",
        highlight: { new: false, learning: true, known: false },
      },
    });
  });

  it("sets a pair the way Settings does: one setSettings with the patch", async () => {
    const bg = background();
    stops.push(answerSettingsRequests({ window, ...bg.deps }));
    const reply = await askFromPage("set", {
      learningLang: "en",
      nativeLang: "fr",
      highlight: { new: true },
    });
    expect(reply).toMatchObject({
      ok: true,
      settings: {
        learningLang: "en",
        nativeLang: "fr",
        highlight: { new: true },
      },
    });
    expect(bg.writes).toEqual([
      { learningLang: "en", nativeLang: "fr", highlight: { new: true } },
    ]);
    expect(bg.pairChosen).toHaveBeenCalledWith("en", "fr");

    // Another setting leaves the pair, and the translator's models, alone.
    await askFromPage("set", { theme: "dark" });
    expect(bg.stored().theme).toBe("dark");
    expect(bg.pairChosen).toHaveBeenCalledTimes(1);
  });

  it("refuses a pair Langle does not offer and writes nothing", async () => {
    const bg = background();
    stops.push(answerSettingsRequests({ window, ...bg.deps }));
    const reply = await askFromPage("set", { nativeLang: "xx" });
    expect(reply).toMatchObject({ ok: false });
    expect(reply.ok === false && reply.error).toContain(
      "en → xx is not an offered pair",
    );
    expect(bg.writes).toEqual([]);
  });

  it("reports the chosen pair's packs, ready once each is", async () => {
    const packs = packsFor("en", "ja");
    const downloading = { state: "downloading", received: 1, total: 4 };
    const bg = background(
      Object.fromEntries(packs.map((pack) => [pack, downloading])),
    );
    stops.push(answerSettingsRequests({ window, ...bg.deps }));
    expect(await askFromPage("packs")).toMatchObject({
      ok: true,
      packs,
      ready: false,
      failed: false,
      packState: { [packs[0]!]: downloading },
    });
  });

  it("removes a pack through the background, then reports the pair's packs", async () => {
    const bg = background();
    const removed: string[] = [];
    stops.push(
      answerSettingsRequests({
        window,
        ...bg.deps,
        removePack: async (pack) => {
          removed.push(pack);
        },
      }),
    );
    const reply = await new Promise<SettingsPageReply>((resolve) => {
      const id = "remove-1";
      const onMessage = (e: MessageEvent) => {
        const data = e.data as SettingsPageReply;
        if (
          data?.type !== SETTINGS_MESSAGE_TYPE ||
          !data.reply ||
          data.id !== id
        )
          return;
        window.removeEventListener("message", onMessage);
        resolve(data);
      };
      window.addEventListener("message", onMessage);
      window.postMessage(
        { type: SETTINGS_MESSAGE_TYPE, action: "remove", id, pack: "en-fr" },
        "*",
      );
    });
    expect(removed).toEqual(["en-fr"]);
    expect(reply).toMatchObject({ ok: true, packs: packsFor("en", "ja") });

    // Without a pack name nothing is removed.
    expect(await askFromPage("remove")).toMatchObject({
      ok: false,
      error: "remove needs a pack name",
    });
    expect(removed).toEqual(["en-fr"]);
  });

  it("answers with the error when the background cannot be reached", async () => {
    stops.push(
      answerSettingsRequests({
        window,
        ...background().deps,
        getSettings: () =>
          Promise.reject(new Error("Extension context invalidated.")),
      }),
    );
    expect(await askFromPage("get")).toMatchObject({
      ok: false,
      error: "Extension context invalidated.",
    });
  });

  it("ignores its own replies and other messages", async () => {
    const bg = background();
    const getSettings = vi.fn(bg.deps.getSettings);
    stops.push(answerSettingsRequests({ window, ...bg.deps, getSettings }));
    window.postMessage({ type: "something else", action: "get", id: "1" }, "*");
    window.postMessage(
      { type: SETTINGS_MESSAGE_TYPE, action: "delete", id: "2" },
      "*",
    );
    await askFromPage("get");
    expect(getSettings).toHaveBeenCalledTimes(1);
  });

  it("ignores requests a frame posts to it", async () => {
    const bg = background();
    const getSettings = vi.fn(bg.deps.getSettings);
    stops.push(answerSettingsRequests({ window, ...bg.deps, getSettings }));
    const frame = document.createElement("iframe");
    document.body.append(frame);
    // Posted from the frame's own script, so the message's source is the frame.
    (frame.contentWindow as Window & { eval(code: string): void }).eval(
      `parent.postMessage({ type: "${SETTINGS_MESSAGE_TYPE}", action: "set", id: "1", settings: { theme: "dark" } }, "*")`,
    );
    await askFromPage("get");
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(bg.writes).toEqual([]);
  });
});
