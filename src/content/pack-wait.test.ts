import { describe, expect, it, vi } from "vitest";
import type { PackState, PackStates } from "../core/packs/state";
import { createPackWait } from "./pack-wait";

const READY: PackState = { state: "ready", received: 30, total: 30 };
const DOWNLOADING: PackState = { state: "downloading", received: 3, total: 30 };

/** A `packState` to change; `sync` delivers the current states at once on watch. */
function fakeStates(initial: PackStates = {}, sync = false) {
  let states = initial;
  const listeners = new Set<(states: PackStates) => void>();
  return {
    watch(listener: (states: PackStates) => void) {
      listeners.add(listener);
      if (sync) listener(states);
      else queueMicrotask(() => listeners.has(listener) && listener(states));
      return () => listeners.delete(listener);
    },
    set(next: PackStates) {
      states = next;
      for (const listener of [...listeners]) listener(states);
    },
    watchers: () => listeners.size,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createPackWait", () => {
  it("calls ready once every pack waited for can be used, and stops watching", async () => {
    const states = fakeStates({ es: DOWNLOADING });
    const ready = vi.fn();
    const wait = createPackWait(states.watch, ready);
    wait.add(["es"]);
    wait.add(["es-en"]);
    await flush();
    expect(wait.waiting).toBe(true);
    expect(states.watchers()).toBe(1);

    states.set({ es: READY, "es-en": DOWNLOADING });
    expect(ready).not.toHaveBeenCalled();
    states.set({ es: READY, "es-en": { ...DOWNLOADING, updating: true } });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(wait.waiting).toBe(false);
    expect(states.watchers()).toBe(0);
  });

  it("calls ready at once when the packs were ready before it watched", async () => {
    const ready = vi.fn();
    const sync = fakeStates({ es: READY }, true);
    createPackWait(sync.watch, ready).add(["es"]);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(sync.watchers()).toBe(0);

    const later = fakeStates({ es: READY });
    createPackWait(later.watch, ready).add(["es"]);
    await flush();
    expect(ready).toHaveBeenCalledTimes(2);
    expect(later.watchers()).toBe(0);
  });

  it("does not call ready again on the same states; waits for a change", async () => {
    const states = fakeStates({ es: READY });
    const ready = vi.fn();
    const wait = createPackWait(states.watch, ready);
    wait.add(["es"]);
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);

    // The request failed again with the data said to be ready.
    wait.add(["es"]);
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(wait.waiting).toBe(true);

    states.set({ es: DOWNLOADING });
    states.set({ es: READY });
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it("stops: no ready, no watching", async () => {
    const states = fakeStates({ es: DOWNLOADING });
    const ready = vi.fn();
    const wait = createPackWait(states.watch, ready);
    wait.add(["es"]);
    wait.stop();
    states.set({ es: READY });
    wait.add(["es"]);
    await flush();
    expect(ready).not.toHaveBeenCalled();
    expect(states.watchers()).toBe(0);
  });
});
