import { test, expect } from "./fixtures";
import { highlighted } from "./page";

test("a settings change reaches an open article page at once", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  expect(await highlighted(page, "lingo-new")).toEqual([]);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const newSwitch = options.getByRole("switch", {
    name: "Highlight New words",
  });
  await expect(newSwitch).not.toBeChecked();
  await newSwitch.click();
  await expect(newSwitch).toBeChecked();
  await expect
    .poll(async () => (await highlighted(page, "lingo-new")).length)
    .toBeGreaterThan(0);
});
