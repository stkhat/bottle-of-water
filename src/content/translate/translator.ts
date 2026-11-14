export interface TranslationProvider {
  /**
   * Gets the translator ready, which may mean downloading its model (not with
   * `download: false`): true once it can translate, false when it cannot (now).
   * Without it, the provider is always ready.
   */
  open?(options?: { download?: boolean }): Promise<boolean>;
  /** Undefined when no translation is available. */
  translate(text: string): Promise<string | undefined>;
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
    create(pair: TranslatorPair): Promise<BuiltInTranslator>;
  };
  navigator?: { userActivation?: { isActive: boolean } };
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
    if (availability !== "available" && !g.navigator?.userActivation?.isActive)
      throw new Error("The translation model needs a user activation");
    return api.create(pair);
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
 * Starts downloading the models Lingo translates with for `learning` → `native`: the
 * English definitions' (en → native) and the subtitles' (learning → native). Called
 * when the user chooses a language in Settings, a user activation that a download
 * needs (hover cards never start one). Models already there, or not offered, are left
 * alone; errors are ignored.
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
        (await api.create(pair)).destroy?.();
      } catch {
        // No download now: the dictionary window's click starts it later.
      }
    }),
  );
}
