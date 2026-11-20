import { createClassifier, type Classifier } from "../core/classify";
import {
  createDefsDictionary,
  createEnJaDictionary,
  createPairDictionary,
  withCompounds,
  withPhraseCase,
  withWrittenHeads,
  type DictionaryProvider,
} from "../core/lexicon/dictionary";
import {
  createLanguagePack,
  capitalisesNouns,
  writesCompounds,
  type LanguagePack,
} from "../core/lexicon/language-pack";
import type { LoadPack, PackFiles, PackName } from "../core/packs/load";
import { withContractions } from "../core/lexicon/contractions";
import {
  DICTIONARY_PACKS,
  LANGUAGE_PACKS,
  LEARNING_PAIRS,
  learningOf,
  type LearningPairName,
} from "../core/packs/formats";
import { recipeNatives, type RecipePairPack } from "../core/natives";
import { fallbacksOf } from "../core/packs/pairs";
import type { DefsPack } from "../core/packs/types";
import { allOf, PacksUnavailableError } from "../core/packs/unavailable";
import { own, promiseCache } from "../core/util";

/**
 * The language pack, classifier and dictionary of each language, built on first use.
 * A resource whose packs are not on the device rejects with `PacksUnavailableError`,
 * except that a dictionary is built without its fallbacks (`fallbacksOf`) while they
 * download: it then answers a term its other packs lack with that error, naming them.
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

/** What a definitions pack that is not on the device yet stands in with. */
const NO_DEFINITIONS: { defs: DefsPack } = { defs: {} };

/**
 * Loads `packs` (all of them, so one `PacksUnavailableError` names every missing one),
 * then makes the resource. A pack of `fallbacks` (definitions packs, `fallbacksOf`)
 * that is not on the device stands in with no definitions, and `make` is told it is
 * `pending`.
 */
function recipe<P extends PackName, T>(
  packs: readonly P[],
  make: (files: Loaded<P>, pending: readonly PackName[]) => T,
  fallbacks: readonly PackName[] = [],
): Recipe<T> {
  return {
    packs,
    async build(loadPack) {
      const files = {} as Loaded<P>;
      const pending: PackName[] = [];
      await allOf(
        packs.map(async (name) => {
          try {
            files[name] = await loadPack(name);
          } catch (error) {
            if (
              !(error instanceof PacksUnavailableError) ||
              !fallbacks.includes(name)
            )
              throw error;
            (files as Record<string, unknown>)[name] = NO_DEFINITIONS;
            pending.push(name);
          }
        }),
      );
      return make(files, pending);
    },
  };
}

/**
 * `dictionary` built without its fallbacks `pending`: a term it does not have may be
 * theirs, so its entry throws `PacksUnavailableError` naming them (a card waits for
 * them and shows once they are there). Outlines and names read what is on the device:
 * pages analyze meanwhile.
 */
function awaitingFallbacks(
  dictionary: DictionaryProvider,
  pending: readonly PackName[],
): DictionaryProvider {
  if (pending.length === 0) return dictionary;
  return {
    entry(term, written, pos, clitic, spelledOut) {
      const found = dictionary.entry(term, written, pos, clitic, spelledOut);
      if (found === undefined) throw new PacksUnavailableError(pending);
      return found;
    },
    outline: (term) => dictionary.outline(term),
    capitalMeaning: (term) => dictionary.capitalMeaning(term),
    senseLine: (sense, glossLang) => dictionary.senseLine(sense, glossLang),
  };
}

/** A dictionary's recipe from its packs, built without its fallbacks while they download. */
function dictionaryRecipe<P extends PackName>(
  name: keyof typeof DICTIONARY_PACKS,
  packs: readonly P[],
  make: (files: Loaded<P>) => DictionaryProvider,
): Recipe<DictionaryProvider> {
  return recipe(
    packs,
    (files, pending) => awaitingFallbacks(make(files), pending),
    fallbacksOf(name),
  );
}

const LANGUAGE_RECIPES: Readonly<Record<string, Recipe<LanguagePack>>> =
  Object.fromEntries(
    LANGUAGE_PACKS.map((lang) => [
      lang,
      recipe([lang], (files) => {
        const pack = files[lang];
        const { lemmas, freq, ipa, vocab, phrases } = pack;
        return createLanguagePack(lang, {
          lemmas,
          freq,
          ipa,
          vocab: new Set(vocab),
          patterns: phrases,
          ...("contractions" in pack && { contractions: pack.contractions }),
          ...("capitals" in pack && { capitals: pack.capitals }),
          ...("pos" in pack && { pos: pack.pos }),
          ...("names" in pack && { names: pack.names }),
          ...("tagger" in pack && { tagger: pack.tagger }),
        });
      }),
    ]),
  );

/**
 * An English dictionary with English contractions shown by what they are short for
 * (`withContractions`), from the English pack's table and vocabulary, and capital-only
 * words' heads as they are written (`withWrittenHeads`: AI, not "ai").
 */
function withEnglishContractions(
  dictionary: DictionaryProvider,
  en: PackFiles["en"],
): DictionaryProvider {
  // The vocabulary as a set, made on the first contraction or head looked up.
  let vocab: ReadonlySet<string> | undefined;
  const english = (word: string) => (vocab ??= new Set(en.vocab)).has(word);
  let heads: ReadonlyMap<string, string> | undefined;
  const headOf = (key: string) =>
    (heads ??= new Map(
      [...en.capitals]
        .reverse()
        .map((written) => [written.toLowerCase(), written] as const)
        .filter(([lower]) => !english(lower)),
    )).get(key);
  return withWrittenHeads(
    withContractions(dictionary, {
      expansions: (key) => own(en.contractions, key) ?? [],
      english,
    }),
    headOf,
  );
}

/** A recipe pair (en-es): the recipe's meanings, then English Wiktionary's definitions. */
const pairRecipe = (pair: RecipePairPack) =>
  dictionaryRecipe<"en" | RecipePairPack | "en-defs">(
    pair,
    DICTIONARY_PACKS[pair],
    (files) =>
      withEnglishContractions(
        createPairDictionary({
          dict: files[pair].dict,
          defs: files["en-defs"].defs,
          ipa: files.en.ipa,
          native: pair.slice("en-".length),
          lemmas: files.en.lemmas,
          pos: files.en.pos,
        }),
        files.en,
      ),
  );

/**
 * A learning pair (de-fr): its recipe's meanings, then the learning language's English
 * definitions, translated at display time.
 */
function learningPairRecipe(pair: LearningPairName) {
  const learning = learningOf(pair);
  const english = `${learning}-en` as const;
  return dictionaryRecipe<typeof learning | LearningPairName | typeof english>(
    pair,
    DICTIONARY_PACKS[pair],
    (files) =>
      createPairDictionary({
        dict: files[pair].dict,
        defs: files[english].defs,
        ipa: files[learning].ipa,
        native: pair.slice(learning.length + 1),
      }),
  );
}

const DICTIONARY_RECIPES: Readonly<Record<string, Recipe<DictionaryProvider>>> =
  {
    "en-ja": dictionaryRecipe("en-ja", DICTIONARY_PACKS["en-ja"], (files) =>
      withEnglishContractions(
        createEnJaDictionary({
          ...files["en-ja"],
          defs: files["en-defs"].defs,
          pos: files.en.pos,
          ipa: files.en.ipa,
        }),
        files.en,
      ),
    ),
    "es-en": dictionaryRecipe("es-en", DICTIONARY_PACKS["es-en"], (files) =>
      createDefsDictionary({ defs: files["es-en"].defs, ipa: files.es.ipa }),
    ),
    "fr-en": dictionaryRecipe("fr-en", DICTIONARY_PACKS["fr-en"], (files) =>
      createDefsDictionary({ defs: files["fr-en"].defs, ipa: files.fr.ipa }),
    ),
    "de-en": dictionaryRecipe("de-en", DICTIONARY_PACKS["de-en"], (files) =>
      createDefsDictionary({ defs: files["de-en"].defs, ipa: files.de.ipa }),
    ),
    ...Object.fromEntries(
      recipeNatives().map((native) => [
        `en-${native}`,
        pairRecipe(`en-${native}`),
      ]),
    ),
    ...Object.fromEntries(
      (Object.keys(LEARNING_PAIRS) as LearningPairName[]).map((pair) => [
        pair,
        learningPairRecipe(pair),
      ]),
    ),
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
      return once(`dictionary:${from}-${to}`, found.packs, async () => {
        const dictionary = await found.build(loadPack);
        if (!writesCompounds(from) && !capitalisesNouns(from))
          return dictionary;
        const learning = await pack(from);
        // Closed compounds ("Bahnsystem") are read by their parts.
        const compounds = writesCompounds(from)
          ? withCompounds(dictionary, (key) => learning.compound(key))
          : dictionary;
        // Phrases' headwords keep the language's capitals ("auf jeden Fall").
        return capitalisesNouns(from)
          ? withPhraseCase(compounds, (word) => learning.lemmas(word))
          : compounds;
      });
    },

    forget(name) {
      for (const [key, packs] of packsOf)
        if (packs.includes(name)) builds.delete(key);
    },
  };
}
