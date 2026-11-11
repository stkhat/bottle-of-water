import lockFile from "./packs/packs.lock.json";
import { own } from "./util";

/**
 * The language pairs Lingo offers: each learning language (one with a language pack)
 * with the native languages it has a dictionary into, the default first. They are the
 * pairs whose dictionaries pass the quality gate, as `npm run data:publish` writes them
 * into the lock (scripts/data/gate.mjs). The background's registry
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
