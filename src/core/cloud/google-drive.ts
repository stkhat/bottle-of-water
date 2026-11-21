/**
 * Google Drive's files half (architecture "Sync to the user's own cloud storage" →
 * "Providers"): the app's own `appDataFolder` over Drive's REST API (v3) with `fetch`.
 * Browser-free, so the mobile app can use it with its own token.
 *
 * `appDataFolder` is flat, so a file's path (`devices/<id>/main.json.gz`) is kept in its
 * `appProperties.path`, and a path → id map comes from the last list. Two files with
 * the same path (two creates that raced): the newest is the file; the others go when
 * the path is next written or removed, which only the device that owns it does.
 */
import { CloudError, type CloudFileInfo, type CloudFiles } from "./provider";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_FIELDS = "id,modifiedTime,size,appProperties";
const CONTENT_TYPE = "application/gzip";

interface DriveFile {
  id: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

interface Listed {
  id: string;
  info: CloudFileInfo;
  /** Older files with the same path, removed when the path is next written. */
  extra: string[];
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface DriveFilesOptions {
  /** Defaults to the global `fetch`. */
  fetch?: Fetch;
  /** For `Retry-After` given as a date. */
  now?: () => number;
}

/** Reasons Drive gives in a 403's body, written without `_` and in lower case. */
const FULL_REASONS = new Set(["storagequotaexceeded"]);
/** The token lacks the scope (the user unticked it): signing in again fixes it. */
const SCOPE_REASONS = new Set([
  "insufficientpermissions",
  "accesstokenscopeinsufficient",
]);

/** The reasons in a Drive error body: `error.errors[].reason` and `error.details[].reason`. */
function reasonsOf(body: unknown): string[] {
  const error = (body as { error?: unknown } | null)?.error;
  if (!error || typeof error !== "object") return [];
  const lists = [
    (error as { errors?: unknown }).errors,
    (error as { details?: unknown }).details,
  ];
  return lists
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map((item) => (item as { reason?: unknown } | null)?.reason)
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => reason.replaceAll("_", "").toLowerCase());
}

/** `Retry-After` in ms: seconds, or an HTTP date. */
function retryAfterMs(value: string | null, now: number): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** The `CloudError` for a response that is not ok. */
async function driveError(
  response: Response,
  what: string,
  now: number,
): Promise<CloudError> {
  const { status } = response;
  const message = `Google Drive ${what}: HTTP ${status}`;
  if (status === 401) return new CloudError("unauthorized", message);
  if (status === 404) return new CloudError("notFound", message);
  const wait = retryAfterMs(response.headers.get("Retry-After"), now);
  if (status === 403) {
    const reasons = reasonsOf(await response.json().catch(() => null));
    const detail = `${message} (${reasons.join(", ") || "no reason"})`;
    if (reasons.some((r) => FULL_REASONS.has(r)))
      return new CloudError("full", detail);
    if (reasons.some((r) => SCOPE_REASONS.has(r)))
      return new CloudError("unauthorized", detail);
    // Rate limits (`rateLimitExceeded`, `userRateLimitExceeded`) and any other 403:
    // try again later.
    return new CloudError("retry", detail, wait);
  }
  return new CloudError("retry", message, wait);
}

const infoOf = (path: string, file: DriveFile): CloudFileInfo => ({
  path,
  modifiedTime: file.modifiedTime ? Date.parse(file.modifiedTime) : 0,
  size: file.size ? Number(file.size) : 0,
});

/** Newest first; equal times by id, so every device picks the same file. */
const newer = (
  a: CloudFileInfo & { id: string },
  b: CloudFileInfo & { id: string },
) =>
  b.modifiedTime - a.modifiedTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A multipart/related body: the metadata, then the bytes. */
function multipart(
  metadata: object,
  bytes: Uint8Array,
): { body: Blob; type: string } {
  const boundary = `langle-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${CONTENT_TYPE}\r\n\r\n`,
    new Uint8Array(bytes),
    `\r\n--${boundary}--`,
  ]);
  return { body, type: `multipart/related; boundary=${boundary}` };
}

export function createDriveFiles({
  fetch = (url, init) => globalThis.fetch(url, init),
  now = Date.now,
}: DriveFilesOptions = {}): CloudFiles {
  /** Path → the file, from the last list and the writes since. */
  let files: Map<string, Listed> | undefined;
  let listing: Promise<unknown> | undefined;

  async function call(
    what: string,
    token: string,
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      throw new CloudError(
        "retry",
        `Google Drive ${what}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) throw await driveError(response, what, now());
    return response;
  }

  async function list(token: string): Promise<CloudFileInfo[]> {
    const found = new Map<string, (CloudFileInfo & { id: string })[]>();
    let pageToken: string | undefined;
    do {
      const url = new URL(API);
      url.searchParams.set("spaces", "appDataFolder");
      url.searchParams.set("fields", `nextPageToken,files(${FILE_FIELDS})`);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = (await (await call("list", token, url.href)).json()) as {
        nextPageToken?: string;
        files?: DriveFile[];
      };
      for (const file of page.files ?? []) {
        const path = file.appProperties?.["path"];
        // Not a file Langle wrote.
        if (typeof path !== "string" || path === "") continue;
        const same = found.get(path) ?? [];
        same.push({ ...infoOf(path, file), id: file.id });
        found.set(path, same);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    files = new Map();
    for (const [path, same] of found) {
      const [first, ...rest] = same.sort(newer);
      const { id, ...info } = first!;
      files.set(path, { id, info, extra: rest.map((file) => file.id) });
    }
    return [...files.values()].map((file) => file.info);
  }

  /** The files as the last list saw them; lists first if this worker has not yet. */
  async function known(token: string): Promise<Map<string, Listed>> {
    if (!files) {
      listing ??= list(token).finally(() => (listing = undefined));
      await listing;
    }
    return files!;
  }

  /** Deletes a file by id; one that is gone already is not an error. */
  async function drop(token: string, id: string) {
    try {
      await call("remove", token, `${API}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (!(error instanceof CloudError && error.kind === "notFound"))
        throw error;
    }
  }

  async function upload(
    token: string,
    path: string,
    bytes: Uint8Array,
    id: string | undefined,
  ): Promise<DriveFile> {
    const fields = `fields=${encodeURIComponent(FILE_FIELDS)}`;
    if (id !== undefined) {
      const response = await call(
        "write",
        token,
        `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&${fields}`,
        {
          method: "PATCH",
          headers: { "Content-Type": CONTENT_TYPE },
          body: new Blob([new Uint8Array(bytes)]),
        },
      );
      return (await response.json()) as DriveFile;
    }
    const { body, type } = multipart(
      { name: path, parents: ["appDataFolder"], appProperties: { path } },
      bytes,
    );
    const response = await call(
      "write",
      token,
      `${UPLOAD}?uploadType=multipart&${fields}`,
      { method: "POST", headers: { "Content-Type": type }, body },
    );
    return (await response.json()) as DriveFile;
  }

  return {
    list,

    async read(token, path) {
      const file = (await known(token)).get(path);
      if (!file) throw new CloudError("notFound", `Google Drive read: ${path}`);
      try {
        const response = await call(
          "read",
          token,
          `${API}/${encodeURIComponent(file.id)}?alt=media`,
        );
        return new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        if (error instanceof CloudError && error.kind === "notFound")
          files?.delete(path);
        throw error;
      }
    },

    async write(token, path, bytes) {
      const map = await known(token);
      const old = map.get(path);
      let written: DriveFile;
      try {
        written = await upload(token, path, bytes, old?.id);
      } catch (error) {
        // Removed since the list (by hand, or the app's data was cleared): create it.
        if (!(old && error instanceof CloudError && error.kind === "notFound"))
          throw error;
        map.delete(path);
        written = await upload(token, path, bytes, undefined);
      }
      const info = infoOf(path, written);
      const file: Listed = { id: written.id, info, extra: [] };
      map.set(path, file);
      // The write is done; a duplicate that cannot go now goes at the next write.
      for (const id of old?.extra ?? [])
        await drop(token, id).catch(() => file.extra.push(id));
      return info;
    },

    async remove(token, path) {
      const map = await known(token);
      const file = map.get(path);
      if (!file) return;
      for (const id of [file.id, ...file.extra]) await drop(token, id);
      map.delete(path);
    },
  };
}
