import { Dexie } from "dexie";
import type { TermIndex, TermKind, TermStatus } from "../core/classify";
import {
  normalizeUrl,
  sourceId,
  type Platform,
  type Position,
} from "../core/url";
import type {
  LingoDb,
  MetaKey,
  OccurrenceRecord,
  SourceRecord,
  StoredStatus,
  TermRecord,
} from "./db";

export interface SourceInput {
  platform: Platform;
  /** Any form of the page or video URL; the store normalizes it. */
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

/** Live terms only. `learning` and `known` count words; `phrases` counts phrases of either status. */
export interface Counts {
  learning: number;
  known: number;
  phrases: number;
}

export interface OccurrenceWithSource extends OccurrenceRecord {
  source: SourceRecord;
}

export interface LingoExport {
  format: "lingo-export";
  version: 1;
  exportedAt: number;
  /** Every term, tombstones included. */
  terms: TermRecord[];
  sources: SourceRecord[];
  occurrences: Omit<OccurrenceRecord, "id">[];
}

/** How many records an import added or replaced. */
export interface ImportResult {
  terms: number;
  sources: number;
  occurrences: number;
}

/** What changed: the terms themselves (status, added, removed) or only their occurrences. */
export type ChangeKind = "terms" | "occurrences";

export type ChangeListener = (lang: string, kind: ChangeKind) => void;

export interface TermStore {
  /** Creates or updates a term and records where it was saved. The source is mandatory. */
  saveTerm(input: SaveTermInput): Promise<TermRecord>;
  setStatus(id: string, status: TermStatus): Promise<TermRecord>;
  /** Leaves a tombstone (status `"removed"`) and deletes the term's occurrences. */
  removeTerm(id: string): Promise<void>;
  /**
   * Records saved terms met again. Unsaved terms and sentences already recorded for
   * the term in the same source are skipped. Returns how many were added.
   */
  recordEncounters(
    source: SourceInput,
    items: readonly EncounterInput[],
  ): Promise<number>;
  /** Saves the keys that are not saved yet as `bulk` terms; saved ones keep their status. */
  saveAll(
    lang: string,
    keys: readonly string[],
    status: TermStatus,
    source: SourceInput,
  ): Promise<{ batchId: string; count: number }>;
  /** Removes the terms the batch created that nobody changed since. Returns how many. */
  undoSaveAll(batchId: string): Promise<number>;
  counts(lang: string): Promise<Counts>;
  /** Live terms' key → status. The same map until the terms of `lang` change. */
  termIndex(lang: string): Promise<TermIndex>;
  /** Live terms (and tombstones with `includeRemoved`), ordered by id. */
  listTerms(
    lang: string,
    options?: { includeRemoved?: boolean },
  ): Promise<TermRecord[]>;
  /** Newest first, each with its source. */
  occurrencesOf(termId: string): Promise<OccurrenceWithSource[]>;
  /** All data as `LingoExport` JSON; records `lastExportAt`. */
  exportJson(): Promise<string>;
  /**
   * Merges an export: per term the newer `updatedAt` wins (equal keeps this copy;
   * tombstones count like any version); sources and occurrences are joined.
   */
  importJson(json: string): Promise<ImportResult>;
  getMeta(key: MetaKey): Promise<number | undefined>;
  setMeta(key: MetaKey, value: number): Promise<void>;
  /** Called after every committed change, once per language. Returns an unsubscribe function. */
  onChange(listener: ChangeListener): () => void;
}

export interface TermStoreOptions {
  now?: () => number;
  newBatchId?: () => string;
}

export const termId = (lang: string, key: string) => `${lang}:${key}`;

/** Occurrences kept per term; the oldest go first. */
export const MAX_OCCURRENCES = 50;

const EXPORT_FORMAT = "lingo-export";
const EXPORT_VERSION = 1;

type LiveTerm = TermRecord & { status: TermStatus };

const isLive = (term: TermRecord | undefined): term is LiveTerm =>
  term !== undefined && term.status !== "removed";

/** A copy that is no longer part of a "save all" batch (and no longer bulk). */
function deliberate(term: TermRecord): TermRecord {
  const copy = { ...term };
  delete copy.bulk;
  delete copy.batchId;
  return copy;
}

function withoutBatchId(term: TermRecord): TermRecord {
  const copy = { ...term };
  delete copy.batchId;
  return copy;
}

class Changes {
  private readonly map = new Map<string, ChangeKind>();
  add(lang: string, kind: ChangeKind) {
    if (this.map.get(lang) !== "terms") this.map.set(lang, kind);
  }
  entries() {
    return [...this.map];
  }
}

export function createTermStore(
  db: LingoDb,
  {
    now = Date.now,
    newBatchId = () => crypto.randomUUID(),
  }: TermStoreOptions = {},
): TermStore {
  const listeners = new Set<ChangeListener>();
  const indexes = new Map<string, Promise<TermIndex>>();
  const tables = [db.terms, db.sources, db.occurrences];

  function notify(changes: Changes) {
    for (const [lang, kind] of changes.entries()) {
      if (kind === "terms") indexes.delete(lang);
      for (const listener of listeners) {
        try {
          listener(lang, kind);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }

  /** Runs `fn` in one read-write transaction, then tells listeners what changed. */
  async function mutate<T>(fn: (changes: Changes) => Promise<T>): Promise<T> {
    const changes = new Changes();
    const result = await db.transaction("rw", tables, () => fn(changes));
    notify(changes);
    return result;
  }

  async function upsertSource(input: SourceInput, at: number) {
    const url = normalizeUrl(input.url);
    const id = sourceId(input.platform, url);
    const existing = await db.sources.get(id);
    await db.sources.put({
      id,
      platform: input.platform,
      url,
      title: input.title || existing?.title || "",
      lang: input.lang,
      firstSeen: existing?.firstSeen ?? at,
      lastSeen: at,
    });
    return id;
  }

  const findOccurrence = (
    o: Pick<OccurrenceRecord, "termId" | "sourceId" | "sentence">,
  ) =>
    db.occurrences
      .where("[termId+sourceId+sentence]")
      .equals([o.termId, o.sourceId, o.sentence])
      .first();

  const occurrencesByAge = (id: string) =>
    db.occurrences
      .where("[termId+seenAt]")
      .between([id, Dexie.minKey], [id, Dexie.maxKey]);

  /** Keeps the newest `MAX_OCCURRENCES` of a term. */
  async function trimOccurrences(id: string) {
    const count = await db.occurrences.where("termId").equals(id).count();
    if (count <= MAX_OCCURRENCES) return;
    const oldest = await occurrencesByAge(id)
      .limit(count - MAX_OCCURRENCES)
      .primaryKeys();
    await db.occurrences.bulkDelete(oldest);
  }

  const deleteOccurrences = (id: string) =>
    db.occurrences.where("termId").equals(id).delete();

  async function tombstone(term: TermRecord, at: number) {
    await db.terms.put({
      ...deliberate(term),
      status: "removed",
      updatedAt: at,
    });
    await deleteOccurrences(term.id);
  }

  async function requireTerm(id: string) {
    const term = await db.terms.get(id);
    if (!isLive(term)) throw new Error(`No saved term ${id}`);
    return term;
  }

  return {
    saveTerm(input) {
      if (!input?.source)
        return Promise.reject(new Error("saveTerm needs a source"));
      return mutate(async (changes) => {
        const at = now();
        const id = termId(input.lang, input.key);
        const existing = await db.terms.get(id);
        const term: TermRecord = {
          ...(isLive(existing) ? deliberate(existing) : {}),
          id,
          lang: input.lang,
          key: input.key,
          display: input.display,
          kind: input.kind,
          status: input.status,
          createdAt: isLive(existing) ? existing.createdAt : at,
          updatedAt: at,
        };
        await db.terms.put(term);

        const occurrence: OccurrenceRecord = {
          termId: id,
          sourceId: await upsertSource(input.source, at),
          sentence: input.sentence,
          pos: input.pos,
          seenAt: at,
          origin: "saved",
        };
        if (input.translation !== undefined)
          occurrence.translation = input.translation;
        const same = await findOccurrence(occurrence);
        if (same) await db.occurrences.put({ ...occurrence, id: same.id });
        else await db.occurrences.add(occurrence);
        await trimOccurrences(id);

        changes.add(input.lang, "terms");
        return term;
      });
    },

    setStatus(id, status) {
      return mutate(async (changes) => {
        const existing = await requireTerm(id);
        if (existing.status === status) return existing;
        const term = { ...deliberate(existing), status, updatedAt: now() };
        await db.terms.put(term);
        changes.add(term.lang, "terms");
        return term;
      });
    },

    removeTerm(id) {
      return mutate(async (changes) => {
        const existing = await db.terms.get(id);
        if (!isLive(existing)) return;
        await tombstone(existing, now());
        changes.add(existing.lang, "terms");
      });
    },

    recordEncounters(source, items) {
      return mutate(async (changes) => {
        const at = now();
        let sourceKey: string | undefined;
        let added = 0;
        for (const item of items) {
          const term = await db.terms.get(item.termId);
          if (!isLive(term)) continue;
          sourceKey ??= await upsertSource(source, at);
          const occurrence: OccurrenceRecord = {
            termId: item.termId,
            sourceId: sourceKey,
            sentence: item.sentence,
            pos: item.pos,
            seenAt: at,
            origin: "encountered",
          };
          if (item.translation !== undefined)
            occurrence.translation = item.translation;
          if (await findOccurrence(occurrence)) continue;
          await db.occurrences.add(occurrence);
          await trimOccurrences(item.termId);
          changes.add(term.lang, "occurrences");
          added++;
        }
        return added;
      });
    },

    saveAll(lang, keys, status, source) {
      if (!source) return Promise.reject(new Error("saveAll needs a source"));
      return mutate(async (changes) => {
        const at = now();
        const batchId = newBatchId();
        let count = 0;
        for (const key of new Set(keys)) {
          const id = termId(lang, key);
          if (isLive(await db.terms.get(id))) continue;
          await db.terms.put({
            id,
            lang,
            key,
            display: key,
            kind: key.includes(" ") ? "phrase" : "word",
            status,
            bulk: true,
            batchId,
            createdAt: at,
            updatedAt: at,
          });
          count++;
        }
        if (count > 0) {
          await upsertSource(source, at);
          changes.add(lang, "terms");
        }
        return { batchId, count };
      });
    },

    undoSaveAll(batchId) {
      return mutate(async (changes) => {
        const at = now();
        const terms = await db.terms.where("batchId").equals(batchId).toArray();
        let removed = 0;
        for (const term of terms) {
          if (!isLive(term) || term.updatedAt !== term.createdAt) continue;
          await tombstone(term, at);
          changes.add(term.lang, "terms");
          removed++;
        }
        return removed;
      });
    },

    async counts(lang) {
      const counts: Counts = { learning: 0, known: 0, phrases: 0 };
      await db.terms
        .where("lang")
        .equals(lang)
        .each((term) => {
          if (!isLive(term)) return;
          if (term.kind === "phrase") counts.phrases++;
          else counts[term.status]++;
        });
      return counts;
    },

    termIndex(lang) {
      let index = indexes.get(lang);
      if (!index) {
        index = db.terms
          .where("lang")
          .equals(lang)
          .toArray()
          .then(
            (terms) =>
              new Map(terms.filter(isLive).map((t) => [t.key, t.status])),
          );
        indexes.set(lang, index);
        index.catch(() => indexes.delete(lang));
      }
      return index;
    },

    async listTerms(lang, { includeRemoved = false } = {}) {
      const terms = await db.terms.where("lang").equals(lang).toArray();
      return includeRemoved ? terms : terms.filter(isLive);
    },

    async occurrencesOf(id) {
      const occurrences = await occurrencesByAge(id).reverse().toArray();
      const sources = await db.sources.bulkGet([
        ...new Set(occurrences.map((o) => o.sourceId)),
      ]);
      const byId = new Map(
        sources.filter((s) => s !== undefined).map((s) => [s.id, s]),
      );
      return occurrences.flatMap((o) => {
        const source = byId.get(o.sourceId);
        return source ? [{ ...o, source }] : [];
      });
    },

    async exportJson() {
      const exportedAt = now();
      const data = await db.transaction("r", tables, async () => {
        const [terms, sources, occurrences] = await Promise.all([
          db.terms.toArray(),
          db.sources.toArray(),
          db.occurrences.toArray(),
        ]);
        const exported: LingoExport = {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt,
          terms: terms.map(withoutBatchId),
          sources,
          occurrences: occurrences.map((o) => {
            const copy = { ...o };
            delete copy.id;
            return copy;
          }),
        };
        return exported;
      });
      await db.meta.put({ key: "lastExportAt", value: exportedAt });
      return JSON.stringify(data);
    },

    async importJson(json) {
      const data = parseExport(json);
      return mutate(async (changes) => {
        const result: ImportResult = { terms: 0, sources: 0, occurrences: 0 };

        for (const incoming of data.terms) {
          const local = await db.terms.get(incoming.id);
          if (local && incoming.updatedAt <= local.updatedAt) continue;
          await db.terms.put(withoutBatchId(incoming));
          if (incoming.status === "removed")
            await deleteOccurrences(incoming.id);
          changes.add(incoming.lang, "terms");
          result.terms++;
        }

        for (const incoming of data.sources) {
          const local = await db.sources.get(incoming.id);
          if (!local) {
            await db.sources.put(incoming);
            result.sources++;
            continue;
          }
          const newer = incoming.lastSeen > local.lastSeen ? incoming : local;
          await db.sources.put({
            ...newer,
            firstSeen: Math.min(local.firstSeen, incoming.firstSeen),
            lastSeen: Math.max(local.lastSeen, incoming.lastSeen),
          });
        }

        const touched = new Set<string>();
        for (const incoming of data.occurrences) {
          const term = await db.terms.get(incoming.termId);
          if (!isLive(term)) continue;
          if (!(await db.sources.get(incoming.sourceId))) continue;
          if (await findOccurrence(incoming)) continue;
          await db.occurrences.add({ ...incoming });
          touched.add(term.id);
          changes.add(term.lang, "occurrences");
          result.occurrences++;
        }
        for (const id of touched) await trimOccurrences(id);

        return result;
      });
    },

    async getMeta(key) {
      return (await db.meta.get(key))?.value;
    },

    async setMeta(key, value) {
      await db.meta.put({ key, value });
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const STATUSES = new Set<StoredStatus>(["learning", "known", "removed"]);
const KINDS = new Set<TermKind>(["word", "phrase"]);
const PLATFORMS = new Set<Platform>(["youtube", "netflix", "web"]);
const ORIGINS = new Set(["saved", "encountered"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown) => typeof value === "string";
const isNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);

function isTerm(t: unknown): t is TermRecord {
  return (
    isObject(t) &&
    isString(t.lang) &&
    isString(t.key) &&
    t.id === termId(t.lang as string, t.key as string) &&
    isString(t.display) &&
    KINDS.has(t.kind as TermKind) &&
    STATUSES.has(t.status as StoredStatus) &&
    isNumber(t.createdAt) &&
    isNumber(t.updatedAt)
  );
}

function isSource(s: unknown): s is SourceRecord {
  return (
    isObject(s) &&
    isString(s.id) &&
    PLATFORMS.has(s.platform as Platform) &&
    isString(s.url) &&
    isString(s.title) &&
    isString(s.lang) &&
    isNumber(s.firstSeen) &&
    isNumber(s.lastSeen)
  );
}

function isOccurrence(o: unknown): o is Omit<OccurrenceRecord, "id"> {
  return (
    isObject(o) &&
    isString(o.termId) &&
    isString(o.sourceId) &&
    isString(o.sentence) &&
    isObject(o.pos) &&
    isNumber(o.seenAt) &&
    ORIGINS.has(o.origin as string)
  );
}

function parseExport(json: string): LingoExport {
  const data: unknown = JSON.parse(json);
  if (!isObject(data) || data.format !== EXPORT_FORMAT)
    throw new Error("This file is not a Lingo export");
  if (data.version !== EXPORT_VERSION)
    throw new Error(
      `Unsupported Lingo export version: ${String(data.version)}`,
    );
  const { terms, sources, occurrences } = data;
  if (
    !Array.isArray(terms) ||
    !Array.isArray(sources) ||
    !Array.isArray(occurrences) ||
    !terms.every(isTerm) ||
    !sources.every(isSource) ||
    !occurrences.every(isOccurrence)
  )
    throw new Error("The Lingo export is damaged");
  const strip = (o: Omit<OccurrenceRecord, "id">) => {
    const copy = { ...o } as OccurrenceRecord;
    delete copy.id;
    return copy;
  };
  return {
    ...(data as unknown as LingoExport),
    occurrences: occurrences.map(strip),
  };
}
