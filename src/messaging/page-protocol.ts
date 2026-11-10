/**
 * Requests extension pages (the popup) send to the content script of a tab with
 * `tabs.sendMessage`, about the page in that tab. Every one answers a `PageSummary`.
 */
export type PageRequest =
  /** Whether Lingo runs on this page, and its host. */
  { type: "pageSummary" };

export interface PageSummary {
  /** False when Lingo does not run on this page (another language, switched off). */
  supported: boolean;
  /** The page's host, for the popup's "On this site" (the popup cannot read tab URLs). */
  hostname: string;
}

/** The answer for a page Lingo does not run on. */
export function unsupportedPage(hostname: string): PageSummary {
  return { supported: false, hostname };
}

export function isPageRequest(message: unknown): message is PageRequest {
  if (typeof message !== "object" || message === null) return false;
  return (message as { type?: unknown }).type === "pageSummary";
}
