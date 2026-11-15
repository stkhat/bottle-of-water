import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEVICE_ID_KEY, deviceId } from "./device-id";

beforeEach(() => fakeBrowser.reset());

describe("deviceId", () => {
  it("makes a random id on first use and keeps it in storage.local", async () => {
    const id = await deviceId()();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await fakeBrowser.storage.local.get(DEVICE_ID_KEY)).toEqual({
      [DEVICE_ID_KEY]: id,
    });
  });

  it("gives the same id on later uses and after the worker starts again", async () => {
    const get = deviceId();
    const id = await get();
    expect(await get()).toBe(id);
    expect(await deviceId()()).toBe(id);
  });

  it("makes another id on another device", async () => {
    const id = await deviceId()();
    fakeBrowser.reset();
    expect(await deviceId()()).not.toBe(id);
  });
});
