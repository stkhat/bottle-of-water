import { defineConfig } from "@playwright/test";

const PORT = 4719;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  // Every test launches its own browser profile, so tests in one file run side by side.
  fullyParallel: true,
  // GitHub's Linux runners have 4 vCPUs; locally Playwright's default (half the cores).
  workers: isCI ? 4 : undefined,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["html"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Only Chromium can load unpacked extensions.
  projects: [{ name: "chromium" }],
  webServer: {
    command: "node e2e/serve.mjs",
    port: PORT,
    reuseExistingServer: !isCI,
  },
});
