import type { Category, Span, WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import {
  unsupportedPage,
  type PageRequest,
  type PageSummary,
} from "../../messaging/page-protocol";
import type { SourceInput } from "../../messaging/protocol";
import type { TermCard } from "../lookup/describe";
import {
  createLookup,
  createMarkAll,
  sameTerm,
  type LookupDeps,
  type Term,
} from "../lookup/lookup";
import { sendStatus } from "../lookup/status";
import { warn } from "../lookup/warn";
import { inOtherLanguage } from "../page-language";
import { createStore } from "../store";
import { createCards, writtenOf } from "./cards";
import { watchEndOfArticle } from "./end-of-article";
import { createHighlighter } from "./highlighter";
import { watchInteractions } from "./interactions";
import {
  createBlockIndex,
  spanAtPoint,
  type SpanMap,
  type SpanRef,
} from "./locate";
import type { MainContent } from "./main-content";
import { collectBlocks, createPageText, type TextBlock } from "./page-text";
import { createRecorder } from "./recorder";
import { createSelection } from "./selection";
import { sentenceAt } from "./sentence";
import type { DetectLanguage } from "./should-run";
import type { ArticleApp, ArticleState } from "./state";
import { articleSurface, type PageSurface } from "./surface";
import { batches, watchVisibleBlocks } from "./visibility";

/** The longest text sample the page language is detected on. */
const DETECT_SAMPLE = 2000;

export interface ArticleDeps extends LookupDeps {
  detectLanguage: DetectLanguage;
  /** Mounts Lingo's UI for the page once it qualifies; returns an unmount. */
  mountUi(app: ArticleApp): (() => void) | Promise<() => void>;
}

export interface ArticleOptions {
  /** Where the page's text is read (default `document.body`). */
  root?: Element;
  /** Default `document.documentElement.lang`. */
  htmlLang?: string;
  /** Default `location.hostname`. */
  hostname?: string;
  /** The settings to start with (default: asked from the background). */
  settings?: Settings;
  /**
   * Where the UI runs and what it records (default: an article page, from `hostname`
   * and `htmlLang`).
   */
  surface?: PageSurface;
}

/** The page's host, and the surface the options name, else an article page. */
function pageOf(options: ArticleOptions) {
  const hostname = options.hostname ?? location.hostname;
  const surface =
    options.surface ??
    articleSurface({
      hostname,
      htmlLang: options.htmlLang ?? document.documentElement.lang,
    });
  return { hostname, surface };
}

export interface ArticleSession {
  /** Classifies every analyzed block again (after saved terms changed elsewhere). */
  reanalyze(): Promise<void>;
  /** The spans of every analyzed block that is still on the page. */
  readonly spans: ReadonlyMap<TextBlock, readonly Span[]>;
  readonly app: ArticleApp;
  /** Answers the popup about this page (see `page-protocol.ts`). */
  handlePageRequest(request: PageRequest): Promise<PageSummary>;
  /** Removes highlights, the UI and every observer and listener. */
  stop(): void;
}

/**
 * Runs the article UI on the page when it qualifies (`shouldRunArticle`): mounts the
 * UI, analyzes blocks as they come near the viewport, highlights their spans, follows
 * page changes and the settings, and answers hovers, clicks and the UI's controls.
 * While the language data is not on the device, the page shows nothing: the blocks
 * wait, and are analyzed once the data is ready. Resolves undefined when it does not
 * run.
 */
export async function startArticle(
  deps: ArticleDeps,
  options: ArticleOptions = {},
): Promise<ArticleSession | undefined> {
  const root = options.root ?? document.body;
  const { hostname, surface } = pageOf(options);
  let settings = options.settings ?? (await deps.send({ type: "getSettings" }));

  const runs = await surface.qualifies({
    settings,
    sample: () =>
      collectBlocks(root, surface.acceptText)
        .map((b) => b.text)
        .join("\n")
        .slice(0, DETECT_SAMPLE),
    detect: deps.detectLanguage,
  });
  if (!runs) return undefined;

  const lang = settings.learningLang;
  const highlighter = createHighlighter(settings.highlight);
  const spans: SpanMap = new Map();
  const live = new Set<TextBlock>();
  const index = createBlockIndex();
  /** The latest analysis or local change of each block; older results are dropped. */
  const versions = new Map<TextBlock, number>();
  let version = 0;
  /** The part that counts (the article's title and body), found again after page changes. */
  let main: MainContent = surface.mainContent(root, []);
  /** Analyzed blocks whose spans are highlighted (in scope). */
  const shown = new Set<TextBlock>();
  /** Saved terms the analyses found on the page. */
  const savedKeys = new Set<string>();
  /** Blocks whose analysis waits for language data that is not on the device. */
  const waiting = new Set<TextBlock>();
  const lookup = createLookup(deps, {
    settings: () => settings,
    lang: () => lang,
    url: () => surface.url(),
    packsReady() {
      const blocks = [...waiting].filter((block) => live.has(block));
      waiting.clear();
      void reanalyze(blocks).catch(warn);
    },
  });
  const { run } = lookup;
  const store = createStore<ArticleState>({
    settings,
    hover: null,
    panel: null,
    phrase: null,
  });
  const source = (): SourceInput => ({ ...surface.source(), lang });
  const recorder = createRecorder({
    send: deps.send,
    lang,
    source,
    settings: () => settings,
    spans,
  });
  const cards = createCards({
    store,
    lookup,
    lang,
    spans,
    blocks: () => pageText.blocks(),
    selecting: () => selection.selecting(),
    onPanelOpen: deps.onPanelOpen,
  });
  const selection = createSelection({
    send: deps.send,
    store,
    lookup,
    lang,
    source,
    index,
    spans,
    dismissHover: () => interactions.dismissHover(),
    async saved() {
      deps.onTermsChanged?.();
      await reanalyze();
    },
  });

  /**
   * The block gets highlights and counts for the end-of-article save, the history and
   * the encounters: always, or only in the title and body (`articleMainOnly`). Every
   * block still answers hovers and clicks.
   */
  const inScope = (block: TextBlock) =>
    !settings.articleMainOnly || main.contains(block);

  function setSpans(block: TextBlock, blockSpans: readonly Span[]) {
    spans.set(block, blockSpans);
    const on = inScope(block);
    highlighter.set(block, on ? blockSpans : []);
    if (on) shown.add(block);
    else shown.delete(block);
  }

  /** Highlights blocks that came into scope and drops those that left it. */
  function rescope() {
    const entered: TextBlock[] = [];
    for (const [block, list] of spans) {
      const on = inScope(block);
      if (on === shown.has(block)) continue;
      highlighter.set(block, on ? list : []);
      if (on) {
        shown.add(block);
        entered.push(block);
      } else shown.delete(block);
    }
    recorder.encounters(entered, savedKeys);
    recorder.history(entered);
  }

  /** Whether each block is in the learning language, once detected (`perBlockLanguage`). */
  const learning = new WeakMap<TextBlock, boolean>();

  /** The blocks to analyze: those not in another language, when the surface checks. */
  async function inLearningLanguage(batch: TextBlock[]) {
    if (!surface.perBlockLanguage) return batch;
    const keep = await Promise.all(
      batch.map(async (block) => {
        let ok = learning.get(block);
        if (ok === undefined) {
          ok = await deps
            .detectLanguage(block.text)
            .then((detected) => !inOtherLanguage(detected, lang))
            .catch(() => true);
          learning.set(block, ok);
        }
        return ok;
      }),
    );
    return batch.filter((_, i) => keep[i]);
  }

  /**
   * Classifies blocks and highlights them. While language data is missing (or once a
   * request finds it missing), the blocks wait for it instead. Blocks in another
   * language (`perBlockLanguage`) are left alone.
   */
  async function analyze(blocks: TextBlock[]) {
    const batch = await inLearningLanguage(blocks);
    if (batch.length === 0) return;
    const stamps = lookup.waiting
      ? []
      : batch.map((block) => {
          versions.set(block, ++version);
          return version;
        });
    const result = await lookup.analyze(batch.map((b) => b.text));
    if (!result) {
      for (const block of batch) waiting.add(block);
      return;
    }
    const fresh: TextBlock[] = [];
    batch.forEach((block, i) => {
      if (!live.has(block) || versions.get(block) !== stamps[i]) return;
      setSpans(block, result.spans[i] ?? []);
      fresh.push(block);
    });
    for (const key of result.saved) savedKeys.add(key);
    const counted = fresh.filter(inScope);
    recorder.encounters(counted, new Set(result.saved));
    recorder.history(counted);
  }

  /** Analyzes blocks again (all analyzed ones by default), in batches. */
  async function reanalyze(blocks: readonly TextBlock[] = [...spans.keys()]) {
    for (const batch of batches(blocks)) await analyze(batch);
  }

  /** Gives spans a new category where `change` returns one, and highlights them. */
  function recategorize(change: (span: Span) => Category | undefined) {
    for (const [block, list] of spans) {
      let changed = false;
      const next = list.map((span) => {
        const category = change(span);
        if (category === undefined || category === span.category) return span;
        changed = true;
        return { ...span, category };
      });
      if (!changed) continue;
      versions.set(block, ++version);
      setSpans(block, next);
    }
  }

  /** Distinct keys of unsaved new words on the analyzed part of the page, in page order. */
  function unsavedOnPage(): string[] {
    const keys = new Set<string>();
    for (const block of pageText.blocks().filter(inScope))
      for (const span of spans.get(block) ?? [])
        if (span.category === "new") keys.add(span.key);
    return [...keys];
  }

  const marks = createMarkAll({
    send: deps.send,
    lang: () => lang,
    source,
    unsaved: unsavedOnPage,
    async marked(keys, from, to) {
      recategorize((s) =>
        s.category === from && keys.has(s.key) ? to : undefined,
      );
      await cards.refreshOpen();
    },
  });

  const blocksWith = (term: Term) =>
    [...spans]
      .filter(([, list]) => list.some((s) => sameTerm(s, term)))
      .map(([block]) => block);

  /** True when `ref` is one of the page's spans (not a selection's phrase). */
  const onPage = ({ block, span }: SpanRef) =>
    spans.get(block)?.includes(span) ?? false;

  /** Saves, changes or removes the term `ref` points at. */
  async function changeStatus(ref: SpanRef, card: TermCard, to: WordStatus) {
    const sent = await sendStatus(deps.send, card, to, () => {
      const { block, span } = ref;
      const sentence = sentenceAt(block.text, span.start, span.end, lang);
      return {
        lang,
        key: card.key,
        display: writtenOf(ref),
        kind: card.kind,
        source: source(),
        sentence,
        pos: { textQuote: sentence },
      };
    });
    if (!sent) return;
    // Unsaved, each occurrence is new or known again by the page's level.
    if (to === "new") await reanalyze(blocksWith(card));
    // A selected phrase may be anywhere on the page: classify again to find it.
    else if (card.status === "new" && !onPage(ref)) await reanalyze();
    else recategorize((s) => (sameTerm(s, card) ? to : undefined));
    deps.onTermsChanged?.();
    await cards.refresh(card);
  }

  const app: ArticleApp = {
    store,
    setHoverStatus(status) {
      const ref = cards.hoverRef();
      const card = store.get().hover?.card;
      if (ref && card) run(() => changeStatus(ref, card, status));
    },
    keepHover: () => interactions.keepHover(),
    releaseHover: () => interactions.releaseHover(),
    openDetails() {
      const ref = cards.hoverRef();
      if (!ref) return;
      interactions.dismissHover();
      void cards.openPanel(ref).catch(warn);
    },
    setPanelStatus(status) {
      const ref = cards.panelRef();
      const card = store.get().panel?.card;
      if (ref && card) run(() => changeStatus(ref, card, status));
    },
    speak: () => lookup.speak(store.get().panel?.card.head),
    closePanel: cards.closePanel,
    goToSentence: cards.goToSentence,
    savePhrase(status) {
      const task = selection.saveTask(status);
      if (task) run(task);
    },
    openPhraseDetails() {
      const ref = selection.takeForDetails();
      if (ref) void cards.openPanel(ref).catch(warn);
    },
  };

  const unmountUi = await deps.mountUi(app);

  const visible = watchVisibleBlocks(analyze);
  const end = watchEndOfArticle(() => {
    if (settings.unsavedAtEnd !== "known") return;
    // The end can show before the visible blocks are queued: the last paragraph is
    // analyzed first, and blocks waiting for analysis are waited for.
    run(async () => {
      const last = main.last;
      if (last && live.has(last) && !spans.has(last)) await analyze([last]);
      await visible.idle();
      await marks.markKnown();
    });
  });

  const pageText = createPageText(root, {
    acceptText: surface.acceptText,
    onChange({ removed, added }) {
      for (const block of removed) {
        live.delete(block);
        waiting.delete(block);
        spans.delete(block);
        versions.delete(block);
        highlighter.remove(block);
        shown.delete(block);
      }
      index.remove(removed);
      visible.remove(removed);
      for (const block of added) live.add(block);
      index.add(added);
      visible.add(added);
      main = surface.mainContent(root, pageText.blocks());
      end.update(main.last);
      rescope();
    },
  });
  main = surface.mainContent(root, pageText.blocks());
  for (const block of pageText.blocks()) live.add(block);
  index.add(pageText.blocks());
  visible.add(pageText.blocks());
  end.update(main.last);

  const closePanel = () => {
    if (store.get().panel) cards.closePanel();
  };
  const interactions = watchInteractions({
    spanAt(x, y) {
      const ref = spanAtPoint(x, y, index, spans);
      return ref && ref.span.category !== "ignored" ? ref : undefined;
    },
    showHover: (ref) => void cards.showHover(ref).catch(warn),
    hideHover: cards.hideHover,
    click: (ref) => void cards.openPanel(ref).catch(warn),
    selection: selection.select,
    escape: closePanel,
    pressAway: closePanel,
    scroll() {
      cards.follow();
      selection.follow();
    },
  });

  const unwatch = deps.watchSettings((next) => {
    const levelChanged = next.knownLevel !== settings.knownLevel;
    const scopeChanged = next.articleMainOnly !== settings.articleMainOnly;
    settings = next;
    store.set({ settings });
    highlighter.setEnabled(next.highlight);
    if (scopeChanged) rescope();
    if (levelChanged) run(() => reanalyze());
  });

  return {
    spans,
    app,
    reanalyze: () =>
      new Promise<void>((done) => run(() => reanalyze().finally(done))),
    handlePageRequest: (request) =>
      lookup.answer(request, {
        saveAll: marks.saveAll,
        undoSaveAll: marks.undoSaveAll,
        summary: () => ({
          supported: true,
          hostname,
          scope: "page",
          unsaved: unsavedOnPage().length,
          done: marks.done(),
        }),
      }),
    stop() {
      unwatch();
      lookup.stop();
      interactions.stop();
      end.disconnect();
      pageText.disconnect();
      visible.disconnect();
      highlighter.destroy();
      spans.clear();
      shown.clear();
      live.clear();
      waiting.clear();
      unmountUi();
    },
  };
}
/** The article UI on a page, started and stopped as the site is switched on and off. */
export interface ArticleRunner {
  /** Answers the popup about this page (see `page-protocol.ts`). */
  handlePageRequest(request: PageRequest): Promise<PageSummary>;
  /** Closes the dictionary panel, if it is open. */
  closePanel(): void;
  /** Classifies the page again (after saved terms changed elsewhere on it). */
  reanalyze(): Promise<void>;
  /** Stops the article UI and stops following the settings. */
  stop(): void;
}

/**
 * Runs the article UI (`startArticle`) while the site is allowed: when the settings
 * switch the site off (popup "On this site", Settings → Sites) the UI goes away at
 * once; when they switch it back on, it starts again.
 */
export function runArticle(
  deps: ArticleDeps,
  options: ArticleOptions = {},
): ArticleRunner {
  const { hostname, surface } = pageOf(options);
  let session: ArticleSession | undefined;
  let allowed: boolean | undefined;
  let stopped = false;

  async function apply(settings: Settings) {
    if (stopped) return;
    const was = allowed;
    allowed = surface.allowed(settings);
    if (!allowed) {
      session?.stop();
      session = undefined;
    } else if (!was && !session) {
      session = await startArticle(deps, {
        ...options,
        surface,
        settings,
      }).catch((error: unknown) => {
        warn(error);
        return undefined;
      });
      if (stopped) session?.stop();
    }
  }

  // Changes are applied one after another, the first once the settings are known.
  let queue: Promise<void> = deps
    .send({ type: "getSettings" })
    .then(apply)
    .catch(warn);
  const unwatch = deps.watchSettings((next) => {
    queue = queue.then(() => apply(next)).catch(warn);
  });

  return {
    async handlePageRequest(request) {
      await queue;
      return session
        ? session.handlePageRequest(request)
        : unsupportedPage(hostname, "page");
    },
    closePanel() {
      if (session?.app.store.get().panel) session.app.closePanel();
    },
    async reanalyze() {
      await queue;
      await session?.reanalyze();
    },
    stop() {
      stopped = true;
      unwatch();
      session?.stop();
      session = undefined;
    },
  };
}
