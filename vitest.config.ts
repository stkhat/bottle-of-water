import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { playwright } from "@vitest/browser-playwright";
import { WxtVitest } from "wxt/testing/vitest-plugin";

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
        plugins: [preact()],
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }],
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
