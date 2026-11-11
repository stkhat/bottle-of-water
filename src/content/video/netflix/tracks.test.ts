import { describe, expect, it } from "vitest";
import manifest from "../../../core/subtitles/fixtures/netflix/manifest.json";
import { readManifest, type NetflixTextTrack } from "./manifest";
import { pickOriginalTrack, translationTracks } from "./tracks";

const track = (patch: Partial<NetflixTextTrack>): NetflixTextTrack => ({
  id: `${patch.lang}-${patch.kind ?? "subtitles"}`,
  lang: "en",
  label: "",
  kind: "subtitles",
  forced: false,
  downloads: [{ format: "dfxp-ls-sdh", urls: ["https://cdn/x"] }],
  ...patch,
});

describe("pickOriginalTrack", () => {
  const tracks = readManifest(manifest)!.tracks;

  it("takes the learning language's track that is not forced", () => {
    // English comes only as closed captions besides the forced track.
    expect(pickOriginalTrack(tracks, "en")?.id).toBe("T:1:1;1;en;1;0;");
    expect(pickOriginalTrack(tracks, "ja")?.id).toBe("T:1:0;1;ja;0;0;");
    expect(pickOriginalTrack(tracks, "fr")).toBeUndefined();
    expect(pickOriginalTrack(tracks, "zh-Hant")).toBeUndefined();
  });

  it("prefers subtitles to closed captions, then the exact language", () => {
    const cc = track({ lang: "en", kind: "closedcaptions" });
    const gb = track({ lang: "en-GB" });
    const en = track({ lang: "en" });
    expect(pickOriginalTrack([cc, gb, en], "en")).toBe(en);
    expect(pickOriginalTrack([cc, gb], "en")).toBe(gb);
    expect(pickOriginalTrack([cc], "en-US")).toBe(cc);
  });
});

describe("translationTracks", () => {
  it("offers the other tracks that are not forced, subtitles first", () => {
    const tracks = readManifest(manifest)!.tracks;
    const original = pickOriginalTrack(tracks, "en")!;
    expect(translationTracks(tracks, original)).toEqual([
      { id: "T:1:0;1;ja;0;0;", lang: "ja", kind: "manual", label: "Japanese" },
    ]);
    const jaCc = track({ id: "ja-cc", lang: "ja", kind: "closedcaptions" });
    const ja = track({ id: "ja", lang: "ja" });
    expect(translationTracks([jaCc, ja], original).map((t) => t.id)).toEqual([
      "ja",
      "ja-cc",
    ]);
  });
});
