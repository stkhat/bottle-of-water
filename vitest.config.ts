import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { defineBrowserCommand, playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { netflixSubtitleBody } from "./tests/netflix-subtitles.ts";
import { timedtextBody } from "./tests/youtube-timedtext.ts";
import { unit } from "./vitest.unit.config.ts";
import { noticesPlugin } from "./scripts/notices.ts";

// Playwright's Firefox may not launch on some dev machines; e.g. VITEST_BROWSERS=chromium
const browsers = (process.env.VITEST_BROWSERS ?? "chromium,firefox")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean) as ("chromium" | "firefox")[];

/** Answers /api/timedtext from the recorded fixtures, like YouTube (see tests/youtube-timedtext.ts). */
function timedtextFixtures(): Plugin {
  return {
    name: "langle-timedtext-fixtures",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/timedtext") return next();
        res.setHeader("content-type", "application/json; charset=UTF-8");
        res.end(timedtextBody(url));
      });
    },
  };
}

/**
 * Answers Netflix subtitle URLs from the synthetic fixtures (see tests/netflix-subtitles.ts).
 * The browser tests point the manifest's CDN URLs at /langle-nflx/ on the test server.
 */
function netflixFixtures(): Plugin {
  return {
    name: "langle-netflix-fixtures",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/langle-nflx/") return next();
        const body = netflixSubtitleBody(url);
        res.statusCode = body === undefined ? 404 : 200;
        res.setHeader("content-type", "text/plain; charset=UTF-8");
        res.end(body ?? "");
      });
    },
  };
}

/** Playwright's `emulateMedia` for the test page (src/testing/media.ts). */
const emulateMedia = defineBrowserCommand<
  [{ colorScheme: "light" | "dark" | null }]
>(async (context, options) => {
  if (context.provider.name !== "playwright")
    throw new Error("emulateMedia needs Playwright");
  await context.page.emulateMedia(options);
});

/** A mouse step for `mouse` (src/testing/mouse.ts): points in the test page's viewport. */
type MouseStep =
  | { type: "move"; x: number; y: number; steps?: number }
  | { type: "down" | "up" };

/** Playwright's real mouse over the test page, step by step (src/testing/mouse.ts). */
const mouse = defineBrowserCommand<[MouseStep[]]>(async (context, steps) => {
  if (context.provider.name !== "playwright")
    throw new Error("mouse needs Playwright");
  const frame = await context.iframe.owner().boundingBox();
  if (!frame) throw new Error("The test page has no box");
  for (const step of steps) {
    if (step.type === "move")
      await context.page.mouse.move(frame.x + step.x, frame.y + step.y, {
        steps: step.steps ?? 1,
      });
    else await context.page.mouse[step.type]();
  }
});

export default defineConfig({
  test: {
    projects: [
      unit,
      {
        plugins: [
          preact(),
          noticesPlugin(),
          timedtextFixtures(),
          netflixFixtures(),
        ],
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          // CI runners are slower and noisier than a dev machine: retry a timing flake
          // once there (it stays visible in the log as a retried test).
          retry: process.env.CI ? 1 : 0,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Each test file runs in a window of its own. Firefox has one active window,
            // and a window that becomes active (another file's click or focus) ends the
            // drag selection and the fullscreen in the one that was: Firefox runs its
            // files one at a time. Chromium keeps every page active, so its run side by side.
            instances: browsers.map((browser) => ({
              browser,
              fileParallelism: browser !== "firefox",
            })),
            commands: { emulateMedia, mouse },
          },
        },
      },
      {
        test: {
          name: "manifest",
          environment: "node",
          include: ["tests/manifest.test.ts"],
        },
      },
    ],
  },
});
