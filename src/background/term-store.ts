import { Dexie, type Table } from "dexie";
import type {
  StoredStatus,
  TermIndex,
  TermKind,
  TermStatus,
} from "../core/classify";
import {
  clearedAtOf,
  MAX_OCCURRENCES,
  mergeChoice,
  mergeCopy,
  mergeMeaning,
  mergeSeen,
  mergeTerm,
  placeKey,
  sameRecord,
  termKeeps,
  trimOccurrences as rowsToKeep,
} from "../core/cloud/merge";
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
 * The JSON export (version 3). Import still reads version 1, which had no meanings and
 * no meaning choices, and version 2, whose occurrences had no `deviceId` or `addedAt`
 * (they become the importing device's, added when they were seen) and whose terms had
 * no `clearedAt`.
 */
export interface LangleExport {
  format: "langle-export";
  version: 3;
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

/**
 * Local changes are timed after what they replace (architecture "Merge"): a term's
 * change at `max(now, its updatedAt + 1)`, a removal also after the term's rows and
 * choices, a choice after the one it replaces; a new row (`addedAt`) or choice is no
 * earlier than the term's `clearedAt`. Rows recorded here carry this device's id.
 */
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
   * Merges an export (version 1 to 3) by the rules cloud sync merges with
   * (`core/cloud/merge.ts`): per term the newer `updatedAt` wins and `clearedAt` the
   * later; sources widen; choices (the later `at`) and occurrences (one fixed order
   * between copies) are taken in for known terms unless from before the term's
   * `clearedAt`; meanings are joined by key; then the trim.
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
  /**
   * Runs `apply` in one read-write transaction over every table cloud sync merges (the
   * sentence history's and `meta` too), then tells listeners the changes it reported,
   * as taken in from other devices (`"sync"`).
   */
  applyCloud(
    apply: (changed: (lang: string, kind: ChangeKind) => void) => Promise<void>,
  ): Promise<void>;
  /** Called after every committed change, once per language. */
  onChange(
    listener: (lang: string, kind: ChangeKind, origin: ChangeOrigin) => void,
  ): () => void;
}

export interface TermStoreOptions {
  now?: () => number;
  newBatchId?: () => string;
  /** This device's id (`deviceId`), which new rows and choices carry. Default: one per store. */
  deviceId?: () => Promise<string>;
}

const EXPORT_FORMAT = "langle-export";
/** Exports made before the rename to Langle (2026-11-18) still import. */
const LEGACY_EXPORT_FORMAT = "lingo-export";
const EXPORT_VERSION = 3;
/** Versions `importJson` reads. */
const IMPORT_VERSIONS: ReadonlySet<unknown> = new Set([1, 2, 3]);

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

/** The term as a tombstone removed at `at`, cleared then (or later, if it was). */
const tombstoned = (term: TermRecord, at: number): TermRecord => ({
  ...omit(deliberate(term), "learnedAt"),
  status: "removed",
  updatedAt: at,
  clearedAt: Math.max(at, term.clearedAt ?? 0),
});

/** `clearedAt` as a new version of the term carries it: `clearedAtOf` the replaced one. */
const clearedOf = (replaced: TermRecord | undefined) => {
  const clearedAt = replaced ? clearedAtOf(replaced) : 0;
  return clearedAt > 0 ? { clearedAt } : {};
};

/** Distinct values, in order. */
const distinct = <T>(values: Iterable<T>) => [...new Set(values)];

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

function makeOccurrence(
  termId: string,
  sourceId: string,
  { sentence, translation, pos }: Omit<EncounterInput, "termId">,
  seenAt: number,
  origin: Origin,
  recorded: { deviceId: string; addedAt: number },
): OccurrenceRecord {
  return {
    termId,
    sourceId,
    sentence,
    ...(translation !== undefined && { translation }),
    pos,
    seenAt,
    origin,
    deviceId: recorded.deviceId,
    addedAt: recorded.addedAt,
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
    over: readonly Table[] = tables,
  ): Promise<T> {
    const changes = new Changes();
    const result = await db.transaction("rw", over, () => fn(changes));
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
   * Keeps at most `MAX_OCCURRENCES` of a term by dropping the oldest encounters, in the
   * order cloud sync trims by (`core/cloud/merge.ts`). Sentences the term was saved
   * from, and those with a meaning chosen, count toward the limit but are never dropped.
   */
  async function trimOccurrences(id: string) {
    const rows = db.occurrences.where("termId").equals(id);
    if ((await rows.count()) <= MAX_OCCURRENCES) return;
    const all = await rows.toArray();
    const chosen = new Set((await liveChoices(id)).map(placeKey));
    const kept = new Set(rowsToKeep(all, chosen));
    await db.occurrences.bulkDelete(
      all.filter((o) => !kept.has(o)).map((o) => o.id!),
    );
  }

  /**
   * Drops what the term no longer keeps: its rows and choices from before its last
   * removal (`clearedAt`); the caller drops the meanings no choice names then. A
   * removed term keeps (unseen) the ones from after it, as cloud sync does.
   */
  async function settle(term: TermRecord) {
    const keeps = (at: number) => termKeeps(term, at);
    await db.occurrences
      .where("termId")
      .equals(term.id)
      .filter((o) => !keeps(o.addedAt))
      .delete();
    await db.meaningChoices
      .where("termId")
      .equals(term.id)
      .filter((c) => !keeps(c.at))
      .delete();
  }

  /** When a local removal of `term` at `at` is timed: after the term, its rows and its choices. */
  async function removalTime(term: TermRecord, at: number) {
    const [rows, choices] = await Promise.all([
      db.occurrences.where("termId").equals(term.id).toArray(),
      db.meaningChoices.where("termId").equals(term.id).toArray(),
    ]);
    return Math.max(
      at,
      term.updatedAt + 1,
      ...rows.map((o) => o.addedAt + 1),
      ...choices.map((c) => c.at + 1),
    );
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
  function dropUnused(keys: Iterable<string>): Promise<void> {
    const unique = [...new Set(keys)];
    // Without any database work in it, a native promise awaited in a transaction can
    // let the transaction commit before the rest of it runs (PrematureCommitError).
    if (unique.length === 0) return Dexie.Promise.resolve();
    return (async () => {
      for (const key of unique) {
        const named = await db.meaningChoices
          .where("meaningKey")
          .equals(key)
          .count();
        if (named === 0) await db.meanings.delete(key);
      }
    })();
  }

  /** Removes the live term here at `at`: everything it had goes. */
  async function tombstone(term: TermRecord, at: number) {
    await db.terms.put(tombstoned(term, await removalTime(term, at)));
    await deleteRecordsOf([term.id]);
  }

  async function requireTerm(id: string) {
    const term = await db.terms.get(id);
    if (!isLive(term)) throw new Error(`No saved term ${id}`);
    return term;
  }

  /**
   * Writes the term with the input's status (timed after the version it replaces, whose
   * `clearedAt` it keeps), and the sentence as one it was saved from: a copy already
   * there stays when it wins the fixed order (`mergeCopy`: an earlier saved one). The
   * caller trims its occurrences.
   */
  async function writeSaved(input: SaveTermInput, now: number, device: string) {
    const id = termId(input.lang, input.key);
    const existing = await db.terms.get(id);
    const at = Math.max(now, existing ? existing.updatedAt + 1 : 0);
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
        ...clearedOf(existing),
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
      { deviceId: device, addedAt: Math.max(at, clearedAtOf(term)) },
    );
    const same = await findOccurrence(occurrence);
    if (!same) await db.occurrences.add(occurrence);
    else if (mergeCopy(omit(same, "id"), occurrence) === occurrence)
      await db.occurrences.put({ ...occurrence, id: same.id });
    return term;
  }

  /** A row this device records now for the term: no earlier than its `clearedAt`. */
  const recordedNow = (term: TermRecord, device: string, at: number) => ({
    deviceId: device,
    addedAt: Math.max(at, clearedAtOf(term)),
  });

  return {
    async saveTerm(input) {
      if (!input?.source) throw new Error("saveTerm needs a source");
      // Read before the transaction: only database work may be waited for inside it.
      const device = await deviceId();
      return mutate(async (changes) => {
        const term = await writeSaved(input, now(), device);
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
        const seenAt = now();
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
            await upsertSource(input.source, seenAt),
            input,
            seenAt,
            "encountered",
            recordedNow(term, device, seenAt),
          );
          await addOccurrence(occurrence);
        } else {
          term = await writeSaved(
            { ...input, status: "learning" },
            seenAt,
            device,
          );
        }
        // After the choice it replaces, and none from before the term's last removal.
        const at = Math.max(seenAt, (previous?.at ?? 0) + 1, clearedAtOf(term));
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
        const at = Math.max(now(), existing.updatedAt + 1);
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

    async recordEncounters(source, items) {
      const device = await deviceId();
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
            recordedNow(term, device, at),
          );
          if (!(await addOccurrence(occurrence))) continue;
          await trimOccurrences(item.termId);
          changes.add(term.lang, "occurrences");
          added++;
        }
        return added;
      });
    },

    async importOccurrences(id, rows) {
      if (rows.length === 0) return 0;
      const device = await deviceId();
      return mutate(async (changes) => {
        const term = await db.terms.get(id);
        if (!isLive(term)) return 0;
        const recorded = recordedNow(term, device, now());
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
            recorded,
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
        const created = unique.flatMap((key, i): TermRecord[] => {
          const existing = stored[i];
          if (isLive(existing)) return [];
          // After the tombstone it replaces, whose clearedAt it keeps.
          const time = Math.max(at, existing ? existing.updatedAt + 1 : 0);
          return [
            {
              id: termId(lang, key),
              lang,
              key,
              display: key,
              kind: kindOfKey(key),
              status,
              bulk: true,
              batchId,
              createdAt: time,
              updatedAt: time,
              ...clearedOf(existing),
            },
          ];
        });
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
      const device = await deviceId();
      const data = parseExport(json, device);
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
        // turn, so an id that comes twice meets what the first one left.
        const terms = await termsById([
          ...data.terms.map((t) => t.id),
          ...data.meaningChoices.map((c) => c.termId),
          ...data.meanings.map((m) => m.termId),
          ...data.occurrences.map((o) => o.termId),
        ]);
        const takenTerms = new Set<string>();
        const cleared = new Set<string>();
        for (const incoming of data.terms) {
          const local = terms.get(incoming.id);
          const ours = local && omit(local, "batchId");
          const merged = mergeTerm(ours, incoming);
          if (sameRecord(ours, merged)) continue;
          // A "save all" term stays in its batch while only its clearedAt changed.
          const keepsBatch =
            local?.batchId !== undefined &&
            sameRecord(omit(ours!, "clearedAt"), omit(merged, "clearedAt"));
          terms.set(
            incoming.id,
            keepsBatch ? { ...merged, batchId: local.batchId } : merged,
          );
          takenTerms.add(incoming.id);
          if (clearedAtOf(merged) > (local ? clearedAtOf(local) : 0))
            cleared.add(incoming.id);
          changes.add(incoming.lang, "terms");
          result.terms++;
        }
        await db.terms.bulkPut([...takenTerms].map((id) => terms.get(id)!));
        for (const id of cleared) await settle(terms.get(id)!);

        const sourceIds = distinct(data.sources.map((source) => source.id));
        const storedSources = await db.sources.bulkGet(sourceIds);
        const sources = new Map(
          sourceIds.map((id, i) => [id, storedSources[i]]),
        );
        const takenSources = new Set<string>();
        for (const incoming of data.sources) {
          const local = sources.get(incoming.id);
          const merged = mergeSeen(local, incoming);
          if (sameRecord(local, merged)) continue;
          sources.set(incoming.id, merged);
          takenSources.add(incoming.id);
        }
        await db.sources.bulkPut(
          [...takenSources].map((id) => sources.get(id)!),
        );
        result.sources = storedSources.filter((s) => s === undefined).length;

        // Choices before occurrences, so the trim keeps the places with a meaning.
        // Taken in for every known term, kept unseen for a removed one. A settled term
        // may have lost choices too: its meanings are looked at with the others.
        const chosenFor = new Set<string>(cleared);
        for (const incoming of data.meaningChoices) {
          const term = terms.get(incoming.termId);
          if (!term || !termKeeps(term, incoming.at)) continue;
          const local = await db.meaningChoices.get([
            incoming.termId,
            incoming.sourceId,
            incoming.sentence,
          ]);
          if (mergeChoice(local, incoming) === local) continue;
          await db.meaningChoices.put(incoming);
          chosenFor.add(term.id);
          changes.add(term.lang, "occurrences");
        }
        for (const incoming of data.meanings) {
          const term = terms.get(incoming.termId);
          if (!term) continue;
          const local = await db.meanings.get(incoming.key);
          if (mergeMeaning(local, incoming) === local) continue;
          await db.meanings.put(incoming);
          chosenFor.add(term.id);
          changes.add(term.lang, "occurrences");
        }
        if (chosenFor.size > 0)
          await dropUnused(
            await db.meanings
              .where("termId")
              .anyOf([...chosenFor])
              .primaryKeys(),
          );

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
          const term = terms.get(incoming.termId);
          if (!term || !termKeeps(term, incoming.addedAt)) continue;
          if (!known.has(incoming.sourceId)) continue;
          const local = await findOccurrence(incoming);
          if (!local) {
            await db.occurrences.add({ ...incoming });
            result.occurrences++;
          } else {
            const ours = omit(local, "id");
            if (mergeCopy(ours, incoming) === ours) continue;
            await db.occurrences.put({ ...incoming, id: local.id });
          }
          touched.add(term.id);
          changes.add(term.lang, "occurrences");
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
              ...(record.status === "removed"
                ? { clearedAt: Math.max(at, existing?.clearedAt ?? 0) }
                : clearedOf(existing)),
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

    applyCloud(apply) {
      return mutate(
        (changes) => apply((lang, kind) => changes.add(lang, kind)),
        "sync",
        [
          ...tables,
          db.historyPages,
          db.historySentences,
          db.historyForgotten,
          db.meta,
        ],
      );
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
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown) => typeof value === "boolean";
const optional = (value: unknown, is: (value: unknown) => boolean) =>
  value === undefined || is(value);
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

/*
 * Each reader below takes one entry of a file: the record with only the fields this
 * version knows, or undefined for a damaged entry.
 */

function meaningOf(m: unknown): MeaningRecord | undefined {
  if (!isMeaning(m)) return undefined;
  const {
    key,
    termId: id,
    createdAt,
  } = m as unknown as Record<string, unknown>;
  if (!isString(key) || !isString(id) || !isNumber(createdAt)) return undefined;
  return { ...meaningFields(m), key, termId: id, createdAt };
}

function choiceOf(c: unknown): MeaningChoiceRecord | undefined {
  if (
    !isObject(c) ||
    !isString(c.termId) ||
    !isString(c.sourceId) ||
    !isString(c.sentence) ||
    !(c.meaningKey === null || isString(c.meaningKey)) ||
    !isNumber(c.at) ||
    !isString(c.deviceId)
  )
    return undefined;
  const { termId: id, sourceId, sentence, meaningKey, at, deviceId } = c;
  return { termId: id, sourceId, sentence, meaningKey, at, deviceId };
}

function termOf(t: unknown): TermRecord | undefined {
  if (
    !isObject(t) ||
    !isString(t.lang) ||
    !isString(t.key) ||
    t.id !== termId(t.lang, t.key) ||
    !isString(t.display) ||
    !KINDS.has(t.kind as TermKind) ||
    !STATUSES.has(t.status as StoredStatus) ||
    !optional(t.bulk, isBoolean) ||
    !optional(t.learnedAt, isNumber) ||
    !optional(t.note, isString) ||
    !isNumber(t.createdAt) ||
    !isNumber(t.updatedAt) ||
    !optional(t.clearedAt, isNumber)
  )
    return undefined;
  return {
    id: t.id,
    lang: t.lang,
    key: t.key,
    display: t.display,
    kind: t.kind as TermKind,
    status: t.status as StoredStatus,
    ...(t.bulk !== undefined && { bulk: t.bulk as boolean }),
    // Only a known term is learned.
    ...(t.status === "known" &&
      t.learnedAt !== undefined && { learnedAt: t.learnedAt as number }),
    ...(t.note !== undefined && { note: t.note as string }),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...(t.clearedAt !== undefined && { clearedAt: t.clearedAt as number }),
  };
}

function sourceOf(s: unknown): SourceRecord | undefined {
  if (
    !isObject(s) ||
    !isString(s.id) ||
    !PLATFORMS.has(s.platform as Platform) ||
    !isString(s.url) ||
    !isString(s.title) ||
    !isString(s.lang) ||
    !isNumber(s.firstSeen) ||
    !isNumber(s.lastSeen)
  )
    return undefined;
  const { id, url, title, lang, firstSeen, lastSeen } = s;
  return {
    id,
    platform: s.platform as Platform,
    url,
    title,
    lang,
    firstSeen,
    lastSeen,
  };
}

/**
 * An occurrence; `older` (a file before version 3, without `deviceId` and `addedAt`)
 * gives it that device, added when it was seen: never later than it really was, so a
 * removal the file did not know of still takes it.
 */
function occurrenceOf(
  o: unknown,
  older: { deviceId: string } | undefined,
): Omit<OccurrenceRecord, "id"> | undefined {
  if (
    !isObject(o) ||
    !isString(o.termId) ||
    !isString(o.sourceId) ||
    !isString(o.sentence) ||
    !optional(o.translation, isString) ||
    !isObject(o.pos) ||
    !isNumber(o.seenAt) ||
    !ORIGINS.has(o.origin as Origin)
  )
    return undefined;
  const deviceId = older ? older.deviceId : o.deviceId;
  const addedAt = older ? o.seenAt : o.addedAt;
  if (!isString(deviceId) || !isNumber(addedAt)) return undefined;
  return {
    termId: o.termId,
    sourceId: o.sourceId,
    sentence: o.sentence,
    ...(o.translation !== undefined && {
      translation: o.translation as string,
    }),
    pos: o.pos as unknown as Position,
    seenAt: o.seenAt,
    origin: o.origin as Origin,
    deviceId,
    addedAt,
  };
}

/** Every entry read by `of`, or undefined when one is damaged (or `list` is no array). */
function readAll<T>(
  list: unknown,
  of: (entry: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const read = list.map(of);
  return read.every((entry) => entry !== undefined) ? read : undefined;
}

type Imported = Pick<
  LangleExport,
  "terms" | "sources" | "occurrences" | "meanings" | "meaningChoices"
>;

/** Reads an export; the occurrences of an older version become `deviceId`'s. */
function parseExport(json: string, deviceId: string): Imported {
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
  // Version 1 had no meanings and no choices.
  const v1 = data.version === 1;
  const older = data.version === EXPORT_VERSION ? undefined : { deviceId };
  const terms = readAll(data.terms, termOf);
  const sources = readAll(data.sources, sourceOf);
  const occurrences = readAll(data.occurrences, (o) => occurrenceOf(o, older));
  const meanings = v1 ? [] : readAll(data.meanings, meaningOf);
  const meaningChoices = v1 ? [] : readAll(data.meaningChoices, choiceOf);
  if (!terms || !sources || !occurrences || !meanings || !meaningChoices)
    throw new Error("The Langle export is damaged");
  return { terms, sources, occurrences, meanings, meaningChoices };
}
