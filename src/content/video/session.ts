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
import { documentCasing, textCasing } from "../../core/text/casing";
import { hostnameOf } from "../../core/url";
import { followPackStatus, pairNote } from "../../messaging/pack-status";
import {
  unsupportedPage,
  type PageSummary,
} from "../../messaging/page-protocol";
import type { SaveTermInput, SourceInput } from "../../messaging/protocol";
import {
  createExplainPanel,
  shownAnswer,
  type CorrectedPhrase,
  type ExplainTarget,
} from "../explain/panel";
import { videoPlace } from "../explain/place";
import {
  answerChoice,
  meaningRows,
  packSenses,
  rowChoice,
  type Choice,
  type TermCard,
} from "../lookup/describe";
import {
  createLookup,
  createMarkAll,
  sameTerm,
  type LookupDeps,
} from "../lookup/lookup";
import { newKeys, recategorized } from "../lookup/spans";
import { sendStatus } from "../lookup/status";
import { warn } from "../lookup/warn";
import { createStore } from "../store";
import type { TranslationPair } from "../translate/queue";
import { builtInTranslatorAvailable } from "../translate/translator";
import { cardRuns, splitRun } from "../../core/subtitles/runs";
import { captionCards, type TimedTranslation } from "./captions";
import { createCards } from "./cards";
import { holdPlayback } from "./hold";
import { followPlayback, playingAt } from "./playback";
import type { PlatformAdapter } from "./platform";
import { createRecorder } from "./recorder";
import { createSelection } from "./selection";
import { flatCue } from "./words";
import {
  freshState,
  type VideoApp,
  type VideoSession,
  type VideoState,
  type WordRef,
} from "./state";
import { createSummaries } from "../words/summaries";

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
  const flat = (text: string) => flatCue(text, lang());
  const explain = createExplainPanel({
    provider: deps.explainProvider,
    send: deps.send,
    settings: () => settings,
    show: (view) => store.set({ explain: view }),
    // Runs in the lookup's queue (`saveCorrectPhrase`).
    async savePhrase(phrase) {
      const w = watch;
      if (w) await saveCorrected(w, phrase);
    },
  });
  const cards = createCards({
    store,
    lookup,
    flat,
    onPanelOpen: deps.onPanelOpen,
    opened: (ref, card) => void explain.open(explainTarget(ref, card)),
    closed: explain.close,
  });

  /** What the on-device AI reads for the term at `ref`: its card and the cards around it. */
  function explainTarget(
    ref: WordRef,
    card: TermCard,
  ): ExplainTarget | undefined {
    const { cues, spans } = store.get();
    const place = videoPlace(cues, spans, ref, flat);
    const found = cards.spanOf(ref);
    if (!place || !found) return undefined;
    return {
      request: {
        input: {
          learning: lang(),
          native: settings.nativeLang,
          title: adapter.title(),
          written: found.surface,
          base: card.key,
          kind: card.kind,
          ...place,
          senses: packSenses(card),
          ...(ref.selected && { selected: true }),
        },
        key: card.key,
        sourceUrl: adapter.url(),
      },
      noEntry: card.senses.length === 0,
    };
  }

  /** What saving a term from the cue sends besides its key, status and kind. */
  function termInput(
    index: number,
    display: string,
    /** The cards' text for a phrase across cards (`acrossCards`). */
    sentence?: string,
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
      sentence: sentence ?? flat(cue.text),
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
    openWord: (ref) => cards.clickWord(ref),
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
   * Our subtitles replace the site's exactly while there are some and Langle is on
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

  /** Opens the page's video; `reload`: again, though its id is the same. */
  function open(reload = false) {
    const id = siteOn() ? (adapter.videoId() ?? null) : null;
    if (watch && watch.id === id && !reload) return;
    watch?.controller.abort();
    watch = undefined;
    lookup.setCasing(undefined);
    cards.dismissHover();
    selection.clear();
    explain.close();
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
    const controller = new AbortController();
    const summaries = createSummaries({
      send: deps.send,
      store,
      translator: lookup.translator,
      lang,
      nativeLang: () => settings.nativeLang,
      url: () => adapter.url(),
      active,
      waitFor: lookup.waitFor,
      signal: controller.signal,
    });
    const w: Watch = {
      id,
      controller,
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
      documentCasing(state.cues.map((cue) => textCasing(cue.text, lang()))),
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
      // A card whose sentence runs on is classified with the cards it runs on in.
      const texts = store.get().cues.map((cue) => cue.text);
      const runs = cardRuns(texts, batch);
      const result = await lookup.analyze(
        runs.map((run) => run.text),
        runs.map((run) => [...run.breaks]),
      );
      if (watch !== w) return;
      if (!result) break;
      for (const key of result.saved) saved.add(key);
      runs.forEach((run, i) => {
        for (const [cue, list] of splitRun(run, texts, result.spans[i] ?? []))
          found.set(cue, list);
      });
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

  const unsavedKeys = () => newKeys(store.get().spans);

  function recategorize(change: (span: Span) => Category | undefined) {
    let changed = false;
    const spans = store.get().spans.map((list) => {
      const next = list && recategorized(list, change);
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
    const sent = await sendStatus(deps.send, card, to, () =>
      saveInput(ref, card),
    );
    if (sent) await statusChanged(w, ref, card, to);
  }

  /** What saving the term at `ref` sends besides its status. */
  function saveInput(ref: WordRef, card: TermCard) {
    const found = cards.spanOf(ref);
    const input = found && termInput(ref.cue, found.surface, found.sentence);
    return input && { ...input, key: card.key, kind: card.kind };
  }

  /**
   * Chooses `choice.meaning` for the card `ref` is in, or undoes it when it is the one
   * chosen there. An unsaved term is saved as Learning.
   */
  async function chooseMeaning(
    w: Watch,
    ref: WordRef,
    card: TermCard,
    choice: Choice,
  ) {
    const term = saveInput(ref, card);
    if (!term) return;
    await deps.send({
      type: "chooseMeaning",
      term,
      meaning: choice.usedHere ? null : choice.meaning,
    });
    if (card.status === "new" && !choice.usedHere)
      await statusChanged(w, ref, card, "learning");
    else await cards.refresh(card);
    if (watch === w) w.summaries.meaningChosen(card.key);
  }

  /**
   * A corrected phrase of the window's selected words: saved as Learning from its card
   * (the selection itself stays unsaved), highlighted, and shown in the window.
   */
  async function saveCorrected(w: Watch, phrase: CorrectedPhrase) {
    const ref = store.get().panel?.ref;
    const input = ref && termInput(ref.cue, phrase.display);
    if (!ref || !input) return;
    const { key } = phrase;
    await deps.send({
      type: "saveTerm",
      ...input,
      key,
      kind: "phrase",
      status: "learning",
    });
    w.recorder.savedFrom(key, ref.cue);
    w.summaries.note([[key, "learning"]]);
    deps.onTermsChanged?.();
    // The phrase may be in any cue: classify again to highlight it.
    await analyzeAll(w);
    if (watch !== w) return;
    const span = store.get().spans[ref.cue]?.findIndex((s) => s.key === key);
    if (span !== undefined && span >= 0)
      cards.clickWord({ cue: ref.cue, span });
  }

  /** Chooses (or undoes) `pick`'s meaning of the window's term for its card. */
  function choose(pick: (card: TermCard) => Choice | undefined) {
    const panel = store.get().panel;
    const choice = panel && pick(panel.card);
    if (panel && choice)
      withWatch((w) => chooseMeaning(w, panel.ref, panel.card, choice));
  }

  /** The term at `ref` went from `card.status` to `to`: every line with it follows. */
  async function statusChanged(
    w: Watch,
    ref: WordRef,
    card: TermCard,
    to: WordStatus,
  ) {
    const { key } = card;
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

  /** Seeks to `ms` and plays, even when the video was paused. */
  const playFrom = (ms: number) => {
    adapter
      .seek(ms)
      .then(() => (adapter.video()?.paused ? adapter.play() : undefined))
      .catch(warn);
  };

  /** Sets one field of the state, only when it changes (nothing renders again otherwise). */
  const setIf = <K extends keyof VideoState>(key: K, value: VideoState[K]) => {
    if (store.get()[key] !== value)
      store.set({ [key]: value } as Partial<VideoState>);
  };

  const app: VideoApp = {
    store,
    setEnabled(on) {
      if (store.get().enabled === on) return;
      cards.dismissHover();
      selection.clear();
      if (!on) cards.closePanel();
      store.set({ enabled: on });
      if (settings.videoOn[platform] !== on)
        changeSettings({ videoOn: { [platform]: on } });
      const video = adapter.video();
      if (watch && video) update(watch, video);
    },
    seekToCue(index) {
      const cue = store.get().cues[index];
      // A card plays from its start, even when the video was paused.
      if (cue) playFrom(cue.startMs);
    },
    enterWord: (ref, anchor, from = "subtitle") =>
      cards.enterWord(ref, anchor, from),
    leaveWord: cards.leaveWord,
    keepHover: cards.keepHover,
    releaseHover: cards.releaseHover,
    dismissHover: cards.dismissHover,
    enterSubtitle: () => setIf("subtitleHover", true),
    leaveSubtitle: () => setIf("subtitleHover", false),
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
    snapWords: selection.snap,
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
    useMeaning(index) {
      choose((card) => {
        const answer = shownAnswer(store.get().explain);
        return rowChoice(meaningRows(card, answer)[index]);
      });
    },
    explainHere: explain.explain,
    downloadModel: explain.download,
    retryExplain: () => void explain.retry(),
    useAnswer() {
      const answer = shownAnswer(store.get().explain);
      if (answer) choose((card) => answerChoice(card, answer));
    },
    editCorrectPhrase: explain.editPhrase,
    cancelCorrectPhrase: explain.cancelPhrase,
    saveCorrectPhrase: (text) => run(() => explain.savePhrase(text)),
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
    setMenuOpen: (open) => setIf("menuOpen", open),
    setFullscreen(on) {
      if (store.get().fullscreen === on) return;
      cards.dismissHover();
      selection.clear();
      store.set({ fullscreen: on });
    },
    setPanelTab: (tab) => setIf("panelTab", tab),
    setWordsFilter: (filter) => setIf("wordsFilter", filter),
    setWordsSort: (sort) => setIf("wordsSort", sort),
    jumpToWord(id, { card, line, startMs }) {
      if (!store.get().cues[card]) return;
      store.set({ wordsJump: { id, card, line } });
      playFrom(startMs);
    },
    wordsShown(rows) {
      watch?.summaries.shown(rows);
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

  const offNavigate = adapter.onNavigate((change) => open(change?.reload));
  const unwatch = deps.watchSettings((next) => {
    const levelChanged = next.knownLevel !== settings.knownLevel;
    // The tracks (and the translation's source) are chosen for the language pair.
    const pairChanged =
      next.learningLang !== settings.learningLang ||
      next.nativeLang !== settings.nativeLang;
    const wasOn = siteOn();
    settings = next;
    store.set({ settings });
    if (pairChanged) {
      // The video's subtitles again, as on opening it.
      watch?.controller.abort();
      watch = undefined;
      open();
    }
    // Switched off for this site: give the page back; switched on: start.
    else if (siteOn() !== wasOn) open();
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
      explain.close();
      hold.stop();
      watch?.controller.abort();
      watch = undefined;
      offSiteCaptions();
      siteHidden = false;
      adapter.hideSiteCaptions(false);
    },
  };
}
