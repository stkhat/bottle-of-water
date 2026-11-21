/**
 * The user's own cloud storage as cloud sync sees it (architecture "Sync to the user's
 * own cloud storage" → "Parts"), in two halves: the files of the app's own space, and
 * the sign-in that gives an access token for them. Browser-free, so the extension and
 * the mobile app share it; a provider maps the paths (`devices/<id>/main.json.gz`) to
 * its own names.
 */

/** The providers this version knows (the `cloudProvider` setting names one). */
export const CLOUD_PROVIDERS = ["googleDrive"] as const;
export type CloudProviderId = (typeof CLOUD_PROVIDERS)[number];

/** Each provider's name as the UI shows it ("Saved to Google Drive"); a product name, not translated. */
export const CLOUD_PROVIDER_NAMES: Record<CloudProviderId, string> = {
  googleDrive: "Google Drive",
};

/** A file in the app's space. */
export interface CloudFileInfo {
  /** As `filePath` makes it. */
  path: string;
  /** When the file was last written (ms), by the provider's clock. */
  modifiedTime: number;
  /** Bytes stored. */
  size: number;
}

/**
 * What a provider's call can fail with, and what the backend does then:
 * `unauthorized` (401, or no token without a window): renew the token once, then
 * "Reconnect needed"; `retry` (network, 429, 5xx): try again with backoff;
 * `full`: the storage is full, writing stops; `notFound`: the file is gone.
 */
export type CloudErrorKind = "unauthorized" | "retry" | "full" | "notFound";

export class CloudError extends Error {
  readonly kind: CloudErrorKind;
  /** For `retry`: how long the provider asked to wait (`Retry-After`), if it did. */
  readonly retryAfterMs: number | undefined;
  constructor(
    kind: CloudErrorKind,
    message: string = kind,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "CloudError";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

/** The kind of a provider's failure; anything that is not a `CloudError` is a `retry`. */
export const cloudErrorKind = (error: unknown): CloudErrorKind =>
  error instanceof CloudError ? error.kind : "retry";

/** The files half: every call takes the access token the auth half gave. */
export interface CloudFiles {
  /** Every file of the app's space. */
  list(token: string): Promise<CloudFileInfo[]>;
  read(token: string, path: string): Promise<Uint8Array>;
  /** Creates or replaces the file; returns it as the provider now lists it. */
  write(token: string, path: string, bytes: Uint8Array): Promise<CloudFileInfo>;
  /** Removing a file that is not there is not an error. */
  remove(token: string, path: string): Promise<void>;
  /**
   * The address of the account the token is for, so Settings can say which account
   * this device is connected to; undefined when the provider gives none.
   */
  account(token: string): Promise<string | undefined>;
}

export interface CloudAuth {
  /**
   * An access token. Without `interactive` no window opens, and a token that cannot be
   * had that way fails as `unauthorized`. `refused`: a token the files half was refused
   * with (401), dropped before a new one is asked for.
   */
  token(options: { interactive: boolean; refused?: string }): Promise<string>;
  /** Drops the tokens kept for this device (disconnecting). */
  forget(): Promise<void>;
}

export interface CloudProvider {
  id: CloudProviderId;
  files: CloudFiles;
  auth: CloudAuth;
}
