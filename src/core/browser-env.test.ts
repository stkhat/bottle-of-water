import { describe, expect, it } from "vitest";
import { createBrowserEnv } from "./browser-env";

describe("createBrowserEnv", () => {
  it("names Chrome and its sync for the chrome build", () => {
    const env = createBrowserEnv("chrome", {});
    expect(env.name).toBe("Chrome");
    expect(env.syncName).toBe("Chrome sync");
  });

  it("names Firefox and its sync for the firefox build", () => {
    const env = createBrowserEnv("firefox", {});
    expect(env.name).toBe("Firefox");
    expect(env.syncName).toBe("Firefox Sync");
  });

  it("uses Chrome's names for other Chromium build targets", () => {
    expect(createBrowserEnv("edge", {}).syncName).toBe("Chrome sync");
  });

  it("defaults to the build target", () => {
    expect(createBrowserEnv().name).toBe(
      import.meta.env.BROWSER === "firefox" ? "Firefox" : "Chrome",
    );
  });

  it("detects built-in AI and the File System Access API on the given global", () => {
    expect(createBrowserEnv("chrome", {}).features).toEqual({
      builtInAi: false,
      fileSystemAccess: false,
    });
    expect(
      createBrowserEnv("chrome", {
        LanguageModel: {},
        showDirectoryPicker: () => {},
      }).features,
    ).toEqual({ builtInAi: true, fileSystemAccess: true });
    expect(createBrowserEnv("chrome", { LanguageModel: {} }).features).toEqual({
      builtInAi: true,
      fileSystemAccess: false,
    });
  });
});
