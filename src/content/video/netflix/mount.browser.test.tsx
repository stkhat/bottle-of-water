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
import { enterFullscreen } from "../../../testing/fullscreen";

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
  subtitleHover: false,
  menuOpen: false,
  fullscreen: false,
  panelTab: "transcript",
  wordsFilter: "all",
  wordsSort: "order",
  wordsJump: null,
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
let app: VideoApp;
let unmount: () => void;

/** Short, so tests that only need the bar get it soon (the real delay is 1 s). */
const BAR_DELAY_MS = 100;

function start(
  options: Parameters<typeof createTestPage>[0] = {},
  state: Partial<VideoState> = {},
  controlBarDelayMs = BAR_DELAY_MS,
) {
  page = createTestPage(options);
  adapter = createNetflixAdapter({
    href: () => `https://www.netflix.com/watch/${MOVIE_ID}`,
    idleMs: 60_000,
    controlBarDelayMs,
  });
  app = fakeApp();
  app.store.set(state);
  unmount = mountVideoUi({ adapter, app });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The pointer moves over the player: at its bottom (the bar's area), its middle or its
 * top (the back arrow's strip).
 */
function moveOver(where: "bottom" | "middle" | "top") {
  const box = page.player.getBoundingClientRect();
  page.video.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: (box.left + box.right) / 2,
      clientY:
        where === "bottom"
          ? box.bottom - 40
          : where === "top"
            ? box.top + 40
            : (box.top + box.bottom) / 2,
    }),
  );
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

  it("line up with Netflix's buttons in the row", async () => {
    start();
    await expect.poll(() => buttons()?.nextElementSibling).toBe(audioWrapper());
    const centre = (element: Element) => {
      const { top, bottom } = element.getBoundingClientRect();
      return (top + bottom) / 2;
    };
    // Netflix's button sits at the top of its taller wrapper: its centre, not the row's.
    const audio = audioWrapper()!.firstElementChild!;
    expect(centre(audio)).toBeLessThan(centre(audioWrapper()!) - 1);
    expect(Math.abs(centre(menuButton()) - centre(audio))).toBeLessThanOrEqual(
      1,
    );
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

    moveOver("bottom");
    expect(page.controls()).not.toBeNull();
    expect(barTop()).toBeLessThan(player.bottom - 64);
    await settlesAbove(() => Math.min(barTop(), partsTop()));

    page.showControls(false);
    await expect.poll(bottomOf).toBeCloseTo(player.bottom - 64, 0);
  });

  // The bar goes a few seconds after the pointer stops on a word: the word must stay
  // under it, or the hover card closes and the video plays again.
  it("keeps its height while Lingo is in use, and follows the bar once it is not", async () => {
    start();
    moveOver("bottom");
    await expect.poll(() => subtitle()).not.toBeNull();
    await settlesAbove(() => Math.min(barTop(), partsTop()));
    // The end of the slide up (it is within 12-14px of the bar before it stops).
    await new Promise((resolve) => setTimeout(resolve, 400));
    const lifted = bottomOf();

    app.store.set({ selecting: true });
    page.showControls(false);
    // Longer than the subtitle's 0.2s slide.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(bottomOf()).toBeCloseTo(lifted, 0);

    app.store.set({ selecting: false });
    const player = page.player.getBoundingClientRect();
    await expect.poll(bottomOf).toBeCloseTo(player.bottom - 64, 0);
  });

  it("does not rise for the bar while Lingo is in use", async () => {
    start();
    page.showControls(false);
    await expect.poll(() => subtitle()).not.toBeNull();
    // Down from the bar shown at the start: the mount places on the next frame.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const player = page.player.getBoundingClientRect();
    expect(bottomOf()).toBeCloseTo(player.bottom - 64, 0);

    app.store.set({ selecting: true });
    moveOver("bottom");
    await wait(400);
    expect(bottomOf()).toBeCloseTo(player.bottom - 64, 0);

    // The bar shown meanwhile stays out of sight: it comes as a new one would.
    moveOver("middle");
    app.store.set({ selecting: false });
    await wait(400);
    expect(bottomOf()).toBeCloseTo(player.bottom - 64, 0);
    moveOver("bottom");
    await settlesAbove(() => Math.min(barTop(), partsTop()));
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
    moveOver("bottom");
    const player = page.player.getBoundingClientRect();
    expect(barTop()).toBe(player.top);
    await settlesAbove(partsTop);
  });
});

// Netflix shows its bar on any move, and the subtitle rises above it: moving to a word
// would move the word.
describe("Netflix's control bar while Lingo's subtitle is over the video", () => {
  const shown = () =>
    page.controls() !== null &&
    getComputedStyle(page.controls()!).visibility === "visible";
  const subtitleBottom = () =>
    document
      .querySelector("lingo-video-player")!
      .shadowRoot!.querySelector("[role='region']")!
      .getBoundingClientRect().bottom;
  const down = () => page.player.getBoundingClientRect().bottom - 64;

  it("stays out of sight for a short move over the video, and the subtitle stays down", async () => {
    start({}, {}, 200);
    page.showControls(false);
    await wait(100);
    moveOver("middle");
    expect(page.controls()).not.toBeNull();
    await wait(400);
    expect(shown()).toBe(false);
    expect(adapter.controlBarTop!()).toBeNull();
    expect(subtitleBottom()).toBeCloseTo(down(), 0);
  });

  it("stays out of sight however long the pointer keeps moving over the middle", async () => {
    start({}, {}, 200);
    page.showControls(false);
    await wait(100);
    for (let i = 0; i < 10; i++) {
      moveOver("middle");
      await wait(50);
    }
    expect(shown()).toBe(false);
    expect(subtitleBottom()).toBeCloseTo(down(), 0);
  });

  it("shows once the pointer has stayed in the bar's area for the delay, moving or not", async () => {
    start({}, {}, 300);
    page.showControls(false);
    await wait(100);
    moveOver("bottom");
    await wait(150);
    moveOver("bottom");
    await wait(100);
    expect(shown()).toBe(false);
    expect(subtitleBottom()).toBeCloseTo(down(), 0);
    // No more moves: it shows when the delay is up.
    await expect.poll(shown).toBe(true);
    await expect.poll(subtitleBottom).toBeLessThan(down() - 20);
  });

  it("starts over when the pointer leaves the bar's area or the window before the delay", async () => {
    start({}, {}, 300);
    page.showControls(false);
    await wait(100);
    moveOver("bottom");
    await wait(200);
    moveOver("middle");
    moveOver("bottom");
    await wait(200);
    // Out of the window over its bottom edge.
    window.dispatchEvent(new MouseEvent("mouseout", { relatedTarget: null }));
    await wait(300);
    expect(shown()).toBe(false);
  });

  it("shows at once when the pointer is in the back arrow's strip at the top", async () => {
    start({}, {}, 60_000);
    page.showControls(false);
    await wait(100);
    moveOver("top");
    await expect.poll(shown).toBe(true);
  });

  it("stays out of sight while the pointer is on the subtitle, also in the bar's area", async () => {
    start({}, {}, 200);
    page.showControls(false);
    await wait(100);
    app.store.set({ subtitleHover: true });
    moveOver("bottom");
    await wait(400);
    expect(shown()).toBe(false);
    // Off the subtitle, into the bar's area: the delay starts then.
    app.store.set({ subtitleHover: false });
    await wait(100);
    expect(shown()).toBe(false);
    await expect.poll(shown).toBe(true);
  });

  // On netflix.com they sit outside the bar's element and come with it.
  it("holds back the back arrow and the flag at the top with it", async () => {
    start();
    const back = document.createElement("button");
    back.setAttribute("data-uia", "control-nav-back");
    page.player.append(back);
    page.showControls(false);
    await wait(100);
    moveOver("middle");
    await wait(100);
    expect(getComputedStyle(back).visibility).toBe("hidden");
    moveOver("bottom");
    await expect.poll(() => getComputedStyle(back).visibility).toBe("visible");
  });

  it("is held back again once Netflix took it away", async () => {
    start();
    moveOver("bottom");
    await expect.poll(shown).toBe(true);
    page.showControls(false);
    await wait(600);
    moveOver("middle");
    await wait(100);
    expect(shown()).toBe(false);
  });

  // Netflix also builds the bar anew while the pointer moves.
  it("stays shown when Netflix builds it anew at once", async () => {
    start();
    moveOver("bottom");
    await expect.poll(shown).toBe(true);
    // Past the subtitle's 0.2s slide.
    await wait(400);
    const lifted = subtitleBottom();
    page.showControls(false);
    await wait(50);
    page.showControls(true);
    await wait(700);
    expect(shown()).toBe(true);
    expect(subtitleBottom()).toBeCloseTo(lifted, 0);
  });

  it("never shows while Lingo is in use, and goes when it comes into use", async () => {
    start();
    moveOver("bottom");
    await expect.poll(shown).toBe(true);
    app.store.set({ selecting: true });
    await expect.poll(shown).toBe(false);
    moveOver("bottom");
    await wait(100);
    expect(shown()).toBe(false);
  });

  it("shows after the delay when Lingo's use ends with the pointer in the bar's area", async () => {
    start({}, {}, 200);
    app.store.set({ selecting: true });
    moveOver("bottom");
    await wait(300);
    expect(shown()).toBe(false);
    // The move to the bar closed the card.
    app.store.set({ selecting: false });
    await wait(100);
    expect(shown()).toBe(false);
    await expect.poll(shown).toBe(true);
  });

  it("shows as Netflix shows it while Lingo is off or its subtitle is below the video", async () => {
    start({}, { enabled: false });
    await wait(100);
    expect(shown()).toBe(true);
    unmount();
    adapter.dispose();
    page.remove();

    start(
      {},
      { settings: { ...DEFAULT_SETTINGS, subtitlePosition: "belowVideo" } },
    );
    await wait(100);
    expect(shown()).toBe(true);
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
    // The sidebar may be made after the first look: compare with it once it is there.
    await expect
      .poll(() => {
        const made = sidebar();
        return made !== null && transcript()?.parentElement === made;
      })
      .toBe(true);
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
    await enterFullscreen(page.root);

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
