// Test helpers for the article UI: a page fixture, the real background over a stub
// pack (test-background.ts), the UI mounted in a shadow root, and pointer helpers.
import { render } from "preact";
import { expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Settings } from "../../core/settings";
import type { Request } from "../../messaging/protocol";
import { ArticleUi } from "../ui/ArticleUi";
import { startArticle, type ArticleSession } from "./article";
import { testBackground } from "./test-background";
import type { TranslationProvider } from "./translate";

const cleanups: (() => void | Promise<void>)[] = [];

export async function cleanUp() {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  getSelection()?.removeAllRanges();
}

export interface SetupOptions {
  settings?: Partial<Settings>;
  translator?: TranslationProvider;
  /** Runs before each request reaches the background, e.g. to slow it down. */
  beforeRequest?: (request: Request) => Promise<void>;
  /** Runs before the page starts, e.g. to save terms. */
  before?: (background: ReturnType<typeof testBackground>) => Promise<void>;
}

/** Text nodes under `root` in order. */
function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/** A Range over the `nth` occurrence of `text` inside one text node under `root`. */
export function rangeOfText(root: Node, text: string, nth = 0): Range {
  let seen = 0;
  for (const node of textNodes(root)) {
    let i = node.data.indexOf(text);
    while (i >= 0) {
      if (seen++ === nth) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + text.length);
        return range;
      }
      i = node.data.indexOf(text, i + 1);
    }
  }
  throw new Error(`"${text}" #${nth} not found`);
}

/** Starts the article UI on a fixture page with the real background behind `send`. */
export async function setup(html: string, options: SetupOptions = {}) {
  const background = testBackground(options.settings);
  cleanups.push(() => background.close());
  await options.before?.(background);

  const root = document.createElement("div");
  root.style.cssText =
    "font: 19px/1.75 Georgia, serif; width: 560px; padding: 0 24px";
  root.innerHTML = html;
  document.body.prepend(root);
  cleanups.push(() => root.remove());

  const settingsListeners = new Set<(s: Settings) => void>();
  const translator: TranslationProvider = options.translator ?? {
    translate: async () => undefined,
  };

  const session = (await startArticle(
    {
      send: options.beforeRequest
        ? ((async (request: Request) => {
            await options.beforeRequest!(request);
            return background.send(request as never);
          }) as typeof background.send)
        : background.send,
      watchSettings(listener) {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      },
      detectLanguage: async () => ({
        isReliable: true,
        languages: [{ language: "en", percentage: 99 }],
      }),
      mountUi(app) {
        const host = document.createElement("lingo-test-ui");
        document.body.append(host);
        const container = document.createElement("div");
        host.attachShadow({ mode: "open" }).append(container);
        render(<ArticleUi app={app} />, container);
        return () => {
          render(null, container);
          host.remove();
        };
      },
      createTranslator: () => translator,
    },
    { root, htmlLang: "en", hostname: "example.com" },
  )) as ArticleSession;
  expect(session).toBeDefined();
  cleanups.push(() => session.stop());

  // The first batch: every block near the viewport.
  // The first analysis opens the database and loads the pack: slow on CI runners.
  await expect
    .poll(() => session.spans.size, { timeout: 5000 })
    .toBeGreaterThan(0);

  return {
    background,
    session,
    root,
    /** Delivers settings to the page as `storage.onChanged` would. */
    changeSettings(next: Settings) {
      for (const listener of settingsListeners) listener(next);
    },
  };
}

export function rectOf(root: Node, text: string, nth = 0): DOMRect {
  return rangeOfText(root, text, nth).getBoundingClientRect();
}

/** Moves the mouse onto a word (a little in from its left edge). */
export async function pointAt(root: Node, text: string, nth = 0) {
  const rect = rectOf(root, text, nth);
  await userEvent.pointer({
    coords: { x: rect.left + 3, y: rect.top + rect.height / 2 },
  });
}

/** Moves the mouse to a viewport point. */
export async function pointTo(x: number, y: number) {
  await userEvent.pointer({ coords: { x, y } });
}

export async function clickOn(root: Node, text: string, nth = 0) {
  const rect = rectOf(root, text, nth);
  await userEvent.pointer({
    coords: { x: rect.left + 3, y: rect.top + rect.height / 2 },
    keys: "[MouseLeft]",
  });
}

/** Drags the mouse from inside one piece of text to inside another, selecting it. */
export async function dragSelect(
  root: Node,
  from: string,
  fromOffset: number,
  to: string,
  toOffset: number,
) {
  const a = rangeOfText(root, from);
  a.setStart(a.startContainer, a.startOffset + fromOffset);
  a.collapse(true);
  const b = rangeOfText(root, to);
  b.setStart(b.startContainer, b.startOffset + toOffset);
  b.collapse(true);
  const ra = rangeOfText(root, from).getBoundingClientRect();
  const pa = a.getBoundingClientRect();
  const pb = b.getBoundingClientRect();
  const y = (r: DOMRect) => r.top + r.height / 2;
  await userEvent.pointer([
    { coords: { x: pa.left, y: y(ra) }, keys: "[MouseLeft>]" },
    { coords: { x: (pa.left + pb.left) / 2, y: y(ra) } },
    // Move, then release where the pointer is: Firefox can drop the last move
    // when it comes with the release.
    { coords: { x: pb.left, y: y(pb.height ? pb : ra) } },
    { coords: { x: pb.left, y: y(pb.height ? pb : ra) }, keys: "[/MouseLeft]" },
  ]);
}

/**
 * Selects from inside one piece of text to inside another with the Selection API, as
 * the end of a drag leaves it (for tests about what happens with a selection, not
 * about making one).
 */
export function selectText(
  root: Node,
  from: string,
  fromOffset: number,
  to: string,
  toOffset: number,
) {
  const a = rangeOfText(root, from);
  const b = rangeOfText(root, to);
  getSelection()!.setBaseAndExtent(
    a.startContainer,
    a.startOffset + fromOffset,
    b.startContainer,
    b.startOffset + toOffset,
  );
}

export const highlighted = (name: string) =>
  [...(CSS.highlights.get(name) ?? [])].map((r) => (r as Range).toString());

export const dictionary = () =>
  page.getByRole("complementary", { name: "Dictionary" });
