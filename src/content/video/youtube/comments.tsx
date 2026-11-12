import { render } from "preact";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { hostBlocked, type Settings } from "../../../core/settings";
import {
  runArticle,
  type ArticleDeps,
  type ArticleRunner,
} from "../../article/article";
import { ArticleUi, type PanelFrame } from "../../article/ArticleUi";
import type { ArticleApp } from "../../article/state";
import { WHOLE_ROOT, type PageSurface } from "../../article/surface";
import type { LookupHooks } from "../../lookup/lookup";
import { createShadowHost } from "../../shadow-host";
import { contentDeps } from "../../wiring";
import type { PlatformAdapter } from "../platform";
import { isShortsUrl } from "./adapter";

/** A comment's text on a YouTube watch page (its replies' too). */
const COMMENT_TEXT = "#content-text";

/** The comment section under the video (not the hidden engagement-panel copy). */
const COMMENTS_ROOT = "ytd-comments#comments";

/**
 * A Short's comments panel beside the video (docs/notes/youtube-shorts.md). Inside
 * `ytd-shorts`: the watch page, which can stay in the DOM, has a hidden panel of its own.
 */
const SHORTS_COMMENTS_PANEL =
  'ytd-shorts ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]';
const SHORTS_COMMENTS_ROOT = `${SHORTS_COMMENTS_PANEL} ytd-comments`;

/** Mock `YouTube Shorts — comments`: the dictionary panel's width and its gap to the comments. */
const PANEL_WIDTH = 340;
const PANEL_GAP = 16;
/** Closest the panel comes to the viewport's left edge. */
const EDGE = 8;

/**
 * Where the dictionary panel goes beside a Short's comments panel (`comments`, its
 * viewport box): just left of it, as tall as it, so the comments stay readable.
 */
export function shortsPanelFrame(
  comments: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
): PanelFrame {
  return {
    top: Math.round(comments.top),
    right: Math.round(
      Math.min(
        viewport.width - comments.left + PANEL_GAP,
        viewport.width - PANEL_WIDTH - EDGE,
      ),
    ),
    bottom: Math.round(Math.max(0, viewport.height - comments.bottom)),
  };
}

/**
 * The panel's frame while a Short's comments panel shows, else null (top right). A
 * Short's page left hidden in the DOM has no size.
 */
function shortsFrame(): PanelFrame | null {
  const panel = document.querySelector(SHORTS_COMMENTS_PANEL);
  const box = panel?.getBoundingClientRect();
  if (!box || box.width === 0) return null;
  return shortsPanelFrame(box, {
    width: document.documentElement.clientWidth,
    height: innerHeight,
  });
}

/**
 * Whether Lingo runs in YouTube's comments: YouTube and its comments are switched on
 * and the host is not blocked. The player's L button does not matter.
 */
export const commentsAllowedOn = (hostname: string, settings: Settings) =>
  settings.sites.youtube &&
  settings.sites.youtubeComments &&
  !hostBlocked(hostname, settings);

/** True for text inside a comment's body, so names, times and buttons are never read. */
export const isCommentText = (node: Text) =>
  node.parentElement?.closest(COMMENT_TEXT) != null;

/** The comments of the current video, run like an article. */
export interface CommentsRunner {
  /** Closes the comments' dictionary panel, if it is open. */
  closePanel(): void;
  /** Classifies the comments again (after saved terms changed elsewhere on the page). */
  reanalyze(): Promise<void>;
  stop(): void;
}

export interface CommentsOptions {
  adapter: PlatformAdapter;
  /** Default `location.hostname`. */
  hostname?: string;
  /** Default `location.href`. */
  href?: () => string;
}

/**
 * The comment section as a page surface: only comment text is read, each comment's
 * language is detected on its own, everything read counts (there is no end to reach),
 * and the video is the source of what is saved and recorded.
 */
function commentsSurface({
  adapter,
  hostname,
}: Pick<Required<CommentsOptions>, "adapter" | "hostname">): PageSurface {
  return {
    allowed: (settings) => commentsAllowedOn(hostname, settings),
    qualifies: async () => true,
    acceptText: isCommentText,
    mainContent: () => WHOLE_ROOT,
    perBlockLanguage: true,
    source: () => ({
      platform: adapter.platform,
      url: adapter.url(),
      title: adapter.title(),
    }),
    url: () => adapter.url(),
  };
}

/** Calls `found` with the comment section once it is on the page; returns a cancel. */
function whenCommentsAppear(
  selector: string,
  found: (root: Element) => void,
): () => void {
  const now = document.querySelector(selector);
  if (now) {
    found(now);
    return () => {};
  }
  const observer = new MutationObserver(() => {
    const root = document.querySelector(selector);
    if (!root) return;
    observer.disconnect();
    found(root);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}

/**
 * Runs the article UI in the comments under each YouTube video (spec: "YouTube
 * comments"): on a watch page, once the comment section is there, and again from the
 * start after every navigation, so what is recorded belongs to the video shown. The
 * settings switch it on and off as they change.
 */
export function startYouTubeComments(
  deps: ArticleDeps,
  options: CommentsOptions,
): CommentsRunner {
  const { adapter } = options;
  const hostname = options.hostname ?? location.hostname;
  const href = options.href ?? (() => location.href);
  const surface = commentsSurface({ adapter, hostname });
  let runner: ArticleRunner | undefined;
  let cancelWait: (() => void) | undefined;

  function stopCurrent() {
    cancelWait?.();
    cancelWait = undefined;
    runner?.stop();
    runner = undefined;
  }

  function open() {
    stopCurrent();
    if (!adapter.videoId()) return;
    // A Short's comments open in a panel beside it (the panel is kept from Short to Short).
    const selector = isShortsUrl(href()) ? SHORTS_COMMENTS_ROOT : COMMENTS_ROOT;
    cancelWait = whenCommentsAppear(selector, (root) => {
      cancelWait = undefined;
      runner = runArticle(deps, { root, hostname, surface });
    });
  }

  // Nothing of the comments shows in the player's fullscreen.
  const onFullscreen = () => {
    if (document.fullscreenElement) runner?.closePanel();
  };
  document.addEventListener("fullscreenchange", onFullscreen);

  const offNavigate = adapter.onNavigate(open);
  open();

  return {
    closePanel: () => runner?.closePanel(),
    reanalyze: async () => {
      await runner?.reanalyze();
    },
    stop() {
      offNavigate();
      document.removeEventListener("fullscreenchange", onFullscreen);
      stopCurrent();
    },
  };
}

/**
 * Mounts the comments' hover card, selection card and dictionary panel in their own
 * shadow root in `<body>` (no `innerHTML`: YouTube enforces Trusted Types). On a Short
 * the dictionary panel goes beside the comments panel instead of at the top right.
 */
export function mountCommentsUi(app: ArticleApp): () => void {
  const { host, root } = createShadowHost(
    "lingo-comments",
    "position: static;",
  );
  render(<ArticleUi app={app} panelFrame={shortsFrame} />, root);
  document.body.append(host);
  return () => {
    render(null, root);
    host.remove();
  };
}

/** The content script's part for the comments: the extension's messaging and the UI. */
export function runYouTubeComments(
  ctx: ContentScriptContext,
  adapter: PlatformAdapter,
  hooks: LookupHooks,
): CommentsRunner {
  const runner = startYouTubeComments(
    { ...contentDeps(ctx), mountUi: mountCommentsUi, ...hooks },
    { adapter },
  );
  ctx.onInvalidated(() => runner.stop());
  return runner;
}
