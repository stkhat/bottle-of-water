import lockFile from "./packs/packs.lock.json";
import { DEFAULT_SETTINGS } from "./settings";
import { own } from "./util";

/**
 * The language pairs Langle offers: each learning language (one with a language pack)
 * with the native languages it has a dictionary into, the default first. They are the
 * pairs whose dictionaries pass the quality gate, as `npm run data:publish` writes them
 * into the lock (scripts/data/gate.ts). The background's registry
 * (`src/background/language-resources.ts`) builds every one.
 */
const LANGUAGE_PAIRS: Readonly<Record<string, readonly string[]>> =
  lockFile.pairs;

/** Speech voices by learning language. */
const SPEECH_LANGS: Readonly<Record<string, string>> = {
  en: "en-US",
  es: "es-ES",
};

/** The learning languages, in the order the settings offer them. */
export function learningLanguages(): string[] {
  return Object.keys(LANGUAGE_PAIRS);
}

/** The native languages `learning` has a dictionary into, the default first. */
export const nativeLanguages = (learning: string): readonly string[] =>
  own(LANGUAGE_PAIRS, learning) ?? [];

/** The language tag to speak `lang` with: a regional voice where one is chosen. */
export const speechLang = (lang: string) => own(SPEECH_LANGS, lang) ?? lang;

/** The primary subtag of a language tag, lowercase: "pt-BR" → "pt". */
export const primary = (tag: string) =>
  tag.trim().split(/[-_]/)[0]!.toLowerCase();

/**
 * The pair a new install starts with, from the browser's UI language (a tag such as
 * "pt-BR"): the UI language is taken for the user's own language, so the first offered
 * pair with it as the native language, the default learning language's pair before
 * the others (Japanese → English → Japanese, English → Spanish → English); the default
 * pair when no offered pair has it.
 */
export function firstPair(
  uiLanguage: string,
  offered: Readonly<Record<string, readonly string[]>> = LANGUAGE_PAIRS,
): { learningLang: string; nativeLang: string } {
  const native = primary(uiLanguage);
  const { learningLang, nativeLang } = DEFAULT_SETTINGS;
  const learning = [
    learningLang,
    ...Object.keys(offered).filter((lang) => lang !== learningLang),
  ].find((lang) => own(offered, lang)?.includes(native));
  return learning
    ? { learningLang: learning, nativeLang: native }
    : { learningLang, nativeLang };
}
