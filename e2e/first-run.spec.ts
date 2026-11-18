// A new install: no language data comes with the extension. It chooses its language
// pair from the browser's UI language and downloads that pair's data at once, from the
// lock's mirrors (routed to data/packs/, pack-mirrors.ts), while the popup and
// Settings show the download.
import type { BrowserContext } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import lock from "../src/core/packs/packs.lock.json" with { type: "json" };
import { openPopupFor, testWithErrors } from "./fixtures";
import { mirrorRequests, releasePackMirrors } from "./pack-mirrors";
import { COLD_LOAD, highlighted, showNewWords } from "./page";

const test = testWithErrors;
const expect = test.expect;

// The pair the new install chooses, and its downloads held until the test lets them go.
test.use({ startPair: null, mirrorsHeld: true });

interface WorkerApi {
  i18n: { getUILanguage(): string };
  storage: { sync: { get(key: string): Promise<{ settings?: unknown }> } };
}

/** The browser's UI language and the stored settings, as the service worker reads them. */
async function workerState(context: BrowserContext) {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  return worker.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: WorkerApi }).chrome;
    return {
      ui: api.i18n.getUILanguage(),
      settings: (await api.storage.sync.get("settings")).settings,
    };
  });
}

const JAPANESE_PACKS = ["en", "en-defs", "en-ja"] as const;
/** English → Japanese's size as Settings shows it ("33.2 MB"). */
const JAPANESE_SIZE = `${(
  JAPANESE_PACKS.flatMap((pack) => lock.packs[pack].files).reduce(
    (sum, file) => sum + file.size,
    0,
  ) /
  (1024 * 1024)
).toFixed(1)} MB`;

test("a new install with a Japanese UI downloads English → Japanese only, as the popup and Settings show, then analyzes pages", async ({
  context,
  extensionId,
}) => {
  const { ui } = await workerState(context);
  test.skip(
    !ui.startsWith("ja"),
    `The browser's UI language is ${ui}: macOS ignores --lang=ja`,
  );
  await expect
    .poll(async () => (await workerState(context)).settings)
    .toMatchObject({ learningLang: "en", nativeLang: "ja" });

  await showNewWords(context, extensionId);
  const page = await context.newPage();
  await page.goto("/article-en.html");
  const popup = await openPopupFor(context, extensionId, page);
  await expect(popup.getByRole("status")).toContainText(
    en["data.downloading"]
      .replace("{language}", "English")
      .replace("{percent}", "0"),
  );
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const row = options
    .locator("div.sub")
    .filter({ hasText: "English → Japanese" });
  await expect(row).toContainText(JAPANESE_SIZE);
  await expect(row).toContainText(
    en["settings.languages.dataDownloading"].replace("{percent}", "0"),
  );
  expect(await highlighted(page, "langle-new")).toEqual([]);
  releasePackMirrors(context);
  await expect(row).toContainText(
    en["settings.languages.dataDownloaded"],
    COLD_LOAD,
  );
  await expect(popup.getByRole("status")).toHaveCount(0);
  await expect
    .poll(async () => (await highlighted(page, "langle-new")).length, COLD_LOAD)
    .toBeGreaterThan(0);

  // Each file of the pair's packs once, from the first mirror; nothing else.
  const urls = mirrorRequests(context);
  const files = JAPANESE_PACKS.flatMap((pack) =>
    lock.packs[pack].files.map(
      (file) =>
        `https://cdn.jsdelivr.net/npm/${lock.packs[pack].package}@${lock.packs[pack].version}/${file.path}`,
    ),
  );
  expect([...urls].sort()).toEqual(files.sort());
});
