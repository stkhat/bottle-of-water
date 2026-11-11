/**
 * Browser differences in one place (architecture.md: "Browser differences").
 * Names come from the build target; features are detected on a global object, which
 * tests pass as a stub. Never branch on the user agent.
 *
 * The built-in translator is not among the features: it does not exist in the
 * background's service worker, where this is detected, so the UI detects it where it
 * translates (`createBuiltInTranslator`).
 */

export interface BrowserFeatures {
  /** Built-in AI (Prompt API). */
  builtInAi: boolean;
  /** CSS Custom Highlight API with underlines (refined in M5). */
  highlightUnderline: boolean;
  /** File System Access API (saving to a folder). */
  fileSystemAccess: boolean;
}

export interface BrowserEnv {
  /** Browser name for UI text, e.g. "Chrome". */
  name: string;
  /** The browser's sync service, e.g. "Chrome sync". */
  syncName: string;
  /** Rough delay in minutes before sync reaches other devices. */
  syncDelayHint: number;
  /** Where the user manages extensions (third way to open the settings page). */
  extensionsPage: string;
  features: BrowserFeatures;
}

type Names = Omit<BrowserEnv, "features">;

const CHROME: Names = {
  name: "Chrome",
  syncName: "Chrome sync",
  syncDelayHint: 1,
  extensionsPage: "chrome://extensions",
};

const FIREFOX: Names = {
  name: "Firefox",
  syncName: "Firefox Sync",
  syncDelayHint: 10,
  extensionsPage: "about:addons",
};

type Global = object;

export function hasBuiltInAi(g: Global): boolean {
  return "LanguageModel" in g;
}

export function hasFileSystemAccess(g: Global): boolean {
  return "showDirectoryPicker" in g;
}

export function hasHighlightUnderline(g: Global): boolean {
  const css = (g as { CSS?: Partial<typeof CSS> }).CSS;
  if (css?.highlights === undefined || typeof css.supports !== "function")
    return false;
  return css.supports("text-decoration-line", "underline");
}

export function detectFeatures(g: Global = globalThis): BrowserFeatures {
  return {
    builtInAi: hasBuiltInAi(g),
    highlightUnderline: hasHighlightUnderline(g),
    fileSystemAccess: hasFileSystemAccess(g),
  };
}

/**
 * The environment for a build target (WXT's `import.meta.env.BROWSER`). Targets
 * other than Firefox are Chromium builds and get Chrome's names.
 */
export function createBrowserEnv(
  target: string = import.meta.env.BROWSER,
  g: Global = globalThis,
): BrowserEnv {
  const names = target === "firefox" ? FIREFOX : CHROME;
  return { ...names, features: detectFeatures(g) };
}
