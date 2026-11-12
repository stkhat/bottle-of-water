import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  collectExtensionErrors,
  connectBrowserCdp,
  freePort,
  type BrowserCdp,
  type ErrorCollector,
} from "./error-collector";

/**
 * Which build to load: `npm run build` (production), `wxt build --mode check` (the
 * build loaded in your own Chrome, with WXT's dev logging and the self-reload), or
 * `npm run build:check-download` (the check build without the self-reload, whose
 * Spanish data comes from the local mirror in serve.ts; see .env.check-download).
 * Production closes the shadow roots of Lingo's UI on web pages, so Playwright cannot
 * reach into it there: tests that drive the UI use a check build.
 */
export type Build = "production" | "check" | "download";

const BUILDS: Record<Build, { dir: string; command: string }> = {
  production: { dir: "chrome-mv3", command: "npm run build" },
  check: { dir: "chrome-mv3-check", command: "wxt build --mode check" },
  download: {
    dir: "chrome-mv3-check-download",
    command: "npm run build:check-download",
  },
};

export const extensionPathOf = (build: Build) =>
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.output",
    BUILDS[build].dir,
  );

/** A fresh browser profile with a built extension loaded. */
async function launchWithExtension(
  build: Build,
  port: number,
): Promise<BrowserContext> {
  const extensionPath = extensionPathOf(build);
  if (!fs.existsSync(path.join(extensionPath, "manifest.json")))
    throw new Error(`Build first: ${BUILDS[build].command}`);
  const headed = !!process.env.PWDEBUG || !!process.env.HEADED;
  return chromium.launchPersistentContext("", {
    // Bundled Chromium: stable Chrome 137+ ignores --load-extension.
    channel: "chromium",
    headless: !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      // For the error collector's CDP connection.
      `--remote-debugging-port=${port}`,
      // For CDP's Extensions.loadUnpacked, which reloads the extension.
      "--enable-unsafe-extension-debugging",
    ],
  });
}

async function extensionIdOf(context: BrowserContext): Promise<string> {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  return new URL(worker.url()).host;
}

export const test = base.extend<{
  build: Build;
  port: number;
  context: BrowserContext;
  extensionId: string;
}>({
  build: ["check", { option: true }],
  // eslint-disable-next-line no-empty-pattern
  port: async ({}, use) => {
    await use(await freePort());
  },
  context: async ({ build, port }, use) => {
    const context = await launchWithExtension(build, port);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
});

export const expect = test.expect;

/**
 * Fails each test with what Chrome's chrome://extensions → Errors page would show: the
 * extension logged an error or a warning, or threw (error-collector.ts).
 */
export const testWithErrors = test.extend<{
  cdp: BrowserCdp;
  errors: ErrorCollector;
}>({
  cdp: async ({ context, port }, use) => {
    void context;
    const cdp = await connectBrowserCdp(port);
    await use(cdp);
    cdp.close();
  },
  errors: [
    async ({ context, extensionId, cdp }, use) => {
      const errors = await collectExtensionErrors(context, extensionId, cdp);
      await use(errors);
      // A last round trip: whatever the background was doing has been reported.
      await sendToBackground(context, extensionId, { type: "getSettings" });
      errors.stop();
      expect(errors.format(), "Lingo's reports on the Errors page").toBe("");
    },
    { auto: true },
  ],
});

const senders = new WeakMap<BrowserContext, Promise<Page>>();

/** An extension page kept open for `sendToBackground` (a new one after a reload). */
function senderPage(context: BrowserContext, extensionId: string) {
  let page = senders.get(context);
  if (!page) {
    page = context.newPage().then(async (p) => {
      await p.goto(`chrome-extension://${extensionId}/popup.html`);
      return p;
    });
    senders.set(context, page);
  }
  return page;
}

/**
 * Sends a request to the background from an extension page, as the popup and the
 * options page do, and returns the reply (`{ ok, value }` or `{ ok, error }`).
 */
export async function sendToBackground(
  context: BrowserContext,
  extensionId: string,
  request: { type: string } & Record<string, unknown>,
): Promise<unknown> {
  let page = await senderPage(context, extensionId);
  // Reloading the extension closes its pages.
  if (page.isClosed()) {
    senders.delete(context);
    page = await senderPage(context, extensionId);
  }
  return page.evaluate((message) => {
    // The extension page's own `chrome.runtime`; the test drives Chromium directly.
    const { chrome: api } = globalThis as unknown as {
      chrome: { runtime: { sendMessage(m: unknown): Promise<unknown> } };
    };
    return api.runtime.sendMessage(message);
  }, request);
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
