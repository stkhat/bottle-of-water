import { useEffect, useReducer } from "preact/hooks";

/** A value the content script changes and the UI renders. */
export interface Store<T extends object> {
  get(): T;
  /** Merges `patch` into the value and tells the subscribers. */
  set(patch: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch) {
      value = { ...value, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The store's value, re-rendering on every change. */
export function useStore<T extends object>(store: Store<T>): T {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const rerender = () => bump(undefined);
    const unsubscribe = store.subscribe(rerender);
    // Changes between the first render and this effect.
    rerender();
    return unsubscribe;
  }, [store]);
  return store.get();
}
