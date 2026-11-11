import { ENGLISH_RULES } from "./en";
import { SPANISH_RULES } from "./es";
import { NO_RULES, type PhraseRules } from "./pattern";

const RULES: Readonly<Record<string, PhraseRules>> = {
  en: ENGLISH_RULES,
  es: SPANISH_RULES,
};

/** The phrase rules of a learning language; no slots and no gaps without rules. */
export function rulesFor(lang: string): PhraseRules {
  return Object.hasOwn(RULES, lang) ? RULES[lang]! : NO_RULES;
}
