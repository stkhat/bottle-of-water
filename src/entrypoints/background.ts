import { browser } from "wxt/browser";
import { openLangleDb } from "../background/db";
import { deviceId } from "../background/device-id";
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
import {
  cloudSettings,
  getSettings,
  setSettings,
} from "../background/settings-store";
import { watchBuild } from "../background/self-reload";
import { isCheckLogMessage, startWorkerErrorLog } from "../check/start";
import { createBrowserSyncBackend } from "../background/sync/browser-sync-backend";
import {
  cloudAccount,
  cloudConnected,
  createCloudSyncBackend,
} from "../background/sync/cloud-sync-backend";
import { createGoogleAuth } from "../background/sync/google-auth";
import {
  DEVELOPMENT_GOOGLE_CLIENTS,
  PRODUCTION_GOOGLE_CLIENTS,
} from "../background/sync/google-clients";
import { createDriveFiles } from "../core/cloud/google-drive";
import type { CloudProvider, CloudProviderId } from "../core/cloud/provider";
import { createTermStore } from "../background/term-store";
import { followToolbarIcon } from "../background/toolbar-icon";
import { createTranslationCache } from "../background/translation-cache";
import { createExplanationCache } from "../background/explanation-cache";
import { createPackLoader } from "../core/packs/load";
import { readLock } from "../core/packs/lock";
import { PACK_STATE_KEY } from "../core/packs/state";
import { watchSettings } from "../messaging/storage";

/**
 * Runs each time the service worker starts. Everything is created again on a restart:
 * the database opens on first use, packs load on the first request that needs them,
 * the chosen pair's packs are brought to their lock version (a download the worker
 * stopped carries on; a new install first chooses its pair from the browser's UI
 * language), and sync pulls what other devices wrote while the worker was stopped.
 */
export default defineBackground(() => {
  // `npm run build:check` only: the error log a check reads (src/check/error-log.ts),
  // with the pack mirrors' tries. The mode is a constant at build time, so other
  // builds leave it out.
  const checkLog =
    import.meta.env.MODE === "check" ? startWorkerErrorLog() : undefined;

  const device = deviceId();
  const db = openLangleDb("langle", { deviceId: device });
  const store = createTermStore(db, { deviceId: device });
  const history = createHistoryStore(db, { deviceId: device });
  const sync = createBrowserSyncBackend({
    store,
    termsInCloud: () => cloudConnected(),
  });
  const cloud = createCloudSyncBackend({
    db,
    store,
    history,
    settings: cloudSettings(),
    deviceId: device,
    providers: cloudProviders(),
    browserSync: sync,
  });

  const lock = readLock();
  const packStore = createPackStore({
    db,
    lock,
    setState: (states) =>
      browser.storage.local.set({ [PACK_STATE_KEY]: states }),
    ...(checkLog && { onMirror: checkLog.onMirror }),
  });
  const loadPack = createPackLoader(createPackSource(packStore));
  const resources = createLanguageResources(loadPack);
  // A pack whose version switched (or that was removed) is read again when next used.
  packStore.onSwitch((pack) => {
    loadPack.forget(pack);
    resources.forget(pack);
  });
  // Registers its listeners synchronously, so an event that wakes the worker is heard.
  const { retry: retryPacks } = startPackDownloads(
    createPackDownloads({ store: packStore, getSettings }),
    () => browser.i18n.getUILanguage(),
  );

  const handle = createHandlers({
    store,
    history,
    translations: createTranslationCache(db),
    explanations: createExplanationCache(db),
    settings: { get: getSettings, set: setSettings },
    resources,
    packs: { lock, store: packStore, retry: retryPacks },
    sync,
    cloud,
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

  // Gray while Langle is switched off (the popup header's switch).
  followToolbarIcon({
    setIcon: (path) => browser.action.setIcon({ path }),
    getSettings,
    watchSettings,
    onStartup: browser.runtime.onStartup,
  });

  sync.start().catch((error: unknown) => console.error(error));
  // Registers its alarm listener synchronously, so the alarm that woke the worker is heard.
  cloud.start().catch((error: unknown) => console.error(error));

  // `npm run build:check` only: reload when a new build is copied in. The mode is a
  // constant at build time, so other builds leave this (and self-reload.ts) out.
  if (import.meta.env.MODE === "check")
    watchBuild().catch((error: unknown) => console.error(error));
});

/**
 * The cloud providers this build can connect to. Google Drive needs the build's Google
 * clients: production has none until the store item's client is registered, so nothing
 * can connect there yet. The mode is a constant at build time, so production builds
 * leave the development clients out.
 */
function cloudProviders(): Partial<Record<CloudProviderId, CloudProvider>> {
  const google =
    import.meta.env.MODE === "production"
      ? PRODUCTION_GOOGLE_CLIENTS
      : DEVELOPMENT_GOOGLE_CLIENTS;
  if (!google) return {};
  return {
    googleDrive: {
      id: "googleDrive",
      files: createDriveFiles(),
      auth: createGoogleAuth({
        webClientId: google.web,
        account: () => cloudAccount(),
      }),
    },
  };
}
