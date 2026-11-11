/**
 * The messages content scripts and extension pages send to the background, and what
 * each one answers. Every payload is JSON-serializable (no Map, Set or Infinity), so it
 * crosses `runtime.sendMessage` unchanged in every browser.
 */
import type { Origin, TermRecord } from "../background/db";
import type {
  HistoryItem,
  HistorySource,
  HistoryStatus,
} from "../background/history-store";
import type {
  Counts,
  EncounterInput,
  ImportResult,
  SaveTermInput,
  SourceInput,
} from "../background/term-store";
import type { TranslationItem } from "../background/translation-cache";
import type { BrowserEnv } from "../core/browser-env";
import type { Span, TermKind, TermStatus } from "../core/classify";
import type { DictionaryEntry } from "../core/dictionary";
import type { Settings, SettingsPatch } from "../core/settings";
import type { SyncStatus } from "../core/sync/backend";
import type { Platform, Position } from "../core/url";

export type Request =
  | { type: "getSettings" }
  | { type: "setSettings"; patch: SettingsPatch }
  | { type: "getBrowserEnv" }
  /** Classifies blocks of text (paragraphs, subtitle lines) of one language. */
  | { type: "analyze"; lang: string; blocks: string[] }
  /**
   * The dictionary pattern a selection of words stands for (select mode: slots and
   * gaps). `text` is the selection's block; `start` and `end` are the selection's
   * offsets in it, `end` exclusive: every word they touch is selected.
   */
  | {
      type: "matchSelection";
      lang: string;
      text: string;
      start: number;
      end: number;
    }
  /** Loads the dictionary from `lang` to the native language ahead of the first lookup. */
  | { type: "warmDictionary"; lang: string }
  /**
   * The dictionary entry, saved status and occurrences of a term. `sourceUrl` is the
   * page or video the user is on; its occurrences come back as `here`.
   */
  | {
      type: "lookup";
      lang: string;
      key: string;
      kind: TermKind;
      sourceUrl?: string;
    }
  | ({ type: "saveTerm" } & SaveTermInput)
  | { type: "setStatus"; id: string; status: TermStatus }
  | { type: "removeTerm"; id: string }
  | { type: "recordEncounters"; source: SourceInput; items: EncounterInput[] }
  | {
      type: "saveAll";
      lang: string;
      keys: string[];
      status: TermStatus;
      source: SourceInput;
    }
  | { type: "undoSaveAll"; batchId: string }
  | { type: "counts"; lang: string }
  | { type: "syncStatus" }
  | { type: "exportJson" }
  | { type: "importJson"; json: string }
  /** When the data was last exported (Settings → Backup file). */
  | { type: "lastExport" }
  /** Saved terms of a language (no tombstones), for the word list. */
  | { type: "listTerms"; lang: string }
  /** The word list's rows: saved terms with their short meaning and occurrence stats. */
  | { type: "listTermsWithStats"; lang: string }
  /** Short meaning and saved status of terms (a video's word list), by key. */
  | {
      type: "termSummaries";
      lang: string;
      terms: { key: string; kind: TermKind }[];
    }
  /** Opens the options page (content scripts cannot open it themselves). */
  | { type: "openOptions" }
  /**
   * Keeps sentences of a page or video in the sentence history (Settings → Sentence
   * history). The background indexes them; nothing is kept when the history is off or
   * the host is blocked.
   */
  | {
      type: "recordHistory";
      source: HistorySource;
      sentences: HistorySentenceInput[];
    }
  | { type: "historyStatus" }
  | { type: "clearHistory" }
  /**
   * Keeps machine translations the UI made of cleaned English definitions
   * (`cleanDefinition`) of terms in `lang`, into the native language from the settings.
   * At most `MAX_CACHED_TRANSLATIONS` items are kept per request; empty or oversized
   * ones are skipped.
   */
  | { type: "cacheTranslations"; lang: string; items: TranslationItem[] };

/** `cacheTranslations` keeps at most this many items of a request. */
export const MAX_CACHED_TRANSLATIONS = 16;
/**
 * The longest English text `cacheTranslations` keeps, in UTF-16 code units; its
 * translation may be up to four times as long.
 */
export const MAX_TRANSLATION_TEXT = 1000;

export type RequestType = Request["type"];
export type RequestOf<T extends RequestType> = Extract<Request, { type: T }>;

/** A sentence for the history, as a content script sends it (without its keys). */
export type HistorySentenceInput = Omit<HistoryItem, "keys">;

export interface AnalyzeResult {
  /** Spans of each block, in the order of `blocks`; offsets are within the block. */
  spans: Span[][];
  /** Distinct keys of unsaved new terms over all blocks, in order of appearance. */
  unsaved: string[];
  /** Distinct keys of saved terms over all blocks, in order of appearance. */
  saved: string[];
}

/** One sentence a term was saved from or met again in, with where it came from. */
export interface OccurrenceView {
  sentence: string;
  translation?: string;
  pos: Position;
  seenAt: number;
  origin: Origin;
  source: { title: string; platform: Platform; url: string };
  /** Back to the spot: the source URL, with the time for YouTube. */
  link: string;
}

export interface LookupResult {
  /** Undefined when the dictionary has no entry for the term. */
  entry?: DictionaryEntry;
  /**
   * The term's IPA from the language pack, also for a phrase no dictionary has (a
   * selected phrase); missing when a word has none.
   */
  ipa?: string;
  status: TermStatus | "new";
  termId: string;
  /** Occurrences in the source at `sourceUrl`, newest first. */
  here: OccurrenceView[];
  /**
   * Occurrences in every other source, newest first. For an unsaved term: its kept
   * sentences from the sentence history (other sources only).
   */
  elsewhere: OccurrenceView[];
  /**
   * Cached machine translations of the entry's short meaning and first senses, keyed by
   * their cleaned English (`cleanDefinition`). Only for an entry whose glosses are not
   * in the native language (`glossLang`); missing when none is cached.
   */
  translations?: Readonly<Record<string, string>>;
}

/** One row of the word list. */
export interface TermSummary {
  id: string;
  /** The base form (or a phrase's base forms). */
  key: string;
  display: string;
  kind: TermKind;
  status: TermStatus;
  /** The dictionary's short meaning; missing when the dictionary has no entry. */
  short?: string;
  /** Language of `short` when it is not the native language (`DictionaryEntry.glossLang`). */
  glossLang?: string;
  /** `short` is a cached machine translation of the English definition (no `glossLang`). */
  machineTranslated?: true;
  /** How many occurrences are recorded. */
  seen: number;
  /** The newest occurrence's time, else when the term was saved (epoch ms). */
  lastSeen: number;
  createdAt: number;
}

/** A term's short meaning and saved status ("new" when not saved). */
export interface TermBrief {
  /** The dictionary's short meaning; missing when the dictionary has no entry. */
  short?: string;
  /** Language of `short` when it is not the native language (`DictionaryEntry.glossLang`). */
  glossLang?: string;
  /** `short` is a cached machine translation of the English definition (no `glossLang`). */
  machineTranslated?: true;
  status: TermStatus | "new";
}

export interface ResponseMap {
  getSettings: Settings;
  setSettings: Settings;
  /**
   * Names for the build target. Features are detected in the background's context;
   * pages that need them for their own context call `createBrowserEnv()` there.
   */
  getBrowserEnv: BrowserEnv;
  analyze: AnalyzeResult;
  /**
   * The pattern's key ("make up one's mind") and where its words are in `text`: from
   * its first word's start to its last word's end, gap included (the match may reach
   * past the selection). Empty when no pattern matches.
   */
  matchSelection: { key?: string; start?: number; end?: number };
  warmDictionary: null;
  lookup: LookupResult;
  saveTerm: TermRecord;
  setStatus: TermRecord;
  removeTerm: null;
  /** How many occurrences were added. */
  recordEncounters: number;
  saveAll: { batchId: string; count: number };
  /** How many terms were removed. */
  undoSaveAll: number;
  counts: Counts;
  syncStatus: SyncStatus;
  exportJson: string;
  importJson: ImportResult;
  /** Epoch ms, or null when the data was never exported. */
  lastExport: number | null;
  listTerms: TermRecord[];
  listTermsWithStats: TermSummary[];
  /** Keyed by term key. */
  termSummaries: Record<string, TermBrief>;
  openOptions: null;
  /** How many sentences were added (0 when nothing may be kept). */
  recordHistory: { kept: number };
  historyStatus: HistoryStatus;
  clearHistory: null;
  cacheTranslations: null;
}

export type ResponseOf<T extends RequestType> = ResponseMap[T];

/** What the background sends back for every request. */
export type Reply<T = unknown> =
  { ok: true; value: T } | { ok: false; error: string };
