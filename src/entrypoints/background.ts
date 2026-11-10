import { browser } from "wxt/browser";
import { openLingoDb } from "../background/db";
import { createHandlers } from "../background/handlers";
import { forgetNeverRunOnHosts } from "../background/history-hosts";
import { createHistoryStore } from "../background/history-store";
import { createLanguageResources } from "../background/language-resources";
import { loadPack } from "../background/packs";
import { getSettings, setSettings } from "../background/settings-store";
import { watchBuild } from "../background/self-reload";
import { createBrowserSyncBackend } from "../background/sync/browser-sync-backend";
import { createTermStore } from "../background/term-store";
import { createBrowserEnv } from "../core/browser-env";

/**
 * Runs each time the service worker starts. Everything is created again on a restart:
 * the database opens on first use, packs load on the first request that needs them,
 * and sync pulls what other devices wrote while the worker was stopped.
 */
export default defineBackground(() => {
  const db = openLingoDb();
  const store = createTermStore(db);
  const history = createHistoryStore(db);
  const sync = createBrowserSyncBackend({ store });
  const handle = createHandlers({
    store,
    history,
    settings: { get: getSettings, set: setSettings },
    resources: createLanguageResources(loadPack),
    sync,
    env: () => createBrowserEnv(),
    openOptionsPage: () => browser.runtime.openOptionsPage(),
  });

  // Registered synchronously so a message that wakes the worker is not missed.
  // Answering through sendResponse (and returning true) works in every browser;
  // returning a Promise does not in all Chromium versions.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handle(message).then(sendResponse);
    return true;
  });

  // Registered synchronously too, so a change that wakes the worker is heard.
  forgetNeverRunOnHosts(history);

  sync.start().catch((error: unknown) => console.error(error));

  // `npm run build:check` only: reload when a new build is copied in. The mode is a
  // constant at build time, so other builds leave this (and self-reload.ts) out.
  if (import.meta.env.MODE === "check")
    watchBuild().catch((error: unknown) => console.error(error));
});
