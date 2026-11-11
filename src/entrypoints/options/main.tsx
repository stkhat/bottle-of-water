import "@fontsource-variable/inter";
import { render } from "preact";
import { startPageErrorLog } from "../../check/start";
import { browser } from "wxt/browser";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { followTheme } from "../../ui/page-theme";
import { download } from "../../ui/backup/download";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";

// `npm run build:check` only (src/check/error-log.ts).
if (import.meta.env.MODE === "check") startPageErrorLog();

const deps: SettingsDeps = {
  send,
  watchSettings,
  watchPackState,
  // Detected in this page's own context (built-in AI, File System Access).
  env: createBrowserEnv(),
  version: browser.runtime.getManifest().version,
  now: Date.now,
  download,
  refreshMs: 30_000,
};

followTheme(deps);
document.body.style.margin = "0";
render(<SettingsPage deps={deps} />, document.getElementById("app")!);
