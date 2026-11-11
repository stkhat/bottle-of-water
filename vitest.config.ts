import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { netflixSubtitleBody } from "./tests/netflix-subtitles.ts";
import { timedtextBody } from "./tests/youtube-timedtext.ts";
import { unit } from "./vitest.unit.config.ts";

// Playwright's Firefox may not launch on some dev machines; e.g. VITEST_BROWSERS=chromium
const browsers = (process.env.VITEST_BROWSERS ?? "chromium,firefox")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean) as ("chromium" | "firefox")[];

/** Answers /api/timedtext from the recorded fixtures, like YouTube (see tests/youtube-timedtext.ts). */
function timedtextFixtures(): Plugin {
  return {
    name: "lingo-timedtext-fixtures",
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
 * The browser tests point the manifest's CDN URLs at /lingo-nflx/ on the test server.
 */
function netflixFixtures(): Plugin {
  return {
    name: "lingo-netflix-fixtures",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/lingo-nflx/") return next();
        const body = netflixSubtitleBody(url);
        res.statusCode = body === undefined ? 404 : 200;
        res.setHeader("content-type", "text/plain; charset=UTF-8");
        res.end(body ?? "");
      });
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      unit,
      {
        plugins: [preact(), timedtextFixtures(), netflixFixtures()],
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
            instances: browsers.map((browser) => ({ browser })),
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
