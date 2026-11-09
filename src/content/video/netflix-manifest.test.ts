import { describe, expect, it } from "vitest";
import manifest from "../../core/subtitles/fixtures/netflix/manifest.json";
import {
  pickOriginalTrack,
  readManifest,
  translationTracks,
  type NetflixTextTrack,
} from "./netflix-manifest";

const CDN1 =
  "https://ipv4-c001-test001-ix.1.oca.nflxvideo.net/?o=1&v=5&e=1762800000";
const CDN2 =
  "https://ipv4-c002-test002-ix.1.oca.nflxvideo.net/?o=1&v=5&e=1762800000";

describe("readManifest", () => {
  it("reads the text tracks of a manifest", () => {
    expect(readManifest(manifest)).toEqual({
      movieId: "80000001",
      tracks: [
        {
          id: "T:1:1;1;en;1;0;",
          lang: "en",
          label: "English [CC]",
          kind: "closedcaptions",
          forced: false,
          // TTML first, then WebVTT; image subtitles are left out.
          downloads: [
            {
              format: "dfxp-ls-sdh",
              urls: [
                `${CDN1}&t=SYNTHETIC-en-dfxp`,
                `${CDN2}&t=SYNTHETIC-en-dfxp`,
              ],
            },
            {
              format: "webvtt-lssdh-ios8",
              urls: [`${CDN1}&t=SYNTHETIC-en-vtt`],
            },
          ],
        },
        {
          id: "T:1:0;1;en;0;1;",
          lang: "en",
          label: "English (forced narrative)",
          kind: "subtitles",
          forced: true,
          downloads: [
            {
              format: "dfxp-ls-sdh",
              urls: [`${CDN1}&t=SYNTHETIC-en-forced`],
            },
          ],
        },
        {
          id: "T:1:0;1;ja;0;0;",
          lang: "ja",
          label: "Japanese",
          kind: "subtitles",
          forced: false,
          downloads: [
            {
              format: "webvtt-lssdh-ios8",
              urls: [`${CDN1}&t=SYNTHETIC-ja-vtt`],
            },
          ],
        },
        {
          id: "T:1:0;1;es;0;0;",
          lang: "es",
          label: "Spanish",
          kind: "subtitles",
          forced: false,
          // The older shape: a map of CDN id to URL.
          downloads: [
            {
              format: "simplesdh",
              urls: [`${CDN1}&t=SYNTHETIC-es-simplesdh`],
            },
          ],
        },
        // Traditional Chinese has only image subtitles, "Off" is the none track.
      ],
    });
  });

  it("reads a manifest without the result wrapper, by viewableId", () => {
    const read = readManifest({
      ...manifest.result,
      movieId: undefined,
      viewableId: "80000002",
    });
    expect(read?.movieId).toBe("80000002");
    expect(read?.tracks.map((t) => t.lang)).toEqual(["en", "en", "ja", "es"]);
  });

  it("takes the track type from trackType when rawTrackType is missing", () => {
    const track = {
      language: "en",
      trackType: "ASSISTIVE",
      ttDownloadables: { "dfxp-ls-sdh": { urls: [{ url: "https://x/1" }] } },
    };
    expect(
      readManifest({ movieId: 1, timedtexttracks: [track] })?.tracks[0],
    ).toMatchObject({ kind: "closedcaptions", id: "en-0", label: "en" });
  });

  it("ignores everything that is not a manifest", () => {
    for (const value of [
      null,
      1,
      "text",
      [],
      {},
      { result: {} },
      { result: { movieId: 1 } },
      { result: { timedtexttracks: [] } },
      { movieId: 1, timedtexttracks: "no" },
      { movieId: {}, timedtexttracks: [] },
    ])
      expect(readManifest(value)).toBeUndefined();
  });

  it("skips malformed tracks and URLs", () => {
    const read = readManifest({
      movieId: 7,
      timedtexttracks: [
        null,
        { language: 5 },
        { language: "en", ttDownloadables: null },
        {
          language: "en",
          ttDownloadables: {
            "dfxp-ls-sdh": { urls: [{ url: "javascript:alert(1)" }, {}, 3] },
            "webvtt-lssdh-ios8": { urls: [{ url: "https://cdn/ok" }] },
            "unknown-format": { urls: [{ url: "https://cdn/unknown" }] },
          },
        },
      ],
    });
    expect(read).toEqual({
      movieId: "7",
      tracks: [
        expect.objectContaining({
          lang: "en",
          downloads: [
            { format: "webvtt-lssdh-ios8", urls: ["https://cdn/ok"] },
          ],
        }),
      ],
    });
  });
});

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
    expect(pickOriginalTrack(tracks, "en")?.id).toBe("T:1:1;1;en;1;0;");
    expect(pickOriginalTrack(tracks, "es")?.id).toBe("T:1:0;1;es;0;0;");
    expect(pickOriginalTrack(tracks, "fr")).toBeUndefined();
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
      { id: "T:1:0;1;es;0;0;", lang: "es", kind: "manual", label: "Spanish" },
    ]);
    const jaCc = track({ id: "ja-cc", lang: "ja", kind: "closedcaptions" });
    const ja = track({ id: "ja", lang: "ja" });
    expect(translationTracks([jaCc, ja], original).map((t) => t.id)).toEqual([
      "ja",
      "ja-cc",
    ]);
  });
});
