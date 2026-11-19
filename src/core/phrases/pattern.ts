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
  /** The language writes a verb pattern's verb last and moves it in text (German). */
  readonly verbLast?: VerbLastRules;
}

/**
 * A language whose dictionary writes a verb pattern with its verb last, in the
 * infinitive ("in Kauf nehmen", "sich auf den Weg machen"), while text puts the finite
 * verb second in a main clause or first in a question or a command, the pattern's
 * other words at the end of the clause ("Er nimmt das gern in Kauf", "Mach dich auf
 * den Weg"), a separable verb's particle after them ("gibt den Löffel ab"). Text
 * writes the pattern's reflexive pronoun as the subject's ("ich mache mich auf den
 * Weg") and may put words between it and the others ("sich endlich auf den Weg
 * machen"), and "zu" before an infinitive ("in Kauf zu nehmen").
 */
interface VerbLastRules {
  /** The reflexive pronoun as patterns write it ("sich"). */
  readonly reflexive: string;
  /**
   * The pronouns text writes for it, each with the subject pronouns it agrees with in
   * its clause ("mich": ich); none for one that is always reflexive ("sich").
   */
  readonly pronouns: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * At most this many words between the moved verb, or the reflexive pronoun, and the
   * pattern's other words; none of them a word of `PhraseRules.gapStop`.
   */
  readonly maxBetween: number;
  /** The infinitive marker that may stand before the verb ("in Kauf zu nehmen"). */
  readonly infinitive: string;
}

/**
 * Pronominal verbs (Spanish "darse cuenta", unlike "dar cuenta de"; French "se rendre
 * compte"). Spanish patterns write the verb with its reflexive pronoun attached to the
 * infinitive ("darse": `ending`), text with the pronoun before a finite verb ("me di
 * cuenta", "se ha dado cuenta") or attached to an infinitive, a gerund or an
 * imperative ("darme cuenta", "dándose cuenta", "date cuenta"). French patterns write
 * the pronoun as a word before the infinitive ("se rendre compte", "s'en aller":
 * `leading`), text with any reflexive pronoun there ("je me suis rendu compte") or
 * after an imperative ("rends-toi compte": `after`).
 */
export interface ReflexiveRules {
  /** What a pattern writes after the infinitive of a pronominal verb ("darse": "se"). */
  readonly ending?: string;
  /**
   * The pronoun a pattern writes as a word of its own before the infinitive, as the
   * language spells it ("se rendre compte", "s'attendre à": "se", "s'"). Its match
   * has the text's pronoun among its words, in text order.
   */
  readonly leading?: ReadonlySet<string>;
  /** The reflexive pronouns, written before a finite verb ("me", "te", "se", "nos", "os"). */
  readonly pronouns: ReadonlySet<string>;
  /**
   * The pronouns that are reflexive only with their own subject within
   * `subjectReach` words before, no pause between ("je me suis rendu compte", "nous
   * nous rendons compte"); otherwise objects ("ça me fait plaisir") or subjects ("nous
   * rendons compte").
   */
  readonly subjects?: ReadonlyMap<string, ReadonlySet<string>>;
  readonly subjectReach?: number;
  /**
   * Other pronouns that may stand between the reflexive one and its verb ("se lo
   * tomó"; French "s'en est allé", where they may be pattern words: `s'en aller`).
   */
  readonly objects: ReadonlySet<string>;
  /**
   * Auxiliaries whose forms may stand between the pronoun and its verb ("se ha quitado
   * la vida", "me estoy dando cuenta"; "il s'est rendu compte").
   */
  readonly auxiliaries: ReadonlySet<string>;
  /** At most this many words between the pronoun and its verb (auxiliaries for `leading`). */
  readonly maxBetween: number;
  /**
   * The reflexive pronouns an imperative takes after it and a hyphen ("rends-toi
   * compte", "rendez-vous compte"), with `leading`.
   */
  readonly after?: ReadonlySet<string>;
  /**
   * The verb that a written form with a reflexive pronoun attached is a form of
   * ("darme", "dándose", "date" → "dar"), among the form's `bases`; undefined for a
   * form without one, or whose attached pronoun is no reflexive one ("dame": an
   * imperative takes "me" as its object). `lemmas`: any word's base forms. With
   * `ending` only.
   */
  attached?(
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
