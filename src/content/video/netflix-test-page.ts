// Test helper: a trimmed Netflix watch page (the parts Lingo uses, as in
// e2e/fixtures/netflix-watch.html) with the fake player API on `window.netflix`.
import {
  installFakeNetflixPlayer,
  type FakeNetflixControl,
  type FakeNetflixOptions,
} from "../../../e2e/fake-netflix-player";
import manifestJson from "../../core/subtitles/fixtures/netflix/manifest.json?raw";
import videoUrl from "../../../e2e/fixtures/video.webm?url";

export const MOVIE_ID = "80000001";
export const SHOW = "Lingo Test Show";
export const EPISODE = "Pilot";
export const METADATA = {
  title: SHOW,
  seasons: [
    { seq: 1, episodes: [{ id: Number(MOVIE_ID), seq: 1, title: EPISODE }] },
  ],
};

/** The synthetic manifest with its CDN URLs on the test server (see vitest.config.ts). */
export function testManifest(movieId = MOVIE_ID): string {
  return manifestJson
    .replace(
      /https:\/\/ipv4-c00\d-test00\d-ix\.1\.oca\.nflxvideo\.net\//g,
      `${location.origin}/lingo-nflx/`,
    )
    .replace('"movieId": 80000001', `"movieId": ${movieId}`);
}

export interface TestPage {
  root: HTMLElement;
  player: HTMLElement;
  video: HTMLVideoElement;
  captions: HTMLElement;
  /** The control bar; Netflix shows it only while the pointer moves. */
  controls: HTMLElement;
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

/** Builds the page skeleton and installs the fake player (it parses the manifest now). */
export function createTestPage(
  options: { manifest?: string; controls?: boolean } = {},
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
  const controls = el(
    "div",
    { class: "watch-video--bottom-controls-container" },
    el(
      "div",
      { "data-uia": "video-title" },
      el("h4", {}, text(SHOW)),
      el("span", {}, text("E1")),
      el("span", {}, text(EPISODE)),
    ),
    el(
      "div",
      { class: "control-slot" },
      el("button", {
        "data-uia": "control-audio-subtitle",
        "aria-label": "Audio & Subtitles",
      }),
    ),
    el(
      "div",
      { class: "control-slot" },
      el("button", {
        "data-uia": "control-fullscreen-enter",
        "aria-label": "Full screen",
      }),
    ),
  );
  const playerView = el(
    "div",
    {
      class: "watch-video--player-view",
      style: "position: relative; width: 640px; height: 360px;",
    },
    el(
      "div",
      { "data-uia": "player" },
      el("div", { "data-videoid": MOVIE_ID }, video),
      captions,
    ),
  );
  if (options.controls !== false) playerView.append(controls);
  const root = el(
    "div",
    { class: "watch-video", "data-uia": "watch-video" },
    playerView,
  );
  document.body.append(root);
  installFakeNetflixPlayer({
    movieId: MOVIE_ID,
    manifest: options.manifest ?? testManifest(),
    metadata: METADATA,
  });
  const fake = (window as unknown as { lingoFakeNetflix: FakeNetflixControl })
    .lingoFakeNetflix;
  return {
    root,
    player: playerView,
    video,
    captions,
    controls,
    showControls(on) {
      if (on) playerView.append(controls);
      else controls.remove();
    },
    fake,
    navigate: (next) => fake.navigate({ ...next, changeUrl: false }),
    remove() {
      root.remove();
      delete (window as unknown as Record<string, unknown>).netflix;
    },
  };
}
