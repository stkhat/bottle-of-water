import type { Settings } from "../core/settings";

/** The toolbar icon's sizes, as `public/icon/` and `public/icon-off/` hold them. */
const SIZES = [16, 32, 48, 128] as const;

/**
 * The toolbar icon's files: the green L (the manifest's icons) while Lingo is on, the
 * gray one from `public/icon-off/` while it is switched off.
 */
export function toolbarIconPaths(enabled: boolean): Record<number, string> {
  const dir = enabled ? "icon" : "icon-off";
  return Object.fromEntries(SIZES.map((size) => [size, `/${dir}/${size}.png`]));
}

/** What following the setting needs; the background passes the browser's. */
export interface ToolbarIconDeps {
  /** `action.setIcon({ path })`. */
  setIcon(path: Record<number, string>): Promise<void>;
  getSettings(): Promise<Settings>;
  watchSettings(
    listener: (settings: Settings, previous: Settings) => void,
  ): () => void;
  /** `runtime.onStartup`: the browser resets the icon to the manifest's on a restart. */
  onStartup: { addListener(listener: () => void): void };
}

/**
 * Keeps the toolbar icon gray while Lingo is switched off: set from the stored
 * settings now and at each browser start, and again whenever `enabled` changes (on
 * any device). Registers its listeners synchronously, so a change that wakes the
 * worker is heard. Returns an unwatch.
 */
export function followToolbarIcon(deps: ToolbarIconDeps): () => void {
  const warn = (error: unknown) => console.error(error);
  const apply = (enabled: boolean) =>
    deps.setIcon(toolbarIconPaths(enabled)).catch(warn);
  const applyStored = () => {
    deps.getSettings().then((s) => apply(s.enabled), warn);
  };
  deps.onStartup.addListener(applyStored);
  const unwatch = deps.watchSettings((settings, previous) => {
    if (settings.enabled !== previous.enabled) void apply(settings.enabled);
  });
  applyStored();
  return unwatch;
}
