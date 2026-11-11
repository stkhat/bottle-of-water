// Downloaded language data, end to end: the check-download build (`npm run
// build:check-download`) downloads its Spanish data (es, es-en) from the local npm
// mirror of serve.mjs, which the tests hold back or break through /mirror-control.
// Every test also fails when the extension logged an error or a warning, or threw
// (error-collector.ts), as in extension-errors.spec.ts.
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import lock from "../src/core/packs/packs.lock.json" with { type: "json" };
import {
  collectExtensionErrors,
  connectBrowserCdp,
  freePort,
  type BrowserCdp,
  type ErrorCollector,
} from "./error-collector";
import {
  test as base,
  extensionIdOf,
  launchWithExtension,
  openPopupFor,
  sendToBackground,
} from "./fixtures";

const MIRROR_CONTROL = "http://localhost:4719/mirror-control";

interface MirrorState {
  broken: boolean;
  hold: boolean;
  /** Requests waiting for hold=0. */
  held: number;
  /** Requests answered since the last reset. */
  served: number;
}

/** Changes how the mirror answers (see serve.mjs), then gives its state. */
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

const test = base.extend<{
  resetMirror: void;
  port: number;
  cdp: BrowserCdp;
  errors: ErrorCollector;
}>({
  // eslint-disable-next-line no-empty-pattern
  resetMirror: async ({}, use) => {
    await mirror({ reset: true });
    await use();
    // Answers what is still held.
    await mirror({ reset: true });
  },
  // eslint-disable-next-line no-empty-pattern
  port: async ({}, use) => {
    await use(await freePort());
  },
  context: async ({ port, resetMirror }, use) => {
    void resetMirror;
    const context = await launchWithExtension(
      [`--remote-debugging-port=${port}`],
      "download",
    );
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
  cdp: async ({ context, port }, use) => {
    void context;
    const cdp = await connectBrowserCdp(port);
    await use(cdp);
    cdp.close();
  },
  errors: [
    async ({ context, extensionId, cdp }, use) => {
      const errors = await collectExtensionErrors(context, extensionId, cdp);
      await use(errors);
      // A last round trip: whatever the background was doing has been reported.
      await sendToBackground(context, extensionId, { type: "getSettings" });
      errors.stop();
      expect(errors.format(), "Lingo's reports on the Errors page").toBe("");
    },
    { auto: true },
  ],
});
const expect = test.expect;

// The tests share the mirror's switches: one at a time.
test.describe.configure({ lock: "local-pack-mirror" });

/** The text of every range registered under a highlight name ([] when it is not registered). */
function highlighted(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString()),
    name,
  );
}

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
  return { options, row };
}

test("a Spanish page waits for its data while it downloads, then is highlighted", async ({
  context,
  extensionId,
}) => {
  await mirror({ hold: true });
  // A word saved before the data is there (saving needs none).
  expect(
    await sendToBackground(context, extensionId, {
      type: "saveTerm",
      lang: "es",
      key: "comer",
      display: "comiendo",
      kind: "word",
      status: "learning",
      source: {
        platform: "web",
        url: "http://localhost:4719/article-es.html",
        title: "Una tarde en el huerto",
        lang: "es",
      },
      sentence: "Una tarde la encontré en la cocina comiendo pan con aceite.",
      pos: { textQuote: "comiendo" },
    }),
  ).toMatchObject({ ok: true });
  await learnSpanish(context, extensionId);
  await expect.poll(async () => (await mirror()).held).toBeGreaterThan(0);

  const page = await context.newPage();
  await page.goto("/article-es.html");
  await expect(page.locator("lingo-article")).toHaveCount(1);
  // The page asked for an analysis and was told the data is missing: nothing shows.
  await page.waitForTimeout(1_000);
  expect(await highlighted(page, "lingo-new")).toEqual([]);
  expect(await highlighted(page, "lingo-learning")).toEqual([]);

  const popup = await openPopupFor(context, extensionId, page);
  const note = popup.getByRole("status").filter({ hasText: "Spanish data" });
  await expect(note).toHaveText(
    en["data.downloading"]
      .replace("{language}", "Spanish")
      .replace("{percent}", "0"),
  );
  const { options, row } = await openDataRow(context, extensionId);
  await expect(row).toContainText(SPANISH_SIZE);
  await expect(row).toContainText(
    en["settings.languages.dataDownloading"].replace("{percent}", "0"),
  );
  // The word list shows the saved word without its meaning meanwhile.
  const wordList = await context.newPage();
  await wordList.goto(`chrome-extension://${extensionId}/wordlist.html`);
  const saved = wordList
    .getByRole("region", { name: en["wordlist.list"] })
    .getByRole("button", { name: /^comer/ });
  await expect(saved).toContainText("Learning");
  await expect(saved).not.toContainText("to eat");

  await mirror({ hold: false });
  await expect
    .poll(() => highlighted(page, "lingo-new"), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(["a escondidas"]));
  await expect
    .poll(() => highlighted(page, "lingo-learning"))
    .toEqual(["comiendo"]);
  await expect(note).toHaveCount(0);
  await expect(row).toContainText(en["settings.languages.dataDownloaded"]);
  await expect(row).toContainText(SPANISH_SIZE);
  await expect(saved).toContainText("to eat");
  expect((await mirror()).served).toBe(
    lock.packs.es.files.length + lock.packs["es-en"].files.length,
  );

  // A hover on the page now finds the dictionary.
  await page.bringToFront();
  await options.close();
  const box = await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf("comiendo");
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + "comiendo".length);
      node.parentElement!.scrollIntoView({ block: "center" });
      const r = range.getBoundingClientRect();
      return { x: r.left + 3, y: r.top + r.height / 2 };
    }
    throw new Error("comiendo not found");
  });
  await page.mouse.move(box.x, box.y);
  await expect(page.getByText("to eat", { exact: true })).toBeVisible();
});

test("a broken file on the mirror: Couldn't download, then Retry in Settings downloads it", async ({
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
    note.getByRole("button", { name: en["data.retry"] }),
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
  const { row } = await openDataRow(context, extensionId);
  await expect(row).toContainText(en["settings.languages.dataFailed"]);
  expect(await highlighted(page, "lingo-new")).toEqual([]);

  await mirror({ broken: false });
  await row
    .getByRole("button", { name: en["settings.languages.dataRetry"] })
    .click();
  await expect(row).toContainText(en["settings.languages.dataDownloaded"]);
  await expect(note).toHaveCount(0);
  await expect
    .poll(() => highlighted(page, "lingo-new"), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(["a escondidas"]));
});
