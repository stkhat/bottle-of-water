// Tiny static server for the E2E tests (Node built-ins only):
// - the test pages (e2e/pages/) at /;
// - a local npm mirror at /mirror/{package}@{version}/{file}, shaped like the npm CDNs
//   the extension downloads language packs from, serving the npm package folders that
//   `npm run data:publish` writes (data/publish/<pack>/). They are written again here at
//   start from the committed lock, which is left as it is;
// - /mirror-control, which the tests use to change how the mirror answers (one test
//   at a time: pack-downloads.spec.ts runs its tests in order).
//   GET: { broken, hold, held, served } as JSON. POST with any of these query
//   parameters, then the same answer:
//     broken=1|0  each file is sent with one byte changed (its SHA-256 no longer
//                 matches the lock), or as it is;
//     hold=1|0    requests wait unanswered until hold=0;
//     reset       broken=0, hold=0 (answering what was held) and served=0.
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISH_DIR, writePackages } from "../scripts/data/publish.ts";
import { PACKS } from "../scripts/data/formats.ts";

const PORT = 4719;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "pages");
const LOCK = path.join(here, "..", "src", "core", "packs", "packs.lock.json");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/** The npm package folders, by package name: { dir, version }. */
function publishPackages(): Map<string, { dir: string; version: string }> {
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  writePackages(PACKS, lock);
  const packages = new Map<string, { dir: string; version: string }>();
  for (const entry of fs.readdirSync(PUBLISH_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(PUBLISH_DIR, entry.name);
    const { name, version } = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    packages.set(name, { dir, version });
  }
  return packages;
}

const packages = publishPackages();
const mirror = { broken: false, hold: false, served: 0 };
/** Requests waiting for hold=0. */
let held: (() => void)[] = [];

const stateOf = () => ({ ...mirror, held: held.length });

/** The file a `/mirror/@scope/name@version/file` path names, or undefined. */
function mirrorFile(rest: string): string | undefined {
  // A scoped package's name has one "/" (@scope/name); its version follows the last "@".
  const match = /^((?:@[^/@]+\/)?[^/@]+)@([^/]+)\/(.+)$/.exec(rest);
  if (!match) return undefined;
  const [, name = "", version, file = ""] = match;
  const pkg = packages.get(name);
  if (!pkg || pkg.version !== version) return undefined;
  const full = path.join(pkg.dir, path.normalize(file));
  return full.startsWith(pkg.dir + path.sep) ? full : undefined;
}

function sendFile(
  res: ServerResponse,
  file: string,
  { cors = false, broken = false } = {},
): void {
  fs.readFile(file, (err, data) => {
    const headers = cors ? { "access-control-allow-origin": "*" } : {};
    if (err) {
      res
        .writeHead(404, { ...headers, "content-type": "text/plain" })
        .end("Not found");
      return;
    }
    if (broken && data.length > 0) {
      const i = Math.floor(data.length / 2);
      data[i] = (data[i] ?? 0) ^ 0x01;
    }
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { ...headers, "content-type": type }).end(data);
  });
}

function serveMirror(res: ServerResponse, rest: string): void {
  const answer = () => {
    mirror.served++;
    const file = mirrorFile(rest);
    if (!file) {
      res
        .writeHead(404, {
          "access-control-allow-origin": "*",
          "content-type": "text/plain",
        })
        .end("Not found");
      return;
    }
    sendFile(res, file, { cors: true, broken: mirror.broken });
  };
  if (mirror.hold) held.push(answer);
  else answer();
}

function release() {
  const waiting = held;
  held = [];
  for (const answer of waiting) answer();
}

function control(
  req: IncomingMessage,
  res: ServerResponse,
  params: URLSearchParams,
): void {
  if (req.method === "POST") {
    if (params.has("reset")) {
      mirror.broken = false;
      mirror.hold = false;
      mirror.served = 0;
      release();
    }
    if (params.has("broken")) mirror.broken = params.get("broken") === "1";
    if (params.has("hold")) {
      mirror.hold = params.get("hold") === "1";
      if (!mirror.hold) release();
    }
  }
  res
    .writeHead(200, { "content-type": "application/json" })
    .end(JSON.stringify(stateOf()));
}

http
  .createServer((req, res) => {
    const { pathname, searchParams } = new URL(
      req.url ?? "/",
      "http://localhost",
    );
    if (pathname === "/mirror-control") {
      control(req, res, searchParams);
      return;
    }
    if (pathname.startsWith("/mirror/")) {
      serveMirror(res, decodeURIComponent(pathname.slice("/mirror/".length)));
      return;
    }
    const file = path.join(root, path.normalize(decodeURIComponent(pathname)));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end("Not found");
      return;
    }
    sendFile(res, file);
  })
  .listen(PORT, () =>
    console.log(
      `E2E pages on http://localhost:${PORT}, packs ${[...packages.keys()].join(", ")} at /mirror/`,
    ),
  );
