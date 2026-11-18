// The first download of a pair comes in the order pages need it: the learning
// language's pack, then the pair's dictionary, then its fallback (the English
// definitions, `fallbacksOf`). Pages are highlighted and hovers show once the first two
// are on the device; a term only the fallback has shows once it is there. The lock's
// mirrors are routed to data/packs/ (pack-mirrors.ts), which can hold a pack's files
// back or share one throttled link.
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import lock from "../src/core/packs/packs.lock.json" with { type: "json" };
import { checkErrorLog } from "./check-error-log";
import { openPopupFor, sendToBackground, testWithErrors } from "./fixtures";
import { releasePackMirrors } from "./pack-mirrors";
import { COLD_LOAD, highlighted, pointOn, showNewWords } from "./page";

const test = testWithErrors;
const expect = test.expect;

/** The hover card's Details button: a card shows. */
const details = (page: Page) =>
  page.getByRole("button", { name: en["hover.details"] });

/** The hover card's head, `term` (the check build's shadow roots are open). */
const cardHead = (page: Page, term: string) =>
  page.locator("langle-article").getByText(term, { exact: true });

/** Rests the pointer on `text` in the article. */
async function hover(page: Page, text: string) {
  const point = await pointOn(page, text);
  await page.mouse.move(point.x + 1, point.y);
  await page.mouse.move(point.x, point.y);
}

/** The state of each of the chosen pair's packs. */
async function pairStates(context: BrowserContext, extensionId: string) {
  const reply = (await sendToBackground(context, extensionId, {
    type: "packStatus",
  })) as { value?: { pair: { packs: { pack: string; state: string }[] } } };
  return Object.fromEntries(
    (reply.value?.pair.packs ?? []).map(({ pack, state }) => [pack, state]),
  );
}

test.describe("with the English definitions held on the mirror", () => {
  test.use({ mirrorsHeld: ["en-defs"] });

  test("the page is highlighted and hovers show before the English definitions arrive; a term only they have shows once they are there", async ({
    context,
    extensionId,
  }) => {
    await showNewWords(context, extensionId);
    const page = await context.newPage();
    await page.goto("/article-en.html");
    await expect
      .poll(
        async () => (await highlighted(page, "langle-new")).length,
        COLD_LOAD,
      )
      .toBeGreaterThan(0);
    expect(await pairStates(context, extensionId)).toEqual({
      en: "ready",
      "en-ja": "ready",
      "en-defs": "downloading",
    });
    await hover(page, "tangy");
    await expect(details(page)).toBeVisible(COLD_LOAD);
    await expect(cardHead(page, "tangy")).toBeVisible();

    // The popup has no download line (pages work); Settings shows the pair downloading.
    const popup = await openPopupFor(context, extensionId, page);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const row = options
      .locator("div.sub")
      .filter({ hasText: "English → Japanese" });
    await expect(row).toContainText(
      en["settings.languages.dataDownloading"].split("{percent}")[0]!,
    );
    await expect(popup.getByRole("switch").first()).toBeVisible();
    await expect(popup.getByRole("status")).toHaveCount(0);
    await popup.close();
    await options.close();

    // Only the English definitions have "figure out": its card waits for them.
    await page.bringToFront();
    await hover(page, "figure out");
    await page.waitForTimeout(500);
    await expect(cardHead(page, "figure out")).toHaveCount(0);
    releasePackMirrors(context);
    await expect(cardHead(page, "figure out")).toBeVisible(COLD_LOAD);
    await expect
      .poll(() => pairStates(context, extensionId), COLD_LOAD)
      .toEqual({ en: "ready", "en-ja": "ready", "en-defs": "ready" });

    // The check build's log names the mirror that served each file, in this order.
    const served = (await checkErrorLog(page, "read"))
      .flatMap((reply) => reply.entries)
      .filter((entry) => entry.message.startsWith("Pack "));
    const files = (["en", "en-ja", "en-defs"] as const).flatMap((pack) =>
      lock.packs[pack].files.map(
        (file) =>
          `Pack ${pack} ${file.path}: served by https://cdn.jsdelivr.net/npm/${lock.packs[pack].package}@${lock.packs[pack].version}/${file.path}`,
      ),
    );
    expect(served.map((entry) => entry.level)).toEqual(files.map(() => "info"));
    expect(
      served.map((entry) =>
        entry.message.replace(/ \(\d+ bytes, \d+ ms\)$/, ""),
      ),
    ).toEqual(files);
    await checkErrorLog(page, "clear");
  });
});

// Time from the first byte the mirrors may send to the page's first highlight and
// hovers, through one link of LANGLE_FIRST_USE_MBIT Mbit/s (gzipped sizes, as the CDNs
// send). Measures only when asked: `LANGLE_FIRST_USE_MBIT=10 npx playwright test
// e2e/progressive-download.spec.ts -g "first use"` (docs/development.md).
const MBIT = Number(process.env["LANGLE_FIRST_USE_MBIT"] ?? 0);

test.describe("first use", () => {
  test.skip(!MBIT, "Set LANGLE_FIRST_USE_MBIT to measure");
  test.use({
    startPair: null,
    mirrorsHeld: true,
    mirrorBitsPerSecond: MBIT * 1_000_000,
  });

  test("first use of English → Japanese: time to the first highlight and hovers", async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(300_000);
    const slow = { timeout: 240_000 };
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    // The pair the new install chose from the browser's UI language.
    const stored = () =>
      worker.evaluate(async () => {
        const { chrome: api } = globalThis as unknown as {
          chrome: {
            storage: {
              sync: {
                get(
                  key: string,
                ): Promise<{ settings?: { nativeLang?: string } }>;
              };
            };
          };
        };
        return (await api.storage.sync.get("settings")).settings;
      });
    await expect.poll(stored).toBeDefined();
    test.skip(
      (await stored())?.nativeLang !== "ja",
      "The new install chose another pair (the browser's UI language is not Japanese)",
    );
    await showNewWords(context, extensionId);
    const page = await context.newPage();
    await page.goto("/article-en.html");
    const start = Date.now();
    releasePackMirrors(context);
    await expect
      .poll(async () => (await highlighted(page, "langle-new")).length, slow)
      .toBeGreaterThan(0);
    const highlight = Date.now() - start;
    await expect
      .poll(async () => {
        await hover(page, "tangy");
        return cardHead(page, "tangy").isVisible();
      }, slow)
      .toBe(true);
    const hoverMs = Date.now() - start;
    await expect
      .poll(async () => {
        await hover(page, "figure out");
        return cardHead(page, "figure out").isVisible();
      }, slow)
      .toBe(true);
    const fallback = Date.now() - start;
    const timings = { highlight, hover: hoverMs, fallback };
    for (const [name, ms] of Object.entries(timings))
      test.info().annotations.push({
        type: `first-use-${name}-ms`,
        description: String(ms),
      });
    console.log(`First use at ${MBIT} Mbit/s:`, JSON.stringify(timings));
  });
});
