/**
 * What a word's tag says of the meaning to show: rule A1 (which of its base forms it is
 * looked up by) and the part of speech rule A2 shows senses of first. Language-
 * independent: the language pack's tagger gives the tags and the grammar (auxiliaries,
 * participles), the dictionary an outline of each headword. A pack without a tagger
 * changes nothing.
 */
import type { EntryOutline } from "./lexicon/dictionary";
import type { LanguagePack } from "./lexicon/language-pack";
import { accepts } from "./lexicon/sense-order";
import type { MatchWord } from "./phrases/matcher";
import {
  trustedTag,
  type TaggedWord,
  type TokenTag,
  type WordRole,
  type WordUse,
} from "./tagging/tagger";
import { sentenceSegments } from "./text/sentences";
import { normalizeWord, type Token } from "./text/tokenize";

/** A word as its sentence's tags read it. */
export interface WordReading {
  /** Its tag, when trusted (`trustedTag`). */
  tag?: TokenTag;
  use: WordUse;
  /** What it is among the language's closed classes (`Tagger.role`); none when untagged. */
  role?: WordRole;
  /** Punctuation comes between the word before and this one. */
  pauseBefore: boolean;
}

const NO_USE: WordUse = {
  auxiliary: false,
  verbal: false,
  prepositionSlot: false,
};

/** Punctuation between two words: the second starts a new phrase ("I mean, this", "I didn't -- I mean"). */
const PAUSE = /[,.;:!?…"“”()[\]—–]|\s-\s|--|>>/;

/**
 * Tags a block's tokens sentence by sentence, and reads how each of its words (`words`,
 * the phrase matcher's) is used. In an ALL-CAPS document (`upper`) the tagger reads the
 * text in lower case, closer to what it learned from. Empty without a tagger.
 */
export function readWords(
  pack: LanguagePack,
  tokens: readonly Token[],
  words: readonly MatchWord[],
  upper: boolean,
): WordReading[] {
  const { tagger } = pack;
  if (!tagger || words.length === 0) return [];
  const text = tokens.map((token) => token.text).join("");
  const tagAt = new Map<number, TokenTag>();
  /** Each word's sentence, by its index. */
  const sentenceOf: number[] = [];
  let t = 0;
  let w = 0;
  let sentence = 0;
  for (const { end } of sentenceSegments(text, pack.lang)) {
    const parts: Token[] = [];
    for (; t < tokens.length && tokens[t]!.start < end; t++)
      if (tokens[t]!.text.trim() !== "") parts.push(tokens[t]!);
    for (; w < words.length && words[w]!.token.start < end; w++)
      sentenceOf.push(sentence);
    sentence++;
    if (parts.length === 0) continue;
    const tags = tagger.tag(
      parts.map((part) => (upper ? part.text.toLowerCase() : part.text)),
    );
    parts.forEach((part, i) => tagAt.set(part.start, tags[i]!));
  }

  const pauses = words.map(({ token }, i) => {
    const previous = words[i - 1];
    return (
      previous !== undefined &&
      PAUSE.test(text.slice(previous.token.end, token.start))
    );
  });
  const tagged = words.map(({ token, bases }, i): TaggedWord | undefined => {
    const tag = tagAt.get(token.start);
    if (!tag) return undefined;
    const form = normalizeWord(token.text);
    return {
      form,
      bases,
      tag,
      trusted: trustedTag(tag, tagger.threshold, form, bases),
      pauseBefore: pauses[i]!,
    };
  });

  const readings: WordReading[] = [];
  let from = 0;
  while (from < words.length) {
    let to = from;
    while (to < words.length && sentenceOf[to] === sentenceOf[from]) to++;
    const group = tagged.slice(from, to);
    const complete = group.filter((word) => word !== undefined);
    const uses = complete.length === group.length ? tagger.uses(complete) : [];
    group.forEach((word, k) =>
      readings.push({
        ...(word?.trusted && { tag: word.tag }),
        use: uses[k] ?? NO_USE,
        ...(word && { role: tagger.role(word) }),
        pauseBefore: pauses[from + k]!,
      }),
    );
    from = to;
  }
  return readings;
}

/**
 * Rule A1: the key a word is looked up by, among its base forms (`bases`, the word
 * itself first when it is a headword). Undefined keeps the first one.
 * 0. An auxiliary ("has" in "has spent") keeps its own entry while that starts with a
 *    pointer, which states the grammar ("haveの三人称単数現在"); an entry that starts
 *    with a meaning of its own goes to the base ("being" → be).
 * 1. A written form that is not a headword: the base whose part of speech fits the
 *    tag, then the most frequent ("arises" → arise).
 * 2. A participle keeps its own entry when the word is not used as a verb and the
 *    entry has a meaning: before a noun ("demanding work"), a state ("was
 *    established", "are we done": "doの過去分詞", then "仕上がった"); or when it is
 *    used as a preposition where one can stand and its entry starts with one
 *    ("Including …").
 * 3. Otherwise a word tagged as an inflected verb form goes to the base that is a verb
 *    (decided → decide, wearing → wear), unless its own entry says it is a form of
 *    that base and either adds a meaning right there or has nothing but pointers
 *    ("went": "goの過去", whose lines show go's meanings after it). An entry that says
 *    so and also means other things ("saw": "seeの過去", "のこぎり") goes to the base
 *    it names. Comparatives keep their own entries ("later": 後で).
 */
export function chooseKey(
  form: string,
  bases: readonly string[],
  { tag, use }: WordReading,
  outline: (key: string) => EntryOutline | undefined,
  pack: Pick<LanguagePack, "partsOfSpeech" | "rank">,
): string | undefined {
  if (bases.length < 2) return undefined;
  const first = bases.includes(form) ? form : bases[0]!;
  const others = bases.filter((base) => base !== first);
  const fits = (base: string) =>
    tag !== undefined &&
    pack.partsOfSpeech(base).some((pos) => accepts(tag.label, pos));
  const own = outline(first);
  if (use.auxiliary) {
    if (!own || own.formOf !== undefined || !own.firstMeaning) return undefined;
    return others.find((base) => outline(base));
  }
  if (first !== form) {
    const fitting = bases.filter(fits);
    const pool = (fitting.length > 0 ? fitting : bases).filter((base) =>
      outline(base),
    );
    const best = pool.reduce<string | undefined>(
      (found, base) =>
        found === undefined || pack.rank(base) < pack.rank(found)
          ? base
          : found,
      undefined,
    );
    return best === first ? undefined : best;
  }
  // Only verb forms: a comparative keeps its own entry ("later": 後で).
  if (!own || !tag?.inflected || tag.label !== "verb") return undefined;
  // Used as an adjective, with a meaning of its own ("was established"; "are we
  // done": "doの過去分詞", then "仕上がった").
  if (use.verbal === false && own.meaning) return undefined;
  // A gerund used as a noun, whose entry has noun senses ("a large following").
  const noun = use.label;
  if (noun !== undefined && own.pos.some((pos) => accepts(noun, pos)))
    return undefined;
  // As a preposition, where its entry has one ("Including …").
  const prepositional = use.prepositionSlot && own.pos.includes("preposition");
  if (prepositional && own.firstMeaning && own.formOf === undefined)
    return undefined;
  if (own.formOf !== undefined && bases.includes(own.formOf)) {
    if (own.firstMeaning || !own.meaning) return undefined;
    return outline(own.formOf) ? own.formOf : undefined;
  }
  return others.find((base) => fits(base) && outline(base));
}

/**
 * The part of speech rule A2 shows senses of first (`Span.pos`), from a trusted tag:
 * not for an auxiliary, nor for a participle not used as a verb or kept as its own
 * entry where a preposition can stand ("Including …"): its verb tag says nothing of
 * which of its adjective or preposition senses fits. A use may give another part of
 * speech than the tag (a gerund noun).
 */
export function sensePos(
  form: string,
  key: string,
  { tag, use }: WordReading,
): string | undefined {
  if (!tag || use.auxiliary) return undefined;
  if (
    tag.label === "verb" &&
    tag.inflected &&
    (use.verbal === false || (use.prepositionSlot && key === form))
  )
    return undefined;
  const label = use.label ?? tag.label;
  return label === "other" ? undefined : label;
}
