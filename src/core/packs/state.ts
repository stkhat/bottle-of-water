import { own } from "../util";
/**
 * The state of downloaded packs, which the background keeps in `storage.local` under
 * this key for pages, the popup and Settings to watch: `{ [pack]: PackState }`. Only
 * packs that are downloaded (not bundled) and that the background has brought to their
 * lock version since its worker started have an entry.
 */
export const PACK_STATE_KEY = "packState";

export interface PackState {
  /**
   * ready: the lock's version is on the device. downloading: its files are being
   * fetched. failed: they could not be (retried later, or with `retryPacks`).
   */
  state: "ready" | "downloading" | "failed";
  /** Bytes of the lock version's files on the device or received so far. */
  received: number;
  /** Bytes of all the lock version's files. */
  total: number;
  /** Why the download failed (`failed` only). */
  error?: string;
  /**
   * An older version of the pack is on the device and in use meanwhile: the lock's
   * version is an update (`downloading` or `failed` only).
   */
  updating?: true;
}

export type PackStates = Readonly<Record<string, PackState>>;

/**
 * The pack's data can be used: at its lock version, or an older version meanwhile
 * (`updating`, which pages and the popup treat as ready).
 */
export const packUsable = (state: PackState | undefined): boolean =>
  state !== undefined && (state.state === "ready" || state.updating === true);

/** The share of `received` in `total`, 0–100, rounded down; 0 when there is nothing. */
const percentOf = (received: number, total: number) =>
  total > 0 ? Math.floor((Math.min(received, total) / total) * 100) : 0;

/**
 * What the popup and the video column say about a language's data while some of it
 * cannot be used: downloading, with the share of its bytes on the device, or failed.
 */
export type DataNote =
  { state: "downloading"; percent: number } | { state: "failed" };

/**
 * The note on the data of `packs`: none once every one can be used (`packUsable`);
 * else failed when one that cannot be used failed, else downloading. The share counts
 * usable packs whole. A pack without a state counts as downloading with nothing
 * received (every start of the background brings the pair's packs to the device).
 */
export function dataNote(
  states: PackStates,
  packs: readonly string[],
): DataNote | null {
  const list = [...new Set(packs)].map((pack) => own(states, pack));
  const missing = list.filter((state) => !packUsable(state));
  if (missing.length === 0) return null;
  if (missing.some((state) => state?.state === "failed"))
    return { state: "failed" };
  let received = 0;
  let total = 0;
  for (const state of list) {
    if (!state) continue;
    received += packUsable(state) ? state.total : state.received;
    total += state.total;
  }
  return { state: "downloading", percent: percentOf(received, total) };
}

/**
 * Several packs as one (Settings → Language data): failed when one failed, else
 * downloading when one is (an update too), else ready; with the share of all their
 * bytes received.
 */
export function combinedState(states: readonly PackState[]): {
  state: PackState["state"];
  percent: number;
} {
  const state = states.some((s) => s.state === "failed")
    ? "failed"
    : states.some((s) => s.state === "downloading")
      ? "downloading"
      : "ready";
  const received = states.reduce((sum, s) => sum + s.received, 0);
  const total = states.reduce((sum, s) => sum + s.total, 0);
  return { state, percent: percentOf(received, total) };
}
