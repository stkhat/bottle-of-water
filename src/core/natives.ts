// The native languages: everything the extension does differently per native language,
// in one entry each (architecture.md "Native meanings and the quality gate" → "Adding a
// native language"). The data scripts (scripts/data/) import this file under plain
// Node: keep its imports type-only.
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
   * The meaning-in-context prompt's two example answers written in the language: "bank"
   * by a river (one of several dictionary meanings) and "spilled the beans" (an idiom
   * without an entry). Null: English's.
   */
  readonly examples: { readonly bank: string; readonly beans: string } | null;
  /**
   * English → this language is a pair pack (`en-<code>`) built by the language's recipe
   * (`scripts/data/recipes/native.ts`), read in this data format. Japanese (EJDict, its
   * own pack) and English (the English definitions) are built otherwise.
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
    examples: { bank: "川岸、土手", beans: "秘密をばらす" },
  },
  es: {
    option: "language.es",
    name: "languageName.es",
    spaces: true,
    dense: false,
    examples: { bank: "orilla (de un río)", beans: "revelar el secreto" },
    englishPair: { format: 1 },
  },
  pt: {
    option: "language.pt",
    name: "languageName.pt",
    spaces: true,
    dense: false,
    examples: { bank: "margem (de um rio)", beans: "revelar o segredo" },
    englishPair: { format: 1 },
  },
  en: {
    option: "languageName.en",
    name: "languageName.en",
    spaces: true,
    dense: false,
    examples: { bank: "riverbank", beans: "revealed the secret" },
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
