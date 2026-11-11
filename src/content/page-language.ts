function primarySubtag(tag: string): string {
  return tag.trim().split(/[-_]/)[0]!.toLowerCase();
}

/** Tags that name no particular language: undetermined, multiple, none, private use. */
const GENERIC = new Set(["", "und", "mul", "zxx", "mis", "x", "i"]);

/** True when a `lang` value is missing or names no particular language. */
export function isGenericLang(tag: string | null | undefined): boolean {
  return GENERIC.has(primarySubtag(tag ?? ""));
}

/** True when the page's `lang` attribute has the same primary subtag as the learning language. */
export function matchesLearningLanguage(
  htmlLang: string | null | undefined,
  learningLang: string,
): boolean {
  if (!htmlLang) return false;
  const page = primarySubtag(htmlLang);
  return page !== "" && page === primarySubtag(learningLang);
}

/** What `i18n.detectLanguage` answers. */
export interface DetectedLanguage {
  isReliable: boolean;
  languages: { language: string; percentage: number }[];
}

/**
 * True when the detector reliably names a language other than the learning one. An
 * unsure answer, or one naming no particular language, counts as the learning language.
 */
export function inOtherLanguage(
  detected: DetectedLanguage,
  learningLang: string,
): boolean {
  const top = detected.languages[0]?.language;
  if (!detected.isReliable || isGenericLang(top)) return false;
  return !matchesLearningLanguage(top, learningLang);
}
