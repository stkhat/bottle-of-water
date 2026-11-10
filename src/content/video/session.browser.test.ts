import { afterEach, describe, expect, it } from "vitest";
import type { Settings } from "../../core/settings";
import videoUrl from "../../../e2e/fixtures/video.webm?url";
import type { Cue } from "../../core/subtitles/types";
import { termId } from "../../core/term-id";
import { testBackground } from "../article/test-background";
import type { TranslationProvider } from "../article/translate";
import type { PlatformAdapter, VideoCaptions } from "./platform";
import { startVideo, type VideoSession, type VideoState } from "./session";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Three lines inside the 4-second clip, with a gap at 2.0–2.5 s. */
const CUES: Cue[] = [
  { startMs: 0, endMs: 1000, text: "The yeast smells tangy." },
  { startMs: 1000, endMs: 2000, text: "Knead the dough." },
  { startMs: 2500, endMs: 3500, text: "It is a tangy\nloaf." },
];
/** A Japanese track with its own timing: the first line covers two cues. */
const JA: Cue[] = [
  { startMs: 0, endMs: 1800, text: "イーストはぴりっとした匂い。" },
  { startMs: 2400, endMs: 3600, text: "ぴりっとしたパンだ。" },
];

function captionsOf(
  cues: Cue[],
  translation: VideoCaptions["translation"] = {
    source: "siteTrack",
    lang: "ja",
    cues: JA,
  },
  kind: "manual" | "asr" = "manual",
): VideoCaptions {
  return {
    track: { id: ".en", lang: "en", kind, label: "English" },
    cues,
    translation,
  };
}

async function createVideo() {
  const video = document.createElement("video");
  video.muted = true;
  video.src = videoUrl;
  document.body.append(video);
  cleanups.push(() => video.remove());
  if (video.readyState < 1)
    await new Promise((resolve) =>
      video.addEventListener("loadedmetadata", resolve, { once: true }),
    );
  return video;
}

/** A site with one video element and captions per video id. */
function fakeSite(
  video: HTMLVideoElement,
  captions: Record<string, VideoCaptions | undefined>,
) {
  let id: string | undefined = "vid1";
  let ad = false;
  const listeners = new Set<() => void>();
  const log = { hidden: [] as boolean[], seeks: [] as number[], loads: 0 };
  const adapter: PlatformAdapter = {
    platform: "youtube",
    matches: () => true,
    videoId: () => id,
    title: () => `Title of ${id}`,
    url: () => `https://www.youtube.com/watch?v=${id}`,
    video: () => video,
    playerElement: () => null,
    controlsPoint: () => null,
    belowVideoElement: () => null,
    sideColumn: () => null,
    adShowing: () => ad,
    tracks: async () => [],
    async loadCaptions() {
      log.loads++;
      return id === undefined ? undefined : captions[id];
    },
    async seek(ms) {
      log.seeks.push(ms);
      video.currentTime = ms / 1000;
    },
    onNavigate(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hideSiteCaptions: (hidden) => log.hidden.push(hidden),
    dispose() {},
  };
  return {
    adapter,
    log,
    navigate(next: string | undefined) {
      id = next;
      for (const listener of listeners) listener();
    },
    setAd(showing: boolean) {
      ad = showing;
    },
  };
}

async function start(
  captions: Record<string, VideoCaptions | undefined> = {
    vid1: captionsOf(CUES),
  },
  options: {
    translator?: TranslationProvider;
    translatorAvailable?: boolean;
    /** Runs against the background before the session starts. */
    before?: (bg: ReturnType<typeof testBackground>) => Promise<unknown>;
    settings?: Partial<Settings>;
  } = {},
) {
  const video = await createVideo();
  const site = fakeSite(video, captions);
  const bg = testBackground({
    highlight: { new: true, learning: true, known: false },
    ...options.settings,
  });
  cleanups.push(() => bg.close());
  await options.before?.(bg);
  const settingsListeners = new Set<(settings: Settings) => void>();
  const session: VideoSession = await startVideo({
    send: bg.send,
    adapter: site.adapter,
    watchSettings(listener) {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    createTranslator: () =>
      options.translator ?? { translate: async () => undefined },
    translatorAvailable: async () => options.translatorAvailable ?? false,
  });
  cleanups.push(() => session.stop());
  /** Changes the stored settings and tells the session, as storage.onChanged does. */
  async function changeSettings(
    patch: Parameters<typeof bg.send>[0] & {
      type: "setSettings";
    },
  ) {
    const next = await bg.send(patch);
    for (const listener of settingsListeners) listener(next);
  }
  return {
    video,
    site,
    bg,
    session,
    app: session.app,
    changeSettings,
    state: () => session.app.store.get(),
  };
}

/** Moves the playhead while paused and waits for the session to notice. */
async function seekTo(video: HTMLVideoElement, seconds: number) {
  video.currentTime = seconds;
  await new Promise((resolve) =>
    video.addEventListener("seeked", resolve, { once: true }),
  );
}

const ready = (state: () => VideoState) =>
  expect.poll(() => state().status).toBe("ready");

describe("a video with subtitles", () => {
  it("loads the cues and the translation per card, and hides the site's captions", async () => {
    const { state, site } = await start();
    await ready(state);
    expect(state()).toMatchObject({
      videoId: "vid1",
      enabled: true,
      cues: CUES,
      translationSource: "siteTrack",
      // Each Japanese line goes to the card it overlaps most.
      translations: [
        "イーストはぴりっとした匂い。",
        "",
        "ぴりっとしたパンだ。",
      ],
    });
    expect(site.log.hidden).toEqual([true]);
  });

  it("follows the playing cue and shows the translation playing at that time", async () => {
    const { state, video } = await start();
    await ready(state);
    await expect.poll(() => state().current).toBe(0);
    expect(state().subtitleTranslation).toBe("イーストはぴりっとした匂い。");

    await seekTo(video, 1.2);
    await expect.poll(() => state().current).toBe(1);
    expect(state().subtitleTranslation).toBe("イーストはぴりっとした匂い。");

    await seekTo(video, 2.2);
    await expect.poll(() => state().current).toBe(-1);
    expect(state().subtitleTranslation).toBe("");

    await seekTo(video, 2.8);
    await expect.poll(() => state().current).toBe(2);
    expect(state().subtitleTranslation).toBe("ぴりっとしたパンだ。");
  });

  it("joins the lines of a Japanese translation without spaces", async () => {
    const { state } = await start({
      vid1: captionsOf(CUES, {
        source: "siteTrack",
        lang: "ja",
        cues: [
          { startMs: 0, endMs: 1000, text: "イーストは\nぴりっとした匂い。" },
        ],
      }),
    });
    await ready(state);
    await expect
      .poll(() => state().subtitleTranslation)
      .toBe("イーストはぴりっとした匂い。");
  });

  it("follows the cues while the video plays", async () => {
    const { state, video, session } = await start();
    await ready(state);
    await seekTo(video, 0.6);
    const seen: number[] = [state().current];
    const off = session.app.store.subscribe(() => {
      if (seen.at(-1) !== state().current) seen.push(state().current);
    });
    cleanups.push(off);
    await video.play();
    await expect.poll(() => seen, { timeout: 5000 }).toEqual([0, 1, -1, 2, -1]);
  });

  it("classifies the cue texts", async () => {
    const { state, bg } = await start();
    await ready(state);
    await expect.poll(() => state().spans.every((s) => s !== null)).toBe(true);
    expect(bg.sent("analyze")).toEqual([
      { type: "analyze", lang: "en", blocks: CUES.map((c) => c.text) },
    ]);
    const tangy = state().spans[0]!.find((s) => s.key === "tangy");
    expect(tangy?.category).toBe("new");
    expect(state().unsaved).toBe(4); // yeast, tangy, knead, loaf
  });

  it("classifies long videos in batches", async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      startMs: i * 10,
      endMs: i * 10 + 10,
      text: `Line ${i} of the tangy loaf.`,
    }));
    const { state, bg } = await start({
      vid1: captionsOf(many, { source: "none", lang: "ja", cues: [] }),
    });
    await ready(state);
    await expect.poll(() => bg.sent("analyze").length).toBe(3);
    expect(bg.sent("analyze").map((r) => r.blocks.length)).toEqual([
      50, 50, 20,
    ]);
    await expect.poll(() => state().spans.every((s) => s !== null)).toBe(true);
  });

  it("merges auto-generated fragments into sentences", async () => {
    const fragments: Cue[] = [
      { startMs: 0, endMs: 900, text: "the yeast smells" },
      { startMs: 400, endMs: 1500, text: "tangy." },
      { startMs: 1500, endMs: 3000, text: "knead the dough" },
    ];
    const { state } = await start({
      vid1: captionsOf(
        fragments,
        { source: "siteAutoTranslate", lang: "ja", cues: [] },
        "asr",
      ),
    });
    await ready(state);
    expect(state().cues.map((c) => c.text)).toEqual([
      "the yeast smells tangy.",
      "knead the dough",
    ]);
  });
});

describe("sentence cards", () => {
  /** A sentence that goes on in the next cue, then one of its own. */
  const SPLIT: Cue[] = [
    { startMs: 0, endMs: 1000, text: "The yeast smells" },
    { startMs: 1000, endMs: 2000, text: "tangy." },
    { startMs: 2500, endMs: 3500, text: "Knead the dough." },
  ];
  const SPLIT_JA: Cue[] = [
    { startMs: 0, endMs: 1500, text: "イーストは" },
    { startMs: 1500, endMs: 2000, text: "ぴりっとした匂い。" },
    { startMs: 2500, endMs: 3500, text: "生地をこねる。" },
  ];

  it("makes a card of each sentence, with the translated lines it overlaps", async () => {
    const { state, bg } = await start({
      vid1: captionsOf(SPLIT, {
        source: "siteTrack",
        lang: "ja",
        cues: SPLIT_JA,
      }),
    });
    await ready(state);
    expect(state().cues).toEqual([
      { startMs: 0, endMs: 2000, text: "The yeast smells tangy." },
      { startMs: 2500, endMs: 3500, text: "Knead the dough." },
    ]);
    expect(state().translations).toEqual([
      "イーストはぴりっとした匂い。",
      "生地をこねる。",
    ]);
    // Each cue is still a line in the video: a part of its card.
    expect(state().lines).toEqual([
      { startMs: 0, endMs: 1000, card: 0, start: 0, end: 16 },
      { startMs: 1000, endMs: 2000, card: 0, start: 17, end: 23 },
      { startMs: 2500, endMs: 3500, card: 1, start: 0, end: 16 },
    ]);
    await expect.poll(() => bg.sent("analyze").length).toBe(1);
    expect(bg.sent("analyze")[0]!.blocks).toEqual([
      "The yeast smells tangy.",
      "Knead the dough.",
    ]);
  });

  it("shows each cue in the video with the translated line playing at its time", async () => {
    const { state, video } = await start({
      vid1: captionsOf(SPLIT, {
        source: "siteTrack",
        lang: "ja",
        cues: SPLIT_JA,
      }),
    });
    await ready(state);
    await expect.poll(() => state().line).toBe(0);
    expect(state()).toMatchObject({
      current: 0,
      card: 0,
      subtitleTranslation: "イーストは",
    });

    await seekTo(video, 1.7);
    await expect.poll(() => state().line).toBe(1);
    expect(state()).toMatchObject({
      current: 0,
      card: 0,
      subtitleTranslation: "ぴりっとした匂い。",
    });

    await seekTo(video, 2.2);
    await expect.poll(() => state().line).toBe(-1);
    expect(state()).toMatchObject({ current: -1, card: 0 });

    await seekTo(video, 2.8);
    await expect.poll(() => state().line).toBe(2);
    expect(state()).toMatchObject({ current: 1, card: 1 });
  });
});

describe("the end of the video", () => {
  it("offers to save every unsaved new word, and undoes it", async () => {
    const { state, video, session } = await start();
    await ready(state);
    await expect.poll(() => state().unsaved).toBe(4);
    expect(state().endCard).toBe(false);
    await seekTo(video, 3.8);
    await video.play();
    await expect.poll(() => state().endCard, { timeout: 5000 }).toBe(true);

    session.app.saveAll("learning");
    await expect
      .poll(() => state().done)
      .toEqual({
        count: 4,
        target: "learning",
      });
    expect(state().unsaved).toBe(0);
    expect(state().spans[0]!.find((s) => s.key === "tangy")?.category).toBe(
      "learning",
    );

    session.app.undoSaveAll();
    await expect.poll(() => state().done).toBeNull();
    expect(state().unsaved).toBe(4);

    session.app.closeEndCard();
    expect(state().endCard).toBe(false);
  });

  it("ignores the end of an ad", async () => {
    const { state, video, site } = await start();
    await ready(state);
    site.setAd(true);
    video.dispatchEvent(new Event("ended"));
    expect(state().endCard).toBe(false);
  });
});

const saveTangy = (bg: ReturnType<typeof testBackground>) =>
  bg.send({
    type: "saveTerm",
    lang: "en",
    key: "tangy",
    display: "tangy",
    kind: "word",
    status: "learning",
    source: {
      platform: "web",
      url: "https://example.com/",
      title: "",
      lang: "en",
    },
    sentence: "A tangy sauce.",
    pos: { textQuote: "A tangy sauce." },
  });

describe("occurrences", () => {
  it("records saved words of the cues that play, with the time and the translation shown", async () => {
    const { state, bg, video } = await start(undefined, { before: saveTangy });
    await ready(state);
    const items = () => bg.sent("recordEncounters").flatMap((r) => r.items);
    await expect.poll(items).toEqual([
      {
        termId: termId("en", "tangy"),
        sentence: "The yeast smells tangy.",
        translation: "イーストはぴりっとした匂い。",
        pos: { timeMs: 0 },
      },
    ]);
    expect(bg.sent("recordEncounters")[0]?.source).toEqual({
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=vid1",
      title: "Title of vid1",
      lang: "en",
    });

    // A cue without saved words records nothing; lines are joined.
    await seekTo(video, 1.2);
    await seekTo(video, 2.8);
    await expect.poll(() => items().length).toBe(2);
    expect(items()[1]).toEqual({
      termId: termId("en", "tangy"),
      sentence: "It is a tangy loaf.",
      translation: "ぴりっとしたパンだ。",
      pos: { timeMs: 2500 },
    });

    // Each line once per video.
    await seekTo(video, 0.5);
    await expect.poll(() => state().current).toBe(0);
    expect(items()).toHaveLength(2);

    const lookup = await bg.send({
      type: "lookup",
      lang: "en",
      key: "tangy",
      kind: "word",
      sourceUrl: "https://www.youtube.com/watch?v=vid1",
    });
    expect(lookup.here.map((o) => o.pos)).toEqual([
      { timeMs: 2500 },
      { timeMs: 0 },
    ]);
  });

  it("records nothing for cues that have not played", async () => {
    const { state, bg } = await start(undefined, { before: saveTangy });
    await ready(state);
    await expect.poll(() => state().spans.every((s) => s !== null)).toBe(true);
    await expect.poll(() => bg.sent("recordEncounters").length).toBe(1);
    expect(
      bg.sent("recordEncounters").flatMap((r) => r.items.map((i) => i.pos)),
    ).toEqual([{ timeMs: 0 }]);
  });
});

describe("sentence history", () => {
  const kept = (bg: ReturnType<typeof testBackground>) =>
    bg.sent("recordHistory").flatMap((r) => r.sentences);

  it("sends the cards that play, once each, with the time and the translation", async () => {
    const { state, bg, video } = await start();
    await ready(state);
    await expect
      .poll(() => kept(bg))
      .toEqual([
        {
          text: "The yeast smells tangy.",
          translation: "イーストはぴりっとした匂い。",
          pos: { timeMs: 0 },
        },
      ]);
    expect(bg.sent("recordHistory")[0]?.source).toEqual({
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=vid1",
      title: "Title of vid1",
      lang: "en",
    });

    // Skipped over the second card: only the cards that play, lines joined.
    await seekTo(video, 2.8);
    await expect.poll(() => kept(bg).length).toBe(2);
    expect(kept(bg)[1]).toEqual({
      text: "It is a tangy loaf.",
      translation: "ぴりっとしたパンだ。",
      pos: { timeMs: 2500 },
    });

    // Each card once per video.
    await seekTo(video, 0.5);
    await expect.poll(() => state().current).toBe(0);
    await seekTo(video, 2.9);
    await expect.poll(() => state().current).toBe(2);
    expect(kept(bg)).toHaveLength(2);
    expect(kept(bg).map((k) => k.text)).not.toContain("Knead the dough.");
    await expect
      .poll(async () => (await bg.send({ type: "historyStatus" })).pages)
      .toBe(1);
  });

  it("sends the built-in translation once it is ready", async () => {
    const { state, bg } = await start(
      { vid1: captionsOf(CUES, { source: "builtIn", lang: "ja", cues: [] }) },
      {
        translatorAvailable: true,
        translator: { translate: async (text) => `ja(${text})` },
      },
    );
    await ready(state);
    await expect
      .poll(() => kept(bg))
      .toEqual([
        {
          text: "The yeast smells tangy.",
          translation: "ja(The yeast smells tangy.)",
          pos: { timeMs: 0 },
        },
      ]);
  });

  it("sends nothing while it is switched off", async () => {
    const { state, bg } = await start(undefined, {
      before: saveTangy,
      settings: { sentenceHistory: false },
    });
    await ready(state);
    await expect.poll(() => bg.sent("recordEncounters").length).toBe(1);
    expect(bg.sent("recordHistory")).toEqual([]);
  });
});

describe("the built-in translator", () => {
  it("translates the cues as they play", async () => {
    const translated: string[] = [];
    const { state, video } = await start(
      { vid1: captionsOf(CUES, { source: "builtIn", lang: "ja", cues: [] }) },
      {
        translatorAvailable: true,
        translator: {
          async translate(text) {
            translated.push(text);
            return `ja(${text})`;
          },
        },
      },
    );
    await ready(state);
    expect(state().translationSource).toBe("builtIn");
    await expect
      .poll(() => state().subtitleTranslation)
      .toBe("ja(The yeast smells tangy.)");
    expect(state().translations[0]).toBe("ja(The yeast smells tangy.)");
    await seekTo(video, 2.8);
    await expect
      .poll(() => state().subtitleTranslation)
      .toBe("ja(It is a tangy loaf.)");
    expect(translated).not.toContain(CUES[1]!.text);
  });
});

describe("on and off", () => {
  it("off shows the site's captions and stops following; on resumes", async () => {
    const { state, video, site, session } = await start();
    await ready(state);
    await expect.poll(() => state().current).toBe(0);

    session.app.setEnabled(false);
    expect(state()).toMatchObject({ enabled: false, current: -1 });
    expect(site.log.hidden.at(-1)).toBe(false);
    await seekTo(video, 1.2);
    expect(state().current).toBe(-1);

    session.app.setEnabled(true);
    expect(site.log.hidden.at(-1)).toBe(true);
    await expect.poll(() => state().current).toBe(1);
  });

  it("seeks to a card", async () => {
    const { state, site, session } = await start();
    await ready(state);
    session.app.seekToCue(2);
    expect(site.log.seeks).toEqual([2500]);
    await expect.poll(() => state().current).toBe(2);
  });

  it("follows nothing while an ad plays", async () => {
    const { state, video, site } = await start();
    await ready(state);
    await expect.poll(() => state().current).toBe(0);
    site.setAd(true);
    await seekTo(video, 1.2);
    await expect.poll(() => state().current).toBe(-1);
    site.setAd(false);
    await seekTo(video, 1.3);
    await expect.poll(() => state().current).toBe(1);
  });
});

describe("navigation", () => {
  const OTHER: Cue[] = [{ startMs: 0, endMs: 4000, text: "A new loaf." }];

  it("starts over for the next video", async () => {
    const { state, video, site, session, bg } = await start(
      {
        vid1: captionsOf(CUES),
        vid2: captionsOf(OTHER, { source: "none", lang: "ja", cues: [] }),
      },
      { before: saveTangy },
    );
    await ready(state);
    await seekTo(video, 3.8);
    await video.play();
    await expect.poll(() => state().endCard, { timeout: 5000 }).toBe(true);
    session.app.setEnabled(false);

    site.navigate("vid2");
    expect(state()).toMatchObject({
      videoId: "vid2",
      status: "loading",
      enabled: true,
      endCard: false,
      cues: [],
    });
    await ready(state);
    expect(state().cues).toEqual(OTHER);
    expect(state().translationSource).toBe("none");
    await seekTo(video, 0.5);
    await expect.poll(() => state().current).toBe(0);
    expect(site.log.hidden.at(-1)).toBe(true);
    // Encounters of vid1 stay with vid1.
    expect(
      bg.sent("recordEncounters").every((r) => r.source.url.endsWith("vid1")),
    ).toBe(true);
  });

  it("does nothing on pages without a video, and gives back the site's captions", async () => {
    const { state, site } = await start();
    await ready(state);
    site.navigate(undefined);
    expect(state()).toMatchObject({ videoId: null, status: "idle", cues: [] });
    expect(site.log.hidden.at(-1)).toBe(false);
  });

  it("keeps the session when the site navigates within the same video", async () => {
    const { state, site } = await start();
    await ready(state);
    site.navigate("vid1");
    expect(state().status).toBe("ready");
    expect(site.log.loads).toBe(1);
  });
});

describe("a video without subtitles in the learning language", () => {
  it("is unavailable and leaves the site's captions alone", async () => {
    const { state, site } = await start({ vid1: undefined });
    await expect.poll(() => state().status).toBe("unavailable");
    expect(site.log.hidden).toEqual([]);
  });
});

describe("the transcript card", () => {
  it("stays on the line that started last, also in the gap after it", async () => {
    const { state, video } = await start();
    await ready(state);
    await expect.poll(() => state().card).toBe(0);
    await seekTo(video, 2.2);
    await expect.poll(() => state().current).toBe(-1);
    expect(state().card).toBe(1);
    await seekTo(video, 2.8);
    await expect.poll(() => state().card).toBe(2);
  });

  it("is -1 while Lingo is off", async () => {
    const { state, app } = await start();
    await ready(state);
    await expect.poll(() => state().card).toBe(0);
    app.setEnabled(false);
    expect(state().card).toBe(-1);
  });
});

/** The span of `key` in cue `cue`. */
function refOf(state: () => VideoState, cue: number, key: string) {
  const spans = state().spans[cue] ?? [];
  const span = spans.findIndex((s) => s.key === key);
  if (span < 0) throw new Error(`${key} not in cue ${cue}`);
  return { cue, span };
}

// Classifying every cue can take seconds on slow CI runners (Firefox on Windows).
const classified = (state: () => VideoState) =>
  expect
    .poll(() => state().spans.every((s) => s !== null), { timeout: 10_000 })
    .toBe(true);

const BOX = { left: 10, top: 20, right: 60, bottom: 40 };

describe("words in the subtitles", () => {
  it("shows a word's card after the pointer rests on it, and hides it after it leaves", async () => {
    const { state, app } = await start();
    await ready(state);
    await classified(state);
    app.enterWord(refOf(state, 0, "tangy"), BOX);
    expect(state().hover).toBeNull();
    await expect.poll(() => state().hover?.card.head).toBe("tangy");
    expect(state().hover).toMatchObject({
      anchor: BOX,
      card: { status: "new", short: "ぴりっとした、酸味のある" },
    });
    app.leaveWord();
    await expect.poll(() => state().hover).toBeNull();
  });

  it("shows the card of a word known by its frequency, as known but not saved", async () => {
    const { state, app } = await start();
    await ready(state);
    await classified(state);
    const ref = refOf(state, 0, "the");
    expect(state().spans[0]![ref.span]!.category).toBe("known");
    app.enterWord(ref, BOX);
    await expect.poll(() => state().hover?.card.head).toBe("the");
    expect(state().hover?.card).toMatchObject({
      status: "new",
      knownByLevel: true,
    });
  });

  it("hides the card when its line ends, unless the pointer is on the card", async () => {
    const { state, app, video } = await start();
    await ready(state);
    await classified(state);
    await expect.poll(() => state().current).toBe(0);
    app.enterWord(refOf(state, 0, "tangy"), BOX);
    await expect.poll(() => state().hover).not.toBeNull();
    await seekTo(video, 1.2);
    await expect.poll(() => state().hover).toBeNull();

    app.enterWord(refOf(state, 1, "knead"), BOX);
    await expect.poll(() => state().hover).not.toBeNull();
    app.keepHover();
    await seekTo(video, 2.8);
    expect(state().hover?.card.head).toBe("knead");
  });

  it("a click opens the dictionary window with the term's lines in this video", async () => {
    const { state, app } = await start();
    await ready(state);
    await classified(state);
    const ref = refOf(state, 0, "tangy");
    app.clickWord(ref);
    await expect.poll(() => state().panel?.card.head).toBe("tangy");
    expect(state().panel).toMatchObject({
      ref,
      here: [
        { cue: 0, timeMs: 0, text: "The yeast smells tangy." },
        { cue: 2, timeMs: 2500, text: "It is a tangy loaf." },
      ],
    });
    expect(state().panel!.dictionaries.map((d) => d.label)).toEqual([
      "Cambridge",
      "Wiktionary",
      "Reverso",
      "WordReference",
    ]);
    app.closePanel();
    expect(state().panel).toBeNull();
  });

  it("saves a word from the window with the line, its time and the translation shown", async () => {
    const { state, app, bg } = await start();
    await ready(state);
    await classified(state);
    expect(state().unsaved).toBe(4);
    app.clickWord(refOf(state, 0, "tangy"));
    await expect.poll(() => state().panel?.card.status).toBe("new");
    app.setPanelStatus("learning");
    await expect.poll(() => state().panel?.card.status).toBe("learning");
    expect(bg.sent("saveTerm")).toEqual([
      expect.objectContaining({
        key: "tangy",
        display: "tangy",
        kind: "word",
        status: "learning",
        sentence: "The yeast smells tangy.",
        translation: "イーストはぴりっとした匂い。",
        pos: { timeMs: 0 },
        source: {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=vid1",
          title: "Title of vid1",
          lang: "en",
        },
      }),
    ]);
    // Both lines with the word change at once.
    const category = (cue: number) =>
      state().spans[cue]!.find((s) => s.key === "tangy")?.category;
    expect([category(0), category(2)]).toEqual(["learning", "learning"]);
    expect(state().unsaved).toBe(3);

    app.setPanelStatus("known");
    await expect.poll(() => category(2)).toBe("known");
    expect(bg.sent("setStatus")).toHaveLength(1);

    app.setPanelStatus("new");
    await expect.poll(() => category(0)).toBe("new");
    expect(bg.sent("removeTerm")).toHaveLength(1);
    await expect.poll(() => state().panel?.card.status).toBe("new");
    expect(state().unsaved).toBe(4);
  });

  it("does not record the line the word was saved from again", async () => {
    const { state, app, bg, video } = await start();
    await ready(state);
    await classified(state);
    await expect.poll(() => state().current).toBe(0);
    app.clickWord(refOf(state, 0, "tangy"));
    await expect.poll(() => state().panel).not.toBeNull();
    app.setPanelStatus("learning");
    await expect.poll(() => state().panel?.card.status).toBe("learning");
    await seekTo(video, 2.8);
    const items = () => bg.sent("recordEncounters").flatMap((r) => r.items);
    await expect
      .poll(() => items().map((i) => i.pos))
      .toEqual([{ timeMs: 2500 }]);
  });

  it("the hover card's buttons save the word", async () => {
    const { state, app, bg } = await start();
    await ready(state);
    await classified(state);
    app.enterWord(refOf(state, 1, "knead"), BOX);
    await expect.poll(() => state().hover?.card.head).toBe("knead");
    app.setHoverStatus("known");
    await expect.poll(() => state().hover?.card.status).toBe("known");
    expect(bg.sent("saveTerm")[0]).toMatchObject({
      key: "knead",
      status: "known",
      sentence: "Knead the dough.",
      pos: { timeMs: 1000 },
    });
    expect(bg.sent("saveTerm")[0]).not.toHaveProperty("translation");
  });

  it("seeks to a line of the window", async () => {
    const { app, site } = await start();
    app.seekTo(2500);
    expect(site.log.seeks).toEqual([2500]);
  });
});

describe("settings from the video UI", () => {
  it("toggles a highlight category and saves it", async () => {
    const { state, app, bg } = await start();
    await ready(state);
    app.toggleHighlight("known");
    expect(state().settings.highlight).toEqual({
      new: true,
      learning: true,
      known: true,
    });
    await expect.poll(() => bg.settings().highlight.known).toBe(true);
  });

  it("changes the subtitle position and the translation switches", async () => {
    const { state, app, bg } = await start();
    await ready(state);
    app.changeSettings({
      subtitlePosition: "belowVideo",
      transcriptTranslation: false,
    });
    expect(state().settings).toMatchObject({
      subtitlePosition: "belowVideo",
      transcriptTranslation: false,
      subtitleTranslation: true,
    });
    await expect.poll(() => bg.settings().subtitlePosition).toBe("belowVideo");
    expect(bg.settings().transcriptTranslation).toBe(false);
  });

  it("opens the options page", async () => {
    const { app, bg } = await start();
    app.openSettings();
    await expect.poll(() => bg.optionsOpened()).toBe(1);
  });

  it("opens and closes the menu", async () => {
    const { state, app } = await start();
    expect(state().menuOpen).toBe(false);
    app.setMenuOpen(true);
    expect(state().menuOpen).toBe(true);
    app.setMenuOpen(false);
    expect(state().menuOpen).toBe(false);
  });
});

describe("where Lingo runs", () => {
  it("not on a site in Never run on", async () => {
    const { state, site } = await start(undefined, {
      settings: { neverRunOn: ["youtube.com"] },
    });
    expect(state().status).toBe("idle");
    expect(site.log.loads).toBe(0);
  });

  it("not on a site switched off in the popup, and again once it is back on", async () => {
    const { state, site, changeSettings } = await start(undefined, {
      settings: { disabledSites: ["www.youtube.com"] },
    });
    expect(state().status).toBe("idle");
    await changeSettings({ type: "setSettings", patch: { disabledSites: [] } });
    await ready(state);
    expect(site.log.loads).toBe(1);
    await changeSettings({
      type: "setSettings",
      patch: { sites: { youtube: false } },
    });
    expect(state().status).toBe("idle");
    expect(site.log.hidden.at(-1)).toBe(false);
  });
});

describe("fullscreen", () => {
  it("gives the site's captions back in fullscreen", async () => {
    const { state, app, site } = await start();
    await ready(state);
    expect(site.log.hidden).toEqual([true]);
    app.setFullscreen(true);
    expect(state().fullscreen).toBe(true);
    expect(site.log.hidden.at(-1)).toBe(false);
    app.setFullscreen(false);
    expect(site.log.hidden.at(-1)).toBe(true);
  });
});

describe("the popup's requests", () => {
  it("answers for the video: unsaved words, save all and undo", async () => {
    const { state, session } = await start();
    await ready(state);
    await classified(state);
    expect(await session.handlePageRequest({ type: "pageSummary" })).toEqual({
      supported: true,
      hostname: "www.youtube.com",
      scope: "video",
      unsaved: 4,
      done: null,
    });
    expect(
      await session.handlePageRequest({
        type: "pageSaveAll",
        status: "learning",
      }),
    ).toEqual({
      supported: true,
      hostname: "www.youtube.com",
      scope: "video",
      unsaved: 0,
      done: { count: 4, target: "learning" },
    });
    expect(await session.handlePageRequest({ type: "pageUndo" })).toEqual({
      supported: true,
      hostname: "www.youtube.com",
      scope: "video",
      unsaved: 4,
      done: null,
    });
  });

  it("is not supported without subtitles", async () => {
    const { state, session } = await start({ vid1: undefined });
    await expect.poll(() => state().status).toBe("unavailable");
    expect(await session.handlePageRequest({ type: "pageSummary" })).toEqual({
      supported: false,
      hostname: "www.youtube.com",
      scope: "video",
      unsaved: 0,
      done: null,
    });
  });
});
