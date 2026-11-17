import { Dexie } from "dexie";
import type {
  StoredStatus,
  TermIndex,
  TermKind,
  TermStatus,
} from "../core/classify";
import { meaningKey, type Meaning, type MeaningFrom } from "../core/meanings";
import { fromMinutes, toMinutes, type SyncRecord } from "../core/sync/codec";
import { kindOfKey, termId } from "../core/term-id";
import {
  normalizeUrl,
  sourceId,
  type Platform,
  type Position,
} from "../core/url";
import { listeners, omit, promiseCache } from "../core/util";
import type {
  ChooseMeaningInput,
  Counts,
  EncounterInput,
  ImportResult,
  Origin,
  SaveTermInput,
  SourceInput,
  TermRecord,
} from "../messaging/protocol";
import type {
  LangleDb,
  MeaningChoiceRecord,
  MeaningRecord,
  MetaKey,
  OccurrenceRecord,
  SourceRecord,
} from "./db";

/** A sentence brought into a term's occurrences from elsewhere (the sentence history). */
export interface ImportedOccurrence {
  source: SourceInput;
  sentence: string;
  translation?: string;
  pos: Position;
  seenAt: number;
}

export interface OccurrenceWithSource extends OccurrenceRecord {
  source: SourceRecord;
}

interface OccurrenceStats {
  count: number;
  /** The newest occurrence's `seenAt`. */
  lastSeen: number;
}

/** A choice that names a meaning, with its source's URL (missing for a source not stored). */
interface LiveChoice extends MeaningChoiceRecord {
  meaningKey: string;
  url?: string;
}

/**
 * The JSON export (version 2). Version 1, which import still reads, had no meanings
 * and no meaning choices.
 */
export interface LangleExport {
  format: "langle-export";
  version: 2;
  exportedAt: number;
  /** Every term, tombstones included. */
  terms: TermRecord[];
  sources: SourceRecord[];
  occurrences: Omit<OccurrenceRecord, "id">[];
  meanings: MeaningRecord[];
  /** Undone choices included: they win over older choices of the same place. */
  meaningChoices: MeaningChoiceRecord[];
}

/**
 * The terms themselves changed (status, added, removed), or only their occurrences
 * (and the meanings chosen for them).
 */
type ChangeKind = "terms" | "occurrences";

/** `"sync"`: applied from another device's synced data. */
type ChangeOrigin = "local" | "sync";

export interface TermStore {
  /** Creates or updates a term and records where it was saved. */
  saveTerm(input: SaveTermInput): Promise<TermRecord>;
  setStatus(id: string, status: TermStatus): Promise<TermRecord>;
  /** Leaves a tombstone and deletes the term's occurrences, choices and meanings. */
  removeTerm(id: string): Promise<void>;
  /**
   * Chooses a meaning for one sentence of a term (replacing the one chosen there), or
   * none (`meaning` null: an undo, which leaves the term saved). An unsaved term is
   * saved as Learning with the sentence (`saved`); a saved term without the sentence
   * gets it (`encountered`). A meaning no choice names any more is dropped. Returns the
   * term; null for an undo with nothing to undo.
   */
  chooseMeaning(input: ChooseMeaningInput): Promise<TermRecord | null>;
  /** A term's meanings and the choices that name one, each with its source's URL. */
  meaningsOf(
    termId: string,
  ): Promise<{ meanings: MeaningRecord[]; choices: LiveChoice[] }>;
  /** `meaningsOf` for several terms at once; terms without a meaning are left out. */
  meaningsOfTerms(
    termIds: readonly string[],
  ): Promise<Map<string, { meanings: MeaningRecord[]; choices: LiveChoice[] }>>;
  /**
   * Records saved terms met again. Unsaved terms and sentences already recorded for
   * the term in the same source are skipped. Returns how many were added.
   */
  recordEncounters(
    source: SourceInput,
    items: readonly EncounterInput[],
  ): Promise<number>;
  /**
   * Adds sentences seen before saving as the live term's occurrences (`encountered`,
   * with their own times). Sentences the term already has in the same source are
   * skipped; then the oldest encounters over the limit go. Returns how many were added.
   */
  importOccurrences(
    termId: string,
    rows: readonly ImportedOccurrence[],
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
  /** Newest first. */
  occurrencesOf(termId: string): Promise<OccurrenceWithSource[]>;
  occurrenceStats(lang: string): Promise<Map<string, OccurrenceStats>>;
  /** All data as `LangleExport` JSON; records `lastExportAt`. */
  exportJson(): Promise<string>;
  /**
   * Merges an export (version 1 or 2): per term the newer `updatedAt` wins (equal keeps
   * this copy; tombstones count like any version); sources and occurrences are joined.
   * Meaning choices of live terms: per place the later `at` wins (equal: the smaller
   * `deviceId`); meanings are joined by key.
   */
  importJson(json: string): Promise<ImportResult>;
  /**
   * Applies synced versions that are newer (by whole minutes) than this copy's:
   * status and update time only. Creates missing terms without a source, and leaves
   * tombstones for removals. Returns how many were applied.
   */
  applySynced(lang: string, records: readonly SyncRecord[]): Promise<number>;
  /** Languages that have terms or tombstones. */
  languages(): Promise<string[]>;
  getMeta(key: MetaKey): Promise<number | undefined>;
  setMeta(key: MetaKey, value: number): Promise<void>;
  /** Called after every committed change, once per language. */
  onChange(
    listener: (lang: string, kind: ChangeKind, origin: ChangeOrigin) => void,
  ): () => void;
}

export interface TermStoreOptions {
  now?: () => number;
  newBatchId?: () => string;
  /** This device's id (`deviceId`), which meaning choices carry. Default: one per store. */
  deviceId?: () => Promise<string>;
}

/**
 * Occurrences kept per term; the oldest encounters go first, saved ones and the ones
 * with a meaning chosen stay.
 */
export const MAX_OCCURRENCES = 50;

const EXPORT_FORMAT = "langle-export";
/** Exports made before the rename to Langle (2026-11-18) still import. */
const LEGACY_EXPORT_FORMAT = "lingo-export";
const EXPORT_VERSION = 2;
/** Versions `importJson` reads. */
const IMPORT_VERSIONS: ReadonlySet<unknown> = new Set([1, 2]);

type LiveTerm = TermRecord & { status: TermStatus };

const isLive = (term: TermRecord | undefined): term is LiveTerm =>
  term !== undefined && term.status !== "removed";

/** No longer part of a "save all" batch, and no longer bulk. */
const deliberate = (term: TermRecord): TermRecord =>
  omit(term, "bulk", "batchId");

/**
 * `term` with the `learnedAt` its change from `before` gives: set when a learning term
 * becomes known, kept while it stays known, dropped otherwise.
 */
function withLearned(
  term: TermRecord,
  before: TermRecord | undefined,
  at: number,
): TermRecord {
  const rest = omit(term, "learnedAt");
  if (term.status !== "known" || !isLive(before)) return rest;
  const learnedAt = before.status === "learning" ? at : before.learnedAt;
  return learnedAt === undefined ? rest : { ...rest, learnedAt };
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

/** The source after a sight at `at`: times only widen; an older sight keeps the newer title. */
function widenSource(
  existing: SourceRecord | undefined,
  input: SourceInput,
  { id, url }: { id: string; url: string },
  at: number,
): SourceRecord {
  const newest = !existing || at >= existing.lastSeen;
  return {
    id,
    platform: input.platform,
    url,
    title: newest
      ? input.title || existing?.title || ""
      : existing.title || input.title,
    lang: newest ? input.lang : existing.lang,
    firstSeen: Math.min(existing?.firstSeen ?? at, at),
    lastSeen: Math.max(existing?.lastSeen ?? at, at),
  };
}

function sourceKey(input: SourceInput) {
  const url = normalizeUrl(input.url);
  return { id: sourceId(input.platform, url), url };
}

/** The term as a tombstone removed at `at`. */
const tombstoned = (term: TermRecord, at: number): TermRecord => ({
  ...omit(deliberate(term), "learnedAt"),
  status: "removed",
  updatedAt: at,
});

/** Distinct values, in order. */
const distinct = <T>(values: Iterable<T>) => [...new Set(values)];

/** A place of a term (an occurrence or a choice) as one string: its source and sentence. */
const placeOf = (p: { sourceId: string; sentence: string }) =>
  `${p.sourceId}\n${p.sentence}`;

/** The meaning's own fields: nothing else a message or a file may carry is stored. */
const meaningFields = ({
  from,
  text,
  glossLang,
  pos,
  explanation,
}: Meaning): Meaning => ({
  from,
  text,
  ...(glossLang !== undefined && { glossLang }),
  ...(pos !== undefined && { pos }),
  ...(explanation !== undefined && { explanation }),
});

/** `a` wins over `b` for the same place: the later choice; at the same time, the smaller device id. */
const laterChoice = (a: MeaningChoiceRecord, b: MeaningChoiceRecord) =>
  a.at > b.at || (a.at === b.at && a.deviceId < b.deviceId);

function makeOccurrence(
  termId: string,
  sourceId: string,
  { sentence, translation, pos }: Omit<EncounterInput, "termId">,
  seenAt: number,
  origin: Origin,
): OccurrenceRecord {
  return {
    termId,
    sourceId,
    sentence,
    ...(translation !== undefined && { translation }),
    pos,
    seenAt,
    origin,
  };
}

/** A random device id made once. */
function oneDevice() {
  const id = crypto.randomUUID();
  return () => Promise.resolve(id);
}

export function createTermStore(
  db: LangleDb,
  {
    now = Date.now,
    newBatchId = () => crypto.randomUUID(),
    deviceId = oneDevice(),
  }: TermStoreOptions = {},
): TermStore {
  const changed = listeners<[string, ChangeKind, ChangeOrigin]>();
  const indexes = promiseCache<TermIndex>({ keep: true });
  const tables = [
    db.terms,
    db.sources,
    db.occurrences,
    db.meanings,
    db.meaningChoices,
  ];

  /** Runs `fn` in one read-write transaction, then tells listeners what changed. */
  async function mutate<T>(
    fn: (changes: Changes) => Promise<T>,
    origin: ChangeOrigin = "local",
  ): Promise<T> {
    const changes = new Changes();
    const result = await db.transaction("rw", tables, () => fn(changes));
    for (const [lang, kind] of changes.entries()) {
      if (kind === "terms") indexes.delete(lang);
      changed.emit(lang, kind, origin);
    }
    return result;
  }

  /**
   * Creates or updates a source seen at `at`. Its times only widen, so an older sight
   * (an imported sentence) keeps the newer title.
   */
  async function upsertSource(input: SourceInput, at: number) {
    const key = sourceKey(input);
    const existing = await db.sources.get(key.id);
    await db.sources.put(widenSource(existing, input, key, at));
    return key.id;
  }

  /** `upsertSource` for each sight in turn, with one read and one write. Returns the ids. */
  async function upsertSources(
    sights: readonly { input: SourceInput; at: number }[],
  ) {
    const keys = sights.map(({ input }) => sourceKey(input));
    const ids = distinct(keys.map((key) => key.id));
    const stored = await db.sources.bulkGet(ids);
    const sources = new Map(ids.map((id, i) => [id, stored[i]]));
    sights.forEach(({ input, at }, i) => {
      const key = keys[i]!;
      sources.set(key.id, widenSource(sources.get(key.id), input, key, at));
    });
    await db.sources.bulkPut([...sources.values()] as SourceRecord[]);
    return keys.map((key) => key.id);
  }

  /** The stored terms with `ids`, by id (undefined for those not stored). */
  async function termsById(ids: Iterable<string>) {
    const keys = distinct(ids);
    const stored = await db.terms.bulkGet(keys);
    return new Map(keys.map((id, i) => [id, stored[i]]));
  }

  const findOccurrence = (
    o: Pick<OccurrenceRecord, "termId" | "sourceId" | "sentence">,
  ) =>
    db.occurrences
      .where("[termId+sourceId+sentence]")
      .equals([o.termId, o.sourceId, o.sentence])
      .first();

  /** Adds the occurrence unless the term has the sentence in that source; true when added. */
  async function addOccurrence(occurrence: OccurrenceRecord) {
    if (await findOccurrence(occurrence)) return false;
    await db.occurrences.add(occurrence);
    return true;
  }

  const occurrencesByAge = (id: string) =>
    db.occurrences
      .where("[termId+seenAt]")
      .between([id, Dexie.minKey], [id, Dexie.maxKey]);

  /** The term's choices that name a meaning. */
  const liveChoices = (id: string) =>
    db.meaningChoices
      .where("termId")
      .equals(id)
      .filter((c) => c.meaningKey !== null)
      .toArray() as Promise<(MeaningChoiceRecord & { meaningKey: string })[]>;

  /** The terms' meanings and live choices, each choice with its source's URL. */
  async function meaningsOfTerms(ids: readonly string[]) {
    const found = new Map<
      string,
      { meanings: MeaningRecord[]; choices: LiveChoice[] }
    >();
    if (ids.length === 0) return found;
    const [meanings, choices] = await Promise.all([
      db.meanings.where("termId").anyOf(ids).toArray(),
      db.meaningChoices
        .where("termId")
        .anyOf(ids)
        .filter((c) => c.meaningKey !== null)
        .toArray() as Promise<LiveChoice[]>,
    ]);
    const sources = await db.sources.bulkGet(
      distinct(choices.map((c) => c.sourceId)),
    );
    const urls = new Map(
      sources.flatMap((s) => (s ? [[s.id, s.url] as const] : [])),
    );
    const of = (id: string) => {
      let entry = found.get(id);
      if (!entry) found.set(id, (entry = { meanings: [], choices: [] }));
      return entry;
    };
    for (const m of meanings) of(m.termId).meanings.push(m);
    for (const c of choices) {
      const url = urls.get(c.sourceId);
      of(c.termId).choices.push(url === undefined ? c : { ...c, url });
    }
    return found;
  }

  /**
   * Keeps at most `MAX_OCCURRENCES` of a term by dropping the oldest encounters.
   * Sentences the term was saved from, and those with a meaning chosen, count toward
   * the limit but are never dropped.
   */
  async function trimOccurrences(id: string) {
    const count = await db.occurrences.where("termId").equals(id).count();
    if (count <= MAX_OCCURRENCES) return;
    const chosen = new Set((await liveChoices(id)).map(placeOf));
    const oldest = await occurrencesByAge(id)
      .filter((o) => o.origin === "encountered" && !chosen.has(placeOf(o)))
      .limit(count - MAX_OCCURRENCES)
      .primaryKeys();
    await db.occurrences.bulkDelete(oldest);
  }

  /** Deletes the terms' occurrences, meaning choices and meanings (a removal). */
  function deleteRecordsOf(ids: readonly string[]) {
    return Promise.all(
      [db.occurrences, db.meaningChoices, db.meanings].map((table) =>
        table.where("termId").anyOf(ids).delete(),
      ),
    );
  }

  /** Drops the meanings no choice names any more (locally only: never a tombstone). */
  async function dropUnused(keys: Iterable<string>) {
    for (const key of new Set(keys)) {
      const named = await db.meaningChoices
        .where("meaningKey")
        .equals(key)
        .count();
      if (named === 0) await db.meanings.delete(key);
    }
  }

  async function tombstone(term: TermRecord, at: number) {
    await db.terms.put(tombstoned(term, at));
    await deleteRecordsOf([term.id]);
  }

  async function requireTerm(id: string) {
    const term = await db.terms.get(id);
    if (!isLive(term)) throw new Error(`No saved term ${id}`);
    return term;
  }

  /**
   * Writes the term with the input's status, and the sentence as one it was saved from;
   * the caller trims its occurrences.
   */
  async function writeSaved(input: SaveTermInput, at: number) {
    const id = termId(input.lang, input.key);
    const existing = await db.terms.get(id);
    const term = withLearned(
      {
        ...(isLive(existing) ? deliberate(existing) : {}),
        id,
        lang: input.lang,
        key: input.key,
        display: input.display,
        kind: input.kind,
        status: input.status,
        createdAt: isLive(existing) ? existing.createdAt : at,
        updatedAt: at,
      },
      existing,
      at,
    );
    await db.terms.put(term);

    const occurrence = makeOccurrence(
      id,
      await upsertSource(input.source, at),
      input,
      at,
      "saved",
    );
    const same = await findOccurrence(occurrence);
    if (same) await db.occurrences.put({ ...occurrence, id: same.id });
    else await db.occurrences.add(occurrence);
    return term;
  }

  return {
    saveTerm(input) {
      if (!input?.source)
        return Promise.reject(new Error("saveTerm needs a source"));
      return mutate(async (changes) => {
        const term = await writeSaved(input, now());
        await trimOccurrences(term.id);
        changes.add(input.lang, "terms");
        return term;
      });
    },

    async chooseMeaning({ term: input, meaning }) {
      if (!input?.source) throw new Error("chooseMeaning needs a source");
      if (meaning !== null && !isMeaning(meaning))
        throw new Error("chooseMeaning needs a meaning or null");
      const id = termId(input.lang, input.key);
      // Read before the transaction: only database work may be waited for inside it.
      const [device, key] = await Promise.all([
        deviceId(),
        meaning && meaningKey(id, meaning.from, meaning.text),
      ]);
      return mutate(async (changes) => {
        const at = now();
        const existing = await db.terms.get(id);
        const place = {
          termId: id,
          sourceId: sourceKey(input.source).id,
          sentence: input.sentence,
        };
        const previous = await db.meaningChoices.get([
          place.termId,
          place.sourceId,
          place.sentence,
        ]);
        let term: TermRecord | null = isLive(existing) ? existing : null;
        if (meaning === null || key === null) {
          // An undo leaves the term saved; with nothing chosen there it does nothing.
          if (!term || !previous?.meaningKey) return term;
        } else if (term) {
          const occurrence = makeOccurrence(
            id,
            await upsertSource(input.source, at),
            input,
            at,
            "encountered",
          );
          await addOccurrence(occurrence);
        } else {
          term = await writeSaved({ ...input, status: "learning" }, at);
        }
        if (meaning && key && !(await db.meanings.get(key)))
          await db.meanings.add({
            ...meaningFields(meaning),
            key,
            termId: id,
            createdAt: at,
          });
        await db.meaningChoices.put({
          ...place,
          meaningKey: key,
          at,
          deviceId: device,
        });
        if (previous?.meaningKey && previous.meaningKey !== key)
          await dropUnused([previous.meaningKey]);
        await trimOccurrences(id);
        changes.add(input.lang, isLive(existing) ? "occurrences" : "terms");
        return term;
      });
    },

    async meaningsOf(id) {
      return (
        (await meaningsOfTerms([id])).get(id) ?? { meanings: [], choices: [] }
      );
    },

    meaningsOfTerms,

    setStatus(id, status) {
      return mutate(async (changes) => {
        const existing = await requireTerm(id);
        if (existing.status === status) return existing;
        const at = now();
        const term = withLearned(
          { ...deliberate(existing), status, updatedAt: at },
          existing,
          at,
        );
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
        const terms = await termsById(items.map((item) => item.termId));
        let seenIn: string | undefined;
        let added = 0;
        for (const item of items) {
          const term = terms.get(item.termId);
          if (!isLive(term)) continue;
          seenIn ??= await upsertSource(source, at);
          const occurrence = makeOccurrence(
            item.termId,
            seenIn,
            item,
            at,
            "encountered",
          );
          if (!(await addOccurrence(occurrence))) continue;
          await trimOccurrences(item.termId);
          changes.add(term.lang, "occurrences");
          added++;
        }
        return added;
      });
    },

    importOccurrences(id, rows) {
      if (rows.length === 0) return Promise.resolve(0);
      return mutate(async (changes) => {
        const term = await db.terms.get(id);
        if (!isLive(term)) return 0;
        const sources = await upsertSources(
          rows.map((row) => ({ input: row.source, at: row.seenAt })),
        );
        let added = 0;
        for (const [i, row] of rows.entries()) {
          const occurrence = makeOccurrence(
            id,
            sources[i]!,
            row,
            row.seenAt,
            "encountered",
          );
          if (await addOccurrence(occurrence)) added++;
        }
        if (added > 0) {
          await trimOccurrences(id);
          changes.add(term.lang, "occurrences");
        }
        return added;
      });
    },

    saveAll(lang, keys, status, source) {
      if (!source) return Promise.reject(new Error("saveAll needs a source"));
      return mutate(async (changes) => {
        const at = now();
        const batchId = newBatchId();
        const unique = distinct(keys);
        const stored = await db.terms.bulkGet(
          unique.map((key) => termId(lang, key)),
        );
        const created = unique
          .filter((_, i) => !isLive(stored[i]))
          .map((key): TermRecord => ({
            id: termId(lang, key),
            lang,
            key,
            display: key,
            kind: kindOfKey(key),
            status,
            bulk: true,
            batchId,
            createdAt: at,
            updatedAt: at,
          }));
        await db.terms.bulkPut(created);
        const count = created.length;
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
      return indexes.get(lang, async () => {
        const terms = await db.terms.where("lang").equals(lang).toArray();
        return new Map(terms.filter(isLive).map((t) => [t.key, t.status]));
      });
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

    async occurrenceStats(lang) {
      const stats = new Map<string, OccurrenceStats>();
      // Term ids start with the language ("en:…"): one index range per language.
      await db.occurrences
        .where("termId")
        .startsWith(`${lang}:`)
        .each(({ termId: id, seenAt }) => {
          const seen = stats.get(id);
          if (seen) {
            seen.count++;
            seen.lastSeen = Math.max(seen.lastSeen, seenAt);
          } else stats.set(id, { count: 1, lastSeen: seenAt });
        });
      return stats;
    },

    async exportJson() {
      const exportedAt = now();
      const data = await db.transaction("r", tables, async () => {
        const [terms, sources, occurrences, meanings, meaningChoices] =
          await Promise.all([
            db.terms.toArray(),
            db.sources.toArray(),
            db.occurrences.toArray(),
            db.meanings.toArray(),
            db.meaningChoices.toArray(),
          ]);
        const exported: LangleExport = {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt,
          terms: terms.map((term) => omit(term, "batchId")),
          sources,
          occurrences: occurrences.map((o) => omit(o, "id")),
          meanings,
          meaningChoices,
        };
        return exported;
      });
      await db.meta.put({ key: "lastExportAt", value: exportedAt });
      return JSON.stringify(data);
    },

    async importJson(json) {
      const data = parseExport(json);
      // A meaning's key is its hash: a file whose keys do not match is damaged. Checked
      // before the transaction, which cannot wait for anything but the database.
      const keys = await Promise.all(
        data.meanings.map((m) => meaningKey(m.termId, m.from, m.text)),
      );
      if (keys.some((key, i) => key !== data.meanings[i]!.key))
        throw new Error("The Langle export is damaged");
      return mutate(async (changes) => {
        const result: ImportResult = { terms: 0, sources: 0, occurrences: 0 };

        // Each table is read once and written once; the file's entries are taken in
        // turn, so an id that comes twice is compared with what the first one left.
        const terms = await termsById(data.terms.map((term) => term.id));
        const takenTerms = new Set<string>();
        const removed = new Set<string>();
        for (const incoming of data.terms) {
          const local = terms.get(incoming.id);
          if (local && incoming.updatedAt <= local.updatedAt) continue;
          terms.set(
            incoming.id,
            incoming.status === "known"
              ? omit(incoming, "batchId")
              : omit(incoming, "batchId", "learnedAt"),
          );
          takenTerms.add(incoming.id);
          if (incoming.status === "removed") removed.add(incoming.id);
          changes.add(incoming.lang, "terms");
          result.terms++;
        }
        await db.terms.bulkPut([...takenTerms].map((id) => terms.get(id)!));
        await deleteRecordsOf([...removed]);

        const sourceIds = distinct(data.sources.map((source) => source.id));
        const storedSources = await db.sources.bulkGet(sourceIds);
        const sources = new Map(
          sourceIds.map((id, i) => [id, storedSources[i]]),
        );
        const takenSources = new Set<string>();
        for (const incoming of data.sources) {
          const local = sources.get(incoming.id);
          takenSources.add(incoming.id);
          if (!local) {
            sources.set(incoming.id, incoming);
            result.sources++;
            continue;
          }
          const newer = incoming.lastSeen > local.lastSeen ? incoming : local;
          sources.set(incoming.id, {
            ...newer,
            firstSeen: Math.min(local.firstSeen, incoming.firstSeen),
            lastSeen: Math.max(local.lastSeen, incoming.lastSeen),
          });
        }
        await db.sources.bulkPut(
          [...takenSources].map((id) => sources.get(id)!),
        );

        // Choices before occurrences, so the trim keeps the places with a meaning.
        const chooser = await termsById([
          ...data.meaningChoices.map((c) => c.termId),
          ...data.meanings.map((m) => m.termId),
        ]);
        const chosenFor = new Set<string>();
        for (const incoming of data.meaningChoices) {
          const term = chooser.get(incoming.termId);
          if (!isLive(term)) continue;
          const local = await db.meaningChoices.get([
            incoming.termId,
            incoming.sourceId,
            incoming.sentence,
          ]);
          if (local && !laterChoice(incoming, local)) continue;
          const { termId: id, sourceId, sentence, meaningKey, at } = incoming;
          await db.meaningChoices.put({
            termId: id,
            sourceId,
            sentence,
            meaningKey,
            at,
            deviceId: incoming.deviceId,
          });
          chosenFor.add(id);
          changes.add(term.lang, "occurrences");
        }
        for (const incoming of data.meanings) {
          const term = chooser.get(incoming.termId);
          if (!isLive(term) || (await db.meanings.get(incoming.key))) continue;
          await db.meanings.add({
            ...meaningFields(incoming),
            key: incoming.key,
            termId: incoming.termId,
            createdAt: incoming.createdAt,
          });
          chosenFor.add(incoming.termId);
          changes.add(term.lang, "occurrences");
        }
        if (chosenFor.size > 0)
          await dropUnused(
            await db.meanings
              .where("termId")
              .anyOf([...chosenFor])
              .primaryKeys(),
          );

        const owners = await termsById(data.occurrences.map((o) => o.termId));
        const occurrenceSources = distinct(
          data.occurrences.map((o) => o.sourceId),
        );
        const known = new Set(
          (await db.sources.bulkGet(occurrenceSources)).flatMap((source) =>
            source ? [source.id] : [],
          ),
        );
        const touched = new Set<string>();
        for (const incoming of data.occurrences) {
          const term = owners.get(incoming.termId);
          if (!isLive(term)) continue;
          if (!known.has(incoming.sourceId)) continue;
          if (!(await addOccurrence({ ...incoming }))) continue;
          touched.add(term.id);
          changes.add(term.lang, "occurrences");
          result.occurrences++;
        }
        for (const id of touched) await trimOccurrences(id);

        return result;
      });
    },

    applySynced(lang, records) {
      return mutate(async (changes) => {
        // Records are taken in turn (a key that comes twice meets what the first left),
        // then written at once.
        const terms = await termsById(
          records.map((record) => termId(lang, record.key)),
        );
        const taken = new Set<string>();
        const removed = new Set<string>();
        let applied = 0;
        for (const record of records) {
          const id = termId(lang, record.key);
          const existing = terms.get(id);
          if (
            existing &&
            toMinutes(existing.updatedAt) >= record.updatedMinutes
          )
            continue;
          const at = fromMinutes(record.updatedMinutes);
          if (record.status === "removed" && isLive(existing)) {
            terms.set(id, tombstoned(existing, at));
            removed.add(id);
          } else {
            const kept = isLive(existing) && record.status !== "removed";
            // The record carries the mark, not the time: a term learned here keeps its own.
            const learnedAt =
              record.learned && record.status === "known"
                ? (isLive(existing) &&
                    existing.status === "known" &&
                    existing.learnedAt) ||
                  at
                : undefined;
            terms.set(id, {
              ...(existing ? omit(deliberate(existing), "learnedAt") : {}),
              ...(learnedAt !== undefined && { learnedAt }),
              id,
              lang,
              key: record.key,
              display: existing?.display ?? record.key,
              kind: existing?.kind ?? kindOfKey(record.key),
              status: record.status,
              createdAt: kept ? existing.createdAt : at,
              updatedAt: at,
            });
          }
          taken.add(id);
          changes.add(lang, "terms");
          applied++;
        }
        await db.terms.bulkPut([...taken].map((id) => terms.get(id)!));
        await deleteRecordsOf([...removed]);
        return applied;
      }, "sync");
    },

    async languages() {
      return (await db.terms.orderBy("lang").uniqueKeys()) as string[];
    },

    async getMeta(key) {
      return (await db.meta.get(key))?.value;
    },

    async setMeta(key, value) {
      await db.meta.put({ key, value });
    },

    onChange: changed.add,
  };
}

const STATUSES = new Set<StoredStatus>(["learning", "known", "removed"]);
const KINDS = new Set<TermKind>(["word", "phrase"]);
const PLATFORMS = new Set<Platform>(["youtube", "netflix", "web"]);
const ORIGINS = new Set(["saved", "encountered"]);
const FROMS = new Set<MeaningFrom>(["dictionary", "ai"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown) => typeof value === "string";
const isNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const isOptionalString = (value: unknown) =>
  value === undefined || isString(value);

function isMeaning(m: unknown): m is Meaning {
  return (
    isObject(m) &&
    FROMS.has(m.from as MeaningFrom) &&
    isString(m.text) &&
    m.text !== "" &&
    isOptionalString(m.glossLang) &&
    isOptionalString(m.pos) &&
    isOptionalString(m.explanation)
  );
}

function isMeaningRecord(m: unknown): m is MeaningRecord {
  return (
    isMeaning(m) &&
    isString((m as MeaningRecord).key) &&
    isString((m as MeaningRecord).termId) &&
    isNumber((m as MeaningRecord).createdAt)
  );
}

function isChoice(c: unknown): c is MeaningChoiceRecord {
  return (
    isObject(c) &&
    isString(c.termId) &&
    isString(c.sourceId) &&
    isString(c.sentence) &&
    (c.meaningKey === null || isString(c.meaningKey)) &&
    isNumber(c.at) &&
    isString(c.deviceId)
  );
}

function isTerm(t: unknown): t is TermRecord {
  return (
    isObject(t) &&
    isString(t.lang) &&
    isString(t.key) &&
    t.id === termId(t.lang as string, t.key as string) &&
    isString(t.display) &&
    KINDS.has(t.kind as TermKind) &&
    STATUSES.has(t.status as StoredStatus) &&
    (t.learnedAt === undefined || isNumber(t.learnedAt)) &&
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

function parseExport(json: string): LangleExport {
  const data: unknown = JSON.parse(json);
  if (
    !isObject(data) ||
    (data.format !== EXPORT_FORMAT && data.format !== LEGACY_EXPORT_FORMAT)
  )
    throw new Error("This file is not a Langle export");
  if (!IMPORT_VERSIONS.has(data.version))
    throw new Error(
      `Unsupported Langle export version: ${String(data.version)}`,
    );
  const { terms, sources, occurrences } = data;
  // Version 1 had neither.
  const { meanings, meaningChoices } =
    data.version === 1 ? { meanings: [], meaningChoices: [] } : data;
  if (
    !Array.isArray(terms) ||
    !Array.isArray(sources) ||
    !Array.isArray(occurrences) ||
    !Array.isArray(meanings) ||
    !Array.isArray(meaningChoices) ||
    !terms.every(isTerm) ||
    !sources.every(isSource) ||
    !occurrences.every(isOccurrence) ||
    !meanings.every(isMeaningRecord) ||
    !meaningChoices.every(isChoice)
  )
    throw new Error("The Langle export is damaged");
  return {
    ...(data as unknown as LangleExport),
    occurrences: occurrences.map((o) => omit(o as OccurrenceRecord, "id")),
    meanings,
    meaningChoices,
  };
}
