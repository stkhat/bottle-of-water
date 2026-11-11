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
