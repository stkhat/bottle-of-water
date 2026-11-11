import "@fontsource-variable/inter";
import { render } from "preact";
import { startPageErrorLog } from "../../check/start";
import { browser } from "wxt/browser";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import type { PageSummary } from "../../messaging/page-protocol";
import { followTheme } from "../../ui/page-theme";
import { Popup, type PopupDeps } from "./Popup";

// `npm run build:check` only (src/check/error-log.ts).
if (import.meta.env.MODE === "check") startPageErrorLog();

const deps: PopupDeps = {
  send,
  // Content scripts answer by tab; `tabs.sendMessage` needs no permission.
  async askPage(request) {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) return undefined;
    try {
      const reply = (await browser.tabs.sendMessage(tab.id, request)) as
        PageSummary | undefined;
      return reply ?? undefined;
    } catch {
      // No content script there (browser pages, the store, PDFs).
      return undefined;
    }
  },
  watchSettings,
  watchPackState,
  syncName: createBrowserEnv().syncName,
  openOptions() {
    void browser.runtime.openOptionsPage().finally(() => window.close());
  },
  openWordList() {
    void browser.tabs
      .create({
        url: browser.runtime.getURL("/wordlist.html" as "/popup.html"),
      })
      .finally(() => window.close());
  },
  now: Date.now,
  refreshMs: 1000,
};

followTheme(deps);
document.body.style.margin = "0";
render(<Popup deps={deps} />, document.getElementById("app")!);
