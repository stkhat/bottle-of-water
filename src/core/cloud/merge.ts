/**
 * The merge rules of cloud sync, record by record (architecture "Sync to the user's own
 * cloud storage" → "Merge"). Every rule is a total order or a max, so the result does
 * not depend on which device reads which file first. Strings compare by code point.
 */
import { compareKeys } from "../sync/codec";
import { onHost } from "../url";
import { omit } from "../util";
import type { CloudChoice, CloudOccurrence, CloudTerm } from "./records";

/**
 * Occurrences kept per term; the oldest encounters go first, saved ones and the ones
 * with a meaning chosen stay.
 */
export const MAX_OCCURRENCES = 50;

/** A place of a term (an occurrence or a choice) as one string: term, source, sentence. */
export const placeKey = (p: {
  termId: string;
  sourceId: string;
  sentence: string;
}) => `${p.termId}\n${p.sourceId}\n${p.sentence}`;

/** A history sentence's identity: its page and text. */
export const historyKey = (s: { pageId: string; text: string }) =>
  `${s.pageId}\n${s.text}`;

/** JSON with object keys sorted, so equal records give equal text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => compareKeys(a, b)),
        )
      : v,
  );
}

/** Whether two records are the same, field for field (`undefined` is no record). */
export const sameRecord = (a: unknown, b: unknown) =>
  a !== undefined && b !== undefined && canonical(a) === canonical(b);

/** The last resort of every order: the smaller canonical JSON first. */
const byContent = (a: unknown, b: unknown) =>
  compareKeys(canonical(a), canonical(b));

/** When the term was last removed: its `clearedAt`, or a tombstone's own time. */
export function clearedAtOf(term: CloudTerm): number {
  return Math.max(
    term.clearedAt ?? 0,
    term.status === "removed" ? term.updatedAt : 0,
  );
}

/** Whether the term keeps a row added (or a choice made) at `at`: not from before its last removal. */
export const termKeeps = (term: CloudTerm, at: number) =>
  at >= clearedAtOf(term);

/**
 * The newer `updatedAt` wins, tombstones like any version (equal times: the smaller
 * canonical JSON); `clearedAt` takes the later of the two.
 */
export function mergeTerm(
  local: CloudTerm | undefined,
  incoming: CloudTerm,
): CloudTerm {
  const winner =
    !local ||
    incoming.updatedAt > local.updatedAt ||
    (incoming.updatedAt === local.updatedAt &&
      // Without clearedAt, which the merge sets apart.
      byContent(omit(incoming, "clearedAt"), omit(local, "clearedAt")) < 0)
      ? incoming
      : local;
  const clearedAt = Math.max(
    local ? clearedAtOf(local) : 0,
    clearedAtOf(incoming),
  );
  const rest = omit(winner, "clearedAt");
  return clearedAt > 0 ? { ...rest, clearedAt } : rest;
}

type Copy = Pick<CloudOccurrence, "seenAt" | "addedAt" | "deviceId"> & {
  origin?: CloudOccurrence["origin"];
};

/**
 * The fixed order between two copies of one row (negative: `a` wins): `saved` before
 * `encountered`, then the earlier `seenAt`, the earlier `addedAt`, the smaller
 * `deviceId`, the smaller canonical JSON.
 */
export function compareCopies<T extends Copy>(a: T, b: T): number {
  const origin = (c: T) => (c.origin === "encountered" ? 1 : 0);
  return (
    origin(a) - origin(b) ||
    a.seenAt - b.seenAt ||
    a.addedAt - b.addedAt ||
    compareKeys(a.deviceId, b.deviceId) ||
    byContent(a, b)
  );
}

/** The copy that wins the fixed order. */
export const mergeCopy = <T extends Copy>(local: T | undefined, incoming: T) =>
  !local || compareCopies(incoming, local) < 0 ? incoming : local;

/**
 * The rows of one term to keep: all of them up to `max`; over it, encounters with no
 * meaning chosen go, the oldest `seenAt` first (equal: the earlier `addedAt`, the
 * smaller `deviceId`, then by source and sentence). Saved rows and rows in `chosen`
 * (place keys) count toward `max` but always stay.
 */
export function trimOccurrences<T extends CloudOccurrence>(
  rows: readonly T[],
  chosen: ReadonlySet<string>,
  max = MAX_OCCURRENCES,
): T[] {
  if (rows.length <= max) return [...rows];
  const droppable = rows
    .filter((o) => o.origin === "encountered" && !chosen.has(placeKey(o)))
    .sort(
      (a, b) =>
        a.seenAt - b.seenAt ||
        a.addedAt - b.addedAt ||
        compareKeys(a.deviceId, b.deviceId) ||
        compareKeys(placeKey(a), placeKey(b)),
    );
  const gone = new Set(droppable.slice(0, rows.length - max));
  return rows.filter((o) => !gone.has(o));
}

/**
 * The later `at` wins (an undo is a choice of none); at the same `at`, the smaller
 * `deviceId`, then the smaller canonical JSON.
 */
export function mergeChoice(
  local: CloudChoice | undefined,
  incoming: CloudChoice,
): CloudChoice {
  if (!local) return incoming;
  const order =
    local.at - incoming.at ||
    compareKeys(incoming.deviceId, local.deviceId) ||
    byContent(incoming, local);
  return order < 0 ? incoming : local;
}

interface Seen {
  title: string;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Sources and history pages: first and last seen only widen; the rest comes from the
 * copy seen last (equal `lastSeen`: the smaller title, then the smaller canonical JSON).
 */
export function mergeSeen<T extends Seen>(
  local: T | undefined,
  incoming: T,
): T {
  if (!local) return incoming;
  const order =
    local.lastSeen - incoming.lastSeen ||
    compareKeys(incoming.title, local.title) ||
    byContent(incoming, local);
  return {
    ...(order < 0 ? incoming : local),
    firstSeen: Math.min(local.firstSeen, incoming.firstSeen),
    lastSeen: Math.max(local.lastSeen, incoming.lastSeen),
  };
}

/** Host → when it was added to "Never run on" (lowercase, trimmed). */
export type Forgotten = ReadonlyMap<string, number>;

/** Per host, the later time. */
export function mergeForgotten(
  local: Forgotten,
  incoming: Readonly<Record<string, number>>,
): Map<string, number> {
  const merged = new Map(local);
  for (const [entry, at] of Object.entries(incoming)) {
    const host = entry.trim().toLowerCase();
    if (host !== "") merged.set(host, Math.max(merged.get(host) ?? 0, at));
  }
  return merged;
}

/**
 * Whether the history keeps what was recorded (a sentence's `addedAt`) or last seen (a
 * page's `lastSeen`) at `at` on `host`: not before the last "Clear", nor before the host
 * (or a parent domain) was added to "Never run on".
 */
export function historyKeeps(
  at: number,
  host: string,
  clearedAt: number,
  forgotten: Forgotten,
): boolean {
  if (at < clearedAt) return false;
  for (const [entry, time] of forgotten)
    if (time > at && onHost(host, entry)) return false;
  return true;
}

/**
 * Meanings are joined by key (the same key is the same meaning); the fields outside the
 * key come from the earlier `createdAt` (equal: the smaller canonical JSON).
 */
export function mergeMeaning<T extends { createdAt: number }>(
  local: T | undefined,
  incoming: T,
): T {
  if (!local) return incoming;
  const order =
    local.createdAt - incoming.createdAt || byContent(local, incoming);
  return order <= 0 ? local : incoming;
}
