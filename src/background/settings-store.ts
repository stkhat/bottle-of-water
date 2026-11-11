import { browser } from "wxt/browser";
import {
  mergeSettings,
  SETTINGS_KEY,
  type Settings,
  type SettingsPatch,
} from "../core/settings";

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
