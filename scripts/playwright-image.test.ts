import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { playwrightImage } from "./playwright-image.ts";

const workflows = join(import.meta.dirname, "../.github/workflows");

// ci.yml checks its own image when it runs; this also covers cache.yml, whose cache key
// must name the same image for ci.yml to hit it.
it("every workflow names the Playwright image of the installed @playwright/test", () => {
  const found: string[] = [];
  for (const file of readdirSync(workflows)) {
    const text = readFileSync(join(workflows, file), "utf8");
    for (const [image] of text.matchAll(/mcr\.microsoft\.com\/playwright:\S+/g))
      found.push(`${file}: ${image}`);
  }
  expect(found.length).toBeGreaterThan(0);
  for (const entry of found)
    expect(entry).toBe(`${entry.split(":")[0]}: ${playwrightImage()}`);
});
