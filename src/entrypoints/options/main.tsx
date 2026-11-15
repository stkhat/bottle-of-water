import { browser } from "wxt/browser";
import { chromePromptApi } from "../../content/explain/chrome-prompt-api";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { download } from "../../ui/backup/download";
import { mountPage } from "../../ui/mount-page";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";

mountPage(() => {
  const deps: SettingsDeps = {
    send,
    watchSettings,
    watchPackState,
    // Detected in this page's own context (File System Access, the Prompt API).
    env: createBrowserEnv(),
    explainProvider: chromePromptApi(),
    version: browser.runtime.getManifest().version,
    now: Date.now,
    download,
    refreshMs: 30_000,
  };
  return { theme: deps, app: <SettingsPage deps={deps} /> };
});
