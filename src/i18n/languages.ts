import { t, type MessageKey } from "./t";

/** Language names as menus offer them ("Japanese (日本語)"). */
const OPTIONS: Readonly<Record<string, MessageKey>> = {
  en: "language.en",
  ja: "language.ja",
  es: "language.es",
  pt: "language.pt",
};

/** Language names as sentences use them ("Japanese"). */
const NAMES: Readonly<Record<string, MessageKey>> = {
  en: "languageName.en",
  ja: "languageName.ja",
  es: "languageName.es",
  pt: "languageName.pt",
};

const named = (table: Readonly<Record<string, MessageKey>>, code: string) =>
  Object.hasOwn(table, code) ? t(table[code]!) : code;

/** A language as a menu offers it; a code without a name shows as itself. */
export const languageOption = (code: string) => named(OPTIONS, code);

/** A language's name in a sentence; a code without a name shows as itself. */
export const languageName = (code: string) => named(NAMES, code);

/** The language pair, as the popup and the word list show it: "English → Japanese". */
export const languagePair = (learning: string, native: string) =>
  t("app.languagePair", {
    learning: languageName(learning),
    native: languageName(native),
  });
