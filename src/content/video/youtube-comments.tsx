import { render } from "preact";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { watchSettings } from "../../background/settings-store";
import { send } from "../../messaging/client";
import { watchPackState } from "../../messaging/pack-state";
import { guardShadowRoot } from "../../ui/from-user";
import {
  runArticle,
  type ArticleApp,
  type ArticleDeps,
  type ArticleRunner,
} from "../article/article";
import { WHOLE_ROOT, type PageSurface } from "../article/surface";
import { sendWhileConnected } from "../orphan";
import { ArticleUi } from "../ui/ArticleUi";
import { shadowRootMode } from "../ui/shadow-mode";
import { COMMENTS_ROOT, commentsAllowedOn, isCommentText } from "./comments";
import type { PlatformAdapter } from "./platform";

/** How the comments work with the video UI on the same page. */
export interface CommentsHooks {
  /** The comments' dictionary panel opened: the video's window closes. */
  onPanelOpen?(): void;
  /** A term was saved, changed or removed from the comments: the subtitles follow. */
  onTermsChanged?(): void;
}

/** The comments of the current video, run like an article. */
export interface CommentsRunner {
  /** Closes the comments' dictionary panel, if it is open. */
  closePanel(): void;
  /** Classifies the comments again (after saved terms changed elsewhere on the page). */
  reanalyze(): Promise<void>;
  stop(): void;
}

export interface CommentsOptions extends CommentsHooks {
  adapter: PlatformAdapter;
  /** Default `location.hostname`. */
  hostname?: string;
}

/**
 * The comment section as a page surface: only comment text is read, each comment's
 * language is detected on its own, everything read counts (there is no end to reach),
 * and the video is the source of what is saved and recorded.
 */
export function commentsSurface(
  options: CommentsOptions & { hostname: string },
): PageSurface {
  const { adapter, hostname } = options;
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
    onPanelOpen: options.onPanelOpen,
    onTermsChanged: options.onTermsChanged,
  };
}

/** Calls `found` with the comment section once it is on the page; returns a cancel. */
function whenCommentsAppear(found: (root: Element) => void): () => void {
  const now = document.querySelector(COMMENTS_ROOT);
  if (now) {
    found(now);
    return () => {};
  }
  const observer = new MutationObserver(() => {
    const root = document.querySelector(COMMENTS_ROOT);
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
  const surface = commentsSurface({ ...options, hostname });
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
    cancelWait = whenCommentsAppear((root) => {
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

/** Events that must not reach the site (its shortcuts, its handlers on the page). */
const PRIVATE_EVENTS = [
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "contextmenu",
  "keydown",
  "keyup",
  "keypress",
] as const;

/**
 * Mounts the comments' hover card, selection card and dictionary panel in their own
 * shadow root in `<body>` (no `innerHTML`: YouTube enforces Trusted Types). Returns an
 * unmount.
 */
export function mountCommentsUi(app: ArticleApp): () => void {
  const host = document.createElement("lingo-comments");
  host.style.cssText = "position: static;";
  for (const type of PRIVATE_EVENTS)
    host.addEventListener(type, (event) => event.stopPropagation());
  const root = host.attachShadow({ mode: shadowRootMode() });
  guardShadowRoot(root);
  render(<ArticleUi app={app} />, root);
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
  hooks: CommentsHooks,
): CommentsRunner {
  const runner = startYouTubeComments(
    {
      send: sendWhileConnected(ctx, send),
      watchSettings,
      watchPackState,
      detectLanguage: (text) => browser.i18n.detectLanguage(text),
      mountUi: mountCommentsUi,
    },
    { adapter, ...hooks },
  );
  ctx.onInvalidated(() => runner.stop());
  return runner;
}
