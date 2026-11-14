import { describe, expect, it } from "vitest";
import captionTracks from "../../../core/subtitles/fixtures/youtube/captionTracks.json";
import { youtubeCaptionInfo } from "../../../core/subtitles/youtube-json3";
import { autoTranslateCode, pickOriginalTrack, trackUrl } from "./timedtext";

const info = youtubeCaptionInfo(captionTracks);
const track = (id: string) => info.tracks.find((t) => t.id === id)!;
/** The player's request for the manual English track: its baseUrl plus a token and client params. */
const captured = `${track(".en").baseUrl}&potc=1&pot=TOKEN&fmt=json3&xorb=2&c=WEB&cver=2.1`;
const ADDED = { potc: "1", pot: "TOKEN", xorb: "2", c: "WEB", cver: "2.1" };

describe("trackUrl", () => {
  const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
  const baseParams = (id: string) => params(track(id).baseUrl);

  it("is the track's baseUrl with the request's token and client params", () => {
    expect(
      params(trackUrl(captured, info.tracks, { track: track(".ja") })),
    ).toEqual({
      ...baseParams(".ja"),
      ...ADDED,
      fmt: "json3",
    });
  });

  it("asks for the auto-generated track and the auto-translation", () => {
    const asr = trackUrl(captured, info.tracks, {
      track: track("a.en"),
      tlang: "ja",
    });
    expect(params(asr)).toEqual({
      ...baseParams("a.en"),
      ...ADDED,
      fmt: "json3",
      tlang: "ja",
    });
    const manual = trackUrl(asr, info.tracks, { track: track(".en") });
    expect(params(manual)).not.toHaveProperty("kind");
    expect(params(manual)).not.toHaveProperty("tlang");
  });

  it("takes the variant from the track, never from the request of another track", () => {
    // Shorts (2026-11-14): each track names its own variant; another one's gets an empty body.
    const tracks = info.tracks.map((t) =>
      t.id === ".en"
        ? { ...t, baseUrl: `${t.baseUrl}&variant=gemini` }
        : t.id === ".ja"
          ? { ...t, baseUrl: `${t.baseUrl}&variant=timing-optimized` }
          : t,
    );
    const ja = tracks.find((t) => t.id === ".ja")!;
    const es = tracks.find((t) => t.id === ".es")!;
    const request = `${ja.baseUrl}&pot=TOKEN&fmt=json3`;
    const en = tracks.find((t) => t.id === ".en")!;
    expect(
      new URL(trackUrl(request, tracks, { track: en })).searchParams.get(
        "variant",
      ),
    ).toBe("gemini");
    expect(
      new URL(trackUrl(request, tracks, { track: es })).searchParams.has(
        "variant",
      ),
    ).toBe(false);
    // A request of a track the player response does not list: its own variant is left out too.
    const unknown = request.replace("lang=ja", "lang=fr");
    const url = new URL(trackUrl(unknown, tracks, { track: es }));
    expect(url.searchParams.has("variant")).toBe(false);
    expect(url.searchParams.get("pot")).toBe("TOKEN");
  });

  it("asks for json3", () => {
    const xml = captured.replace("&fmt=json3", "");
    expect(
      new URL(
        trackUrl(xml, info.tracks, { track: track(".en") }),
      ).searchParams.get("fmt"),
    ).toBe("json3");
  });
});

describe("pickOriginalTrack", () => {
  it("prefers the manual track in the learning language", () => {
    expect(pickOriginalTrack(info.tracks, "en")?.id).toBe(".en");
  });

  it("falls back to ASR, and matches regional codes by their language", () => {
    const asrOnly = info.tracks.filter((t) => t.id !== ".en");
    expect(pickOriginalTrack(asrOnly, "en")?.id).toBe("a.en");
    const regional = info.tracks.map((t) =>
      t.id === ".es" ? { ...t, lang: "es-419" } : t,
    );
    expect(pickOriginalTrack(regional, "es")?.lang).toBe("es-419");
  });

  it("finds nothing when the video has no track in the learning language", () => {
    expect(pickOriginalTrack(info.tracks, "fr")).toBeUndefined();
  });
});

describe("autoTranslateCode", () => {
  const en = pickOriginalTrack(info.tracks, "en")!;

  it("is the native language when YouTube can translate the track into it", () => {
    expect(autoTranslateCode(info, en, "ja")).toBe("ja");
    expect(autoTranslateCode(info, en, "ja-JP")).toBe("ja");
  });

  it("is undefined when the track or the language cannot be translated", () => {
    expect(autoTranslateCode(info, en, "ko")).toBeUndefined();
    expect(
      autoTranslateCode(info, { ...en, translatable: false }, "ja"),
    ).toBeUndefined();
  });
});
