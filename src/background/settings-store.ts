import { browser } from "wxt/browser";
import type { CloudProviderId } from "../core/cloud/provider";
import {
  mergeTimedSettings,
  stampSettings,
  type FileSettings,
  type TimedSettings,
} from "../core/cloud/settings";
import { firstPair } from "../core/languages";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  SETTINGS_KEY,
  SETTINGS_TIMES_KEY,
  type Settings,
  type SettingsPatch,
} from "../core/settings";
import { serial } from "../core/util";
import { watchStorage, type StorageChangedEvent } from "../messaging/storage";
import type { CloudSettings } from "./sync/cloud-sync-backend";

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

// Writes from this context run one after another so patches never overwrite each other.
const writes = serial();

const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The stored field times, cleaned up; none when missing or damaged. */
function timesOf(raw: unknown): TimedSettings | undefined {
  if (!isDict(raw) || !isDict(raw.times)) return undefined;
  const times: Record<string, number> = {};
  for (const [field, time] of Object.entries(raw.times))
    if (typeof time === "number" && Number.isFinite(time) && time > 0)
      times[field] = time;
  return { values: mergeSettings(raw.values), times };
}

/**
 * The stored settings with their field times. A field whose value is not the one the
 * times describe was changed without them (by an older version, through browser sync)
 * and counts as changed at `at`; so do the non-default fields of settings stored before
 * field times existed.
 */
async function readTimed(
  at: number,
): Promise<{ timed: TimedSettings; stored: unknown }> {
  const stored = await browser.storage.sync.get([
    SETTINGS_KEY,
    SETTINGS_TIMES_KEY,
  ]);
  const values = mergeSettings(stored[SETTINGS_KEY]);
  const timed = stampSettings(values, at, timesOf(stored[SETTINGS_TIMES_KEY]));
  return { timed, stored: stored[SETTINGS_TIMES_KEY] };
}

/**
 * The settings with the time each field last changed, for cloud sync. Times it had to
 * give (see `readTimed`) are stored, so reading again gives the same ones.
 */
export function getTimedSettings(now = Date.now): Promise<TimedSettings> {
  return writes.run(async () => {
    const { timed, stored } = await readTimed(now());
    if (JSON.stringify(timed) !== JSON.stringify(stored))
      await browser.storage.sync.set({ [SETTINGS_TIMES_KEY]: timed });
    return timed;
  });
}

/**
 * Applies a patch on top of the stored settings, stores the result and returns it. The
 * fields it changed get the time of the change (after their previous time), stored in
 * the same write.
 */
export function setSettings(
  patch: SettingsPatch,
  now = Date.now,
): Promise<Settings> {
  return writes.run(async () => {
    const at = now();
    const { timed } = await readTimed(at);
    const next = stampSettings(mergeSettings(patch, timed.values), at, timed);
    await browser.storage.sync.set({
      [SETTINGS_KEY]: next.values,
      [SETTINGS_TIMES_KEY]: next,
    });
    return next.values;
  });
}

/**
 * Merges settings from another device's cloud file into the stored ones, field by
 * field (`mergeTimedSettings`). Returns what was stored, or undefined when nothing
 * changed.
 */
function takeTimedSettings(
  incoming: FileSettings,
  now = Date.now,
): Promise<TimedSettings | undefined> {
  return writes.run(async () => {
    const { timed } = await readTimed(now());
    const merged = mergeTimedSettings(timed, incoming);
    if (JSON.stringify(merged) === JSON.stringify(timed)) return undefined;
    await browser.storage.sync.set({
      [SETTINGS_KEY]: merged.values,
      [SETTINGS_TIMES_KEY]: merged,
    });
    return merged;
  });
}

/**
 * The settings as cloud sync uses them. `watch` hears every change of the field times
 * but those `take` stored: a change made here, or one browser sync brought.
 */
export function cloudSettings(
  onChanged: StorageChangedEvent = browser.storage.onChanged,
): CloudSettings {
  const taken = new Set<string>();
  return {
    get: () => getTimedSettings(),
    async take(incoming) {
      const stored = await takeTimedSettings(incoming);
      if (stored) taken.add(JSON.stringify(stored));
    },
    async choose(provider: CloudProviderId | "none") {
      await setSettings({ cloudProvider: provider });
    },
    watch(listener) {
      return watchStorage(
        "sync",
        (changes) => {
          const change = changes[SETTINGS_TIMES_KEY];
          if (!change) return;
          if (taken.delete(JSON.stringify(change.newValue))) return;
          listener();
        },
        onChanged,
      );
    },
  };
}

/** Whether settings are stored: written on this device, or brought by browser sync. */
export async function settingsStored(): Promise<boolean> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return stored[SETTINGS_KEY] !== undefined;
}

/**
 * Stores the language pair to start with when no settings are stored (`onInstalled`):
 * on a new install the pair the browser's UI language suggests (`firstPair`), after an
 * update the default pair, the one used so far. Stored settings win: those of this
 * device, or those browser sync brought from another one. The pair counts as never
 * changed (time 0), so any device's choice wins over it in cloud sync.
 */
export function storeStartingPair(
  reason: string,
  uiLanguage: string,
): Promise<void> {
  return writes.run(async () => {
    if (await settingsStored()) return;
    const pair =
      reason === "install"
        ? firstPair(uiLanguage)
        : {
            learningLang: DEFAULT_SETTINGS.learningLang,
            nativeLang: DEFAULT_SETTINGS.nativeLang,
          };
    const settings = mergeSettings(pair);
    const timed: TimedSettings = { values: settings, times: {} };
    await browser.storage.sync.set({
      [SETTINGS_KEY]: settings,
      [SETTINGS_TIMES_KEY]: timed,
    });
  });
}
