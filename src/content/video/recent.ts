// Imported by the page scripts: no dependencies.

export const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("Aborted", "AbortError");

/** A map of the `keep` most recently set keys, whose values can be waited for. */
export function createRecent<V>(keep: number) {
  const values = new Map<string, V>();
  const waiters = new Set<(key: string) => void>();
  return {
    get: (key: string) => values.get(key),
    values: () => values.values(),
    set(key: string, value: V) {
      values.delete(key);
      values.set(key, value);
      while (values.size > keep)
        values.delete(values.keys().next().value as string);
      for (const waiter of [...waiters]) waiter(key);
    },
    /** The key's value, waiting up to `ms` for it to be set; undefined after that. */
    wait(
      key: string,
      ms: number,
      signal?: AbortSignal,
    ): Promise<V | undefined> {
      const now = values.get(key);
      if (now !== undefined) return Promise.resolve(now);
      return new Promise((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          waiters.delete(waiter);
          signal?.removeEventListener("abort", onAbort);
        };
        const waiter = (set: string) => {
          if (set !== key) return;
          finish();
          resolve(values.get(key));
        };
        const onAbort = () => {
          finish();
          reject(abortError(signal!));
        };
        const timer = setTimeout(() => {
          finish();
          resolve(undefined);
        }, ms);
        waiters.add(waiter);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
    clear() {
      values.clear();
      waiters.clear();
    },
  };
}
