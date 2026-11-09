/**
 * The messages content scripts and extension pages send to the background, and what
 * each one answers. Every payload is JSON-serializable (no Map, Set or Infinity), so it
 * crosses `runtime.sendMessage` unchanged in every browser.
 */
import type { Origin, TermRecord } from "../background/db";
import type {
  Counts,
  EncounterInput,
  ImportResult,
  SaveTermInput,
  SourceInput,
} from "../background/term-store";
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
  /** Saved terms of a language (no tombstones), for the word list. */
  | { type: "listTerms"; lang: string };

export type RequestType = Request["type"];
export type RequestOf<T extends RequestType> = Extract<Request, { type: T }>;

export interface AnalyzeResult {
  /** Spans of each block, in the order of `blocks`; offsets are within the block. */
  spans: Span[][];
  /** Distinct keys of unsaved new terms over all blocks, in order of appearance. */
  unsaved: string[];
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
  status: TermStatus | "new";
  termId: string;
  /** Occurrences in the source at `sourceUrl`, newest first. */
  here: OccurrenceView[];
  /** Occurrences in every other source, newest first. */
  elsewhere: OccurrenceView[];
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
  listTerms: TermRecord[];
}

export type ResponseOf<T extends RequestType> = ResponseMap[T];

/** What the background sends back for every request. */
export type Reply<T = unknown> =
  { ok: true; value: T } | { ok: false; error: string };
