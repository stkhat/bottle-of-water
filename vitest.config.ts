import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { playwright } from "@vitest/browser-playwright";
import type { Plugin } from "vite";
import { WxtVitest } from "wxt/testing/vitest-plugin";
import { timedtextBody } from "./tests/youtube-timedtext.ts";

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

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [WxtVitest()],
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        plugins: [preact(), timedtextFixtures()],
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
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
