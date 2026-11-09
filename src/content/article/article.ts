import type { SourceInput } from "../../background/term-store";
import type { Category, Span, TermKind, TermStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import type { send } from "../../messaging/client";
import {
  dictionaryLinks,
  type DictionaryLink,
} from "../../ui/lookup/externalDictionaries";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import { createStore, type Store } from "../ui/store";
import { describeTerm, type TermCard } from "./describe";
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
import { collapseSpaces, sentenceAt } from "./sentence";
import { shouldRunArticle, type DetectLanguage } from "./should-run";
import { createBuiltInTranslator, type TranslationProvider } from "./translate";
import { batches, watchVisibleBlocks } from "./visibility";

/** The longest text sample the page language is detected on. */
const DETECT_SAMPLE = 2000;

/** Voices for speaking a learning language; others use the language code itself. */
const SPEECH_LANG: Readonly<Record<string, string>> = { en: "en-US" };

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
    batch.forEach((block, i) => {
      if (!live.has(block) || versions.get(block) !== stamps[i]) return;
      setSpans(block, result.spans[i] ?? []);
    });
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
      { key: ref.span.key, kind: ref.span.kind, surface: surfaceOf(ref) },
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
    if (phrase === snapped) {
      phrase = undefined;
      getSelection()?.removeAllRanges();
      store.set({ phrase: null });
    }
    // The phrase may be anywhere on the page: classify again to find it.
    await reanalyze();
  }

  function speak() {
    const head = store.get().panel?.card.head;
    if (!head || typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(head);
    utterance.lang = SPEECH_LANG[lang] ?? lang;
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
    },
  });
  for (const block of pageText.blocks()) live.add(block);
  index.add(pageText.blocks());
  visible.add(pageText.blocks());

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
    settings = next;
    store.set({ settings });
    highlighter.setEnabled(next.highlight);
  });

  return {
    pageText,
    highlighter,
    spans,
    app,
    settings: () => settings,
    stop() {
      unwatch();
      interactions.stop();
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
