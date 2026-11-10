import type { SourceInput } from "../../background/term-store";
import type { Category, Span, TermKind, TermStatus } from "../../core/classify";
import {
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "../../core/settings";
import {
  cueAt,
  cueIndexAt,
  lastStartedIndex,
  mergeAsrFragments,
  oneLinePerCard,
  sentenceCards,
  type SubtitleLine,
} from "../../core/subtitles/cues";
import {
  alignByOverlap,
  joinerFor,
  type TranslationChoice,
} from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import { speechLang } from "../../core/languages";
import { termId } from "../../core/term-id";
import type { send } from "../../messaging/client";
import type { TermBrief } from "../../messaging/protocol";
import {
  unsupportedPage,
  type PageRequest,
  type PageSummary,
} from "../../messaging/page-protocol";
import {
  dictionaryLinks,
  type DictionaryLink,
} from "../../ui/lookup/externalDictionaries";
import type { HighlightCategory } from "../../ui/lookup/HighlightChips";
import type { WordStatus } from "../../ui/lookup/HoverCard";
import { describeTerm, type TermCard } from "../article/describe";
import type { Box } from "../article/geometry";
import { hostBlocked } from "../article/should-run";
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  type TranslationProvider,
} from "../article/translate";
import { createStore, type Store } from "../ui/store";
import { createHoverIntent } from "./hover-intent";
import type { PlatformAdapter } from "./platform";
import type { PanelTab } from "../../ui/video/VideoPanel";
import type { VideoWord, WordsFilter } from "./words";

/** Cues classified per `analyze` request. */
const BATCH = 50;

/** What the video UI needs from the extension and the site, passed in so it runs in tests. */
export interface VideoDeps {
  /** `send()` from the messaging client. */
  send: typeof send;
  adapter: PlatformAdapter;
  /** Calls `listener` with the new settings after every change; returns an unsubscribe. */
  watchSettings(listener: (settings: Settings) => void): () => void;
  /** Default: the browser's built-in translator. */
  createTranslator?(from: string, to: string): TranslationProvider;
  /** Default: asks the built-in translator. */
  translatorAvailable?(from: string, to: string): Promise<boolean>;
  /** How long the pointer rests on a word before its card shows (ms). */
  hoverDelayMs?: number;
}

/** A term in the subtitles: the cue and the index of its span in that cue's spans. */
export interface WordRef {
  cue: number;
  span: number;
}

/** The hover card over a word in the subtitle. */
export interface VideoHover {
  ref: WordRef;
  /** The word's box in the viewport. */
  anchor: Box;
  card: TermCard;
}

/** A line of the video with the term, for the window's "In this video". */
export interface VideoLine {
  cue: number;
  timeMs: number;
  text: string;
}

/** The dictionary window for the clicked word. */
export interface VideoPanel {
  ref: WordRef;
  card: TermCard;
  here: VideoLine[];
  dictionaries: DictionaryLink[];
  /** Counts the times the window opened (not the words shown in an open one). */
  opened: number;
}

/** The tabs of the right column (defined with their UI). */
export type { PanelTab };

/** What the video UI shows for the current video. */
export interface VideoState {
  settings: Settings;
  /** The video on the page, null when there is none. */
  videoId: string | null;
  /**
   * idle: no video; loading: reading its subtitles; ready; unavailable: no subtitles in
   * the learning language (or they could not be read).
   */
  status: "idle" | "loading" | "ready" | "unavailable";
  /** Lingo is on for this video (the L button). */
  enabled: boolean;
  /**
   * The transcript's cards: the original subtitles as sentences (cues that go on joined,
   * auto-generated fragments merged). Spans, translations and word refs are per card.
   */
  cues: Cue[];
  /** The lines the video shows, each a part of a card (one per original cue). */
  lines: SubtitleLine[];
  /** Spans of each cue's text; null until the cue is classified. */
  spans: (Span[] | null)[];
  translationSource: TranslationChoice["source"];
  /** The translation of each cue, for the transcript ("" when none). */
  translations: string[];
  /** The line playing; -1 between lines, during ads and while off. */
  line: number;
  /** The card of the line playing; -1 between lines, during ads and while off. */
  current: number;
  /** The transcript's card: the cue that started last; -1 before the first, during ads and while off. */
  card: number;
  /** The translation the subtitle shows at the playing time. */
  subtitleTranslation: string;
  hover: VideoHover | null;
  panel: VideoPanel | null;
  /** The Lingo menu above the ^ button. */
  menuOpen: boolean;
  /** The player is in fullscreen: no transcript, the subtitle always in the video. */
  fullscreen: boolean;
  /** The right column's tab; each video starts on the transcript. */
  panelTab: PanelTab;
  /** The Words tab's filter chip. */
  wordsFilter: WordsFilter;
  /**
   * Short meaning and saved status of the video's terms by key, as they arrive (the
   * Words tab: `videoWords(cues, spans, summaries)`).
   */
  summaries: Record<string, TermBrief>;
}

/** The UI's view of the video: its state and what its controls do. */
export interface VideoApp {
  readonly store: Store<VideoState>;
  /** The L button: Lingo on or off for this video. */
  setEnabled(on: boolean): void;
  /** A transcript card was clicked. */
  seekToCue(index: number): void;
  /** The pointer entered a word of the subtitle (its box in the viewport). */
  enterWord(ref: WordRef, anchor: Box): void;
  /** The pointer left the word. */
  leaveWord(): void;
  /** The pointer entered the hover card: keep it. */
  keepHover(): void;
  /** The pointer left the hover card: hide it soon. */
  releaseHover(): void;
  /** A word of the subtitle was clicked: its dictionary window opens. */
  clickWord(ref: WordRef): void;
  /** The hover card's "+ Learning" / "Known". */
  setHoverStatus(status: TermStatus): void;
  /** The window's Learning / Known / Remove. */
  setPanelStatus(status: WordStatus): void;
  speak(): void;
  closePanel(): void;
  /** A line of the window's "In this video" was clicked. */
  seekTo(ms: number): void;
  toggleHighlight(category: HighlightCategory): void;
  /** The menu's and the transcript's switches. */
  changeSettings(patch: SettingsPatch): void;
  /** "Open all settings". */
  openSettings(): void;
  setMenuOpen(open: boolean): void;
  setFullscreen(on: boolean): void;
  setPanelTab(tab: PanelTab): void;
  setWordsFilter(filter: WordsFilter): void;
  /** A row of the Words tab was selected: its dictionary window opens at its first occurrence. */
  openWord(row: Pick<VideoWord, "first">): void;
}

export interface VideoSession {
  readonly app: VideoApp;
  /** Answers the popup about this video (see `page-protocol.ts`). */
  handlePageRequest(request: PageRequest): Promise<PageSummary>;
  /** Classifies the current video's cues again (after saved terms changed). */
  reanalyze(): Promise<void>;
  stop(): void;
}

/** Per-video work that stops when the user moves on. */
interface Watch {
  id: string;
  controller: AbortController;
  /** The site's translation track, looked up by time for the subtitle. */
  timedTranslation: Cue[] | null;
  /** Joins the lines of a translation cue. */
  translationJoiner: string;
  stopTracking?: () => void;
  played: Set<number>;
  /** "key\ncue index" already recorded. */
  recorded: Set<string>;
  saved: Set<string>;
  pendingTranslations: Map<number, Promise<string | undefined>>;
  /** The video played to its end once (unsaved new words were handled). */
  endReached: boolean;
  /** Keys whose summaries were asked for. */
  asked: Set<string>;
  /** Saved status by key as this video last saw it (newer than a summary on its way). */
  statuses: Map<string, TermBrief["status"]>;
}

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

function warn(error: unknown) {
  if (!isAbort(error)) console.warn("Lingo:", error);
}

function fresh(
  settings: Settings,
  videoId: string | null,
  fullscreen: boolean,
  enabled = true,
): VideoState {
  return {
    settings,
    videoId,
    status: videoId ? "loading" : "idle",
    enabled,
    cues: [],
    lines: [],
    spans: [],
    translationSource: "none",
    translations: [],
    line: -1,
    current: -1,
    card: -1,
    subtitleTranslation: "",
    hover: null,
    panel: null,
    menuOpen: false,
    fullscreen,
    panelTab: "transcript",
    wordsFilter: "all",
    summaries: {},
  };
}

const sameTerm = (span: Span, key: string, kind: TermKind) =>
  span.key === key && span.kind === kind;

/**
 * Runs the video UI's logic on a video site: per video, reads the subtitles through the
 * adapter, classifies them in batches, follows the playing cue, records saved words of
 * the lines that play, and offers save-all when the video ends. Starts over on every
 * navigation to another video.
 */
export async function startVideo(deps: VideoDeps): Promise<VideoSession> {
  const { adapter } = deps;
  let settings = await deps.send({ type: "getSettings" });
  const store = createStore<VideoState>(fresh(settings, null, false));
  let watch: Watch | undefined;
  let translator: TranslationProvider | undefined;
  let warmed = false;

  const lang = () => settings.learningLang;
  const hostname = () => {
    try {
      return new URL(adapter.url()).hostname;
    } catch {
      return "";
    }
  };
  const platform = adapter.platform as "youtube" | "netflix";
  const siteOn = () =>
    settings.sites[platform] !== false && !hostBlocked(hostname(), settings);

  /** Our subtitles replace the site's while there are some and Lingo is on (fullscreen too). */
  function syncSiteCaptions() {
    const { status, enabled } = store.get();
    adapter.hideSiteCaptions(status === "ready" && enabled);
  }

  const source = (): SourceInput => ({
    platform: adapter.platform,
    url: adapter.url(),
    title: adapter.title(),
    lang: lang(),
  });

  const flat = (text: string) => text.split("\n").join(joinerFor(lang()));

  function open() {
    const id = siteOn() ? (adapter.videoId() ?? null) : null;
    if (watch && watch.id === id) return;
    close();
    hover.cancel();
    // The L button starts where it was left on this platform.
    store.set(
      fresh(
        settings,
        id,
        store.get().fullscreen,
        settings.videoOn[platform] !== false,
      ),
    );
    if (!id) {
      adapter.hideSiteCaptions(false);
      return;
    }
    const w: Watch = {
      id,
      controller: new AbortController(),
      timedTranslation: null,
      translationJoiner: " ",
      played: new Set(),
      recorded: new Set(),
      saved: new Set(),
      pendingTranslations: new Map(),
      endReached: false,
      asked: new Set(),
      statuses: new Map(),
    };
    watch = w;
    load(w).catch((error: unknown) => {
      warn(error);
      if (watch === w) {
        store.set({ status: "unavailable" });
        adapter.hideSiteCaptions(false);
      }
    });
  }

  function close() {
    if (!watch) return;
    watch.controller.abort();
    watch.stopTracking?.();
    watch = undefined;
  }

  async function load(w: Watch) {
    const { signal } = w.controller;
    const translatorAvailable = await (
      deps.translatorAvailable ?? builtInTranslatorAvailable
    )(lang(), settings.nativeLang);
    const captions = await adapter.loadCaptions({
      learningLang: lang(),
      nativeLang: settings.nativeLang,
      translatorAvailable,
      signal,
    });
    if (watch !== w) return;
    if (!captions || captions.cues.length === 0) {
      store.set({ status: "unavailable" });
      return;
    }
    const asr = captions.track.kind === "asr";
    const joiner = joinerFor(captions.track.lang);
    const { cards: cues, lines } = asr
      ? oneLinePerCard(mergeAsrFragments(captions.cues, { joiner }))
      : sentenceCards(captions.cues, { joiner });
    const { translation } = captions;
    const site =
      translation.source === "siteTrack" ||
      translation.source === "siteAutoTranslate";
    // Merged sentences no longer match the fragments' timing: show the aligned text.
    w.timedTranslation = site && !asr ? translation.cues : null;
    w.translationJoiner = joinerFor(translation.lang);
    store.set({
      status: "ready",
      cues,
      lines,
      spans: cues.map(() => null),
      translationSource: translation.source,
      translations: site
        ? alignByOverlap(cues, translation.cues, { lang: translation.lang })
        : cues.map(() => ""),
    });
    if (translation.source === "builtIn")
      translator = (deps.createTranslator ?? createBuiltInTranslator)(
        lang(),
        settings.nativeLang,
      );
    if (store.get().enabled) adapter.hideSiteCaptions(true);
    startTracking(w).catch(warn);
    await analyzeAll(w);
  }

  async function startTracking(w: Watch) {
    const { signal } = w.controller;
    let video = adapter.video();
    while (!video) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (signal.aborted || watch !== w) return;
      video = adapter.video();
    }
    const element = video;
    const tick = () => update(w, element);
    const onEnded = () => {
      if (adapter.adShowing() || watch !== w || w.endReached) return;
      w.endReached = true;
      if (settings.unsavedAtEnd === "known") run(() => markUnsavedKnown(w));
    };
    const events = ["timeupdate", "seeked", "play", "pause", "loadeddata"];
    for (const type of events) element.addEventListener(type, tick);
    element.addEventListener("ended", onEnded);
    let frame: number | undefined;
    const loop = () => {
      tick();
      frame = element.requestVideoFrameCallback(loop);
    };
    if ("requestVideoFrameCallback" in element)
      frame = element.requestVideoFrameCallback(loop);
    w.stopTracking = () => {
      for (const type of events) element.removeEventListener(type, tick);
      element.removeEventListener("ended", onEnded);
      if (frame !== undefined) element.cancelVideoFrameCallback(frame);
    };
    tick();
  }

  function update(w: Watch, video: HTMLVideoElement) {
    if (watch !== w) return;
    const state = store.get();
    const ms = video.currentTime * 1000;
    const following = state.enabled && !adapter.adShowing();
    const line = following ? cueIndexAt(state.lines, ms) : -1;
    const current = state.lines[line]?.card ?? -1;
    const card = following ? lastStartedIndex(state.cues, ms) : -1;
    let subtitleTranslation = "";
    if (following)
      subtitleTranslation = w.timedTranslation
        ? (cueAt(w.timedTranslation, ms)?.text ?? "")
            .split("\n")
            .join(w.translationJoiner)
        : current >= 0
          ? (state.translations[current] ?? "")
          : "";
    if (
      line !== state.line ||
      card !== state.card ||
      subtitleTranslation !== state.subtitleTranslation
    ) {
      // The word under the pointer went with its line.
      if (line !== state.line && !onCard) hover.cancel();
      store.set({ line, current, card, subtitleTranslation });
    }
    if (current >= 0 && !w.played.has(current)) {
      w.played.add(current);
      void played(w, current).catch(warn);
    }
  }

  /**
   * A cue played for the first time: translate it if needed, record its saved words
   * and keep it in the sentence history.
   */
  async function played(w: Watch, index: number) {
    const from = source();
    if (store.get().translationSource === "builtIn")
      await translateCue(w, index);
    recordEncounters(w, [index]);
    recordHistory(w, index, from);
  }

  /** Sends a played card to the sentence history (played lines only, never the track). */
  function recordHistory(w: Watch, index: number, from: SourceInput) {
    const { cues, translations } = store.get();
    const cue = cues[index];
    if (watch !== w || !cue || !settings.sentenceHistory) return;
    const translation = translations[index];
    deps
      .send({
        type: "recordHistory",
        source: from,
        sentences: [
          {
            text: flat(cue.text),
            ...(translation ? { translation } : {}),
            pos: { timeMs: cue.startMs },
          },
        ],
      })
      .catch(warn);
  }

  function translateCue(w: Watch, index: number) {
    let pending = w.pendingTranslations.get(index);
    if (!pending) {
      const cue = store.get().cues[index];
      pending =
        cue && translator
          ? translator.translate(flat(cue.text))
          : Promise.resolve(undefined);
      w.pendingTranslations.set(index, pending);
      void pending.then((text) => {
        if (watch !== w || !text) return;
        const translations = [...store.get().translations];
        translations[index] = text;
        const state = store.get();
        store.set({
          translations,
          subtitleTranslation:
            state.current === index ? text : state.subtitleTranslation,
        });
      });
    }
    return pending;
  }

  async function analyzeAll(w: Watch) {
    const count = store.get().cues.length;
    for (let from = 0; from < count; from += BATCH) {
      if (watch !== w) return;
      const batch = [];
      for (let i = from; i < Math.min(count, from + BATCH); i++) batch.push(i);
      await analyze(w, batch);
    }
  }

  /** Classifies the cues at `indices` (one request). */
  async function analyze(w: Watch, indices: number[]) {
    if (indices.length === 0) return;
    const all = store.get().cues;
    const result = await deps.send({
      type: "analyze",
      lang: lang(),
      blocks: indices.map((i) => all[i]!.text),
    });
    if (!warmed) {
      // Load the dictionary now so the first lookup does not wait for it.
      warmed = true;
      deps.send({ type: "warmDictionary", lang: lang() }).catch(warn);
    }
    if (watch !== w) return;
    for (const key of result.saved) w.saved.add(key);
    const spans = [...store.get().spans];
    indices.forEach((cue, i) => {
      spans[cue] = result.spans[i] ?? [];
    });
    store.set({ spans });
    recordEncounters(
      w,
      indices.filter((i) => w.played.has(i)),
    );
    summarize(w, result.spans.flat(), new Set(result.saved));
  }

  /**
   * Notes the saved status of the classified terms and asks the summaries of the ones
   * not asked yet (one request).
   */
  function summarize(w: Watch, spans: Span[], saved: ReadonlySet<string>) {
    const statuses = new Map<string, TermBrief["status"]>();
    const terms: { key: string; kind: TermKind }[] = [];
    for (const { key, kind, category } of spans) {
      if (category === "ignored") continue;
      // A saved term's span has its status; "known" alone may be the level's.
      statuses.set(
        key,
        saved.has(key) && category !== "new" ? category : "new",
      );
      if (w.asked.has(key)) continue;
      w.asked.add(key);
      terms.push({ key, kind });
    }
    noteStatuses(w, statuses);
    if (terms.length === 0) return;
    deps
      .send({ type: "termSummaries", lang: lang(), terms })
      .then((answer) => {
        if (watch !== w) return;
        const summaries = { ...store.get().summaries };
        for (const [key, brief] of Object.entries(answer))
          summaries[key] = {
            ...brief,
            status: w.statuses.get(key) ?? brief.status,
          };
        store.set({ summaries });
      })
      .catch((error: unknown) => {
        // Asked again with the next batch.
        for (const { key } of terms) w.asked.delete(key);
        warn(error);
      });
  }

  /** Keeps the summaries' statuses with the terms' saved status. */
  function noteStatuses(
    w: Watch,
    statuses: Iterable<[string, TermBrief["status"]]>,
  ) {
    const current = store.get().summaries;
    let summaries: Record<string, TermBrief> | undefined;
    for (const [key, status] of statuses) {
      w.statuses.set(key, status);
      const brief = Object.hasOwn(current, key) ? current[key] : undefined;
      if (!brief || brief.status === status) continue;
      summaries ??= { ...current };
      summaries[key] = { ...brief, status };
    }
    if (summaries) store.set({ summaries });
  }

  /** Tells the background which saved terms the played cues have. */
  function recordEncounters(w: Watch, indices: number[]) {
    const { cues, spans, translations } = store.get();
    const items = [];
    for (const index of indices) {
      const cue = cues[index];
      for (const span of spans[index] ?? []) {
        if (!cue || !w.saved.has(span.key)) continue;
        const seen = `${span.key}\n${index}`;
        if (w.recorded.has(seen)) continue;
        w.recorded.add(seen);
        const translation = translations[index];
        items.push({
          termId: termId(lang(), span.key),
          sentence: flat(cue.text),
          ...(translation ? { translation } : {}),
          pos: { timeMs: cue.startMs },
        });
      }
    }
    if (items.length > 0)
      deps
        .send({ type: "recordEncounters", source: source(), items })
        .catch(warn);
  }

  function unsavedKeys(): string[] {
    const keys = new Set<string>();
    for (const list of store.get().spans)
      for (const span of list ?? [])
        if (span.category === "new") keys.add(span.key);
    return [...keys];
  }

  function recategorize(
    w: Watch,
    change: (span: Span) => Category | undefined,
  ) {
    const spans = store.get().spans.map(
      (list) =>
        list?.map((span) => {
          const category = change(span);
          return category === undefined || category === span.category
            ? span
            : { ...span, category };
        }) ?? null,
    );
    store.set({ spans });
  }

  /** Saves every unsaved new word of the video as Known (Settings `unsavedAtEnd`). */
  async function markUnsavedKnown(w: Watch) {
    if (watch !== w) return;
    const keys = unsavedKeys();
    if (keys.length === 0) return;
    await deps.send({
      type: "saveAll",
      lang: lang(),
      keys,
      status: "known",
      source: source(),
    });
    if (watch !== w) return;
    const saved = new Set(keys);
    for (const key of keys) w.saved.add(key);
    recategorize(w, (s) =>
      s.category === "new" && saved.has(s.key) ? "known" : undefined,
    );
    noteStatuses(
      w,
      keys.map((key) => [key, "known"]),
    );
    await refreshOpenCards();
  }

  // Words: the hover card and the dictionary window.
  let translatorForTerms: TranslationProvider | undefined;
  const termTranslator = () =>
    (translatorForTerms ??= (deps.createTranslator ?? createBuiltInTranslator)(
      lang(),
      settings.nativeLang,
    ));

  /** The span `ref` points at, with its text as written. */
  function spanOf(ref: WordRef) {
    const { cues, spans } = store.get();
    const cue = cues[ref.cue];
    const span = spans[ref.cue]?.[ref.span];
    if (!cue || !span) return undefined;
    return { cue, span, surface: flat(cue.text.slice(span.start, span.end)) };
  }

  async function describe(ref: WordRef): Promise<TermCard | undefined> {
    const found = spanOf(ref);
    if (!found) return undefined;
    return describeTerm(
      {
        key: found.span.key,
        kind: found.span.kind,
        surface: found.surface,
        category: found.span.category,
      },
      {
        send: deps.send,
        lang: lang(),
        sourceUrl: adapter.url(),
        translator: termTranslator(),
      },
    );
  }

  /** Every line with the term, in order. */
  function linesWith(key: string, kind: TermKind): VideoLine[] {
    const { cues, spans } = store.get();
    const lines: VideoLine[] = [];
    spans.forEach((list, cue) => {
      if (!list?.some((s) => sameTerm(s, key, kind))) return;
      lines.push({
        cue,
        timeMs: cues[cue]!.startMs,
        text: flat(cues[cue]!.text),
      });
    });
    return lines;
  }

  function panelState(ref: WordRef, card: TermCard, opened: number) {
    return {
      ref,
      card,
      here: linesWith(card.key, card.kind),
      dictionaries: dictionaryLinks(card.head, settings.dictionaries, {
        from: lang(),
        to: settings.nativeLang,
      }),
      opened,
    };
  }

  let hoverTicket = 0;
  const hover = createHoverIntent<string>(
    {
      show(id) {
        const [cue, span] = id.split(":").map(Number) as [number, number];
        const ref = { cue, span };
        const anchor = pendingAnchor;
        const ticket = ++hoverTicket;
        void describe(ref)
          .then((card) => {
            if (ticket !== hoverTicket || !card || !anchor) return;
            store.set({ hover: { ref, anchor, card } });
          })
          .catch(warn);
      },
      hide() {
        hoverTicket++;
        onCard = false;
        if (store.get().hover) store.set({ hover: null });
      },
    },
    { showDelayMs: deps.hoverDelayMs },
  );
  let pendingAnchor: Box | undefined;
  /** The pointer is on the hover card. */
  let onCard = false;

  let panelTicket = 0;
  let opened = 0;
  async function openPanel(ref: WordRef) {
    const ticket = ++panelTicket;
    const card = await describe(ref);
    if (ticket !== panelTicket || !card) return;
    if (!store.get().panel) opened++;
    store.set({ panel: panelState(ref, card, opened) });
  }

  /** Looks the term up again where the hover card or the window shows it. */
  async function refreshCards(key: string, kind: TermKind) {
    const { hover: shown, panel } = store.get();
    if (shown && shown.card.key === key && shown.card.kind === kind) {
      const card = await describe(shown.ref);
      const now = store.get().hover;
      if (card && now?.ref === shown.ref)
        store.set({ hover: { ...now, card } });
    }
    if (panel && panel.card.key === key && panel.card.kind === kind) {
      const ticket = panelTicket;
      const card = await describe(panel.ref);
      if (card && ticket === panelTicket && store.get().panel)
        store.set({ panel: panelState(panel.ref, card, panel.opened) });
    }
  }

  /** Looks up again whatever the hover card and the window show. */
  async function refreshOpenCards() {
    const { hover: shown, panel } = store.get();
    for (const card of [shown?.card, panel?.card])
      if (card) await refreshCards(card.key, card.kind);
  }

  /** Saves, changes or removes the term at `ref`; every line with it follows. */
  async function changeStatus(
    w: Watch,
    ref: WordRef,
    card: TermCard,
    to: WordStatus,
  ) {
    const { key, kind } = card;
    if (card.status === to) return;
    if (to === "new") {
      await deps.send({ type: "removeTerm", id: card.termId });
      w.saved.delete(key);
      // Unsaved, each occurrence is new or known again by the level.
      await analyze(
        w,
        linesWith(key, kind).map((l) => l.cue),
      );
    } else {
      if (card.status === "new") {
        const found = spanOf(ref);
        if (!found) return;
        const { translations, current, subtitleTranslation } = store.get();
        const translation =
          translations[ref.cue] ||
          (current === ref.cue ? subtitleTranslation : "");
        await deps.send({
          type: "saveTerm",
          lang: lang(),
          key,
          display: found.surface,
          kind,
          status: to,
          source: source(),
          sentence: flat(found.cue.text),
          ...(translation ? { translation } : {}),
          pos: { timeMs: found.cue.startMs },
        });
        // Saving recorded this line already.
        w.recorded.add(`${key}\n${ref.cue}`);
        w.saved.add(key);
      } else {
        await deps.send({ type: "setStatus", id: card.termId, status: to });
      }
      if (watch !== w) return;
      recategorize(w, (s) => (sameTerm(s, key, kind) ? to : undefined));
      noteStatuses(w, [[key, to]]);
    }
    await refreshCards(key, kind);
  }

  function speak() {
    const head = store.get().panel?.card.head;
    if (!head || typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(head);
    utterance.lang = speechLang(lang());
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  function changeSettings(patch: SettingsPatch) {
    settings = mergeSettings(patch, settings);
    store.set({ settings });
    run(() => deps.send({ type: "setSettings", patch }));
  }

  // One change to saved terms at a time, in the order asked.
  let queue: Promise<unknown> = Promise.resolve();
  function run(task: () => Promise<unknown>) {
    queue = queue.then(task).catch(warn);
  }

  /** Runs `task` for the current video, if there is one. */
  const withWatch = (task: (w: Watch) => Promise<unknown>) => {
    const w = watch;
    if (w) run(() => task(w));
  };

  const app: VideoApp = {
    store,
    setEnabled(on) {
      if (store.get().enabled === on) return;
      hover.cancel();
      store.set({ enabled: on, ...(!on && { panel: null }) });
      if (settings.videoOn[platform] !== on)
        changeSettings({ videoOn: { [platform]: on } });
      if (store.get().status === "ready") syncSiteCaptions();
      const video = adapter.video();
      if (watch && video) update(watch, video);
    },
    seekToCue(index) {
      const cue = store.get().cues[index];
      if (cue) adapter.seek(cue.startMs).catch(warn);
    },
    enterWord(ref, anchor) {
      pendingAnchor = anchor;
      hover.enter(`${ref.cue}:${ref.span}`);
    },
    leaveWord: () => hover.leave(),
    keepHover() {
      onCard = true;
      hover.keep();
    },
    releaseHover() {
      onCard = false;
      hover.release();
    },
    clickWord(ref) {
      hover.cancel();
      void openPanel(ref).catch(warn);
    },
    openWord(row) {
      app.clickWord(row.first);
    },
    setHoverStatus(status) {
      const shown = store.get().hover;
      if (shown)
        withWatch((w) => changeStatus(w, shown.ref, shown.card, status));
    },
    setPanelStatus(status) {
      const panel = store.get().panel;
      if (panel)
        withWatch((w) => changeStatus(w, panel.ref, panel.card, status));
    },
    speak,
    closePanel() {
      panelTicket++;
      store.set({ panel: null });
    },
    seekTo(ms) {
      adapter.seek(ms).catch(warn);
    },
    toggleHighlight(category) {
      changeSettings({
        highlight: { [category]: !settings.highlight[category] },
      });
    },
    changeSettings,
    openSettings() {
      deps.send({ type: "openOptions" }).catch(warn);
    },
    setMenuOpen(open) {
      if (store.get().menuOpen !== open) store.set({ menuOpen: open });
    },
    setFullscreen(on) {
      if (store.get().fullscreen === on) return;
      hover.cancel();
      store.set({ fullscreen: on });
      if (store.get().status === "ready") syncSiteCaptions();
    },
    setPanelTab(tab) {
      if (store.get().panelTab !== tab) store.set({ panelTab: tab });
    },
    setWordsFilter(filter) {
      if (store.get().wordsFilter !== filter)
        store.set({ wordsFilter: filter });
    },
  };

  const summary = (): PageSummary => {
    const state = store.get();
    if (state.status !== "ready") return unsupportedPage(hostname());
    return { supported: true, hostname: hostname() };
  };

  const offNavigate = adapter.onNavigate(open);
  const unwatch = deps.watchSettings((next) => {
    const levelChanged = next.knownLevel !== settings.knownLevel;
    const wasOn = siteOn();
    settings = next;
    store.set({ settings });
    // Switched off for this site: give the page back; switched on: start.
    if (siteOn() !== wasOn) open();
    else if (levelChanged) withWatch(analyzeAll);
  });
  open();

  return {
    app,
    handlePageRequest() {
      // Answer after everything asked before has been done.
      return queue.then(summary);
    },
    async reanalyze() {
      const w = watch;
      if (w) await analyzeAll(w);
    },
    stop() {
      offNavigate();
      unwatch();
      hover.cancel();
      close();
      adapter.hideSiteCaptions(false);
    },
  };
}
