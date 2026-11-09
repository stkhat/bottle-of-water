import type { SourceInput } from "../../background/term-store";
import type { Category, Span, TermStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import {
  cueAt,
  cueIndexAt,
  mergeAsrFragments,
} from "../../core/subtitles/cues";
import {
  alignByOverlap,
  joinerFor,
  type TranslationChoice,
} from "../../core/subtitles/translation";
import type { Cue } from "../../core/subtitles/types";
import { termId } from "../../core/term-id";
import type { send } from "../../messaging/client";
import type { PageSummary } from "../../messaging/page-protocol";
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  type TranslationProvider,
} from "../article/translate";
import { createStore, type Store } from "../ui/store";
import type { PlatformAdapter } from "./platform";

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
}

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
  /** The original subtitles (auto-generated ones merged into sentences). */
  cues: Cue[];
  /** Spans of each cue's text; null until the cue is classified. */
  spans: (Span[] | null)[];
  translationSource: TranslationChoice["source"];
  /** The translation of each cue, for the transcript ("" when none). */
  translations: string[];
  /** The cue playing; -1 between cues, during ads and while off. */
  current: number;
  /** The translation the subtitle shows at the playing time. */
  subtitleTranslation: string;
  /** Distinct unsaved new words in the whole video (classified so far). */
  unsaved: number;
  /** The last save-all, until it is undone. */
  done: PageSummary["done"];
  /** The "Video finished" card. */
  endCard: boolean;
}

/** The UI's view of the video: its state and what its controls do. */
export interface VideoApp {
  readonly store: Store<VideoState>;
  /** The L button: Lingo on or off for this video. */
  setEnabled(on: boolean): void;
  /** A transcript card was clicked. */
  seekToCue(index: number): void;
  /** Saves every unsaved new word of the video. */
  saveAll(status: TermStatus): void;
  undoSaveAll(): void;
  closeEndCard(): void;
}

export interface VideoSession {
  readonly app: VideoApp;
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
  stopTracking?: () => void;
  played: Set<number>;
  /** "key\ncue index" already recorded. */
  recorded: Set<string>;
  saved: Set<string>;
  pendingTranslations: Map<number, Promise<string | undefined>>;
  endReached: boolean;
  endClosed: boolean;
  lastBatch?: {
    batchId: string;
    keys: ReadonlySet<string>;
    status: TermStatus;
  };
}

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

function warn(error: unknown) {
  if (!isAbort(error)) console.warn("Lingo:", error);
}

function fresh(settings: Settings, videoId: string | null): VideoState {
  return {
    settings,
    videoId,
    status: videoId ? "loading" : "idle",
    enabled: true,
    cues: [],
    spans: [],
    translationSource: "none",
    translations: [],
    current: -1,
    subtitleTranslation: "",
    unsaved: 0,
    done: null,
    endCard: false,
  };
}

/**
 * Runs the video UI's logic on a video site: per video, reads the subtitles through the
 * adapter, classifies them in batches, follows the playing cue, records saved words of
 * the lines that play, and offers save-all when the video ends. Starts over on every
 * navigation to another video.
 */
export async function startVideo(deps: VideoDeps): Promise<VideoSession> {
  const { adapter } = deps;
  let settings = await deps.send({ type: "getSettings" });
  const store = createStore<VideoState>(fresh(settings, null));
  let watch: Watch | undefined;
  let translator: TranslationProvider | undefined;
  let warmed = false;

  const lang = () => settings.learningLang;
  const siteOn = () =>
    settings.sites[adapter.platform as "youtube" | "netflix"] !== false;

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
    store.set(fresh(settings, id));
    if (!id) {
      adapter.hideSiteCaptions(false);
      return;
    }
    const w: Watch = {
      id,
      controller: new AbortController(),
      timedTranslation: null,
      played: new Set(),
      recorded: new Set(),
      saved: new Set(),
      pendingTranslations: new Map(),
      endReached: false,
      endClosed: false,
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
    const cues = asr
      ? mergeAsrFragments(captions.cues, {
          joiner: joinerFor(captions.track.lang),
        })
      : captions.cues;
    const { translation } = captions;
    const site =
      translation.source === "siteTrack" ||
      translation.source === "siteAutoTranslate";
    // Merged sentences no longer match the fragments' timing: show the aligned text.
    w.timedTranslation = site && !asr ? translation.cues : null;
    store.set({
      status: "ready",
      cues,
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
      if (adapter.adShowing() || watch !== w) return;
      w.endReached = true;
      updateCounts(w);
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
    const current = following ? cueIndexAt(state.cues, ms) : -1;
    let subtitleTranslation = "";
    if (following)
      subtitleTranslation = w.timedTranslation
        ? flat(cueAt(w.timedTranslation, ms)?.text ?? "")
        : current >= 0
          ? (state.translations[current] ?? "")
          : "";
    if (
      current !== state.current ||
      subtitleTranslation !== state.subtitleTranslation
    )
      store.set({ current, subtitleTranslation });
    if (current >= 0 && !w.played.has(current)) {
      w.played.add(current);
      void played(w, current).catch(warn);
    }
  }

  /** A cue played for the first time: translate it if needed, record its saved words. */
  async function played(w: Watch, index: number) {
    if (store.get().translationSource === "builtIn")
      await translateCue(w, index);
    recordEncounters(w, [index]);
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
      await analyze(w, from, Math.min(count, from + BATCH));
    }
  }

  async function analyze(w: Watch, from: number, to: number) {
    const cues = store.get().cues.slice(from, to);
    const result = await deps.send({
      type: "analyze",
      lang: lang(),
      blocks: cues.map((c) => c.text),
    });
    if (!warmed) {
      // Load the dictionary now so the first lookup does not wait for it.
      warmed = true;
      deps.send({ type: "warmDictionary", lang: lang() }).catch(warn);
    }
    if (watch !== w) return;
    for (const key of result.saved) w.saved.add(key);
    const spans = [...store.get().spans];
    cues.forEach((_, i) => {
      spans[from + i] = result.spans[i] ?? [];
    });
    store.set({ spans });
    updateCounts(w);
    const playedHere = [];
    for (let i = from; i < to; i++) if (w.played.has(i)) playedHere.push(i);
    recordEncounters(w, playedHere);
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

  function updateCounts(w: Watch) {
    const unsaved = unsavedKeys().length;
    const state = store.get();
    const endCard =
      state.endCard ||
      (w.endReached &&
        !w.endClosed &&
        settings.offerSaveAllAtEnd &&
        unsaved > 0);
    if (unsaved !== state.unsaved || endCard !== state.endCard)
      store.set({ unsaved, endCard });
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
    updateCounts(w);
  }

  async function saveAll(w: Watch, status: TermStatus) {
    const keys = unsavedKeys();
    if (keys.length === 0) return;
    const { batchId, count } = await deps.send({
      type: "saveAll",
      lang: lang(),
      keys,
      status,
      source: source(),
    });
    if (watch !== w) return;
    const saved = new Set(keys);
    for (const key of keys) w.saved.add(key);
    w.lastBatch = { batchId, keys: saved, status };
    recategorize(w, (s) =>
      s.category === "new" && saved.has(s.key) ? status : undefined,
    );
    store.set({ done: { count, target: status } });
  }

  async function undoSaveAll(w: Watch) {
    const batch = w.lastBatch;
    if (!batch) return;
    await deps.send({ type: "undoSaveAll", batchId: batch.batchId });
    w.lastBatch = undefined;
    if (watch !== w) return;
    for (const key of batch.keys) w.saved.delete(key);
    recategorize(w, (s) =>
      s.category === batch.status && batch.keys.has(s.key) ? "new" : undefined,
    );
    store.set({ done: null });
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
      store.set({ enabled: on });
      if (store.get().status === "ready") adapter.hideSiteCaptions(on);
      const video = adapter.video();
      if (watch && video) update(watch, video);
    },
    seekToCue(index) {
      const cue = store.get().cues[index];
      if (cue) adapter.seek(cue.startMs).catch(warn);
    },
    saveAll: (status) => withWatch((w) => saveAll(w, status)),
    undoSaveAll: () => withWatch(undoSaveAll),
    closeEndCard() {
      if (watch) watch.endClosed = true;
      store.set({ endCard: false });
    },
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
    async reanalyze() {
      const w = watch;
      if (w) await analyzeAll(w);
    },
    stop() {
      offNavigate();
      unwatch();
      close();
      adapter.hideSiteCaptions(false);
    },
  };
}
