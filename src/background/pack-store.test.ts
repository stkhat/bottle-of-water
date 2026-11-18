import { describe, expect, it, vi } from "vitest";
import { PacksUnavailableError } from "../core/packs/unavailable";
import { createPackSource } from "./pack-store";

describe("createPackSource", () => {
  /** A store of downloaded packs (the boundary here) that answers with what was asked. */
  const fakeStore = () => ({
    read: vi.fn(async (pack: string, path: string) => ({ pack, path })),
  });

  it("reads every pack's files from the store", async () => {
    const store = fakeStore();
    const fetchJson = createPackSource(store);
    expect(await fetchJson("/packs/en/freq.json")).toEqual({
      pack: "en",
      path: "freq.json",
    });
    expect(await fetchJson("/packs/es-en/dict-1.json")).toEqual({
      pack: "es-en",
      path: "dict-1.json",
    });
    expect(store.read).toHaveBeenCalledTimes(2);
  });

  it("refuses a path that names no pack file", async () => {
    const store = fakeStore();
    await expect(createPackSource(store)("/popup.html")).rejects.toThrow(
      "Not a pack file: /popup.html",
    );
    expect(store.read).not.toHaveBeenCalled();
  });

  it("passes on that a pack is not on the device", async () => {
    const store = {
      read: vi.fn(async (pack: string): Promise<unknown> => {
        throw new PacksUnavailableError([pack]);
      }),
    };
    await expect(
      createPackSource(store)("/packs/en/freq.json"),
    ).rejects.toMatchObject({ packs: ["en"] });
  });
});
