import { describe, expect, it } from "vitest";
import manifest from "../../../core/subtitles/fixtures/netflix/manifest.json";
import legacy from "../../../core/subtitles/fixtures/netflix/manifest-legacy.json";
import { readManifest } from "./manifest";

const CDN1 =
  "https://ipv4-c001-test001-ix.1.oca.nflxvideo.net/?o=1&v=5&e=1762800000";
const CDN2 =
  "https://ipv4-c002-test002-ix.1.oca.nflxvideo.net/?o=1&v=5&e=1762800000";

describe("readManifest", () => {
  it("reads the text tracks of a manifest as netflix.com sends it", () => {
    expect(readManifest(manifest)).toEqual({
      movieId: "80000001",
      tracks: [
        {
          id: "T:1:1;1;en;1;0;",
          lang: "en",
          label: "English [CC]",
          kind: "closedcaptions",
          forced: false,
          // IMSC first, then DFXP; every CDN in turn.
          downloads: [
            {
              format: "imsc1.1",
              urls: [
                `${CDN1}&t=SYNTHETIC-en-imsc`,
                `${CDN2}&t=SYNTHETIC-en-imsc`,
              ],
            },
            {
              format: "dfxp-ls-sdh",
              urls: [`${CDN1}&t=SYNTHETIC-en-dfxp`],
            },
            {
              format: "simplesdh",
              urls: [`${CDN1}&t=SYNTHETIC-en-simplesdh`],
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
            { format: "imsc1.1", urls: [`${CDN1}&t=SYNTHETIC-en-forced`] },
          ],
        },
        {
          id: "T:1:0;1;ja;0;0;",
          lang: "ja",
          label: "Japanese",
          kind: "subtitles",
          forced: false,
          // Image subtitles are left out.
          downloads: [
            { format: "imsc1.1", urls: [`${CDN1}&t=SYNTHETIC-ja-imsc`] },
          ],
        },
        // Traditional Chinese has only image subtitles, "Off" is the none track.
      ],
    });
  });

  it("reads the older shape: timedtexttracks and ttDownloadables", () => {
    expect(readManifest(legacy)).toEqual({
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
      ],
    });
  });

  it("prefers IMSC, then DFXP, simple SDH and WebVTT", () => {
    const urls = (formats: string[]) =>
      Object.fromEntries(
        formats.map((f) => [f, { urls: [{ url: `https://cdn/${f}` }] }]),
      );
    const formats = [
      "webvtt-lssdh-ios8",
      "simplesdh",
      "dfxp-ls-sdh",
      "imsc1.1",
    ];
    const read = readManifest({
      movieId: 1,
      textTracks: [{ language: "en", downloadables: urls(formats) }],
    });
    expect(read?.tracks[0]?.downloads.map((d) => d.format)).toEqual([
      "imsc1.1",
      "dfxp-ls-sdh",
      "simplesdh",
      "webvtt-lssdh-ios8",
    ]);
  });

  it("drops tracks whose subtitles are not downloadable yet", () => {
    const read = readManifest({
      result: {
        movieId: 2,
        textTracks: [
          { language: "fr", hydrated: false, downloadables: {} },
          { language: "de", hydrated: false },
        ],
      },
    });
    expect(read).toEqual({ movieId: "2", tracks: [] });
  });

  it("reads a manifest without the result wrapper, by viewableId", () => {
    const read = readManifest({
      ...manifest.result,
      movieId: undefined,
      viewableId: "80000002",
    });
    expect(read?.movieId).toBe("80000002");
    expect(read?.tracks.map((t) => t.lang)).toEqual(["en", "en", "ja"]);
    expect(
      readManifest({ ...legacy.result, movieId: "80000003" })?.tracks.map(
        (t) => t.lang,
      ),
    ).toEqual(["en", "en", "ja", "es"]);
  });

  it("takes the track type from trackType when rawTrackType is missing", () => {
    const track = {
      language: "en",
      trackType: "ASSISTIVE",
      downloadables: { "imsc1.1": { urls: [{ url: "https://x/1" }] } },
    };
    expect(
      readManifest({ movieId: 1, textTracks: [track] })?.tracks[0],
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
      { result: { textTracks: [] } },
      { movieId: 1, textTracks: {} },
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
