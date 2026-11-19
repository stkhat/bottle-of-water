/**
 * Closed compounds (CORE mechanism; LEARNING rules per language, `CompoundRules`): a
 * language that writes a compound as one word (German "Bahnsystem", "Pizzateig",
 * "Verdauungsenzyme") makes most of a text's long words from words the vocabulary has,
 * and no frequency list or dictionary lists them all. A word the language does not
 * know is read as its last known part, the head (a noun or an adjective, which gives
 * the compound its kind and its inflection), with a modifier before it that is a word
 * itself, a verb's stem ("Schreib-tisch"), a word with a linking element
 * ("Verdauung-s-enzym", "Bund-es-präsident", "Strecke-n-netz"), or a compound in turn
 * ("Weltklima-konferenz"). The longest head is taken first. Languages that join no
 * such compounds (English, Spanish, French) have no rules, and their words are left
 * as they are.
 */
/*
 * The data scripts import this file under plain Node: it has no value imports.
 */

/** How a language joins words into closed compounds (LEARNING). */
export interface CompoundRules {
  /**
   * Linking elements a noun takes before the next part, longest first ("es", "s",
   * "en", "n", "e", "er": Bund-es-, Verdauung-s-, Strecke-n-, Kind-er-).
   */
  readonly links: readonly string[];
  /**
   * Endings a verb's infinitive has after the stem a modifier writes ("en", "n":
   * schreib-en in "Schreibtisch", wander-n in "Wanderweg").
   */
  readonly stems: readonly string[];
  /**
   * The final letter a noun drops before the next part ("e": Schul-buch, Schule;
   * Kirsch-baum, Kirsche).
   */
  readonly dropped: readonly string[];
  /** The fewest letters of a part, as written. */
  readonly minPart: number;
}

/** What a compound's split reads of the language (the pack, without compounds). */
export interface CompoundWords {
  /** A word's base forms, the likeliest first; [] when the language does not know it. */
  lemmas(word: string): readonly string[];
  /** A word's parts of speech, its main one first. */
  partsOfSpeech(word: string): readonly string[];
  /**
   * A base form's frequency rank (lower: more frequent), to choose between a verb's
   * stem and a noun that drops its final letter (`modifierParts`); without it, the verb.
   */
  rank?(base: string): number;
}

export interface Compound {
  /**
   * The compound's key: its modifier as written, link included, and its head's base
   * ("verdauungsenzyme" → "verdauungsenzym"; "windräder" → "windrad").
   */
  key: string;
  /** Each part's base, the head last: ["verdauung", "enzym"], ["welt", "klima", "konferenz"]. */
  parts: readonly string[];
  /** Its head is a noun (its likeliest base is mainly one): the compound is a noun. */
  noun: boolean;
}

/**
 * How each language that writes closed compounds joins their parts (LEARNING): German
 * links a noun with -es-, -en-, -er-, -s-, -n- or -e- ("Bundespräsident",
 * "Streckennetz", "Kinderarzt", "Verdauungsenzym", "Hundehütte"), writes a verb by its
 * stem ("Schreibtisch"), and drops a noun's final e ("Schulbuch"). Parts of three
 * letters at least, as the shortest words that make compounds ("Tee", "Rad", "Ton");
 * shorter ones match inside too many words.
 */
export const COMPOUND_RULES: Readonly<Record<string, CompoundRules>> = {
  de: {
    links: ["es", "en", "er", "s", "n", "e"],
    stems: ["en", "n"],
    dropped: ["e"],
    minPart: 3,
  },
};

/** Parts of speech a compound's head may have: it is a noun or an adjective. */
const HEADS: readonly string[] = ["noun", "adjective"];

/**
 * Parts of speech of a modifier written as a word of its own that a capitalised
 * compound keeps as written, though a noun is spelt like it ("Großprojekt": groß, not
 * Gros; "Altstar": alt).
 */
const KEPT_MODIFIERS: ReadonlySet<string> = new Set([
  ...["adjective", "adverb", "numeral", "preposition"],
]);

/**
 * Parts of speech a modifier may have: words that name or describe (Bahn-, rot-,
 * schreib-, fern-, zwei-, gegen-); not a pronoun, a determiner or another function
 * word ("euren" + "Opa" is no reading of Europa).
 */
const MODIFIERS: ReadonlySet<string> = new Set([
  ...["noun", "adjective", "verb", "adverb", "numeral", "preposition"],
]);

/** How deep a modifier may itself be a compound ("Weltklima-" in "Weltklimakonferenz"). */
const MAX_DEPTH = 2;

const mainPos = (words: CompoundWords, word: string) =>
  words.partsOfSpeech(word)[0];

/** A word's likeliest base, when its main part of speech is one of `classes`. */
function baseOf(
  words: CompoundWords,
  word: string,
  classes: ReadonlySet<string>,
): string | undefined {
  const base = words.lemmas(word)[0];
  return base !== undefined && classes.has(mainPos(words, base) ?? "")
    ? base
    : undefined;
}

/**
 * The head's base, as written (`head`): its likeliest base when that is mainly one of
 * `classes`; in a word written capitalised (`noun`: a noun, where the language
 * capitalises its nouns), the first of its bases that is mainly a noun, else that
 * likeliest one ("Lösungsangeboten": Angebot, not the participle angeboten; but
 * "reinschauen", a verb, has no noun Schau). A word that is also a verb heads one
 * only by a form at least as long as it: a shorter one is the verb's stem ("Eilles"
 * is no compound of "les", lesen; "Schäden" is Schaden's plural).
 */
function headOf(
  words: CompoundWords,
  head: string,
  classes: readonly string[],
  noun: boolean,
): string | undefined {
  const bases = words.lemmas(head);
  const fits = (base: string, kinds: readonly string[]) => {
    const pos = words.partsOfSpeech(base);
    return (
      kinds.includes(pos[0] ?? "") &&
      !(pos.includes("verb") && head.length < base.length)
    );
  };
  const nounBase = noun
    ? bases.find((base) => fits(base, NOUN) && classes.includes("noun"))
    : undefined;
  if (nounBase !== undefined) return nounBase;
  const [first] = bases;
  return first !== undefined && fits(first, classes) ? first : undefined;
}

/**
 * A modifier's parts, as written (`modifier`): a word; a verb's stem; a noun with a
 * linking element or without its dropped final letter; else a compound of its own.
 * A verb modifies by its stem, its infinitive without the ending (`stemOf`), not by
 * another of its forms ("Sprach-" is Sprache, not sprach, sprechen's past). Where the
 * stem is also a noun without its dropped final letter ("Schul-": schulen or Schule;
 * "Erd-": erden or Erde; "Mess-": messen or Messe), the more frequent of the two.
 */
function modifierParts(
  modifier: string,
  words: CompoundWords,
  rules: CompoundRules,
  depth: number,
  noun: boolean,
): readonly string[] | undefined {
  if (modifier.length < rules.minPart) return undefined;
  // In a noun, a noun before a verb or another word spelt like the modifier
  // ("Spitzen-": Spitze, not spitzen; "Firmen-": Firma), but an adjective as written.
  const written = baseOf(words, modifier, KEPT_MODIFIERS);
  const itself =
    (written === modifier ? written : undefined) ??
    (noun ? headOf(words, modifier, NOUN, true) : undefined) ??
    baseOf(words, modifier, MODIFIERS);
  const isVerb = (base: string) => mainPos(words, base) === "verb";
  const nouns = new Set(["noun"]);
  /**
   * The noun that drops its final letter before the next part; `exact`: only one whose
   * base that is, not a form of another ("Röst-" is no Rost, whose plural is Röste).
   */
  const droppedNoun = (exact = false) => {
    for (const letter of rules.dropped) {
      const found = baseOf(words, modifier + letter, nouns);
      if (found !== undefined && (!exact || found === modifier + letter))
        return found;
    }
    return undefined;
  };
  /** A verb whose stem the modifier is, or the noun that drops a letter before it. */
  const verbOrNoun = (verb: string) => {
    const other = droppedNoun(true);
    return other !== undefined &&
      words.rank !== undefined &&
      words.rank(other) < words.rank(verb)
      ? other
      : verb;
  };
  if (itself !== undefined && !isVerb(itself)) return [itself];
  if (itself !== undefined && stemOf(itself, modifier, rules))
    return [verbOrNoun(itself)];
  for (const ending of rules.stems) {
    const verb = words.lemmas(modifier + ending)[0];
    if (verb !== undefined && isVerb(verb)) return [verbOrNoun(verb)];
  }
  for (const link of rules.links) {
    const rest = modifier.slice(0, -link.length);
    if (!modifier.endsWith(link) || rest.length < rules.minPart) continue;
    const noun = baseOf(words, rest, nouns);
    if (noun !== undefined) return [noun];
  }
  const dropped = droppedNoun();
  if (dropped !== undefined) return [dropped];
  // A verb's other form, where nothing else reads the modifier.
  if (itself !== undefined) return [itself];
  if (depth >= MAX_DEPTH) return undefined;
  const inner = split(modifier, words, rules, depth + 1, NOUN, false);
  if (inner) return inner.parts;
  for (const link of rules.links) {
    const rest = modifier.slice(0, -link.length);
    if (!modifier.endsWith(link)) continue;
    const linked = split(rest, words, rules, depth + 1, NOUN, false);
    if (linked) return linked.parts;
  }
  return undefined;
}

/** Whether `modifier` is `verb`'s stem: its infinitive without an ending ("schreib-en"). */
const stemOf = (verb: string, modifier: string, rules: CompoundRules) =>
  rules.stems.some((ending) => modifier + ending === verb);

/** A modifier that is a compound in turn has a noun for its head ("Weltklima-"). */
const NOUN: readonly string[] = ["noun"];

function split(
  word: string,
  words: CompoundWords,
  rules: CompoundRules,
  depth: number,
  heads: readonly string[],
  noun: boolean,
): Compound | undefined {
  for (let i = rules.minPart; i <= word.length - rules.minPart; i++) {
    const head = headOf(words, word.slice(i), heads, noun);
    if (head === undefined) continue;
    const parts = modifierParts(word.slice(0, i), words, rules, depth, noun);
    if (parts)
      return {
        key: word.slice(0, i) + head,
        parts: [...parts, head],
        noun: words.partsOfSpeech(head)[0] === "noun",
      };
  }
  return undefined;
}

/**
 * `word` (in lower case) as a compound of words the language knows (`words`), by
 * `rules`; undefined when it is none. `noun`: the page writes it capitalised, as the
 * language writes a noun (`headOf`). Only for a word the language does not know as it
 * is: the caller asks for those.
 */
export function splitCompound(
  word: string,
  words: CompoundWords,
  rules: CompoundRules,
  noun = false,
): Compound | undefined {
  if (!/^\p{Ll}+$/u.test(word) || word.length < 2 * rules.minPart)
    return undefined;
  return split(word, words, rules, 0, HEADS, noun);
}
