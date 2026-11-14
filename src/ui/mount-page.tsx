import "@fontsource-variable/inter";
import { render, type VNode } from "preact";
import { startPageErrorLog } from "../check/start";
import { followTheme } from "./page-theme";

/**
 * Starts an extension page (popup, settings, word list): the error log on a check build,
 * then `page()` makes its parts, then the theme, the body margin, and the page itself
 * rendered into `#app`.
 */
export function mountPage(
  page: () => { theme: Parameters<typeof followTheme>[0]; app: VNode },
): void {
  // `npm run build:check` only (src/check/error-log.ts).
  if (import.meta.env.MODE === "check") startPageErrorLog();
  const { theme, app } = page();
  followTheme(theme);
  document.body.style.margin = "0";
  render(app, document.getElementById("app")!);
}
