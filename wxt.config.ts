import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import pkg from "./package.json" with { type: "json" };
import { PACKS } from "./scripts/data/formats.mjs";
import { applyOverrides, type PackLock } from "./src/core/packs/lock";
import lockFile from "./src/core/packs/packs.lock.json" with { type: "json" };

/**
 * The lock this build uses: as committed in production, else with the overrides
 * from the environment that the extension's code applies too (src/core/packs/lock.ts).
 */
function buildLock(mode: string): PackLock {
  const committed = lockFile as PackLock;
  if (mode === "production") return committed;
  const lock = applyOverrides(committed, process.env, mode);
  for (const [name, entry] of Object.entries(lock.packs))
    if (!entry.bundled && !PACKS[name]?.downloadable)
      throw new Error(`${name} is in public/packs/ and is always bundled`);
  return lock;
}

/**
 * The files of the data/packs/ packs that `lock` bundles, as public files copied to
 * packs/<pack>/ (WXT copies public/packs/ itself).
 */
function bundledPackFiles(lock: PackLock) {
  return Object.entries(PACKS).flatMap(([name, info]) => {
    if (!info.downloadable) return [];
    const entry = lock.packs[name as keyof PackLock["packs"]];
    if (!entry)
      throw new Error(`${name} is not in the lock: npm run data:publish`);
    if (!entry.bundled) return [];
    return readdirSync(info.dir, { recursive: true, withFileTypes: true })
      .filter((file) => file.isFile())
      .map((file) => {
        const absoluteSrc = join(file.parentPath, file.name);
        const path = relative(info.dir, absoluteSrc).split(sep).join("/");
        return { absoluteSrc, relativeDest: `packs/${name}/${path}` };
      });
  });
}

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ browser }) => ({
    name: "Lingo",
    version: pkg.version,
    description: "Learn languages on the videos and articles you already read.",
    // alarms: retries of language data downloads (src/background/pack-downloads.ts);
    // it shows no warning at install in Chrome or Firefox.
    permissions: ["storage", "alarms"],
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: "lingo@stkhat" } },
    }),
  }),
  hooks: {
    "build:publicAssets": (wxt, files) => {
      const { mode } = wxt.config;
      if (
        mode === "production" &&
        (process.env.WXT_PACKS_DOWNLOAD || process.env.WXT_PACK_MIRRORS)
      )
        wxt.logger.warn(
          "WXT_PACKS_DOWNLOAD and WXT_PACK_MIRRORS are ignored in production builds",
        );
      files.push(...bundledPackFiles(buildLock(mode)));
    },
  },
});
