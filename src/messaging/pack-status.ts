import { dataNote, type DataNote, type PackStates } from "../core/packs/state";
import type { Settings } from "../core/settings";
import type { send } from "./client";
import type { PackStatus } from "./protocol";

/** What following the language data needs; the browser's or a test's. */
export interface PackStatusDeps {
  send: typeof send;
  /** `watchPackState` (./storage.ts): the states now, then each change. */
  watchPackState(listener: (states: PackStates) => void): () => void;
  /** `watchSettings` (./storage.ts). */
  watchSettings(
    listener: (settings: Settings, previous: Settings) => void,
  ): () => void;
}

export interface PackStatusFollower {
  /** Asks the background again (a pack was removed). */
  refresh(): void;
  stop(): void;
}

/** The status with the newer states of the pair's packs. */
function withStates(status: PackStatus, states: PackStates): PackStatus {
  return {
    ...status,
    pair: {
      ...status.pair,
      packs: status.pair.packs.map((entry) =>
        Object.hasOwn(states, entry.pack)
          ? { pack: entry.pack, size: entry.size, ...states[entry.pack]! }
          : entry,
      ),
    },
  };
}

/**
 * Follows the chosen pair's language data for the popup, Settings and the video
 * column: asks the background for `packStatus`, then applies each change of the pack
 * states (`packState`) to the pair's packs, and asks again when another pair is
 * chosen. An answer that comes after a newer one is dropped; a failed one leaves the
 * last status.
 */
export function followPackStatus(
  deps: PackStatusDeps,
  listener: (status: PackStatus) => void,
): PackStatusFollower {
  let status: PackStatus | undefined;
  let states: PackStates = {};
  let asked = 0;
  let stopped = false;

  const emit = () => {
    if (status && !stopped) listener(withStates(status, states));
  };

  function refresh() {
    const ticket = ++asked;
    deps.send({ type: "packStatus" }).then(
      (next) => {
        if (ticket !== asked) return;
        status = next;
        emit();
      },
      (error: unknown) => {
        if (!stopped) console.warn("Lingo:", error);
      },
    );
  }

  const unwatch = deps.watchPackState((next) => {
    states = next;
    emit();
  });
  const unwatchSettings = deps.watchSettings((next, previous) => {
    if (
      next.learningLang !== previous.learningLang ||
      next.nativeLang !== previous.nativeLang
    )
      refresh();
  });
  refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      unwatch();
      unwatchSettings();
    },
  };
}

/** The note on the chosen pair's data (popup, video column); none when it is all usable. */
export const pairNote = (status: PackStatus | undefined): DataNote | null =>
  status
    ? dataNote(
        Object.fromEntries(status.pair.packs.map((p) => [p.pack, p])),
        status.pair.packs.map((p) => p.pack),
      )
    : null;
