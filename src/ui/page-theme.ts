import type { Settings } from "../core/settings";
import type { send as Send } from "../messaging/client";
import { THEME_CSS } from "./theme";

/**
 * An extension page (popup, settings, word list) follows the theme setting: the
 * variables go on `<html>`, so the page's own background is themed too. Until the
 * settings answer, the page's `data-lingo-theme="system"` (index.html) applies.
 */
export function followTheme(deps: {
  send: typeof Send;
  watchSettings(listener: (settings: Settings) => void): () => void;
}): void {
  const style = document.createElement("style");
  style.textContent = THEME_CSS;
  document.head.append(style);
  const apply = (settings: Settings) => {
    document.documentElement.dataset.lingoTheme = settings.theme;
  };
  deps.send({ type: "getSettings" }).then(apply, () => {});
  deps.watchSettings(apply);
}
