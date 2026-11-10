// Fails when the Playwright image a CI job runs in (PLAYWRIGHT_IMAGE) is not the one for
// the installed @playwright/test: its browsers would be missing or the wrong builds.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("@playwright/test/package.json");
const image = process.env.PLAYWRIGHT_IMAGE ?? "";

if (!image.includes(`:v${version}-`)) {
  console.error(
    `The CI image is ${image || "(PLAYWRIGHT_IMAGE not set)"}, but @playwright/test is ${version}.\n` +
      `Set mcr.microsoft.com/playwright:v${version}-noble in .github/workflows/ci.yml.`,
  );
  process.exit(1);
}
console.log(`Playwright ${version} matches ${image}`);
