import { progressShare } from "../download-progress";

/** A model download as this page sees it: its share (0–1) once the browser reports one. */
export interface ModelDownload {
  share?: number;
}

export interface TranslationProvider {
  /**
   * Gets the translator ready, which may mean downloading its model (not with
   * `download: false`): true once it can translate, false when it cannot (now).
   * Without it, the provider is always ready.
   */
  open?(options?: { download?: boolean }): Promise<boolean>;
  /** Undefined when no translation is available. */
  translate(text: string): Promise<string | undefined>;
  /**
   * Calls `listener` with the model's download while the model is still to come (to be
   * downloaded or downloading), with its share as it is reported, and with undefined
   * when it is not; returns an unsubscribe. Without it, no download is ever shown.
   */
  watchDownload?(
    listener: (download: ModelDownload | undefined) => void,
  ): () => void;
}

interface TranslatorPair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface BuiltInTranslator {
  translate(text: string): Promise<string>;
  destroy?(): void;
}

/** The parts of the global scope the built-in translator needs (the Translator API). */
export interface TranslatorGlobal {
  Translator?: {
    availability(pair: TranslatorPair): Promise<string>;
    create(
      options: TranslatorPair & { monitor?(monitor: EventTarget): void },
    ): Promise<BuiltInTranslator>;
  };
  navigator?: { userActivation?: { isActive: boolean } };
}

/** The availability values of a model still to come. */
const COMING = new Set(["downloadable", "downloading"]);

const pairKey = (pair: TranslatorPair) =>
  `${pair.sourceLanguage}>${pair.targetLanguage}`;

type ShareListener = (share: number) => void;

/** The download shares each global's `create()` monitors reported, by pair. */
const progress = new WeakMap<
  object,
  { shares: Map<string, number>; listeners: Map<string, Set<ShareListener>> }
>();

function progressOf(g: TranslatorGlobal) {
  let found = progress.get(g);
  if (!found) {
    found = { shares: new Map(), listeners: new Map() };
    progress.set(g, found);
  }
  return found;
}

/**
 * The `create()` option that reports the pair's download to `watchDownload`, whoever
 * started it in this page (the dictionary window's click, the page's first click).
 */
function monitorFor(g: TranslatorGlobal, pair: TranslatorPair) {
  const key = pairKey(pair);
  return (monitor: EventTarget) => {
    monitor.addEventListener("downloadprogress", (event) => {
      const { shares, listeners } = progressOf(g);
      const share = progressShare(event);
      shares.set(key, share);
      for (const listener of [...(listeners.get(key) ?? [])]) listener(share);
    });
  };
}

function watchDownload(
  g: TranslatorGlobal,
  pair: TranslatorPair,
  listener: (download: ModelDownload | undefined) => void,
): () => void {
  const api = g.Translator;
  if (!api) return () => {};
  const key = pairKey(pair);
  const { shares, listeners } = progressOf(g);
  let stopped = false;
  let reported = false;
  const onShare: ShareListener = (share) => {
    reported = true;
    listener({ share });
  };
  const own = listeners.get(key) ?? new Set();
  own.add(onShare);
  listeners.set(key, own);
  api.availability(pair).then(
    (availability) => {
      if (stopped || reported) return;
      const share = shares.get(key);
      listener(
        COMING.has(availability)
          ? share === undefined
            ? {}
            : { share }
          : undefined,
      );
    },
    () => {
      if (!stopped && !reported) listener(undefined);
    },
  );
  return () => {
    stopped = true;
    own.delete(onShare);
  };
}

/**
 * The browser's built-in translator (Translator API). Nothing is created until it is
 * opened or the first translation. A pair whose model must be downloaded first is
 * only created inside a user activation (a click), as the API requires; `open` waits
 * for the download. Until then, and wherever the API or the pair is unavailable, it is
 * not ready and translations come back undefined. Opened with `download: false` (the
 * lists), it is ready only once its model is there. Content scripts use it through
 * their queue (`queue.ts`), which keeps the translations.
 */
export function createBuiltInTranslator(
  from: string,
  to: string,
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): TranslationProvider {
  const pair = { sourceLanguage: from, targetLanguage: to };
  let ready: Promise<BuiltInTranslator | undefined> | undefined;

  async function create(): Promise<BuiltInTranslator | undefined> {
    const api = g.Translator;
    if (!api) return undefined;
    const availability = await api.availability(pair);
    if (availability === "unavailable") return undefined;
    if (availability === "available") return api.create(pair);
    if (!g.navigator?.userActivation?.isActive)
      throw new Error("The translation model needs a user activation");
    return api.create({ ...pair, monitor: monitorFor(g, pair) });
  }

  /** The translator, created once; undefined where it cannot be (now). */
  async function translator(): Promise<BuiltInTranslator | undefined> {
    try {
      ready ??= create();
      return await ready;
    } catch {
      // Try again next time: the next call may come with a user activation.
      ready = undefined;
      return undefined;
    }
  }

  /** The model is on the device: creating the translator downloads nothing. */
  async function modelThere(): Promise<boolean> {
    try {
      return (await g.Translator?.availability(pair)) === "available";
    } catch {
      return false;
    }
  }

  return {
    async open({ download = true } = {}) {
      if (!download && !ready && !(await modelThere())) return false;
      return (await translator()) !== undefined;
    },
    async translate(text) {
      const created = await translator();
      if (!created) return undefined;
      try {
        return await created.translate(text);
      } catch {
        return undefined;
      }
    },
    watchDownload: (listener) => watchDownload(g, pair, listener),
  };
}

/**
 * Whether the built-in translator can translate `from` into `to` here, now or after
 * its model is downloaded (spec: "Choosing a translation", source 3).
 */
export async function builtInTranslatorAvailable(
  from: string,
  to: string,
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): Promise<boolean> {
  if (!g.Translator) return false;
  try {
    const availability = await g.Translator.availability({
      sourceLanguage: from,
      targetLanguage: to,
    });
    return availability !== "unavailable";
  } catch {
    return false;
  }
}

/**
 * Starts downloading the models Langle translates with for `learning` → `native`: the
 * English definitions' (en → native) and the subtitles' (learning → native). Called
 * in a user activation, which a download needs (hover cards never start one): when
 * the user chooses a language in Settings, at the first click on a page Langle runs
 * on, when the toolbar popup opens. Models already there or downloading, or not
 * offered, are left alone; errors are ignored.
 */
export async function downloadTranslationModels(
  learning: string,
  native: string,
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): Promise<void> {
  const api = g.Translator;
  if (!api) return;
  const sources = [...new Set(["en", learning])].filter(
    (from) => from !== native,
  );
  await Promise.all(
    sources.map(async (from) => {
      const pair = { sourceLanguage: from, targetLanguage: native };
      try {
        if ((await api.availability(pair)) !== "downloadable") return;
        // Created to start the download; the content scripts create their own.
        (
          await api.create({ ...pair, monitor: monitorFor(g, pair) })
        ).destroy?.();
      } catch {
        // No download now: the dictionary window's click starts it later.
      }
    }),
  );
}

/** Input events that give the page a user activation (HTML "activation-triggering"). */
const ACTIVATING = ["pointerdown", "pointerup", "keydown"] as const;

/** The pages (targets) whose first activation is awaited or was used. */
const armed = new WeakSet<EventTarget>();

/**
 * Starts the translator's model downloads for the page's languages at the first user
 * activation on `target` (a click, a tap, a key; `downloadTranslationModels`): hover
 * cards cannot start one, and a new install chooses its languages without a click.
 * Once per target until disarmed; with `now`, also at once when the page has a user
 * activation already (the toolbar popup that a click just opened). Nothing where the
 * browser has no built-in translator. Returns the disarm.
 */
export function downloadModelsOnFirstActivation(
  target: EventTarget,
  languages: () => { learning: string; native: string },
  options: { now?: boolean } = {},
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): () => void {
  if (!g.Translator || armed.has(target)) return () => {};
  armed.add(target);
  const activated = () => g.navigator?.userActivation?.isActive !== false;
  let done = false;
  const stopListening = () => {
    for (const type of ACTIVATING)
      target.removeEventListener(type, onInput, { capture: true });
  };
  function fire() {
    done = true;
    stopListening();
    const { learning, native } = languages();
    void downloadTranslationModels(learning, native, g);
  }
  function onInput() {
    // A tap's pointerdown gives no activation; its pointerup does.
    if (!done && activated()) fire();
  }
  for (const type of ACTIVATING)
    target.addEventListener(type, onInput, { capture: true, passive: true });
  if (options.now && g.navigator?.userActivation?.isActive) fire();
  return () => {
    stopListening();
    armed.delete(target);
  };
}
