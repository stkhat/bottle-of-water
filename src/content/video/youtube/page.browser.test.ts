import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import en from "../../../core/subtitles/fixtures/youtube/en.json3?raw";
import enTlangJa from "../../../core/subtitles/fixtures/youtube/en-tlang-ja.json3?raw";
import { installYouTubeHooks } from "./page";
import { isReplyMessage } from "../page-channel";
import {
  CHANNEL,
  isTimedtextMessage,
  type PageCall,
  type TimedtextMessage,
} from "./messages";
import {
  createTestPage,
  VIDEO_ID,
  type TestPage,
} from "../../../testing/youtube-page";

const TRACK = `/api/timedtext?v=${VIDEO_ID}&lang=en&pot=TOKEN&fmt=json3`;

let uninstall: () => void;
beforeAll(() => {
  uninstall = installYouTubeHooks();
});
afterAll(() => uninstall());

const posted: TimedtextMessage[] = [];
function onMessage(event: MessageEvent) {
  if (isTimedtextMessage(event.data)) posted.push(event.data);
}
beforeAll(() => window.addEventListener("message", onMessage));
afterAll(() => window.removeEventListener("message", onMessage));
afterEach(() => {
  posted.length = 0;
});

function xhr(url: string, responseType: XMLHttpRequestResponseType = "") {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = responseType;
    request.onload = () => resolve(request);
    request.onerror = reject;
    request.send();
  });
}

/** Lets pending message events run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("observing /api/timedtext", () => {
  it("posts what an XMLHttpRequest received and passes the response through", async () => {
    const request = await xhr(TRACK);
    expect(request.status).toBe(200);
    expect(request.responseText).toBe(en);
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toEqual({
      source: CHANNEL.fromPage,
      type: "timedtext",
      url: new URL(TRACK, location.href).href,
      videoId: VIDEO_ID,
      lang: "en",
      tlang: null,
      kind: null,
      body: en,
    });
  });

  it("reads a json response type as text", async () => {
    const request = await xhr(TRACK, "json");
    expect(request.response).toEqual(JSON.parse(en));
    await expect.poll(() => posted.length).toBe(1);
    expect(JSON.parse(posted[0]!.body)).toEqual(JSON.parse(en));
  });

  it("posts what fetch received and leaves the response readable", async () => {
    const response = await fetch(`${TRACK}&tlang=ja&kind=asr`);
    expect(await response.text()).toBe(""); // no fixture for asr + tlang
    const translated = await fetch(
      TRACK.replace("lang=en", "lang=en&tlang=ja"),
    );
    expect(await translated.text()).toBe(enTlangJa);
    await expect.poll(() => posted.length).toBe(2);
    expect(posted.map((m) => [m.tlang, m.kind, m.body])).toEqual([
      ["ja", "asr", ""],
      ["ja", null, enTlangJa],
    ]);
  });

  it("accepts a Request object", async () => {
    const response = await fetch(new Request(TRACK));
    expect(await response.text()).toBe(en);
    await expect.poll(() => posted.length).toBe(1);
  });

  it("ignores other requests", async () => {
    await xhr("/api/other?lang=en");
    await fetch("/api/timedtextual?lang=en");
    await flush();
    expect(posted).toEqual([]);
  });
});

describe("answering the content script", () => {
  let page: TestPage;
  beforeAll(() => {
    page = createTestPage();
  });
  afterAll(() => page.remove());

  let next = 0;
  /** Posts a call as the content script does and waits for its reply. */
  function call(c: PageCall) {
    const id = `test-${next++}`;
    return new Promise<{ ok: boolean; value?: unknown; error?: string }>(
      (resolve) => {
        const listener = (event: MessageEvent) => {
          if (!isReplyMessage(event.data, CHANNEL) || event.data.id !== id)
            return;
          window.removeEventListener("message", listener);
          resolve(event.data);
        };
        window.addEventListener("message", listener);
        window.postMessage(
          { source: CHANNEL.toPage, id, call: c },
          location.origin,
        );
      },
    );
  }

  it("answers the player response's video details and captions", async () => {
    const reply = await call({ type: "getPlayerResponse" });
    expect(reply.ok).toBe(true);
    const value = reply.value as {
      videoDetails: { videoId: string };
      captions: {
        playerCaptionsTracklistRenderer: { captionTracks: unknown[] };
      };
    };
    expect(value.videoDetails.videoId).toBe(VIDEO_ID);
    expect(
      value.captions.playerCaptionsTracklistRenderer.captionTracks,
    ).toHaveLength(4);
  });

  it("answers the video id", async () => {
    expect(await call({ type: "videoId" })).toMatchObject({
      ok: true,
      value: VIDEO_ID,
    });
  });

  it("makes the player load a track, then restores the previous one", async () => {
    const reply = await call({
      type: "loadTrack",
      languageCode: "en",
      asr: false,
    });
    expect(reply).toEqual({
      source: CHANNEL.fromPage,
      type: "reply",
      id: expect.any(String),
      ok: true,
      value: { previous: {} },
    });
    expect(page.player.fake.setOption.at(-1)).toEqual([
      "captions",
      "track",
      expect.objectContaining({ languageCode: "en", kind: "" }),
    ]);
    // The player's own request is observed like any other.
    await expect.poll(() => posted.map((m) => m.lang)).toEqual(["en"]);
    expect(posted[0]!.body).toBe(en);

    expect(await call({ type: "restoreCaptions", previous: {} })).toMatchObject(
      {
        ok: true,
      },
    );
    expect(page.player.fake.unloadModule).toEqual(["captions"]);

    const asr = await call({
      type: "loadTrack",
      languageCode: "en",
      asr: true,
    });
    expect(asr.value).toEqual({ previous: {} });
    expect(page.player.fake.setOption.at(-1)?.[2]).toMatchObject({
      languageCode: "en",
      kind: "asr",
    });
    // Each track is fetched asynchronously; wait for this one before asking for the
    // next, so the order of what is posted is the order of the requests.
    await expect.poll(() => posted.length).toBe(2);
    const previous = { languageCode: "ja", kind: "" };
    await call({ type: "restoreCaptions", previous });
    expect(page.player.fake.setOption.at(-1)).toEqual([
      "captions",
      "track",
      previous,
    ]);
    await expect
      .poll(() => posted.map((m) => [m.lang, m.kind]))
      .toEqual([
        ["en", null],
        ["en", "asr"],
        ["ja", null],
      ]);
  });

  it("fetches a timedtext URL without posting it as a player response", async () => {
    const reply = await call({ type: "fetchTimedtext", url: TRACK });
    expect(reply).toMatchObject({ ok: true, value: en });
    await flush();
    expect(posted).toEqual([]);
  });

  it("refuses to fetch anything but /api/timedtext on its own origin", async () => {
    for (const url of [
      "/api/other",
      "https://example.com/api/timedtext?lang=en",
    ]) {
      const reply = await call({ type: "fetchTimedtext", url });
      expect(reply.ok).toBe(false);
    }
  });

  it("seeks the player", async () => {
    await call({ type: "seek", seconds: 1.5 });
    expect(page.player.fake.seekTo).toEqual([1.5]);
  });

  it("calls Shorts' player when the call is for a Short, with the watch page's still there", async () => {
    const short = createTestPage({ shorts: true });
    try {
      await call({ type: "seek", seconds: 3, shorts: true });
      expect(short.player.fake.seekTo).toEqual([3]);
      expect(page.player.fake.seekTo).not.toContain(3);
    } finally {
      short.remove();
    }
  });

  it("ignores malformed calls", async () => {
    const replies: unknown[] = [];
    const listener = (event: MessageEvent) => {
      if (isReplyMessage(event.data, CHANNEL)) replies.push(event.data);
    };
    window.addEventListener("message", listener);
    window.postMessage(
      { source: CHANNEL.toPage, id: "x", call: { type: "seek", seconds: "1" } },
      location.origin,
    );
    window.postMessage(
      { source: CHANNEL.toPage, id: "y", call: { type: "eval" } },
      location.origin,
    );
    window.postMessage(
      {
        source: CHANNEL.toPage,
        id: "z",
        call: { type: "videoId", shorts: "yes" },
      },
      location.origin,
    );
    await flush();
    window.removeEventListener("message", listener);
    expect(replies).toEqual([]);
  });
});
