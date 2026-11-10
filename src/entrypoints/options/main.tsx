import "@fontsource-variable/inter";
import { render } from "preact";
import { browser } from "wxt/browser";
import { watchSettings } from "../../background/settings-store";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { download } from "../../ui/backup/download";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";

const deps: SettingsDeps = {
  send,
  watchSettings,
  // Detected in this page's own context (built-in AI, File System Access).
  env: createBrowserEnv(),
  version: browser.runtime.getManifest().version,
  now: Date.now,
  download,
  refreshMs: 30_000,
};

document.body.style.margin = "0";
render(<SettingsPage deps={deps} />, document.getElementById("app")!);
