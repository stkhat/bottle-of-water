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
  sentenceCards,
  type SubtitleLine,
} from "../../core/subtitles/cues";
import { alignAsrSentences, asrSentenceCards } from "../../core/subtitles/asr";
import {
  alignByOverlap,
  joinerFor,
  type TranslationChoice,
} from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import { speechLang } from "../../core/languages";
import type { DataNote, PackStates } from "../../core/packs/state";
import { PacksUnavailableError } from "../../core/packs/unavailable";
import { termId } from "../../core/term-id";
import type { send } from "../../messaging/client";
import { followPackStatus, pairNote } from "../../messaging/pack-status";
import type { AnalyzeResult, TermBrief } from "../../messaging/protocol";
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
import {
  describeTerm,
  translateSenses,
  type TermCard,
} from "../article/describe";
import type { Box } from "../article/geometry";
import { hostBlocked } from "../article/should-run";
import {
  createTranslationQueue,
  type TranslationPair,
} from "../translate/queue";
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  type TranslationProvider,
} from "../translate/translator";
import { createStore, type Store } from "../ui/store";
import { createPackWait } from "../pack-wait";
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
  /**
   * Calls `listener` with the background's pack states now and after every change
   * (`watchPackState`); returns an unsubscribe.
   */
  watchPackState(listener: (states: PackStates) => void): () => void;
  /** Default: the browser's built-in translator. */
  createTranslator?(from: string, to: string): TranslationProvider;
  /** Default: asks the built-in translator. */
  translatorAvailable?(from: string, to: string): Promise<boolean>;
  /** How long the pointer rests on a word before its card shows (ms). */
  hoverDelayMs?: number;
}

/** Where a hovered word is shown. */
export type WordPlace = "subtitle" | "transcript";

/** A term in the subtitles: the cue and the index of its span in that cue's spans. */
export interface WordRef {
  cue: number;
  span: number;
}

/** The hover card over a word in the subtitle or the transcript. */
export interface VideoHover {
  ref: WordRef;
  /** Where the word is: a card over a transcript word goes when the list scrolls. */
  from: WordPlace;
  /** The word's box in the viewport. */
  anchor: Box;
  card: TermCard;
}

/** Where the term is in a line of "In this video" (each part of a phrase with a gap). */
export interface LineMark {
  start: number;
  end: number;
  category: Exclude<Span["category"], "ignored">;
}

/** A line of the video with the term, for the window's "In this video". */
export interface VideoLine {
  cue: number;
  timeMs: number;
  text: string;
  marks: LineMark[];
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
  /**
   * The chosen pair's language data while some of it is not on the device: the line at
   * the top of the right column. Null once it is all there.
   */
  dataNote: DataNote | null;
}

/** The UI's view of the video: its state and what its controls do. */
export interface VideoApp {
  readonly store: Store<VideoState>;
  /** The L button: Lingo on or off for this video. */
  setEnabled(on: boolean): void;
  /** A transcript card was clicked. */
  seekToCue(index: number): void;
  /** The pointer entered a word of the subtitle or the transcript (its box in the viewport). */
  enterWord(ref: WordRef, anchor: Box, from?: WordPlace): void;
  /** The pointer left the word. */
  leaveWord(): void;
  /** The pointer entered the hover card: keep it. */
  keepHover(): void;
  /** The pointer left the hover card: hide it soon. */
  releaseHover(): void;
  /** Hides the hover card now. */
  dismissHover(): void;
  /** A word of the subtitle or the transcript was clicked: its dictionary window opens. */
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
  /**
   * A menu slider being dragged: the UI shows `patch` without saving it. The next
   * `changeSettings` (the slider let go) or settings change replaces it.
   */
  previewSettings(patch: SettingsPatch): void;
  /** The menu's gear. */
  openSettings(): void;
  setMenuOpen(open: boolean): void;
  setFullscreen(on: boolean): void;
  setPanelTab(tab: PanelTab): void;
  setWordsFilter(filter: WordsFilter): void;
  /** A row of the Words tab was selected: its dictionary window opens at its first occurrence. */
  openWord(row: Pick<VideoWord, "first">): void;
  /** The download line's Retry: the background tries the language data again. */
  retryPacks(): void;
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
  /** The popup's last "Mark all as …" on this video, until it is undone. */
  lastBatch?: {
    batchId: string;
    keys: ReadonlySet<string>;
    status: TermStatus;
    count: number;
  };
}

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

/**
 * Reports a failure in the console. Neither a stopped video nor language data that is
 * not on the device yet is one: the video waits for its data, and the download line
 * shows it.
 */
function warn(error: unknown) {
  if (!isAbort(error) && !(error instanceof PacksUnavailableError))
    console.warn("Lingo:", error);
}

function fresh(
  settings: Settings,
  videoId: string | null,
  fullscreen: boolean,
  enabled = true,
  dataNote: DataNote | null = null,
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
    dataNote,
  };
}

const sameTerm = (span: Span, key: string, kind: TermKind) =>
  span.key === key && span.kind === kind;

/**
 * Runs the video UI's logic on a video site: per video, reads the subtitles through the
 * adapter, classifies them in batches, follows the playing cue, records saved words of
 * the lines that play, and offers save-all when the video ends. Starts over on every
 * navigation to another video. While the language data is not on the device, the cues
 * show unclassified with the download line, and are classified once the data is there.
 */
export async function startVideo(deps: VideoDeps): Promise<VideoSession> {
  const { adapter } = deps;
  let settings = await deps.send({ type: "getSettings" });
  const store = createStore<VideoState>(fresh(settings, null, false));
  let watch: Watch | undefined;
  /** The subtitles, the hover card and the window translate through it, in that order. */
  const translator = createTranslationQueue(
    deps.createTranslator ?? createBuiltInTranslator,
  );
  /** The pair the built-in translator translates the subtitles in (source "builtIn"). */
  let subtitlePair: TranslationPair | undefined;
  let warmed = false;
  /** The cues wait for language data a request did not find on the device. */
  let analysisWaits = false;
  const packs = createPackWait(deps.watchPackState, () => {
    analysisWaits = false;
    // Classify again, which also asks the meanings that could not be read.
    withWatch(analyzeAll);
  });
  const data = followPackStatus(deps, (status) => {
    const dataNote = pairNote(status);
    const shown = store.get().dataNote;
    if (JSON.stringify(dataNote) !== JSON.stringify(shown))
      store.set({ dataNote });
  });

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
        store.get().dataNote,
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
    const { translation } = captions;
    const site =
      translation.source === "siteTrack" ||
      translation.source === "siteAutoTranslate";
    // YouTube translates an auto-generated track sentence by sentence: follow its sentences.
    const aligned =
      asr && translation.source === "siteAutoTranslate"
        ? alignAsrSentences(captions.cues, translation.cues, {
            joiner,
            lang: captions.track.lang,
            translationJoiner: joinerFor(translation.lang),
          })
        : undefined;
    const { cards: cues, lines } =
      aligned ??
      (asr
        ? asrSentenceCards(captions.cues, {
            joiner,
            lang: captions.track.lang,
          })
        : sentenceCards(captions.cues, { joiner }));
    // Merged sentences no longer match the fragments' timing: show the aligned text.
    w.timedTranslation = site && !asr ? translation.cues : null;
    w.translationJoiner = joinerFor(translation.lang);
    store.set({
      status: "ready",
      cues,
      lines,
      spans: cues.map(() => null),
      translationSource: translation.source,
      translations:
        aligned?.translations ??
        (site
          ? alignByOverlap(cues, translation.cues, { lang: translation.lang })
          : cues.map(() => "")),
    });
    if (translation.source === "builtIn")
      subtitlePair = { from: lang(), to: settings.nativeLang };
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
        cue && subtitlePair
          ? translator.translate(flat(cue.text), "subtitle", subtitlePair)
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

  /**
   * Classifies the cues at `indices` (one request). While language data is missing (or
   * once the request finds it missing), they stay unclassified until it is there.
   */
  async function analyze(w: Watch, indices: number[]) {
    if (indices.length === 0 || analysisWaits) return;
    const all = store.get().cues;
    let result: AnalyzeResult;
    try {
      result = await deps.send({
        type: "analyze",
        lang: lang(),
        blocks: indices.map((i) => all[i]!.text),
      });
    } catch (error) {
      if (!(error instanceof PacksUnavailableError)) throw error;
      analysisWaits = true;
      packs.add(error.packs);
      return;
    }
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
        // Asked again with the next batch, or once the dictionary's data is there.
        for (const { key } of terms) w.asked.delete(key);
        if (error instanceof PacksUnavailableError) packs.add(error.packs);
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

  /** Saves every unsaved new word of the video with the status, as one batch. */
  async function saveUnsaved(w: Watch, status: TermStatus) {
    if (watch !== w) return undefined;
    const keys = unsavedKeys();
    if (keys.length === 0) return undefined;
    const result = await deps.send({
      type: "saveAll",
      lang: lang(),
      keys,
      status,
      source: source(),
    });
    if (watch !== w) return undefined;
    const saved = new Set(keys);
    for (const key of keys) w.saved.add(key);
    recategorize(w, (s) =>
      s.category === "new" && saved.has(s.key) ? status : undefined,
    );
    noteStatuses(
      w,
      keys.map((key) => [key, status]),
    );
    await refreshOpenCards();
    return { ...result, keys: saved };
  }

  /** Saves every unsaved new word of the video as Known (Settings `unsavedAtEnd`). */
  async function markUnsavedKnown(w: Watch) {
    await saveUnsaved(w, "known");
  }

  /** The popup's "Mark all as Learning / Known". */
  async function saveAll(w: Watch, status: TermStatus) {
    const result = await saveUnsaved(w, status);
    if (result) w.lastBatch = { ...result, status };
  }

  async function undoSaveAll(w: Watch) {
    const batch = w.lastBatch;
    if (!batch) return;
    await deps.send({ type: "undoSaveAll", batchId: batch.batchId });
    w.lastBatch = undefined;
    if (watch !== w) return;
    for (const key of batch.keys) w.saved.delete(key);
    // Those words were new before; the ones changed since stay as they are.
    recategorize(w, (s) =>
      s.category === batch.status && batch.keys.has(s.key) ? "new" : undefined,
    );
    noteStatuses(
      w,
      [...batch.keys].map((key) => [key, "new"]),
    );
    await refreshOpenCards();
  }

  // Words: the hover card and the dictionary window.
  const translation = () => ({
    send: deps.send,
    lang: lang(),
    nativeLang: settings.nativeLang,
    translator,
  });

  /**
   * The span `ref` points at, with its term as written (the whole phrase for a part of
   * a phrase with a gap).
   */
  function spanOf(ref: WordRef) {
    const { cues, spans } = store.get();
    const cue = cues[ref.cue];
    const span = spans[ref.cue]?.[ref.span];
    if (!cue || !span) return undefined;
    const { start, end } = span.part ?? span;
    return { cue, span, surface: flat(cue.text.slice(start, end)) };
  }

  async function describe(
    ref: WordRef,
    shownIn: "hover" | "window" = "hover",
  ): Promise<TermCard | undefined> {
    const found = spanOf(ref);
    if (!found) return undefined;
    return describeTerm(
      {
        key: found.span.key,
        kind: found.span.kind,
        surface: found.surface,
        category: found.span.category,
      },
      { ...translation(), sourceUrl: adapter.url(), shownIn },
    );
  }

  /** Every line with the term, in order. */
  function linesWith(key: string, kind: TermKind): VideoLine[] {
    const { cues, spans } = store.get();
    const lines: VideoLine[] = [];
    spans.forEach((list, cue) => {
      const raw = cues[cue]!.text;
      // Offsets in the flattened text (a line break may become nothing).
      const at = (i: number) => flat(raw.slice(0, i)).length;
      const marks = (list ?? []).flatMap((span) =>
        sameTerm(span, key, kind) && span.category !== "ignored"
          ? [
              {
                start: at(span.start),
                end: at(span.end),
                category: span.category,
              },
            ]
          : [],
      );
      if (marks.length === 0) return;
      lines.push({ cue, timeMs: cues[cue]!.startMs, text: flat(raw), marks });
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
        // The same word in the subtitle and the transcript are two targets.
        const [from, cue, span] = id.split(":") as [WordPlace, string, string];
        const ref = { cue: Number(cue), span: Number(span) };
        const anchor = pendingAnchor;
        const ticket = ++hoverTicket;
        void describe(ref)
          .then((card) => {
            if (ticket !== hoverTicket || !card || !anchor) return;
            store.set({ hover: { ref, from, anchor, card } });
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
    const card = await describe(ref, "window");
    if (ticket !== panelTicket || !card) return;
    if (!store.get().panel) opened++;
    showPanel(ref, card, opened);
  }

  /**
   * Shows the window's card, then its English definitions translated as they come (the
   * click that opened it lets the translator download its model the first time).
   */
  function showPanel(ref: WordRef, card: TermCard, times: number) {
    store.set({ panel: panelState(ref, card, times) });
    void translateSenses(card, translation())
      .then((translated) => {
        const panel = store.get().panel;
        if (translated !== card && panel?.card === card)
          store.set({ panel: { ...panel, card: translated } });
      })
      .catch(warn);
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
      const card = await describe(panel.ref, "window");
      if (card && ticket === panelTicket && store.get().panel)
        showPanel(panel.ref, card, panel.opened);
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
    enterWord(ref, anchor, from = "subtitle") {
      pendingAnchor = anchor;
      hover.enter(`${from}:${ref.cue}:${ref.span}`);
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
    dismissHover: () => hover.cancel(),
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
    previewSettings(patch) {
      store.set({ settings: mergeSettings(patch, settings) });
    },
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
    retryPacks() {
      deps.send({ type: "retryPacks" }).catch(warn);
    },
  };

  const summary = (): PageSummary => {
    const state = store.get();
    if (state.status !== "ready") return unsupportedPage(hostname(), "video");
    const batch = watch?.lastBatch;
    return {
      supported: true,
      hostname: hostname(),
      scope: "video",
      unsaved: unsavedKeys().length,
      done: batch ? { count: batch.count, target: batch.status } : null,
    };
  };

  const offNavigate = adapter.onNavigate(open);
  const unwatch = deps.watchSettings((next) => {
    const levelChanged = next.knownLevel !== settings.knownLevel;
    const wasOn = siteOn();
    if (
      next.learningLang !== settings.learningLang ||
      next.nativeLang !== settings.nativeLang
    )
      data.refresh();
    settings = next;
    store.set({ settings });
    // Switched off for this site: give the page back; switched on: start.
    if (siteOn() !== wasOn) open();
    else if (levelChanged) withWatch(analyzeAll);
  });
  open();

  return {
    app,
    handlePageRequest(request) {
      if (request.type === "pageSaveAll")
        withWatch((w) => saveAll(w, request.status));
      else if (request.type === "pageUndo") withWatch(undoSaveAll);
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
      packs.stop();
      data.stop();
      hover.cancel();
      close();
      adapter.hideSiteCaptions(false);
    },
  };
}
