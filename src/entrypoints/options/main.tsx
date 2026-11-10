import "@fontsource-variable/inter";
import { render } from "preact";
import { browser } from "wxt/browser";
import { watchSettings } from "../../background/settings-store";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";

/** Downloads `text` as a file through a Blob URL (needs no permission). */
function download(fileName: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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
