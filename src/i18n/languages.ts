import { nativeLanguage } from "../core/natives";
import { t } from "./t";

/** A language as a menu offers it ("Japanese (日本語)"); a code without a name shows as itself. */
export const languageOption = (code: string) => {
  const language = nativeLanguage(code);
  return language ? t(language.option) : code;
};

/** A language's name in a sentence ("Japanese"); a code without a name shows as itself. */
export const languageName = (code: string) => {
  const language = nativeLanguage(code);
  return language ? t(language.name) : code;
};

/** The language pair, as the popup and the word list show it: "English → Japanese". */
export const languagePair = (learning: string, native: string) =>
  t("app.languagePair", {
    learning: languageName(learning),
    native: languageName(native),
  });
