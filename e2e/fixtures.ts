import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Which build to load: `npm run build` (production), or `wxt build --mode check` (the
 * build loaded in your own Chrome, with WXT's dev logging and the self-reload). The
 * production build closes the shadow roots of Lingo's UI on web pages
 * (`src/content/ui/shadow-mode.ts`), so Playwright cannot reach into it there: tests
 * that drive the UI use the check build, whose roots are open.
 */
export type Build = "production" | "check";

const BUILDS: Record<Build, { dir: string; command: string }> = {
  production: { dir: "chrome-mv3", command: "npm run build" },
  check: { dir: "chrome-mv3-check", command: "wxt build --mode check" },
};

/** The folder of a build. */
export const extensionPathOf = (build: Build) =>
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.output",
    BUILDS[build].dir,
  );

/** A fresh browser profile with a built extension (the check build by default) loaded, and `args` for Chromium. */
export async function launchWithExtension(
  args: string[] = [],
  build: Build = "check",
): Promise<BrowserContext> {
  const extensionPath = extensionPathOf(build);
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    throw new Error(`Build first: ${BUILDS[build].command}`);
  }
  const headed = !!process.env.PWDEBUG || !!process.env.HEADED;
  return chromium.launchPersistentContext("", {
    // Bundled Chromium: stable Chrome 137+ ignores --load-extension.
    channel: "chromium",
    headless: !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      ...args,
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

/** How many English words are saved as Known (asked from the background). */
export async function knownCount(
  context: BrowserContext,
  extensionId: string,
): Promise<number> {
  const reply = (await sendToBackground(context, extensionId, {
    type: "counts",
    lang: "en",
  })) as { ok: boolean; value?: { known: number } };
  return reply.value?.known ?? -1;
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
