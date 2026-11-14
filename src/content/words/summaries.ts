import type { Span } from "../../core/classify";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import type { send } from "../../messaging/client";
import type { TermBrief } from "../../messaging/protocol";
import { warn } from "../lookup/warn";
import type { Store } from "../store";
import type { TranslationQueue } from "../translate/queue";
import {
  createListMeanings,
  withTranslation,
  type ListRow,
} from "./list-meanings";

/** What a page's Words list reads its short meanings and statuses from. */
export interface SummariesState {
  summaries: Record<string, TermBrief>;
}

/**
 * The short meanings and statuses of one page's terms (a video's Words tab): each
 * asked for once, as batches are classified, with the status this page last saw
 * (newer than a summary on its way). Meanings in another language are translated as
 * the list shows their rows, and follow every translation the page's queue makes
 * (`createListMeanings`).
 */
export function createSummaries(o: {
  send: typeof send;
  store: Store<SummariesState>;
  /** The page's queue, which the hover card and the window translate with too. */
  translator: TranslationQueue;
  lang(): string;
  nativeLang(): string;
  /** Still the page (the video) these summaries are of. */
  active(): boolean;
  /** The request found these packs missing. */
  waitFor(packs: readonly string[]): void;
  /** The page moved on: no more translations. */
  signal?: AbortSignal;
}) {
  const asked = new Set<string>();
  const statuses = new Map<string, TermBrief["status"]>();
  const own = (key: string) => {
    const current = o.store.get().summaries;
    return Object.hasOwn(current, key) ? current[key] : undefined;
  };

  const meanings = createListMeanings({
    send: o.send,
    translator: o.translator,
    lang: o.lang,
    nativeLang: o.nativeLang,
    meanings: () => Object.entries(o.store.get().summaries),
    meaning: own,
    translated(changes) {
      if (!o.active()) return;
      const summaries = { ...o.store.get().summaries };
      for (const [key, translated] of changes)
        if (Object.hasOwn(summaries, key))
          summaries[key] = withTranslation(summaries[key]!, translated);
      o.store.set({ summaries });
    },
    ...(o.signal && { signal: o.signal }),
  });

  /** Keeps the summaries' statuses with the terms' saved status. */
  function note(changes: Iterable<[string, TermBrief["status"]]>) {
    const current = o.store.get().summaries;
    let summaries: Record<string, TermBrief> | undefined;
    for (const [key, status] of changes) {
      statuses.set(key, status);
      const brief = own(key);
      if (!brief || brief.status === status) continue;
      summaries ??= { ...current };
      summaries[key] = { ...brief, status };
    }
    if (summaries) o.store.set({ summaries });
  }

  return {
    note,
    /** The list shows these rows (keyed by the terms' keys). */
    shown(rows: readonly ListRow[]) {
      meanings.shown(rows);
    },
    /**
     * Notes the saved status of classified terms and asks the summaries of the ones not
     * asked yet (one request).
     */
    classified(spans: Span[], saved: ReadonlySet<string>) {
      const found = new Map<string, TermBrief["status"]>();
      const keys: string[] = [];
      for (const { key, category } of spans) {
        if (category === "ignored") continue;
        // A saved term's span has its status; "known" alone may be the level's.
        found.set(key, saved.has(key) && category !== "new" ? category : "new");
        if (asked.has(key)) continue;
        asked.add(key);
        keys.push(key);
      }
      note(found);
      if (keys.length === 0) return;
      o.send({ type: "termSummaries", lang: o.lang(), keys })
        .then((answer) => {
          if (!o.active()) return;
          const summaries = { ...o.store.get().summaries };
          for (const [key, brief] of Object.entries(answer))
            summaries[key] = {
              ...brief,
              status: statuses.get(key) ?? brief.status,
            };
          o.store.set({ summaries });
          // Rows shown before their meanings came.
          meanings.refresh(Object.keys(answer));
        })
        .catch((error: unknown) => {
          // Asked again with the next batch, or once the dictionary's data is there.
          for (const key of keys) asked.delete(key);
          if (error instanceof PacksUnavailableError) o.waitFor(error.packs);
          warn(error);
        });
    },
  };
}
