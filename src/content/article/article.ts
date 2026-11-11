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
import { describeTerm, translateSenses, type TermCard } from "./describe";
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
import { createTranslationQueue } from "../translate/queue";
import {
  createBuiltInTranslator,
  type TranslationProvider,
} from "../translate/translator";
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

/** The card over a selection of words, which saves them as a phrase. */
export interface PhraseState {
  anchor: Box;
  /**
   * The dictionary pattern the words stand for ("make up one's mind" for "made up her
   * mind"), or the words themselves when no pattern matches.
   */
  card: TermCard;
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

/** The selected words, and the phrase they stand for. */
interface Selected {
  /** The latest snap of the words (they are read again after snapping). */
  snapped: Snapped;
  /** The background's answer: undefined when no pattern matches. */
  match: Promise<PatternMatch | undefined>;
  /**
   * Once the background has answered: the phrase as a span of the block, the pattern's
   * words or else the selected ones (not one of the page's spans).
   */
  ref?: SpanRef;
  /** The phrase's card, once looked up. */
  card?: TermCard;
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
  /** The selection card's "+ Learning" / "Known". */
  savePhrase(status: TermStatus): void;
  /** The selection card's "Details": opens the panel for its phrase. */
  openPhraseDetails(): void;
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
  const translator = createTranslationQueue(
    deps.createTranslator ?? createBuiltInTranslator,
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

  /** Saves the keys with the status as one batch and highlights them so. */
  async function saveKeys(keys: string[], status: TermStatus) {
    const result = await deps.send({
      type: "saveAll",
      lang,
      keys,
      status,
      source: source(),
    });
    const saved = new Set(keys);
    recategorize((s) =>
      s.category === "new" && saved.has(s.key) ? status : undefined,
    );
    await refreshOpenCards();
    return { ...result, keys: saved };
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
    if (keys.length > 0) await saveKeys(keys, "known");
  }

  /** The popup's last "Mark all as …" on this page view, until it is undone. */
  let lastBatch:
    | { batchId: string; keys: ReadonlySet<string>; status: TermStatus }
    | undefined;
  let done: PageSummary["done"] = null;

  /** The popup's "Mark all as Learning / Known": every unsaved new word of the page. */
  async function saveAll(status: TermStatus) {
    const keys = unsavedOnPage();
    if (keys.length === 0) return;
    const { batchId, count, keys: saved } = await saveKeys(keys, status);
    lastBatch = { batchId, keys: saved, status };
    done = { count, target: status };
  }

  async function undoSaveAll() {
    const batch = lastBatch;
    if (!batch) return;
    await deps.send({ type: "undoSaveAll", batchId: batch.batchId });
    lastBatch = undefined;
    done = null;
    // Those words were new before; the ones changed since stay as they are.
    recategorize((s) =>
      s.category === batch.status && batch.keys.has(s.key) ? "new" : undefined,
    );
    await refreshOpenCards();
  }

  const summary = (): PageSummary => ({
    supported: true,
    hostname,
    scope: "page",
    unsaved: unsavedOnPage().length,
    done,
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

  const translation = () => ({
    send: deps.send,
    lang,
    nativeLang: settings.nativeLang,
    translator,
  });
  const describe = (ref: SpanRef, shownIn: "hover" | "window" = "hover") =>
    describeTerm(
      {
        key: ref.span.key,
        kind: ref.span.kind,
        surface: surfaceOf(ref),
        category: ref.span.category,
      },
      { ...translation(), sourceUrl: location.href, shownIn },
    );

  /** True when `ref` is one of the page's spans (not a selection's phrase). */
  const onPage = ({ block, span }: SpanRef) =>
    spans.get(block)?.includes(span) ?? false;

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
      // A selected phrase may be anywhere on the page: classify again to find it.
      if (card.status === "new" && !onPage(ref)) await reanalyze();
      else recategorize((s) => (sameTerm(s, key, kind) ? to : undefined));
    }
    await refreshCards(key, kind);
  }

  // Hover card.
  let hoverRef: SpanRef | undefined;
  let hoverTicket = 0;

  async function showHover(ref: SpanRef) {
    // The selection card is the card for the words under the pointer.
    if (phrase) return;
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
    const card = await describe(ref, "window");
    if (ticket !== panelTicket) return;
    panelRef = ref;
    showPanel(ref, card);
  }

  /**
   * Shows the panel's card, then its English definitions translated as they come (the
   * click that opened it lets the translator download its model the first time).
   */
  function showPanel(ref: SpanRef, card: TermCard) {
    store.set({ panel: panelState(ref, card) });
    void translateSenses(card, translation())
      .then((translated) => {
        const panel = store.get().panel;
        if (translated !== card && panel?.card === card)
          store.set({ panel: { ...panel, card: translated } });
      })
      .catch(warn);
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
      const card = await describe(ref, "window");
      if (panelTicket === ticket) showPanel(ref, card);
    }
  }

  // Selection card.
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

  /** Shows the card of the selected words once it is looked up, above them. */
  function showSelected(selected: Selected) {
    const { card } = selected;
    const [anchor] = wordBoxes(snappedRange(selected.snapped));
    if (card && anchor) store.set({ phrase: { anchor, card } });
  }

  /**
   * Looks up the phrase the selected words stand for: the pattern they match, as a
   * span over the pattern's words; else the words under their own keys.
   */
  async function describeSelected(selected: Selected) {
    const match = await selected.match;
    const { snapped } = selected;
    const { start, end } = match ?? snapped;
    const ref: SpanRef = {
      block: snapped.block,
      span: {
        start,
        end,
        key: match?.key ?? selectionKey(snapped),
        kind: "phrase",
        category: "new",
      },
    };
    const card = await describe(ref);
    // Dropped when other words are selected by now.
    if (phrase !== selected) return;
    selected.ref = ref;
    selected.card = card;
    showSelected(selected);
  }

  function dropSelected() {
    phrase = undefined;
    if (store.get().phrase) store.set({ phrase: null });
  }

  function onSelection(range: Range | undefined) {
    const snapped = range && snapSelection(range, index, spans);
    if (!snapped) {
      dropSelected();
      return;
    }
    if (phrase && sameSnap(phrase.snapped, snapped)) {
      // The same words, read again: their phrase has been asked for.
      phrase.snapped = snapped;
    } else {
      dropSelected();
      interactions.dismissHover();
      const selected: Selected = { snapped, match: patternOf(snapped) };
      phrase = selected;
      void describeSelected(selected).catch(warn);
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
    showSelected(phrase);
  }

  /**
   * Saves the words under the pattern they stand for, as the pattern's words are
   * written ("made up her mind" for a selection of "made up"); else the selected words
   * under their own keys. A press before the background has answered waits for the
   * answer, so the words are saved alike whenever the card is pressed.
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
      dropSelected();
      getSelection()?.removeAllRanges();
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
    const { panel } = store.get();
    if (panel && panelRef)
      store.set({ panel: { ...panel, outline: outlineOf(panelRef) } });
    if (phrase) showSelected(phrase);
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
    openPhraseDetails() {
      const ref = phrase?.ref;
      if (!ref) return;
      dropSelected();
      getSelection()?.removeAllRanges();
      void openPanel(ref).catch(warn);
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
    pressAway() {
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
