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
import type {
  FreqPack,
  IpaPack,
  LemmaPack,
  PhrasesPack,
  VocabPack,
} from "../core/packs/types";

/** The language pack, classifier and dictionary of each language, built on first use. */
export interface LanguageResources {
  pack(lang: string): Promise<LanguagePack>;
  classifier(lang: string): Promise<Classifier>;
  dictionary(from: string, to: string): Promise<DictionaryProvider>;
}

/** How a resource is built: it loads its bundled packs, then makes the resource of them. */
type Recipe<T> = (loadPack: LoadPack) => Promise<T>;

type Loaded<P extends PackName> = { [K in P]: PackFiles[K] };

/** A recipe that loads `packs` (and nothing else) and makes the resource of them. */
function recipe<P extends PackName, T>(
  packs: readonly P[],
  make: (files: Loaded<P>) => T,
): Recipe<T> {
  return async (loadPack) => {
    const files = {} as Loaded<P>;
    await Promise.all(
      packs.map(async (name) => {
        files[name] = await loadPack(name);
      }),
    );
    return make(files);
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
    phrases: new Set(files.phrases.detect),
  };
  return createLanguagePack(lang, data);
}

/**
 * The learning languages. Each pack (and so `analyze`) needs only its language's pack,
 * whose vocabulary is its dictionary's single-word headwords and whose phrases are
 * detected in text.
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

/**
 * Resources built from the bundled packs, each once per context (the background's
 * service worker): nothing is loaded until a resource is first asked for, overlapping
 * calls share one build, and a failed build is forgotten so the next call tries again.
 * Languages and dictionaries without a recipe above are rejected.
 */
export function createLanguageResources(loadPack: LoadPack): LanguageResources {
  const builds = new Map<string, Promise<unknown>>();

  function once<T>(key: string, build: () => Promise<T>): Promise<T> {
    let promise = builds.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = build();
      builds.set(key, promise);
      promise.catch(() => builds.delete(key));
    }
    return promise;
  }

  function pack(lang: string): Promise<LanguagePack> {
    if (!Object.hasOwn(LANGUAGE_PACKS, lang))
      return Promise.reject(new Error(`No language pack for ${lang}`));
    return once(`pack:${lang}`, () => LANGUAGE_PACKS[lang]!(loadPack));
  }

  return {
    pack,

    classifier: (lang) =>
      once(`classifier:${lang}`, async () =>
        createClassifier(await pack(lang)),
      ),

    dictionary(from, to) {
      const pair = `${from}-${to}`;
      if (!Object.hasOwn(DICTIONARIES, pair))
        return Promise.reject(new Error(`No dictionary from ${from} to ${to}`));
      return once(`dictionary:${pair}`, () => DICTIONARIES[pair]!(loadPack));
    },
  };
}
