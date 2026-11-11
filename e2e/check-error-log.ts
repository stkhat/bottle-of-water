// Reads or clears the check build's error log from a web page (src/check/error-log.ts),
// as a check in your own Chrome does with Claude in Chrome's javascript_tool
// (docs/development.md "Checking in your own Chrome" has the same snippet).
import type { Page } from "@playwright/test";
import type { PageReply } from "../src/check/error-log";

export function checkErrorLog(page: Page, action: "read" | "clear") {
  return page.evaluate(
    (action) =>
      new Promise<PageReply[]>((done) => {
        const id = String(Math.random());
        const replies: PageReply[] = [];
        addEventListener("message", (e: MessageEvent<PageReply>) => {
          if (
            e.data?.type === "lingo:check-errors" &&
            e.data.reply &&
            e.data.id === id
          )
            replies.push(e.data);
        });
        postMessage({ type: "lingo:check-errors", action, id }, "*");
        setTimeout(() => done(replies), 1000);
      }),
    action,
  );
}
