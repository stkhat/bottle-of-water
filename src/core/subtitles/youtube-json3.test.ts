import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseYouTubeJson3, youtubeCaptionInfo } from "./youtube-json3";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), "utf8");

describe("parseYouTubeJson3", () => {
  it("turns each manual event into a cue", () => {
    const cues = parseYouTubeJson3(fixture("en.json3"));
    expect(cues).toHaveLength(40);
    expect(cues[0]).toEqual({
      startMs: 27103,
      endMs: 29678,
      text: "Good morning. How are you?",
    });
  });

  it("keeps line breaks inside a cue", () => {
    const cues = parseYouTubeJson3(fixture("en.json3"));
    expect(cues[6]?.text).toBe(
      "There have been three themes\nrunning through the conference,",
    );
  });

  it("parses the Japanese track with its own timing", () => {
    const cues = parseYouTubeJson3(fixture("ja.json3"));
    expect(cues[0]).toEqual({
      startMs: 0,
      endMs: 7000,
      text: "翻訳: Naho Iguchi\n校正: Miwa Nakamura",
    });
    expect(cues[1]?.startMs).toBe(25000);
  });

  it("drops empty lines, empty events and zero-width spaces from translations", () => {
    const cues = parseYouTubeJson3(fixture("en-tlang-ja.json3"));
    expect(cues.find((c) => c.startMs === 43096)?.text).toBe("会議には、");
    expect(cues.find((c) => c.startMs === 48997)?.text).toBe(
      "一つは、これまで行ってきた",
    );
    // An event whose only text is "\n" makes no cue
    expect(cues.find((c) => c.startMs === 63325)).toBeUndefined();
    expect(cues.find((c) => c.startMs === 89690)?.text).toBe(
      "教育関係の仕事をしている人は、そんなことを聞かれることは\nないんです。",
    );
  });

  it("joins ASR word segments and keeps their times", () => {
    const cues = parseYouTubeJson3(fixture("en-asr.json3"));
    const cue = cues.find((c) => c.startMs === 28400);
    expect(cue?.text).toBe("how are you it's been great hasn't it");
    expect(cue?.endMs).toBe(34640);
    expect(cue?.words?.slice(0, 3)).toEqual([
      { startMs: 28400, text: "how" },
      { startMs: 28640, text: " are" },
      { startMs: 28840, text: " you" },
    ]);
  });

  it("skips the ASR window event and the appended line breaks", () => {
    const cues = parseYouTubeJson3(fixture("en-asr.json3"));
    expect(cues[0]?.text).toBe("[Music]");
    expect(cues.some((c) => c.text.trim() === "")).toBe(false);
    expect(cues.map((c) => c.startMs)).toEqual(
      [...cues.map((c) => c.startMs)].sort((a, b) => a - b),
    );
  });

  it("ends a cue without a duration where the next cue starts", () => {
    const cues = parseYouTubeJson3({
      events: [
        { tStartMs: 1000, segs: [{ utf8: "one" }] },
        { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: "two" }] },
      ],
    });
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2500 });
  });

  it("gives the last cue without a duration a short default", () => {
    const cues = parseYouTubeJson3({
      events: [{ tStartMs: 1000, segs: [{ utf8: "last" }] }],
    });
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 4000 });
  });

  it("adds appended text to the cue before it", () => {
    const cues = parseYouTubeJson3({
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "first line" }] },
        { tStartMs: 1000, aAppend: 1, segs: [{ utf8: "\nsecond line" }] },
      ],
    });
    expect(cues).toEqual([
      { startMs: 0, endMs: 2000, text: "first line\nsecond line" },
    ]);
  });

  it("returns no cues for an empty body or a body without events", () => {
    expect(parseYouTubeJson3("")).toEqual([]);
    expect(parseYouTubeJson3("{}")).toEqual([]);
  });
});

describe("youtubeCaptionInfo", () => {
  const response = JSON.parse(fixture("captionTracks.json")) as unknown;

  it("lists the tracks with their kind and label", () => {
    const info = youtubeCaptionInfo(response);
    expect(info.tracks.map((t) => [t.id, t.lang, t.kind, t.label])).toEqual([
      [".en", "en", "manual", "English"],
      ["a.en", "en", "asr", "English (auto-generated)"],
      [".ja", "ja", "manual", "Japanese"],
      [".es", "es", "manual", "Spanish"],
    ]);
    expect(info.tracks[0]?.translatable).toBe(true);
    expect(info.tracks[0]?.baseUrl).toContain("/api/timedtext?");
  });

  it("lists the auto-translation languages", () => {
    expect(youtubeCaptionInfo(response).translationLanguages).toEqual([
      "en",
      "ja",
      "es",
    ]);
  });

  it("returns empty lists when the video has no captions", () => {
    expect(youtubeCaptionInfo({ videoDetails: {} })).toEqual({
      tracks: [],
      translationLanguages: [],
    });
    expect(youtubeCaptionInfo(null)).toEqual({
      tracks: [],
      translationLanguages: [],
    });
  });
});
