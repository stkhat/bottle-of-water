import { onHost } from "./url";

/** User settings, stored in `storage.sync` (spec: "Settings page", "Data model"). */
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
  dictionaries: {
    cambridge: boolean;
    wiktionary: boolean;
    reverso: boolean;
    wordreference: boolean;
  };
  subtitlePosition: "inVideo" | "belowVideo";
  subtitleTranslation: boolean;
  transcriptTranslation: boolean;
  sites: { youtube: boolean; netflix: boolean; articles: boolean };
  /** The player's L button per platform: the next video there starts this way. */
  videoOn: { youtube: boolean; netflix: boolean };
  /** Hosts the extension never runs on (Settings → Sites). */
  neverRunOn: string[];
  /** Hosts switched off with the popup's "On this site". */
  disabledSites: string[];
  syncEnabled: boolean;
  /** Phase 2; stored now so the shape stays stable. */
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

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  learningLang: "en",
  nativeLang: "ja",
  uiLocale: "en",
  knownLevel: 3000,
  highlight: { new: false, learning: true, known: false },
  unsavedAtEnd: "keep",
  dictionaries: {
    cambridge: true,
    wiktionary: true,
    reverso: true,
    wordreference: true,
  },
  subtitlePosition: "inVideo",
  subtitleTranslation: true,
  transcriptTranslation: true,
  sites: { youtube: true, netflix: true, articles: true },
  videoOn: { youtube: true, netflix: true },
  neverRunOn: [],
  disabledSites: [],
  syncEnabled: true,
  sentenceHistory: true,
  theme: "system",
});

const UNSAVED_AT_END: readonly Settings["unsavedAtEnd"][] = ["keep", "known"];

const SUBTITLE_POSITIONS: readonly Settings["subtitlePosition"][] = [
  "inVideo",
  "belowVideo",
];

export const THEMES: readonly Settings["theme"][] = ["system", "light", "dark"];

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

function knownLevel(value: unknown, base: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return base;
  const stepped = Math.round(value / KNOWN_LEVEL_STEP) * KNOWN_LEVEL_STEP;
  return Math.min(KNOWN_LEVEL_MAX, Math.max(KNOWN_LEVEL_MIN, stepped));
}

/**
 * Settings from stored or partial input: missing or ill-typed values come from
 * `base` (the defaults unless given), nested groups merge key by key, unknown keys
 * are dropped and `knownLevel` is clamped to its slider's range and step.
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
    knownLevel: knownLevel(v.knownLevel, base.knownLevel),
    highlight: flags(v.highlight, base.highlight),
    unsavedAtEnd: UNSAVED_AT_END.includes(
      v.unsavedAtEnd as Settings["unsavedAtEnd"],
    )
      ? (v.unsavedAtEnd as Settings["unsavedAtEnd"])
      : base.unsavedAtEnd,
    dictionaries: flags(v.dictionaries, base.dictionaries),
    subtitlePosition: SUBTITLE_POSITIONS.includes(
      v.subtitlePosition as Settings["subtitlePosition"],
    )
      ? (v.subtitlePosition as Settings["subtitlePosition"])
      : base.subtitlePosition,
    subtitleTranslation: bool(v.subtitleTranslation, base.subtitleTranslation),
    transcriptTranslation: bool(
      v.transcriptTranslation,
      base.transcriptTranslation,
    ),
    sites: flags(v.sites, base.sites),
    videoOn: flags(v.videoOn, base.videoOn),
    neverRunOn: strings(v.neverRunOn, base.neverRunOn),
    disabledSites: strings(v.disabledSites, base.disabledSites),
    syncEnabled: bool(v.syncEnabled, base.syncEnabled),
    sentenceHistory: bool(v.sentenceHistory, base.sentenceHistory),
    theme: THEMES.includes(v.theme as Settings["theme"])
      ? (v.theme as Settings["theme"])
      : base.theme,
  };
}

/** The host is in `neverRunOn` or `disabledSites` (an entry covers its subdomains too). */
export function hostBlocked(hostname: string, settings: Settings): boolean {
  return [...settings.neverRunOn, ...settings.disabledSites].some((entry) =>
    onHost(hostname, entry),
  );
}
