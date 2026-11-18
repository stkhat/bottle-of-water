// Gets or sets the check build's settings, or reads its packs' state, from a web page
// (src/check/settings-channel.ts), as a check in your own Chrome does with Claude in
// Chrome's javascript_tool (docs/development.md "Checking in your own Chrome" has the
// same snippets).
import type { Page } from "@playwright/test";
import type { SettingsPageReply } from "../src/check/settings-channel";

export function checkSettings(
  page: Page,
  action: "get" | "set" | "packs",
  settings?: object,
) {
  return page.evaluate(
    ([action, settings]) =>
      new Promise<SettingsPageReply | "no answer">((done) => {
        const id = String(Math.random());
        addEventListener("message", (e: MessageEvent<SettingsPageReply>) => {
          if (
            e.data?.type === "langle:check-settings" &&
            e.data.reply &&
            e.data.id === id
          )
            done(e.data);
        });
        postMessage(
          { type: "langle:check-settings", action, id, settings },
          "*",
        );
        setTimeout(() => done("no answer"), 5000);
      }),
    [action, settings] as const,
  );
}
