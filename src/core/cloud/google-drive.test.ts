import { describe, expect, it } from "vitest";
import { createDriveFiles } from "./google-drive";
import { CloudError, type CloudErrorKind } from "./provider";

/**
 * Drive's answers as recorded from the REST API (v3), cut to the fields asked for.
 * No live API: a fake `fetch` answers each request from a queue, in order.
 */
const LIST = "https://www.googleapis.com/drive/v3/files";
const MAIN = "devices/dev-a/main.json.gz";
const MONTH = "devices/dev-a/occurrences-2026-11.json.gz";

const file = (
  id: string,
  path: string | undefined,
  modifiedTime: string,
  size: number,
) => ({
  id,
  modifiedTime,
  size: String(size),
  ...(path !== undefined && { appProperties: { path } }),
});

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8", ...headers },
  });

/** A Drive error body, in the shape Drive sends (`errors[]` and `details[]`). */
const driveError = (code: number, reason: string, detailsOnly = false) => ({
  error: {
    code,
    message: reason,
    ...(!detailsOnly && {
      errors: [{ domain: "usageLimits", reason, message: reason }],
    }),
    ...(detailsOnly && {
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: reason.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase(),
        },
      ],
    }),
  },
});

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: Uint8Array | undefined;
}

function fakeDrive() {
  const calls: Call[] = [];
  const answers: (Response | Error)[] = [];
  const files = createDriveFiles({
    fetch: async (url, init) => {
      const body =
        init.body instanceof Blob
          ? new Uint8Array(await init.body.arrayBuffer())
          : undefined;
      calls.push({
        method: init.method ?? "GET",
        url: new URL(url),
        headers: new Headers(init.headers),
        body,
      });
      const answer = answers.shift();
      if (!answer) throw new Error(`No answer for ${init.method} ${url}`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    now: () => Date.parse("2026-11-21T10:00:00Z"),
  });
  return {
    files,
    calls,
    answer: (...responses: (Response | Error)[]) => answers.push(...responses),
    /** A request as "METHOD path?query", for short assertions. */
    route: (call: Call) =>
      `${call.method} ${call.url.pathname}${call.url.searchParams.has("uploadType") ? `?uploadType=${call.url.searchParams.get("uploadType")}` : ""}`,
  };
}

const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const BYTES = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0xff, 0x0d, 0x0a, 0x2d]);

async function failure(promise: Promise<unknown>): Promise<CloudError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CloudError);
    return error as CloudError;
  }
  throw new Error("did not fail");
}

describe("list", () => {
  it("pages through appDataFolder and gives each Langle file's path, time and size", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({
        nextPageToken: "page-2",
        files: [file("id-main", MAIN, "2026-11-21T09:00:00.123Z", 5900)],
      }),
      json({
        files: [
          file("id-month", MONTH, "2026-11-20T08:00:00Z", 120),
          // Not written by Langle (no path): left out.
          file("id-other", undefined, "2026-11-20T08:00:00Z", 1),
        ],
      }),
    );
    expect(await drive.files.list("tok")).toEqual([
      {
        path: MAIN,
        modifiedTime: Date.parse("2026-11-21T09:00:00.123Z"),
        size: 5900,
      },
      {
        path: MONTH,
        modifiedTime: Date.parse("2026-11-20T08:00:00Z"),
        size: 120,
      },
    ]);
    const [first, second] = drive.calls;
    expect(first!.url.origin + first!.url.pathname).toBe(LIST);
    expect(first!.headers.get("Authorization")).toBe("Bearer tok");
    expect(Object.fromEntries(first!.url.searchParams)).toEqual({
      spaces: "appDataFolder",
      fields: "nextPageToken,files(id,modifiedTime,size,appProperties)",
      pageSize: "1000",
    });
    expect(second!.url.searchParams.get("pageToken")).toBe("page-2");
  });

  it("lists the newest of two files with the same path (two creates that raced)", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({
        files: [
          file("id-old", MAIN, "2026-11-21T08:00:00Z", 10),
          file("id-new", MAIN, "2026-11-21T09:00:00Z", 20),
        ],
      }),
    );
    expect(await drive.files.list("tok")).toEqual([
      {
        path: MAIN,
        modifiedTime: Date.parse("2026-11-21T09:00:00Z"),
        size: 20,
      },
    ]);
  });
});

describe("write", () => {
  it("creates a file it has not listed with a multipart upload into appDataFolder", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [] }),
      json(file("id-new", MAIN, "2026-11-21T10:00:01Z", BYTES.length)),
    );
    await drive.files.list("tok");
    expect(await drive.files.write("tok", MAIN, BYTES)).toEqual({
      path: MAIN,
      modifiedTime: Date.parse("2026-11-21T10:00:01Z"),
      size: BYTES.length,
    });
    const create = drive.calls[1]!;
    expect(drive.route(create)).toBe(
      "POST /upload/drive/v3/files?uploadType=multipart",
    );
    expect(create.headers.get("Authorization")).toBe("Bearer tok");
    const type = create.headers.get("Content-Type")!;
    const boundary = /^multipart\/related; boundary=(.+)$/.exec(type)![1]!;
    const parts = latin1(create.body!).split(`--${boundary}`);
    expect(parts).toHaveLength(4);
    expect(parts[3]).toBe("--");
    const [metaHead, meta] = parts[1]!.split("\r\n\r\n");
    expect(metaHead).toContain("application/json");
    expect(JSON.parse(meta!)).toEqual({
      name: MAIN,
      parents: ["appDataFolder"],
      appProperties: { path: MAIN },
    });
    const [bytesHead, bytes] = parts[2]!.split("\r\n\r\n");
    expect(bytesHead).toContain("application/gzip");
    expect(bytes).toBe(`${latin1(BYTES)}\r\n`);
  });

  it("replaces a listed file in place, by its id", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [file("id-main", MAIN, "2026-11-21T09:00:00Z", 3)] }),
      json(file("id-main", MAIN, "2026-11-21T10:00:01Z", BYTES.length)),
    );
    await drive.files.list("tok");
    const info = await drive.files.write("tok", MAIN, BYTES);
    expect(info.modifiedTime).toBe(Date.parse("2026-11-21T10:00:01Z"));
    const update = drive.calls[1]!;
    expect(drive.route(update)).toBe(
      "PATCH /upload/drive/v3/files/id-main?uploadType=media",
    );
    expect(update.body).toEqual(BYTES);
  });

  it("lists first when this worker has not, so a restart does not create a second copy", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [file("id-main", MAIN, "2026-11-21T09:00:00Z", 3)] }),
      json(file("id-main", MAIN, "2026-11-21T10:00:01Z", 9)),
    );
    await drive.files.write("tok", MAIN, BYTES);
    expect(drive.calls.map(drive.route)).toEqual([
      "GET /drive/v3/files",
      "PATCH /upload/drive/v3/files/id-main?uploadType=media",
    ]);
  });

  it("creates the file again when it was removed since the list", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [file("id-gone", MAIN, "2026-11-21T09:00:00Z", 3)] }),
      json(driveError(404, "notFound"), 404),
      json(file("id-new", MAIN, "2026-11-21T10:00:01Z", 9)),
      json(file("id-new", MAIN, "2026-11-21T10:00:02Z", 9)),
    );
    await drive.files.write("tok", MAIN, BYTES);
    await drive.files.write("tok", MAIN, BYTES);
    expect(drive.calls.map(drive.route)).toEqual([
      "GET /drive/v3/files",
      "PATCH /upload/drive/v3/files/id-gone?uploadType=media",
      "POST /upload/drive/v3/files?uploadType=multipart",
      "PATCH /upload/drive/v3/files/id-new?uploadType=media",
    ]);
  });

  it("writes the newest of two files with the same path and removes the others", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({
        files: [
          file("id-new", MAIN, "2026-11-21T09:00:00Z", 20),
          file("id-old", MAIN, "2026-11-21T08:00:00Z", 10),
          file("id-older", MAIN, "2026-11-21T07:00:00Z", 10),
        ],
      }),
      json(file("id-new", MAIN, "2026-11-21T10:00:01Z", 9)),
      new Response(null, { status: 204 }),
      json(driveError(500, "backendError"), 500),
      // The next write tries the one left again.
      json(file("id-new", MAIN, "2026-11-21T10:00:02Z", 9)),
      new Response(null, { status: 204 }),
    );
    await drive.files.list("tok");
    // A duplicate that cannot go yet does not fail the write.
    await drive.files.write("tok", MAIN, BYTES);
    await drive.files.write("tok", MAIN, BYTES);
    expect(drive.calls.map(drive.route)).toEqual([
      "GET /drive/v3/files",
      "PATCH /upload/drive/v3/files/id-new?uploadType=media",
      "DELETE /drive/v3/files/id-old",
      "DELETE /drive/v3/files/id-older",
      "PATCH /upload/drive/v3/files/id-new?uploadType=media",
      "DELETE /drive/v3/files/id-older",
    ]);
  });
});

describe("read", () => {
  it("downloads a listed file's bytes", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [file("id-main", MAIN, "2026-11-21T09:00:00Z", 9)] }),
      new Response(BYTES, {
        headers: { "Content-Type": "application/gzip" },
      }),
    );
    await drive.files.list("tok");
    expect(await drive.files.read("tok", MAIN)).toEqual(BYTES);
    const download = drive.calls[1]!;
    expect(download.url.pathname).toBe("/drive/v3/files/id-main");
    expect(download.url.searchParams.get("alt")).toBe("media");
  });

  it("is not found for a path the list does not have, or a file removed since", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [file("id-main", MAIN, "2026-11-21T09:00:00Z", 9)] }),
      json(driveError(404, "notFound"), 404),
    );
    await drive.files.list("tok");
    expect((await failure(drive.files.read("tok", MONTH))).kind).toBe(
      "notFound",
    );
    expect((await failure(drive.files.read("tok", MAIN))).kind).toBe(
      "notFound",
    );
    // Forgotten: no request the second time.
    expect((await failure(drive.files.read("tok", MAIN))).kind).toBe(
      "notFound",
    );
    expect(drive.calls).toHaveLength(2);
  });
});

describe("remove", () => {
  it("deletes every file with the path; one gone already or never there is no error", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({
        files: [
          file("id-new", MAIN, "2026-11-21T09:00:00Z", 20),
          file("id-old", MAIN, "2026-11-21T08:00:00Z", 10),
        ],
      }),
      new Response(null, { status: 204 }),
      json(driveError(404, "notFound"), 404),
    );
    await drive.files.list("tok");
    await drive.files.remove("tok", MAIN);
    await drive.files.remove("tok", MAIN);
    await drive.files.remove("tok", MONTH);
    expect(drive.calls.map(drive.route)).toEqual([
      "GET /drive/v3/files",
      "DELETE /drive/v3/files/id-new",
      "DELETE /drive/v3/files/id-old",
    ]);
  });
});

describe("errors", () => {
  const cases: [string, () => Response | Error, CloudErrorKind, number?][] = [
    ["401", () => json(driveError(401, "authError"), 401), "unauthorized"],
    [
      "403 storageQuotaExceeded",
      () => json(driveError(403, "storageQuotaExceeded"), 403),
      "full",
    ],
    [
      "403 rateLimitExceeded with Retry-After in seconds",
      () =>
        json(driveError(403, "rateLimitExceeded"), 403, {
          "Retry-After": "30",
        }),
      "retry",
      30_000,
    ],
    [
      "403 userRateLimitExceeded (in details only)",
      () => json(driveError(403, "userRateLimitExceeded", true), 403),
      "retry",
    ],
    [
      "403 insufficientPermissions (the scope was not granted)",
      () => json(driveError(403, "insufficientPermissions"), 403),
      "unauthorized",
    ],
    [
      "429 with Retry-After as a date",
      () =>
        json(driveError(429, "rateLimitExceeded"), 429, {
          "Retry-After": "Sat, 21 Nov 2026 10:02:00 GMT",
        }),
      "retry",
      120_000,
    ],
    ["500", () => json(driveError(500, "backendError"), 500), "retry"],
    ["503 with no body", () => new Response(null, { status: 503 }), "retry"],
    ["a network failure", () => new TypeError("Failed to fetch"), "retry"],
  ];

  it.each(cases)("%s → %s", async (_, answer, kind, retryAfterMs) => {
    const drive = fakeDrive();
    drive.answer(answer());
    const error = await failure(drive.files.list("tok"));
    expect(error.kind).toBe(kind);
    expect(error.retryAfterMs).toBe(retryAfterMs);
  });

  it("fails a write, read or remove the same way", async () => {
    const drive = fakeDrive();
    drive.answer(
      json({ files: [file("id-main", MAIN, "2026-11-21T09:00:00Z", 9)] }),
      json(driveError(403, "storageQuotaExceeded"), 403),
      json(driveError(401, "authError"), 401),
      json(driveError(500, "backendError"), 500),
    );
    expect((await failure(drive.files.write("tok", MAIN, BYTES))).kind).toBe(
      "full",
    );
    expect((await failure(drive.files.read("tok", MAIN))).kind).toBe(
      "unauthorized",
    );
    expect((await failure(drive.files.remove("tok", MAIN))).kind).toBe("retry");
  });
});
