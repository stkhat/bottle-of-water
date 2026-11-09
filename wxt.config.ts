import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  manifest: ({ browser }) => ({
    name: "Lingo",
    version: pkg.version,
    description: "Learn languages on the videos and articles you already read.",
    permissions: ["storage"],
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: "lingo@stkhat" } },
    }),
  }),
});
