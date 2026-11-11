import type { Span, TermStatus } from "../../core/classify";
import type { DataNote } from "../../core/packs/state";
import type { Settings, SettingsPatch } from "../../core/settings";
import type { SubtitleLine } from "../../core/subtitles/cues";
import type { TranslationChoice } from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import type { TermBrief } from "../../messaging/protocol";
import type { DictionaryLink } from "../../ui/lookup/externalDictionaries";
import type { HighlightCategory } from "../../ui/lookup/HighlightChips";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import type { PanelTab } from "../../ui/video/VideoPanel";
import type { TermCard } from "../lookup/describe";
import type { Box } from "../lookup/geometry";
import type { Store } from "../store";
import type { WordsFilter } from "./words";

/** Where a hovered word is shown. */
export type WordPlace = "subtitle" | "transcript";

/** A term in the subtitles: the cue and the index of its span in that cue's spans. */
export interface WordRef {
  cue: number;
  span: number;
}

/** The hover card over a word in the subtitle or the transcript. */
interface VideoHover {
  ref: WordRef;
  /** Where the word is: a card over a transcript word goes when the list scrolls. */
  from: WordPlace;
  anchor: Box;
  card: TermCard;
}

/** Where the term is in a line of "In this video" (each part of a phrase with a gap). */
interface LineMark {
  start: number;
  end: number;
  category: Exclude<Span["category"], "ignored">;
}

/** A line of the video with the term, for the window's "In this video". */
export interface VideoLine {
  cue: number;
  timeMs: number;
  text: string;
  marks: LineMark[];
}

/** The dictionary window for the clicked word. */
interface VideoPanel {
  ref: WordRef;
  card: TermCard;
  here: VideoLine[];
  dictionaries: DictionaryLink[];
  /** Counts the times the window opened (not the words shown in an open one). */
  opened: number;
}

/** What the video UI shows for the current video. */
export interface VideoState {
  settings: Settings;
  /** The video on the page, null when there is none. */
  videoId: string | null;
  /**
   * idle: no video; loading: reading its subtitles; ready; unavailable: no subtitles in
   * the learning language (or they could not be read).
   */
  status: "idle" | "loading" | "ready" | "unavailable";
  /** Lingo is on for this video (the L button). */
  enabled: boolean;
  /**
   * The transcript's cards: the original subtitles as sentences (cues that go on joined,
   * auto-generated fragments merged). Spans, translations and word refs are per card.
   */
  cues: Cue[];
  /** The lines the video shows, each a part of a card (one per original cue). */
  lines: SubtitleLine[];
  /** Spans of each cue's text; null until the cue is classified. */
  spans: (Span[] | null)[];
  translationSource: TranslationChoice["source"];
  /** The translation of each cue, for the transcript ("" when none). */
  translations: string[];
  /** The line playing; -1 between lines, during ads and while off. */
  line: number;
  /** The card of the line playing; -1 between lines, during ads and while off. */
  current: number;
  /** The transcript's card: the cue that started last; -1 before the first, during ads and while off. */
  card: number;
  /** The translation the subtitle shows at the playing time. */
  subtitleTranslation: string;
  hover: VideoHover | null;
  panel: VideoPanel | null;
  /** The Lingo menu above the ^ button. */
  menuOpen: boolean;
  /** The player is in fullscreen: no transcript, the subtitle always in the video. */
  fullscreen: boolean;
  /** The right column's tab; each video starts on the transcript. */
  panelTab: PanelTab;
  wordsFilter: WordsFilter;
  /**
   * Short meaning and saved status of the video's terms by key, as they arrive (the
   * Words tab: `videoWords(cues, spans, summaries)`).
   */
  summaries: Record<string, TermBrief>;
  /**
   * The chosen pair's language data while some of it is not on the device: the line at
   * the top of the right column. Null once it is all there.
   */
  dataNote: DataNote | null;
}

/** The UI's view of the video: its state and what its controls do. */
export interface VideoApp {
  readonly store: Store<VideoState>;
  /** The L button: Lingo on or off for this video. */
  setEnabled(on: boolean): void;
  /** A transcript card was clicked. */
  seekToCue(index: number): void;
  /** The pointer entered a word of the subtitle or the transcript (its box in the viewport). */
  enterWord(ref: WordRef, anchor: Box, from?: WordPlace): void;
  leaveWord(): void;
  /** The pointer entered the hover card: keep it. */
  keepHover(): void;
  /** The pointer left the hover card: hide it soon. */
  releaseHover(): void;
  dismissHover(): void;
  /** A word of the subtitle or the transcript was clicked: its dictionary window opens. */
  clickWord(ref: WordRef): void;
  /** The hover card's "+ Learning" / "Known". */
  setHoverStatus(status: TermStatus): void;
  /** The window's Learning / Known / Remove. */
  setPanelStatus(status: WordStatus): void;
  speak(): void;
  closePanel(): void;
  /** A line of the window's "In this video" was clicked. */
  seekTo(ms: number): void;
  toggleHighlight(category: HighlightCategory): void;
  /** The menu's and the transcript's switches. */
  changeSettings(patch: SettingsPatch): void;
  /**
   * A menu slider being dragged: the UI shows `patch` without saving it. The next
   * `changeSettings` (the slider let go) or settings change replaces it.
   */
  previewSettings(patch: SettingsPatch): void;
  /** The menu's gear. */
  openSettings(): void;
  setMenuOpen(open: boolean): void;
  setFullscreen(on: boolean): void;
  setPanelTab(tab: PanelTab): void;
  setWordsFilter(filter: WordsFilter): void;
  /** The download line's Retry: the background tries the language data again. */
  retryPacks(): void;
}

export interface VideoSession {
  readonly app: VideoApp;
  /** Answers the popup about this video (see `page-protocol.ts`). */
  handlePageRequest(request: PageRequest): Promise<PageSummary>;
  /** Classifies the current video's cues again (after saved terms changed). */
  reanalyze(): Promise<void>;
  stop(): void;
}

/** The state of a page before its video's subtitles are read. */
export function freshState(
  settings: Settings,
  videoId: string | null,
  fullscreen: boolean,
  enabled = true,
  dataNote: DataNote | null = null,
): VideoState {
  return {
    settings,
    videoId,
    status: videoId ? "loading" : "idle",
    enabled,
    cues: [],
    lines: [],
    spans: [],
    translationSource: "none",
    translations: [],
    line: -1,
    current: -1,
    card: -1,
    subtitleTranslation: "",
    hover: null,
    panel: null,
    menuOpen: false,
    fullscreen,
    panelTab: "transcript",
    wordsFilter: "all",
    summaries: {},
    dataNote,
  };
}
