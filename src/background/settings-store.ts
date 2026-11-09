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

/** Calls `listener` with the new settings whenever they change (from any device). */
export function watchSettings(
  listener: (settings: Settings) => void,
): () => void {
  const onChanged = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area !== "sync" || !Object.hasOwn(changes, SETTINGS_KEY)) return;
    listener(mergeSettings(changes[SETTINGS_KEY]!.newValue));
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}
