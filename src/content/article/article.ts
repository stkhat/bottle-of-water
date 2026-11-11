import type { Category, Span, TermStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { collapseSpaces, splitSentences } from "../../core/text/sentences";
import { termId } from "../../core/term-id";
import {
  unsupportedPage,
  type PageRequest,
  type PageSummary,
} from "../../messaging/page-protocol";
import type { SourceInput } from "../../messaging/protocol";
import type { DictionaryLink } from "../../ui/lookup/externalDictionaries";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import type { TermCard } from "../lookup/describe";
import { wordBoxes, type Box } from "../lookup/geometry";
import {
  createLookup,
  createMarkAll,
  latest,
  sameTerm,
  type LookupDeps,
  type Term,
} from "../lookup/lookup";
import { sendStatus } from "../lookup/status";
import { warn } from "../lookup/warn";
import { inOtherLanguage } from "../page-language";
import { createStore, type Store } from "../store";
import { watchEndOfArticle } from "./end-of-article";
import { createHighlighter } from "./highlighter";
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
import type { MainContent } from "./main-content";
import {
  collectBlocks,
  createPageText,
  rangeOf,
  type TextBlock,
} from "./page-text";
import { sentenceAt } from "./sentence";
import type { DetectLanguage } from "./should-run";
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

/** The hover card over a word: where the word is and what it says. */
interface HoverState {
  anchor: Box;
  card: TermCard;
}

/** The dictionary panel for the clicked word. */
interface PanelState {
  card: TermCard;
  /** Sentences on this page with the term, in page order. */
  here: string[];
  dictionaries: DictionaryLink[];
  /** The clicked word's boxes, outlined. */
  outline: Box[];
}

/** The card over a selection of words, which saves them as a phrase. */
interface PhraseState {
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
interface ArticleState {
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

/** The term as written: the whole phrase for a part of a phrase with a gap. */
const writtenOf = ({ block, span }: SpanRef) => {
  const { start, end } = span.part ?? span;
  return collapseSpaces(block.text.slice(start, end));
};

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
    url: surface.url,
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

  const marks = createMarkAll({
    send: deps.send,
    lang: () => lang,
    source,
    unsaved: unsavedOnPage,
    async marked(keys, from, to) {
      recategorize((s) =>
        s.category === from && keys.has(s.key) ? to : undefined,
      );
      await refreshOpenCards();
    },
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

  const blocksWith = (term: Term) =>
    [...spans]
      .filter(([, list]) => list.some((s) => sameTerm(s, term)))
      .map(([block]) => block);

  const describe = (ref: SpanRef, shownIn: "hover" | "window" = "hover") =>
    lookup.describe(
      {
        key: ref.span.key,
        kind: ref.span.kind,
        surface: writtenOf(ref),
        category: ref.span.category,
      },
      shownIn,
    );

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
    await refreshCards(card);
  }

  // Hover card.
  let hoverRef: SpanRef | undefined;
  const hoverTicket = latest();

  async function showHover(ref: SpanRef) {
    // The selection card is the card for the words under the pointer.
    if (phrase) return;
    const isLatest = hoverTicket.next();
    const card = await describe(ref);
    if (!isLatest()) return;
    const [anchor] = wordBoxes(
      rangeOf(ref.block, ref.span.start, ref.span.end),
    );
    if (!anchor) return;
    hoverRef = ref;
    store.set({ hover: { anchor, card } });
  }

  function hideHover() {
    hoverTicket.drop();
    hoverRef = undefined;
    if (store.get().hover) store.set({ hover: null });
  }

  // Dictionary panel.
  let panelRef: SpanRef | undefined;
  const panelTicket = latest();
  /** The span of each "On this page" sentence, for scrolling to it. */
  let panelRanges: Range[] = [];

  function sentencesOnPage(term: Term) {
    const here: string[] = [];
    const ranges: Range[] = [];
    for (const block of pageText.blocks()) {
      for (const span of spans.get(block) ?? []) {
        if (!sameTerm(span, term)) continue;
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

  async function openPanel(ref: SpanRef) {
    const isLatest = panelTicket.next();
    const card = await describe(ref, "window");
    if (!isLatest()) return;
    panelRef = ref;
    showPanel(ref, card);
    deps.onPanelOpen?.();
  }

  function showPanel(ref: SpanRef, card: TermCard) {
    const { here, ranges } = sentencesOnPage(card);
    panelRanges = ranges;
    lookup.showPanel(store, {
      card,
      here,
      dictionaries: lookup.dictionaries(card.head),
      outline: outlineOf(ref),
    });
  }

  function closePanel() {
    panelTicket.drop();
    panelRef = undefined;
    panelRanges = [];
    store.set({ panel: null });
  }

  /** Looks the term up again where the hover card or the panel shows it. */
  async function refreshCards(term: Term) {
    const { hover, panel } = store.get();
    if (hover && hoverRef && sameTerm(hoverRef.span, term)) {
      const ref = hoverRef;
      const card = await describe(ref);
      if (hoverRef === ref)
        store.set({ hover: { ...store.get().hover!, card } });
    }
    if (panel && panelRef && sameTerm(panelRef.span, term)) {
      const ref = panelRef;
      const isCurrent = panelTicket.current();
      const card = await describe(ref, "window");
      if (isCurrent()) showPanel(ref, card);
    }
  }

  /** Looks up again whatever the hover card and the panel show. */
  async function refreshOpenCards() {
    const refs = [hoverRef, panelRef].filter((r) => r !== undefined);
    for (const { span } of refs) await refreshCards(span);
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
    deps.onTermsChanged?.();
    // The phrase may be anywhere on the page: classify again to find it.
    await reanalyze();
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
    speak: () => lookup.speak(store.get().panel?.card.head),
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
