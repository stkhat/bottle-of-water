import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import captionTracks from "../../../core/subtitles/fixtures/youtube/captionTracks.json";
import en from "../../../core/subtitles/fixtures/youtube/en.json3?raw";
import enTlangJa from "../../../core/subtitles/fixtures/youtube/en-tlang-ja.json3?raw";
import ja from "../../../core/subtitles/fixtures/youtube/ja.json3?raw";
import { parseYouTubeJson3 } from "../../../core/subtitles/youtube-json3";
import { createYouTubeAdapter, type YouTubeAdapterOptions } from "./adapter";
import { CHANNEL, type TimedtextMessage } from "./messages";
import { installYouTubeHooks } from "./page";
import {
  createTestPage,
  TITLE,
  VIDEO_ID,
  type TestPage,
} from "../../../testing/youtube-page";
import type { PlatformAdapter } from "../platform";

const REQUEST = {
  learningLang: "en",
  nativeLang: "ja",
  translatorAvailable: false,
};

let uninstall: () => void;
beforeAll(() => {
  uninstall = installYouTubeHooks();
});
afterAll(() => uninstall());

let page: TestPage;
let adapter: PlatformAdapter;
let href: string;

function start(
  options: Parameters<typeof createTestPage>[0] = {},
  adapterOptions: YouTubeAdapterOptions = {},
) {
  page = createTestPage(options);
  adapter = createYouTubeAdapter({
    href: () => href,
    playerRequestWaitMs: 100,
    captureTimeoutMs: 1000,
    pollMs: 20,
    ...adapterOptions,
  });
}

/**
 * Keeps the next `count` fetchTimedtext calls from reaching the page script, as when
 * its answer does not come in time. Returns how many it kept back so far.
 */
function dropFetchCalls(count: number): () => number {
  let dropped = 0;
  const onMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (
      dropped < count &&
      typeof data === "object" &&
      data !== null &&
      "source" in data &&
      data.source === CHANNEL.toPage &&
      "call" in data &&
      (data.call as { type?: unknown }).type === "fetchTimedtext"
    ) {
      dropped++;
      event.stopImmediatePropagation();
    }
  };
  // Listeners run in the order they were added: put this one before the page script's.
  uninstall();
  window.addEventListener("message", onMessage);
  uninstall = installYouTubeHooks();
  cleanups.push(() => window.removeEventListener("message", onMessage));
  return () => dropped;
}
const cleanups: (() => void)[] = [];

beforeEach(() => {
  href = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
  performance.clearResourceTimings();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  adapter.dispose();
  page.remove();
});

/** The /api/timedtext URLs the page has requested since the test started. */
const timedtextRequests = () =>
  performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter((url) => url.pathname === "/api/timedtext");

/** A copy of the fixture response without the tracks `drop` matches. */
function responseWithout(drop: (track: { vssId: string }) => boolean) {
  const copy = structuredClone(captionTracks);
  const renderer = copy.captions.playerCaptionsTracklistRenderer;
  renderer.captionTracks = renderer.captionTracks.filter((t) => !drop(t));
  return copy;
}

describe("the watch page", () => {
  beforeEach(() => start());

  it("finds the player, its parts and the columns", () => {
    expect(adapter.playerElement()).toBe(page.player);
    expect(adapter.video()).toBe(page.video);
    const controls = adapter.controlsPoint();
    expect(controls?.parent.className).toBe("ytp-right-controls-left");
    expect(controls?.before?.classList.contains("ytp-settings-button")).toBe(
      true,
    );
    expect(adapter.belowVideoElement()?.id).toBe("below");
    const side = adapter.sideColumn();
    expect(side?.parent.id).toBe("secondary-inner");
    expect(side?.before?.id).toBe("related");
  });

  it("puts the player buttons first in the right-hand controls without a settings button", () => {
    page.player.querySelector(".ytp-settings-button")!.remove();
    const controls = adapter.controlsPoint();
    expect(controls?.parent.className).toBe("ytp-right-controls");
    expect(controls?.before?.className).toBe("ytp-right-controls-left");
  });

  it("reads the video id, title and URL", () => {
    expect(adapter.platform).toBe("youtube");
    expect(adapter.videoId()).toBe(VIDEO_ID);
    expect(adapter.title()).toBe(TITLE);
    expect(adapter.url()).toBe(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
    href = "https://www.youtube.com/feed/subscriptions";
    expect(adapter.videoId()).toBeUndefined();
  });

  it("knows when an ad plays", () => {
    expect(adapter.adShowing()).toBe(false);
    page.player.classList.add("ad-showing");
    expect(adapter.adShowing()).toBe(true);
  });

  it("lists the tracks of the player response", async () => {
    expect((await adapter.tracks()).map((t) => t.id)).toEqual([
      ".en",
      "a.en",
      ".ja",
      ".es",
    ]);
  });

  it("seeks through the player", async () => {
    await adapter.seek(1500);
    expect(page.player.fake.seekTo).toEqual([1.5]);
  });

  it("hides YouTube's captions and shows them again", () => {
    const display = () => getComputedStyle(page.captions).display;
    expect(display()).toBe("block");
    adapter.hideSiteCaptions(true);
    adapter.hideSiteCaptions(true);
    expect(display()).toBe("none");
    adapter.hideSiteCaptions(false);
    expect(display()).toBe("block");
  });

  it("tells about SPA navigation", () => {
    let calls = 0;
    const off = adapter.onNavigate(() => calls++);
    page.navigate({
      videoId: "other",
      title: "Other",
      playerResponse: captionTracks,
    });
    expect(calls).toBe(1);
    off();
    page.navigate({ videoId: "x", title: "X", playerResponse: captionTracks });
    expect(calls).toBe(1);
  });
});

describe("a Short", () => {
  beforeEach(() => {
    href = `https://www.youtube.com/shorts/${VIDEO_ID}`;
    start({ shorts: true });
  });

  it("reads the video id, the Short's title and the watch URL", () => {
    expect(adapter.videoId()).toBe(VIDEO_ID);
    expect(adapter.title()).toBe(TITLE);
    expect(adapter.url()).toBe(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
    expect(adapter.vertical?.()).toBe(true);
    href = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
    expect(adapter.vertical?.()).toBe(false);
  });

  it("finds the Short's player, its buttons and the buttons beside it, and no columns", () => {
    expect(adapter.playerElement()).toBe(page.player);
    expect(adapter.video()).toBe(page.video);
    const controls = adapter.controlsPoint();
    expect(controls?.parent.id).toBe("right-controls");
    expect(controls?.before?.id).toBe("closed-captioning-button-container");
    expect(adapter.belowVideoElement()).toBeNull();
    expect(adapter.sideColumn()).toBeNull();
    expect(adapter.besidePlayer?.()).toBe(page.actionBar);
  });

  it("goes by the URL while the watch page's player stays in the DOM", () => {
    const watch = document.createElement("div");
    watch.id = "movie_player";
    document.body.prepend(watch);
    try {
      expect(adapter.playerElement()).toBe(page.player);
    } finally {
      watch.remove();
    }
  });

  it("calls the Short's player", async () => {
    await adapter.seek(2000);
    expect(page.player.fake.seekTo).toEqual([2]);
    expect((await adapter.tracks()).map((t) => t.id)).toContain(".en");
  });

  it("loads the captions through the Short's player", async () => {
    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.track.lang).toBe("en");
    expect(captions?.cues).toEqual(parseYouTubeJson3(en));
    expect(page.player.fake.setOption[0]?.[2]).toMatchObject({
      languageCode: "en",
    });
  });
});

describe("loading captions", () => {
  it("reuses the player's own request and fetches the Japanese track with its token", async () => {
    start({ captionsOn: true });
    await page.video.play();
    await expect.poll(() => page.player.fake.requests.length).toBe(1);

    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.track.id).toBe(".en");
    expect(captions?.cues).toEqual(parseYouTubeJson3(en));
    expect(captions?.translation).toEqual({
      source: "siteTrack",
      lang: "ja",
      cues: parseYouTubeJson3(ja),
    });
    // Only the player asked for a track; Lingo fetched just the Japanese one.
    expect(page.player.fake.setOption).toHaveLength(1);
    const fetched = timedtextRequests();
    expect(fetched.map((u) => u.searchParams.get("lang"))).toEqual([
      "en",
      "ja",
    ]);
    expect(fetched[1]?.searchParams.get("pot")).toBe("FAKE-PO-TOKEN");
  });

  it("asks the player for the original track when it has not requested one, then restores it", async () => {
    start();
    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.cues).toEqual(parseYouTubeJson3(en));
    expect(captions?.translation.source).toBe("siteTrack");
    expect(page.player.fake.setOption).toEqual([
      ["captions", "track", expect.objectContaining({ languageCode: "en" })],
    ]);
    // Captions were off before: they are switched off again.
    expect(page.player.fake.unloadModule).toEqual(["captions"]);
  });

  it("uses YouTube's auto-translation without a Japanese track", async () => {
    start({ playerResponse: responseWithout((t) => t.vssId === ".ja") });
    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.translation).toEqual({
      source: "siteAutoTranslate",
      lang: "ja",
      cues: parseYouTubeJson3(enTlangJa),
    });
    expect(timedtextRequests().map((u) => u.searchParams.get("tlang"))).toEqual(
      [null, "ja"],
    );
  });

  it("falls back to the built-in translator or none", async () => {
    const noJa = responseWithout((t) => t.vssId === ".ja");
    noJa.captions.playerCaptionsTracklistRenderer.translationLanguages = [];
    start({ playerResponse: noJa });
    expect(
      (await adapter.loadCaptions({ ...REQUEST, translatorAvailable: true }))
        ?.translation,
    ).toEqual({ source: "builtIn", lang: "ja", cues: [] });
    expect((await adapter.loadCaptions(REQUEST))?.translation.source).toBe(
      "none",
    );
  });

  it("uses the auto-generated track when there is no manual one", async () => {
    start({ playerResponse: responseWithout((t) => t.vssId === ".en") });
    const captions = await adapter.loadCaptions(REQUEST);
    expect(captions?.track.id).toBe("a.en");
    expect(captions?.cues.length).toBeGreaterThan(0);
    expect(page.player.fake.setOption[0]?.[2]).toMatchObject({ kind: "asr" });
  });

  it("gives up on videos without a track in the learning language", async () => {
    start();
    expect(
      await adapter.loadCaptions({ ...REQUEST, learningLang: "fr" }),
    ).toBeUndefined();
    expect(page.player.fake.setOption).toEqual([]);
  });

  it("ignores caption requests of another video (ads)", async () => {
    start();
    const ad: TimedtextMessage = {
      source: CHANNEL.fromPage,
      type: "timedtext",
      url: `${location.origin}/api/timedtext?v=adVideo&lang=en&pot=T&fmt=json3`,
      videoId: "adVideo",
      lang: "en",
      tlang: null,
      kind: null,
      body: en,
    };
    window.postMessage(ad, location.origin);
    expect((await adapter.loadCaptions(REQUEST))?.track.id).toBe(".en");
    // The ad's URL was not reused: the player had to be asked.
    expect(page.player.fake.setOption).toHaveLength(1);
  });

  it("waits for an ad to end before asking the player", async () => {
    start();
    page.player.classList.add("ad-showing");
    const loading = adapter.loadCaptions(REQUEST);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(page.player.fake.setOption).toEqual([]);
    page.player.classList.remove("ad-showing");
    expect((await loading)?.track.id).toBe(".en");
  });

  it("follows SPA navigation and returns nothing when YouTube sends empty captions", async () => {
    start();
    // Another video whose timedtext answers are empty (as under automation).
    const other = structuredClone(captionTracks);
    for (const track of other.captions.playerCaptionsTracklistRenderer
      .captionTracks)
      track.baseUrl = track.baseUrl.replace(`v=${VIDEO_ID}`, "v=otherVideo1");
    href = "https://www.youtube.com/watch?v=otherVideo1";
    page.navigate({
      videoId: "otherVideo1",
      title: "Other",
      playerResponse: other,
    });
    expect(await adapter.loadCaptions(REQUEST)).toBeUndefined();
    expect(page.player.fake.requests.at(-1)).toContain("v=otherVideo1");
    expect(page.player.fake.unloadModule).toEqual(["captions"]);
  });

  it("waits for the player response of the current video after navigation", async () => {
    start();
    href = "https://www.youtube.com/watch?v=notYetLoaded";
    const loading = adapter.loadCaptions(REQUEST);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(page.player.fake.setOption).toEqual([]);
    page.navigate({
      videoId: "notYetLoaded",
      title: "Not yet",
      playerResponse: responseWithout(() => true),
    });
    // The response for notYetLoaded has no tracks.
    expect(await loading).toBeUndefined();
  });

  it("fetches a track again when the page does not answer in time", async () => {
    start({ captionsOn: true }, { fetchTimeoutMs: 200 });
    await page.video.play();
    await expect.poll(() => page.player.fake.requests.length).toBe(1);
    const dropped = dropFetchCalls(1);

    const captions = await adapter.loadCaptions(REQUEST);
    expect(dropped()).toBe(1);
    expect(captions?.translation).toEqual({
      source: "siteTrack",
      lang: "ja",
      cues: parseYouTubeJson3(ja),
    });
  });

  it("fails after the second unanswered fetch", async () => {
    start({ captionsOn: true }, { fetchTimeoutMs: 200 });
    await page.video.play();
    await expect.poll(() => page.player.fake.requests.length).toBe(1);
    const dropped = dropFetchCalls(2);

    await expect(adapter.loadCaptions(REQUEST)).rejects.toThrow(
      "No answer from the page to fetchTimedtext",
    );
    expect(dropped()).toBe(2);
  });

  it("stops waiting when aborted", async () => {
    start();
    page.player.classList.add("ad-showing");
    const controller = new AbortController();
    const loading = adapter.loadCaptions({
      ...REQUEST,
      signal: controller.signal,
    });
    controller.abort();
    await expect(loading).rejects.toThrow();
  });
});
