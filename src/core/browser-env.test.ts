import { describe, expect, it } from "vitest";
import {
  createBrowserEnv,
  detectFeatures,
  hasBuiltInAi,
  hasFileSystemAccess,
  hasHighlightUnderline,
  hasTranslator,
} from "./browser-env";

const cssStub = (highlights: boolean, underline: boolean) => ({
  CSS: {
    ...(highlights && { highlights: new Map() }),
    supports: (property: string, value: string) =>
      underline && property === "text-decoration-line" && value === "underline",
  },
});

describe("createBrowserEnv", () => {
  it("names Chrome's sync and extensions page for the chrome build", () => {
    const env = createBrowserEnv("chrome", {});
    expect(env.name).toBe("Chrome");
    expect(env.syncName).toBe("Chrome sync");
    expect(env.extensionsPage).toBe("chrome://extensions");
  });

  it("names Firefox's sync and add-ons page for the firefox build", () => {
    const env = createBrowserEnv("firefox", {});
    expect(env.name).toBe("Firefox");
    expect(env.syncName).toBe("Firefox Sync");
    expect(env.extensionsPage).toBe("about:addons");
  });

  it("gives a rough sync delay in minutes, longer in Firefox", () => {
    expect(createBrowserEnv("chrome", {}).syncDelayHint).toBe(1);
    expect(createBrowserEnv("firefox", {}).syncDelayHint).toBe(10);
  });

  it("uses Chrome's names for other Chromium build targets", () => {
    expect(createBrowserEnv("edge", {}).syncName).toBe("Chrome sync");
  });

  it("defaults to the build target", () => {
    expect(createBrowserEnv().name).toBe(
      import.meta.env.BROWSER === "firefox" ? "Firefox" : "Chrome",
    );
  });

  it("carries the detected features of the given global", () => {
    const env = createBrowserEnv("chrome", {
      Translator: {},
      ...cssStub(true, true),
    });
    expect(env.features).toEqual({
      translator: true,
      builtInAi: false,
      highlightUnderline: true,
      fileSystemAccess: false,
    });
  });
});

describe("feature detection", () => {
  it("detects the built-in translator", () => {
    expect(hasTranslator({ Translator: {} })).toBe(true);
    expect(hasTranslator({})).toBe(false);
  });

  it("detects built-in AI", () => {
    expect(hasBuiltInAi({ LanguageModel: {} })).toBe(true);
    expect(hasBuiltInAi({})).toBe(false);
  });

  it("detects the File System Access API", () => {
    expect(hasFileSystemAccess({ showDirectoryPicker: () => {} })).toBe(true);
    expect(hasFileSystemAccess({})).toBe(false);
  });

  it("detects highlight underlines only with CSS.highlights and underline support", () => {
    expect(hasHighlightUnderline(cssStub(true, true))).toBe(true);
    expect(hasHighlightUnderline(cssStub(false, true))).toBe(false);
    expect(hasHighlightUnderline(cssStub(true, false))).toBe(false);
    expect(hasHighlightUnderline({})).toBe(false);
  });

  it("finds nothing in a bare global", () => {
    expect(detectFeatures({})).toEqual({
      translator: false,
      builtInAi: false,
      highlightUnderline: false,
      fileSystemAccess: false,
    });
  });
});
