/**
 * Whether a dictionary phrase found in text is that phrase here, from its own parts of
 * speech in the source (`LanguagePack.phrasePos`) and its sentence's tags: precision
 * before recall. Language-independent: the language pack gives the phrases' parts of
 * speech, its words' (`partsOfSpeech`), its particles (`PhraseRules.particles`) and,
 * through its tagger, each word's tag and closed class (`WordRole`). Without a tagger
 * every match fits.
 */
import type { LanguagePack } from "../lexicon/language-pack";
import type { WordReading } from "../word-sense";

/** The rule a match breaks (`phraseMisfit`). */
export type PhraseRule =
  /** P1: a whole utterance and nothing else ("thank you", "see you"): only selected or saved. */
  | "utterance"
  /** P2: a verb + particle pattern whose particle is not read as an adverb ("come to Tokyo"). */
  | "particle"
  /** An adverb with a noun in it after a determiner ("what kind of music"). */
  | "adverb"
  /** A prepositional phrase inside a clause opening a noun phrase ("after all the work"). */
  | "prepositional"
  /** An interjection used as words of the sentence ("do you know", "you know the guy"). */
  | "interjection"
  /** A verb pattern whose first word is tagged otherwise in a noun phrase ("the link in"). */
  | "verb"
  /** A passive participle whose particle opens a noun phrase ("was held on Dec. 7"). */
  | "passive"
  /** An intransitive verb pattern whose particle takes a noun phrase ("fly in the morning"). */
  | "intransitive";

type FitPack = Pick<
  LanguagePack,
  "phrasePos" | "intransitive" | "partsOfSpeech" | "rules"
>;

/** A phrase's match: its pattern's key and its words. */
interface Match {
  key: string;
  /** Indices of the match's words in `readings`. */
  words: readonly number[];
}

interface Context {
  /** The pattern's own parts of speech. */
  pos: readonly string[];
  /** The pattern's words. */
  pattern: readonly string[];
  /** A pattern word's main part of speech. */
  main: (word: string | undefined) => string | undefined;
  head: WordReading;
  tail: WordReading;
  /** The word right before the match, with no punctuation between; and after it. */
  before?: WordReading;
  after?: WordReading;
}

function contextOf(
  pack: FitPack,
  { key, words }: Match,
  readings: readonly WordReading[],
): Context | undefined {
  const first = words[0]!;
  const last = words.at(-1)!;
  const head = readings[first];
  const tail = readings[last];
  if (!head || !tail) return undefined;
  const previous = readings[first - 1];
  const next = readings[last + 1];
  return {
    pos: pack.phrasePos(key),
    pattern: key.split(" "),
    main: (word) =>
      word === undefined ? undefined : pack.partsOfSpeech(word)[0],
    head,
    tail,
    ...(previous && !head.pauseBefore && { before: previous }),
    ...(next && !next.pauseBefore && { after: next }),
  };
}

/** The source's part of speech of whole utterances (rule P1). */
const UTTERANCE = "phrase";

/** Words inside a noun phrase before its noun. */
const NOUN_PHRASE: ReadonlySet<string> = new Set([
  "determiner",
  "adjective",
  "numeral",
]);

/** Word `i` comes right after a form of "be", adverbs aside ("will be held", "is not held"). */
function afterBe(readings: readonly WordReading[], i: number) {
  for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
    const word = readings[j]!;
    if (word.role?.be) return true;
    if (word.tag?.label !== "adverb" || readings[j + 1]!.pauseBefore)
      return false;
  }
  return false;
}

const ADVERB_FOLLOWERS: ReadonlySet<string> = new Set([
  "verb",
  "adjective",
  "adverb",
]);

/** A verb-final interjection before an object is the verb ("you know the guy"). */
const takesObject = (c: Context, punctuated: boolean) =>
  punctuated &&
  c.main(c.pattern.at(-1)) === "verb" &&
  c.after?.role?.object === true;

/**
 * The rule a dictionary phrase's match breaks in its sentence, or undefined when it
 * fits. Its words are then classified as words. `punctuated`: the document writes
 * commas (speech recognition does not, so where a filler ends says nothing there).
 * - P1: a pattern the source has only as a whole utterance is never highlighted.
 * - P2: a two-word verb pattern ending in a particle needs the particle read as an
 *   adverb ("find out", "give up"; not "come to" + a place, "look at"), or followed by
 *   a preposition, which a preposition does not take ("sneak out of here"); an
 *   untrusted tag keeps the match.
 * - By the phrase's main part of speech, punctuation between the phrase and a
 *   neighbour cutting the link:
 *   - adverb: not after a determiner when a word of it is mainly a noun, unless a
 *     verb, adjective or adverb follows ("what kind of music");
 *   - prepositional phrase: inside a clause, not before a noun phrase ("in Green
 *     Class"), unless it ends in a preposition; one ending in a determiner or a
 *     pronoun not before a partitive either ("after all of that"; "as a result of"
 *     stays);
 *   - interjection or particle: not after a modal or do-auxiliary ("do you know");
 *     one that does not start with a pronoun also not after a determiner, the
 *     infinitive marker or a preposition ("a big deal"); one starting with a verb not
 *     after a subject ("he got it"); one ending in a verb not before an object, in a
 *     punctuated document ("you know the guy");
 *   - verb: not when its first word is tagged as something else inside a noun
 *     phrase, after a determiner, an adjective or a number ("the link in the
 *     description", "the case up", "a deadly pile up"; elsewhere a noun tag is more
 *     often the tagger's mistake: "boyfriend break up"); not a passive participle
 *     right after "be" whose particle opens a noun phrase ("will be held on Dec. 7");
 *     not an intransitive one whose particle is tagged as a preposition before a
 *     determiner or a number.
 */
export function phraseMisfit(
  pack: FitPack,
  match: Match,
  readings: readonly WordReading[],
  punctuated: boolean,
): PhraseRule | undefined {
  const own = pack.phrasePos(match.key);
  if (own.length === 1 && own[0] === UTTERANCE) return "utterance";
  const c = contextOf(pack, match, readings);
  if (!c) return undefined;
  const { pos, pattern, head, tail, before, after } = c;
  const particles = pack.rules.particles;
  if (
    pattern.length === 2 &&
    pos.includes("verb") &&
    particles?.has(pattern[1]!) === true &&
    tail.tag !== undefined &&
    tail.tag.label !== "adverb" &&
    after?.role?.preposition !== true
  )
    return "particle";
  switch (pos[0]) {
    case "adv":
      return before?.role?.determiner &&
        pattern.some((word) => c.main(word) === "noun") &&
        !(after?.tag && ADVERB_FOLLOWERS.has(after.tag.label))
        ? "adverb"
        : undefined;
    case "prep_phrase": {
      const last = c.main(pattern.at(-1));
      if (!before || last === "preposition") return undefined;
      const quantity = last === "determiner" || last === "pronoun";
      return after?.role?.nounPhrase || (quantity && after?.role?.partitive)
        ? "prepositional"
        : undefined;
    }
    case "intj":
    case "particle": {
      const role = before?.role;
      const clause = c.main(pattern[0]) === "pronoun";
      if (
        role &&
        (role.modal ||
          (!clause &&
            (role.determiner || role.infinitive || role.preposition)) ||
          (c.main(pattern[0]) === "verb" && role.subject))
      )
        return "interjection";
      return takesObject(c, punctuated) ? "interjection" : undefined;
    }
    case "verb": {
      if (
        head.tag &&
        head.tag.label !== "verb" &&
        before?.tag !== undefined &&
        NOUN_PHRASE.has(before.tag.label)
      )
        return "verb";
      if (
        head.role?.pastParticiple &&
        afterBe(readings, match.words[0]!) &&
        after?.role?.nounPhrase
      )
        return "passive";
      if (
        tail.tag?.label === "preposition" &&
        (after?.tag?.label === "determiner" ||
          after?.tag?.label === "numeral") &&
        pack.intransitive(match.key)
      )
        return "intransitive";
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * A discourse marker's part of speech (`Span.pos`): a phrase the source also has as an
 * interjection or a particle ("you know", "I mean", "come on"), at the start of a
 * clause (the block's start, or after punctuation) and not before an object when it
 * ends in a verb, takes its interjection senses first. Undefined elsewhere.
 */
export function markerPos(
  pack: FitPack,
  match: Match,
  readings: readonly WordReading[],
  punctuated: boolean,
): string | undefined {
  const c = contextOf(pack, match, readings);
  if (!c || c.before) return undefined;
  if (!c.pos.some((pos) => pos === "intj" || pos === "particle"))
    return undefined;
  return takesObject(c, punctuated) ? undefined : "interjection";
}
