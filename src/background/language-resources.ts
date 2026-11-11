import { createClassifier, type Classifier } from "../core/classify";
import {
  createDefsDictionary,
  createEnJaDictionary,
  type DictionaryProvider,
} from "../core/dictionary";
import {
  createLanguagePack,
  type LanguagePack,
  type LanguagePackData,
} from "../core/language-pack";
import type { LoadPack, PackFiles, PackName } from "../core/packs/load";
import { allOf } from "../core/packs/unavailable";
import type {
  FreqPack,
  IpaPack,
  LemmaPack,
  PhrasesPack,
  VocabPack,
} from "../core/packs/types";

/**
 * The language pack, classifier and dictionary of each language, built on first use.
 * A resource whose packs are not on the device rejects with `PacksUnavailableError`.
 */
export interface LanguageResources {
  pack(lang: string): Promise<LanguagePack>;
  classifier(lang: string): Promise<Classifier>;
  dictionary(from: string, to: string): Promise<DictionaryProvider>;
  /** Drops every resource built from `pack` (its version switched or it was removed). */
  forget(pack: string): void;
}

/** How a resource is built: it loads its packs, then makes the resource of them. */
interface Recipe<T> {
  readonly packs: readonly PackName[];
  build(loadPack: LoadPack): Promise<T>;
}

type Loaded<P extends PackName> = { [K in P]: PackFiles[K] };

/**
 * A recipe that loads `packs` (and nothing else) and makes the resource of them. When
 * packs are not on the device, it fails with one `PacksUnavailableError` naming all of
 * them; any other failure comes through as it is.
 */
function recipe<P extends PackName, T>(
  packs: readonly P[],
  make: (files: Loaded<P>) => T,
): Recipe<T> {
  return {
    packs,
    async build(loadPack) {
      const files = {} as Loaded<P>;
      await allOf(
        packs.map(async (name) => {
          files[name] = await loadPack(name);
        }),
      );
      return make(files);
    },
  };
}

/** The files of a learning language's pack, as bundled. */
interface LanguagePackFiles {
  lemmas: LemmaPack;
  freq: FreqPack;
  ipa: IpaPack;
  vocab: VocabPack;
  phrases: PhrasesPack;
}

function languagePack(lang: string, files: LanguagePackFiles): LanguagePack {
  const data: LanguagePackData = {
    lemmas: files.lemmas,
    freq: files.freq,
    ipa: files.ipa,
    vocab: new Set(files.vocab),
    patterns: files.phrases,
  };
  return createLanguagePack(lang, data);
}

/**
 * The learning languages. Each pack (and so `analyze`) needs only its language's pack,
 * whose vocabulary is its dictionary's single-word headwords and whose phrase patterns
 * are detected in text, or matched when saved or selected.
 */
const LANGUAGE_PACKS: Readonly<Record<string, Recipe<LanguagePack>>> = {
  en: recipe(["en"], ({ en }) => languagePack("en", en)),
  es: recipe(["es"], ({ es }) => languagePack("es", es)),
};

/**
 * The dictionaries, by "<from>-<to>". They load on the first lookup:
 * - en-ja: EJDict (`en-ja`) with Wiktionary's English definitions of phrases (`en-defs`),
 *   parts of speech and IPA from `en`
 * - es-en: Wiktionary's English meanings (`es-en`), IPA from `es`
 */
const DICTIONARIES: Readonly<Record<string, Recipe<DictionaryProvider>>> = {
  "en-ja": recipe(
    ["en", "en-ja", "en-defs"],
    ({ en, "en-ja": enJa, "en-defs": enDefs }) =>
      createEnJaDictionary({
        dict: enJa.dict,
        phrases: enJa.phrases,
        defs: enDefs.defs,
        pos: en.pos,
        ipa: en.ipa,
      }),
  ),
  "es-en": recipe(["es", "es-en"], ({ es, "es-en": esEn }) =>
    createDefsDictionary({
      from: "es",
      to: "en",
      defs: esEn.defs,
      ipa: es.ipa,
    }),
  ),
};

const languageRecipe = (lang: string) =>
  Object.hasOwn(LANGUAGE_PACKS, lang) ? LANGUAGE_PACKS[lang] : undefined;

const dictionaryRecipe = (from: string, to: string) => {
  const pair = `${from}-${to}`;
  return Object.hasOwn(DICTIONARIES, pair) ? DICTIONARIES[pair] : undefined;
};

/**
 * The packs a language pair needs: the learning language's pack, then the other packs
 * of its dictionary into the native language. What has no recipe is left out (an
 * unknown language or pair needs nothing).
 */
export function packsFor(learning: string, native: string): PackName[] {
  return [
    ...new Set([
      ...(languageRecipe(learning)?.packs ?? []),
      ...(dictionaryRecipe(learning, native)?.packs ?? []),
    ]),
  ];
}

/**
 * Resources built from the packs, each once per context (the background's service
 * worker) until a pack it was built from is forgotten: nothing is loaded until a
 * resource is first asked for, overlapping calls share one build, and a failed build
 * is forgotten so the next call tries again. Languages and dictionaries without a
 * recipe above are rejected.
 */
export function createLanguageResources(loadPack: LoadPack): LanguageResources {
  const builds = new Map<
    string,
    { promise: Promise<unknown>; packs: readonly string[] }
  >();

  function once<T>(
    key: string,
    packs: readonly string[],
    build: () => Promise<T>,
  ): Promise<T> {
    const built = builds.get(key);
    if (built) return built.promise as Promise<T>;
    const promise = build();
    builds.set(key, { promise, packs });
    // Only this build: a newer one may have replaced it after a `forget`.
    promise.catch(() => {
      if (builds.get(key)?.promise === promise) builds.delete(key);
    });
    return promise;
  }

  function pack(lang: string): Promise<LanguagePack> {
    const recipe = languageRecipe(lang);
    if (!recipe)
      return Promise.reject(new Error(`No language pack for ${lang}`));
    return once(`pack:${lang}`, recipe.packs, () => recipe.build(loadPack));
  }

  return {
    pack,

    classifier(lang) {
      const packs = languageRecipe(lang)?.packs ?? [];
      return once(`classifier:${lang}`, packs, async () =>
        createClassifier(await pack(lang)),
      );
    },

    dictionary(from, to) {
      const recipe = dictionaryRecipe(from, to);
      if (!recipe)
        return Promise.reject(new Error(`No dictionary from ${from} to ${to}`));
      return once(`dictionary:${from}-${to}`, recipe.packs, () =>
        recipe.build(loadPack),
      );
    },

    forget(name) {
      for (const [key, { packs }] of builds)
        if (packs.includes(name)) builds.delete(key);
    },
  };
}
