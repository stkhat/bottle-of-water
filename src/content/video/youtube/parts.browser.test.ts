import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { page } from "vitest/browser";
import { clickOn, dictionary, highlighted } from "../../../testing/article";
import { testBackground } from "../../../testing/background";
import { detectEnglish, noTranslation } from "../../../testing/stubs";
import { createTestPage, VIDEO_ID } from "../../../testing/youtube-page";
import { startVideo, type VideoSession } from "../session";
import { createYouTubeAdapter } from "./adapter";
import { mountCommentsUi, startYouTubeComments } from "./comments";
import { installYouTubeHooks } from "./page";
import { startYouTubeParts } from "./parts";

let uninstall: () => void;
beforeAll(async () => {
  await page.viewport(1100, 800);
  uninstall = installYouTubeHooks();
});
afterAll(() => uninstall());

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** The comment section under the video, trimmed to what the comments part reads. */
function addComments() {
  const root = document.createElement("ytd-comments");
  root.id = "comments";
  root.style.cssText = "display: block; font: 16px/1.6 system-ui; width: 600px";
  root.innerHTML = `<ytd-comment-view-model style="display: block"><yt-attributed-string id="content-text"><span>It can feel tedious at first.</span></yt-attributed-string></ytd-comment-view-model>`;
  document.body.prepend(root);
  cleanups.push(() => root.remove());
  return root;
}

async function start() {
  const testPage = createTestPage();
  cleanups.push(() => testPage.remove());
  const adapter = createYouTubeAdapter({
    href: () => `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    playerRequestWaitMs: 100,
    captureTimeoutMs: 1000,
    pollMs: 20,
  });
  cleanups.push(() => adapter.dispose());
  const background = testBackground({
    highlight: { new: true, learning: true, known: false },
  });
  cleanups.push(() => background.close());
  const deps = {
    send: background.send,
    watchSettings: background.watchSettings,
    watchPackState: background.watchPackState,
    createTranslator: () => noTranslation,
  };
  const { comments, video } = await startYouTubeParts(
    (hooks) =>
      startYouTubeComments(
        {
          ...deps,
          detectLanguage: detectEnglish,
          mountUi: mountCommentsUi,
          ...hooks,
        },
        { adapter, hostname: "www.youtube.com" },
      ),
    (hooks) =>
      startVideo({
        ...deps,
        adapter,
        translatorAvailable: async () => false,
        ...hooks,
      }),
  );
  cleanups.push(() => comments.stop());
  cleanups.push(() => video?.stop());
  return { background, video: video! };
}

/** A word of the subtitles that has a dictionary window. */
function aWord(video: VideoSession) {
  const { spans } = video.app.store.get();
  const cue = spans.findIndex((s) => s?.some((x) => x.category !== "ignored"));
  return {
    cue,
    span: spans[cue]!.findIndex((x) => x.category !== "ignored"),
  };
}

it("one dictionary at a time, and a term saved in the comments reaches the video", async () => {
  const root = addComments();
  const { background, video } = await start();
  const state = () => video.app.store.get();
  await expect.poll(() => state().status, { timeout: 5000 }).toBe("ready");
  await expect
    .poll(() => highlighted("lingo-new"), { timeout: 5000 })
    .toEqual(["tedious"]);

  video.app.clickWord(aWord(video));
  await expect.poll(() => state().panel).not.toBeNull();
  await clickOn(root, "tedious");
  await expect.element(dictionary()).toBeVisible();
  expect(state().panel).toBeNull();

  video.app.clickWord(aWord(video));
  await expect.element(dictionary()).not.toBeInTheDocument();

  // The video classifies its subtitles again.
  const first = state().cues[0]!.text;
  const videoAnalyses = () =>
    background.sent("analyze").filter((r) => r.blocks.includes(first)).length;
  const before = videoAnalyses();
  await clickOn(root, "tedious");
  await dictionary().getByRole("button", { name: "Learning" }).click();
  await expect.poll(videoAnalyses).toBe(before + 1);
});
