import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";

test("page styles do not leak into the card", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/hostile.html");
  const title = page.getByText(en["app.name"], { exact: true });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("color", "rgb(20, 24, 43)");
  await expect(title).toHaveCSS("font-size", "15px");
});

test("the extension does not leak CSS into the page", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/hostile.html");
  await expect(page.locator("lingo-page-card")).toHaveCount(1);
  await expect(page.locator("#page-text")).toHaveCSS("color", "rgb(255, 0, 0)");
  const injected = await page.evaluate(
    () => document.head.querySelectorAll("style, link[rel=stylesheet]").length,
  );
  // hostile.html ships exactly one inline <style> of its own.
  expect(injected).toBe(1);
});
