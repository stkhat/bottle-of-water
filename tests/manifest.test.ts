import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type Manifest = {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: {
    matches: string[];
    js?: string[];
    world?: string;
    run_at?: string;
  }[];
  browser_specific_settings?: { gecko?: { id?: string } };
  background?: { service_worker?: string; scripts?: string[] };
};

function readManifest(dir: string): Manifest {
  const path = `.output/${dir}/manifest.json`;
  if (!existsSync(path)) {
    throw new Error(
      `${path} not found. Build first: npm run build && npm run build:firefox`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

// Exact equality on purpose: adding a permission or host must be a deliberate edit of this test.
describe.each(["chrome-mv3", "firefox-mv3"])("%s manifest", (dir) => {
  const manifest = () => readManifest(dir);

  test("is Manifest V3", () => {
    expect(manifest().manifest_version).toBe(3);
  });

  test("requests only the storage permission", () => {
    expect(manifest().permissions).toEqual(["storage"]);
  });

  test("requests no host permissions", () => {
    expect(manifest().host_permissions).toBeUndefined();
  });

  test("injects the article script everywhere and the video scripts on their sites only", () => {
    expect(
      manifest().content_scripts?.map(({ matches, js, world, run_at }) => ({
        matches,
        js,
        world,
        run_at,
      })),
    ).toEqual([
      {
        matches: ["<all_urls>"],
        js: ["content-scripts/content.js"],
        world: undefined,
        run_at: undefined,
      },
      // The page-world hooks must run before the sites' own scripts.
      {
        matches: ["*://www.netflix.com/*"],
        js: ["content-scripts/netflix-main.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      {
        matches: ["*://www.youtube.com/*"],
        js: ["content-scripts/youtube-main.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      {
        matches: ["*://www.youtube.com/*"],
        js: ["content-scripts/youtube.js"],
        world: undefined,
        run_at: "document_start",
      },
    ]);
  });
});

describe("chrome-mv3 manifest specifics", () => {
  test("has a service worker and no Gecko settings", () => {
    const m = readManifest("chrome-mv3");
    expect(m.background?.service_worker).toBeDefined();
    expect(m.browser_specific_settings).toBeUndefined();
  });
});

describe("firefox-mv3 manifest specifics", () => {
  test("has the Gecko id and background scripts", () => {
    const m = readManifest("firefox-mv3");
    expect(m.browser_specific_settings?.gecko?.id).toBe("lingo@stkhat");
    expect(m.background?.scripts).toBeDefined();
  });
});
