import { test, expect, sendToBackground } from "./fixtures";

declare global {
  interface Window {
    /** performance.now() when the card's host appeared and when the first highlight came. */
    lingoTimes?: { mounted?: number; analyzed?: number };
  }
}

/** Records when the card mounts and when the background's analysis is highlighted. */
function watchCard() {
  const times: { mounted?: number; analyzed?: number } = {};
  window.lingoTimes = times;
  new MutationObserver(() => {
    if (
      document.querySelector("lingo-page-card") &&
      times.mounted === undefined
    )
      times.mounted = performance.now();
  }).observe(document, { subtree: true, childList: true });
  const poll = () => {
    if ((CSS.highlights.get("lingo-new")?.size ?? 0) > 0)
      times.analyzed = performance.now();
    else requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

async function analyzeTime(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => window.lingoTimes?.analyzed), {
      timeout: 20_000,
    })
    .toBeDefined();
  const times = await page.evaluate(() => window.lingoTimes);
  return Math.round(times!.analyzed! - times!.mounted!);
}

test("the content script gets the page analyzed by the background", async ({
  context,
  extensionId,
}) => {
  // New words are highlighted once the analysis comes back.
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { highlight: { new: true } },
  });
  await context.addInitScript(watchCard);

  // The first analysis loads the packs in the background (cold); the second reuses them.
  const cold = await context.newPage();
  await cold.goto("/article-en.html");
  const coldMs = await analyzeTime(cold);

  const warm = await context.newPage();
  await warm.goto("/article-en.html");
  const warmMs = await analyzeTime(warm);

  // A stopped service worker starts again on the next message and reloads the packs.
  const cdp = await context.newCDPSession(warm);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  const restarted = await context.newPage();
  await restarted.goto("/article-en.html");
  const restartMs = await analyzeTime(restarted);

  const timings = { cold: coldMs, warm: warmMs, restart: restartMs };
  for (const [name, ms] of Object.entries(timings))
    test.info().annotations.push({
      type: `analyze-${name}-ms`,
      description: String(ms),
    });
  console.log(`analyze after mount (ms): ${JSON.stringify(timings)}`);
});
