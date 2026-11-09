import { browser } from "wxt/browser";
import { openLingoDb } from "../background/db";
import { createHandlers } from "../background/handlers";
import { createLanguageResources } from "../background/language-resources";
import { loadPack } from "../background/packs";
import { getSettings, setSettings } from "../background/settings-store";
import { createBrowserSyncBackend } from "../background/sync/browser-sync-backend";
import { createTermStore } from "../background/term-store";
import { createBrowserEnv } from "../core/browser-env";

/**
 * Runs each time the service worker starts. Everything is created again on a restart:
 * the database opens on first use, packs load on the first request that needs them,
 * and sync pulls what other devices wrote while the worker was stopped.
 */
export default defineBackground(() => {
  const store = createTermStore(openLingoDb());
  const sync = createBrowserSyncBackend({ store });
  const handle = createHandlers({
    store,
    settings: { get: getSettings, set: setSettings },
    resources: createLanguageResources(loadPack),
    sync,
    env: () => createBrowserEnv(),
  });

  // Registered synchronously so a message that wakes the worker is not missed.
  // Answering through sendResponse (and returning true) works in every browser;
  // returning a Promise does not in all Chromium versions.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handle(message).then(sendResponse);
    return true;
  });

  sync.start().catch((error: unknown) => console.error(error));
});
