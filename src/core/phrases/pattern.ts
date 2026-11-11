import { normalizeWord } from "../text/tokenize";
/**
 * How one language's phrase patterns match text: which words are slots, what fills
 * them, and how many words a phrasal verb may have between its parts.
 */
export interface PhraseRules {
  /**
   * Slot word → the words that fill it (lowercase, written with '). A slot is also
   * filled by the slot word itself ("one's" in "make up one's mind").
   */
  readonly slots: ReadonlyMap<string, ReadonlySet<string>>;
  /** The slot that also takes any word ending in 's or ’s ("Anna's" for "someone's"). */
  readonly possessiveSlot?: string;
  /** Words ending in 's that are not possessives ("it's", "let's"). */
  readonly notPossessive?: ReadonlySet<string>;
  /** Words a gap pattern may have after its first word ("figure it out"). */
  readonly maxGap: number;
  /**
   * Words that end a gap: a conjunction or a subject starts another clause, so "lock
   * file and kept in" is not `lock in` and "figure we'll find out" is not `figure out`.
   */
  readonly gapStop?: ReadonlySet<string>;
}

/**
 * A language's phrase patterns (`<lang>/phrases.json`), each a key of words joined by
 * single spaces, slot words such as "one's" standing for any filler. `detect` and `more`
 * are disjoint, each sorted by code unit, and together are every pattern; `gap` is a
 * sorted subset of them.
 */
export interface PhrasePatterns {
  /** Highlighted without being saved: no slots, and the pack's filters passed. */
  readonly detect: readonly string[];
  /** Matched only for saved phrases and selections. */
  readonly more: readonly string[];
  /** Phrasal verbs: words may come after the first word. */
  readonly gap: readonly string[];
}

interface PatternWord {
  /** The word, normalized (`normalizeWord`). */
  readonly text: string;
  /** Filled by the slot's words instead of matching a token's forms. */
  readonly slot: boolean;
}

export interface Pattern {
  readonly key: string;
  readonly words: readonly PatternWord[];
}

/** No slots and no gaps: every pattern word is literal. */
export const NO_RULES: PhraseRules = { slots: new Map(), maxGap: 0 };

/** A key's words, each a slot when the rules name it one. The key is kept as given. */
export function parsePattern(key: string, rules: PhraseRules): Pattern {
  return {
    key,
    words: key.split(" ").map((word) => {
      const text = normalizeWord(word);
      return { text, slot: rules.slots.has(text) };
    }),
  };
}
