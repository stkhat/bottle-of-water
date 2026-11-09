import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves the 140-second test clip (e2e/fixtures/talk.webm) at `url`, with byte ranges:
 * the video can seek only then.
 */
export async function routeTalkVideo(context: BrowserContext, url: string) {
  const video = readFileSync(path.join(here, "fixtures/talk.webm"));
  await context.route(url, (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(
      route.request().headers()["range"] ?? "",
    );
    if (!range)
      return route.fulfill({
        contentType: "video/webm",
        headers: { "accept-ranges": "bytes" },
        body: video,
      });
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : video.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "video/webm",
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${video.length}`,
      },
      body: video.subarray(start, end + 1),
    });
  });
}
