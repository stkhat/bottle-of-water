import type { TranslationChoice } from "../../core/subtitles/translation";
import type { Cue, Track } from "../../core/subtitles/types";
import { onHost, type Platform } from "../../core/url";

/** What `loadCaptions` needs to choose the tracks. */
export interface CaptionRequest {
  learningLang: string;
  nativeLang: string;
  /** The browser's built-in translator can translate the learning language into the native one. */
  translatorAvailable: boolean;
  /** Stops waiting (the user moved on to another video). */
  signal?: AbortSignal;
}

/** The subtitles of one video, held in memory only. */
export interface VideoCaptions {
  /** The track shown as the original (in the learning language). */
  track: Track;
  cues: Cue[];
  /**
   * Where the translation comes from (one choice per video) and, for the site's own
   * translations, its cues. `builtIn` and `none` come without cues.
   */
  translation: {
    source: TranslationChoice["source"];
    lang: string;
    cues: Cue[];
  };
}

/** Where Lingo puts an element: inside `parent`, before `before` (at the end when null). */
export interface InsertionPoint {
  parent: Element;
  before: Element | null;
}

type VideoPlatform = Exclude<Platform, "web">;

/** The site of each `PlatformAdapter`: the video UI owns it and its subdomains. */
const VIDEO_SITES: Record<VideoPlatform, string> = {
  youtube: "youtube.com",
  netflix: "netflix.com",
};

export const isVideoSite = (hostname: string): boolean =>
  Object.values(VIDEO_SITES).some((site) => onHost(hostname, site));

/** What the video UI needs from a video site. */
export interface PlatformAdapter {
  readonly platform: VideoPlatform;
  /** The current video, undefined when the page shows none. */
  videoId(): string | undefined;
  title(): string;
  /** The video's URL, for the occurrence's source. */
  url(): string;
  video(): HTMLVideoElement | null;
  playerElement(): HTMLElement | null;
  /** Where the L and ^ buttons go in the player bar's right-hand controls. */
  controlsPoint(): InsertionPoint | null;
  /**
   * CSS added to the L and ^ buttons' host, to line it up with the site's own buttons
   * in that row (Netflix). Default: the host fills the row's height, the group centred.
   */
  readonly controlsStyle?: string;
  /** The area under the player (subtitle position "Below video"). */
  belowVideoElement(): HTMLElement | null;
  /** Where the transcript goes in the side column, or null without one. */
  sideColumn(): InsertionPoint | null;
  /**
   * The page shows a vertical short video (YouTube Shorts; spec "YouTube Shorts"): the
   * subtitle is always in the video and smaller, there is no transcript, the menu opens
   * under the buttons and the dictionary window beside the video.
   */
  vertical?(): boolean;
  /** What the dictionary window goes to the right of, beside the video (Shorts' buttons). */
  besidePlayer?(): HTMLElement | null;
  /**
   * The player fills the window or the screen and can be narrowed (Netflix's watch
   * page; YouTube in fullscreen): the transcript then goes in the sidebar beside it
   * (spec "Video UI"). Default: false.
   */
  fillsWindow?(): boolean;
  /**
   * Narrows the player by `width` px at its right for the sidebar, its video
   * letterboxed in it; 0 gives it its whole width back. Called on every change to the
   * page: does nothing when nothing changed.
   */
  narrowPlayer?(width: number): void;
  /**
   * The viewport top of the site's control bar while it shows over the bottom of the
   * video (Netflix), so the subtitle can keep clear of it; null while it is hidden.
   */
  controlBarTop?(): number | null;
  /** An ad plays instead of the video. */
  adShowing(): boolean;
  tracks(): Promise<Track[]>;
  /**
   * The current video's original subtitles in the learning language and its translation
   * (spec: "Choosing a translation"). Undefined when the video has no subtitles in the
   * learning language, or they cannot be read.
   */
  loadCaptions(request: CaptionRequest): Promise<VideoCaptions | undefined>;
  seek(ms: number): Promise<void>;
  /** Pauses and plays the video through the site's player (spec: "Pausing while Lingo is in use"). */
  pause(): Promise<void>;
  play(): Promise<void>;
  /** Calls `listener` after the site moved to another page or video; returns an unsubscribe. */
  onNavigate(listener: () => void): () => void;
  hideSiteCaptions(hidden: boolean): void;
  dispose(): void;
}
