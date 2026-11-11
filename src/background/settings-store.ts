import { browser } from "wxt/browser";
import type { Settings, SettingsPatch } from "../core/settings";
import { mergeSettings } from "../core/settings";

/** The `storage.sync` key that holds the whole settings object. */
export const SETTINGS_KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

// Writes from this context run one after another so patches never overwrite each other.
let writes: Promise<unknown> = Promise.resolve();

/** Applies a patch on top of the stored settings, stores the result and returns it. */
export function setSettings(patch: SettingsPatch): Promise<Settings> {
  const write = writes.then(async () => {
    const settings = mergeSettings(patch, await getSettings());
    await browser.storage.sync.set({ [SETTINGS_KEY]: settings });
    return settings;
  });
  writes = write.catch(() => undefined);
  return write;
}

/**
 * Calls `listener` with the new settings whenever they change (from any device), and
 * the settings before the change.
 */
export function watchSettings(
  listener: (settings: Settings, previous: Settings) => void,
): () => void {
  const onChanged = (
    changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
    area: string,
  ) => {
    if (area !== "sync" || !Object.hasOwn(changes, SETTINGS_KEY)) return;
    const { newValue, oldValue } = changes[SETTINGS_KEY]!;
    listener(mergeSettings(newValue), mergeSettings(oldValue));
  };
  // Kept: a content script cut off by an extension reload has no `browser.storage`
  // any more when it stops watching.
  const event = browser.storage.onChanged;
  event.addListener(onChanged);
  return () => {
    try {
      event.removeListener(onChanged);
    } catch {
      // Gone with the extension: nothing is listening any more.
    }
  };
}
