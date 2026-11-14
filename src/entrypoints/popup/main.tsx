import { browser } from "wxt/browser";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { watchPackState, watchSettings } from "../../messaging/storage";
import type { PageSummary } from "../../messaging/page-protocol";
import { mountPage } from "../../ui/mount-page";
import { Popup, type PopupDeps } from "./Popup";

mountPage(() => {
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
    close: () => window.close(),
    now: Date.now,
    refreshMs: 1000,
  };
  return { theme: deps, app: <Popup deps={deps} /> };
});
