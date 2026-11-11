import { browser } from "wxt/browser";
import { PACK_STATE_KEY, type PackStates } from "../core/packs/state";

/** What is stored under `packState`, as states; anything else counts as none. */
const asStates = (value: unknown): PackStates =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PackStates)
    : {};

/**
 * Calls `listener` with the background's pack states (`packState` in `storage.local`,
 * which content scripts and extension pages can read) as they are now, then after
 * every change; returns an unsubscribe. The states read first are dropped when a change
 * arrived before them.
 */
export function watchPackState(
  listener: (states: PackStates) => void,
): () => void {
  let heard = false;
  let stopped = false;
  const onChanged = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area !== "local" || !Object.hasOwn(changes, PACK_STATE_KEY)) return;
    heard = true;
    listener(asStates(changes[PACK_STATE_KEY]!.newValue));
  };
  browser.storage.onChanged.addListener(onChanged);
  browser.storage.local.get(PACK_STATE_KEY).then(
    (stored) => {
      if (!heard && !stopped) listener(asStates(stored[PACK_STATE_KEY]));
    },
    () => {
      if (!heard && !stopped) listener({});
    },
  );
  return () => {
    stopped = true;
    browser.storage.onChanged.removeListener(onChanged);
  };
}
