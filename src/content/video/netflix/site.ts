/**
 * Everything Lingo assumes about Netflix's watch page and player API (manifest fields are
 * in `manifest.ts`). None of it is documented by Netflix; see docs/notes/netflix.md.
 * Each lookup tries its candidates in order and gives null when none matches, so a
 * changed page means "no Lingo on this video", never a broken page. Imported by the
 * page script: no runtime dependencies.
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
  /** The buttons shown with the bar at the player's top, outside the bar's element. */
  topButtons: ["[data-uia='control-nav-back']", "[data-uia='control-flag']"],
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

/**
 * Keeps Netflix's control bar and the back arrow and flag shown with it out of sight
 * until Lingo lets them show (see `CONTROL_BAR_DELAY_MS`). Opacity cannot be undone by
 * the children; hidden, they let clicks through to the video.
 */
export const HIDE_CONTROL_BAR_CSS = `${[...SELECTORS.controlBar, ...SELECTORS.topButtons].join(", ")} { opacity: 0 !important; visibility: hidden !important; }`;

/**
 * Netflix shows its control bar on any pointer move, and the subtitle rises above it.
 * Moving to a word is short: the bar shows once the pointer has kept moving over the
 * player this long (ms), or at once in the bar's area or the top strip.
 */
export const CONTROL_BAR_DELAY_MS = 1500;

/** A pause in the pointer's moves this long (ms) starts a new run of moves. */
export const POINTER_REST_MS = 300;

/**
 * The bar gone this long (ms) means the pointer rested and Netflix took it away: the
 * next one is held back again. Netflix also builds the bar anew while the pointer moves
 * (seen on 2026-11-14), with a gap of a frame or so.
 */
export const BAR_GONE_MS = 500;

/** The strip at the player's top (px) where the back arrow is: the bar shows at once there. */
export const TOP_STRIP = 80;

/** Titles whose tracks are kept: the playing one, the next episode (prefetched), a few before. */
export const KEEP_TITLES = 6;

/** Lingo's parts over the player keep clear of the control bar at the bottom (px). */
export const CONTROL_BAR_HEIGHT = 120;

/**
 * The L and ^ buttons' host in the control bar's row. Netflix's buttons are 4.4rem tall
 * and sit at the top of their 5.2rem wrappers (an inline-block in a block), so their
 * centre is 0.4rem above the row's: the host takes the buttons' height at the row's top,
 * and the group is centred in it like theirs (rem scales with the window, as Netflix's
 * sizes do). Measured on netflix.com, 2026-11-14 (docs/notes/netflix.md).
 */
export const CONTROLS_STYLE = "align-self: flex-start; height: 4.4rem;";

/** The first element matching one of `selectors`. */
export function query<E extends Element = HTMLElement>(
  selectors: readonly string[],
  root: ParentNode = document,
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

/** One playback session's player (Netflix's `videoPlayer` session object). */
interface NetflixSessionPlayer {
  seek(ms: number): void;
  pause?(): void;
  play?(): void;
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

const playerApp = () =>
  (window as unknown as NetflixGlobal).netflix?.appContext?.state?.playerApp;

/**
 * The player of the playing title: the session whose id names the watch page
 * ("watch-…"), else the first one. Undefined when the API is not there.
 */
export function netflixPlayer(): NetflixSessionPlayer | undefined {
  const api = playerApp()?.getAPI?.()?.videoPlayer;
  const ids = api?.getAllPlayerSessionIds?.();
  if (!api || !Array.isArray(ids) || ids.length === 0) return undefined;
  const id =
    ids.find((each) => typeof each === "string" && each.includes("watch")) ??
    ids[0];
  const player = api.getVideoPlayerBySessionId?.(id);
  return player && typeof player.seek === "function" ? player : undefined;
}

/** "Show · S1:E2 Episode" or the film's title, from the player's metadata. */
export function netflixTitle(movieId: string): string | undefined {
  const video =
    playerApp()?.getState?.()?.videoPlayer?.videoMetadata?.[movieId]?._metadata
      ?.video;
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
