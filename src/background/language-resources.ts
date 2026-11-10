import { createClassifier, type Classifier } from "../core/classify";
import {
  createEnJaDictionary,
  type DictionaryProvider,
} from "../core/dictionary";
import { createEnglishPack, type LanguagePack } from "../core/language-pack";
import type { LoadPack } from "../core/packs/load";

/** The language pack, classifier and dictionary of each language, built on first use. */
export interface LanguageResources {
  pack(lang: string): Promise<LanguagePack>;
  classifier(lang: string): Promise<Classifier>;
  dictionary(from: string, to: string): Promise<DictionaryProvider>;
}

/**
 * Resources built from the bundled packs, each once per context (the background's
 * service worker): nothing is loaded until a resource is first asked for, overlapping
 * calls share one build, and a failed build is forgotten so the next call tries again.
 *
 * The English pack (and so `analyze`) needs only the `en` pack, whose vocabulary is the
 * en-ja dictionary's single-word headwords; the dictionary loads on the first lookup.
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
    if (lang !== "en")
      return Promise.reject(new Error(`No language pack for ${lang}`));
    return once("pack:en", async () => {
      const en = await loadPack("en");
      return createEnglishPack({
        lemmas: en.lemmas,
        freq: en.freq,
        ipa: en.ipa,
        vocab: new Set(en.vocab),
      });
    });
  }

  return {
    pack,

    classifier: (lang) =>
      once(`classifier:${lang}`, async () =>
        createClassifier(await pack(lang)),
      ),

    dictionary(from, to) {
      if (from !== "en" || to !== "ja")
        return Promise.reject(new Error(`No dictionary from ${from} to ${to}`));
      return once("dictionary:en-ja", async () => {
        const [en, enJa] = await Promise.all([
          loadPack("en"),
          loadPack("en-ja"),
        ]);
        return createEnJaDictionary({
          dict: enJa.dict,
          pos: en.pos,
          ipa: en.ipa,
        });
      });
    },
  };
}
