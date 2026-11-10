import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const extensionPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.output/chrome-mv3",
);

/** A fresh browser profile with the built extension loaded. */
export async function launchWithExtension(): Promise<BrowserContext> {
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error("Build first: npm run build");
  }
  const headed = !!process.env.PWDEBUG || !!process.env.HEADED;
  return chromium.launchPersistentContext("", {
    // Bundled Chromium: stable Chrome 137+ ignores --load-extension.
    channel: "chromium",
    headless: !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

/** The extension's id in a context, from its service worker's URL. */
export async function extensionIdOf(context: BrowserContext): Promise<string> {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  return new URL(worker.url()).host;
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await launchWithExtension();
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
});

export const expect = test.expect;

/**
 * Sends a request to the background from an extension page, as the popup and the
 * options page do, and returns the reply (`{ ok, value }` or `{ ok, error }`).
 */
export async function sendToBackground(
  context: BrowserContext,
  extensionId: string,
  request: { type: string } & Record<string, unknown>,
): Promise<unknown> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // The extension page's own `chrome.runtime`; the test drives Chromium directly.
  const reply = await page.evaluate((message) => {
    const { chrome: api } = globalThis as unknown as {
      chrome: { runtime: { sendMessage(m: unknown): Promise<unknown> } };
    };
    return api.runtime.sendMessage(message);
  }, request);
  await page.close();
  return reply;
}

/**
 * Opens the toolbar popup's page for `page`, as clicking the toolbar icon would: the
 * popup asks the active tab, so `page` is brought to the front first and the popup
 * loads in a tab behind it.
 */
export async function openPopupFor(
  context: BrowserContext,
  extensionId: string,
  page: Page,
): Promise<Page> {
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  return popup;
}
