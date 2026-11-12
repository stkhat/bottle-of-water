import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page as browserPage, userEvent } from "vitest/browser";
import { DEFAULT_SETTINGS } from "../../../core/settings";
import { createStore } from "../../store";
import { mountVideoUi } from "../mount";
import { createNetflixAdapter } from "./adapter";
import { installNetflixHooks } from "./page";
import {
  createTestPage,
  MOVIE_ID,
  type TestPage,
} from "../../../testing/netflix-page";
import type { VideoApp, VideoState } from "../state";
import type { PlatformAdapter } from "../platform";

const STATE: VideoState = {
  settings: DEFAULT_SETTINGS,
  videoId: MOVIE_ID,
  status: "ready",
  enabled: true,
  cues: [{ startMs: 0, endMs: 1000, text: "HELLO THERE." }],
  lines: [{ startMs: 0, endMs: 1000, card: 0, start: 0, end: 12 }],
  spans: [[]],
  translationSource: "none",
  translations: [""],
  line: 0,
  current: 0,
  card: 0,
  subtitleTranslation: "",
  hover: null,
  panel: null,
  phrase: null,
  selecting: false,
  menuOpen: false,
  fullscreen: false,
  panelTab: "transcript",
  wordsFilter: "all",
  summaries: {},
  dataNote: null,
};

/** An app over a store; the ^ button opens the menu as the real one does. */
function fakeApp(): VideoApp {
  const store = createStore(STATE);
  const methods: Partial<VideoApp> = {
    setMenuOpen: (open: boolean) => store.set({ menuOpen: open }),
    setFullscreen: (on: boolean) => store.set({ fullscreen: on }),
  };
  return new Proxy({ store } as unknown as VideoApp, {
    get: (_target, name: string) =>
      name === "store"
        ? store
        : (methods[name as keyof VideoApp] ?? (() => undefined)),
  });
}

let uninstall: () => void;
beforeAll(async () => {
  uninstall = installNetflixHooks();
  // A laptop's window: Netflix's player fills it, the transcript sidebar beside it.
  await browserPage.viewport(1280, 720);
});
afterAll(async () => {
  uninstall();
  await browserPage.viewport(414, 896);
});

let page: TestPage;
let adapter: PlatformAdapter;
let unmount: () => void;

function start(options: Parameters<typeof createTestPage>[0] = {}) {
  page = createTestPage(options);
  adapter = createNetflixAdapter({
    href: () => `https://www.netflix.com/watch/${MOVIE_ID}`,
    idleMs: 60_000,
  });
  unmount = mountVideoUi({ adapter, app: fakeApp() });
}
afterEach(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  unmount();
  adapter.dispose();
  page.remove();
});

const buttons = () =>
  document.querySelector<HTMLElement>("lingo-player-buttons");
const menuButton = () =>
  buttons()!.shadowRoot!.querySelector<HTMLButtonElement>(
    "button[aria-expanded]",
  )!;
/** The wrapper of the audio & subtitles button in the bar shown now. */
const audioWrapper = () =>
  page.controls()?.querySelector("[data-uia='control-audio-subtitle']")
    ?.parentElement ?? null;

describe("the L and ^ buttons on Netflix", () => {
  it("go into each new control bar, before the audio & subtitles button, keeping their state", async () => {
    start();
    await expect.poll(() => buttons()?.nextElementSibling).toBe(audioWrapper());
    const host = buttons()!;
    expect(host.getBoundingClientRect().width).toBeGreaterThan(0);
    // From the keyboard: a pointer left over the player would keep Netflix's bar up.
    menuButton().focus();
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => menuButton().getAttribute("aria-expanded"))
      .toBe("true");

    // Idle: Netflix removes the bar, and the buttons with it.
    page.showControls(false);
    await expect.poll(() => host.isConnected).toBe(false);
    // The pointer moves: a new bar, and the same buttons in it.
    page.showControls(true);
    await expect.poll(() => host.nextElementSibling).toBe(audioWrapper());
    expect(buttons()).toBe(host);
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("lingo-netflix-controls")).toBeNull();
  });

  it("open the menu above the transcript sidebar", async () => {
    start();
    await expect.poll(() => buttons()?.nextElementSibling).toBe(audioWrapper());
    menuButton().focus();
    await userEvent.keyboard("{Enter}");
    const menu = () =>
      [...document.querySelectorAll("*")]
        .map((element) => element.shadowRoot?.querySelector("[role=dialog]"))
        .find(Boolean) ?? null;
    await expect.poll(menu).not.toBeNull();
    const box = menu()!.getBoundingClientRect();
    const panel = document
      .querySelector("lingo-video-sidebar")!
      .getBoundingClientRect();
    // Over the narrowed player, clear of the sidebar.
    expect(box.right).toBeLessThanOrEqual(panel.left);
    const host = menu()!.getRootNode() as ShadowRoot;
    for (const [x, y] of [
      [box.left + 4, box.top + 4],
      [box.right - 4, box.top + 4],
      [box.left + 4, box.bottom - 4],
      [box.right - 4, box.bottom - 4],
    ] as const) {
      const top = host.elementFromPoint(x, y);
      expect(top !== null && menu()!.contains(top)).toBe(true);
    }
  });

  it("come with a bar that shows up only when the pointer moves", async () => {
    start({ controlsIdleMs: 300 });
    page.showControls(false);
    await expect.poll(() => buttons()?.isConnected ?? false).toBe(false);
    page.video.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true }),
    );
    await expect
      .poll(() => buttons()?.nextElementSibling ?? null)
      .toBe(audioWrapper());
    // Gone with the bar when the pointer stops.
    const host = buttons()!;
    await expect.poll(() => host.isConnected).toBe(false);
  });

  it("keep up with a bar that is built again and again", async () => {
    start();
    await expect.poll(() => buttons()?.isConnected).toBe(true);
    const host = buttons()!;
    for (let i = 0; i < 30; i++) {
      page.showControls(false);
      page.showControls(true);
      await expect
        .poll(() => host.nextElementSibling, { timeout: 250, interval: 5 })
        .toBe(audioWrapper());
    }
  });

  it("float at the player's bottom right, visible while the pointer moves, on a page without a bar", async () => {
    start({ controls: false });
    const group = () =>
      document.querySelector<HTMLElement>("lingo-netflix-controls");
    await expect.poll(() => buttons()?.parentElement).toBe(group());
    expect(group()!.parentElement).toBe(page.player);
    page.video.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true }),
    );
    expect(getComputedStyle(group()!).visibility).toBe("visible");
    const box = buttons()!.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    const player = page.player.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(player.right);
    expect(box.bottom).toBeLessThanOrEqual(player.bottom);
  });
});

describe("the subtitle over Netflix's video", () => {
  const subtitle = () =>
    document
      .querySelector("lingo-video-player")
      ?.shadowRoot?.querySelector<HTMLElement>("[role='region']") ?? null;
  const bottomOf = () => subtitle()!.getBoundingClientRect().bottom;
  const barTop = () => page.controls()!.getBoundingClientRect().top;
  /** The top of the bar's buttons and title (the title can stick out of the bar). */
  const partsTop = () =>
    Math.min(
      ...[
        ...page
          .controls()!
          .querySelectorAll("[data-uia^='control-'], [data-uia='video-title']"),
      ].map((part) => part.getBoundingClientRect().top),
    );
  /**
   * The subtitle ends up 12px above `top()`, give or take the rounding up to whole
   * pixels (measured afresh: fonts can still change the bar's layout).
   */
  const settlesAbove = (top: () => number) =>
    expect
      .poll(() => {
        const gap = top() - bottomOf();
        return gap >= 12 && gap < 14 ? "12px above" : gap;
      })
      .toBe("12px above");

  it("rises above the control bar while it shows, and goes back down after", async () => {
    start();
    page.showControls(false);
    await expect.poll(() => subtitle()).not.toBeNull();
    const player = page.player.getBoundingClientRect();
    // Without the bar: 64px above the player's bottom.
    await expect.poll(bottomOf).toBeCloseTo(player.bottom - 64, 0);

    page.showControls(true);
    expect(page.controls()).not.toBeNull();
    expect(barTop()).toBeLessThan(player.bottom - 64);
    await settlesAbove(() => Math.min(barTop(), partsTop()));

    page.showControls(false);
    await expect.poll(bottomOf).toBeCloseTo(player.bottom - 64, 0);
  });

  it("rises above the bar's buttons and title when the bar covers the whole player", async () => {
    start();
    // A bar laid over the whole player, its row at the bottom.
    page.root.prepend(
      Object.assign(document.createElement("style"), {
        textContent: `.watch-video [data-uia="controls-standard"] { top: 0; display: flex; flex-direction: column; justify-content: flex-end; }`,
      }),
    );
    page.showControls(false);
    page.showControls(true);
    const player = page.player.getBoundingClientRect();
    expect(barTop()).toBe(player.top);
    await settlesAbove(partsTop);
  });
});

describe("the transcript sidebar on Netflix", () => {
  const lingo = () => document.querySelector<HTMLElement>("lingo-video");
  const sidebar = () =>
    document.querySelector<HTMLElement>("lingo-video-sidebar");
  const transcript = () =>
    document.querySelector<HTMLElement>("lingo-transcript");
  const line = () =>
    document
      .querySelector("lingo-video-player")
      ?.shadowRoot?.querySelector<HTMLElement>("[role='region'] [lang]") ??
    null;

  it("narrows the player for the sidebar beside it, covering nothing of the video", async () => {
    start();
    await expect.poll(() => transcript()?.parentElement).toBe(sidebar());
    const box = sidebar()!.getBoundingClientRect();
    expect([box.top, box.right, box.bottom, box.width]).toEqual([
      16,
      innerWidth - 16,
      innerHeight - 16,
      360,
    ]);
    await expect
      .poll(() => page.player.getBoundingClientRect().right)
      .toBe(innerWidth - 392);
    // The transcript fills the sidebar.
    const aside = () => transcript()!.shadowRoot!.querySelector("aside")!;
    await expect
      .poll(() => aside().getBoundingClientRect().height)
      .toBe(innerHeight - 32);
    // Netflix's control bar goes with the player.
    expect(page.controls()!.getBoundingClientRect().right).toBe(
      innerWidth - 392,
    );
  });

  it("moves into the fullscreen element with the page's parts, and stays beside the player", async () => {
    start();
    await expect.poll(() => lingo()?.parentElement).toBe(document.body);
    await expect.poll(() => sidebar()?.parentElement).toBe(document.body);
    const button = document.createElement("button");
    button.textContent = "Full screen";
    button.style.cssText =
      "position: fixed; top: 0; left: 0; z-index: 2147483647;";
    button.onclick = () => void page.root.requestFullscreen();
    document.body.append(button);
    await userEvent.click(button);
    button.remove();
    await expect.poll(() => document.fullscreenElement).toBe(page.root);

    await expect.poll(() => lingo()?.parentElement).toBe(page.root);
    await expect.poll(() => sidebar()?.parentElement).toBe(page.root);
    expect(transcript()!.parentElement).toBe(sidebar());
    expect(page.player.getBoundingClientRect().right).toBe(innerWidth - 392);
    await expect.poll(() => line()?.textContent).toBe("HELLO THERE.");
    expect(getComputedStyle(line()!).fontSize).toBe("34px");
    // The L and ^ buttons stay in the bar.
    await expect.poll(() => buttons()?.nextElementSibling).toBe(audioWrapper());

    await document.exitFullscreen();
    await expect.poll(() => lingo()?.parentElement).toBe(document.body);
    await expect.poll(() => sidebar()?.parentElement).toBe(document.body);
    await expect
      .poll(() => line() && getComputedStyle(line()!).fontSize)
      .toBe("24px");
  });
});
