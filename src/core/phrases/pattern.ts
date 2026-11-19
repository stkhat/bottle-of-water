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
  /**
   * The slot a possessive determiner of a selected phrase becomes in its dictionary
   * form ("her" in "made up her mind" → "one's"; `phrases/correct.ts`). A possessive
   * that does not fill it ("Anna's") becomes `possessiveSlot`.
   */
  readonly ownSlot?: string;
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
  /**
   * The particles that are never adverbs, only prepositions or the infinitive marker
   * ("at", "of", "to", "with"): P2 needs no tag to drop a verb pattern ending in one.
   */
  readonly prepositions?: ReadonlySet<string>;
  /** Pronominal verbs: how patterns and text write a verb with its reflexive pronoun. */
  readonly reflexive?: ReflexiveRules;
  /**
   * Contractions of a preposition and an article, by the preposition ("al" → "a",
   * "del" → "de"). Such a word stands for its preposition only as a pattern's last
   * word, where the article opens what follows ("a través del tiempo" is `a través
   * de`); inside a pattern the article would be missing from it ("al tiempo" is no `a
   * tiempo`).
   */
  readonly contractions?: ReadonlyMap<string, string>;
  /**
   * The language puts adjectives after the noun ("al día siguiente"): a pattern ending
   * in a noun that an adjective follows is that noun phrase, read word by word.
   */
  readonly adjectivesAfterNouns?: boolean;
}

/**
 * Pronominal verbs (Spanish "darse cuenta", unlike "dar cuenta de"): a pattern writes
 * the verb with its reflexive pronoun attached to the infinitive ("darse"), text with
 * the pronoun before a finite verb ("me di cuenta", "se ha dado cuenta") or attached
 * to an infinitive, a gerund or an imperative ("darme cuenta", "dándose cuenta",
 * "date cuenta").
 */
export interface ReflexiveRules {
  /** What a pattern writes after the infinitive of a pronominal verb ("darse": "se"). */
  readonly ending: string;
  /** The reflexive pronouns, written before a finite verb ("me", "te", "se", "nos", "os"). */
  readonly pronouns: ReadonlySet<string>;
  /** Other pronouns that may stand between the reflexive one and its verb ("se lo tomó"). */
  readonly objects: ReadonlySet<string>;
  /**
   * Auxiliaries whose forms may stand between the pronoun and its verb ("se ha quitado
   * la vida", "me estoy dando cuenta").
   */
  readonly auxiliaries: ReadonlySet<string>;
  /** At most this many words between the pronoun and its verb. */
  readonly maxBetween: number;
  /**
   * The verb that a written form with a reflexive pronoun attached is a form of
   * ("darme", "dándose", "date" → "dar"), among the form's `bases`; undefined for a
   * form without one, or whose attached pronoun is no reflexive one ("dame": an
   * imperative takes "me" as its object). `lemmas`: any word's base forms.
   */
  attached(
    form: string,
    bases: readonly string[],
    lemmas: (word: string) => readonly string[],
  ): string | undefined;
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
