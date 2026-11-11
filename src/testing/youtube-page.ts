// A trimmed YouTube watch page (the parts Lingo uses, as in
// e2e/fixtures/youtube-watch.html) with the fake player API on #movie_player.
import {
  installFakeYouTubePlayer,
  type FakePlayerLog,
} from "../../tests/fake-youtube-player";
import captionTracks from "../core/subtitles/fixtures/youtube/captionTracks.json";
import videoUrl from "../../tests/fixtures/video.webm?url";

export const VIDEO_ID = "iG9CE55wbtY";
export const TITLE = "Do schools kill creativity? | Sir Ken Robinson | TED";
const PLAYER_RESPONSE: unknown = captionTracks;

export interface TestPage {
  root: HTMLElement;
  player: HTMLElement & { fake: FakePlayerLog };
  video: HTMLVideoElement;
  captions: HTMLElement;
  /** Switches the fake player to another video and fires `yt-navigate-finish`. */
  navigate(next: {
    videoId: string;
    title: string;
    playerResponse: unknown;
  }): void;
  remove(): void;
}

function el(tag: string, attrs: Record<string, string>, ...children: Node[]) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs))
    element.setAttribute(name, value);
  element.append(...children);
  return element;
}

/** Builds the page skeleton and installs the fake player on it. */
export function createTestPage(
  options: { captionsOn?: boolean; playerResponse?: unknown } = {},
): TestPage {
  const video = el("video", {
    class: "video-stream html5-main-video",
    src: videoUrl,
    muted: "",
    playsinline: "",
  }) as HTMLVideoElement;
  video.muted = true;
  const captions = el("div", {
    id: "ytp-caption-window-container",
    class: "ytp-caption-window-container",
  });
  const player = el(
    "div",
    { id: "movie_player", class: "html5-video-player" },
    el("div", { class: "html5-video-container" }, video),
    captions,
    el(
      "div",
      { class: "ytp-chrome-bottom" },
      el(
        "div",
        { class: "ytp-chrome-controls" },
        el("div", { class: "ytp-left-controls" }),
        el(
          "div",
          { class: "ytp-right-controls" },
          el(
            "div",
            { class: "ytp-right-controls-left" },
            el("button", { class: "ytp-button ytp-settings-button" }),
          ),
          el("div", { class: "ytp-right-controls-right" }),
        ),
      ),
    ),
  );
  const root = el(
    "div",
    { id: "columns" },
    el(
      "div",
      { id: "primary" },
      el(
        "div",
        { id: "primary-inner" },
        el("div", { id: "player" }, player),
        el(
          "div",
          { id: "below" },
          el(
            "ytd-watch-metadata",
            {},
            el("h1", {}, document.createTextNode(TITLE)),
          ),
        ),
      ),
    ),
    el(
      "div",
      { id: "secondary" },
      el(
        "div",
        { id: "secondary-inner" },
        el("div", { id: "panels" }),
        el("div", { id: "related" }),
      ),
    ),
  );
  document.body.append(root);
  installFakeYouTubePlayer({
    videoId: VIDEO_ID,
    title: TITLE,
    playerResponse: options.playerResponse ?? PLAYER_RESPONSE,
    captionsOn: options.captionsOn,
  });
  const fake = player as TestPage["player"] & {
    fakeNavigate: TestPage["navigate"];
  };
  return {
    root,
    player: fake,
    video,
    captions,
    navigate: (next) => fake.fakeNavigate(next),
    remove: () => root.remove(),
  };
}
