import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";

test("the page card appears on an English page", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  const chip = page.getByRole("button", { name: en["card.chip.learning"] });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(en["card.pageStatus"])).toBeVisible();
});

test("no card appears on a Japanese page", async ({ context }) => {
  // Prove the extension is live first: the content script runs on the English page.
  const live = await context.newPage();
  await live.goto("/article-en.html");
  await expect(live.locator("lingo-page-card")).toHaveCount(1);

  // The card is mounted asynchronously after the content script runs at document_idle,
  // so a plain count check right after goto could pass before the script even ran.
  // We wait for load, then wait inside the page for a macrotask after idle, and only
  // then assert. The live page above shows the script injects reliably in this context.
  const page = await context.newPage();
  await page.goto("/article-ja.html");
  await page.waitForLoadState("load");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestIdleCallback(() => setTimeout(resolve, 0), { timeout: 2000 }),
      ),
  );
  await expect(page.locator("lingo-page-card")).toHaveCount(0);
});
