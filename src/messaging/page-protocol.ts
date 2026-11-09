/**
 * Requests extension pages (the popup) send to the content script of a tab with
 * `tabs.sendMessage`, about the page in that tab. Every one answers a `PageSummary`.
 */
import type { TermStatus } from "../core/classify";

export type PageRequest =
  /** What "save all" would do on this page, and the last one done. */
  | { type: "pageSummary" }
  /** Saves every unsaved new word of the page, as the end card does. */
  | { type: "pageSaveAll"; status: TermStatus }
  /** Undoes the last save-all of the page. */
  | { type: "pageUndo" };

export interface PageSummary {
  /** False when Lingo does not run on this page (another language, switched off). */
  supported: boolean;
  /** Distinct unsaved new words among the analyzed parts of the page. */
  unsaved: number;
  /** The last save-all on this page view, until it is undone. */
  done: { count: number; target: TermStatus } | null;
}

export const UNSUPPORTED_PAGE: PageSummary = Object.freeze({
  supported: false,
  unsaved: 0,
  done: null,
});

const PAGE_TYPES = new Set(["pageSummary", "pageSaveAll", "pageUndo"]);
const STATUSES = new Set(["learning", "known"]);

export function isPageRequest(message: unknown): message is PageRequest {
  if (typeof message !== "object" || message === null) return false;
  const { type, status } = message as { type?: unknown; status?: unknown };
  if (typeof type !== "string" || !PAGE_TYPES.has(type)) return false;
  return type !== "pageSaveAll" || STATUSES.has(status as string);
}
