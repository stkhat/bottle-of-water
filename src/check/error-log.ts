/**
 * Check builds only (`wxt build --mode check`, `npm run build:check`): an error log the
 * extension keeps itself, so a check in your own Chrome can read what Chrome's
 * chrome://extensions → Errors page would show without opening that page. Every Lingo
 * context records its `console.error` / `console.warn` calls, uncaught errors and
 * unhandled rejections; the service worker keeps them in `storage.local`, and a web
 * page reads and clears them through the content script (`answerPageRequests`).
 * Production builds leave all of this out (`npm run test:manifest` checks it).
 */

/** One entry, as the Errors page would list it. */
export interface CheckError {
  level: "error" | "warning";
  message: string;
  stack?: string;
  /** "service worker", "extension page /popup.html", "content script youtube"… */
  context: string;
  /** The page (or the worker's script) it happened on. */
  url: string;
  /** ISO time. */
  time: string;
}

/** The `storage.local` key holding the log, oldest entry first. */
export const ERROR_LOG_KEY = "checkErrorLog";
/** The log keeps the newest this many entries. */
export const MAX_ENTRIES = 200;
/** A content script or page keeps at most this many entries it could not send yet. */
export const MAX_PENDING = 50;
/** The `type` of every message of this log: to the background and on the page. */
export const MESSAGE_TYPE = "lingo:check-errors";

const MAX_MESSAGE = 2000;
const MAX_STACK = 4000;

/** A message to the background. */
export type LogRequest =
  | { type: typeof MESSAGE_TYPE; action: "append"; entries: CheckError[] }
  | { type: typeof MESSAGE_TYPE; action: "read" | "clear" };

export function isLogRequest(message: unknown): message is LogRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === MESSAGE_TYPE
  );
}

/** The part of `storage.local` the log uses. */
export interface LogStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ErrorLog {
  append(entries: CheckError[]): Promise<void>;
  read(): Promise<CheckError[]>;
  clear(): Promise<void>;
}

/** The log in `storage`. Changes run one after another, so none is lost. */
export function createErrorLog(storage: LogStorage): ErrorLog {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async () =>
    ((await storage.get(ERROR_LOG_KEY))[ERROR_LOG_KEY] as
      CheckError[] | undefined) ?? [];
  const run = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    append: (entries) =>
      run(async () => {
        if (entries.length === 0) return;
        const all = [...(await read()), ...entries].slice(-MAX_ENTRIES);
        await storage.set({ [ERROR_LOG_KEY]: all });
      }),
    read: () => run(read),
    clear: () => run(() => storage.remove(ERROR_LOG_KEY)),
  };
}

/** Answers one of the log's messages in the background: the entries for a read. Never rejects. */
export async function answerLogRequest(
  log: ErrorLog,
  request: LogRequest,
): Promise<CheckError[] | true> {
  try {
    if (request.action === "append") await log.append(request.entries);
    else if (request.action === "clear") await log.clear();
    else return await log.read();
  } catch {
    // The log is a check aid: a failing storage must not make more noise.
  }
  return true;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The global scope a recorder listens on: `window` or the worker's `self`. */
export interface RecorderScope {
  console: Pick<Console, "error" | "warn">;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface RecorderOptions {
  scope: RecorderScope;
  context: string;
  /** Where entries go. Must not log itself (what it logs is not recorded). */
  sink: (entry: CheckError) => void;
  url?: () => string;
  now?: () => Date;
  /**
   * Whether an uncaught error or rejection is Lingo's (content scripts share the page's
   * window). Console calls in Lingo's scope are always Lingo's.
   */
  isOurs?: (stack: string | undefined, filename: string | undefined) => boolean;
}

/**
 * Records `scope`'s console errors and warnings (still printing them) and its uncaught
 * errors and unhandled rejections into `sink`. Returns an uninstall.
 */
export function recordErrors(options: RecorderOptions): () => void {
  const { scope, context, sink } = options;
  const url = options.url ?? (() => String(globalThis.location?.href ?? ""));
  const now = options.now ?? (() => new Date());
  const isOurs = options.isOurs ?? (() => true);
  let busy = false;

  function record(
    level: CheckError["level"],
    message: string,
    stack: string | undefined,
  ) {
    if (busy) return;
    busy = true;
    try {
      sink({
        level,
        message: clip(message, MAX_MESSAGE),
        ...(stack && { stack: clip(stack, MAX_STACK) }),
        context,
        url: url(),
        time: now().toISOString(),
      });
    } catch {
      // Nothing to do: the entry is lost, and saying so would record again.
    } finally {
      busy = false;
    }
  }

  const original = { error: scope.console.error, warn: scope.console.warn };
  const wrap =
    (level: CheckError["level"], print: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      print.apply(scope.console, args);
      const error = args.find((arg) => arg instanceof Error);
      record(
        level,
        args.map(describe).join(" "),
        error?.stack ?? new Error().stack?.split("\n").slice(2).join("\n"),
      );
    };
  scope.console.error = wrap("error", original.error);
  scope.console.warn = wrap("warning", original.warn);

  const onError = (event: Event) => {
    const { error, message, filename } = event as ErrorEvent;
    const stack = (error as Error | undefined)?.stack;
    if (!isOurs(stack, filename)) return;
    record(
      "error",
      `Uncaught ${error === undefined ? message : describe(error)}`,
      stack,
    );
  };
  const onRejection = (event: Event) => {
    const { reason } = event as PromiseRejectionEvent;
    const stack = (reason as Error | undefined)?.stack;
    if (!isOurs(stack, undefined)) return;
    record("error", `Uncaught (in promise) ${describe(reason)}`, stack);
  };
  scope.addEventListener("error", onError);
  scope.addEventListener("unhandledrejection", onRejection);

  return () => {
    scope.console.error = original.error;
    scope.console.warn = original.warn;
    scope.removeEventListener("error", onError);
    scope.removeEventListener("unhandledrejection", onRejection);
  };
}

/** The part of `sessionStorage` a relay keeps its pending entries in. */
export type PendingStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** The `sessionStorage` key of a relay's pending entries. */
export const PENDING_KEY = "lingo-check-errors";

export interface Relay {
  push(entry: CheckError): void;
  /** Sends what is pending; resolves once tried. Never rejects. */
  flush(): Promise<void>;
  /** The entries not sent yet. */
  pending(): CheckError[];
  clear(): void;
}

/**
 * Hands entries to the background with `send` (content scripts and extension pages
 * cannot write the log safely themselves). Entries that could not be sent (the
 * extension was reloaded under a content script) stay pending, newest `MAX_PENDING`,
 * also in `store` (the tab's `sessionStorage`), so the script that runs after the
 * tab's reload sends them.
 */
export function createRelay(options: {
  send: (entries: CheckError[]) => Promise<unknown>;
  store?: PendingStore | undefined;
}): Relay {
  const { send, store } = options;
  let pending: CheckError[] = [];
  try {
    const saved = store?.getItem(PENDING_KEY);
    if (saved) pending = JSON.parse(saved) as CheckError[];
  } catch {
    pending = [];
  }
  const save = () => {
    try {
      if (pending.length === 0) store?.removeItem(PENDING_KEY);
      else store?.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // Storage refused (full, blocked): the entries stay in memory.
    }
  };
  let sending: Promise<void> | undefined;

  async function sendPending() {
    const batch = pending.slice();
    if (batch.length === 0) return;
    try {
      await send(batch);
    } catch {
      return;
    }
    pending = pending.filter((entry) => !batch.includes(entry));
    save();
  }

  function flush(): Promise<void> {
    sending ??= sendPending().finally(() => {
      sending = undefined;
    });
    return sending;
  }

  return {
    push(entry) {
      pending = [...pending, entry].slice(-MAX_PENDING);
      save();
      void Promise.resolve().then(flush);
    },
    async flush() {
      // A flush already under way may have taken only part of what is pending.
      await sending;
      await flush();
    },
    pending: () => pending.slice(),
    clear() {
      pending = [];
      save();
    },
  };
}

/** A web page's request (see `readCheckErrors`). */
export interface PageRequest {
  type: typeof MESSAGE_TYPE;
  action: "read" | "clear";
  id: string;
}

/** A content script's answer to a page. */
export interface PageReply {
  type: typeof MESSAGE_TYPE;
  id: string;
  reply: true;
  context: string;
  /** False when the background could not be reached (the extension was reloaded). */
  connected: boolean;
  entries: CheckError[];
}

const isPageRequest = (data: unknown): data is PageRequest => {
  const d = data as Partial<PageRequest & { reply: unknown }> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    d.type === MESSAGE_TYPE &&
    d.reply === undefined &&
    (d.action === "read" || d.action === "clear") &&
    typeof d.id === "string"
  );
};

/**
 * Answers a page's `window.postMessage` requests to read or clear the log (with this
 * script's pending entries). `ask` sends a request to the background and rejects when
 * it cannot. Keeps answering after the extension is gone, with what is pending.
 * Returns a stop.
 */
export function answerPageRequests(options: {
  window: Pick<
    Window,
    "addEventListener" | "removeEventListener" | "postMessage"
  >;
  context: string;
  relay: Relay;
  ask: (action: "read" | "clear") => Promise<unknown>;
}): () => void {
  const { window: win, context, relay, ask } = options;
  const onMessage = (event: MessageEvent) => {
    if (event.source !== win || !isPageRequest(event.data)) return;
    const { action, id } = event.data;
    void (async () => {
      let connected = true;
      let entries: CheckError[] = [];
      if (action === "read") {
        await relay.flush();
        try {
          entries = (await ask("read")) as CheckError[];
        } catch {
          connected = false;
        }
        entries = [...entries, ...relay.pending()];
      } else {
        relay.clear();
        try {
          await ask("clear");
        } catch {
          connected = false;
        }
      }
      const reply: PageReply = {
        type: MESSAGE_TYPE,
        id,
        reply: true,
        context,
        connected,
        entries,
      };
      win.postMessage(reply, "*");
    })();
  };
  win.addEventListener("message", onMessage as (event: Event) => void);
  return () =>
    win.removeEventListener("message", onMessage as (event: Event) => void);
}
