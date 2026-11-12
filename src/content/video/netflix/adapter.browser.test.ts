import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import enDfxp from "../../../core/subtitles/fixtures/netflix/en.dfxp?raw";
import enImsc from "../../../core/subtitles/fixtures/netflix/en.imsc.ttml?raw";
import jaImsc from "../../../core/subtitles/fixtures/netflix/ja.imsc.ttml?raw";
import { parseTtml } from "../../../core/subtitles/ttml";
import { createNetflixAdapter } from "./adapter";
import { installNetflixHooks } from "./page";
import {
  createTestPage,
  EPISODE,
  METADATA,
  MOVIE_ID,
  SHOW,
  testManifest,
  type TestPage,
} from "../../../testing/netflix-page";
import type { PlatformAdapter } from "../platform";

const REQUEST = {
  learningLang: "en",
  nativeLang: "ja",
  translatorAvailable: false,
};

let uninstall: () => void;
beforeAll(() => {
  uninstall = installNetflixHooks();
});
afterAll(() => uninstall());

let page: TestPage;
let adapter: PlatformAdapter;
let href: string;

function start(
  pageOptions: Parameters<typeof createTestPage>[0] = {},
  adapterOptions: Parameters<typeof createNetflixAdapter>[0] = {},
) {
  page = createTestPage(pageOptions);
  adapter = createNetflixAdapter({
    href: () => href,
    tracksTimeoutMs: 500,
    pollMs: 20,
    idleMs: 200,
    ...adapterOptions,
  });
}

beforeEach(() => {
  href = `https://www.netflix.com/watch/${MOVIE_ID}?trackId=14170286`;
  performance.clearResourceTimings();
});
afterEach(() => {
  adapter.dispose();
  page.remove();
});

/** The subtitle downloads (by token) the page made since the test started. */
const downloads = () =>
  performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter((url) => url.pathname === "/lingo-nflx/")
    .map((url) => url.searchParams.get("t"));

describe("the watch page", () => {
  beforeEach(() => start());

  it("finds the player, the video and Netflix's subtitles", () => {
    expect(adapter.playerElement()).toBe(page.player);
    expect(adapter.video()).toBe(page.video);
  });

  /** The row of the bar's right-hand buttons, and the wrapper of one of them. */
  const row = () =>
    page.controls()!.querySelector("[data-uia='control-next']")!.parentElement!
      .parentElement!;
  const wrapper = (uia: string) =>
    page.controls()!.querySelector(`[data-uia='${uia}']`)!.parentElement!;

  it("puts the player buttons in the control bar's row, before the audio & subtitles button's wrapper", () => {
    const point = adapter.controlsPoint();
    expect(point?.parent).toBe(row());
    expect(point?.before).toBe(wrapper("control-audio-subtitle"));
  });

  it("keeps to the row while a button's wrapper holds more than the button", () => {
    // Netflix can add a tooltip or a panel next to a button.
    const tip = document.createElement("div");
    tip.textContent = "Audio & Subtitles";
    wrapper("control-audio-subtitle").append(tip);
    const point = adapter.controlsPoint();
    expect(point?.parent).toBe(row());
    expect(point?.before).toBe(wrapper("control-audio-subtitle"));
  });

  it("falls back to the playback speed and then the full screen button", () => {
    wrapper("control-audio-subtitle").remove();
    expect(adapter.controlsPoint()?.before).toBe(wrapper("control-speed"));
    wrapper("control-speed").remove();
    expect(adapter.controlsPoint()?.before).toBe(
      wrapper("control-fullscreen-enter"),
    );
    expect(adapter.controlsPoint()?.parent).toBe(row());
  });

  it("reads the watch id, the title and the URL", () => {
    expect(adapter.platform).toBe("netflix");
    expect(adapter.videoId()).toBe(MOVIE_ID);
    expect(adapter.url()).toBe(`https://www.netflix.com/watch/${MOVIE_ID}`);
    // From the control bar until the player's metadata is read.
    expect(adapter.title()).toBe(`${SHOW} E1 ${EPISODE}`);
    href = "https://www.netflix.com/browse";
    expect(adapter.videoId()).toBeUndefined();
  });

  it("puts the subtitle box at the bottom of the player and the transcript in a panel at the right", () => {
    const below = adapter.belowVideoElement();
    expect(below?.parentElement).toBe(page.player);
    expect(getComputedStyle(below!).position).toBe("absolute");
    const side = adapter.sideColumn();
    expect(side?.before).toBeNull();
    const panel = side!.parent as HTMLElement;
    expect(panel.parentElement).toBe(document.body);
    expect(getComputedStyle(panel).position).toBe("fixed");
    expect(panel.getBoundingClientRect().right).toBeCloseTo(
      document.documentElement.clientWidth - 16,
      0,
    );
    // The transcript is as tall as its panel, not as the whole player.
    expect(adapter.transcriptFrame?.()).toBe(panel);
    // The same elements every time.
    expect(adapter.sideColumn()?.parent).toBe(panel);
    expect(adapter.belowVideoElement()).toBe(below);
  });

  it("hides Netflix's subtitles and shows them again", () => {
    const display = () => getComputedStyle(page.captions).display;
    expect(display()).toBe("block");
    adapter.hideSiteCaptions(true);
    adapter.hideSiteCaptions(true);
    expect(display()).toBe("none");
    adapter.hideSiteCaptions(false);
    expect(display()).toBe("block");
  });

  it("seeks through Netflix's player", async () => {
    await adapter.seek(12_500);
    expect(page.fake.log.seek).toEqual([12_500]);
  });

  it("pauses and plays through Netflix's player", async () => {
    await adapter.pause();
    await adapter.play();
    expect(page.fake.log.playback).toEqual(["pause", "play"]);
  });

  it("tells when the URL changes to another title", async () => {
    let calls = 0;
    const off = adapter.onNavigate(() => calls++);
    href = "https://www.netflix.com/watch/80000002";
    await expect.poll(() => calls).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls).toBe(1);
    off();
    href = "https://www.netflix.com/watch/80000003";
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls).toBe(1);
  });

  it("leaves no element behind when disposed", () => {
    adapter.belowVideoElement();
    adapter.sideColumn();
    adapter.hideSiteCaptions(true);
    adapter.dispose();
    expect(document.querySelector("lingo-netflix-side")).toBeNull();
    expect(page.player.querySelector("lingo-netflix-below")).toBeNull();
    expect(getComputedStyle(page.captions).display).toBe("block");
  });
});

describe("a page without Netflix's control bar", () => {
  beforeEach(() => start({ controls: false }));

  const group = () => adapter.controlsPoint()?.parent as HTMLElement;
  const shown = () => getComputedStyle(group()).visibility;

  it("floats the player buttons at the bottom right of the player while the pointer moves", async () => {
    const point = adapter.controlsPoint();
    expect(point?.parent.parentElement).toBe(page.player);
    expect(point?.before).toBeNull();
    expect(shown()).toBe("hidden");
    page.player.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true }),
    );
    expect(shown()).toBe("visible");
    await expect.poll(shown).toBe("hidden");
  });

  it("sees the pointer move even when the page stops it from bubbling", () => {
    expect(shown()).toBe("hidden");
    const stop = (event: Event) => event.stopPropagation();
    page.player.addEventListener("pointermove", stop);
    page.player.addEventListener("mousemove", stop);
    page.video.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true }),
    );
    expect(shown()).toBe("visible");
  });

  it("drops the floating group once a control bar shows up", () => {
    const floating = group();
    page.fake.showControls(true); // no bar: the page has none
    const bar = document.createElement("div");
    bar.innerHTML =
      '<div><button data-uia="control-audio-subtitle"></button></div>' +
      '<div><button data-uia="control-fullscreen-enter"></button></div>';
    page.player.append(bar);
    expect(adapter.controlsPoint()?.parent).toBe(bar);
    expect(floating.isConnected).toBe(false);
    bar.remove();
    expect(adapter.controlsPoint()).toBeNull();
  });
});

describe("loading subtitles", () => {
  it("reads the English closed captions and the Japanese subtitles from the manifest", async () => {
    start();
    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.track).toEqual({
      id: "T:1:1;1;en;1;0;",
      lang: "en",
      kind: "manual",
      label: "English [CC]",
    });
    expect(captions?.cues).toEqual(parseTtml(enImsc));
    expect(captions?.translation).toEqual({
      source: "siteTrack",
      lang: "ja",
      cues: parseTtml(jaImsc),
    });
    // IMSC is preferred to DFXP; the forced track is not read.
    expect(downloads()).toEqual(["SYNTHETIC-en-imsc", "SYNTHETIC-ja-imsc"]);
    // The player's metadata names the episode.
    expect(adapter.title()).toBe(`${SHOW} · S1:E1 ${EPISODE}`);
  });

  it("lists the tracks that are not forced", async () => {
    start();
    expect((await adapter.tracks()).map((t) => t.lang)).toEqual(["en", "ja"]);
  });

  it("falls back to the built-in translator or none without a Japanese track", async () => {
    start({ manifest: testManifest(MOVIE_ID, /"ja"/) });
    expect(
      (await adapter.loadCaptions({ ...REQUEST, translatorAvailable: true }))
        ?.translation,
    ).toEqual({ source: "builtIn", lang: "ja", cues: [] });
    expect((await adapter.loadCaptions(REQUEST))?.translation.source).toBe(
      "none",
    );
  });

  it("falls back when the Japanese track cannot be downloaded", async () => {
    start({
      manifest: testManifest().replace("SYNTHETIC-ja-imsc", "SYNTHETIC-gone"),
    });
    const captions = await adapter.loadCaptions({
      ...REQUEST,
      translatorAvailable: true,
    });
    expect(captions?.cues.length).toBeGreaterThan(0);
    expect(captions?.translation.source).toBe("builtIn");
  });

  it("downloads through the page when the content script's fetch is blocked", async () => {
    start(
      {},
      { fetch: () => Promise.reject(new TypeError("Failed to fetch")) },
    );
    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.cues).toEqual(parseTtml(enImsc));
    expect(captions?.translation.source).toBe("siteTrack");
  });

  it("tries the next CDN and then the next format when a download fails", async () => {
    start({
      manifest: testManifest().replaceAll(
        "SYNTHETIC-en-imsc",
        "SYNTHETIC-gone",
      ),
    });
    const captions = await adapter.loadCaptions(REQUEST);
    // The DFXP file has the same lines, one <p> per line.
    expect(captions?.cues).toEqual(parseTtml(enDfxp));
    expect(captions?.cues).toEqual(parseTtml(enImsc));
    expect(downloads()).toEqual([
      "SYNTHETIC-gone",
      "SYNTHETIC-gone",
      "SYNTHETIC-en-dfxp",
      "SYNTHETIC-ja-imsc",
    ]);
  });

  it("gives up when no English format can be read", async () => {
    start({
      manifest: testManifest().replace(
        /SYNTHETIC-en-(imsc|dfxp)/g,
        "SYNTHETIC-gone",
      ),
    });
    expect(await adapter.loadCaptions(REQUEST)).toBeUndefined();
    // simplesdh has no fixture either.
    await expect
      .poll(downloads)
      .toEqual([
        "SYNTHETIC-gone",
        "SYNTHETIC-gone",
        "SYNTHETIC-gone",
        "SYNTHETIC-en-simplesdh",
      ]);
  });

  it("gives up on titles without a track in the learning language", async () => {
    start();
    expect(
      await adapter.loadCaptions({ ...REQUEST, learningLang: "fr" }),
    ).toBeUndefined();
    expect(downloads()).toEqual([]);
  });

  it("waits for the manifest of a title the player has not loaded yet", async () => {
    start();
    href = "https://www.netflix.com/watch/80000002";
    const loading = adapter.loadCaptions(REQUEST);
    await new Promise((resolve) => setTimeout(resolve, 100));
    page.navigate({
      movieId: "80000002",
      manifest: testManifest("80000002", /"ja"/),
      metadata: METADATA,
    });
    const captions = await loading;
    expect(captions?.cues).toEqual(parseTtml(enImsc));
    expect(captions?.translation.source).toBe("none");
  });

  it("uses the playing title when the URL names another one", async () => {
    start();
    href = "https://www.netflix.com/watch/70000000";
    expect((await adapter.loadCaptions(REQUEST))?.track.lang).toBe("en");
  });

  it("returns nothing when no manifest comes", async () => {
    start();
    href = "https://www.netflix.com/watch/70000000";
    // Nor can the player say what it plays.
    delete (window as unknown as Record<string, unknown>).netflix;
    expect(await adapter.loadCaptions(REQUEST)).toBeUndefined();
  });

  it("stops waiting when aborted", async () => {
    start();
    href = "https://www.netflix.com/watch/70000000";
    const controller = new AbortController();
    const loading = adapter.loadCaptions({
      ...REQUEST,
      signal: controller.signal,
    });
    controller.abort();
    await expect(loading).rejects.toThrow();
  });
});
