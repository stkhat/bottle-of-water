import {
  isReplyMessage,
  isTracksMessage,
  TO_PAGE,
  type CallMessage,
  type PageCall,
  type PageCallResults,
  type TracksMessage,
} from "./netflix-messages";

/** The content script's side of the channel to Lingo's page script on netflix.com. */
export interface NetflixBridge {
  /** Asks the page script; rejects when it does not answer in time (not installed). */
  call<T extends PageCall["type"]>(
    call: Extract<PageCall, { type: T }>,
  ): Promise<PageCallResults[T]>;
  /** Calls `listener` with the tracks of every manifest the page parses. */
  onTracks(listener: (message: TracksMessage) => void): () => void;
  dispose(): void;
}

export function createNetflixBridge(
  win: Window = window,
  options: { timeoutMs?: number } = {},
): NetflixBridge {
  const timeoutMs = options.timeoutMs ?? 5000;
  const origin = win.location.origin;
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  const listeners = new Set<(message: TracksMessage) => void>();

  function onMessage(event: MessageEvent) {
    if (event.source !== win || event.origin !== origin) return;
    const data: unknown = event.data;
    if (isTracksMessage(data)) {
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
    onTracks(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      win.removeEventListener("message", onMessage);
      listeners.clear();
      for (const waiter of pending.values())
        waiter.reject(new Error("Disposed"));
      pending.clear();
    },
  };
}
