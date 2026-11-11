import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { applyOverrides, readLock } from "../core/packs/lock";
import { PacksUnavailableError } from "../core/packs/unavailable";
import { createPackSource, fetchPackJson } from "./packs";

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

describe("createPackSource", () => {
  /** A store of downloaded packs (the boundary here) that answers with what was asked. */
  const fakeStore = () => ({
    read: vi.fn(async (pack: string, path: string) => ({ pack, path })),
  });

  it("reads a bundled pack from the extension and a downloaded one from the store", async () => {
    const fetch = vi.fn(async () => Response.json(["you", "the"]));
    vi.stubGlobal("fetch", fetch);
    const store = fakeStore();
    const lock = applyOverrides(
      readLock(),
      { WXT_PACKS_DOWNLOAD: "es,es-en" },
      "test",
    );
    const fetchJson = createPackSource({ lock, store });
    expect(await fetchJson("/packs/en/freq.json")).toEqual(["you", "the"]);
    expect(await fetchJson("/packs/es/freq.json")).toEqual({
      pack: "es",
      path: "freq.json",
    });
    expect(await fetchJson("/packs/es-en/dict-1.json")).toEqual({
      pack: "es-en",
      path: "dict-1.json",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `chrome-extension://${fakeBrowser.runtime.id}/packs/en/freq.json`,
    );
    expect(store.read).toHaveBeenCalledTimes(2);
  });

  it("reads every pack from the extension with the committed lock", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    const store = fakeStore();
    const fetchJson = createPackSource({ lock: readLock(), store });
    await fetchJson("/packs/es/freq.json");
    await fetchJson("/packs/es-en/index.json");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.read).not.toHaveBeenCalled();
  });

  it("passes on that a downloaded pack is not on the device", async () => {
    const store = {
      read: vi.fn(async (pack: string): Promise<unknown> => {
        throw new PacksUnavailableError([pack]);
      }),
    };
    const lock = applyOverrides(
      readLock(),
      { WXT_PACKS_DOWNLOAD: "es" },
      "test",
    );
    await expect(
      createPackSource({ lock, store })("/packs/es/freq.json"),
    ).rejects.toMatchObject({ packs: ["es"] });
  });
});
