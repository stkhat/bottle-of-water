// Tiny static server for the E2E test pages (Node built-ins only).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 4719;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "pages");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const file = path.join(root, path.normalize(decodeURIComponent(pathname)));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end("Not found");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        return;
      }
      const type = TYPES[path.extname(file)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type }).end(data);
    });
  })
  .listen(PORT, () => console.log(`E2E pages on http://localhost:${PORT}`));
