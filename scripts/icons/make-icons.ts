// Renders scripts/icons/icon.svg into the toolbar icons WXT picks up from
// public/icon/<size>.png. Run after editing the SVG: node scripts/icons/make-icons.ts
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const SIZES = [16, 32, 48, 128];
const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
const out = new URL("../../public/icon/", import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    const sized = svg.replace(
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
} finally {
  await browser.close();
}
