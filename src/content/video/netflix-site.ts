/**
 * Everything Lingo assumes about Netflix's watch page and player API, in one place
 * (manifest fields are in `netflix-manifest.ts`). None of it is documented by Netflix;
 * it follows public descriptions of the web player and is listed for checking in
 * docs/notes/netflix.md. Each lookup tries its candidates in order and gives null when
 * none matches, so a changed page means "no Lingo on this video", never a broken page.
 * Imported by the page script: keep this file free of runtime dependencies.
 */

/** CSS selectors, most likely first. */
export const SELECTORS = {
  /** The player area; Lingo's in-video parts go inside it (it covers the video). */
  player: [
    ".watch-video--player-view",
    "[data-uia='player']",
    ".watch-video",
    ".NFPlayer",
    ".nf-player-container",
  ],
  /** Netflix's own subtitles. */
  captions: [".player-timedtext"],
  /**
   * A button in the right-hand group of the control bar; the L and ^ buttons go before
   * it (the audio & subtitles button plays the part of YouTube's gear). Netflix builds
   * the bar (`[data-uia='controls-standard']`) while the pointer moves and removes it
   * when the pointer stops. Its class names are hashed: only data-uia and the
   * structure count.
   */
  controlsAnchor: [
    "[data-uia='control-audio-subtitle']",
    "[data-uia='control-speed']",
    "[data-uia='control-fullscreen-enter']",
    "[data-uia='control-fullscreen-exit']",
    ".button-nfplayerSubtitles",
  ],
  /** Any of the control bar's buttons: the row of buttons is the anchor's closest ancestor holding another. */
  controlButton: ["[data-uia^='control-']"],
  /** The control bar while it shows (built on pointer movement, removed when idle). */
  controlBar: ["[data-uia='controls-standard']"],
  /**
   * What the bar shows at the bottom: its buttons, the title and the timeline. The
   * subtitle keeps clear of the topmost (the bar's own box can cover the whole player).
   */
  controlBarParts: [
    "[data-uia^='control-']",
    "[data-uia='video-title']",
    "[data-uia*='timeline']",
  ],
  /** The title in the control bar ("Show", "E1", "Episode" as separate children). */
  title: ["[data-uia='video-title']", ".video-title"],
} as const;

/** Hides Netflix's own subtitles while Lingo shows its own. */
export const HIDE_CAPTIONS_CSS = `${SELECTORS.captions.join(", ")} { display: none !important; }`;

/** Lingo's parts over the player keep clear of the control bar at the bottom (px). */
export const CONTROL_BAR_HEIGHT = 120;
/** Netflix's back arrow and flag sit at the top of the player (px). */
export const TOP_BAR_HEIGHT = 72;

/** The first element matching one of `selectors`, inside `root`. */
export function query<E extends Element = HTMLElement>(
  root: ParentNode,
  selectors: readonly string[],
): E | null {
  for (const selector of selectors) {
    const found = root.querySelector<E>(selector);
    if (found) return found;
  }
  return null;
}

/** The title shown in the control bar, its parts joined by spaces. */
export function titleText(element: Element): string {
  const parts =
    element.children.length > 0
      ? [...element.children].map((child) => child.textContent ?? "")
      : [element.textContent ?? ""];
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

// Page world: Netflix's player API on `window.netflix`.

/** One playback session's player (Netflix's `videoPlayer` session object). */
export interface NetflixSessionPlayer {
  seek(ms: number): void;
  getMovieId?(): unknown;
}

interface NetflixMetadataVideo {
  title?: unknown;
  seasons?: {
    seq?: unknown;
    episodes?: {
      id?: unknown;
      episodeId?: unknown;
      seq?: unknown;
      title?: unknown;
    }[];
  }[];
}

interface NetflixGlobal {
  netflix?: {
    appContext?: {
      state?: {
        playerApp?: {
          getAPI?(): {
            videoPlayer?: {
              getAllPlayerSessionIds?(): unknown;
              getVideoPlayerBySessionId?(
                id: unknown,
              ): NetflixSessionPlayer | null;
            };
          };
          getState?(): {
            videoPlayer?: {
              videoMetadata?: Record<
                string,
                { _metadata?: { video?: NetflixMetadataVideo } } | undefined
              >;
            };
          };
        };
      };
    };
  };
}

const playerApp = (win: Window) =>
  (win as unknown as NetflixGlobal).netflix?.appContext?.state?.playerApp;

/**
 * The player of the playing title: the session whose id names the watch page
 * ("watch-…"), else the first one. Undefined when the API is not there.
 */
export function netflixPlayer(win: Window): NetflixSessionPlayer | undefined {
  const api = playerApp(win)?.getAPI?.()?.videoPlayer;
  const ids = api?.getAllPlayerSessionIds?.();
  if (!api || !Array.isArray(ids) || ids.length === 0) return undefined;
  const id =
    ids.find((each) => typeof each === "string" && each.includes("watch")) ??
    ids[0];
  const player = api.getVideoPlayerBySessionId?.(id);
  return player && typeof player.seek === "function" ? player : undefined;
}

/** "Show · S1:E2 Episode" or the film's title, from the player's metadata. */
export function netflixTitle(win: Window, movieId: string): string | undefined {
  const video =
    playerApp(win)?.getState?.()?.videoPlayer?.videoMetadata?.[movieId]
      ?._metadata?.video;
  if (!video || typeof video.title !== "string" || !video.title)
    return undefined;
  for (const season of Array.isArray(video.seasons) ? video.seasons : [])
    for (const episode of Array.isArray(season?.episodes)
      ? season.episodes
      : []) {
      if (String(episode?.id ?? episode?.episodeId) !== movieId) continue;
      const name = typeof episode.title === "string" ? ` ${episode.title}` : "";
      return `${video.title} · S${String(season.seq)}:E${String(episode.seq)}${name}`;
    }
  return video.title;
}
