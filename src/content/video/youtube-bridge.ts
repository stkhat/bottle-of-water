import {
  isReplyMessage,
  isTimedtextMessage,
  TO_PAGE,
  type CallMessage,
  type PageCall,
  type PageCallResults,
  type TimedtextMessage,
} from "./youtube-messages";

/** The content script's side of the channel to Lingo's page script on youtube.com. */
export interface PageBridge {
  /** Asks the page script; rejects when it does not answer in time (not installed). */
  call<T extends PageCall["type"]>(
    call: Extract<PageCall, { type: T }>,
  ): Promise<PageCallResults[T]>;
  /** Calls `listener` with every /api/timedtext response the page observes. */
  onTimedtext(listener: (message: TimedtextMessage) => void): () => void;
  dispose(): void;
}

export function createPageBridge(
  win: Window = window,
  options: { timeoutMs?: number } = {},
): PageBridge {
  const timeoutMs = options.timeoutMs ?? 5000;
  const origin = win.location.origin;
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  const listeners = new Set<(message: TimedtextMessage) => void>();

  function onMessage(event: MessageEvent) {
    if (event.source !== win || event.origin !== origin) return;
    const data: unknown = event.data;
    if (isTimedtextMessage(data)) {
      for (const listener of listeners) listener(data);
    } else if (isReplyMessage(data)) {
      const waiter = pending.get(data.id);
      if (!waiter) return;
      pending.delete(data.id);
      if (data.ok) waiter.resolve(data.value);
      else waiter.reject(new Error(data.error ?? "Page call failed"));
    }
  }
  win.addEventListener("message", onMessage);

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
        const message: CallMessage = { source: TO_PAGE, id, call };
        win.postMessage(message, origin);
      });
    },
    onTimedtext(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      win.removeEventListener("message", onMessage);
      listeners.clear();
      // An abort: Lingo is leaving the page, nobody waits for the answer.
      for (const waiter of pending.values())
        waiter.reject(new DOMException("Disposed", "AbortError"));
      pending.clear();
    },
  };
}
