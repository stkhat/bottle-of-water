// A trimmed YouTube watch page (the parts Lingo uses, as in
// e2e/fixtures/youtube-watch.html) with the fake player API on #movie_player, or a
// trimmed Short (docs/notes/youtube-shorts.md) with it on #shorts-player.
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
  /** A Short's buttons beside the video (`reel-action-bar-view-model`); null on a watch page. */
  actionBar: HTMLElement | null;
  /** A Short's comments panel (its `ytd-comments` inside); null on a watch page. */
  commentsPanel: HTMLElement | null;
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

/** Builds the page skeleton (a watch page, or a Short) and installs the fake player on it. */
export function createTestPage(
  options: {
    captionsOn?: boolean;
    playerResponse?: unknown;
    shorts?: boolean;
  } = {},
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
  if (options.shorts) return shortsPage(video, captions, options);
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
  return install(root, player, video, captions, options, {
    actionBar: null,
    commentsPanel: null,
  });
}

/** A Short: the player 405×720 with its own buttons on top, the action bar, the comments panel. */
function shortsPage(
  video: HTMLVideoElement,
  captions: HTMLElement,
  options: { captionsOn?: boolean; playerResponse?: unknown },
): TestPage {
  const player = el(
    "div",
    {
      id: "shorts-player",
      class: "html5-video-player ytp-hide-controls",
      style: "position: relative; width: 405px; height: 720px;",
    },
    el("div", { class: "html5-video-container" }, video),
    captions,
  );
  const actionBar = el(
    "reel-action-bar-view-model",
    { style: "display: flex; flex-direction: column; width: 48px;" },
    el("button", { "aria-label": "Comments" }),
  );
  const commentsPanel = el(
    "ytd-engagement-panel-section-list-renderer",
    {
      "target-id": "engagement-panel-comments-section",
      visibility: "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED",
      style: "display: block; width: 480px; height: 700px;",
    },
    el("ytd-comments", {}),
  );
  const root = el(
    "ytd-shorts",
    { style: "display: flex; gap: 12px; align-items: flex-end;" },
    el(
      "ytd-reel-video-renderer",
      { id: "reel-video-renderer", style: "display: flex; gap: 12px;" },
      el(
        "div",
        { id: "short-video-container", style: "position: relative;" },
        el(
          "ytd-player",
          { id: "player" },
          el("div", { id: "container" }, player),
        ),
        el(
          "ytd-shorts-player-controls",
          { style: "position: absolute; top: 16px; right: 16px;" },
          el(
            "div",
            { id: "right-controls", style: "display: flex; height: 48px;" },
            el(
              "div",
              { id: "closed-captioning-button-container" },
              el("button", { "aria-label": "Captions" }),
            ),
            el("div", { id: "menu-button" }),
          ),
        ),
        el(
          "yt-reel-metapanel-view-model",
          {},
          el(
            "yt-shorts-video-title-view-model",
            {},
            el("h1", {}, document.createTextNode(TITLE)),
          ),
        ),
      ),
      actionBar,
    ),
    el("div", { id: "anchored-panel" }, commentsPanel),
  );
  return install(
    root,
    player,
    video,
    captions,
    { ...options, playerId: "shorts-player" },
    { actionBar, commentsPanel },
  );
}

function install(
  root: HTMLElement,
  player: HTMLElement,
  video: HTMLVideoElement,
  captions: HTMLElement,
  options: {
    captionsOn?: boolean;
    playerResponse?: unknown;
    playerId?: string;
  },
  shorts: Pick<TestPage, "actionBar" | "commentsPanel">,
): TestPage {
  document.body.append(root);
  installFakeYouTubePlayer({
    videoId: VIDEO_ID,
    title: TITLE,
    playerResponse: options.playerResponse ?? PLAYER_RESPONSE,
    captionsOn: options.captionsOn,
    playerId: options.playerId,
  });
  const fake = player as TestPage["player"] & {
    fakeNavigate: TestPage["navigate"];
  };
  return {
    root,
    ...shorts,
    player: fake,
    video,
    captions,
    navigate: (next) => fake.fakeNavigate(next),
    remove: () => root.remove(),
  };
}
