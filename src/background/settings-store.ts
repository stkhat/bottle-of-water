import { browser } from "wxt/browser";
import { firstPair } from "../core/languages";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  SETTINGS_KEY,
  type Settings,
  type SettingsPatch,
} from "../core/settings";
import { serial } from "../core/util";

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

// Writes from this context run one after another so patches never overwrite each other.
const writes = serial();

/** Applies a patch on top of the stored settings, stores the result and returns it. */
export function setSettings(patch: SettingsPatch): Promise<Settings> {
  return writes.run(async () => {
    const settings = mergeSettings(patch, await getSettings());
    await browser.storage.sync.set({ [SETTINGS_KEY]: settings });
    return settings;
  });
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
 * device, or those browser sync brought from another one.
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
    await browser.storage.sync.set({
      [SETTINGS_KEY]: mergeSettings(pair),
    });
  });
}
