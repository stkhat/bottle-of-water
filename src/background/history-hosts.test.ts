import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { addedHosts, forgetNeverRunOnHosts } from "./history-hosts";
import { setSettings } from "./settings-store";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("addedHosts", () => {
  it("gives the hosts in the new list that were not in the old one", () => {
    expect(addedHosts(["a.com"], ["a.com", "b.com", "c.org"])).toEqual([
      "b.com",
      "c.org",
    ]);
    expect(addedHosts(["a.com", "b.com"], ["a.com"])).toEqual([]);
    expect(addedHosts([], [])).toEqual([]);
  });

  it("ignores case and spaces, and gives each host once", () => {
    expect(addedHosts(["A.com"], [" a.com", "B.com", "b.com "])).toEqual([
      "b.com",
    ]);
  });
});

describe("forgetNeverRunOnHosts", () => {
  it("forgets the kept pages of hosts added to Never run on", async () => {
    await setSettings({ neverRunOn: ["a.com"] });
    const history = { forgetHost: vi.fn(async () => 1) };
    forgetNeverRunOnHosts(history);

    await setSettings({ neverRunOn: ["a.com", "b.com"] });
    await vi.waitFor(() => expect(history.forgetHost).toHaveBeenCalledTimes(1));
    expect(history.forgetHost).toHaveBeenCalledWith("b.com");

    // Removing a host, other settings and the popup's sites forget nothing.
    await setSettings({ neverRunOn: ["b.com"] });
    await setSettings({ knownLevel: 5000, disabledSites: ["c.com"] });
    await setSettings({ neverRunOn: ["b.com", "d.com", "e.com"] });
    await vi.waitFor(() => expect(history.forgetHost).toHaveBeenCalledTimes(3));
    expect(history.forgetHost.mock.calls).toEqual([
      ["b.com"],
      ["d.com"],
      ["e.com"],
    ]);
  });

  it("forgets nothing on start and stops when unwatched", async () => {
    await setSettings({ neverRunOn: ["a.com"] });
    const history = { forgetHost: vi.fn(async () => 0) };
    const unwatch = forgetNeverRunOnHosts(history);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.forgetHost).not.toHaveBeenCalled();

    unwatch();
    await setSettings({ neverRunOn: ["a.com", "b.com"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.forgetHost).not.toHaveBeenCalled();
  });

  it("logs a failure to forget and goes on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const history = {
      forgetHost: vi.fn(async (host: string) => {
        if (host === "a.com") throw new Error("database closed");
        return 1;
      }),
    };
    forgetNeverRunOnHosts(history);
    await setSettings({ neverRunOn: ["a.com", "b.com"] });
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(history.forgetHost).toHaveBeenCalledWith("b.com");
    error.mockRestore();
  });
});
