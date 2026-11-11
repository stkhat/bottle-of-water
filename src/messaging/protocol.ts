/**
 * The messages content scripts and extension pages send to the background, and what
 * each one answers. Every payload is JSON-serializable (no Map, Set or Infinity), so it
 * crosses `runtime.sendMessage` unchanged in every browser.
 */
import type {
  Span,
  StoredStatus,
  TermKind,
  TermStatus,
} from "../core/classify";
import type { DictionaryEntry } from "../core/lexicon/dictionary";
import type { PackState } from "../core/packs/state";
import type { Settings, SettingsPatch } from "../core/settings";
import type { Platform, Position } from "../core/url";

export interface TermRecord {
  /** `termId(lang, key)` */
  id: string;
  lang: string;
  /** The base form, or the base forms of a phrase joined by single spaces. */
  key: string;
  display: string;
  kind: TermKind;
  status: StoredStatus;
  /** Saved by "save all" (dropped first from sync when space runs out). */
  bulk?: boolean;
  /** The "save all" batch that created the term, until the term is changed. */
  batchId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type Origin = "saved" | "encountered";

export interface SourceInput {
  platform: Platform;
  /** Any form of the page or video URL; the background normalizes it. */
  url: string;
  title: string;
  /** The language of the page or video. */
  lang: string;
}

export interface SaveTermInput {
  lang: string;
  key: string;
  display: string;
  kind: TermKind;
  status: TermStatus;
  source: SourceInput;
  sentence: string;
  translation?: string;
  pos: Position;
}

export interface EncounterInput {
  termId: string;
  sentence: string;
  translation?: string;
  pos: Position;
}

export interface HistorySentenceInput {
  text: string;
  translation?: string;
  pos: Position;
}

/** A cleaned English definition and its translation into the native language. */
export interface TranslationItem {
  text: string;
  translated: string;
}

export type Request =
  | { type: "getSettings" }
  | { type: "setSettings"; patch: SettingsPatch }
  /** Classifies blocks of text (paragraphs, subtitle lines) of one language. */
  | { type: "analyze"; lang: string; blocks: string[] }
  /**
   * The dictionary pattern a selection of words stands for (select mode: slots and
   * gaps). `start` and `end` are the selection's offsets in `text`, `end` exclusive:
   * every word they touch is selected.
   */
  | {
      type: "matchSelection";
      lang: string;
      text: string;
      start: number;
      end: number;
    }
  /** Loads the dictionary into the native language ahead of the first lookup. */
  | { type: "warmDictionary"; lang: string }
  /** `sourceUrl` is the page or video the user is on; its occurrences come back as `here`. */
  | { type: "lookup"; lang: string; key: string; sourceUrl?: string }
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
  | { type: "lastExport" }
  /** `meanings: false` skips the dictionary, for while it is not on the device. */
  | { type: "listTermsWithStats"; lang: string; meanings?: boolean }
  /** A video's word list. */
  | { type: "termSummaries"; lang: string; keys: string[] }
  /** Content scripts cannot open the options page themselves. */
  | { type: "openOptions" }
  /** Nothing is kept while the history is off or the host is blocked. */
  | {
      type: "recordHistory";
      source: SourceInput;
      sentences: HistorySentenceInput[];
    }
  | { type: "historyStatus" }
  | { type: "clearHistory" }
  /**
   * Machine translations the UI made of cleaned English definitions (`cleanDefinition`)
   * into the native language. At most `MAX_CACHED_TRANSLATIONS` items are kept per
   * request; empty or oversized ones are skipped.
   */
  | { type: "cacheTranslations"; lang: string; items: TranslationItem[] }
  | { type: "packStatus" }
  /** Answers at once; `packState` in `storage.local` shows the progress. */
  | { type: "retryPacks" }
  /**
   * Deletes a downloaded pack the chosen pair does not use, and the machine translations
   * of every offered pair whose packs include it.
   */
  | { type: "removePack"; pack: string };

export const MAX_CACHED_TRANSLATIONS = 16;
/** In UTF-16 code units; a translation may be up to four times as long. */
export const MAX_TRANSLATION_TEXT = 1000;

export type RequestType = Request["type"];
export type RequestOf<T extends RequestType> = Extract<Request, { type: T }>;

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
  /** The source URL, with the time for YouTube. */
  link: string;
}

export interface LookupResult {
  entry?: DictionaryEntry;
  /** From the language pack, also for a selected phrase no dictionary has. */
  ipa?: string;
  status: TermStatus | "new";
  termId: string;
  /** Occurrences in the source at `sourceUrl`, newest first. */
  here: OccurrenceView[];
  /**
   * Occurrences in every other source, newest first. For an unsaved term: its kept
   * sentences from the sentence history.
   */
  elsewhere: OccurrenceView[];
  /**
   * Cached machine translations of the entry's short meaning and first senses, keyed by
   * their cleaned English. Only for an entry glossed in another language (`glossLang`).
   */
  translations?: Readonly<Record<string, string>>;
}

/** A short meaning as lists show it. */
export interface ShortMeaning {
  /** Missing when the dictionary has no entry. */
  short?: string;
  /** Language of `short` when it is not the native language (`DictionaryEntry.glossLang`). */
  glossLang?: string;
  /** `short` is a cached machine translation of the English definition (no `glossLang`). */
  machineTranslated?: true;
}

/** One row of the word list. */
export interface TermSummary extends ShortMeaning {
  id: string;
  key: string;
  display: string;
  kind: TermKind;
  status: TermStatus;
  /** How many occurrences are recorded. */
  seen: number;
  /** The newest occurrence's time, else when the term was saved. */
  lastSeen: number;
  createdAt: number;
}

export interface TermBrief extends ShortMeaning {
  status: TermStatus | "new";
}

/** Live terms only. `learning` and `known` count words; `phrases` counts phrases of either status. */
export interface Counts {
  learning: number;
  known: number;
  phrases: number;
}

/** How many records an import added or replaced. */
export interface ImportResult {
  terms: number;
  sources: number;
  occurrences: number;
}

export interface SyncStatus {
  /** `settings.syncEnabled`; when false nothing is pushed or pulled. */
  enabled: boolean;
  bytesUsed: number;
  quotaBytes: number;
  /** When this device last wrote (or confirmed) its terms in the synced copy. */
  lastSavedAt?: number;
  /** Saved terms (all languages) that are in the synced copy. */
  syncedCount: number;
  /** Saved terms kept on this device only because the synced copy is full. */
  localOnlyCount: number;
  /**
   * Of the local-only terms, the ones that are not "save all" terms: left out because
   * dropping every "save all" term was not enough.
   */
  droppedKnownCount: number;
  /** The last failure, until an operation of the same kind succeeds. */
  error?: string;
}

export interface HistoryStatus {
  /** The counted size of everything kept. */
  bytes: number;
  cap: number;
  /** Pages and videos kept. */
  pages: number;
}

export interface PackStatus {
  pair: {
    /** Every pack of the pair is bundled: there is no language data to show. */
    bundled: boolean;
    /** The pair's downloaded packs, in `packsFor` order, with their size in the lock. */
    packs: (PackState & { pack: string; size: number })[];
  };
  /** Stored packs the chosen pair does not use (Settings offers to remove them). */
  others: { pack: string; size: number }[];
}

interface ResponseMap {
  getSettings: Settings;
  setSettings: Settings;
  analyze: AnalyzeResult;
  /**
   * The pattern's key ("make up one's mind") and where its words are in `text`, gap
   * included (the match may reach past the selection). Empty when no pattern matches.
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
  /** Null when the data was never exported. */
  lastExport: number | null;
  listTermsWithStats: TermSummary[];
  /** Keyed by term key. */
  termSummaries: Record<string, TermBrief>;
  openOptions: null;
  /** How many sentences were added. */
  recordHistory: { kept: number };
  historyStatus: HistoryStatus;
  clearHistory: null;
  cacheTranslations: null;
  packStatus: PackStatus;
  retryPacks: null;
  removePack: null;
}

export type ResponseOf<T extends RequestType> = ResponseMap[T];

/**
 * What the background sends back. `packsUnavailable` names the packs the request needs
 * that are not on the device (`send` throws it as `PacksUnavailableError`).
 */
export type Reply =
  | { ok: true; value: unknown }
  | { ok: false; error: string; code?: undefined }
  | { ok: false; error: string; code: "packsUnavailable"; packs: string[] };
