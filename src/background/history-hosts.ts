import type { HistoryStore } from "./history-store";
import { watchSettings } from "./settings-store";

const host = (entry: string) => entry.trim().toLowerCase();

/** The hosts in `after` that were not in `before` (case and spaces ignored), each once. */
export function addedHosts(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const old = new Set(before.map(host));
  return [...new Set(after.map(host))].filter(
    (entry) => entry !== "" && !old.has(entry),
  );
}

/**
 * Removes the kept pages of each host added to "Never run on" (here or on another
 * device), with its subdomains. Only changes count: nothing is removed on start.
 * Returns the unwatch function.
 */
export function forgetNeverRunOnHosts(
  history: Pick<HistoryStore, "forgetHost">,
): () => void {
  return watchSettings((settings, previous) => {
    for (const entry of addedHosts(previous.neverRunOn, settings.neverRunOn))
      history.forgetHost(entry).catch((error: unknown) => console.error(error));
  });
}
