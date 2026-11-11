/**
 * The channel between Lingo's page script on a video site (MAIN world) and its content
 * script (isolated world): `window.postMessage` to the page's own origin. The page can
 * read and forge these messages, so both sides check the shape of what they receive.
 * Imported by the page scripts: no dependencies.
 */

/** The `source` of each direction's messages. */
export interface PageChannel {
  fromPage: string;
  toPage: string;
}

interface CallMessage {
  source: string;
  id: string;
  call: Record<string, unknown>;
}

export interface ReplyMessage {
  source: string;
  type: "reply";
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export function isReplyMessage(
  data: unknown,
  channel: PageChannel,
): data is ReplyMessage {
  return (
    isObject(data) &&
    data.source === channel.fromPage &&
    data.type === "reply" &&
    isString(data.id) &&
    typeof data.ok === "boolean"
  );
}

/** The content script's side of the channel. */
export interface PageBridge<
  Call extends { type: string },
  Results extends Record<Call["type"], unknown>,
  Event,
> {
  /** Asks the page script; rejects when it does not answer in time (not installed). */
  call<T extends Call["type"]>(
    call: Extract<Call, { type: T }>,
  ): Promise<Results[T]>;
  /** Calls `listener` with every event the page script posts. */
  onEvent(listener: (event: Event) => void): () => void;
  dispose(): void;
}

export function createPageBridge<
  Call extends { type: string },
  Results extends Record<Call["type"], unknown>,
  Event,
>(options: {
  channel: PageChannel;
  isEvent(data: unknown): data is Event;
  timeoutMs?: number;
}): PageBridge<Call, Results, Event> {
  const { channel, isEvent, timeoutMs = 5000 } = options;
  const origin = location.origin;
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  const listeners = new Set<(event: Event) => void>();

  function onMessage(event: MessageEvent) {
    if (event.source !== window || event.origin !== origin) return;
    const data: unknown = event.data;
    if (isEvent(data)) {
      for (const listener of listeners) listener(data);
    } else if (isReplyMessage(data, channel)) {
      const waiter = pending.get(data.id);
      pending.delete(data.id);
      if (data.ok) waiter?.resolve(data.value);
      else waiter?.reject(new Error(data.error ?? "Page call failed"));
    }
  }
  window.addEventListener("message", onMessage);

  return {
    call(call) {
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`No answer from the page to ${call.type}`));
        }, timeoutMs);
        pending.set(id, {
          resolve(value) {
            clearTimeout(timer);
            resolve(value as never);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        });
        const message: CallMessage = { source: channel.toPage, id, call };
        window.postMessage(message, origin);
      });
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      window.removeEventListener("message", onMessage);
      listeners.clear();
      // An abort: Lingo is leaving the page, nobody waits for the answer.
      for (const waiter of pending.values())
        waiter.reject(new DOMException("Disposed", "AbortError"));
      pending.clear();
    },
  };
}

const installed = new Map<string, () => void>();

/**
 * The page script's side: runs `install` once per page and answers the content
 * script's calls that `isCall` accepts. Returns a function that removes it all (for tests).
 */
export function installPageScript<Call>(
  channel: PageChannel,
  isCall: (call: Record<string, unknown>) => boolean,
  install: () => {
    answer(call: Call): Promise<unknown>;
    uninstall(): void;
  },
): () => void {
  const current = installed.get(channel.toPage);
  if (current) return current;
  const { answer, uninstall } = install();
  const origin = location.origin;

  function onMessage(event: MessageEvent) {
    if (event.source !== window || event.origin !== origin) return;
    const data: unknown = event.data;
    if (
      !isObject(data) ||
      data.source !== channel.toPage ||
      !isString(data.id) ||
      !isObject(data.call) ||
      !isCall(data.call)
    )
      return;
    const reply = (fields: Partial<ReplyMessage>) =>
      window.postMessage(
        { source: channel.fromPage, type: "reply", id: data.id, ...fields },
        origin,
      );
    answer(data.call as Call).then(
      (value) => reply({ ok: true, value }),
      (error: unknown) => reply({ ok: false, error: String(error) }),
    );
  }
  window.addEventListener("message", onMessage);

  const remove = () => {
    uninstall();
    window.removeEventListener("message", onMessage);
    installed.delete(channel.toPage);
  };
  installed.set(channel.toPage, remove);
  return remove;
}
