// Fails when the Playwright image a CI job runs in (PLAYWRIGHT_IMAGE) is not the one for
// the installed @playwright/test: its browsers would be missing or the wrong builds.
import { playwrightImage, playwrightVersion } from "./playwright-image.ts";

const image = process.env.PLAYWRIGHT_IMAGE ?? "";
const expected = playwrightImage();

if (image !== expected) {
  console.error(
    `The CI image is ${image || "(PLAYWRIGHT_IMAGE not set)"}, but @playwright/test is ${playwrightVersion()}.\n` +
      `Set ${expected} in .github/workflows/ci.yml.`,
  );
  process.exit(1);
}
console.log(`Playwright ${playwrightVersion()} matches ${image}`);
