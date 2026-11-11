import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { Settings } from "../../../core/settings";
import { clickOn, dictionary, highlighted } from "../../../testing/article";
import { testBackground } from "../../../testing/background";
import { noTranslation } from "../../../testing/stubs";
import type { DetectLanguage } from "../../article/should-run";
import type { LookupHooks } from "../../lookup/lookup";
import type { PlatformAdapter } from "../platform";
import {
  isCommentText,
  mountCommentsUi,
  startYouTubeComments,
} from "./comments";

beforeAll(async () => {
  await page.viewport(1100, 800);
});

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** One comment as YouTube draws it (docs/notes/youtube-comments.md), trimmed. */
const comment = (author: string, text: string, replies = "") => `
  <ytd-comment-thread-renderer>
    <ytd-comment-view-model id="comment">
      <div id="body"><div id="main">
        <div id="header"><a href="#"><span>${author}</span></a> <a href="#">2 days ago</a></div>
        <ytd-expander id="expander"><div id="content"><yt-attributed-string id="content-text"><span>${text}</span></yt-attributed-string></div></ytd-expander>
        <div id="toolbar"><button>Translate to English</button><button>Reply</button></div>
      </div></div>
    </ytd-comment-view-model>
    ${replies && `<ytd-comment-replies-renderer><div id="expanded-threads">${replies}</div></ytd-comment-replies-renderer>`}
  </ytd-comment-thread-renderer>`;

const COMMENTS = `
  <ytd-comments-header-renderer><h2>Tedious comments</h2></ytd-comments-header-renderer>
  <div id="contents">
    ${comment("@knead_fan", "It can feel tedious at first.", comment("@reply", "Then knead the dough."))}
    ${comment("@japanese", "このパンはtangyな味がします。")}
  </div>`;

/** The comment section under the video, as the page would have it. */
function addComments(html = COMMENTS): HTMLElement {
  const root = document.createElement("ytd-comments");
  root.id = "comments";
  root.style.cssText =
    "display: block; font: 16px/1.6 system-ui, sans-serif; width: 600px";
  root.innerHTML = html;
  for (const el of root.querySelectorAll(
    "ytd-comment-thread-renderer, ytd-comment-view-model, ytd-expander, ytd-comment-replies-renderer, ytd-comments-header-renderer",
  ))
    (el as HTMLElement).style.display = "block";
  document.body.prepend(root);
  cleanups.push(() => root.remove());
  return root;
}

/** A YouTube adapter with only what the comments use; `navigate` moves to a video. */
function fakeAdapter(first = "abc") {
  let id: string | undefined = first;
  const listeners = new Set<() => void>();
  const adapter = {
    platform: "youtube",
    videoId: () => id,
    url: () => `https://www.youtube.com/watch?v=${id}`,
    title: () => `Video ${id}`,
    onNavigate(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as PlatformAdapter;
  return {
    adapter,
    navigate(next: string | undefined) {
      id = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Japanese for text with kana or kanji, else English; both reliable. */
const detect: DetectLanguage = async (text) => ({
  isReliable: true,
  languages: [
    {
      language: /[぀-ヿ一-鿿]/.test(text) ? "ja" : "en",
      percentage: 95,
    },
  ],
});

function start(
  options: { settings?: Partial<Settings>; hooks?: LookupHooks } = {},
) {
  const background = testBackground({
    highlight: { new: true, learning: true, known: false },
    ...options.settings,
  });
  cleanups.push(() => background.close());
  const fake = fakeAdapter();
  const runner = startYouTubeComments(
    {
      send: background.send,
      watchSettings: background.watchSettings,
      watchPackState: background.watchPackState,
      detectLanguage: detect,
      mountUi: mountCommentsUi,
      createTranslator: () => noTranslation,
      ...options.hooks,
    },
    { adapter: fake.adapter, hostname: "www.youtube.com" },
  );
  cleanups.push(() => runner.stop());
  return { background, runner, navigate: fake.navigate };
}

const newWords = () => highlighted("lingo-new").sort();

describe("YouTube comments", () => {
  it("highlights the words of comments and replies only", async () => {
    addComments();
    start();
    await expect
      .poll(newWords, { timeout: 5000 })
      .toEqual(["knead", "tedious"]);
    // Not the author "@knead_fan", the header or the buttons.
    for (const range of CSS.highlights.get("lingo-new") ?? [])
      expect(
        (range as Range).startContainer.parentElement?.closest("#content-text"),
      ).not.toBeNull();
  });

  it("leaves a comment in another language alone", async () => {
    addComments();
    const { background } = start();
    await expect
      .poll(newWords, { timeout: 5000 })
      .toEqual(["knead", "tedious"]);
    const analyzed = background.sent("analyze").flatMap((r) => r.blocks);
    expect(analyzed.some((text) => text.includes("tangy"))).toBe(false);
  });

  it("waits for the comment section and follows comments loaded later", async () => {
    start();
    await new Promise((r) => setTimeout(r, 100));
    const root = addComments(
      `<div id="contents">${comment("@a", "It can feel tedious at first.")}</div>`,
    );
    await expect.poll(newWords, { timeout: 5000 }).toEqual(["tedious"]);

    const more = document.createElement("div");
    more.innerHTML = comment("@b", "Then knead the dough.");
    root.querySelector("#contents")!.append(more);
    for (const el of more.querySelectorAll(
      "ytd-comment-thread-renderer, ytd-comment-view-model, ytd-expander",
    ))
      (el as HTMLElement).style.display = "block";
    await expect
      .poll(newWords, { timeout: 5000 })
      .toEqual(["knead", "tedious"]);
  });

  it("saves and records with the video as the source", async () => {
    const root = addComments();
    const { background } = start();
    await expect.poll(newWords, { timeout: 5000 }).toContain("tedious");
    const video = {
      platform: "youtube",
      url: "https://www.youtube.com/watch?v=abc",
      title: "Video abc",
      lang: "en",
    };
    await expect
      .poll(() => background.sent("recordHistory")[0]?.source)
      .toEqual(video);

    await clickOn(root, "tedious");
    await expect.element(dictionary()).toBeVisible();
    await dictionary().getByRole("button", { name: "Learning" }).click();
    await expect.poll(() => background.sent("saveTerm").length).toBe(1);
    const [saved] = background.sent("saveTerm");
    expect(saved!.source).toEqual(video);
    expect(saved!.pos).toEqual({ textQuote: "It can feel tedious at first." });
    await expect.poll(() => highlighted("lingo-learning")).toEqual(["tedious"]);
  });

  it("starts over on another video, recording under that video", async () => {
    addComments();
    const { background, navigate } = start();
    await expect
      .poll(() => background.sent("recordHistory").length, { timeout: 5000 })
      .toBe(1);
    navigate("def");
    await expect
      .poll(() => background.sent("recordHistory").length, { timeout: 5000 })
      .toBe(2);
    expect(background.sent("recordHistory")[1]!.source.url).toBe(
      "https://www.youtube.com/watch?v=def",
    );

    // Away from a watch page, nothing runs.
    navigate(undefined);
    await expect.poll(newWords).toEqual([]);
  });

  it("goes when the comments, YouTube or the site are switched off", async () => {
    addComments();
    const { background } = start();
    await expect.poll(newWords, { timeout: 5000 }).toHaveLength(2);
    background.changeSettings({ sites: { youtubeComments: false } });
    await expect.poll(newWords).toEqual([]);
    expect(document.querySelector("lingo-comments")).toBeNull();

    background.changeSettings({ sites: { youtubeComments: true } });
    await expect.poll(newWords, { timeout: 5000 }).toHaveLength(2);
    background.changeSettings({ disabledSites: ["www.youtube.com"] });
    await expect.poll(newWords).toEqual([]);
  });

  it("tells the video when its panel opens and when a term changes", async () => {
    const root = addComments();
    const onPanelOpen = vi.fn();
    const onTermsChanged = vi.fn();
    const { runner } = start({ hooks: { onPanelOpen, onTermsChanged } });
    await expect.poll(newWords, { timeout: 5000 }).toContain("knead");

    await clickOn(root, "knead the");
    await expect.element(dictionary()).toBeVisible();
    expect(onPanelOpen).toHaveBeenCalledOnce();
    await dictionary().getByRole("button", { name: "Known" }).click();
    await expect.poll(() => onTermsChanged.mock.calls.length).toBe(1);

    // The video's window opened: the panel goes.
    runner.closePanel();
    await expect.element(dictionary()).not.toBeInTheDocument();
  });
});

describe("isCommentText", () => {
  it("takes the text of a comment's body only", () => {
    const root = addComments();
    const texts = [...root.querySelectorAll("span, a, button, h2")]
      .map((el) => el.firstChild)
      .filter((node): node is Text => node instanceof Text);
    const accepted = texts.filter(isCommentText).map((t) => t.data);
    expect(accepted).toEqual([
      "It can feel tedious at first.",
      "Then knead the dough.",
      "このパンはtangyな味がします。",
    ]);
  });
});
