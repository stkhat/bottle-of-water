// A trimmed Netflix watch page (the parts Lingo uses, as in
// e2e/fixtures/netflix-watch.html) with the fake player API on `window.netflix`.
import {
  FIXTURE_METADATA,
  installFakeNetflixPlayer,
  type FakeNetflixControl,
  type FakeNetflixOptions,
} from "../../tests/fake-netflix-player";
import manifest from "../core/subtitles/fixtures/netflix/manifest.json";
import videoUrl from "../../tests/fixtures/video.webm?url";

export const MOVIE_ID = "80000001";
export const METADATA = FIXTURE_METADATA;
export const SHOW = METADATA.title;
export const EPISODE = METADATA.seasons[0]!.episodes[0]!.title;

/**
 * The synthetic manifest's text with its CDN URLs on the test server (see
 * vitest.config.ts), for `movieId`, without the tracks whose JSON matches `drop`.
 * (Built without JSON.parse, which the page script watches.)
 */
export function testManifest(movieId = MOVIE_ID, drop?: RegExp): string {
  const copy = structuredClone(manifest);
  copy.result.textTracks = copy.result.textTracks.filter(
    (t) => !drop?.test(JSON.stringify(t)),
  );
  copy.result.movieId = Number(movieId);
  return JSON.stringify(copy).replace(
    /https:\/\/ipv4-c00\d-test00\d-ix\.1\.oca\.nflxvideo\.net\//g,
    `${location.origin}/lingo-nflx/`,
  );
}

export interface TestPage {
  root: HTMLElement;
  player: HTMLElement;
  video: HTMLVideoElement;
  captions: HTMLElement;
  /**
   * The control bar while it is shown. Netflix builds it while the pointer moves and
   * removes it when the pointer stops (here after `controlsIdleMs`).
   */
  controls(): HTMLElement | null;
  /** Builds a new control bar or removes it, as the pointer would. */
  showControls(on: boolean): void;
  fake: FakeNetflixControl;
  navigate(next: FakeNetflixOptions): void;
  remove(): void;
}

function el(tag: string, attrs: Record<string, string>, ...children: Node[]) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs))
    element.setAttribute(name, value);
  element.append(...children);
  return element;
}
const text = (value: string) => document.createTextNode(value);

/** The control bar's layout, as in e2e/fixtures/netflix-watch.html: a 96px row at the bottom. */
const BAR_CSS = `
.watch-video [data-uia="controls-standard"] { position: absolute; left: 0; right: 0; bottom: 0; }
.watch-video [data-uia="controls-standard"] > div > div > div:last-child { height: 96px; display: flex; align-items: center; gap: 16px; padding: 0 24px; }
.watch-video [data-uia="controls-standard"] > div > div > div:last-child > div { display: flex; align-items: center; }
.watch-video [data-uia="video-title"] { flex: 1; display: flex; gap: 8px; align-items: baseline; }
.watch-video [data-uia^="control-"] { width: 48px; height: 48px; }
`;

/** Builds the page skeleton and installs the fake player (it parses the manifest now). */
export function createTestPage(
  options: {
    manifest?: string;
    /** False: a page without a recognizable control bar. */
    controls?: boolean;
    /** Default: a minute, so the bar stays until the test removes it. */
    controlsIdleMs?: number;
  } = {},
): TestPage {
  const video = el("video", {
    src: videoUrl,
    playsinline: "",
  }) as HTMLVideoElement;
  video.muted = true;
  const captions = el(
    "div",
    { class: "player-timedtext" },
    el(
      "div",
      { class: "player-timedtext-text-container" },
      el("span", {}, text("Netflix's own subtitle")),
    ),
  );
  const playerView = el(
    "div",
    {
      class: "watch-video--player-view",
      // As on netflix.com: the player view fills .watch-video, which fills the window.
      style: "position: absolute; inset: 0;",
    },
    el(
      "div",
      { "data-uia": "player" },
      el("div", { "data-videoid": MOVIE_ID }, video),
      captions,
    ),
  );
  const root = el(
    "div",
    {
      class: "watch-video",
      "data-uia": "watch-video",
      style: "position: fixed; inset: 0; overflow: hidden;",
    },
    el("style", {}, text(BAR_CSS)),
    playerView,
  );
  document.body.append(root);
  installFakeNetflixPlayer({
    movieId: MOVIE_ID,
    manifest: options.manifest ?? testManifest(),
    metadata: METADATA,
    ...(options.controls === false
      ? {}
      : {
          controlBar: {
            idleMs: options.controlsIdleMs ?? 60_000,
            title: [SHOW, "E1", EPISODE],
          },
        }),
  });
  const fake = (window as unknown as { lingoFakeNetflix: FakeNetflixControl })
    .lingoFakeNetflix;
  if (options.controls !== false) fake.showControls(true);
  return {
    root,
    player: playerView,
    video,
    captions,
    controls: () => fake.controls(),
    showControls: (on) => fake.showControls(on),
    fake,
    navigate: (next) => fake.navigate({ ...next, changeUrl: false }),
    remove() {
      fake.showControls(false);
      root.remove();
      delete (window as unknown as Record<string, unknown>).netflix;
    },
  };
}
