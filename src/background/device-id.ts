import { browser } from "wxt/browser";

/** `storage.local`: this device's id. Never synced or exported on its own. */
export const DEVICE_ID_KEY = "deviceId";

/** This device's id, read once per service worker start. */
export interface DeviceId {
  (): Promise<string>;
  /**
   * Makes and keeps a new id (cloud sync found its folder written by a copied browser
   * profile); later calls give the new one.
   */
  renew(): Promise<string>;
}

/**
 * This device's id: random, made on first use and kept in `storage.local`. Your meanings'
 * choices carry it (equal times are settled by it), and so do the rows this device
 * records; cloud sync names this device's folder after it.
 */
export function deviceId(): DeviceId {
  let id: Promise<string> | undefined;
  async function make() {
    const made = crypto.randomUUID();
    await browser.storage.local.set({ [DEVICE_ID_KEY]: made });
    return made;
  }
  async function read() {
    const stored = (await browser.storage.local.get(DEVICE_ID_KEY))[
      DEVICE_ID_KEY
    ];
    if (typeof stored === "string" && stored !== "") return stored;
    return make();
  }
  const keep = (next: Promise<string>) =>
    (id = next.catch((error: unknown) => {
      // Tried again on the next use.
      id = undefined;
      throw error;
    }));
  const get = () => id ?? keep(read());
  get.renew = () => keep(make());
  return get;
}
