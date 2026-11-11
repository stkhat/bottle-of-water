import type { Span } from "../../core/classify";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import type { send } from "../../messaging/client";
import type { TermBrief } from "../../messaging/protocol";
import { warn } from "../lookup/warn";
import type { Store } from "../store";
import type { VideoState } from "./state";

/**
 * The Words tab's short meanings and statuses of one video's terms: each asked for
 * once, as batches are classified, with the status this video last saw (newer than a
 * summary on its way).
 */
export function createSummaries(o: {
  send: typeof send;
  store: Store<VideoState>;
  lang(): string;
  /** Still the video on the page. */
  active(): boolean;
  /** The request found these packs missing. */
  waitFor(packs: readonly string[]): void;
}) {
  const asked = new Set<string>();
  const statuses = new Map<string, TermBrief["status"]>();

  /** Keeps the summaries' statuses with the terms' saved status. */
  function note(changes: Iterable<[string, TermBrief["status"]]>) {
    const current = o.store.get().summaries;
    let summaries: Record<string, TermBrief> | undefined;
    for (const [key, status] of changes) {
      statuses.set(key, status);
      const brief = Object.hasOwn(current, key) ? current[key] : undefined;
      if (!brief || brief.status === status) continue;
      summaries ??= { ...current };
      summaries[key] = { ...brief, status };
    }
    if (summaries) o.store.set({ summaries });
  }

  return {
    note,
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
