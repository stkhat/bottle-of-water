import { browser } from "wxt/browser";

/** `storage.local`: this device's id. Never synced or exported on its own. */
export const DEVICE_ID_KEY = "deviceId";

/**
 * This device's id: random, made on first use and kept in `storage.local`. Your meanings'
 * choices carry it (equal times are settled by it), and cloud sync will use the same id.
 * The function reads storage once per service worker start.
 */
export function deviceId(): () => Promise<string> {
  let id: Promise<string> | undefined;
  async function read() {
    const stored = (await browser.storage.local.get(DEVICE_ID_KEY))[
      DEVICE_ID_KEY
    ];
    if (typeof stored === "string" && stored !== "") return stored;
    const made = crypto.randomUUID();
    await browser.storage.local.set({ [DEVICE_ID_KEY]: made });
    return made;
  }
  return () => {
    id ??= read().catch((error: unknown) => {
      // Tried again on the next use.
      id = undefined;
      throw error;
    });
    return id;
  };
}
