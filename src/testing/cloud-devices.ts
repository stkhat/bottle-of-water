/**
 * Devices that sync through cloud files, in memory, for the merge's tests: each keeps a
 * `CloudState`, makes local changes the way the stores do (a change is timed after the
 * version it replaces), writes its files and reads the others'.
 */
import {
  decodeFile,
  encodeFile,
  filePath,
  parseFilePath,
} from "../core/cloud/format";
import {
  clearedAtOf,
  historyKey,
  mergeCopy,
  mergeSeen,
  placeKey,
} from "../core/cloud/merge";
import type { CloudTerm } from "../core/cloud/records";
import { stampSettings } from "../core/cloud/settings";
import {
  applyLimits,
  dropUnusedMeanings,
  emptyState,
  filesOf,
  settleHistory,
  settleTerm,
  takeMain,
  takeMonth,
  type CloudState,
  type Limits,
} from "../core/cloud/state";
import type { TermStatus } from "../core/classify";
import { meaningKey } from "../core/meanings";
import { mergeSettings, type SettingsPatch } from "../core/settings";
import { termId } from "../core/term-id";
import { onHost, sourceId } from "../core/url";
import { omit } from "../core/util";

/** File path → gzipped file. */
export type Cloud = Map<string, Uint8Array>;

export interface Device {
  readonly id: string;
  state: CloudState;
  /** Month files to read again: rows wait for a term not known yet. */
  pending: Set<string>;
  now: () => number;
  /** The time of its last change; each change is later. */
  last: number;
  limits: Limits;
}

export function makeDevice(
  id: string,
  now: () => number,
  limits: Limits = {},
): Device {
  return { id, state: emptyState(), pending: new Set(), now, last: 0, limits };
}

/** A sentence of a web page. */
export interface Place {
  url: string;
  title: string;
  sentence: string;
}

const LANG = "en";

/** The time of a local change: by the device's clock, after its last change and after `after`. */
function tick(d: Device, ...after: number[]) {
  const at = Math.max(d.now(), d.last + 1, ...after);
  d.last = at;
  return at;
}

const isLive = (term: CloudTerm | undefined): term is CloudTerm =>
  term !== undefined && term.status !== "removed";

function see(d: Device, place: Place, at: number) {
  const id = sourceId("web", place.url);
  d.state.sources.set(
    id,
    mergeSeen(d.state.sources.get(id), {
      id,
      platform: "web",
      url: place.url,
      title: place.title,
      lang: LANG,
      firstSeen: at,
      lastSeen: at,
    }),
  );
  return id;
}

function addRow(
  d: Device,
  id: string,
  place: Place,
  at: number,
  origin: "saved" | "encountered",
) {
  const row = {
    termId: id,
    sourceId: see(d, place, at),
    sentence: place.sentence,
    pos: { textQuote: place.sentence },
    seenAt: at,
    origin,
    deviceId: d.id,
    addedAt: at,
  };
  const key = placeKey(row);
  const existing = d.state.occurrences.get(key);
  if (origin === "saved" || !existing)
    d.state.occurrences.set(key, mergeCopy(existing, row));
}

export function saveTerm(
  d: Device,
  key: string,
  status: TermStatus,
  place: Place,
) {
  const id = termId(LANG, key);
  const existing = d.state.terms.get(id);
  const cleared = existing ? clearedAtOf(existing) : 0;
  const at = tick(d, (existing?.updatedAt ?? 0) + 1, cleared);
  d.state.terms.set(id, {
    id,
    lang: LANG,
    key,
    display: key,
    kind: key.includes(" ") ? "phrase" : "word",
    status,
    createdAt: isLive(existing) ? existing.createdAt : at,
    updatedAt: at,
    ...(cleared > 0 && { clearedAt: cleared }),
  });
  addRow(d, id, place, at, "saved");
  applyLimits(d.state, d.limits);
}

export function setStatus(d: Device, key: string) {
  const term = d.state.terms.get(termId(LANG, key));
  if (!isLive(term)) return;
  const at = tick(d, term.updatedAt + 1);
  d.state.terms.set(term.id, {
    ...term,
    status: term.status === "known" ? "learning" : "known",
    updatedAt: at,
  });
}

export function removeTerm(d: Device, key: string) {
  const term = d.state.terms.get(termId(LANG, key));
  if (!isLive(term)) return;
  const at = tick(d, term.updatedAt + 1);
  const removed: CloudTerm = {
    ...omit(term, "learnedAt", "bulk"),
    status: "removed",
    updatedAt: at,
    clearedAt: at,
  };
  d.state.terms.set(term.id, removed);
  settleTerm(d.state, removed);
}

/** A saved term met again: recorded unless the term has the sentence there already. */
export function encounter(d: Device, key: string, place: Place) {
  const term = d.state.terms.get(termId(LANG, key));
  if (!isLive(term)) return;
  addRow(d, term.id, place, tick(d, clearedAtOf(term)), "encountered");
  applyLimits(d.state, d.limits);
}

/** Chooses a meaning (`text`) for the sentence, or none (null: an undo). */
export async function choose(
  d: Device,
  key: string,
  place: Place,
  text: string | null,
) {
  const id = termId(LANG, key);
  const existing = d.state.terms.get(id);
  const spot = {
    termId: id,
    sourceId: sourceId("web", place.url),
    sentence: place.sentence,
  };
  const previous = d.state.choices.get(placeKey(spot));
  if (text === null) {
    if (!isLive(existing) || !previous?.meaningKey) return;
  } else if (isLive(existing)) encounter(d, key, place);
  else saveTerm(d, key, "learning", place);
  const term = d.state.terms.get(id)!;
  const meaning = text === null ? null : await meaningKey(id, "ai", text);
  const at = tick(d, (previous?.at ?? 0) + 1, clearedAtOf(term));
  if (meaning !== null && text !== null && !d.state.meanings.has(meaning))
    d.state.meanings.set(meaning, {
      key: meaning,
      termId: id,
      from: "ai",
      text,
      createdAt: at,
    });
  d.state.choices.set(placeKey(spot), {
    ...spot,
    meaningKey: meaning,
    at,
    deviceId: d.id,
  });
  dropUnusedMeanings(d.state);
  applyLimits(d.state, d.limits);
}

const forgottenAt = (d: Device, host: string) =>
  Math.max(
    0,
    ...[...d.state.historyForgotten]
      .filter(([entry]) => onHost(host, entry))
      .map(([, at]) => at),
  );

/** Keeps a sentence of a page unless the page has it already. */
export function recordHistory(
  d: Device,
  page: { url: string; title: string },
  text: string,
) {
  const host = new URL(page.url).hostname;
  const at = tick(d, d.state.historyClearedAt, forgottenAt(d, host));
  const id = sourceId("web", page.url);
  d.state.pages.set(
    id,
    mergeSeen(d.state.pages.get(id), {
      id,
      platform: "web",
      url: page.url,
      host,
      title: page.title,
      lang: LANG,
      firstSeen: at,
      lastSeen: at,
    }),
  );
  const sentence = {
    pageId: id,
    text,
    pos: { textQuote: text },
    keys: [termId(LANG, "word")],
    seenAt: at,
    deviceId: d.id,
    addedAt: at,
  };
  if (!d.state.sentences.has(historyKey(sentence)))
    d.state.sentences.set(historyKey(sentence), sentence);
  applyLimits(d.state, d.limits);
}

export function clearHistory(d: Device) {
  d.state.historyClearedAt = tick(d, d.state.historyClearedAt + 1);
  settleHistory(d.state);
}

/** A host added to "Never run on". */
export function forgetHost(d: Device, host: string) {
  const at = tick(d, (d.state.historyForgotten.get(host) ?? 0) + 1);
  d.state.historyForgotten.set(host, at);
  settleHistory(d.state);
}

export function changeSettings(d: Device, patch: SettingsPatch) {
  const values = mergeSettings(patch, d.state.settings.values);
  d.state.settings = stampSettings(values, tick(d), d.state.settings);
}

const ownPaths = (d: Device, cloud: Cloud) =>
  [...cloud.keys()].filter((path) => parseFilePath(path)?.deviceId === d.id);

/** Writes every file of the device (its months written before included). */
export async function write(d: Device, cloud: Cloud) {
  for (const file of filesOf(d.state, d.id, d.now(), ownPaths(d, cloud))) {
    const path =
      file.kind === "main"
        ? filePath(d.id, "main")
        : filePath(d.id, file.kind, file.month);
    cloud.set(path, await encodeFile(file));
  }
}

/**
 * Reads other devices' files (`paths`, or all of them) and the ones waiting from
 * before: every `main` first, then the month files, each group in `order`'s order;
 * then the limits.
 */
export async function read(
  d: Device,
  cloud: Cloud,
  {
    paths = [...cloud.keys()],
    order = (list: string[]) => list,
  }: { paths?: readonly string[]; order?: (list: string[]) => string[] } = {},
) {
  const wanted = [...new Set([...paths, ...d.pending])].filter((path) => {
    const parsed = parseFilePath(path);
    return parsed && parsed.deviceId !== d.id && cloud.has(path);
  });
  const mains = wanted.filter((p) => parseFilePath(p)!.kind === "main");
  const months = wanted.filter((p) => parseFilePath(p)!.kind !== "main");
  for (const path of [...order(mains), ...order(months)]) {
    const decoded = await decodeFile(cloud.get(path)!);
    if (decoded.status !== "ok")
      throw new Error(`${path} could not be read: ${decoded.status}`);
    const { file } = decoded;
    if (file.kind === "main") takeMain(d.state, file);
    else if (takeMonth(d.state, file)) d.pending.delete(path);
    else d.pending.add(path);
  }
  applyLimits(d.state, d.limits);
}

const sorted = <T>(values: Iterable<T>, keyOf: (value: T) => string) =>
  [...values].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));

/** The device's data as plain values, for comparing devices (sources still in use only). */
export function snapshot(state: CloudState) {
  const inUse = new Set([...state.occurrences.values()].map((o) => o.sourceId));
  return {
    terms: sorted(state.terms.values(), (t) => t.id),
    sources: sorted(state.sources.values(), (s) => s.id).filter((s) =>
      inUse.has(s.id),
    ),
    occurrences: sorted(state.occurrences.values(), placeKey),
    meanings: sorted(state.meanings.values(), (m) => m.key),
    choices: sorted(state.choices.values(), placeKey),
    pages: sorted(state.pages.values(), (p) => p.id),
    sentences: sorted(state.sentences.values(), historyKey),
    historyClearedAt: state.historyClearedAt,
    historyForgotten: sorted(state.historyForgotten, ([host]) => host),
    settings: state.settings,
  };
}
