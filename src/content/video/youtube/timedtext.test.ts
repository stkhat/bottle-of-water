import { describe, expect, it } from "vitest";
import captionTracks from "../../../core/subtitles/fixtures/youtube/captionTracks.json";
import { youtubeCaptionInfo } from "../../../core/subtitles/youtube-json3";
import { autoTranslateCode, pickOriginalTrack, trackUrl } from "./timedtext";

const info = youtubeCaptionInfo(captionTracks);
const captured =
  "https://www.youtube.com/api/timedtext?v=abc&ei=E&caps=asr&lang=en&potc=1&pot=TOKEN&fmt=json3&xorb=2&c=WEB&cver=2.1";

describe("trackUrl", () => {
  const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

  it("keeps the token and client params and changes the language", () => {
    expect(params(trackUrl(captured, { lang: "ja", asr: false }))).toEqual({
      ...params(captured),
      lang: "ja",
    });
  });

  it("adds tlang and kind=asr, and removes them", () => {
    const asr = trackUrl(captured, { lang: "en", asr: true, tlang: "ja" });
    expect(params(asr)).toMatchObject({ lang: "en", kind: "asr", tlang: "ja" });
    const manual = trackUrl(asr, { lang: "en", asr: false });
    expect(params(manual)).not.toHaveProperty("kind");
    expect(params(manual)).not.toHaveProperty("tlang");
  });

  it("asks for json3", () => {
    const xml = captured.replace("&fmt=json3", "");
    expect(
      new URL(trackUrl(xml, { lang: "en", asr: false })).searchParams.get(
        "fmt",
      ),
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
