// Renders scripts/icons/icon.svg into the toolbar icons: the green L WXT picks up from
// public/icon/<size>.png, and the gray one the background shows while Lingo is
// switched off, public/icon-off/<size>.png (src/background/toolbar-icon.ts).
// Run after editing the SVG: node scripts/icons/make-icons.ts
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const SIZES = [16, 32, 48, 128];
const GREEN = "#0B8A6C";
/** The gray of the switched-off icon: reads on light and dark toolbars alike. */
const GRAY = "#9AA0B0";
const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
if (!svg.includes(GREEN)) throw new Error(`icon.svg no longer uses ${GREEN}`);

const VARIANTS = [
  { dir: "../../public/icon/", svg },
  { dir: "../../public/icon-off/", svg: svg.replace(GREEN, GRAY) },
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
      const sized = variant.svg.replace(
        /width="128" height="128"/,
        `width="${size}" height="${size}"`,
      );
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`,
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
