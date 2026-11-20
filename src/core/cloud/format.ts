/**
 * The files of cloud sync: gzipped JSON, one folder per device (architecture "Sync to the
 * user's own cloud storage" → "Files"). The format is a contract shared with the mobile
 * app: a file of a newer `v` is skipped, not guessed at.
 */
import type { StoredStatus, TermKind } from "../classify";
import { meaningKey, type MeaningFrom } from "../meanings";
import { gunzip, gzip } from "../sync/codec";
import { termId } from "../term-id";
import type { Platform } from "../url";
import type {
  CloudChoice,
  CloudHistoryPage,
  CloudHistorySentence,
  CloudMeaning,
  CloudOccurrence,
  CloudSource,
  CloudTerm,
} from "./records";
import type { FileSettings } from "./settings";

const FORMAT = "langle-cloud";
/** The version this Langle writes and reads. */
export const CLOUD_VERSION = 1;

interface FileHeader {
  format: typeof FORMAT;
  v: typeof CLOUD_VERSION;
  /** The device that wrote the file (the folder it is in). */
  deviceId: string;
  writtenAt: number;
}

/** Everything but the rows: terms, settings, choices; written after a local change. */
export interface MainFile extends FileHeader {
  kind: "main";
  /** Every term, tombstones included. */
  terms: CloudTerm[];
  /** The sources that still have an occurrence. */
  sources: CloudSource[];
  /** The meanings this device's choices name. */
  meanings: CloudMeaning[];
  /** The choices this device made, undone ones included. */
  meaningChoices: CloudChoice[];
  settings: FileSettings;
  /** The last "Clear" of the sentence history (0: never). */
  historyClearedAt: number;
  /** Host → when it was added to "Never run on". */
  historyForgotten: Record<string, number>;
}

/** The rows this device recorded in one month (by `addedAt`), with their sources. */
export interface OccurrencesFile extends FileHeader {
  kind: "occurrences";
  /** `YYYY-MM`, UTC. */
  month: string;
  sources: CloudSource[];
  occurrences: CloudOccurrence[];
}

/** The history sentences this device recorded in one month, with their pages. */
export interface HistoryFile extends FileHeader {
  kind: "history";
  /** `YYYY-MM`, UTC. */
  month: string;
  pages: CloudHistoryPage[];
  sentences: CloudHistorySentence[];
}

export type MonthFile = OccurrencesFile | HistoryFile;
export type CloudFile = MainFile | MonthFile;

/**
 * A file read back: `newer` was written by a newer Langle ("Update Langle on this
 * device"), `broken` cannot be read, `other` is not a Langle cloud file.
 */
export type Decoded =
  | { status: "ok"; file: CloudFile }
  | { status: "newer"; v: number }
  | { status: "broken" }
  | { status: "other" };

/** The month a time falls in, `YYYY-MM` (UTC). */
export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEVICE = /^[A-Za-z0-9_-]+$/;

/** A file's path in the provider's app space: `devices/<deviceId>/<name>.json.gz`. */
export function filePath(
  deviceId: string,
  kind: CloudFile["kind"],
  month?: string,
): string {
  if (!DEVICE.test(deviceId)) throw new RangeError(`Bad device id ${deviceId}`);
  if (kind === "main") return `devices/${deviceId}/main.json.gz`;
  if (month === undefined || !MONTH.test(month))
    throw new RangeError(`A ${kind} file needs a month: ${month}`);
  return `devices/${deviceId}/${kind}-${month}.json.gz`;
}

const PATH =
  /^devices\/([A-Za-z0-9_-]+)\/(?:(main)|(occurrences|history)-(\d{4}-\d{2}))\.json\.gz$/;

/** The device, kind and month of a path `filePath` makes; undefined for any other path. */
export function parseFilePath(
  path: string,
):
  | { deviceId: string; kind: "main" }
  | { deviceId: string; kind: MonthFile["kind"]; month: string }
  | undefined {
  const match = PATH.exec(path);
  if (!match) return undefined;
  const [, deviceId, main, kind, month] = match as unknown as [
    string,
    string,
    string?,
    MonthFile["kind"]?,
    string?,
  ];
  if (main) return { deviceId, kind: "main" };
  return MONTH.test(month!)
    ? { deviceId, kind: kind!, month: month! }
    : undefined;
}

/** The file as gzipped JSON. */
export const encodeFile = (file: CloudFile) => gzip(JSON.stringify(file));

/** Reads a file `encodeFile` wrote. Never throws. */
export async function decodeFile(bytes: Uint8Array): Promise<Decoded> {
  let data: unknown;
  try {
    data = JSON.parse(await gunzip(new Uint8Array(bytes)));
  } catch {
    return { status: "broken" };
  }
  if (!isObject(data) || data.format !== FORMAT) return { status: "other" };
  if (Number.isSafeInteger(data.v) && (data.v as number) > CLOUD_VERSION)
    return { status: "newer", v: data.v as number };
  const file = data.v === CLOUD_VERSION ? readFile(data) : undefined;
  if (!file || !(await keysMatch(file))) return { status: "broken" };
  return { status: "ok", file };
}

/** A meaning's key is its hash: a file whose keys do not match is damaged. */
async function keysMatch(file: CloudFile) {
  if (file.kind !== "main") return true;
  const keys = await Promise.all(
    file.meanings.map((m) => meaningKey(m.termId, m.from, m.text)),
  );
  return keys.every((key, i) => key === file.meanings[i]!.key);
}

type Dict = Record<string, unknown>;

const STATUSES = new Set<StoredStatus>(["learning", "known", "removed"]);
const KINDS = new Set<TermKind>(["word", "phrase"]);
const PLATFORMS = new Set<Platform>(["youtube", "netflix", "web"]);
const ORIGINS = new Set(["saved", "encountered"]);
const FROMS = new Set<MeaningFrom>(["dictionary", "ai"]);

const isObject = (value: unknown): value is Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const optional =
  <T>(check: (value: unknown) => value is T) =>
  (value: unknown): value is T | undefined =>
    value === undefined || check(value);
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const isPosition = (value: unknown) =>
  isObject(value) &&
  ((isTime(value.timeMs) && Object.keys(value).length === 1) ||
    (isString(value.textQuote) && Object.keys(value).length === 1));
const isDevice = (value: unknown): value is string =>
  isString(value) && DEVICE.test(value);

/** Only the fields named, in that order, those left out dropped (they stay undefined). */
function pick<T>(value: Dict, fields: readonly string[]): T {
  const out: Dict = {};
  for (const field of fields)
    if (value[field] !== undefined) out[field] = value[field];
  return out as T;
}

/** `value`'s fields picked when it passes `check`; undefined when it does not. */
const record =
  <T>(fields: readonly string[], check: (value: Dict) => boolean) =>
  (value: unknown): T | undefined =>
    isObject(value) && check(value) ? pick<T>(value, fields) : undefined;

const readTerm = record<CloudTerm>(
  [
    "id",
    "lang",
    "key",
    "display",
    "kind",
    "status",
    "bulk",
    "learnedAt",
    "note",
    "createdAt",
    "updatedAt",
    "clearedAt",
  ],
  (t) =>
    isString(t.lang) &&
    isString(t.key) &&
    t.id === termId(t.lang, t.key) &&
    isString(t.display) &&
    KINDS.has(t.kind as TermKind) &&
    STATUSES.has(t.status as StoredStatus) &&
    optional(isBool)(t.bulk) &&
    optional(isTime)(t.learnedAt) &&
    optional(isString)(t.note) &&
    isTime(t.createdAt) &&
    isTime(t.updatedAt) &&
    optional(isTime)(t.clearedAt),
);

const SEEN = [
  "id",
  "platform",
  "url",
  "title",
  "lang",
  "firstSeen",
  "lastSeen",
];
const isSeen = (s: Dict) =>
  isString(s.id) &&
  PLATFORMS.has(s.platform as Platform) &&
  isString(s.url) &&
  isString(s.title) &&
  isString(s.lang) &&
  isTime(s.firstSeen) &&
  isTime(s.lastSeen) &&
  s.firstSeen <= s.lastSeen;

const readSource = record<CloudSource>(SEEN, isSeen);

const readPage = record<CloudHistoryPage>(
  [...SEEN, "host"],
  (p) => isSeen(p) && isString(p.host) && p.host === p.host.toLowerCase(),
);

const isRecorded = (r: Dict) => isDevice(r.deviceId) && isTime(r.addedAt);

const readOccurrence = record<CloudOccurrence>(
  [
    "termId",
    "sourceId",
    "sentence",
    "translation",
    "pos",
    "seenAt",
    "origin",
    "deviceId",
    "addedAt",
  ],
  (o) =>
    isString(o.termId) &&
    isString(o.sourceId) &&
    isString(o.sentence) &&
    optional(isString)(o.translation) &&
    isPosition(o.pos) &&
    isTime(o.seenAt) &&
    ORIGINS.has(o.origin as string) &&
    isRecorded(o),
);

const readSentence = record<CloudHistorySentence>(
  [
    "pageId",
    "text",
    "translation",
    "pos",
    "keys",
    "seenAt",
    "deviceId",
    "addedAt",
  ],
  (s) =>
    isString(s.pageId) &&
    isString(s.text) &&
    optional(isString)(s.translation) &&
    isPosition(s.pos) &&
    Array.isArray(s.keys) &&
    s.keys.every(isString) &&
    isTime(s.seenAt) &&
    isRecorded(s),
);

const readMeaning = record<CloudMeaning>(
  [
    "key",
    "termId",
    "from",
    "text",
    "glossLang",
    "pos",
    "explanation",
    "createdAt",
  ],
  (m) =>
    isString(m.key) &&
    isString(m.termId) &&
    FROMS.has(m.from as MeaningFrom) &&
    isString(m.text) &&
    m.text !== "" &&
    optional(isString)(m.glossLang) &&
    optional(isString)(m.pos) &&
    optional(isString)(m.explanation) &&
    isTime(m.createdAt),
);

const readChoice = record<CloudChoice>(
  ["termId", "sourceId", "sentence", "meaningKey", "at", "deviceId"],
  (c) =>
    isString(c.termId) &&
    isString(c.sourceId) &&
    isString(c.sentence) &&
    (c.meaningKey === null || isString(c.meaningKey)) &&
    isTime(c.at) &&
    isDevice(c.deviceId),
);

/** Every item read, or undefined when one fails (the file is damaged). */
function list<T>(value: unknown, read: (item: unknown) => T | undefined) {
  if (!Array.isArray(value)) return undefined;
  const items: T[] = [];
  for (const item of value) {
    const read_ = read(item);
    if (read_ === undefined) return undefined;
    items.push(read_);
  }
  return items;
}

const isTimes = (value: unknown): value is Record<string, number> =>
  isObject(value) && Object.values(value).every(isTime);

/** A month file holds only rows its writer recorded in that month. */
const ownRows = (
  rows: readonly { deviceId: string; addedAt: number }[],
  { deviceId }: { deviceId: string },
  month: string,
) => rows.every((r) => r.deviceId === deviceId && monthOf(r.addedAt) === month);

function readFile(data: Dict): CloudFile | undefined {
  if (!isDevice(data.deviceId) || !isTime(data.writtenAt)) return undefined;
  const header = {
    format: FORMAT,
    v: CLOUD_VERSION,
    deviceId: data.deviceId,
    writtenAt: data.writtenAt,
  } as const;
  if (data.kind === "main") {
    const terms = list(data.terms, readTerm);
    const sources = list(data.sources, readSource);
    const meanings = list(data.meanings, readMeaning);
    const meaningChoices = list(data.meaningChoices, readChoice);
    const { settings, historyClearedAt, historyForgotten } = data;
    if (
      !terms ||
      !sources ||
      !meanings ||
      !meaningChoices ||
      !isObject(settings) ||
      !isObject(settings.values) ||
      !isTimes(settings.times) ||
      !isTime(historyClearedAt) ||
      !isTimes(historyForgotten)
    )
      return undefined;
    return {
      ...header,
      kind: "main",
      terms,
      sources,
      meanings,
      meaningChoices,
      settings: { values: settings.values, times: settings.times },
      historyClearedAt,
      historyForgotten,
    };
  }
  if (!isString(data.month) || !MONTH.test(data.month)) return undefined;
  if (data.kind === "occurrences") {
    const sources = list(data.sources, readSource);
    const occurrences = list(data.occurrences, readOccurrence);
    if (!sources || !occurrences || !ownRows(occurrences, header, data.month))
      return undefined;
    return {
      ...header,
      kind: "occurrences",
      month: data.month,
      sources,
      occurrences,
    };
  }
  if (data.kind === "history") {
    const pages = list(data.pages, readPage);
    const sentences = list(data.sentences, readSentence);
    if (!pages || !sentences || !ownRows(sentences, header, data.month))
      return undefined;
    return { ...header, kind: "history", month: data.month, pages, sentences };
  }
  return undefined;
}
