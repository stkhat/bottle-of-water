// The native languages: everything the extension does differently per native language,
// in one entry each (architecture.md "Adding a native language"). The data scripts
// (scripts/data/) import this file under plain Node: keep its imports type-only.
import type { MessageKey } from "../i18n/t";

export interface NativeLanguage {
  /** Its name as menus offer it ("Japanese (日本語)"). */
  readonly option: MessageKey;
  /** Its name in a sentence ("Japanese"). */
  readonly name: MessageKey;
  /**
   * Written with spaces between words and sentences (Latin, Cyrillic, Korean …): two
   * translated subtitle lines are joined with a space. Japanese, Chinese and Thai are not.
   */
  readonly spaces: boolean;
  /**
   * A dense script (Chinese characters, kana, hangul: a character is wide and says about
   * as much as a word), so a meaning line is capped at fewer characters.
   */
  readonly dense: boolean;
  /**
   * The Unicode scripts its words are written in (`\p{Script=…}`). In a language not
   * written in Latin letters, a meaning with no letter of its own script is no meaning
   * (en-zh "be" → "or implied", a translation table's parse artifact).
   */
  readonly scripts: readonly string[];
  /**
   * The meaning-in-context prompt's two example answers written in the language: "bank"
   * by a river (one of several dictionary meanings) and "spilled the beans" (an idiom
   * without an entry). Null: English's.
   */
  readonly examples: {
    readonly bank: string;
    readonly beans: string;
    /** "make up one's mind" (the phrase of a selection, `selectedNote`). */
    readonly mind: string;
  } | null;
  /**
   * English → this language is a pair pack (`en-<code>`) built by the language's recipe
   * (`scripts/data/recipes/native.ts`), read in this data format. Japanese (EJDict, its
   * own pack) and English (the English definitions) are built otherwise. 2: pointer
   * senses. 3: capitalised headwords in capital.json. 4: the short meaning stored only
   * where it is not its senses' (`shortOfPairSenses`, 2026-11-21).
   */
  readonly englishPair?: { readonly format: number };
}

/**
 * The native languages, the default first. A pair is offered only once its dictionary
 * passes the quality gate (the lock's `pairs`).
 */
export const NATIVE_LANGUAGES = {
  ja: {
    option: "language.ja",
    name: "languageName.ja",
    spaces: false,
    dense: true,
    scripts: ["Han", "Hiragana", "Katakana"],
    examples: { bank: "川岸、土手", beans: "秘密をばらす", mind: "決心する" },
  },
  es: {
    option: "language.es",
    name: "languageName.es",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: {
      bank: "orilla (de un río)",
      beans: "revelar el secreto",
      mind: "decidirse",
    },
    englishPair: { format: 4 },
  },
  pt: {
    option: "language.pt",
    name: "languageName.pt",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: {
      bank: "margem (de um rio)",
      beans: "revelar o segredo",
      mind: "decidir-se",
    },
    englishPair: { format: 4 },
  },
  // Chrome's Prompt API has no Russian (it answers in en, ja, es, de, fr): meaning in
  // context is unavailable, so no examples of its own.
  ru: {
    option: "language.ru",
    name: "languageName.ru",
    spaces: true,
    dense: false,
    scripts: ["Cyrillic"],
    examples: null,
    englishPair: { format: 4 },
  },
  fr: {
    option: "language.fr",
    name: "languageName.fr",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: {
      bank: "rive (d'une rivière)",
      beans: "révéler le secret",
      mind: "se décider",
    },
    englishPair: { format: 4 },
  },
  de: {
    option: "language.de",
    name: "languageName.de",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: {
      bank: "Ufer (eines Flusses)",
      beans: "das Geheimnis verraten",
      mind: "sich entscheiden",
    },
    englishPair: { format: 4 },
  },
  // Simplified Chinese (the pack converts traditional characters at build time). Like
  // Japanese: no spaces, a dense script. Chrome's Prompt API has no Chinese, Italian
  // or Polish: meaning in context is unavailable, so no examples of their own.
  zh: {
    option: "language.zh",
    name: "languageName.zh",
    spaces: false,
    dense: true,
    scripts: ["Han"],
    examples: null,
    englishPair: { format: 4 },
  },
  it: {
    option: "language.it",
    name: "languageName.it",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: null,
    englishPair: { format: 4 },
  },
  pl: {
    option: "language.pl",
    name: "languageName.pl",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: null,
    englishPair: { format: 4 },
  },
  en: {
    option: "languageName.en",
    name: "languageName.en",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: {
      bank: "riverbank",
      beans: "revealed the secret",
      mind: "decide",
    },
  },
} as const satisfies Readonly<Record<string, NativeLanguage>>;

type Natives = typeof NATIVE_LANGUAGES;

/** The native languages whose English pair pack a recipe builds ("es", "pt"). */
export type RecipeNative = {
  [N in keyof Natives]: Natives[N] extends { englishPair: object } ? N : never;
}[keyof Natives];

/** The pair packs the recipes build ("en-es"). */
export type RecipePairPack = `en-${RecipeNative}`;

/** A native language's entry; undefined for a language that is not one. */
export const nativeLanguage = (code: string): NativeLanguage | undefined =>
  Object.hasOwn(NATIVE_LANGUAGES, code)
    ? NATIVE_LANGUAGES[code as keyof Natives]
    : undefined;

/** The native languages whose English pair pack a recipe builds, in registry order. */
export const recipeNatives = () =>
  (Object.keys(NATIVE_LANGUAGES) as (keyof Natives)[]).filter(
    (code): code is RecipeNative =>
      (NATIVE_LANGUAGES[code] as NativeLanguage).englishPair !== undefined,
  );
