/**
 * This device's data as one `CloudState` (`core/cloud/state.ts`), and the changes a
 * merge over it made, stored back: cloud sync merges with the reference merge itself, so
 * the stored data follows it exactly. Settings are not part of it (they live in
 * `storage.sync`: `settings-store.ts`).
 */
import { pageSize, sentenceSize } from "../../core/history-size";
import { historyKey, placeKey, sameRecord } from "../../core/cloud/merge";
import { emptyState, type CloudState } from "../../core/cloud/state";
import { omit } from "../../core/util";
import type { LangleDb } from "../db";

/** The stored copy, with what the state leaves out: local ids and "save all" batches. */
export interface LocalCopy {
  state: CloudState;
  occurrenceIds: Map<string, number>;
  sentenceIds: Map<string, number>;
  batchIds: Map<string, string>;
  /** Page id → its counted `bytes`. */
  pageBytes: Map<string, number>;
}

const byKey = <T>(rows: readonly T[], keyOf: (row: T) => string) =>
  new Map(rows.map((row) => [keyOf(row), row]));

/** Reads the whole copy. Inside a transaction over its tables, or in one of its own. */
export async function readCopy(db: LangleDb): Promise<LocalCopy> {
  const [
    terms,
    sources,
    occurrences,
    meanings,
    choices,
    pages,
    sentences,
    forgotten,
    cleared,
  ] = await Promise.all([
    db.terms.toArray(),
    db.sources.toArray(),
    db.occurrences.toArray(),
    db.meanings.toArray(),
    db.meaningChoices.toArray(),
    db.historyPages.toArray(),
    db.historySentences.toArray(),
    db.historyForgotten.toArray(),
    db.meta.get("historyClearedAt"),
  ]);
  const state = emptyState();
  const batchIds = new Map<string, string>();
  for (const term of terms) {
    if (term.batchId !== undefined) batchIds.set(term.id, term.batchId);
    state.terms.set(term.id, omit(term, "batchId"));
  }
  state.sources = byKey(sources, (s) => s.id);
  const occurrenceIds = new Map<string, number>();
  for (const o of occurrences) {
    const key = placeKey(o);
    occurrenceIds.set(key, o.id!);
    state.occurrences.set(key, omit(o, "id"));
  }
  state.meanings = byKey(meanings, (m) => m.key);
  state.choices = byKey(choices, placeKey);
  const pageBytes = new Map<string, number>();
  for (const page of pages) {
    pageBytes.set(page.id, page.bytes);
    state.pages.set(page.id, omit(page, "bytes"));
  }
  const sentenceIds = new Map<string, number>();
  for (const s of sentences) {
    const key = historyKey(s);
    sentenceIds.set(key, s.id!);
    state.sentences.set(key, omit(s, "id"));
  }
  state.historyForgotten = new Map(forgotten.map((f) => [f.host, f.at]));
  state.historyClearedAt = cleared?.value ?? 0;
  return { state, occurrenceIds, sentenceIds, batchIds, pageBytes };
}

/** The keys whose values `after` changed or added, and the keys it no longer has. */
function diff<T>(before: Map<string, T>, after: Map<string, T>) {
  const put: [string, T][] = [];
  const gone: [string, T][] = [];
  for (const [key, value] of after)
    if (!sameRecord(before.get(key), value)) put.push([key, value]);
  for (const [key, value] of before)
    if (!after.has(key)) gone.push([key, value]);
  return { put, gone };
}

const langOf = (termId: string) => termId.slice(0, termId.indexOf(":"));

/**
 * Stores what `after` (the copy's state after a merge) changed, in the caller's
 * transaction, and reports each language's change (`terms`, or only `occurrences`:
 * rows, choices, meanings). Page sizes and the history's total are counted again.
 */
export async function storeCopy(
  db: LangleDb,
  copy: LocalCopy,
  after: CloudState,
  changed: (lang: string, kind: "terms" | "occurrences") => void,
): Promise<void> {
  const before = copy.state;

  const terms = diff(before.terms, after.terms);
  await db.terms.bulkPut(
    terms.put.map(([id, term]) => {
      const batchId = copy.batchIds.get(id);
      const old = before.terms.get(id);
      // A "save all" term stays in its batch while only its clearedAt changed.
      const keepsBatch =
        batchId !== undefined &&
        old !== undefined &&
        sameRecord(omit(old, "clearedAt"), omit(term, "clearedAt"));
      changed(term.lang, "terms");
      return keepsBatch ? { ...term, batchId } : term;
    }),
  );

  const sources = diff(before.sources, after.sources);
  await db.sources.bulkPut(sources.put.map(([, s]) => s));
  await db.sources.bulkDelete(sources.gone.map(([id]) => id));

  const rowsOf = (termId: string) => changed(langOf(termId), "occurrences");
  const occurrences = diff(before.occurrences, after.occurrences);
  await db.occurrences.bulkDelete(
    occurrences.gone.map(([key, o]) => {
      rowsOf(o.termId);
      return copy.occurrenceIds.get(key)!;
    }),
  );
  await db.occurrences.bulkPut(
    occurrences.put.map(([key, o]) => {
      rowsOf(o.termId);
      const id = copy.occurrenceIds.get(key);
      return id === undefined ? { ...o } : { ...o, id };
    }),
  );

  const meanings = diff(before.meanings, after.meanings);
  for (const [, m] of [...meanings.put, ...meanings.gone]) rowsOf(m.termId);
  await db.meanings.bulkDelete(meanings.gone.map(([key]) => key));
  await db.meanings.bulkPut(meanings.put.map(([, m]) => m));

  const choices = diff(before.choices, after.choices);
  for (const [, c] of [...choices.put, ...choices.gone]) rowsOf(c.termId);
  await db.meaningChoices.bulkDelete(
    choices.gone.map(
      ([, c]) => [c.termId, c.sourceId, c.sentence] as [string, string, string],
    ),
  );
  await db.meaningChoices.bulkPut(choices.put.map(([, c]) => c));

  const sentences = diff(before.sentences, after.sentences);
  await db.historySentences.bulkDelete(
    sentences.gone.map(([key]) => copy.sentenceIds.get(key)!),
  );
  await db.historySentences.bulkPut(
    sentences.put.map(([key, s]) => {
      const id = copy.sentenceIds.get(key);
      return id === undefined ? { ...s } : { ...s, id };
    }),
  );

  const pages = diff(before.pages, after.pages);
  await db.historyPages.bulkDelete(pages.gone.map(([id]) => id));
  const historyChanged =
    pages.put.length +
      pages.gone.length +
      sentences.put.length +
      sentences.gone.length >
    0;
  if (historyChanged) {
    const bytes = new Map<string, number>();
    for (const page of after.pages.values()) bytes.set(page.id, pageSize(page));
    for (const s of after.sentences.values())
      if (bytes.has(s.pageId))
        bytes.set(s.pageId, bytes.get(s.pageId)! + sentenceSize(s));
    const changedPages = new Set(pages.put.map(([id]) => id));
    await db.historyPages.bulkPut(
      [...after.pages.values()]
        .filter(
          (page) =>
            changedPages.has(page.id) ||
            copy.pageBytes.get(page.id) !== bytes.get(page.id),
        )
        .map((page) => ({ ...page, bytes: bytes.get(page.id)! })),
    );
    let total = 0;
    for (const value of bytes.values()) total += value;
    await db.meta.put({ key: "historyBytes", value: total });
  }

  if (after.historyClearedAt !== before.historyClearedAt)
    await db.meta.put({
      key: "historyClearedAt",
      value: after.historyClearedAt,
    });
  const forgotten = diff(before.historyForgotten, after.historyForgotten);
  await db.historyForgotten.bulkPut(
    forgotten.put.map(([host, at]) => ({ host, at })),
  );
}
