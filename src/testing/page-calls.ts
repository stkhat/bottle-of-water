// Holds back a content script's calls to its page script, as when the page's answer
// does not come in time (a slow network fetch).

export interface HeldCalls {
  /** Every call of the type seen, in order (held back or not). */
  readonly calls: Record<string, unknown>[];
  /** How many were held back so far. */
  held(): number;
}

/**
 * Keeps the next `count` calls of `type` on the channel `toPage` from reaching the page
 * script. The listener has to run before the page script's, so `reinstall` puts the
 * page script back after it. Remove it with the returned `remove`.
 */
export function holdBackPageCalls(options: {
  toPage: string;
  type: string;
  count: number;
  reinstall(): void;
}): HeldCalls & { remove(): void } {
  const calls: Record<string, unknown>[] = [];
  let held = 0;
  const onMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (typeof data !== "object" || data === null) return;
    const { source, call } = data as { source?: unknown; call?: unknown };
    if (source !== options.toPage || typeof call !== "object" || !call) return;
    const fields = call as Record<string, unknown>;
    if (fields.type !== options.type) return;
    calls.push(fields);
    if (held < options.count) {
      held++;
      event.stopImmediatePropagation();
    }
  };
  // Listeners run in the order they were added: this one goes before the page script's.
  window.addEventListener("message", onMessage);
  options.reinstall();
  return {
    calls,
    held: () => held,
    remove: () => window.removeEventListener("message", onMessage),
  };
}
