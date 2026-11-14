import { useEffect, useReducer, useRef } from "preact/hooks";

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

/** Same fields, each the same (`Object.is`). */
export function shallowEqual<S extends object>(a: S, b: S): boolean {
  const keys = Object.keys(a) as (keyof S)[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.is(a[key], b[key]))
  );
}

/**
 * What `select` reads from the store's value, re-rendering only when that changes
 * (`equal`, default `Object.is`): for a component that reads a few fields, everything it
 * renders from among them.
 */
export function useStoreSelect<T extends object, S>(
  store: Store<T>,
  select: (value: T) => S,
  equal: (a: S, b: S) => boolean = Object.is,
): S {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const selected = select(store.get());
  const latest = useRef({ select, equal, selected });
  latest.current = { select, equal, selected };
  useEffect(() => {
    const check = () => {
      const { select, equal, selected } = latest.current;
      if (!equal(selected, select(store.get()))) bump(undefined);
    };
    const unsubscribe = store.subscribe(check);
    // Changes between the first render and this effect.
    check();
    return unsubscribe;
  }, [store]);
  return selected;
}
