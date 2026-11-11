import { browser } from "wxt/browser";
import { PACK_STATE_KEY, type PackStates } from "../core/packs/state";
import { mergeSettings, SETTINGS_KEY, type Settings } from "../core/settings";
import { own } from "../core/util";

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export type StorageChangedListener = (
  changes: Record<string, StorageChange>,
  areaName: string,
) => void;

/** `storage.onChanged`. */
export interface StorageChangedEvent {
  addListener(listener: StorageChangedListener): void;
  removeListener(listener: StorageChangedListener): void;
}

/** Calls `listener` with each change in `area`; returns an unwatch. */
export function watchStorage(
  area: "sync" | "local",
  listener: (changes: Record<string, StorageChange>) => void,
  event: StorageChangedEvent = browser.storage.onChanged,
): () => void {
  const onChanged: StorageChangedListener = (changes, areaName) => {
    if (areaName === area) listener(changes);
  };
  event.addListener(onChanged);
  return () => {
    // A content script cut off by an extension reload has no `browser.storage` any
    // more: nothing is listening then.
    try {
      event.removeListener(onChanged);
    } catch {
      // Gone with the extension.
    }
  };
}

const watchStorageKey = (
  area: "sync" | "local",
  key: string,
  listener: (change: StorageChange) => void,
) =>
  watchStorage(area, (changes) => {
    const change = own(changes, key);
    if (change) listener(change);
  });

/** Calls `listener` whenever the settings change (on any device), with the ones before. */
export const watchSettings = (
  listener: (settings: Settings, previous: Settings) => void,
) =>
  watchStorageKey("sync", SETTINGS_KEY, ({ newValue, oldValue }) =>
    listener(mergeSettings(newValue), mergeSettings(oldValue)),
  );

/** Anything else stored under `packState` counts as no states. */
const asStates = (value: unknown): PackStates =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PackStates)
    : {};

/**
 * Calls `listener` with the background's pack states as they are now, then after every
 * change. The states read first are dropped when a change arrived before them.
 */
export function watchPackState(
  listener: (states: PackStates) => void,
): () => void {
  let heard = false;
  let stopped = false;
  const unwatch = watchStorageKey("local", PACK_STATE_KEY, ({ newValue }) => {
    heard = true;
    listener(asStates(newValue));
  });
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
    unwatch();
  };
}
