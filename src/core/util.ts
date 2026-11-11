/** `table[key]` when it is the table's own property: never `__proto__` or `toString`. */
export const own = <T>(
  table: Readonly<Record<string, T>>,
  key: string,
): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A copy without `keys`. */
export function omit<T extends object, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
}

/**
 * One promise per key, shared by overlapping callers. With `keep`, a result stays until
 * `delete`; without, the key is free again once its promise settles. A failure is
 * never kept, so the next call tries again.
 */
export function promiseCache<V>({ keep }: { keep: boolean }) {
  const promises = new Map<string, Promise<V>>();
  return {
    get(key: string, start: () => Promise<V>): Promise<V> {
      const running = promises.get(key);
      if (running) return running;
      const promise = start();
      promises.set(key, promise);
      // Only this promise: a newer one may have replaced it after a `delete`.
      const drop = () => {
        if (promises.get(key) === promise) promises.delete(key);
      };
      if (keep) promise.catch(drop);
      else promise.then(drop, drop);
      return promise;
    },
    peek: (key: string) => promises.get(key),
    delete: (key: string) => promises.delete(key),
    keys: () => promises.keys(),
  };
}

/** Listeners called in turn; one that throws is logged and does not stop the others. */
export function listeners<A extends unknown[]>() {
  const set = new Set<(...args: A) => void>();
  return {
    add(listener: (...args: A) => void): () => void {
      set.add(listener);
      return () => set.delete(listener);
    },
    emit(...args: A) {
      for (const listener of set) {
        try {
          listener(...args);
        } catch (error) {
          console.error(error);
        }
      }
    },
  };
}
