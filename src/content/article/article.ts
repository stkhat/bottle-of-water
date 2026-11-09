import type { Span } from "../../core/classify";
import type { Settings } from "../../core/settings";
import type { send } from "../../messaging/client";
import { createHighlighter, type Highlighter } from "./highlighter";
import {
  collectBlocks,
  createPageText,
  type PageText,
  type TextBlock,
} from "./page-text";
import { shouldRunArticle, type DetectLanguage } from "./should-run";
import { watchVisibleBlocks } from "./visibility";

/** The longest text sample the page language is detected on. */
const DETECT_SAMPLE = 2000;

/** What the article UI needs from the extension, passed in so it runs in tests. */
export interface ArticleDeps {
  /** `send()` from the messaging client. */
  send: typeof send;
  /** Calls `listener` with the new settings after every change; returns an unsubscribe. */
  watchSettings(listener: (settings: Settings) => void): () => void;
  detectLanguage: DetectLanguage;
  /** Mounts Lingo's UI (the PageCard) once the page qualifies; returns an unmount. */
  mountUi(): (() => void) | Promise<() => void>;
}

export interface ArticleOptions {
  /** Where the page's text is read (default `document.body`). */
  root?: Element;
  /** Default `document.documentElement.lang`. */
  htmlLang?: string;
  /** Default `location.hostname`. */
  hostname?: string;
}

export interface ArticleSession {
  readonly pageText: PageText;
  readonly highlighter: Highlighter;
  /** The spans of every analyzed block that is still on the page. */
  readonly spans: ReadonlyMap<TextBlock, readonly Span[]>;
  /** The latest settings. */
  settings(): Settings;
  /** Removes highlights, the UI and every observer and listener. */
  stop(): void;
}

/**
 * Runs the article UI on the page when it qualifies (`shouldRunArticle`): mounts the
 * UI, analyzes blocks as they come near the viewport, highlights their spans, follows
 * page changes and the highlight settings. Resolves undefined when it does not run.
 */
export async function startArticle(
  deps: ArticleDeps,
  options: ArticleOptions = {},
): Promise<ArticleSession | undefined> {
  const root = options.root ?? document.body;
  let settings = await deps.send({ type: "getSettings" });

  const runs = await shouldRunArticle({
    hostname: options.hostname ?? location.hostname,
    htmlLang: options.htmlLang ?? document.documentElement.lang,
    settings,
    sample: () =>
      collectBlocks(root)
        .map((b) => b.text)
        .join("\n")
        .slice(0, DETECT_SAMPLE),
    detect: deps.detectLanguage,
  });
  if (!runs) return undefined;

  const unmountUi = await deps.mountUi();
  const lang = settings.learningLang;
  const highlighter = createHighlighter(settings.highlight);
  const spans = new Map<TextBlock, readonly Span[]>();
  const live = new Set<TextBlock>();
  let warmed = false;

  const visible = watchVisibleBlocks(async (batch) => {
    const result = await deps.send({
      type: "analyze",
      lang,
      blocks: batch.map((b) => b.text),
    });
    if (!warmed) {
      // Load the dictionary now so the first hover or click does not wait for it.
      warmed = true;
      deps
        .send({ type: "warmDictionary", lang })
        .catch((error: unknown) => console.warn("Lingo:", error));
    }
    batch.forEach((block, i) => {
      if (!live.has(block)) return;
      const blockSpans = result.spans[i] ?? [];
      spans.set(block, blockSpans);
      highlighter.set(block, blockSpans);
    });
  });

  const pageText = createPageText(root, {
    onChange({ removed, added }) {
      for (const block of removed) {
        live.delete(block);
        spans.delete(block);
        highlighter.remove(block);
      }
      visible.remove(removed);
      for (const block of added) live.add(block);
      visible.add(added);
    },
  });
  for (const block of pageText.blocks()) live.add(block);
  visible.add(pageText.blocks());

  const unwatch = deps.watchSettings((next) => {
    settings = next;
    highlighter.setEnabled(next.highlight);
  });

  return {
    pageText,
    highlighter,
    spans,
    settings: () => settings,
    stop() {
      unwatch();
      pageText.disconnect();
      visible.disconnect();
      highlighter.destroy();
      spans.clear();
      live.clear();
      unmountUi();
    },
  };
}
