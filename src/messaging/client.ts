import { browser } from "wxt/browser";
import { PacksUnavailableError } from "../core/packs/unavailable";
import type { Reply, RequestOf, RequestType, ResponseOf } from "./protocol";

const isReply = (value: unknown): value is Reply =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { ok?: unknown }).ok === "boolean";

/**
 * `runtime.sendMessage` found no listener: the service worker was stopping or not yet
 * listening. The request reached nobody, so sending it again is safe.
 */
const NO_RECEIVER = /Receiving end does not exist/;
/**
 * The service worker stopped while it worked on the request: it may or may not have
 * been carried out. Only requests that do the same when repeated are sent again.
 */
const CHANNEL_CLOSED = /message channel closed before a response was received/;
/** The waits before each new try. */
const RETRY_DELAYS_MS = [100, 500];

/**
 * Whether sending a request twice does what sending it once does. Database changes
 * run in one transaction each, so a stopped worker leaves them done or not done.
 */
const REPEATABLE: Record<RequestType, boolean> = {
  getSettings: true,
  setSettings: true,
  getBrowserEnv: true,
  analyze: true,
  matchSelection: true,
  warmDictionary: true,
  lookup: true,
  saveTerm: true,
  setStatus: true,
  // A second removal fails: the term is gone.
  removeTerm: false,
  // Occurrences already recorded are skipped.
  recordEncounters: true,
  // A second save-all finds nothing left to save, and a second undo nothing to undo.
  saveAll: false,
  undoSaveAll: false,
  counts: true,
  syncStatus: true,
  exportJson: true,
  importJson: true,
  lastExport: true,
  listTerms: true,
  listTermsWithStats: true,
  termSummaries: true,
  // Would open a second tab.
  openOptions: false,
  // Sentences already kept for the page are skipped.
  recordHistory: true,
  historyStatus: true,
  clearHistory: true,
  // Translations are kept by their text: a second request writes the same rows.
  cacheTranslations: true,
  packStatus: true,
  // A download in progress is joined, not started twice.
  retryPacks: true,
  // Removing a pack that is gone does nothing.
  removePack: true,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMessage(request: { type: RequestType }): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    const repeatable = REPEATABLE[request.type];
    try {
      const reply: unknown = await browser.runtime.sendMessage(request);
      // The background always answers; nothing at all means its worker stopped
      // before it did (Chromium does not always say so).
      if (isReply(reply) || delay === undefined || !repeatable) return reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const again =
        NO_RECEIVER.test(message) ||
        (CHANNEL_CLOSED.test(message) && repeatable);
      if (delay === undefined || !again) throw error;
    }
    await wait(delay);
  }
}

/**
 * Sends a request to the background and resolves with its typed response. An error
 * reply is rethrown as an `Error` with the background's message: a
 * `PacksUnavailableError` naming the packs when the request needs language data that
 * is not on the device yet (pages wait for `packState` to say they are ready).
 */
export async function send<T extends RequestType>(
  request: { type: T } & RequestOf<T>,
): Promise<ResponseOf<T>> {
  const reply: unknown = await sendMessage(request);
  if (!isReply(reply))
    throw new Error(`No reply from the background to ${request.type}`);
  if (!reply.ok) {
    if (reply.code === "packsUnavailable")
      throw new PacksUnavailableError(
        Array.isArray(reply.packs)
          ? reply.packs.filter((pack) => typeof pack === "string")
          : [],
      );
    throw new Error(reply.error);
  }
  return reply.value as ResponseOf<T>;
}
