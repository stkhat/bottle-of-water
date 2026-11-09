/** Translates short text from the learning language to the native one. */
export interface TranslationProvider {
  /** Undefined when no translation is available. */
  translate(text: string): Promise<string | undefined>;
}

interface TranslatorPair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface BuiltInTranslator {
  translate(text: string): Promise<string>;
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
 * The browser's built-in translator (Translator API). Nothing is created until the
 * first translation. A pair whose model must be downloaded first is only created
 * inside a user activation (a click), as the API requires; until then, and wherever
 * the API or the pair is unavailable, translations come back undefined.
 */
export function createBuiltInTranslator(
  from: string,
  to: string,
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): TranslationProvider {
  const pair = { sourceLanguage: from, targetLanguage: to };
  let ready: Promise<BuiltInTranslator | undefined> | undefined;
  const cache = new Map<string, string>();

  async function open(): Promise<BuiltInTranslator | undefined> {
    const api = g.Translator;
    if (!api) return undefined;
    const availability = await api.availability(pair);
    if (availability === "unavailable") return undefined;
    if (availability !== "available" && !g.navigator?.userActivation?.isActive)
      throw new Error("The translation model needs a user activation");
    return api.create(pair);
  }

  return {
    async translate(text) {
      const cached = cache.get(text);
      if (cached !== undefined) return cached;
      let translator: BuiltInTranslator | undefined;
      try {
        ready ??= open();
        translator = await ready;
      } catch {
        // Try again next time: the next call may come with a user activation.
        ready = undefined;
        return undefined;
      }
      if (!translator) return undefined;
      try {
        const translated = await translator.translate(text);
        cache.set(text, translated);
        return translated;
      } catch {
        return undefined;
      }
    },
  };
}
