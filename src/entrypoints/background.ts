import { browser } from "wxt/browser";
import { openLingoDb } from "../background/db";
import { createHandlers } from "../background/handlers";
import {
  createHistoryStore,
  forgetNeverRunOnHosts,
} from "../background/history-store";
import { createLanguageResources } from "../background/language-resources";
import {
  createPackDownloads,
  startPackDownloads,
} from "../background/pack-downloads";
import { createPackSource, createPackStore } from "../background/pack-store";
import { getSettings, setSettings } from "../background/settings-store";
import { watchBuild } from "../background/self-reload";
import { isCheckLogMessage, startWorkerErrorLog } from "../check/start";
import { createBrowserSyncBackend } from "../background/sync/browser-sync-backend";
import { createTermStore } from "../background/term-store";
import { createTranslationCache } from "../background/translation-cache";
import { createPackLoader } from "../core/packs/load";
import { readLock } from "../core/packs/lock";
import { PACK_STATE_KEY } from "../core/packs/state";

/**
 * Runs each time the service worker starts. Everything is created again on a restart:
 * the database opens on first use, packs load on the first request that needs them,
 * the chosen pair's downloaded packs are brought to their lock version (a download the
 * worker stopped carries on), and sync pulls what other devices wrote while the worker
 * was stopped.
 */
export default defineBackground(() => {
  // `npm run build:check` only: the error log a check reads (src/check/error-log.ts).
  // The mode is a constant at build time, so other builds leave it out.
  if (import.meta.env.MODE === "check") startWorkerErrorLog();

  const db = openLingoDb();
  const store = createTermStore(db);
  const history = createHistoryStore(db);
  const sync = createBrowserSyncBackend({ store });

  const lock = readLock();
  const packStore = createPackStore({
    db,
    lock,
    setState: (states) =>
      browser.storage.local.set({ [PACK_STATE_KEY]: states }),
  });
  const loadPack = createPackLoader(
    createPackSource({ lock, store: packStore }),
  );
  const resources = createLanguageResources(loadPack);
  // A pack whose version switched (or that was removed) is read again when next used.
  packStore.onSwitch((pack) => {
    loadPack.forget(pack);
    resources.forget(pack);
  });
  // Registers its listeners synchronously, so an event that wakes the worker is heard.
  const { retry: retryPacks } = startPackDownloads(
    createPackDownloads({ store: packStore, getSettings }),
  );

  const handle = createHandlers({
    store,
    history,
    translations: createTranslationCache(db),
    settings: { get: getSettings, set: setSettings },
    resources,
    packs: { lock, store: packStore, retry: retryPacks },
    sync,
    openOptionsPage: () => browser.runtime.openOptionsPage(),
  });

  // Registered synchronously so a message that wakes the worker is not missed.
  // Answering through sendResponse (and returning true) works in every browser;
  // returning a Promise does not in all Chromium versions.
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (import.meta.env.MODE === "check" && isCheckLogMessage(message)) return;
    void handle(message, sender).then(sendResponse);
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
