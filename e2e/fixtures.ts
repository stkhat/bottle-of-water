import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

const extensionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.output/chrome-mv3",
);

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
      throw new Error("Build first: npm run build");
    }
    const headed = !!process.env.PWDEBUG || !!process.env.HEADED;
    const context = await chromium.launchPersistentContext("", {
      // Bundled Chromium: stable Chrome 137+ ignores --load-extension.
      channel: "chromium",
      headless: !headed,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
