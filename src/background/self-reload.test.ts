import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { watchBuild } from "./self-reload";

/** The build id file as the extension's folder holds it; undefined: missing. */
let onDisk: string | undefined;
const fetchFile = vi.fn(async (url: string, init?: RequestInit) => {
  void url;
  void init;
  return onDisk === undefined
    ? new Response("", { status: 404 })
    : new Response(`${onDisk}\n`);
});
const reload = vi.fn();
let stop: (() => void) | undefined;

const start = async () => {
  stop = await watchBuild({ fetch: fetchFile, reload, intervalMs: 2000 });
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers();
  onDisk = "2026-11-10T10:00:00Z abc1234";
  fetchFile.mockClear();
  reload.mockClear();
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("watchBuild", () => {
  it("reads the build id fresh from the extension's folder", async () => {
    await start();
    const [url, init] = fetchFile.mock.calls[0]!;
    expect(url).toBe("chrome-extension://test-extension-id/build-id.txt");
    expect(init).toEqual({ cache: "no-store" });
  });

  it("does nothing while the build id stays the same", async () => {
    await start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFile.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once when the build id changes", async () => {
    await start();
    await vi.advanceTimersByTimeAsync(2000);
    onDisk = "2026-11-10T10:05:00Z def5678";
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).toHaveBeenCalledOnce();
    // It stops polling after asking for the reload.
    const calls = fetchFile.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFile.mock.calls.length).toBe(calls);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores a missing build id (a copy in progress) and waits for the new one", async () => {
    await start();
    onDisk = undefined;
    await vi.advanceTimersByTimeAsync(4000);
    expect(reload).not.toHaveBeenCalled();
    onDisk = "2026-11-10T10:05:00Z def5678";
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("ignores a failed read", async () => {
    await start();
    fetchFile.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("on a worker start, reloads when the build changed since the previous start", async () => {
    await start();
    stop?.();
    // The worker slept; a new build was copied in; the worker starts again.
    onDisk = "2026-11-10T10:05:00Z def5678";
    await start();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("on a worker start with the same build, does not reload", async () => {
    await start();
    stop?.();
    await start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("on the first start after a reload (empty session storage), does not reload", async () => {
    await start();
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).not.toHaveBeenCalled();
  });
});
