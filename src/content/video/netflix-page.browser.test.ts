import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import enImsc from "../../core/subtitles/fixtures/netflix/en.imsc.ttml?raw";
import { readManifest } from "./netflix-manifest";
import {
  FROM_PAGE,
  TO_PAGE,
  isReplyMessage,
  isTracksMessage,
  type PageCall,
  type TracksMessage,
} from "./netflix-messages";
import { installNetflixHooks } from "./netflix-page";
import {
  createTestPage,
  EPISODE,
  MOVIE_ID,
  SHOW,
  testManifest,
  type TestPage,
} from "../../testing/netflix-page";

const posted: TracksMessage[] = [];
function onMessage(event: MessageEvent) {
  if (isTracksMessage(event.data)) posted.push(event.data);
}
beforeAll(() => window.addEventListener("message", onMessage));
afterAll(() => window.removeEventListener("message", onMessage));
afterEach(() => {
  posted.length = 0;
});

/** Lets pending message events run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

let uninstall: () => void;
beforeEach(() => {
  uninstall = installNetflixHooks();
});
afterEach(() => uninstall());

describe("reading manifests from JSON.parse", () => {
  it("posts the tracks of a parsed manifest and returns the result unchanged", async () => {
    const text = testManifest();
    const parsed: unknown = JSON.parse(text);
    // Response.json() does not go through JSON.parse.
    expect(parsed).toStrictEqual(await new Response(text).json());
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toEqual({
      source: FROM_PAGE,
      type: "tracks",
      ...readManifest(parsed),
    });
    expect(posted[0]?.movieId).toBe(MOVIE_ID);
  });

  it("passes the reviver and errors through", () => {
    expect(
      JSON.parse('{"a":1}', (_key, value: unknown) =>
        typeof value === "number" ? value + 1 : value,
      ),
    ).toEqual({ a: 2 });
    expect(() => JSON.parse("{oops")).toThrow(SyntaxError);
  });

  it("ignores other JSON", async () => {
    JSON.parse('{"result":{"movieId":1}}');
    JSON.parse("[1,2,3]");
    JSON.parse('"text"');
    await flush();
    expect(posted).toEqual([]);
  });

  it("puts JSON.parse back when uninstalled", () => {
    const wrapped = JSON.parse;
    uninstall();
    expect(JSON.parse).not.toBe(wrapped);
    JSON.parse(testManifest());
    uninstall = installNetflixHooks();
  });
});

describe("answering the content script", () => {
  let page: TestPage;
  beforeEach(() => {
    page = createTestPage();
  });
  afterEach(() => page.remove());

  let next = 0;
  /** Posts a call as the content script does and waits for its reply. */
  function call(c: PageCall) {
    const id = `test-${next++}`;
    return new Promise<{ ok: boolean; value?: unknown; error?: string }>(
      (resolve) => {
        const listener = (event: MessageEvent) => {
          if (!isReplyMessage(event.data) || event.data.id !== id) return;
          window.removeEventListener("message", listener);
          resolve(event.data);
        };
        window.addEventListener("message", listener);
        window.postMessage({ source: TO_PAGE, id, call: c }, location.origin);
      },
    );
  }

  it("answers the tracks of a seen title, and null for others", async () => {
    const { value } = await call({ type: "getTracks", movieId: MOVIE_ID });
    expect(value).toEqual(readManifest(JSON.parse(testManifest()))?.tracks);
    expect(await call({ type: "getTracks", movieId: "1" })).toEqual(
      expect.objectContaining({ ok: true, value: null }),
    );
  });

  it("answers the playing title's id and name from the player", async () => {
    expect((await call({ type: "currentMovieId" })).value).toBe(MOVIE_ID);
    expect((await call({ type: "title", movieId: MOVIE_ID })).value).toBe(
      `${SHOW} · S1:E1 ${EPISODE}`,
    );
    expect((await call({ type: "title", movieId: "1" })).value).toBeNull();
  });

  it("seeks through the player's API in milliseconds", async () => {
    expect((await call({ type: "seek", ms: 1500 })).ok).toBe(true);
    expect(page.fake.log.seek).toEqual([1500]);
  });

  it("fails to seek without the player API", async () => {
    delete (window as unknown as Record<string, unknown>).netflix;
    expect(await call({ type: "seek", ms: 1500 })).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  it("downloads only the subtitle URLs of a seen manifest", async () => {
    const tracks = readManifest(JSON.parse(testManifest()))!.tracks;
    const url = tracks[0]!.downloads[0]!.urls[0]!;
    expect(await call({ type: "fetchText", url })).toEqual(
      expect.objectContaining({ ok: true, value: enImsc }),
    );
    const other = `${location.origin}/lingo-nflx/?t=SYNTHETIC-ja-image`;
    expect(await call({ type: "fetchText", url: other })).toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  it("ignores calls from other sources and malformed calls", async () => {
    let replies = 0;
    const count = (event: MessageEvent) => {
      if (isReplyMessage(event.data)) replies++;
    };
    window.addEventListener("message", count);
    window.postMessage(
      { source: "other", id: "x", call: { type: "currentMovieId" } },
      location.origin,
    );
    window.postMessage(
      { source: TO_PAGE, id: "y", call: { type: "seek", ms: "1" } },
      location.origin,
    );
    window.postMessage(
      { source: TO_PAGE, id: "z", call: { type: "eval" } },
      location.origin,
    );
    await flush();
    window.removeEventListener("message", count);
    expect(replies).toBe(0);
  });
});
