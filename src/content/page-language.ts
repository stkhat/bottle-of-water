function primarySubtag(tag: string): string {
  return tag.trim().split(/[-_]/)[0]!.toLowerCase();
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
