import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// Unit project only; used by Stryker (mutation testing), which cannot select a project.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["src/**/*.browser.test.ts"],
  },
});
