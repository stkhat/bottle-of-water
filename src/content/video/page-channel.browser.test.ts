import { describe, expect, it } from "vitest";
import { createPageBridge } from "./page-channel";

/**
 * Disposing the bridge (Lingo leaves the page, as after an extension reload) ends the
 * calls still waiting as aborted: the session ignores aborts instead of reporting them.
 */
describe("disposing a page bridge", () => {
  it("ends a waiting call as an abort", async () => {
    const bridge = createPageBridge<{ type: "ping" }, { ping: null }, string>({
      channel: { fromPage: "test", toPage: "test-request" },
      isEvent: (data): data is string => typeof data === "string",
      timeoutMs: 60_000,
    });
    const call = bridge.call({ type: "ping" });
    bridge.dispose();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    await expect(call).rejects.toBeInstanceOf(DOMException);
  });
});
