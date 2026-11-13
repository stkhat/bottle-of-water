import { normalizeWord } from "../text/tokenize";
import { decodePhrasePos } from "./phrase-pos";
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
  /**
   * Adverbial particles and prepositions that complete a verb ("give up", "come to"):
   * a two-word verb pattern ending in one is highlighted only where the tagger reads
   * it as an adverb (rule P2). None for a language without phrasal verbs.
   */
  readonly particles?: ReadonlySet<string>;
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
  /**
   * The patterns' own parts of speech in the source (kaikki's names: verb, adv,
   * prep_phrase, intj, particle, phrase, noun, adj…), main one first, one code per
   * pattern of `detect` and of `more`, in their order, separated by single spaces
   * (`phrase-pos.ts`: "v vi P -").
   */
  readonly pos?: { readonly detect: string; readonly more: string };
  /**
   * Verb patterns whose senses the source marks intransitive and never transitive,
   * sorted ("fly in"; weak data: most senses are marked neither way).
   */
  readonly intransitive?: readonly string[];
}

/** Each pattern's parts of speech (`PhrasePatterns.pos`), by its key; none without. */
export function phrasePosIndex(
  patterns: PhrasePatterns,
): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, readonly string[]>();
  if (!patterns.pos) return index;
  for (const list of ["detect", "more"] as const) {
    const codes = patterns.pos[list].split(" ");
    patterns[list].forEach((key, i) => {
      const pos = decodePhrasePos(codes[i] ?? "-");
      if (pos.length > 0) index.set(key, pos);
    });
  }
  return index;
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
