import type { TranslationChoice } from "../../core/subtitles/translation";
import type { Cue, Track } from "../../core/subtitles/types";
import type { Platform } from "../../core/url";

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

/** What the video UI needs from a video site (YouTube, Netflix). */
export interface PlatformAdapter {
  readonly platform: Platform;
  matches(url: URL): boolean;
  /** The current video, undefined when the page shows none. */
  videoId(): string | undefined;
  title(): string;
  /** The video's URL, for the occurrence's source. */
  url(): string;
  video(): HTMLVideoElement | null;
  playerElement(): HTMLElement | null;
  /** Where the L and ^ buttons go in the player bar's right-hand controls. */
  controlsPoint(): InsertionPoint | null;
  /** The area under the player (subtitle position "Below video"). */
  belowVideoElement(): HTMLElement | null;
  /** Where the transcript goes in the side column, or null without one. */
  sideColumn(): InsertionPoint | null;
  /** An ad plays instead of the video. */
  adShowing(): boolean;
  /** The current video's subtitle tracks. */
  tracks(): Promise<Track[]>;
  /**
   * The current video's original subtitles in the learning language and its translation
   * (spec: "Choosing a translation"). Undefined when the video has no subtitles in the
   * learning language, or they cannot be read.
   */
  loadCaptions(request: CaptionRequest): Promise<VideoCaptions | undefined>;
  seek(ms: number): Promise<void>;
  /** Calls `listener` after the site moved to another page or video; returns an unsubscribe. */
  onNavigate(listener: () => void): () => void;
  /** Hides or shows the site's own captions. */
  hideSiteCaptions(hidden: boolean): void;
  dispose(): void;
}
