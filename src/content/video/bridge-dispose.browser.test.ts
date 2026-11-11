import { describe, expect, it } from "vitest";
import { createNetflixBridge } from "./netflix-bridge";
import { createPageBridge } from "./youtube-bridge";

/**
 * Disposing a bridge (Lingo leaves the page, as after an extension reload) ends the
 * calls still waiting as aborted: the session ignores aborts instead of reporting them.
 */
describe("disposing a page bridge", () => {
  it("YouTube: a waiting call ends as an abort", async () => {
    const bridge = createPageBridge(window, { timeoutMs: 60_000 });
    const call = bridge.call({ type: "videoId" });
    bridge.dispose();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    await expect(call).rejects.toBeInstanceOf(DOMException);
  });

  it("Netflix: a waiting call ends as an abort", async () => {
    const bridge = createNetflixBridge(window, { timeoutMs: 60_000 });
    const call = bridge.call({ type: "currentMovieId" });
    bridge.dispose();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    await expect(call).rejects.toBeInstanceOf(DOMException);
  });
});
