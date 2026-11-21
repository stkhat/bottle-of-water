import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  icons?: Record<string, string>;
  key?: string;
  oauth2?: { client_id: string; scopes: string[] };
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

  // alarms (retrying language data downloads) and identity (signing in to the user's
  // own cloud storage) add no install warning in Chrome, unlike host permissions: the
  // mirrors and Google Drive's API send CORS headers, so neither needs any.
  test("requests only the storage, alarms and identity permissions", () => {
    expect(manifest().permissions).toEqual(["storage", "alarms", "identity"]);
  });

  test("has the colored toolbar icon in every size", () => {
    const icons = manifest().icons;
    expect(icons).toEqual({
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    });
    for (const file of Object.values(icons ?? {}))
      expect(existsSync(`.output/${dir}/${file}`)).toBe(true);
  });

  test("ships the gray toolbar icon shown while Langle is off, in every size", () => {
    for (const size of [16, 32, 48, 128])
      expect(existsSync(`.output/${dir}/icon-off/${size}.png`)).toBe(true);
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
        matches: ["*://www.netflix.com/*"],
        js: ["content-scripts/netflix.js"],
        world: undefined,
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
    expect(m.browser_specific_settings?.gecko?.id).toBe("langle@stkhat");
    expect(m.background?.scripts).toBeDefined();
  });
});

/** Every script of the build, joined. */
const scriptsOf = (dir: string) =>
  readdirSync(`.output/${dir}`, { recursive: true, withFileTypes: true })
    .filter((file) => file.isFile() && file.name.endsWith(".js"))
    .map((file) => readFileSync(join(file.parentPath, file.name), "utf8"))
    .join("\n");

// Google's Web client lists the sign-in redirect of one extension id
// (src/background/sync/google-clients.ts).
describe("Google sign-in", () => {
  test("development and check builds keep the id dgabnakfehpeammboohlkafhhdegbffe", async () => {
    for (const dir of ["chrome-mv3-check", "langle-check"]) {
      const { key } = readManifest(dir);
      expect(key, dir).toBeDefined();
      // Chrome's id: the first 128 bits of the key's SHA-256, as letters a–p.
      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          Uint8Array.from(atob(key!), (c) => c.charCodeAt(0)),
        ),
      );
      const id = [...digest.slice(0, 16)]
        .flatMap((byte) => [byte >> 4, byte & 15])
        .map((n) => String.fromCharCode(97 + n))
        .join("");
      expect(id, dir).toBe("dgabnakfehpeammboohlkafhhdegbffe");
    }
  });

  // Every browser signs in through launchWebAuthFlow, so no build names a client for
  // getAuthToken, which would sign in only the browser profile's own account.
  test("the check build has no oauth2 and the development Web client", () => {
    expect(readManifest("chrome-mv3-check").oauth2).toBeUndefined();
    expect(scriptsOf("chrome-mv3-check")).toContain(
      "191564468385-i9mvko6iu5qpq1o8pkhtufudvu72nc36.apps.googleusercontent.com",
    );
  });

  // Until the store item's client is registered, production has no Google client.
  test.each(["chrome-mv3", "firefox-mv3"])(
    "%s (production) has no key, no oauth2 and no development client",
    (dir) => {
      const m = readManifest(dir);
      expect(m.key).toBeUndefined();
      expect(m.oauth2).toBeUndefined();
      expect(scriptsOf(dir)).not.toContain("191564468385-");
    },
  );
});

// The self-reload (src/background/self-reload.ts), the error log and the settings
// channel (src/check/) of `npm run build:check` are dev only.
describe("check build", () => {
  const backgroundOf = (dir: string) =>
    readFileSync(`.output/${dir}/background.js`, "utf8");

  test.each(["chrome-mv3", "firefox-mv3"])(
    "%s (production) has no self-reload and no build id",
    (dir) => {
      expect(backgroundOf(dir)).not.toContain("build-id");
      expect(existsSync(`.output/${dir}/build-id.txt`)).toBe(false);
    },
  );

  test.each(["chrome-mv3", "firefox-mv3"])(
    "%s (production) has no error log",
    (dir) => {
      const scripts = scriptsOf(dir);
      expect(scripts).not.toContain("langle:check-errors");
      expect(scripts).not.toContain("checkErrorLog");
    },
  );

  test.each(["chrome-mv3", "firefox-mv3"])(
    "%s (production) has no settings channel",
    (dir) => {
      const scripts = scriptsOf(dir);
      expect(scripts).not.toContain("langle:check-settings");
      // Its refusal text, so a renamed message type cannot slip through.
      expect(scripts).not.toContain("is not an offered pair");
    },
  );

  test("the check build answers settings requests in every content script", () => {
    for (const file of [
      "content-scripts/content.js",
      "content-scripts/youtube.js",
      "content-scripts/netflix.js",
    ])
      expect(
        readFileSync(`.output/langle-check/${file}`, "utf8"),
        file,
      ).toContain("langle:check-settings");
  });

  test("the check build records errors in the worker, every content script and the pages", () => {
    const dir = ".output/langle-check";
    const has = (file: string) =>
      readFileSync(`${dir}/${file}`, "utf8").includes("langle:check-errors");
    for (const file of [
      "background.js",
      "content-scripts/content.js",
      "content-scripts/youtube.js",
      "content-scripts/netflix.js",
    ])
      expect(has(file), file).toBe(true);
    // The pages share their chunks: one of the popup's scripts has it.
    const popup = readFileSync(`${dir}/popup.html`, "utf8");
    const scripts = [...popup.matchAll(/(?:src|href)="\/([^"]+\.js)"/g)].map(
      (m) => m[1]!,
    );
    expect(scripts.some(has)).toBe(true);
  });

  test("npm run build:check writes the build id into .output/langle-check", () => {
    const path = ".output/langle-check/build-id.txt";
    if (!existsSync(path)) {
      throw new Error(`${path} not found. Build first: npm run build:check`);
    }
    expect(readFileSync(path, "utf8")).toMatch(/^\d{4}-\d\d-\d\dT\S+ \S+\n$/);
    expect(backgroundOf("langle-check")).toContain("build-id.txt");
    expect(readManifest("langle-check").manifest_version).toBe(3);
  });
});
