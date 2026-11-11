import { browser, type PublicPath } from "wxt/browser";
import type { FetchJson, PackName } from "../core/packs/load";
import type { PackLock } from "../core/packs/lock";
import type { PackStore } from "./pack-store";

/** Reads a JSON file bundled with the extension (not web-accessible; background only). */
export async function fetchPackJson(path: string): Promise<unknown> {
  const response = await fetch(browser.runtime.getURL(path as PublicPath));
  if (!response.ok)
    throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response.json();
}

export interface PackSourceOptions {
  /** The lock this build uses: it says which packs are bundled. */
  lock: PackLock;
  /** The downloaded packs. */
  store: Pick<PackStore, "read">;
}

/**
 * The `FetchJson` the background's pack loader reads through: a file of a bundled pack
 * from the extension (`runtime.getURL`), one of a downloaded pack from the pack store,
 * which rejects with `PacksUnavailableError` while that pack is not on the device.
 */
export function createPackSource({
  lock,
  store,
}: PackSourceOptions): FetchJson {
  return (path) => {
    const [, pack, file] = /^\/packs\/([^/]+)\/(.+)$/.exec(path) ?? [];
    if (
      pack !== undefined &&
      file !== undefined &&
      Object.hasOwn(lock.packs, pack) &&
      !lock.packs[pack as PackName].bundled
    )
      return store.read(pack, file);
    return fetchPackJson(path);
  };
}
