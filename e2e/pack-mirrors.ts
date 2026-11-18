// The lock's mirrors (jsDelivr, then unpkg) as the E2E tests see them: Playwright
// answers every request to them from data/packs/, so a test never reaches the real
// CDNs (which would also keep a 404 for a version not on npm yet). Every build
// downloads its packs, the production build too, whose mirrors cannot be changed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";
import lock from "../src/core/packs/packs.lock.json" with { type: "json" };

const PACKS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/packs",
);

/** A mirror's URL for a file: the lock's template filled in. */
const urlOf = (template: string, pkg: string, version: string, file: string) =>
  template
    .replaceAll("{package}", pkg)
    .replaceAll("{version}", version)
    .replaceAll("{file}", file);

/** Every URL the lock's mirrors serve a pack file at → that file in data/packs/. */
const FILES = new Map(
  Object.entries(lock.packs).flatMap(([pack, entry]) =>
    entry.files.flatMap((file) =>
      lock.mirrors.map(
        (template) =>
          [
            urlOf(template, entry.package, entry.version, file.path),
            path.join(PACKS_DIR, pack, file.path),
          ] as const,
      ),
    ),
  ),
);

/** The hosts of the lock's mirrors ("cdn.jsdelivr.net", "unpkg.com"). */
const MIRROR_HOSTS = [
  ...new Set(lock.mirrors.map((template) => new URL(template).host)),
];

/**
 * Chromium's flag that makes the mirrors' hosts unreachable: a request that the routes
 * miss fails instead of going out.
 */
export const BLOCK_MIRROR_HOSTS = `--host-resolver-rules=${MIRROR_HOSTS.map((host) => `MAP ${host} ~NOTFOUND`).join(", ")}`;

const requested = new WeakMap<BrowserContext, string[]>();

const releases = new WeakMap<BrowserContext, () => void>();

/** The mirror URLs `context` has requested so far, in order. */
export const mirrorRequests = (context: BrowserContext): readonly string[] =>
  requested.get(context) ?? [];

/** Lets the mirrors of `context` answer, when they were routed `held`. */
export const releasePackMirrors = (context: BrowserContext) =>
  releases.get(context)?.();

/**
 * Answers the mirrors' URLs from data/packs/ in `context`, its service workers
 * included; a URL the lock does not list gets a 404, as from npm. `held`: requests
 * wait until `releasePackMirrors`. Set it up before the extension loads: it downloads
 * its pair's packs as soon as it is installed.
 */
export async function routePackMirrors(
  context: BrowserContext,
  { held = false }: { held?: boolean } = {},
) {
  const cors = { "access-control-allow-origin": "*" };
  const urls: string[] = [];
  requested.set(context, urls);
  const released = new Promise<void>((resolve) => {
    releases.set(context, resolve);
    if (!held) resolve();
  });
  for (const host of MIRROR_HOSTS)
    await context.route(`https://${host}/**`, async (route) => {
      urls.push(route.request().url());
      await released;
      const file = FILES.get(route.request().url());
      return file
        ? route.fulfill({
            path: file,
            contentType: "application/json",
            headers: cors,
          })
        : route.fulfill({ status: 404, headers: cors, body: "Not found" });
    });
}
