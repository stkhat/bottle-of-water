import { packUsable, type PackStates } from "../core/packs/state";

/** Waits for language data a request did not find on the device. */
export interface PackWait {
  /** Some packs are waited for. */
  readonly waiting: boolean;
  /** Waits (also) for `packs`: a request that needed them failed (`PacksUnavailableError`). */
  add(packs: readonly string[]): void;
  /** Stops waiting, without calling `ready`. */
  stop(): void;
}

/**
 * Waits for packs a page's request needed and did not find: watches the pack states
 * until every pack waited for can be used (`packUsable`), then stops watching and calls
 * `ready` (the page analyzes again). It does not call `ready` twice on the same states
 * without seeing a pack it waits for unusable in between: when the background still
 * answers that the data is missing, the page waits for the next change instead of
 * asking again and again.
 */
export function createPackWait(
  watchPackState: (listener: (states: PackStates) => void) => () => void,
  ready: () => void,
): PackWait {
  const packs = new Set<string>();
  let watching = false;
  let unwatch: (() => void) | undefined;
  let stopped = false;
  /** The states `ready` was last called on, until a pack is seen unusable again. */
  let ranOn: string | undefined;

  function end() {
    watching = false;
    packs.clear();
    const off = unwatch;
    unwatch = undefined;
    off?.();
  }

  function check(states: PackStates) {
    if (!watching) return;
    const names = [...packs].sort();
    const list = names.map((pack) =>
      Object.hasOwn(states, pack) ? states[pack] : undefined,
    );
    if (!list.every(packUsable)) {
      ranOn = undefined;
      return;
    }
    const key = JSON.stringify([names, list]);
    if (key === ranOn) return;
    ranOn = key;
    end();
    ready();
  }

  return {
    get waiting() {
      return watching;
    },
    add(more) {
      if (stopped) return;
      for (const pack of more) packs.add(pack);
      if (watching) return;
      watching = true;
      const off = watchPackState(check);
      // The states may have come at once, and been all it waited for.
      if (watching) unwatch = off;
      else off();
    },
    stop() {
      stopped = true;
      end();
    },
  };
}
