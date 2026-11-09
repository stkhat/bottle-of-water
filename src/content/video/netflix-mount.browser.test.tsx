import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { createStore } from "../ui/store";
import { mountVideoUi } from "./mount";
import { createNetflixAdapter, type NetflixAdapter } from "./netflix";
import { installNetflixHooks } from "./netflix-page";
import { createTestPage, MOVIE_ID, type TestPage } from "./netflix-test-page";
import type { VideoApp, VideoState } from "./session";

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
  unsaved: 0,
  done: null,
  endCard: false,
  hover: null,
  panel: null,
  menuOpen: false,
  fullscreen: false,
};

/** An app over a store; the ^ button opens the menu as the real one does. */
function fakeApp(): VideoApp {
  const store = createStore(STATE);
  const methods: Partial<VideoApp> = {
    setMenuOpen: (open: boolean) => store.set({ menuOpen: open }),
  };
  return new Proxy({ store } as unknown as VideoApp, {
    get: (_target, name: string) =>
      name === "store"
        ? store
        : (methods[name as keyof VideoApp] ?? (() => undefined)),
  });
}

let uninstall: () => void;
beforeAll(() => {
  uninstall = installNetflixHooks();
});
afterAll(() => uninstall());

let page: TestPage;
let adapter: NetflixAdapter;
let unmount: () => void;

function start(options: Parameters<typeof createTestPage>[0] = {}) {
  page = createTestPage(options);
  adapter = createNetflixAdapter({
    href: () => `https://www.netflix.com/watch/${MOVIE_ID}`,
    idleMs: 60_000,
  });
  unmount = mountVideoUi({ adapter, app: fakeApp() });
}
afterEach(() => {
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
    menuButton().click();
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
