// The Playwright Docker image for the installed @playwright/test: its browsers are the
// builds that version drives. CI runs in it (.github/workflows/ci.yml), and so does
// the local Firefox run (scripts/test-firefox.ts).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function playwrightVersion(): string {
  return (require("@playwright/test/package.json") as { version: string })
    .version;
}

export function playwrightImage(): string {
  return `mcr.microsoft.com/playwright:v${playwrightVersion()}-noble`;
}
