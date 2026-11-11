import { browser } from "wxt/browser";
import {
  answerLogRequest,
  answerPageRequests,
  createErrorLog,
  createRelay,
  isLogRequest,
  MESSAGE_TYPE,
  recordErrors,
  type CheckError,
  type LogRequest,
  type RecorderScope,
} from "./error-log";

/**
 * Check builds only: starts the error log in each kind of Lingo context (error-log.ts).
 * Callers guard every call with `import.meta.env.MODE === "check"`, so other builds
 * leave this module out.
 */

const scope = globalThis as unknown as RecorderScope;

const sessionStore = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

/**
 * In the service worker, first thing: records its own errors into the log and answers
 * the other contexts' messages. Call `isCheckLogMessage` in the worker's other
 * `onMessage` listener to leave these to this one.
 */
export function startWorkerErrorLog(): void {
  const log = createErrorLog(browser.storage.local);
  recordErrors({
    scope,
    context: "service worker",
    sink: (entry) => void log.append([entry]),
  });
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isLogRequest(message)) return;
    void answerLogRequest(log, message).then(sendResponse);
    return true;
  });
}

export const isCheckLogMessage = isLogRequest;

function startRelay(
  context: string,
  isOurs?: (stack?: string, file?: string) => boolean,
) {
  // Kept now: after a reload of the extension, old content scripts lose `browser.runtime`.
  const runtime = browser.runtime;
  const ask = (request: LogRequest) => runtime.sendMessage(request);
  const relay = createRelay({
    send: (entries: CheckError[]) =>
      ask({ type: MESSAGE_TYPE, action: "append", entries }),
    store: sessionStore(),
  });
  recordErrors({ scope, context, sink: (entry) => relay.push(entry), isOurs });
  void relay.flush();
  return { relay, ask };
}

/** On the extension's own pages (popup, options, word list). */
export function startPageErrorLog(): void {
  startRelay(`extension page ${location.pathname}`);
}

/** A flag on the content scripts' shared global: one recorder per isolated world. */
const STARTED = Symbol.for("lingo.checkErrorLog");

/**
 * In a content script (`name`: "article", "youtube", "netflix"): records the script's
 * errors (not the page's) and answers a page's requests to read or clear the log.
 */
export function startContentErrorLog(name: string): void {
  const flags = globalThis as { [STARTED]?: true };
  if (flags[STARTED]) return;
  flags[STARTED] = true;
  const origin = (browser.runtime.getURL as (path: string) => string)("/");
  const isOurs = (stack?: string, file?: string) =>
    Boolean(stack?.includes(origin) || file?.startsWith(origin));
  const context = `content script ${name}`;
  const { relay, ask } = startRelay(context, isOurs);
  answerPageRequests({
    window,
    context,
    relay,
    ask: (action) => ask({ type: MESSAGE_TYPE, action }),
  });
}
