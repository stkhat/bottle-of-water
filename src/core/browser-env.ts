import { REVIEW_URLS } from "./links";

/**
 * Browser differences in one place (architecture.md: "Browser differences"). Names
 * come from the build target; features are detected on a global object, never from
 * the user agent. The translator is not among them: it does not exist in the
 * background's service worker, so the UI detects it where it translates.
 */

export interface BrowserEnv {
  /** For UI text, e.g. "Chrome". */
  name: string;
  /** e.g. "Chrome sync". */
  syncName: string;
  /** The store listing's review page ("Rate"); empty until the listing exists. */
  reviewUrl: string;
  features: {
    /** File System Access API (saving to a folder). */
    fileSystemAccess: boolean;
  };
}

/** Targets other than Firefox are Chromium builds and get Chrome's names. */
export function createBrowserEnv(
  target: string = import.meta.env.BROWSER,
  g: object = globalThis,
): BrowserEnv {
  return {
    ...(target === "firefox"
      ? {
          name: "Firefox",
          syncName: "Firefox Sync",
          reviewUrl: REVIEW_URLS.firefoxAddOns,
        }
      : {
          name: "Chrome",
          syncName: "Chrome sync",
          reviewUrl: REVIEW_URLS.chromeWebStore,
        }),
    features: {
      fileSystemAccess: "showDirectoryPicker" in g,
    },
  };
}
