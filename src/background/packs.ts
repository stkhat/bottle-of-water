import { browser, type PublicPath } from "wxt/browser";
import { createPackLoader } from "../core/packs/load";

/** Reads a JSON file bundled with the extension (not web-accessible; background only). */
export async function fetchPackJson(path: string): Promise<unknown> {
  const response = await fetch(browser.runtime.getURL(path as PublicPath));
  if (!response.ok)
    throw new Error(`Could not load ${path} (HTTP ${response.status})`);
  return response.json();
}

/** Loads a pack once per service-worker lifetime. */
export const loadPack = createPackLoader(fetchPackJson);
