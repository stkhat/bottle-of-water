/**
 * Requests extension pages (the popup) send to the content script of a tab with
 * `tabs.sendMessage`, about the page in that tab. Every one answers a `PageSummary`.
 */
import type { TermStatus } from "../core/classify";

export type PageRequest =
  /** What "save all" would do on this page, and the last one done. */
  | { type: "pageSummary" }
  /** Saves every unsaved new word of the page. */
  | { type: "pageSaveAll"; status: TermStatus }
  /** Undoes the last save-all of the page. */
  | { type: "pageUndo" }
  /** Opens "Words on this page" (an article; a video page has its Words tab). */
  | { type: "pageShowWords" };

export interface PageSummary {
  /** False when Lingo does not run on this page (another language, switched off). */
  supported: boolean;
  /** The page's host, for the popup's "On this site" (the popup cannot read tab URLs). */
  hostname: string;
  /** What the popup's save-all is about: an article page or a video. */
  scope: "page" | "video";
  /** Distinct unsaved new words among the analyzed parts of the page. */
  unsaved: number;
  /** The last save-all on this page view, until it is undone. */
  done: { count: number; target: TermStatus } | null;
}

/** The answer for a page Lingo does not run on. */
export function unsupportedPage(
  hostname: string,
  scope: PageSummary["scope"],
): PageSummary {
  return { supported: false, hostname, scope, unsaved: 0, done: null };
}

const PAGE_TYPES = new Set([
  "pageSummary",
  "pageSaveAll",
  "pageUndo",
  "pageShowWords",
]);
const STATUSES = new Set(["learning", "known"]);

export function isPageRequest(message: unknown): message is PageRequest {
  if (typeof message !== "object" || message === null) return false;
  const { type, status } = message as { type?: unknown; status?: unknown };
  if (typeof type !== "string" || !PAGE_TYPES.has(type)) return false;
  return type !== "pageSaveAll" || STATUSES.has(status as string);
}
