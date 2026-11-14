import { describe, expect, it, vi } from "vitest";
import { mergeSettings, type Settings } from "../core/settings";
import { settingsListeners } from "../testing/stubs";
import { followToolbarIcon, toolbarIconPaths } from "./toolbar-icon";

describe("toolbarIconPaths", () => {
  it("is the manifest's green icon while on and the gray one while off", () => {
    expect(toolbarIconPaths(true)).toEqual({
      16: "/icon/16.png",
      32: "/icon/32.png",
      48: "/icon/48.png",
      128: "/icon/128.png",
    });
    expect(toolbarIconPaths(false)).toEqual({
      16: "/icon-off/16.png",
      32: "/icon-off/32.png",
      48: "/icon-off/48.png",
      128: "/icon-off/128.png",
    });
  });
});

describe("followToolbarIcon", () => {
  function fake(stored: Partial<Settings>) {
    let settings = mergeSettings(stored);
    const watchers = settingsListeners(settings);
    const startup: (() => void)[] = [];
    const setIcon = vi.fn<(path: Record<number, string>) => Promise<void>>(
      async () => {},
    );
    const unwatch = followToolbarIcon({
      setIcon,
      getSettings: async () => settings,
      watchSettings: watchers.watch,
      onStartup: { addListener: (listener) => startup.push(listener) },
    });
    const dirs = () =>
      setIcon.mock.calls.map(([path]) => path[16]!.split("/")[1]);
    return {
      dirs,
      unwatch,
      change(patch: Partial<Settings>) {
        settings = mergeSettings(patch, settings);
        watchers.emit(settings);
      },
      restartBrowser: () => startup.forEach((listener) => listener()),
    };
  }

  it("sets the icon from the stored settings when the worker starts", async () => {
    const f = fake({ enabled: false });
    await expect.poll(f.dirs).toEqual(["icon-off"]);
  });

  it("follows the switch, and only the switch", async () => {
    const f = fake({});
    await expect.poll(f.dirs).toEqual(["icon"]);
    f.change({ enabled: false });
    f.change({ knownLevel: 5000 });
    f.change({ enabled: true });
    await expect.poll(f.dirs).toEqual(["icon", "icon-off", "icon"]);
  });

  it("sets it again when the browser starts", async () => {
    const f = fake({ enabled: false });
    await expect.poll(f.dirs).toEqual(["icon-off"]);
    f.restartBrowser();
    await expect.poll(f.dirs).toEqual(["icon-off", "icon-off"]);
  });
});
