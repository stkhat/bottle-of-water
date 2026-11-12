import { onHost } from "./url";

/** The `storage.sync` key that holds the whole settings object. */
export const SETTINGS_KEY = "settings";

export interface Settings {
  learningLang: string;
  nativeLang: string;
  uiLocale: string;
  /** Treat the N most common words as known (1,000–20,000, step 500). */
  knownLevel: number;
  highlight: { new: boolean; learning: boolean; known: boolean };
  /**
   * New words left unsaved when a video ends or the reader reaches the end of an
   * article: kept as New, or saved as Known.
   */
  unsavedAtEnd: "keep" | "known";
  /**
   * On articles, only the title and body get highlights, the end-of-article save and
   * the history; menus, sidebars and links to other stories still answer hovers.
   */
  articleMainOnly: boolean;
  dictionaries: {
    cambridge: boolean;
    wiktionary: boolean;
    reverso: boolean;
    wordreference: boolean;
  };
  subtitlePosition: "inVideo" | "belowVideo";
  subtitleTranslation: boolean;
  /** The subtitle and its translation's text size, in percent (the L menu's Size). */
  subtitleSize: number;
  /** How dark the box behind the subtitle over the video is, in percent (the L menu's Background). */
  subtitleOpacity: number;
  transcriptTranslation: boolean;
  /**
   * The column beside the video (Transcript and Words) shows: on a watch page, or as a
   * sidebar beside a video that fills the window or the screen. The column's × and the
   * L menu's switch (menu only, not on the settings page).
   */
  transcriptShown: boolean;
  /** Where Lingo runs; `youtubeComments` also needs `youtube`. */
  sites: {
    youtube: boolean;
    youtubeComments: boolean;
    netflix: boolean;
    articles: boolean;
  };
  /** The player's L button per platform: the next video there starts this way. */
  videoOn: { youtube: boolean; netflix: boolean };
  /** Hosts the extension never runs on (Settings → Sites). */
  neverRunOn: string[];
  /** Hosts switched off with the popup's "On this site". */
  disabledSites: string[];
  syncEnabled: boolean;
  sentenceHistory: boolean;
  /** Light or dark UI; `system` follows the browser's appearance. */
  theme: "system" | "light" | "dark";
}

/** A partial update: top-level keys, and nested groups key by key. */
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends unknown[]
    ? Settings[K]
    : Settings[K] extends object
      ? Partial<Settings[K]>
      : Settings[K];
};

export const KNOWN_LEVEL_MIN = 1000;
export const KNOWN_LEVEL_MAX = 20000;
export const KNOWN_LEVEL_STEP = 500;

export const SUBTITLE_SIZE_MIN = 50;
export const SUBTITLE_SIZE_MAX = 200;
export const SUBTITLE_SIZE_STEP = 10;

export const SUBTITLE_OPACITY_MIN = 0;
export const SUBTITLE_OPACITY_MAX = 100;
export const SUBTITLE_OPACITY_STEP = 5;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  learningLang: "en",
  nativeLang: "ja",
  uiLocale: "en",
  knownLevel: 3000,
  highlight: { new: false, learning: true, known: false },
  unsavedAtEnd: "keep",
  articleMainOnly: true,
  dictionaries: {
    cambridge: true,
    wiktionary: true,
    reverso: true,
    wordreference: true,
  },
  subtitlePosition: "inVideo",
  subtitleTranslation: true,
  subtitleSize: 100,
  subtitleOpacity: 80,
  transcriptTranslation: true,
  transcriptShown: true,
  sites: {
    youtube: true,
    youtubeComments: true,
    netflix: true,
    articles: true,
  },
  videoOn: { youtube: true, netflix: true },
  neverRunOn: [],
  disabledSites: [],
  syncEnabled: true,
  sentenceHistory: true,
  theme: "system",
});

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `value` when it is one of `options`, else `base`. */
const oneOf = <T extends string>(
  value: unknown,
  base: T,
  options: readonly T[],
): T => (options.includes(value as T) ? (value as T) : base);

function bool(value: unknown, base: boolean): boolean {
  return typeof value === "boolean" ? value : base;
}

function nonEmptyString(value: unknown, base: string): string {
  return typeof value === "string" && value !== "" ? value : base;
}

function strings(value: unknown, base: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...base];
  return value.filter((item): item is string => typeof item === "string");
}

function flags<T extends Record<string, boolean>>(value: unknown, base: T): T {
  const input = isDict(value) ? value : {};
  const out = {} as Record<string, boolean>;
  for (const key of Object.keys(base)) out[key] = bool(input[key], base[key]!);
  return out as T;
}

/** A slider's value: a finite number rounded to `step` and kept within `min`–`max`. */
function stepped(
  value: unknown,
  base: number,
  [min, max, step]: readonly [number, number, number],
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return base;
  const rounded = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, rounded));
}

const KNOWN_LEVEL = [
  KNOWN_LEVEL_MIN,
  KNOWN_LEVEL_MAX,
  KNOWN_LEVEL_STEP,
] as const;
const SUBTITLE_SIZE = [
  SUBTITLE_SIZE_MIN,
  SUBTITLE_SIZE_MAX,
  SUBTITLE_SIZE_STEP,
] as const;
const SUBTITLE_OPACITY = [
  SUBTITLE_OPACITY_MIN,
  SUBTITLE_OPACITY_MAX,
  SUBTITLE_OPACITY_STEP,
] as const;

/**
 * Settings from stored or partial input: missing or ill-typed values come from
 * `base` (the defaults unless given), nested groups merge key by key, unknown keys
 * are dropped and slider values (`knownLevel`, subtitle size and opacity) are clamped
 * to their slider's range and step.
 */
export function mergeSettings(
  input: unknown,
  base: Readonly<Settings> = DEFAULT_SETTINGS,
): Settings {
  const v = isDict(input) ? input : {};
  return {
    learningLang: nonEmptyString(v.learningLang, base.learningLang),
    nativeLang: nonEmptyString(v.nativeLang, base.nativeLang),
    uiLocale: nonEmptyString(v.uiLocale, base.uiLocale),
    knownLevel: stepped(v.knownLevel, base.knownLevel, KNOWN_LEVEL),
    highlight: flags(v.highlight, base.highlight),
    unsavedAtEnd: oneOf(v.unsavedAtEnd, base.unsavedAtEnd, ["keep", "known"]),
    articleMainOnly: bool(v.articleMainOnly, base.articleMainOnly),
    dictionaries: flags(v.dictionaries, base.dictionaries),
    subtitlePosition: oneOf(v.subtitlePosition, base.subtitlePosition, [
      "inVideo",
      "belowVideo",
    ]),
    subtitleTranslation: bool(v.subtitleTranslation, base.subtitleTranslation),
    subtitleSize: stepped(v.subtitleSize, base.subtitleSize, SUBTITLE_SIZE),
    subtitleOpacity: stepped(
      v.subtitleOpacity,
      base.subtitleOpacity,
      SUBTITLE_OPACITY,
    ),
    transcriptTranslation: bool(
      v.transcriptTranslation,
      base.transcriptTranslation,
    ),
    transcriptShown: bool(v.transcriptShown, base.transcriptShown),
    sites: flags(v.sites, base.sites),
    videoOn: flags(v.videoOn, base.videoOn),
    neverRunOn: strings(v.neverRunOn, base.neverRunOn),
    disabledSites: strings(v.disabledSites, base.disabledSites),
    syncEnabled: bool(v.syncEnabled, base.syncEnabled),
    sentenceHistory: bool(v.sentenceHistory, base.sentenceHistory),
    theme: oneOf(v.theme, base.theme, ["system", "light", "dark"]),
  };
}

/** The host is in `neverRunOn` or `disabledSites` (an entry covers its subdomains too). */
export function hostBlocked(hostname: string, settings: Settings): boolean {
  return [...settings.neverRunOn, ...settings.disabledSites].some((entry) =>
    onHost(hostname, entry),
  );
}
