// Renders Langle's mark, src/ui/brand/icon.svg, into the toolbar icons: the colored one
// WXT picks up from public/icon/<size>.png, and the gray one the background shows while
// Langle is switched off, public/icon-off/<size>.png (src/background/toolbar-icon.ts).
// Run after editing the SVG: node scripts/make-icons.ts
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { OFF_FILTER } from "../src/ui/brand/off-filter.ts";

const SIZES = [16, 32, 48, 128];
const svg = readFileSync(
  new URL("../src/ui/brand/icon.svg", import.meta.url),
  "utf8",
);
if (!svg.includes('width="128" height="128"'))
  throw new Error("icon.svg no longer says its size as 128×128");

const VARIANTS = [
  { dir: "../public/icon/", filter: "none" },
  { dir: "../public/icon-off/", filter: OFF_FILTER },
];

const browser = await chromium.launch();
try {
  for (const variant of VARIANTS) {
    const out = new URL(variant.dir, import.meta.url);
    mkdirSync(out, { recursive: true });
    for (const size of SIZES) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
      });
      const sized = svg.replace(
        'width="128" height="128"',
        `width="${size}" height="${size}"`,
      );
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;filter:${variant.filter}}</style>${sized}`,
      );
      await page.screenshot({
        path: new URL(`${size}.png`, out).pathname,
        omitBackground: true,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
