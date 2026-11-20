/**
 * The merge over a whole copy of the data, in memory: what reading the files does to a
 * device's data, and which files it writes. The reference the IndexedDB side follows
 * (and is tested against); the property test runs it over random devices.
 */
import {
  HISTORY_CAP_BYTES,
  pageSize,
  pagesToEvict,
  sentenceSize,
} from "../history-size";
import { DEFAULT_SETTINGS } from "../settings";
import { compareKeys } from "../sync/codec";
import {
  CLOUD_VERSION,
  monthOf,
  parseFilePath,
  type CloudFile,
  type HistoryFile,
  type MainFile,
  type MonthFile,
  type OccurrencesFile,
} from "./format";
import {
  clearedAtOf,
  historyKeeps,
  historyKey,
  MAX_OCCURRENCES,
  mergeChoice,
  mergeCopy,
  mergeForgotten,
  mergeMeaning,
  mergeSeen,
  mergeTerm,
  placeKey,
  sameRecord,
  termKeeps,
  trimOccurrences,
} from "./merge";
import type {
  CloudChoice,
  CloudHistoryPage,
  CloudHistorySentence,
  CloudMeaning,
  CloudOccurrence,
  CloudSource,
  CloudTerm,
} from "./records";
import { mergeTimedSettings, type TimedSettings } from "./settings";

export interface CloudState {
  terms: Map<string, CloudTerm>;
  sources: Map<string, CloudSource>;
  /** By `placeKey`. */
  occurrences: Map<string, CloudOccurrence>;
  meanings: Map<string, CloudMeaning>;
  /** By `placeKey`. */
  choices: Map<string, CloudChoice>;
  pages: Map<string, CloudHistoryPage>;
  /** By `historyKey`. */
  sentences: Map<string, CloudHistorySentence>;
  historyClearedAt: number;
  historyForgotten: Map<string, number>;
  settings: TimedSettings;
}

export function emptyState(): CloudState {
  return {
    terms: new Map(),
    sources: new Map(),
    occurrences: new Map(),
    meanings: new Map(),
    choices: new Map(),
    pages: new Map(),
    sentences: new Map(),
    historyClearedAt: 0,
    historyForgotten: new Map(),
    settings: { values: structuredClone(DEFAULT_SETTINGS), times: {} },
  };
}

function deleteWhere<T>(map: Map<string, T>, drop: (value: T) => boolean) {
  for (const [key, value] of map) if (drop(value)) map.delete(key);
}

/** Drops the meanings no choice names (locally only: a meaning is never a tombstone). */
export function dropUnusedMeanings(state: CloudState) {
  const named = new Set<string>();
  for (const c of state.choices.values())
    if (c.meaningKey !== null) named.add(c.meaningKey);
  deleteWhere(state.meanings, (m) => !named.has(m.key));
}

/**
 * Drops what a term no longer keeps: rows and choices from before its last removal.
 * A removed term keeps (unseen) those added after the removal, by a device that had
 * not heard of it yet, so they show again if the term is saved again.
 */
export function settleTerm(state: CloudState, term: CloudTerm) {
  deleteWhere(
    state.occurrences,
    (o) => o.termId === term.id && !termKeeps(term, o.addedAt),
  );
  deleteWhere(
    state.choices,
    (c) => c.termId === term.id && !termKeeps(term, c.at),
  );
  dropUnusedMeanings(state);
}

const keepsHistory = (state: CloudState, at: number, host: string) =>
  historyKeeps(at, host, state.historyClearedAt, state.historyForgotten);

/** Drops the pages and sentences from before the last "Clear" or a host's "Never run on". */
export function settleHistory(state: CloudState) {
  deleteWhere(state.pages, (p) => !keepsHistory(state, p.lastSeen, p.host));
  deleteWhere(state.sentences, (s) => {
    const page = state.pages.get(s.pageId);
    return !page || !keepsHistory(state, s.addedAt, page.host);
  });
}

/** Takes in another device's `main`. Read every `main` before any month file. */
export function takeMain(state: CloudState, file: MainFile) {
  state.settings = mergeTimedSettings(state.settings, file.settings);
  state.historyClearedAt = Math.max(
    state.historyClearedAt,
    file.historyClearedAt,
  );
  state.historyForgotten = mergeForgotten(
    state.historyForgotten,
    file.historyForgotten,
  );
  settleHistory(state);

  for (const incoming of file.terms) {
    const local = state.terms.get(incoming.id);
    const term = mergeTerm(local, incoming);
    state.terms.set(term.id, term);
    if (local && clearedAtOf(term) > clearedAtOf(local))
      settleTerm(state, term);
  }
  for (const source of file.sources)
    state.sources.set(
      source.id,
      mergeSeen(state.sources.get(source.id), source),
    );
  for (const choice of file.meaningChoices) {
    const term = state.terms.get(choice.termId);
    if (!term || !termKeeps(term, choice.at)) continue;
    const key = placeKey(choice);
    state.choices.set(key, mergeChoice(state.choices.get(key), choice));
  }
  for (const meaning of file.meanings)
    state.meanings.set(
      meaning.key,
      mergeMeaning(state.meanings.get(meaning.key), meaning),
    );
  dropUnusedMeanings(state);
}

/**
 * Takes in another device's month file. The file is the whole list of its writer's
 * rows of that month, as they are now, so a copy of that writer and month it does not
 * list as it is (dropped by the trim, the history limit or a removal, or replaced by a
 * later copy of the same row) is dropped here too. Returns false when
 * some rows wait for a term not known yet: the file is read again next time.
 */
export function takeMonth(state: CloudState, file: MonthFile): boolean {
  return file.kind === "occurrences"
    ? takeOccurrences(state, file)
    : takeHistory(state, file);
}

const writtenBy = (
  row: { deviceId: string; addedAt: number },
  file: MonthFile,
) => row.deviceId === file.deviceId && monthOf(row.addedAt) === file.month;

function takeOccurrences(state: CloudState, file: OccurrencesFile) {
  for (const source of file.sources)
    state.sources.set(
      source.id,
      mergeSeen(state.sources.get(source.id), source),
    );
  const listed = new Map(file.occurrences.map((o) => [placeKey(o), o]));
  deleteWhere(
    state.occurrences,
    (o) => writtenBy(o, file) && !sameRecord(listed.get(placeKey(o)), o),
  );
  let complete = true;
  for (const row of file.occurrences) {
    const term = state.terms.get(row.termId);
    if (!term) complete = false;
    else if (termKeeps(term, row.addedAt)) {
      const key = placeKey(row);
      state.occurrences.set(key, mergeCopy(state.occurrences.get(key), row));
    }
  }
  return complete;
}

function takeHistory(state: CloudState, file: HistoryFile) {
  for (const incoming of file.pages) {
    const page = mergeSeen(state.pages.get(incoming.id), incoming);
    if (keepsHistory(state, page.lastSeen, page.host))
      state.pages.set(page.id, page);
  }
  const listed = new Map(file.sentences.map((s) => [historyKey(s), s]));
  deleteWhere(
    state.sentences,
    (s) => writtenBy(s, file) && !sameRecord(listed.get(historyKey(s)), s),
  );
  for (const row of file.sentences) {
    const page = state.pages.get(row.pageId);
    if (!page || !keepsHistory(state, row.addedAt, page.host)) continue;
    const key = historyKey(row);
    state.sentences.set(key, mergeCopy(state.sentences.get(key), row));
  }
  return true;
}

function groupBy<T>(items: Iterable<T>, keyOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export interface Limits {
  maxOccurrences?: number;
  historyCapBytes?: number;
}

/**
 * The limits, after a round of reading files (or a local change): 50 occurrences per
 * term (`trimOccurrences`), and the history's 50 MB, over which the pages seen longest
 * ago (equal: the smaller id) go until it is under 45 MB.
 */
export function applyLimits(
  state: CloudState,
  {
    maxOccurrences = MAX_OCCURRENCES,
    historyCapBytes = HISTORY_CAP_BYTES,
  }: Limits = {},
) {
  const chosen = new Set<string>();
  for (const c of state.choices.values())
    if (c.meaningKey !== null) chosen.add(placeKey(c));
  for (const rows of groupBy(
    state.occurrences.values(),
    (o) => o.termId,
  ).values()) {
    const kept = new Set(trimOccurrences(rows, chosen, maxOccurrences));
    for (const row of rows)
      if (!kept.has(row)) state.occurrences.delete(placeKey(row));
  }

  const bytes = new Map<string, number>();
  for (const page of state.pages.values()) bytes.set(page.id, pageSize(page));
  for (const s of state.sentences.values())
    if (bytes.has(s.pageId))
      bytes.set(s.pageId, bytes.get(s.pageId)! + sentenceSize(s));
  const oldestFirst = [...state.pages.values()]
    .sort((a, b) => a.lastSeen - b.lastSeen || compareKeys(a.id, b.id))
    .map((page) => ({ id: page.id, bytes: bytes.get(page.id)! }));
  const total = oldestFirst.reduce((sum, page) => sum + page.bytes, 0);
  const victims = new Set(
    pagesToEvict(oldestFirst, total, historyCapBytes).map((page) => page.id),
  );
  if (victims.size === 0) return;
  deleteWhere(state.pages, (p) => victims.has(p.id));
  deleteWhere(state.sentences, (s) => victims.has(s.pageId));
}

const byId = <T extends { id: string }>(a: T, b: T) => compareKeys(a.id, b.id);

/**
 * The files a device writes from its copy: `main`, and a month file for every month
 * that has its own rows (by `addedAt`) or a source or page it last saw then. A month
 * file holds the headers of the sources or pages its rows refer to and of those last
 * seen in that month, so a later `lastSeen` spreads without new rows. A month it wrote
 * before (`written`: paths) that has nothing now is written empty, so other devices
 * drop the rows it held.
 */
export function filesOf(
  state: CloudState,
  deviceId: string,
  writtenAt: number,
  written: Iterable<string> = [],
): CloudFile[] {
  const header = {
    format: "langle-cloud",
    v: CLOUD_VERSION,
    deviceId,
    writtenAt,
  } as const;
  const inUse = new Set([...state.occurrences.values()].map((o) => o.sourceId));
  const sources = [...state.sources.values()]
    .filter((s) => inUse.has(s.id))
    .sort(byId);
  const choices = [...state.choices.values()]
    .filter((c) => c.deviceId === deviceId)
    .sort((a, b) => compareKeys(placeKey(a), placeKey(b)));
  // Every meaning the copy uses, so the earliest copy of one (`mergeMeaning`) spreads.
  const named = new Set([...state.choices.values()].map((c) => c.meaningKey));
  const main: MainFile = {
    ...header,
    kind: "main",
    terms: [...state.terms.values()].sort(byId),
    sources,
    meanings: [...state.meanings.values()]
      .filter((m) => named.has(m.key))
      .sort((a, b) => compareKeys(a.key, b.key)),
    meaningChoices: choices,
    settings: state.settings,
    historyClearedAt: state.historyClearedAt,
    historyForgotten: Object.fromEntries(state.historyForgotten),
  };

  const before = new Map<string, Set<string>>();
  for (const path of written) {
    const parsed = parseFilePath(path);
    if (!parsed || parsed.deviceId !== deviceId || parsed.kind === "main")
      continue;
    const months = before.get(parsed.kind) ?? new Set();
    before.set(parsed.kind, months.add(parsed.month));
  }

  const months = <T extends { deviceId: string; addedAt: number }>(
    kind: MonthFile["kind"],
    rows: Iterable<T>,
    headers: readonly { id: string; lastSeen: number }[],
    headerOf: (row: T) => string,
    keyOf: (row: T) => string,
  ) => {
    const byMonth = new Map<string, { rows: T[]; headers: Set<string> }>();
    const month = (m: string) => {
      let entry = byMonth.get(m);
      if (!entry) byMonth.set(m, (entry = { rows: [], headers: new Set() }));
      return entry;
    };
    for (const row of rows) {
      if (row.deviceId !== deviceId) continue;
      const entry = month(monthOf(row.addedAt));
      entry.rows.push(row);
      entry.headers.add(headerOf(row));
    }
    for (const h of headers) month(monthOf(h.lastSeen)).headers.add(h.id);
    for (const m of before.get(kind) ?? []) month(m);
    return [...byMonth]
      .sort(([a], [b]) => compareKeys(a, b))
      .map(([m, entry]) => ({
        month: m,
        rows: entry.rows.sort((a, b) => compareKeys(keyOf(a), keyOf(b))),
        headers: [...entry.headers].sort(compareKeys),
      }));
  };

  const occurrenceFiles = months(
    "occurrences",
    state.occurrences.values(),
    sources,
    (o) => o.sourceId,
    placeKey,
  ).map(({ month, rows, headers }): OccurrencesFile => ({
    ...header,
    kind: "occurrences",
    month,
    sources: headers.map((id) => state.sources.get(id)!),
    occurrences: rows,
  }));
  const historyFiles = months(
    "history",
    state.sentences.values(),
    [...state.pages.values()],
    (s) => s.pageId,
    historyKey,
  ).map(({ month, rows, headers }): HistoryFile => ({
    ...header,
    kind: "history",
    month,
    pages: headers.map((id) => state.pages.get(id)!),
    sentences: rows,
  }));
  return [main, ...occurrenceFiles, ...historyFiles];
}
