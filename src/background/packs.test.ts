import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { fetchPackJson } from "./packs";

beforeEach(() => fakeBrowser.reset());
afterEach(() => vi.unstubAllGlobals());

describe("fetchPackJson", () => {
  it("reads a bundled file from the extension's own URL", async () => {
    const fetch = vi.fn(async () => Response.json(["you", "the"]));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchPackJson("/packs/en/freq.json")).toEqual(["you", "the"]);
    expect(fetch).toHaveBeenCalledWith(
      `chrome-extension://${fakeBrowser.runtime.id}/packs/en/freq.json`,
    );
  });

  it("fails when the file is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(fetchPackJson("/packs/xx/freq.json")).rejects.toThrow(
      "/packs/xx/freq.json",
    );
  });
});
