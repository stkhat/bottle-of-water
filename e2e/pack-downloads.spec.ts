// Downloaded language data, end to end: the check-download build downloads its Spanish
// data (es, es-en) from the local npm mirror of serve.ts, which the test breaks
// through /mirror-control.
import type { BrowserContext } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import lock from "../src/core/packs/packs.lock.json" with { type: "json" };
import { openPopupFor, sendToBackground, testWithErrors } from "./fixtures";
import { highlighted } from "./page";

const MIRROR_CONTROL = "http://localhost:4719/mirror-control";

interface MirrorState {
  broken: boolean;
  hold: boolean;
  /** Requests waiting for hold=0. */
  held: number;
  /** Requests answered since the last reset. */
  served: number;
}

/** Changes how the mirror answers (see serve.ts), then gives its state. */
async function mirror(
  change: { broken?: boolean; hold?: boolean; reset?: true } = {},
): Promise<MirrorState> {
  const params = new URLSearchParams(
    Object.entries(change).map(([key, on]) => [key, on ? "1" : "0"]),
  );
  const response = await fetch(`${MIRROR_CONTROL}?${params}`, {
    method: Object.keys(change).length > 0 ? "POST" : "GET",
  });
  return (await response.json()) as MirrorState;
}

const test = testWithErrors.extend<{
  // Playwright types a fixture without a value as void.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  resetMirror: void;
}>({
  build: "download",
  resetMirror: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await mirror({ reset: true });
      await use();
      // Answers what is still held.
      await mirror({ reset: true });
    },
    { auto: true },
  ],
});
const expect = test.expect;

/** Spanish → English, with New highlighted ("comer" is new at the lowest level). */
async function learnSpanish(context: BrowserContext, extensionId: string) {
  const reply = await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: {
      learningLang: "es",
      nativeLang: "en",
      knownLevel: 1000,
      highlight: { new: true },
    },
  });
  expect(reply).toMatchObject({ ok: true });
}

/** The Spanish data's size as Settings shows it ("6.2 MB"). */
const SPANISH_SIZE = `${(
  [...lock.packs.es.files, ...lock.packs["es-en"].files].reduce(
    (sum, file) => sum + file.size,
    0,
  ) /
  (1024 * 1024)
).toFixed(1)} MB`;

/** Settings → Languages → Language data: the chosen pair's row. */
async function openDataRow(context: BrowserContext, extensionId: string) {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const row = options
    .locator("div.sub")
    .filter({ hasText: "Spanish → English" });
  return row;
}

test("a broken file on the mirror: Couldn't download, then Retry in Settings downloads it and the page is highlighted", async ({
  context,
  extensionId,
}) => {
  await mirror({ broken: true });
  await learnSpanish(context, extensionId);
  const page = await context.newPage();
  await page.goto("/article-es.html");

  const popup = await openPopupFor(context, extensionId, page);
  const note = popup.getByRole("status").filter({ hasText: "Spanish data" });
  await expect(note).toContainText(
    en["data.failed"].replace("{language}", "Spanish"),
  );
  await expect(
    note.getByRole("button", { name: en["action.retry"] }),
  ).toBeVisible();
  // The mirror's bytes were refused: their SHA-256 is not the lock's.
  const states = (await popup.evaluate(async () => {
    const { chrome: api } = globalThis as unknown as {
      chrome: {
        storage: { local: { get(key: string): Promise<object> } };
      };
    };
    return api.storage.local.get("packState");
  })) as { packState: Record<string, { state: string; error?: string }> };
  for (const pack of ["es", "es-en"])
    expect(states.packState[pack]).toMatchObject({
      state: "failed",
      error: expect.stringContaining("SHA-256 does not match the lock"),
    });
  const row = await openDataRow(context, extensionId);
  await expect(row).toContainText(en["settings.languages.dataFailed"]);
  expect(await highlighted(page, "lingo-new")).toEqual([]);

  await mirror({ broken: false });
  await row.getByRole("button", { name: en["action.retry"] }).click();
  await expect(row).toContainText(en["settings.languages.dataDownloaded"]);
  await expect(row).toContainText(SPANISH_SIZE);
  await expect(note).toHaveCount(0);
  await expect
    .poll(() => highlighted(page, "lingo-new"), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(["a escondidas"]));
});
