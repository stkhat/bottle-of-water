import type { Span, WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import {
  unsupportedPage,
  type PageRequest,
  type PageSummary,
} from "../../messaging/page-protocol";
import type { SourceInput } from "../../messaging/protocol";
import { meaningRows, type TermCard } from "../lookup/describe";
import {
  createLookup,
  createMarkAll,
  sameTerm,
  type LookupDeps,
  type Term,
} from "../lookup/lookup";
import { newKeys } from "../lookup/spans";
import { sendStatus } from "../lookup/status";
import { warn } from "../lookup/warn";
import { createStore } from "../store";
import { createSummaries } from "../words/summaries";
import type { Occurrence } from "../words/words";
import { createAnalysis, type Analysis } from "./analysis";
import { createBlocks } from "./blocks";
import { createCards, sentenceOf, writtenOf } from "./cards";
import { watchEndOfArticle } from "./end-of-article";
import { watchInteractions, type Interactions } from "./interactions";
import { spanAtPoint, type SpanRef } from "./locate";
import type { MainContent } from "./main-content";
import { createPageCasing } from "./page-casing";
import {
  collectBlocks,
  createPageText,
  type PageText,
  type TextBlock,
} from "./page-text";
import { createRecorder } from "./recorder";
import { createSelection } from "./selection";
import type { DetectLanguage } from "./should-run";
import type { ArticleApp, ArticleState } from "./state";
import { articleSurface, type PageSurface } from "./surface";
import { watchVisibleBlocks, type VisibleBlocks } from "./visibility";
import { createWordsPanel, type ArticleWords } from "./words-panel";

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
 * A part made further down than a part that calls it. `startArticle` makes its parts
 * in the order their side effects must run (the UI is mounted before the page is
 * read, the page is read before the pointer is watched), so a few calls go back up:
 * each such part is set right after it is made, and a call before that throws (none
 * comes that early).
 */
function late<T>(name: string) {
  let part: T | undefined;
  return {
    set(value: T) {
      part = value;
      return value;
    },
    get(): T {
      if (part === undefined) throw new ReferenceError(`${name} not made yet`);
      return part;
    },
  };
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
  /** The part that counts (the article's title and body), found again after page changes. */
  let main: MainContent = surface.mainContent(root, []);
  /**
   * The block gets highlights and counts for the end-of-article save, the history and
   * the encounters: always, or only in the title and body (`articleMainOnly`). Every
   * block still answers hovers and clicks.
   */
  const inScope = (block: TextBlock) =>
    !settings.articleMainOnly || main.contains(block);

  // Parts called by parts made before them. The blocks tell the Words list of changes,
  // and the Words list reads the blocks; the lookup starts the analysis once language
  // data is ready, and the analysis asks the lookup. The page is read, and the visible
  // blocks and the pointer watched, only once the UI is mounted, but the UI's parts
  // (cards, selection, Words list) are made before it.
  const later = {
    words: late<ArticleWords>("words"),
    analysis: late<Analysis>("analysis"),
    visible: late<VisibleBlocks>("visible"),
    pageText: late<PageText>("pageText"),
    interactions: late<Interactions>("interactions"),
  };
  const pageBlocks = () => later.pageText.get().blocks();

  const blocks = createBlocks({
    highlight: settings.highlight,
    inScope,
    changed: () => later.words.get().changed(),
  });
  const { spans } = blocks;
  /** Saved terms the analyses found on the page. */
  const savedKeys = new Set<string>();
  const lookup = createLookup(deps, {
    settings: () => settings,
    lang: () => lang,
    url: () => surface.url(),
    packsReady() {
      const waited = blocks.takeWaiting();
      void later.analysis.get().reanalyze(waited).catch(warn);
    },
  });
  const { run } = lookup;
  const store = createStore<ArticleState>({
    settings,
    hover: null,
    panel: null,
    phrase: null,
    words: null,
    summaries: {},
    flash: null,
  });
  /** Stops the Words list's requests and translations with the page. */
  const controller = new AbortController();
  const summaries = createSummaries({
    send: deps.send,
    store,
    translator: lookup.translator,
    lang: () => lang,
    nativeLang: () => settings.nativeLang,
    active: () => !controller.signal.aborted,
    waitFor: lookup.waitFor,
    signal: controller.signal,
  });
  const source = (): SourceInput => ({ ...surface.source(), lang });
  const recorder = createRecorder({
    send: deps.send,
    lang,
    source,
    settings: () => settings,
    spans,
    casing: () => lookup.casing,
  });
  const casing = createPageCasing({ lang, lookup });
  const words = later.words.set(
    createWordsPanel({
      store,
      summaries,
      blocks,
      savedKeys,
      inScope,
      pageBlocks,
      visible: () => later.visible.get(),
    }),
  );

  /** Records analyzed blocks in scope for the history and the encounters, once read. */
  function record(list: readonly TextBlock[], saved: ReadonlySet<string>) {
    const read = list.filter((block) => !words.isUnread(block));
    recorder.encounters(read, saved);
    recorder.history(read);
  }

  const analysis = later.analysis.set(
    createAnalysis({
      lookup,
      blocks,
      surface,
      detectLanguage: deps.detectLanguage,
      lang,
      analyzed(fresh, saved) {
        for (const key of saved) savedKeys.add(key);
        const counted = fresh.filter(inScope);
        record(counted, new Set(saved));
        if (store.get().words) words.classified(counted);
      },
    }),
  );
  const { analyze, reanalyze } = analysis;

  /**
   * Takes the casing of the page's main content as it is now, and classifies again the
   * analyzed blocks with a word whose verdict changed.
   */
  function updateCasing(pageNow: readonly TextBlock[]) {
    const affected = casing.update(
      pageNow.filter((block) => main.contains(block)),
    );
    if (!affected) return;
    const stale = [...spans.keys()].filter(
      (block) => blocks.isLive(block) && affected(block),
    );
    if (stale.length > 0) run(() => reanalyze(stale));
  }

  /** Highlights blocks that came into scope and drops those that left it. */
  function rescope() {
    record(blocks.rescope(), savedKeys);
    words.changed();
    words.analyzeEarly();
  }

  const selection = createSelection({
    send: deps.send,
    store,
    lookup,
    lang,
    source,
    index: blocks.index,
    spans,
    dismissHover: () => later.interactions.get().dismissHover(),
    async saved() {
      deps.onTermsChanged?.();
      await reanalyze();
    },
  });
  const cards = createCards({
    store,
    lookup,
    lang,
    spans,
    blocks: pageBlocks,
    selecting: () => selection.selecting(),
    onPanelOpen: deps.onPanelOpen,
  });

  /** Distinct keys of unsaved new words on the analyzed part of the page, in page order. */
  const unsavedOnPage = () =>
    newKeys(
      pageBlocks()
        .filter(inScope)
        .map((block) => spans.get(block)),
    );

  const marks = createMarkAll({
    send: deps.send,
    lang: () => lang,
    source,
    unsaved: unsavedOnPage,
    async marked(keys, from, to) {
      noteStatus(keys, to);
      blocks.recategorize((s) =>
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

  /** Keeps the Words list's statuses and the page's saved terms with a status change. */
  function noteStatus(keys: Iterable<string>, to: WordStatus) {
    const changes: [string, WordStatus][] = [];
    for (const key of keys) {
      if (to === "new") savedKeys.delete(key);
      else savedKeys.add(key);
      changes.push([key, to]);
    }
    summaries.note(changes);
  }

  /** What saving the term `ref` points at sends besides its status. */
  function termInput(ref: SpanRef, card: TermCard) {
    const sentence = sentenceOf(ref, lang);
    return {
      lang,
      key: card.key,
      display: writtenOf(ref),
      kind: card.kind,
      source: source(),
      sentence,
      pos: { textQuote: sentence },
    };
  }

  /** Saves, changes or removes the term `ref` points at. */
  async function changeStatus(ref: SpanRef, card: TermCard, to: WordStatus) {
    const sent = await sendStatus(deps.send, card, to, () =>
      termInput(ref, card),
    );
    if (sent) await statusChanged(ref, card, to);
  }

  /**
   * Chooses the meaning of the window's row `index` for the sentence `ref` is in, or
   * undoes it when it is the one chosen there. An unsaved term is saved as Learning.
   */
  async function chooseMeaning(ref: SpanRef, card: TermCard, index: number) {
    const row = meaningRows(card)[index];
    if (!row) return;
    await deps.send({
      type: "chooseMeaning",
      term: termInput(ref, card),
      meaning: row.sense.usedHere ? null : row.meaning,
    });
    if (card.status === "new" && !row.sense.usedHere)
      await statusChanged(ref, card, "learning");
    else await cards.refresh(card);
  }

  /** The term `ref` points at went from `card.status` to `to`: the page follows. */
  async function statusChanged(ref: SpanRef, card: TermCard, to: WordStatus) {
    noteStatus([card.key], to);
    // Unsaved, each occurrence is new or known again by the page's level.
    if (to === "new") await reanalyze(blocksWith(card));
    // A selected phrase may be anywhere on the page: classify again to find it.
    else if (card.status === "new" && !onPage(ref)) await reanalyze();
    else blocks.recategorize((s) => (sameTerm(s, card) ? to : undefined));
    deps.onTermsChanged?.();
    await cards.refresh(card);
  }

  /**
   * The page word a Words row's place stands for; undefined once its block is gone or
   * analyzed again (the list then shows new rows).
   */
  function listedRef(at: Occurrence<TextBlock>): SpanRef | undefined {
    if (!blocks.isLive(at.unit)) return undefined;
    const span = spans.get(at.unit)?.[at.span];
    if (!span || (span.part ?? span).start !== at.start) return undefined;
    return { block: at.unit, span };
  }

  const app: ArticleApp = {
    store,
    setHoverStatus(status) {
      const ref = cards.hoverRef();
      const card = store.get().hover?.card;
      if (ref && card) run(() => changeStatus(ref, card, status));
    },
    keepHover: () => later.interactions.get().keepHover(),
    releaseHover: () => later.interactions.get().releaseHover(),
    openDetails() {
      const ref = cards.hoverRef();
      if (!ref) return;
      later.interactions.get().dismissHover();
      void cards.openPanel(ref).catch(warn);
    },
    setPanelStatus(status) {
      const ref = cards.panelRef();
      const card = store.get().panel?.card;
      if (ref && card) run(() => changeStatus(ref, card, status));
    },
    useMeaning(index) {
      const ref = cards.panelRef();
      const card = store.get().panel?.card;
      if (ref && card) run(() => chooseMeaning(ref, card, index));
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
    showWords: words.show,
    closeWords: words.close,
    setWordsFilter: (filter) => words.setWords({ filter }),
    setWordsSort: (sort) => words.setWords({ sort }),
    jumpToWord: words.jump,
    enterListWord(at, anchor) {
      const ref = listedRef(at);
      if (ref) later.interactions.get().enterListed(ref, anchor);
    },
    leaveListWord: () => later.interactions.get().leaveListed(),
    openListWord(at) {
      const ref = listedRef(at);
      if (!ref) return;
      later.interactions.get().dismissHover();
      // The word on the page was not clicked: it is not outlined.
      void cards.openPanel(ref, false).catch(warn);
    },
    dismissHover: () => later.interactions.get().dismissHover(),
    wordsShown: (rows) => summaries.shown(rows),
  };

  const unmountUi = await deps.mountUi(app);

  const visible = later.visible.set(
    watchVisibleBlocks(analyze, {
      reached(list) {
        words.reached(list);
        // Not analyzed yet: `analyze` records them.
        record(
          list.filter((block) => blocks.shown.has(block)),
          savedKeys,
        );
      },
    }),
  );
  const end = watchEndOfArticle(() => {
    if (settings.unsavedAtEnd !== "known") return;
    // The end can show before the visible blocks are queued: the last paragraph is
    // analyzed first, and blocks waiting for analysis are waited for.
    run(async () => {
      const last = main.last;
      if (last && blocks.isLive(last) && !spans.has(last))
        await analyze([last]);
      await visible.idle();
      await marks.markKnown();
    });
  });

  const pageText = later.pageText.set(
    createPageText(root, {
      acceptText: surface.acceptText,
      onChange({ removed, added }) {
        blocks.remove(removed);
        visible.remove(removed);
        blocks.add(added);
        visible.add(added);
        main = surface.mainContent(root, pageText.blocks());
        end.update(main.last);
        rescope();
        updateCasing(pageText.blocks());
        if (removed.length > 0) words.changed();
      },
    }),
  );
  main = surface.mainContent(root, pageText.blocks());
  updateCasing(pageText.blocks());
  blocks.add(pageText.blocks());
  visible.add(pageText.blocks());
  end.update(main.last);

  const closePanel = () => {
    if (store.get().panel) cards.closePanel();
  };
  const interactions = later.interactions.set(
    watchInteractions({
      spanAt(x, y) {
        const ref = spanAtPoint(x, y, blocks.index, spans);
        return ref && ref.span.category !== "ignored" ? ref : undefined;
      },
      showHover: (ref, anchor) => void cards.showHover(ref, anchor).catch(warn),
      hideHover: cards.hideHover,
      click: (ref) => void cards.openPanel(ref).catch(warn),
      selection: selection.select,
      escape: closePanel,
      pressAway: closePanel,
      selecting: selection.selecting,
      scroll() {
        cards.follow();
        selection.follow();
        words.follow();
      },
    }),
  );

  const unwatch = deps.watchSettings((next) => {
    const levelChanged = next.knownLevel !== settings.knownLevel;
    const scopeChanged = next.articleMainOnly !== settings.articleMainOnly;
    settings = next;
    store.set({ settings });
    blocks.setHighlight(next.highlight);
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
        showWords: app.showWords,
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
      controller.abort();
      words.stop();
      lookup.stop();
      interactions.stop();
      end.disconnect();
      pageText.disconnect();
      visible.disconnect();
      blocks.destroy();
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
