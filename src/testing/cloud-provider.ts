/**
 * An in-memory cloud storage for `CloudSyncBackend`'s tests: one app space that several
 * simulated devices share, each signed in with its own account half, and failures to
 * inject (401, 429, storage full) the way a provider's files half reports them.
 */
import {
  CloudError,
  type CloudAuth,
  type CloudErrorKind,
  type CloudFileInfo,
  type CloudFiles,
  type CloudProvider,
} from "../core/cloud/provider";

type Op = "list" | "read" | "write" | "remove";
const ALL_OPS: readonly Op[] = ["list", "read", "write", "remove"];

interface Failure {
  kind: CloudErrorKind;
  ops: readonly Op[];
  retryAfterMs?: number;
}

export interface FakeAccount extends CloudAuth {
  /** Whether a token can be had without a window (false: the silent renewal fails). */
  silent: boolean;
  /** Makes every token this account was given invalid (an expiry): the next call is a 401. */
  expire(): void;
}

export interface FakeCloud {
  files: CloudFiles;
  /** Path → stored bytes and modified time. */
  readonly stored: Map<string, { bytes: Uint8Array; modifiedTime: number }>;
  /** Every call that reached a file, in order. */
  readonly log: { op: Op; path?: string }[];
  /** Makes the next call of one of `ops` fail with `kind`. */
  failNext(
    kind: CloudErrorKind,
    options?: { ops?: readonly Op[]; retryAfterMs?: number },
  ): void;
  /** A device's sign-in: signed out until a token is asked for with a window. */
  account(): FakeAccount;
  /** The provider a device sees: the shared files and its own account. */
  provider(account: FakeAccount): CloudProvider;
  /** The paths, sorted. */
  paths(): string[];
}

export function createFakeCloud({
  quotaBytes = Infinity,
}: { quotaBytes?: number } = {}): FakeCloud {
  const stored: FakeCloud["stored"] = new Map();
  const log: FakeCloud["log"] = [];
  const valid = new Set<string>();
  const failures: Failure[] = [];
  let stamp = 1_000;
  let tokens = 0;

  function enter(token: string, op: Op, path?: string) {
    if (!valid.has(token)) throw new CloudError("unauthorized", "401");
    const i = failures.findIndex((f) => f.ops.includes(op));
    if (i >= 0) {
      const [failure] = failures.splice(i, 1);
      throw new CloudError(failure!.kind, failure!.kind, failure!.retryAfterMs);
    }
    log.push(path === undefined ? { op } : { op, path });
  }

  const info = (path: string): CloudFileInfo => {
    const file = stored.get(path)!;
    return {
      path,
      modifiedTime: file.modifiedTime,
      size: file.bytes.length,
    };
  };

  const files: CloudFiles = {
    async list(token) {
      enter(token, "list");
      return [...stored.keys()].map(info);
    },
    async read(token, path) {
      enter(token, "read", path);
      const file = stored.get(path);
      if (!file) throw new CloudError("notFound");
      return new Uint8Array(file.bytes);
    },
    async write(token, path, bytes) {
      enter(token, "write", path);
      let total = bytes.length;
      for (const [p, file] of stored)
        if (p !== path) total += file.bytes.length;
      if (total > quotaBytes) throw new CloudError("full");
      stored.set(path, { bytes: new Uint8Array(bytes), modifiedTime: ++stamp });
      return info(path);
    },
    async remove(token, path) {
      enter(token, "remove", path);
      stored.delete(path);
    },
  };

  return {
    files,
    stored,
    log,
    failNext(kind, { ops = ALL_OPS, retryAfterMs } = {}) {
      failures.push({
        kind,
        ops,
        ...(retryAfterMs !== undefined && { retryAfterMs }),
      });
    },
    account() {
      let signedIn = false;
      const mine = new Set<string>();
      let current: string | undefined;
      const account: FakeAccount = {
        silent: true,
        async token({ interactive, refused }) {
          if (refused !== undefined && refused === current) current = undefined;
          if (!interactive && (!signedIn || !account.silent))
            throw new CloudError("unauthorized", "No token without a window");
          signedIn = true;
          if (current === undefined || !valid.has(current)) {
            current = `token-${++tokens}`;
            valid.add(current);
            mine.add(current);
          }
          return current;
        },
        async forget() {
          signedIn = false;
          current = undefined;
        },
        expire() {
          for (const token of mine) valid.delete(token);
        },
      };
      return account;
    },
    provider(account) {
      return { id: "googleDrive", files, auth: account };
    },
    paths: () => [...stored.keys()].sort(),
  };
}
