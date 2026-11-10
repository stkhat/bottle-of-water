import type { Classifier, ClassifyOptions } from "../core/classify";
import type { LanguagePack } from "../core/language-pack";
import { termId } from "../core/term-id";

/** Base forms ranked within this many are too common to find sentences by. */
export const HISTORY_COMMON_RANK = 300;

/**
 * The term ids a kept sentence is found by: every base form of each word except the
 * most common ones, then the phrases (dictionary and saved) the classifier finds in it.
 * Each id once, in that order.
 */
export function historyKeys(
  text: string,
  pack: LanguagePack,
  classifier: Classifier,
  options: ClassifyOptions,
): string[] {
  const keys = new Set<string>();
  const tokens = pack.tokenize(text);
  for (const token of tokens) {
    if (!token.isWord) continue;
    for (const base of pack.lemmas(token.text))
      if (pack.rank(base) > HISTORY_COMMON_RANK)
        keys.add(termId(pack.lang, base));
  }
  for (const span of classifier.classify(tokens, options))
    if (span.kind === "phrase") keys.add(termId(pack.lang, span.key));
  return [...keys];
}
