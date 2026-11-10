import type { SourceInput } from "../../background/term-store";
import type { Category, Span, TermKind, TermStatus } from "../../core/classify";
import { speechLang } from "../../core/languages";
import type { Settings } from "../../core/settings";
import { termId } from "../../core/term-id";
import type { send } from "../../messaging/client";
import {
  unsupportedPage,
  type PageRequest,
  type PageSummary,
} from "../../messaging/page-protocol";
import {
  dictionaryLinks,
  type DictionaryLink,
} from "../../ui/lookup/externalDictionaries";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import { createStore, type Store } from "../ui/store";
import { describeTerm, type TermCard } from "./describe";
import { watchEndOfArticle } from "./end-of-article";
import { wordBoxes, type Box } from "./geometry";
import {
  createHighlighter,
  type HighlightCategory,
  type Highlighter,
} from "./highlighter";
import { watchInteractions } from "./interactions";
import {
  createBlockIndex,
  snapSelection,
  spanAtPoint,
  type Snapped,
  type SpanMap,
  type SpanRef,
} from "./locate";
import {
  collectBlocks,
  createPageText,
  rangeOf,
  type PageText,
  type TextBlock,
} from "./page-text";
import { collapseSpaces, splitSentences } from "../../core/text/sentences";
import { sentenceAt } from "./sentence";
import {
  articlesAllowedOn,
  shouldRunArticle,
  type DetectLanguage,
} from "./should-run";
import { createBuiltInTranslator, type TranslationProvider } from "./translate";
import { batches, watchVisibleBlocks } from "./visibility";

/** The longest text sample the page language is detected on. */
const DETECT_SAMPLE = 2000;

/** What the article UI needs from the extension, passed in so it runs in tests. */
export interface ArticleDeps {
  /** `send()` from the messaging client. */
  send: typeof send;
  /** Calls `listener` with the new settings after every change; returns an unsubscribe. */
  watchSettings(listener: (settings: Settings) => void): () => void;
  detectLanguage: DetectLanguage;
  /** Mounts Lingo's UI for the page once it qualifies; returns an unmount. */
  mountUi(app: ArticleApp): (() => void) | Promise<() => void>;
  /** Default: the browser's built-in translator. */
  createTranslator?(from: string, to: string): TranslationProvider;
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
}

/** The hover card over a word: where the word is and what it says. */
export interface HoverState {
  anchor: Box;
  card: TermCard;
}

/** The dictionary panel for the clicked word. */
export interface PanelState {
  card: TermCard;
  /** Sentences on this page with the term, in page order. */
  here: string[];
  dictionaries: DictionaryLink[];
  /** The clicked word's boxes, outlined. */
  outline: Box[];
}

/** The bar over a selection of words that saves them as a phrase. */
export interface PhraseState {
  anchor: Box;
  /** The selected words as written. */
  text: string;
}

/** What the UI shows. */
export interface ArticleState {
  settings: Settings;
  hover: HoverState | null;
  panel: PanelState | null;
  phrase: PhraseState | null;
  /** Distinct unsaved new words among the analyzed blocks. */
  unsaved: number;
  /** The last save-all, until it is undone. */
  done: PageSummary["done"];
  /** The end card shows in place of the page card. */
  endCard: boolean;
}

/** The UI's view of the page: its state and what its controls do. */
export interface ArticleApp {
  readonly store: Store<ArticleState>;
  /** The hover card's "+ Learning" / "Known". */
  setHoverStatus(status: TermStatus): void;
  /** The pointer entered the hover card: keep it. */
  keepHover(): void;
  /** The pointer left the hover card: hide it soon. */
  releaseHover(): void;
  /** The panel's Learning / Known / Remove. */
  setPanelStatus(status: WordStatus): void;
  speak(): void;
  closePanel(): void;
  /** Scrolls to the panel's "On this page" sentence. */
  goToSentence(index: number): void;
  /** The phrase bar's "+ Learning" / "Known". */
  savePhrase(status: TermStatus): void;
  /** Saves every unsaved new word of the page. */
  saveAll(status: TermStatus): void;
  undoSaveAll(): void;
  /** Closes the end card for this page view; the page card comes back. */
  closeEndCard(): void;
  toggleHighlight(category: HighlightCategory): void;
}

export interface ArticleSession {
  readonly pageText: PageText;
  readonly highlighter: Highlighter;
  /** The spans of every analyzed block that is still on the page. */
  readonly spans: ReadonlyMap<TextBlock, readonly Span[]>;
  readonly app: ArticleApp;
  /** The latest settings. */
  settings(): Settings;
  /** Answers the popup about this page (see `page-protocol.ts`). */
  handlePageRequest(request: PageRequest): Promise<PageSummary>;
  /** Removes highlights, the UI and every observer and listener. */
  stop(): void;
}

const surfaceOf = ({ block, span }: SpanRef) =>
  collapseSpaces(block.text.slice(span.start, span.end));

const sameTerm = (span: Span, key: string, kind: TermKind) =>
  span.key === key && span.kind === kind;

/**
 * Runs the article UI on the page when it qualifies (`shouldRunArticle`): mounts the
 * UI, analyzes blocks as they come near the viewport, highlights their spans, follows
 * page changes and the settings, and answers hovers, clicks and the UI's controls.
 * Resolves undefined when it does not run.
 */
export async function startArticle(
  deps: ArticleDeps,
  options: ArticleOptions = {},
): Promise<ArticleSession | undefined> {
  const root = options.root ?? document.body;
  const hostname = options.hostname ?? location.hostname;
  let settings = options.settings ?? (await deps.send({ type: "getSettings" }));

  const runs = await shouldRunArticle({
    hostname,
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

  const lang = settings.learningLang;
  const translator = (deps.createTranslator ?? createBuiltInTranslator)(
    lang,
    settings.nativeLang,
  );
  const highlighter = createHighlighter(settings.highlight);
  const spans: SpanMap = new Map();
  const live = new Set<TextBlock>();
  const index = createBlockIndex();
  /** The latest analysis or local change of each block; older results are dropped. */
  const versions = new Map<TextBlock, number>();
  let version = 0;
  let warmed = false;

  const store = createStore<ArticleState>({
    settings,
    hover: null,
    panel: null,
    phrase: null,
    unsaved: 0,
    done: null,
    endCard: false,
  });

  const source = (): SourceInput => ({
    platform: "web",
    url: location.href,
    title: document.title,
    lang,
  });

  function setSpans(block: TextBlock, blockSpans: readonly Span[]) {
    spans.set(block, blockSpans);
    highlighter.set(block, blockSpans);
  }

  async function analyze(batch: TextBlock[]) {
    const stamps = batch.map((block) => {
      versions.set(block, ++version);
      return version;
    });
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
    const fresh: TextBlock[] = [];
    batch.forEach((block, i) => {
      if (!live.has(block) || versions.get(block) !== stamps[i]) return;
      setSpans(block, result.spans[i] ?? []);
      fresh.push(block);
    });
    updateCounts();
    recordEncounters(fresh, new Set(result.saved));
    recordHistory(fresh);
  }

  /** Sentences already sent to the sentence history in this page view. */
  const kept = new Set<string>();

  /** Sends the background the blocks' sentences not sent yet, for the sentence history. */
  function recordHistory(blocks: TextBlock[]) {
    if (!settings.sentenceHistory) return;
    const sentences = [];
    for (const block of blocks) {
      for (const text of splitSentences(block.text, lang)) {
        if (kept.has(text)) continue;
        kept.add(text);
        sentences.push({ text, pos: { textQuote: text } });
      }
    }
    if (sentences.length > 0)
      deps
        .send({ type: "recordHistory", source: source(), sentences })
        .catch(warn);
  }

  /** Sentences already recorded for a saved term in this page view ("key\nsentence"). */
  const recorded = new Set<string>();

  /** Tells the background which saved terms the page has, with their sentences. */
  function recordEncounters(blocks: TextBlock[], saved: ReadonlySet<string>) {
    const items = [];
    for (const block of blocks) {
      for (const span of spans.get(block) ?? []) {
        if (!saved.has(span.key)) continue;
        const sentence = sentenceAt(block.text, span.start, span.end, lang);
        const seen = `${span.key}\n${sentence}`;
        if (recorded.has(seen)) continue;
        recorded.add(seen);
        items.push({
          termId: termId(lang, span.key),
          sentence,
          pos: { textQuote: sentence },
        });
      }
    }
    if (items.length > 0)
      deps
        .send({ type: "recordEncounters", source: source(), items })
        .catch(warn);
  }

  /** Distinct keys of unsaved new words on the analyzed part of the page, in page order. */
  function unsavedOnPage(): string[] {
    const keys = new Set<string>();
    for (const block of pageText.blocks())
      for (const span of spans.get(block) ?? [])
        if (span.category === "new") keys.add(span.key);
    return [...keys];
  }

  // End card: replaces the page card once the end of the article is in view.
  let endReached = false;
  let endClosed = false;

  function updateCounts() {
    const unsaved = unsavedOnPage().length;
    const showEnd =
      store.get().endCard ||
      (endReached && !endClosed && settings.offerSaveAllAtEnd && unsaved > 0);
    if (unsaved !== store.get().unsaved || showEnd !== store.get().endCard)
      store.set({ unsaved, endCard: showEnd });
  }

  let lastBatch:
    | { batchId: string; keys: ReadonlySet<string>; status: TermStatus }
    | undefined;

  async function saveAll(status: TermStatus) {
    const keys = unsavedOnPage();
    if (keys.length === 0) return;
    const { batchId, count } = await deps.send({
      type: "saveAll",
      lang,
      keys,
      status,
      source: source(),
    });
    const saved = new Set(keys);
    lastBatch = { batchId, keys: saved, status };
    recategorize((s) =>
      s.category === "new" && saved.has(s.key) ? status : undefined,
    );
    store.set({ done: { count, target: status } });
    await refreshOpenCards();
  }

  async function undoSaveAll() {
    const batch = lastBatch;
    if (!batch) return;
    await deps.send({ type: "undoSaveAll", batchId: batch.batchId });
    lastBatch = undefined;
    // Those words were new before; the ones changed since stay as they are.
    recategorize((s) =>
      s.category === batch.status && batch.keys.has(s.key) ? "new" : undefined,
    );
    store.set({ done: null });
    await refreshOpenCards();
  }

  const summary = (): PageSummary => ({
    supported: true,
    hostname,
    scope: "page",
    unsaved: store.get().unsaved,
    done: store.get().done,
  });

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
    updateCounts();
  }

  const blocksWith = (key: string, kind: TermKind) =>
    [...spans]
      .filter(([, list]) => list.some((s) => sameTerm(s, key, kind)))
      .map(([block]) => block);

  // One change to saved terms at a time, in the order asked.
  let queue: Promise<unknown> = Promise.resolve();
  function run(task: () => Promise<unknown>) {
    queue = queue
      .then(task)
      .catch((error: unknown) => console.warn("Lingo:", error));
  }

  const describe = (ref: SpanRef) =>
    describeTerm(
      {
        key: ref.span.key,
        kind: ref.span.kind,
        surface: surfaceOf(ref),
        category: ref.span.category,
      },
      { send: deps.send, lang, sourceUrl: location.href, translator },
    );

  /** Saves, changes or removes the term `ref` points at. */
  async function changeStatus(ref: SpanRef, card: TermCard, to: WordStatus) {
    const { key, kind } = card;
    if (card.status === to) return;
    if (to === "new") {
      await deps.send({ type: "removeTerm", id: card.termId });
      // Unsaved, each occurrence is new or known again by the page's level.
      await reanalyze(blocksWith(key, kind));
    } else {
      if (card.status === "new") {
        const { block, span } = ref;
        const sentence = sentenceAt(block.text, span.start, span.end, lang);
        await deps.send({
          type: "saveTerm",
          lang,
          key,
          display: surfaceOf(ref),
          kind,
          status: to,
          source: source(),
          sentence,
          pos: { textQuote: sentence },
        });
      } else {
        await deps.send({ type: "setStatus", id: card.termId, status: to });
      }
      recategorize((s) => (sameTerm(s, key, kind) ? to : undefined));
    }
    await refreshCards(key, kind);
  }

  // Hover card.
  let hoverRef: SpanRef | undefined;
  let hoverTicket = 0;

  async function showHover(ref: SpanRef) {
    const ticket = ++hoverTicket;
    const card = await describe(ref);
    if (ticket !== hoverTicket) return;
    const [anchor] = wordBoxes(
      rangeOf(ref.block, ref.span.start, ref.span.end),
    );
    if (!anchor) return;
    hoverRef = ref;
    store.set({ hover: { anchor, card } });
  }

  function hideHover() {
    hoverTicket++;
    hoverRef = undefined;
    if (store.get().hover) store.set({ hover: null });
  }

  // Dictionary panel.
  let panelRef: SpanRef | undefined;
  let panelTicket = 0;
  /** The span of each "On this page" sentence, for scrolling to it. */
  let panelRanges: Range[] = [];

  function sentencesOnPage(key: string, kind: TermKind) {
    const here: string[] = [];
    const ranges: Range[] = [];
    for (const block of pageText.blocks()) {
      for (const span of spans.get(block) ?? []) {
        if (!sameTerm(span, key, kind)) continue;
        const sentence = sentenceAt(block.text, span.start, span.end, lang);
        if (here.includes(sentence)) continue;
        here.push(sentence);
        ranges.push(rangeOf(block, span.start, span.end));
      }
    }
    return { here, ranges };
  }

  const outlineOf = (ref: SpanRef) =>
    wordBoxes(rangeOf(ref.block, ref.span.start, ref.span.end));

  function panelState(ref: SpanRef, card: TermCard): PanelState {
    const { here, ranges } = sentencesOnPage(card.key, card.kind);
    panelRanges = ranges;
    return {
      card,
      here,
      dictionaries: dictionaryLinks(card.head, settings.dictionaries, {
        from: lang,
        to: settings.nativeLang,
      }),
      outline: outlineOf(ref),
    };
  }

  async function openPanel(ref: SpanRef) {
    const ticket = ++panelTicket;
    const card = await describe(ref);
    if (ticket !== panelTicket) return;
    panelRef = ref;
    store.set({ panel: panelState(ref, card) });
  }

  function closePanel() {
    panelTicket++;
    panelRef = undefined;
    panelRanges = [];
    store.set({ panel: null });
  }

  /** Looks the term up again where the hover card or the panel shows it. */
  async function refreshCards(key: string, kind: TermKind) {
    const { hover, panel } = store.get();
    if (hover && hoverRef && sameTerm(hoverRef.span, key, kind)) {
      const ref = hoverRef;
      const card = await describe(ref);
      if (hoverRef === ref)
        store.set({ hover: { ...store.get().hover!, card } });
    }
    if (panel && panelRef && sameTerm(panelRef.span, key, kind)) {
      const ref = panelRef;
      const ticket = panelTicket;
      const card = await describe(ref);
      if (panelTicket === ticket) store.set({ panel: panelState(ref, card) });
    }
  }

  // Phrase bar.
  let phrase: Snapped | undefined;

  const snappedRange = (s: Snapped) => rangeOf(s.block, s.start, s.end);
  /** The same words: the selection is read again after it is snapped. */
  const sameSnap = (a: Snapped | undefined, b: Snapped) =>
    a !== undefined &&
    a.block === b.block &&
    a.start === b.start &&
    a.end === b.end;

  function onSelection(range: Range | undefined) {
    const snapped = range && snapSelection(range, index, spans);
    phrase = snapped;
    if (!snapped) {
      if (store.get().phrase) store.set({ phrase: null });
      return;
    }
    const whole = snappedRange(snapped);
    if (
      range.compareBoundaryPoints(Range.START_TO_START, whole) !== 0 ||
      range.compareBoundaryPoints(Range.END_TO_END, whole) !== 0
    ) {
      // Show what will be saved: the whole words.
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(whole);
    }
    const [anchor] = wordBoxes(whole);
    if (!anchor) return;
    store.set({
      phrase: {
        anchor,
        text: collapseSpaces(
          snapped.block.text.slice(snapped.start, snapped.end),
        ),
      },
    });
  }

  async function savePhrase(snapped: Snapped, status: TermStatus) {
    const { block, start, end } = snapped;
    const sentence = sentenceAt(block.text, start, end, lang);
    await deps.send({
      type: "saveTerm",
      lang,
      key: snapped.spans.map((s) => s.key).join(" "),
      display: collapseSpaces(block.text.slice(start, end)),
      kind: "phrase",
      status,
      source: source(),
      sentence,
      pos: { textQuote: sentence },
    });
    if (sameSnap(phrase, snapped)) {
      phrase = undefined;
      getSelection()?.removeAllRanges();
      store.set({ phrase: null });
    }
    // The phrase may be anywhere on the page: classify again to find it.
    await reanalyze();
  }

  /** Looks up again whatever the hover card and the panel show. */
  async function refreshOpenCards() {
    const refs = [hoverRef, panelRef].filter((r) => r !== undefined);
    for (const { span } of refs) await refreshCards(span.key, span.kind);
  }

  function speak() {
    const head = store.get().panel?.card.head;
    if (!head || typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(head);
    utterance.lang = speechLang(lang);
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  function onScroll() {
    const { panel, phrase: bar } = store.get();
    if (panel && panelRef)
      store.set({ panel: { ...panel, outline: outlineOf(panelRef) } });
    const anchor = phrase && wordBoxes(snappedRange(phrase))[0];
    if (bar && anchor) store.set({ phrase: { ...bar, anchor } });
  }

  const app: ArticleApp = {
    store,
    setHoverStatus(status) {
      const ref = hoverRef;
      const card = store.get().hover?.card;
      if (ref && card) run(() => changeStatus(ref, card, status));
    },
    keepHover: () => interactions.keepHover(),
    releaseHover: () => interactions.releaseHover(),
    setPanelStatus(status) {
      const ref = panelRef;
      const card = store.get().panel?.card;
      if (ref && card) run(() => changeStatus(ref, card, status));
    },
    speak,
    closePanel,
    goToSentence(i) {
      panelRanges[i]?.startContainer.parentElement?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    },
    savePhrase(status) {
      const snapped = phrase;
      if (snapped) run(() => savePhrase(snapped, status));
    },
    saveAll: (status) => run(() => saveAll(status)),
    undoSaveAll: () => run(undoSaveAll),
    closeEndCard() {
      endClosed = true;
      store.set({ endCard: false });
    },
    toggleHighlight(category) {
      const on = !settings.highlight[category];
      settings = {
        ...settings,
        highlight: { ...settings.highlight, [category]: on },
      };
      store.set({ settings });
      highlighter.setEnabled(settings.highlight);
      run(() =>
        deps.send({
          type: "setSettings",
          patch: { highlight: { [category]: on } },
        }),
      );
    },
  };

  const unmountUi = await deps.mountUi(app);

  const visible = watchVisibleBlocks(analyze);
  const end = watchEndOfArticle(root, () => {
    endReached = true;
    updateCounts();
  });

  const pageText = createPageText(root, {
    onChange({ removed, added }) {
      for (const block of removed) {
        live.delete(block);
        spans.delete(block);
        versions.delete(block);
        highlighter.remove(block);
      }
      index.remove(removed);
      visible.remove(removed);
      for (const block of added) live.add(block);
      index.add(added);
      visible.add(added);
      end.update(pageText.blocks());
      updateCounts();
    },
  });
  for (const block of pageText.blocks()) live.add(block);
  index.add(pageText.blocks());
  visible.add(pageText.blocks());
  end.update(pageText.blocks());

  const interactions = watchInteractions({
    spanAt(x, y) {
      const ref = spanAtPoint(x, y, index, spans);
      return ref && ref.span.category !== "ignored" ? ref : undefined;
    },
    showHover: (ref) => void showHover(ref).catch(warn),
    hideHover,
    click: (ref) => void openPanel(ref).catch(warn),
    selection: onSelection,
    escape() {
      if (store.get().panel) closePanel();
    },
    scroll: onScroll,
  });

  const unwatch = deps.watchSettings((next) => {
    const levelChanged = next.knownLevel !== settings.knownLevel;
    settings = next;
    store.set({ settings });
    highlighter.setEnabled(next.highlight);
    updateCounts();
    if (levelChanged) run(() => reanalyze());
  });

  function handlePageRequest(request: PageRequest): Promise<PageSummary> {
    if (request.type === "pageSaveAll") run(() => saveAll(request.status));
    else if (request.type === "pageUndo") run(undoSaveAll);
    // Answer after everything asked before has been done.
    return queue.then(summary);
  }

  return {
    pageText,
    highlighter,
    spans,
    app,
    settings: () => settings,
    handlePageRequest,
    stop() {
      unwatch();
      interactions.stop();
      end.disconnect();
      pageText.disconnect();
      visible.disconnect();
      highlighter.destroy();
      spans.clear();
      live.clear();
      unmountUi();
    },
  };
}

function warn(error: unknown) {
  console.warn("Lingo:", error);
}

/** The article UI on a page, started and stopped as the site is switched on and off. */
export interface ArticleRunner {
  /** Answers the popup about this page (see `page-protocol.ts`). */
  handlePageRequest(request: PageRequest): Promise<PageSummary>;
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
  const hostname = options.hostname ?? location.hostname;
  let session: ArticleSession | undefined;
  let allowed: boolean | undefined;
  let stopped = false;

  async function apply(settings: Settings) {
    if (stopped) return;
    const was = allowed;
    allowed = articlesAllowedOn(hostname, settings);
    if (!allowed) {
      session?.stop();
      session = undefined;
    } else if (!was && !session) {
      session = await startArticle(deps, { ...options, settings }).catch(
        (error: unknown) => {
          warn(error);
          return undefined;
        },
      );
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
    stop() {
      stopped = true;
      unwatch();
      session?.stop();
      session = undefined;
    },
  };
}
