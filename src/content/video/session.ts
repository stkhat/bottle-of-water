import {
  sameSpans,
  type Category,
  type Span,
  type WordStatus,
} from "../../core/classify";
import type { DataNote } from "../../core/packs/state";
import {
  hostBlocked,
  mergeSettings,
  type SettingsPatch,
} from "../../core/settings";
import { joinerFor } from "../../core/subtitles/translation";
import { blockCasing, documentCasing } from "../../core/text/casing";
import { tokenize } from "../../core/text/tokenize";
import { hostnameOf } from "../../core/url";
import { followPackStatus, pairNote } from "../../messaging/pack-status";
import {
  unsupportedPage,
  type PageSummary,
} from "../../messaging/page-protocol";
import type { SaveTermInput, SourceInput } from "../../messaging/protocol";
import type { TermCard } from "../lookup/describe";
import {
  createLookup,
  createMarkAll,
  sameTerm,
  type LookupDeps,
} from "../lookup/lookup";
import { sendStatus } from "../lookup/status";
import { warn } from "../lookup/warn";
import { createStore } from "../store";
import type { TranslationPair } from "../translate/queue";
import { builtInTranslatorAvailable } from "../translate/translator";
import { captionCards, type TimedTranslation } from "./captions";
import { createCards } from "./cards";
import { holdPlayback } from "./hold";
import { followPlayback, playingAt } from "./playback";
import type { PlatformAdapter } from "./platform";
import { createRecorder } from "./recorder";
import { createSelection } from "./selection";
import {
  freshState,
  type VideoApp,
  type VideoSession,
  type VideoState,
  type WordRef,
} from "./state";
import { createSummaries } from "./summaries";

/** Cues classified per `analyze` request. */
const BATCH = 50;

export interface VideoDeps extends LookupDeps {
  adapter: PlatformAdapter;
  /** Default: asks the built-in translator. */
  translatorAvailable?(from: string, to: string): Promise<boolean>;
}

/** Per-video work, aborted when the user moves on. */
interface Watch {
  id: string;
  controller: AbortController;
  timed: TimedTranslation | null;
  recorder: ReturnType<typeof createRecorder>;
  summaries: ReturnType<typeof createSummaries>;
  marks: ReturnType<typeof createMarkAll>;
  /** Built-in translations of the cards, asked for as they play. */
  translations: Map<number, Promise<string | undefined>>;
  /** The video played to its end once (unsaved new words were handled). */
  endReached: boolean;
}

const sameNote = (a: DataNote | null, b: DataNote | null) =>
  a?.state === b?.state &&
  (a?.state !== "downloading" ||
    (b?.state === "downloading" && a.percent === b.percent));

/**
 * Runs the video UI's logic on a video site: per video, reads the subtitles through the
 * adapter, classifies them in batches, follows the playing cue, records saved words of
 * the lines that play, and offers save-all when the video ends. Starts over on every
 * navigation to another video. While the language data is not on the device, the cues
 * show unclassified with the download line, and are classified once the data is there.
 */
export async function startVideo(deps: VideoDeps): Promise<VideoSession> {
  const { adapter } = deps;
  const { platform } = adapter;
  let settings = await deps.send({ type: "getSettings" });
  const store = createStore<VideoState>(freshState(settings, null, false));
  let watch: Watch | undefined;
  /** The pair the built-in translator translates the subtitles in (source "builtIn"). */
  let subtitlePair: TranslationPair | undefined;
  const lang = () => settings.learningLang;
  const lookup = createLookup(deps, {
    settings: () => settings,
    lang,
    url: () => adapter.url(),
    // Classify again, which also asks the meanings that could not be read.
    packsReady: () => withWatch((w) => analyzeAll(w, true)),
  });
  const { run } = lookup;
  const data = followPackStatus(deps, (status) => {
    const dataNote = pairNote(status);
    if (!sameNote(dataNote, store.get().dataNote)) store.set({ dataNote });
  });

  const hostname = () => hostnameOf(adapter.url()) ?? "";
  const siteOn = () =>
    settings.sites[platform] !== false && !hostBlocked(hostname(), settings);
  const source = (): SourceInput => ({
    platform,
    url: adapter.url(),
    title: adapter.title(),
    lang: lang(),
  });
  const flat = (text: string) => text.split("\n").join(joinerFor(lang()));
  const cards = createCards({
    store,
    lookup,
    flat,
    onPanelOpen: deps.onPanelOpen,
  });

  /** What saving a term from the cue sends besides its key, status and kind. */
  function termInput(
    index: number,
    display: string,
  ): Omit<SaveTermInput, "status" | "key" | "kind"> | undefined {
    const { cues, translations, current, subtitleTranslation } = store.get();
    const cue = cues[index];
    if (!cue) return undefined;
    const translation =
      translations[index] || (current === index ? subtitleTranslation : "");
    return {
      lang: lang(),
      display,
      source: source(),
      sentence: flat(cue.text),
      ...(translation ? { translation } : {}),
      pos: { timeMs: cue.startMs },
    };
  }

  const selection = createSelection({
    send: deps.send,
    store,
    lookup,
    lang,
    flat,
    termInput,
    dismissHover: () => cards.dismissHover(),
    async saved(key, cue, status) {
      const w = watch;
      if (!w) return;
      w.recorder.savedFrom(key, cue);
      w.summaries.note([[key, status]]);
      deps.onTermsChanged?.();
      // The phrase may be in any cue: classify again to highlight it.
      await analyzeAll(w);
    },
  });

  const hold = holdPlayback({ store, adapter });

  /**
   * Our subtitles replace the site's exactly while there are some and Lingo is on
   * (fullscreen too): a video without captions, or the next one while it loads, shows the
   * site's own again.
   */
  let siteHidden = false;
  const offSiteCaptions = store.subscribe(() => {
    const { status, enabled } = store.get();
    const hidden = status === "ready" && enabled;
    if (hidden === siteHidden) return;
    siteHidden = hidden;
    adapter.hideSiteCaptions(hidden);
  });

  function open() {
    const id = siteOn() ? (adapter.videoId() ?? null) : null;
    if (watch && watch.id === id) return;
    watch?.controller.abort();
    watch = undefined;
    lookup.setCasing(undefined);
    cards.dismissHover();
    selection.clear();
    // The L button starts where it was left on this platform.
    store.set(
      freshState(
        settings,
        id,
        store.get().fullscreen,
        settings.videoOn[platform] !== false,
        store.get().dataNote,
      ),
    );
    hold.reset();
    if (!id) return;
    const active = () => watch === w;
    const recorder = createRecorder({
      send: deps.send,
      store,
      settings: () => settings,
      lang,
      flat,
      source,
      active,
      casing: () => lookup.casing,
    });
    const summaries = createSummaries({
      send: deps.send,
      store,
      lang,
      active,
      waitFor: lookup.waitFor,
    });
    const w: Watch = {
      id,
      controller: new AbortController(),
      timed: null,
      recorder,
      summaries,
      marks: createMarkAll({
        send: deps.send,
        lang,
        source,
        unsaved: () => (active() ? unsavedKeys() : []),
        async marked(keys, from, to) {
          if (!active()) return;
          for (const key of keys)
            if (to === "new") recorder.saved.delete(key);
            else recorder.saved.add(key);
          recategorize((s) =>
            s.category === from && keys.has(s.key) ? to : undefined,
          );
          summaries.note([...keys].map((key) => [key, to]));
          await cards.refreshOpen();
        },
      }),
      translations: new Map(),
      endReached: false,
    };
    watch = w;
    load(w).catch((error: unknown) => {
      warn(error);
      if (watch === w) store.set({ status: "unavailable" });
    });
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
    const { state, timed } = captionCards(captions);
    w.timed = timed;
    // The whole track is the document whose capitals tell names (rule D).
    lookup.setCasing(
      documentCasing(
        state.cues.map((cue) =>
          blockCasing(tokenize(cue.text, lang()), lang()),
        ),
      ),
    );
    store.set({ status: "ready", ...state });
    if (state.translationSource === "builtIn")
      subtitlePair = { from: lang(), to: settings.nativeLang };
    followPlayback(
      adapter,
      signal,
      (video) => update(w, video),
      () => {
        if (adapter.adShowing() || w.endReached) return;
        w.endReached = true;
        if (settings.unsavedAtEnd === "known") run(w.marks.markKnown);
      },
      () => {
        if (watch === w) selection.played();
      },
    ).catch(warn);
    await analyzeAll(w, true);
  }

  function update(w: Watch, video: HTMLVideoElement) {
    if (watch !== w) return;
    const state = store.get();
    const following = state.enabled && !adapter.adShowing();
    const now = playingAt(state, video.currentTime * 1000, following, w.timed);
    if (
      now.line !== state.line ||
      now.card !== state.card ||
      now.subtitleTranslation !== state.subtitleTranslation
    ) {
      if (now.line !== state.line) {
        cards.lineChanged();
        selection.lineChanged();
      }
      store.set(now);
    }
    if (now.current >= 0 && w.recorder.play(now.current))
      void played(w, now.current).catch(warn);
  }

  /**
   * A card played for the first time: translate it if needed, record its saved words
   * and keep it in the sentence history.
   */
  async function played(w: Watch, index: number) {
    const from = source();
    if (store.get().translationSource === "builtIn")
      await translateCard(w, index);
    w.recorder.encounters([index]);
    w.recorder.history(index, from);
  }

  function translateCard(w: Watch, index: number) {
    let pending = w.translations.get(index);
    if (!pending) {
      const cue = store.get().cues[index];
      pending =
        cue && subtitlePair
          ? lookup.translator.translate(
              flat(cue.text),
              "subtitle",
              subtitlePair,
            )
          : Promise.resolve(undefined);
      w.translations.set(index, pending);
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

  /**
   * Classifies every cue: batch by batch as the answers come (`progressive`, the first
   * classification, so the first cards show their highlights early), else all of them
   * shown at once.
   */
  async function analyzeAll(w: Watch, progressive = false) {
    const all = store.get().cues.map((_, i) => i);
    if (!progressive) return analyze(w, all);
    for (let from = 0; from < all.length; from += BATCH) {
      if (watch !== w) return;
      await analyze(w, all.slice(from, from + BATCH));
    }
  }

  /**
   * Classifies the cues at `indices` (a request per batch) and shows them at once: only
   * the cues whose spans changed get new ones. While language data is missing (or once
   * a request finds it missing), the cues not classified yet stay as they are until it
   * is there.
   */
  async function analyze(w: Watch, indices: number[]) {
    const found = new Map<number, Span[]>();
    const saved = new Set<string>();
    for (let from = 0; from < indices.length; from += BATCH) {
      const batch = indices.slice(from, from + BATCH);
      const all = store.get().cues;
      const result = await lookup.analyze(batch.map((i) => all[i]!.text));
      if (watch !== w) return;
      if (!result) break;
      for (const key of result.saved) saved.add(key);
      batch.forEach((cue, i) => found.set(cue, result.spans[i] ?? []));
    }
    if (found.size === 0) return;
    for (const key of saved) w.recorder.saved.add(key);
    const before = store.get().spans;
    let spans: (Span[] | null)[] | undefined;
    for (const [cue, list] of found) {
      if (sameSpans(before[cue], list)) continue;
      spans ??= [...before];
      spans[cue] = list;
    }
    if (spans) store.set({ spans });
    w.recorder.encounters([...found.keys()]);
    w.summaries.classified([...found.values()].flat(), saved);
  }

  function unsavedKeys(): string[] {
    const keys = new Set<string>();
    for (const list of store.get().spans)
      for (const span of list ?? [])
        if (span.category === "new") keys.add(span.key);
    return [...keys];
  }

  function recategorize(change: (span: Span) => Category | undefined) {
    let changed = false;
    const spans = store.get().spans.map((list) => {
      if (!list) return list;
      let next: Span[] | undefined;
      list.forEach((span, i) => {
        const category = change(span);
        if (category === undefined || category === span.category) return;
        next ??= [...list];
        next[i] = { ...span, category };
      });
      // A cue without a change keeps its spans: its card does not render again.
      if (!next) return list;
      changed = true;
      return next;
    });
    if (changed) store.set({ spans });
  }

  /** Saves, changes or removes the term at `ref`; every line with it follows. */
  async function changeStatus(
    w: Watch,
    ref: WordRef,
    card: TermCard,
    to: WordStatus,
  ) {
    const { key } = card;
    const sent = await sendStatus(deps.send, card, to, () => {
      const found = cards.spanOf(ref);
      const input = found && termInput(ref.cue, found.surface);
      return input && { ...input, key, kind: card.kind };
    });
    if (!sent) return;
    if (to === "new") {
      w.recorder.saved.delete(key);
      // Unsaved, each occurrence is new or known again by the level.
      await analyze(
        w,
        cards.linesWith(card).map((l) => l.cue),
      );
    } else {
      if (card.status === "new") w.recorder.savedFrom(key, ref.cue);
      if (watch !== w) return;
      w.summaries.note([[key, to]]);
      // Selected words' phrase may be in any cue: classify again to find it.
      if (card.status === "new" && ref.selected) await analyzeAll(w);
      else recategorize((s) => (sameTerm(s, card) ? to : undefined));
    }
    deps.onTermsChanged?.();
    await cards.refresh(card);
  }

  function changeSettings(patch: SettingsPatch) {
    settings = mergeSettings(patch, settings);
    store.set({ settings });
    run(() => deps.send({ type: "setSettings", patch }));
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
      cards.dismissHover();
      selection.clear();
      store.set({ enabled: on, ...(!on && { panel: null }) });
      if (settings.videoOn[platform] !== on)
        changeSettings({ videoOn: { [platform]: on } });
      const video = adapter.video();
      if (watch && video) update(watch, video);
    },
    seekToCue(index) {
      const cue = store.get().cues[index];
      if (!cue) return;
      // A card plays from its start, even when the video was paused.
      adapter
        .seek(cue.startMs)
        .then(() => (adapter.video()?.paused ? adapter.play() : undefined))
        .catch(warn);
    },
    enterWord: (ref, anchor, from = "subtitle") =>
      cards.enterWord(ref, anchor, from),
    leaveWord: cards.leaveWord,
    keepHover: cards.keepHover,
    releaseHover: cards.releaseHover,
    dismissHover: cards.dismissHover,
    enterSubtitle() {
      if (!store.get().subtitleHover) store.set({ subtitleHover: true });
    },
    leaveSubtitle() {
      if (store.get().subtitleHover) store.set({ subtitleHover: false });
    },
    clickWord: cards.clickWord,
    setHoverStatus(status) {
      const shown = store.get().hover;
      if (shown)
        withWatch((w) => changeStatus(w, shown.ref, shown.card, status));
    },
    openHoverDetails() {
      const shown = store.get().hover;
      if (shown) cards.clickWord(shown.ref);
    },
    selectStart: selection.start,
    selectWords: selection.select,
    saveSelection(status) {
      const task = selection.saveTask(status);
      if (task) run(task);
    },
    openSelectionDetails() {
      const ref = selection.takeForDetails();
      if (ref) cards.clickWord(ref);
    },
    clearSelection: selection.clear,
    setPanelStatus(status) {
      const panel = store.get().panel;
      if (panel)
        withWatch((w) => changeStatus(w, panel.ref, panel.card, status));
    },
    speak: () => lookup.speak(store.get().panel?.card.head),
    closePanel: cards.closePanel,
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
      cards.dismissHover();
      selection.clear();
      store.set({ fullscreen: on });
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

  const summary = (): PageSummary =>
    store.get().status === "ready"
      ? {
          supported: true,
          hostname: hostname(),
          scope: "video",
          unsaved: unsavedKeys().length,
          done: watch?.marks.done() ?? null,
        }
      : unsupportedPage(hostname(), "video");

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
    handlePageRequest(request) {
      const marks = watch?.marks;
      return lookup.answer(request, {
        saveAll: async (status) => marks?.saveAll(status),
        undoSaveAll: async () => marks?.undoSaveAll(),
        summary,
      });
    },
    async reanalyze() {
      const w = watch;
      if (w) await analyzeAll(w);
    },
    stop() {
      offNavigate();
      unwatch();
      lookup.stop();
      data.stop();
      cards.dismissHover();
      selection.clear();
      hold.stop();
      watch?.controller.abort();
      watch = undefined;
      offSiteCaptions();
      siteHidden = false;
      adapter.hideSiteCaptions(false);
    },
  };
}
