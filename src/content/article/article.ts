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
import { createHighlighter, type Highlighter } from "./highlighter";
import { watchInteractions } from "./interactions";
import {
  createBlockIndex,
  selectionKey,
  snapSelection,
  spanAtPoint,
  type Snapped,
  type SpanMap,
  type SpanRef,
} from "./locate";
import { findMainContent, type MainContent } from "./main-content";
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
  /**
   * The dictionary pattern the words stand for ("make up one's mind" for "made up her
   * mind"), once the background has answered; missing when no pattern matches.
   */
  key?: string;
}

/**
 * The pattern selected words stand for, and where its words are in the block: from
 * its first word to its last, gap included. The sentence may complete the selection
 * ("made up" → "made up her mind").
 */
interface PatternMatch {
  key: string;
  start: number;
  end: number;
}

/** The words the phrase bar offers, and the pattern they stand for. */
interface Selected {
  /** The latest snap of the words (they are read again after snapping). */
  snapped: Snapped;
  /** The background's answer: undefined when no pattern matches. */
  match: Promise<PatternMatch | undefined>;
  /** `match` once it has come. */
  answer?: PatternMatch;
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
  /** The hover card's "Details": opens the panel for its word. */
  openDetails(): void;
  /** The panel's Learning / Known / Remove. */
  setPanelStatus(status: WordStatus): void;
  speak(): void;
  closePanel(): void;
  /** Scrolls to the panel's "On this page" sentence. */
  goToSentence(index: number): void;
  /** The phrase bar's "+ Learning" / "Known". */
  savePhrase(status: TermStatus): void;
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

/** The term as written: the whole phrase for a part of a phrase with a gap. */
const surfaceOf = ({ block, span }: SpanRef) => {
  const { start, end } = span.part ?? span;
  return collapseSpaces(block.text.slice(start, end));
};

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
  /** The page's title and body (`findMainContent`), found again after page changes. */
  let main: MainContent = findMainContent(root, []);
  /** Analyzed blocks whose spans are highlighted (in scope). */
  const shown = new Set<TextBlock>();
  /** Saved terms the analyses found on the page. */
  const savedKeys = new Set<string>();

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
    recordEncounters(entered, savedKeys);
    recordHistory(entered);
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
    for (const key of result.saved) savedKeys.add(key);
    const counted = fresh.filter(inScope);
    recordEncounters(counted, new Set(result.saved));
    recordHistory(counted);
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
    for (const block of pageText.blocks().filter(inScope))
      for (const span of spans.get(block) ?? [])
        if (span.category === "new") keys.add(span.key);
    return [...keys];
  }

  /**
   * Saves every unsaved new word of the analyzed part of the page as Known, once the
   * end of the article is in view and Settings say so (`unsavedAtEnd`). The last
   * paragraph is analyzed first if it has not been yet (the end can show before the
   * visible blocks are queued), and blocks waiting for analysis are waited for.
   */
  async function markUnsavedKnown() {
    const last = main.last;
    if (last && live.has(last) && !spans.has(last)) await analyze([last]);
    await visible.idle();
    const keys = unsavedOnPage();
    if (keys.length === 0) return;
    await deps.send({
      type: "saveAll",
      lang,
      keys,
      status: "known",
      source: source(),
    });
    const saved = new Set(keys);
    recategorize((s) =>
      s.category === "new" && saved.has(s.key) ? "known" : undefined,
    );
    await refreshOpenCards();
  }

  const summary = (): PageSummary => ({ supported: true, hostname });

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
  let phrase: Selected | undefined;

  const snappedRange = (s: Snapped) => rangeOf(s.block, s.start, s.end);
  /** The same words: the selection is read again after it is snapped. */
  const sameSnap = (a: Snapped | undefined, b: Snapped) =>
    a !== undefined &&
    a.block === b.block &&
    a.start === b.start &&
    a.end === b.end;

  /** The pattern snapped words stand for; undefined when none matches or on failure. */
  function patternOf({
    block,
    start,
    end,
  }: Snapped): Promise<PatternMatch | undefined> {
    return deps
      .send({ type: "matchSelection", lang, text: block.text, start, end })
      .then(
        (match) =>
          match.key !== undefined &&
          match.start !== undefined &&
          match.end !== undefined
            ? { key: match.key, start: match.start, end: match.end }
            : undefined,
        (error: unknown) => {
          warn(error);
          return undefined;
        },
      );
  }

  function onSelection(range: Range | undefined) {
    const snapped = range && snapSelection(range, index, spans);
    if (!snapped) {
      phrase = undefined;
      if (store.get().phrase) store.set({ phrase: null });
      return;
    }
    if (phrase && sameSnap(phrase.snapped, snapped)) {
      // The same words, read again: their pattern has been asked for.
      phrase.snapped = snapped;
    } else {
      const selected: Selected = { snapped, match: patternOf(snapped) };
      phrase = selected;
      void selected.match.then((match) => {
        selected.answer = match;
        const bar = store.get().phrase;
        // Dropped when other words are selected by now.
        if (phrase === selected && bar && match)
          store.set({ phrase: { ...bar, key: match.key } });
      });
    }
    const { answer } = phrase;
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
        ...(answer && { key: answer.key }),
      },
    });
  }

  /**
   * Saves the words under the pattern they stand for, as the pattern's words are
   * written ("made up her mind" for a selection of "made up"); else the selected words
   * under their own keys. A press before the background has answered waits for the
   * answer, so the words are saved alike whenever the bar is pressed.
   */
  async function savePhrase(
    snapped: Snapped,
    pattern: Promise<PatternMatch | undefined>,
    status: TermStatus,
  ) {
    const { block } = snapped;
    const match = await pattern;
    const { start, end } = match ?? snapped;
    const sentence = sentenceAt(block.text, start, end, lang);
    await deps.send({
      type: "saveTerm",
      lang,
      key: match?.key ?? selectionKey(snapped),
      display: collapseSpaces(block.text.slice(start, end)),
      kind: "phrase",
      status,
      source: source(),
      sentence,
      pos: { textQuote: sentence },
    });
    if (phrase && sameSnap(phrase.snapped, snapped)) {
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
    const anchor = phrase && wordBoxes(snappedRange(phrase.snapped))[0];
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
    openDetails() {
      const ref = hoverRef;
      if (!ref) return;
      interactions.dismissHover();
      void openPanel(ref).catch(warn);
    },
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
      if (!phrase) return;
      const { snapped, match } = phrase;
      run(() => savePhrase(snapped, match, status));
    },
  };

  const unmountUi = await deps.mountUi(app);

  const visible = watchVisibleBlocks(analyze);
  const end = watchEndOfArticle(() => {
    if (settings.unsavedAtEnd === "known") run(markUnsavedKnown);
  });

  const pageText = createPageText(root, {
    onChange({ removed, added }) {
      for (const block of removed) {
        live.delete(block);
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
      main = findMainContent(root, pageText.blocks());
      end.update(main.last);
      rescope();
    },
  });
  main = findMainContent(root, pageText.blocks());
  for (const block of pageText.blocks()) live.add(block);
  index.add(pageText.blocks());
  visible.add(pageText.blocks());
  end.update(main.last);

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
    const scopeChanged = next.articleMainOnly !== settings.articleMainOnly;
    settings = next;
    store.set({ settings });
    highlighter.setEnabled(next.highlight);
    if (scopeChanged) rescope();
    if (levelChanged) run(() => reanalyze());
  });

  function handlePageRequest(): Promise<PageSummary> {
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
      shown.clear();
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
        : unsupportedPage(hostname);
    },
    stop() {
      stopped = true;
      unwatch();
      session?.stop();
      session = undefined;
    },
  };
}
