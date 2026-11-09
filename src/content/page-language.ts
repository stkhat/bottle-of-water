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
