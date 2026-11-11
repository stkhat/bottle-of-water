import { createClassifier, type Classifier } from "../core/classify";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
  type DictionaryProvider,
} from "../core/lexicon/dictionary";
import {
  createLanguagePack,
  type LanguagePack,
} from "../core/lexicon/language-pack";
import type { LoadPack, PackFiles, PackName } from "../core/packs/load";
import { DICTIONARY_PACKS, LANGUAGE_PACKS } from "../core/packs/pairs";
import { allOf } from "../core/packs/unavailable";
import { own, promiseCache } from "../core/util";

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

interface Recipe<T> {
  readonly packs: readonly PackName[];
  build(loadPack: LoadPack): Promise<T>;
}

type Loaded<P extends PackName> = { [K in P]: PackFiles[K] };

/** Loads `packs` (all of them, so one `PacksUnavailableError` names every missing one), then makes the resource. */
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

const LANGUAGE_RECIPES: Readonly<Record<string, Recipe<LanguagePack>>> =
  Object.fromEntries(
    LANGUAGE_PACKS.map((lang) => [
      lang,
      recipe([lang], (files) => {
        const { lemmas, freq, ipa, vocab, phrases } = files[lang];
        return createLanguagePack(lang, {
          lemmas,
          freq,
          ipa,
          vocab: new Set(vocab),
          patterns: phrases,
        });
      }),
    ]),
  );

/** en-es, en-pt: the recipe's meanings, then English Wiktionary's definitions. */
const pairRecipe = (pair: "en-es" | "en-pt") =>
  recipe(DICTIONARY_PACKS[pair], (files) =>
    createPairDictionary({
      dict: files[pair].dict,
      defs: files["en-defs"].defs,
      ipa: files.en.ipa,
    }),
  );

const DICTIONARY_RECIPES: Readonly<Record<string, Recipe<DictionaryProvider>>> =
  {
    "en-ja": recipe(DICTIONARY_PACKS["en-ja"], (files) =>
      createEnJaDictionary({
        ...files["en-ja"],
        defs: files["en-defs"].defs,
        pos: files.en.pos,
        ipa: files.en.ipa,
      }),
    ),
    "es-en": recipe(DICTIONARY_PACKS["es-en"], (files) =>
      createDefsDictionary({ defs: files["es-en"].defs, ipa: files.es.ipa }),
    ),
    "en-es": pairRecipe("en-es"),
    "en-pt": pairRecipe("en-pt"),
  };

/**
 * Each resource is built once per worker, until a pack it was built from is forgotten;
 * overlapping calls share one build and a failed build is tried again on the next call.
 */
export function createLanguageResources(loadPack: LoadPack): LanguageResources {
  const builds = promiseCache<unknown>({ keep: true });
  const packsOf = new Map<string, readonly string[]>();

  function once<T>(
    key: string,
    packs: readonly string[],
    build: () => Promise<T>,
  ): Promise<T> {
    packsOf.set(key, packs);
    return builds.get(key, build) as Promise<T>;
  }

  function pack(lang: string): Promise<LanguagePack> {
    const found = own(LANGUAGE_RECIPES, lang);
    if (!found)
      return Promise.reject(new Error(`No language pack for ${lang}`));
    return once(`pack:${lang}`, found.packs, () => found.build(loadPack));
  }

  return {
    pack,

    classifier(lang) {
      const packs = own(LANGUAGE_RECIPES, lang)?.packs ?? [];
      return once(`classifier:${lang}`, packs, async () =>
        createClassifier(await pack(lang)),
      );
    },

    dictionary(from, to) {
      const found = own(DICTIONARY_RECIPES, `${from}-${to}`);
      if (!found)
        return Promise.reject(new Error(`No dictionary from ${from} to ${to}`));
      return once(`dictionary:${from}-${to}`, found.packs, () =>
        found.build(loadPack),
      );
    },

    forget(name) {
      for (const [key, packs] of packsOf)
        if (packs.includes(name)) builds.delete(key);
    },
  };
}
