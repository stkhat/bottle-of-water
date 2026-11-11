import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page as browserPage, userEvent } from "vitest/browser";
import type { Span } from "../../core/classify";
import { DEFAULT_SETTINGS, mergeSettings } from "../../core/settings";
import type { Cue } from "../../core/subtitles/types";
import type { TermCard } from "../lookup/describe";
import { createStore } from "../store";
import { mountVideoUi } from "./mount";
import type { VideoApp, VideoState } from "./session";
import { createYouTubeAdapter } from "./youtube/adapter";
import {
  createTestPage,
  VIDEO_ID,
  type TestPage,
} from "../../testing/youtube-page";
import type { PlatformAdapter } from "./platform";

const CUES: Cue[] = [
  { startMs: 0, endMs: 1000, text: "The yeast smells tangy." },
  { startMs: 1000, endMs: 2000, text: "Knead the dough." },
];
const span = (
  text: string,
  word: string,
  category: Span["category"],
): Span => ({
  start: text.indexOf(word),
  end: text.indexOf(word) + word.length,
  key: word,
  kind: "word",
  category,
});
const SPANS: Span[][] = [
  [
    span(CUES[0]!.text, "yeast", "new"),
    span(CUES[0]!.text, "tangy", "learning"),
  ],
  [span(CUES[1]!.text, "Knead", "new")],
];

function readyState(patch: Partial<VideoState> = {}): VideoState {
  return {
    settings: mergeSettings({ highlight: { new: true } }, DEFAULT_SETTINGS),
    videoId: VIDEO_ID,
    status: "ready",
    enabled: true,
    cues: CUES,
    lines: CUES.map((cue, card) => ({
      startMs: cue.startMs,
      endMs: cue.endMs,
      card,
      start: 0,
      end: cue.text.length,
    })),
    spans: SPANS,
    translationSource: "siteTrack",
    translations: ["イーストはぴりっとした匂い。", "生地をこねる。"],
    line: 0,
    current: 0,
    card: 0,
    subtitleTranslation: "イーストはぴりっとした匂い。",
    hover: null,
    panel: null,
    menuOpen: false,
    fullscreen: false,
    panelTab: "transcript",
    wordsFilter: "all",
    summaries: {},
    dataNote: null,
    ...patch,
  };
}

/** An app whose methods are spies, over a store the test changes. */
function fakeApp(state: VideoState) {
  const store = createStore(state);
  const calls = new Map<string, ReturnType<typeof vi.fn>>([
    // As the session does.
    ["setFullscreen", vi.fn((on: boolean) => store.set({ fullscreen: on }))],
  ]);
  const app = new Proxy({ store } as unknown as VideoApp, {
    get(_target, name: string) {
      if (name === "store") return store;
      let fn = calls.get(name);
      if (!fn) calls.set(name, (fn = vi.fn()));
      return fn;
    },
  });
  const spy = (name: keyof VideoApp) => app[name] as ReturnType<typeof vi.fn>;
  return { app, store, spy };
}

let page: TestPage;
let adapter: PlatformAdapter;
let unmount: (() => void) | undefined;
let style: HTMLStyleElement;

/** The player's layout, as on YouTube (e2e/fixtures/youtube-watch.html). */
const PLAYER_CSS = `
#movie_player { position: relative; overflow: hidden; background: #000; }
.ytp-chrome-bottom { position: absolute; left: 12px; right: 12px; bottom: 0; height: 48px; }
.ytp-chrome-controls { display: flex; justify-content: space-between; height: 100%; }
.ytp-right-controls, .ytp-right-controls-left, .ytp-right-controls-right { display: flex; align-items: center; }
.ytp-settings-button { width: 48px; height: 40px; }
`;

beforeEach(() => {
  style = document.createElement("style");
  style.textContent = PLAYER_CSS;
  document.head.append(style);
  page = createTestPage();
  page.player.style.width = "640px";
  page.player.style.height = "360px";
  adapter = createYouTubeAdapter({
    href: () => `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  });
});
afterEach(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  unmount?.();
  unmount = undefined;
  adapter.dispose();
  page.remove();
  style.remove();
});

function mount(state: VideoState = readyState()) {
  const fake = fakeApp(state);
  unmount = mountVideoUi({ adapter, app: fake.app });
  return fake;
}

const host = (name: string) => document.querySelector(name) as HTMLElement;
const inside = (name: string) => host(name)?.shadowRoot ?? null;
/** The part's visible text: the theme's `<style>` is not text. */
function text(name: string): string {
  const root = inside(name);
  if (!root) return "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let out = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    if (node.parentElement?.tagName !== "STYLE") out += node.textContent;
  return out;
}

const TANGY: TermCard = {
  key: "tangy",
  kind: "word",
  head: "tangy",
  status: "learning",
  termId: "en:tangy",
  senses: [],
  elsewhere: [],
};

/** Enters fullscreen on `element` from the user's click, as the site's button does. */
async function enterFullscreen(element: Element) {
  const button = document.createElement("button");
  button.textContent = "Full screen";
  button.style.cssText =
    "position: fixed; top: 0; left: 0; z-index: 2147483647;";
  button.onclick = () => void element.requestFullscreen();
  document.body.append(button);
  await userEvent.click(button);
  button.remove();
  await expect.poll(() => document.fullscreenElement).toBe(element);
}

describe("mountVideoUi", () => {
  it("puts each part where it belongs on the watch page", async () => {
    mount();
    await expect
      .poll(() => host("lingo-video-player")?.parentElement)
      .toBe(page.player);
    const settings = page.player.querySelector(".ytp-settings-button")!;
    expect(host("lingo-player-buttons").nextElementSibling).toBe(settings);
    const below = document.getElementById("below")!;
    expect(below.firstElementChild).toBe(host("lingo-video-below"));
    expect(host("lingo-transcript").parentElement?.id).toBe("secondary-inner");
    expect(host("lingo-transcript").nextElementSibling?.id).toBe("related");
    expect(host("lingo-video").parentElement).toBe(document.body);
  });

  it("shows the playing line in the video, with its translation, and the transcript", async () => {
    mount();
    await expect
      .poll(() => text("lingo-video-player"))
      .toContain("The yeast smells tangy.");
    expect(text("lingo-video-player")).toContain(
      "イーストはぴりっとした匂い。",
    );
    expect(text("lingo-video-below")).toBe("");
    expect(text("lingo-transcript")).toContain("Knead the dough.");
    expect(text("lingo-player-buttons")).toContain("L");
  });

  it("shows the language data line at the top of the transcript column while the data is missing", async () => {
    const { store, spy } = mount(
      readyState({ dataNote: { state: "downloading", percent: 45 } }),
    );
    await expect
      .poll(() => text("lingo-transcript"))
      .toContain("Downloading English data · 45%");
    const status = () =>
      inside("lingo-transcript")!.querySelector("[role=status]")!;
    const tabs = inside("lingo-transcript")!.querySelector("[role=tablist]")!;
    expect(
      status().getBoundingClientRect().top -
        tabs.getBoundingClientRect().bottom,
    ).toBeCloseTo(12, 1); // Firefox lays out to a fraction of a pixel (12.00003)

    store.set({ dataNote: { state: "failed" } });
    await expect
      .poll(() => text("lingo-transcript"))
      .toContain("Couldn't download English data");
    await userEvent.click(status().querySelector("button")!);
    expect(spy("retryPacks")).toHaveBeenCalledOnce();

    store.set({ dataNote: null });
    await expect
      .poll(() => inside("lingo-transcript")!.querySelector("[role=status]"))
      .toBeNull();
    expect(text("lingo-transcript")).toContain("Knead the dough.");
  });

  it("places the subtitle over the bottom of the video", async () => {
    mount();
    await expect
      .poll(() => inside("lingo-video-player")?.querySelector("[role=region]"))
      .not.toBeNull();
    const region =
      inside("lingo-video-player")!.querySelector("[role=region]")!;
    const box = region.getBoundingClientRect();
    const player = page.player.getBoundingClientRect();
    expect(box.bottom).toBeCloseTo(player.bottom - 64, 0);
    expect(box.left).toBeGreaterThanOrEqual(player.left);
    expect(box.right).toBeLessThanOrEqual(player.right);
  });

  it("moves the subtitle below the video and hides the translation per settings", async () => {
    const { store } = mount();
    store.set({
      settings: mergeSettings(
        { subtitlePosition: "belowVideo", subtitleTranslation: false },
        store.get().settings,
      ),
    });
    await expect
      .poll(() => text("lingo-video-below"))
      .toContain("The yeast smells tangy.");
    expect(text("lingo-video-below")).not.toContain("イースト");
    expect(text("lingo-video-player")).not.toContain("The yeast");
    // The transcript keeps its own switch.
    expect(text("lingo-transcript")).toContain("イースト");
  });

  it("off: only the player buttons stay", async () => {
    const { store } = mount();
    store.set({ enabled: false, current: -1, card: -1 });
    await expect.poll(() => text("lingo-transcript")).toBe("");
    expect(text("lingo-video-player")).toBe("");
    const l = inside("lingo-player-buttons")!.querySelector<HTMLButtonElement>(
      "button",
    )!;
    expect(l.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows nothing for a video without subtitles", async () => {
    const { store } = mount();
    store.set({
      status: "unavailable",
      cues: [],
      spans: [],
      current: -1,
      card: -1,
    });
    await expect.poll(() => text("lingo-player-buttons")).toBe("");
    expect(text("lingo-transcript")).toBe("");
  });

  it("the L button turns Lingo off and ^ opens the menu above it", async () => {
    const { store, spy } = mount();
    await expect
      .poll(() => inside("lingo-player-buttons")?.querySelector("button"))
      .not.toBeNull();
    const [l, menu] = inside("lingo-player-buttons")!.querySelectorAll(
      "button",
    );
    await userEvent.click(l!);
    expect(spy("setEnabled")).toHaveBeenCalledWith(false);
    await userEvent.click(menu!);
    expect(spy("setMenuOpen")).toHaveBeenCalledWith(true);
    store.set({ menuOpen: true });
    await expect
      .poll(() => inside("lingo-video-player")?.querySelector("[role=dialog]"))
      .not.toBeNull();
    const dialog = inside("lingo-video-player")!
      .querySelector("[role=dialog]")!
      .getBoundingClientRect();
    const buttons = host("lingo-player-buttons").getBoundingClientRect();
    expect(dialog.bottom).toBeLessThanOrEqual(buttons.top);
  });

  it("clicks on Lingo's parts do not reach the player", async () => {
    mount();
    const clicks = vi.fn();
    page.player.addEventListener("click", clicks);
    await expect
      .poll(() => inside("lingo-video-player")?.querySelector("[data-span]"))
      .not.toBeNull();
    await userEvent.click(
      inside("lingo-video-player")!.querySelector<HTMLElement>("[data-span]")!,
    );
    await userEvent.click(
      inside("lingo-player-buttons")!.querySelector("button")!,
    );
    expect(clicks).not.toHaveBeenCalled();
  });

  it("tells the app about hovered and clicked words in the subtitle", async () => {
    const { spy } = mount();
    await expect
      .poll(() => inside("lingo-video-player")?.querySelector("[data-span]"))
      .not.toBeNull();
    const tangy = [
      ...inside("lingo-video-player")!.querySelectorAll<HTMLElement>(
        "[data-span]",
      ),
    ].find((el) => el.textContent === "tangy")!;
    await userEvent.hover(tangy);
    const box = tangy.getBoundingClientRect();
    expect(spy("enterWord")).toHaveBeenCalledWith(
      { cue: 0, span: 1 },
      { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      "subtitle",
    );
    expect(page.video.paused).toBe(true);
    await userEvent.click(tangy);
    expect(spy("clickWord")).toHaveBeenCalledWith({ cue: 0, span: 1 });
  });

  it("tells the app about hovered and clicked words in the transcript", async () => {
    const { spy } = mount();
    await expect
      .poll(() => inside("lingo-transcript")?.querySelector("[data-span]"))
      .not.toBeNull();
    const tangy = [
      ...inside("lingo-transcript")!.querySelectorAll<HTMLElement>(
        "[data-span]",
      ),
    ].find((el) => el.textContent === "tangy")!;
    await userEvent.hover(tangy);
    const box = tangy.getBoundingClientRect();
    expect(spy("enterWord")).toHaveBeenCalledWith(
      { cue: 0, span: 1 },
      { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      "transcript",
    );
    await userEvent.click(tangy);
    expect(spy("clickWord")).toHaveBeenCalledWith({ cue: 0, span: 1 });
    expect(spy("seekToCue")).not.toHaveBeenCalled();
  });

  it("a press outside the dictionary window closes it; a press in it or on a word does not", async () => {
    // Mock Main's video size: the window leaves the subtitle free.
    page.player.style.width = "880px";
    page.player.style.height = "495px";
    const { store, spy } = mount();
    store.set({
      panel: {
        ref: { cue: 0, span: 1 },
        card: TANGY,
        here: [],
        dictionaries: [],
        opened: 1,
      },
    });
    await expect
      .poll(() => inside("lingo-video")?.querySelector("aside"))
      .not.toBeNull();
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    await userEvent.click(
      inside("lingo-video")!.querySelector<HTMLElement>("aside h2")!,
    );
    const word = (name: string) =>
      [...inside(name)!.querySelectorAll<HTMLElement>("[data-span]")].find(
        (el) => el.textContent === "tangy",
      )!;
    await userEvent.click(word("lingo-video-player"));
    await userEvent.click(word("lingo-transcript"));
    await settle();
    expect(spy("closePanel")).not.toHaveBeenCalled();

    // A press a page script makes is not the user's.
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await settle();
    expect(spy("closePanel")).not.toHaveBeenCalled();

    await userEvent.click(page.player, { position: { x: 40, y: 40 } });
    await expect.poll(() => spy("closePanel").mock.calls.length).toBe(1);
  });

  it("shows only the playing line's part of a sentence card, with the card's word refs", async () => {
    // "The yeast smells" and "tangy." are two lines of one card.
    const { spy } = mount(
      readyState({
        lines: [
          { startMs: 0, endMs: 500, card: 0, start: 0, end: 16 },
          { startMs: 500, endMs: 1000, card: 0, start: 17, end: 23 },
          { startMs: 1000, endMs: 2000, card: 1, start: 0, end: 16 },
        ],
        line: 1,
        panel: null,
      }),
    );
    const subtitle = () =>
      inside("lingo-video-player")?.querySelector("[role=region] p");
    await expect.poll(() => subtitle()?.textContent).toBe("tangy.");
    const tangy = subtitle()!.querySelector<HTMLElement>("[data-span]")!;
    expect(tangy.textContent).toBe("tangy");
    await userEvent.click(tangy);
    expect(spy("clickWord")).toHaveBeenCalledWith({ cue: 0, span: 1 });
    // The whole sentence in the transcript.
    expect(text("lingo-transcript")).toContain("The yeast smells tangy.");
  });

  it("keeps the player buttons in the bar when the site rebuilds its controls", async () => {
    mount();
    await expect
      .poll(() => host("lingo-player-buttons")?.isConnected)
      .toBe(true);
    const controls = page.player.querySelector(".ytp-right-controls")!;
    controls.replaceChildren(
      ...[...controls.children].map((c) => c.cloneNode(true)),
    );
    await expect
      .poll(() =>
        host("lingo-player-buttons")?.nextElementSibling?.classList.contains(
          "ytp-settings-button",
        ),
      )
      .toBe(true);
    // The transcript comes back too.
    host("lingo-transcript").remove();
    await expect
      .poll(() => host("lingo-transcript")?.parentElement?.id)
      .toBe("secondary-inner");
  });

  it("makes the transcript as tall as the player", async () => {
    mount();
    await expect
      .poll(
        () =>
          inside("lingo-transcript")
            ?.querySelector("aside")
            ?.getBoundingClientRect().height,
      )
      .toBe(360);
    page.player.style.height = "420px";
    await expect
      .poll(
        () =>
          inside("lingo-transcript")
            ?.querySelector("aside")
            ?.getBoundingClientRect().height,
      )
      .toBe(420);
  });

  it("makes the transcript as tall as the site's transcript frame, and clickable in it", async () => {
    // As on Netflix: a panel over the page that lets clicks through to the video.
    const frame = document.createElement("div");
    frame.style.cssText =
      "position: fixed; top: 20px; right: 16px; width: 300px; height: 340px; pointer-events: none;";
    document.body.append(frame);
    const fake = fakeApp(readyState());
    unmount = mountVideoUi({
      adapter: {
        ...adapter,
        sideColumn: () => ({ parent: frame, before: null }),
        transcriptFrame: () => frame,
      },
      app: fake.app,
    });
    const aside = () => inside("lingo-transcript")?.querySelector("aside");
    await expect.poll(() => aside()?.getBoundingClientRect().height).toBe(340);
    frame.style.height = "400px";
    await expect.poll(() => aside()?.getBoundingClientRect().height).toBe(400);
    const box = aside()!.getBoundingClientRect();
    expect(document.elementFromPoint(box.left + 20, box.top + 100)).toBe(
      host("lingo-transcript"),
    );
    frame.remove();
  });

  it("opens the dictionary window beside the video, not over the subtitle", async () => {
    // Mock Main's video size.
    page.player.style.width = "880px";
    page.player.style.height = "495px";
    const { store } = mount();
    store.set({
      panel: {
        ref: { cue: 0, span: 1 },
        card: {
          key: "tangy",
          kind: "word",
          head: "tangy",
          status: "learning",
          termId: "en:tangy",
          senses: [],
          elsewhere: [],
        },
        here: [
          {
            cue: 0,
            timeMs: 0,
            text: "The yeast smells tangy.",
            marks: [{ start: 17, end: 22, category: "new" }],
          },
        ],
        dictionaries: [],
        opened: 1,
      },
    });
    await expect
      .poll(() => inside("lingo-video")?.querySelector("aside"))
      .not.toBeNull();
    const win = inside("lingo-video")!
      .querySelector("aside")!
      .getBoundingClientRect();
    const subtitle = inside("lingo-video-player")!
      .querySelector("[role=region]")!
      .getBoundingClientRect();
    expect(win.bottom).toBeLessThanOrEqual(subtitle.top);
    expect(inside("lingo-video")!.textContent).toContain("In this video · 1");
  });

  it("ends the dictionary window 12px into the transcript beside the video", async () => {
    // YouTube's two columns (e2e/fixtures/youtube-watch.html) at 1400px wide.
    await browserPage.viewport(1400, 900);
    const columns = document.createElement("style");
    columns.textContent = `
      #columns { display: flex; gap: 16px; padding: 12px 16px; }
      #primary { flex: 1; min-width: 0; }
      #secondary { width: 385px; flex: none; }
    `;
    document.head.append(columns);
    page.player.style.width = "";
    page.player.style.height = "540px";
    const { store } = mount();
    await expect
      .poll(() => inside("lingo-transcript")?.querySelector("aside"))
      .not.toBeNull();
    store.set({
      panel: {
        ref: { cue: 0, span: 1 },
        card: {
          key: "tangy",
          kind: "word",
          head: "tangy",
          status: "learning",
          termId: "en:tangy",
          senses: [],
          elsewhere: [],
        },
        here: [
          {
            cue: 0,
            timeMs: 0,
            text: "The yeast smells tangy.",
            marks: [{ start: 17, end: 22, category: "new" }],
          },
        ],
        dictionaries: [],
        opened: 1,
      },
    });
    await expect
      .poll(() => inside("lingo-video")?.querySelector("aside"))
      .not.toBeNull();
    const win = inside("lingo-video")!
      .querySelector("aside")!
      .getBoundingClientRect();
    const transcript = host("lingo-transcript").getBoundingClientRect();
    const player = page.player.getBoundingClientRect();
    expect(transcript.left).toBeGreaterThan(player.right);
    expect(win.right).toBeCloseTo(transcript.left + 12, 0);
    expect(win.left).toBeLessThan(player.right);
    columns.remove();
    await browserPage.viewport(414, 896);
  });

  describe("in fullscreen", () => {
    const panelOn = (opened = 1): Partial<VideoState> => ({
      panel: {
        ref: { cue: 0, span: 1 },
        card: TANGY,
        here: [
          {
            cue: 0,
            timeMs: 0,
            text: "The yeast smells tangy.",
            marks: [{ start: 17, end: 22, category: "new" }],
          },
        ],
        dictionaries: [],
        opened,
      },
    });
    const dictionary = () =>
      inside("lingo-video")?.querySelector<HTMLElement>(
        "aside[aria-label='Dictionary window']",
      ) ?? null;
    /** The subtitle's first line (the learning language). */
    const line = () =>
      inside("lingo-video-player")?.querySelector<HTMLElement>(
        "[role=region] [lang=en]",
      ) ?? null;

    it("tells the app, and moves the page's parts into the fullscreen element and back", async () => {
      const { spy } = mount();
      await expect
        .poll(() => host("lingo-video")?.parentElement)
        .toBe(document.body);
      await enterFullscreen(page.player);
      await expect
        .poll(() => spy("setFullscreen").mock.calls.at(-1))
        .toEqual([true]);
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(page.player);
      // The other parts stay where they are.
      expect(host("lingo-video-player").parentElement).toBe(page.player);
      await document.exitFullscreen();
      await expect
        .poll(() => spy("setFullscreen").mock.calls.at(-1))
        .toEqual([false]);
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(document.body);
    });

    it("goes into a page-level fullscreen element, or the parent of a fullscreen video", async () => {
      mount();
      await enterFullscreen(page.root);
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(page.root);
      await document.exitFullscreen();
      await enterFullscreen(page.video);
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(page.video.parentElement);
      await document.exitFullscreen();
      // The whole page: <body> is inside it already.
      await enterFullscreen(document.documentElement);
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(document.body);
    });

    it("shows the subtitle in the video with the fullscreen look, even when it goes below the video, and puts it back after", async () => {
      const { store } = mount();
      store.set({
        settings: mergeSettings(
          { subtitlePosition: "belowVideo" },
          store.get().settings,
        ),
      });
      await expect
        .poll(() => text("lingo-video-below"))
        .toContain("The yeast smells tangy.");
      await enterFullscreen(page.player);
      await expect
        .poll(() => line()?.textContent)
        .toBe("The yeast smells tangy.");
      expect(text("lingo-video-below")).toBe("");
      expect(text("lingo-transcript")).toBe("");
      expect(getComputedStyle(line()!).fontSize).toBe("34px");
      // 120px above the bottom, in from each side by 14% of the width (24–200px).
      const region = inside("lingo-video-player")!
        .querySelector("[role=region]")!
        .getBoundingClientRect();
      const player = page.player.getBoundingClientRect();
      expect(player.width).toBe(innerWidth);
      expect(region.bottom).toBeCloseTo(player.bottom - 120, 0);
      const inset = Math.min(200, Math.max(24, player.width * 0.14));
      expect(region.left).toBeCloseTo(player.left + inset, 0);
      expect(region.right).toBeCloseTo(player.right - inset, 0);

      await document.exitFullscreen();
      await expect
        .poll(() => text("lingo-video-below"))
        .toContain("The yeast smells tangy.");
      expect(line()).toBeNull();
      expect(text("lingo-transcript")).toContain("Knead the dough.");
    });

    it("shows the hover card and the dictionary window over the video, top right", async () => {
      const { store } = mount();
      await enterFullscreen(page.player);
      // Moved into the fullscreen element on the next frame after fullscreenchange:
      // until then it is under the top layer.
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(page.player);
      await expect.poll(() => store.get().fullscreen).toBe(true);
      await expect.poll(() => line()).not.toBeNull();
      const tangy = [
        ...inside("lingo-video-player")!.querySelectorAll<HTMLElement>(
          "[data-span]",
        ),
      ].find((el) => el.textContent === "tangy")!;
      const r = tangy.getBoundingClientRect();
      store.set({
        hover: {
          ref: { cue: 0, span: 1 },
          from: "subtitle",
          anchor: {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
          },
          card: TANGY,
        },
      });
      await expect.poll(() => text("lingo-video")).toContain("Learning");
      /**
       * Whether `element` is what shows at its own middle. Asked of the shadow root: its
       * `elementFromPoint` returns the element inside it, or the page's element (the
       * player) when that covers it, in every engine, whatever the host's `display`.
       */
      const shown = (element: Element) => {
        const box = element.getBoundingClientRect();
        const top = inside("lingo-video")!.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return top !== null && element.contains(top);
      };
      const hoverCard = [
        ...inside("lingo-video")!.querySelectorAll("button"),
      ].find((b) => b.textContent?.includes("Learning"))!;
      expect(shown(hoverCard)).toBe(true);
      // Above the word.
      expect(hoverCard.getBoundingClientRect().bottom).toBeLessThan(r.top);

      store.set({ hover: null, ...panelOn() });
      await expect.poll(dictionary).not.toBeNull();
      const win = dictionary()!.getBoundingClientRect();
      expect(win.top).toBe(32);
      expect(win.right).toBe(Math.max(innerWidth - 32, 368));
      expect(win.height).toBe(Math.min(420, innerHeight - 40));
      expect(shown(dictionary()!)).toBe(true);
      // A darker shadow over the video (mock Fullscreen).
      expect(getComputedStyle(dictionary()!).boxShadow).toBe(
        "rgba(0, 0, 0, 0.45) 0px 18px 48px 0px",
      );
    });

    it("moves an open dictionary window to the top right, and back beside the video after", async () => {
      page.player.style.width = "880px";
      page.player.style.height = "495px";
      const { store } = mount(readyState(panelOn()));
      await expect.poll(dictionary).not.toBeNull();
      const before = dictionary()!.getBoundingClientRect();
      await enterFullscreen(page.player);
      await expect
        .poll(() => dictionary()?.getBoundingClientRect().top)
        .toBe(32);
      await document.exitFullscreen();
      await expect
        .poll(() => dictionary()?.getBoundingClientRect().top)
        .toBe(before.top);
      expect(store.get().panel?.opened).toBe(1);
      expect(getComputedStyle(dictionary()!).boxShadow).toBe(
        "rgba(20, 24, 43, 0.22) 0px 18px 48px 0px",
      );
    });

    it("clicks and keys on Lingo's parts do not reach the player", async () => {
      const { store } = mount(readyState(panelOn()));
      await enterFullscreen(page.player);
      await expect
        .poll(() => host("lingo-video").parentElement)
        .toBe(page.player);
      const clicks = vi.fn();
      const keys = vi.fn();
      page.player.addEventListener("click", clicks);
      page.player.addEventListener("keydown", keys);
      await expect.poll(dictionary).not.toBeNull();
      await expect.poll(() => line()).not.toBeNull();
      await userEvent.click(line()!.querySelector<HTMLElement>("[data-span]")!);
      await userEvent.click(dictionary()!.querySelector("button")!);
      await userEvent.keyboard("k");
      expect(clicks).not.toHaveBeenCalled();
      expect(keys).not.toHaveBeenCalled();
      expect(store.get().fullscreen).toBe(true);
    });

    it("the menu has no subtitle position, and has it again after", async () => {
      const { store } = mount(readyState({ menuOpen: true }));
      const menu = () =>
        inside("lingo-video-player")?.querySelector("[role=dialog]") ?? null;
      await expect.poll(menu).not.toBeNull();
      expect(menu()!.querySelector("[role=group]")).not.toBeNull();
      await enterFullscreen(page.player);
      await expect
        .poll(() => menu()?.querySelector("[role=group]") ?? null)
        .toBeNull();
      // Still above the L and ^ buttons.
      const dialog = menu()!.getBoundingClientRect();
      const buttons = host("lingo-player-buttons").getBoundingClientRect();
      expect(dialog.bottom).toBeLessThanOrEqual(buttons.top);
      await document.exitFullscreen();
      await expect
        .poll(() => menu()?.querySelector("[role=group]") ?? null)
        .not.toBeNull();
      expect(store.get().menuOpen).toBe(true);
    });
  });

  describe("events a page script dispatches", () => {
    /** Clicks `element` as a page script can: `.click()` and a dispatched event. */
    function syntheticClick(element: HTMLElement) {
      element.click();
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true }),
      );
    }
    /** The button in `part` whose accessible name or text is `name`. */
    async function button(part: string, name: string) {
      const find = () =>
        [
          ...(inside(part)?.querySelectorAll<HTMLButtonElement>("button") ??
            []),
        ].find(
          (b) =>
            b.getAttribute("aria-label") === name ||
            b.textContent?.trim().startsWith(name),
        ) ?? null;
      await expect.poll(find).not.toBeNull();
      return find()!;
    }

    it("do not reach the L button; the user's click does", async () => {
      const { spy } = mount();
      const l = await button("lingo-player-buttons", "Lingo on or off");
      syntheticClick(l);
      expect(spy("setEnabled")).not.toHaveBeenCalled();
      await userEvent.click(l);
      expect(spy("setEnabled")).toHaveBeenCalledWith(false);
    });

    it("do not reach the menu's switch or gear; the user's clicks do", async () => {
      const { spy } = mount(readyState({ menuOpen: true }));
      const toggle = await button(
        "lingo-video-player",
        "Show translation under the subtitle",
      );
      const settings = await button("lingo-video-player", "Open settings");
      syntheticClick(toggle);
      syntheticClick(settings);
      expect(spy("changeSettings")).not.toHaveBeenCalled();
      expect(spy("openSettings")).not.toHaveBeenCalled();
      expect(spy("setMenuOpen")).not.toHaveBeenCalled();
      await userEvent.click(toggle);
      expect(spy("changeSettings")).toHaveBeenCalledWith({
        subtitleTranslation: false,
      });
      await userEvent.click(settings);
      expect(spy("openSettings")).toHaveBeenCalledOnce();
    });

    it("an Escape does not close the dictionary window; the user's does", async () => {
      const { spy } = mount(
        readyState({
          panel: {
            ref: { cue: 0, span: 1 },
            card: TANGY,
            here: [
              {
                cue: 0,
                timeMs: 0,
                text: "The yeast smells tangy.",
                marks: [{ start: 17, end: 22, category: "new" }],
              },
            ],
            dictionaries: [],
            opened: 1,
          },
        }),
      );
      const close = await button("lingo-video", "Close dictionary");
      close.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          composed: true,
        }),
      );
      expect(spy("closePanel")).not.toHaveBeenCalled();
      close.focus();
      await userEvent.keyboard("{Escape}");
      expect(spy("closePanel")).toHaveBeenCalled();
    });
  });

  it("removes everything when unmounted", async () => {
    mount();
    await expect.poll(() => host("lingo-video-player")?.isConnected).toBe(true);
    unmount!();
    unmount = undefined;
    for (const name of [
      "lingo-video-player",
      "lingo-video-below",
      "lingo-transcript",
      "lingo-player-buttons",
      "lingo-video",
    ])
      expect(document.querySelector(name)).toBeNull();
  });
});
