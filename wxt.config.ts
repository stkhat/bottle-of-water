import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import pkg from "./package.json" with { type: "json" };
import { noticesPlugin } from "./scripts/notices.ts";

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  // The data sources and licenses page's data (`virtual:langle-notices`).
  vite: () => ({ plugins: [preact(), noticesPlugin()] }),
  manifest: ({ browser }) => ({
    name: "Langle",
    version: pkg.version,
    description: "Learn languages on the videos and articles you already read.",
    // alarms: retries of language data downloads (src/background/pack-downloads.ts);
    // it shows no warning at install in Chrome or Firefox.
    permissions: ["storage", "alarms"],
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: "langle@stkhat" } },
    }),
  }),
  hooks: {
    // The language packs are not part of the build: the extension downloads them from
    // the mirrors in src/core/packs/packs.lock.json (src/core/packs/lock.ts).
    "build:before": (wxt) => {
      if (wxt.config.mode === "production" && process.env.WXT_PACK_MIRRORS)
        wxt.logger.warn("WXT_PACK_MIRRORS is ignored in production builds");
    },
  },
});
