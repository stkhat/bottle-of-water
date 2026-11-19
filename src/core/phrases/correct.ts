/**
 * Correcting selected words to the phrase they stand for (ui.md "Meaning in context and
 * your meanings" → "Correcting a selected phrase"): a phrase the on-device AI proposes,
 * or one the user types, becomes a key in dictionary form (verbs in their base form,
 * pronouns and possessives as the language's slots: "made up her mind" → `make up
 * one's mind`), and is kept only when that key, saved, would be highlighted in this
 * sentence where the selection is. Browser-free.
 */
import type { LanguagePack } from "../lexicon/language-pack";
import { normalizeWord, type Token } from "../text/tokenize";
import { readWords, type WordReading } from "../word-sense";
import { matchStart, type MatchInput, type MatchWord } from "./matcher";

/** Why a phrase cannot be saved for this sentence. */
type PhraseProblem =
  /** It has fewer than two words. */
  | "words"
  /** Saved, it would not be highlighted in this sentence where the selection is. */
  | "sentence";

export type PhraseFix =
  | {
      ok: true;
      /** The phrase in dictionary form: the key it is saved under. */
      key: string;
      /** Where it is in the sentence, from its first word to its last (gap included). */
      start: number;
      end: number;
    }
  | { ok: false; why: PhraseProblem };

/**
 * The words whose text overlaps `start` to `end` (exclusive), as word indices `from`
 * (inclusive) to `to` (exclusive); `from` is not below `to` when there is none.
 */
export function wordsTouched(
  words: readonly MatchWord[],
  start: number,
  end: number,
): { from: number; to: number } {
  let from = words.length;
  let to = 0;
  words.forEach(({ token }, i) => {
    if (token.end <= start || token.start >= end) return;
    from = Math.min(from, i);
    to = i + 1;
  });
  return { from, to };
}

type Pack = Pick<
  LanguagePack,
  | "lang"
  | "tokenize"
  | "lemmas"
  | "matcher"
  | "rules"
  | "patterns"
  | "partsOfSpeech"
  | "rank"
  | "basesInOrder"
  | "tagger"
>;

/** The sentence as the matcher and the tagger read it, once per check. */
interface Read {
  input: MatchInput;
  readings: readonly WordReading[];
  /** The selected words: indices `from` (inclusive) to `to` (exclusive). */
  from: number;
  to: number;
}

const wordsOf = (pack: Pick<LanguagePack, "tokenize">, text: string) =>
  pack
    .tokenize(text)
    .filter((t: Token) => t.isWord)
    .map((t) => normalizeWord(t.text));

/** `a` and `b` have the same words, as keys compare them. */
export const sameWords = (
  pack: Pick<LanguagePack, "tokenize">,
  a: string,
  b: string,
) => wordsOf(pack, a).join(" ") === wordsOf(pack, b).join(" ");

/**
 * The dictionary lists the phrase (one of the pack's patterns). The AI's proposals are
 * offered only then: the model named a whole expression right about half the time,
 * and nine times in ten when the dictionary has it (notes "Correcting a selected
 * phrase").
 */
export const isDictionaryPhrase = (
  pack: Pick<LanguagePack, "patterns">,
  key: string,
) => patternSet(pack).has(key);

/** Every pattern of the pack, once per pack (the select trie's keys). */
const known = new WeakMap<Pack["patterns"], ReadonlySet<string>>();
function patternSet(pack: Pick<LanguagePack, "patterns">): ReadonlySet<string> {
  let set = known.get(pack.patterns);
  if (!set) {
    set = new Set([...pack.patterns.detect, ...pack.patterns.more]);
    known.set(pack.patterns, set);
  }
  return set;
}

/**
 * Where `key`, saved, is highlighted in the sentence over the selection: the longest of
 * its matches whose words (first to last) take in a selected word.
 */
function place(
  pack: Pack,
  read: Read,
  key: string,
): { start: number; end: number } | undefined {
  if (!key.includes(" ")) return undefined;
  const saved = { keys: () => [key] };
  const { input, from, to } = read;
  let best: { first: number; last: number } | undefined;
  for (let i = 0; i < input.words.length; i++)
    for (const match of pack.matcher.matchesAt(input, i, "saved", saved)) {
      const first = matchStart(match);
      const last = match.words.at(-1)!;
      if (last < from || first >= to) continue;
      if (!best || last - first > best.last - best.first)
        best = { first, last };
    }
  if (!best) return undefined;
  return {
    start: input.words[best.first]!.token.start,
    end: input.words[best.last]!.token.end,
  };
}

/**
 * Where the words of `typed` are in the sentence, one after another: the run that
 * takes in a selected word, else the nearest to the selection. Word indices.
 */
function locate(
  read: Read,
  typed: readonly string[],
): { first: number; last: number } | undefined {
  const { words } = read.input;
  let best: { first: number; last: number; distance: number } | undefined;
  for (let i = 0; i + typed.length <= words.length; i++) {
    if (!typed.every((word, k) => words[i + k]!.form === word)) continue;
    const last = i + typed.length - 1;
    const distance =
      last < read.from ? read.from - last : i >= read.to ? i - read.to + 1 : 0;
    if (!best || distance < best.distance) best = { first: i, last, distance };
  }
  return best;
}

/**
 * A word of the sentence as a phrase in dictionary form writes it:
 * - a word that fills one of the language's slots, after the phrase's first word and
 *   tagged a pronoun or a determiner ("that" as a conjunction stays), as the slot: a
 *   possessive (tagged a determiner, or one in 's) as `ownSlot` when it
 *   fills it (`one's`), else `possessiveSlot` (`someone's`); another as the first slot
 *   it fills that is neither (`someone`, `something`, `oneself`);
 * - a word the tagger reads as a verb, as its base that is a verb (made → make);
 * - any other word as written.
 */
function dictionaryWord(
  pack: Pack,
  read: Read,
  i: number,
  first: boolean,
): string {
  const word = read.input.words[i]!;
  const reading = read.readings[i];
  const label = reading?.tag?.label;
  if (
    !first &&
    word.slots.length > 0 &&
    (label === "pronoun" || label === "determiner")
  ) {
    const { ownSlot, possessiveSlot } = pack.rules;
    const possessives = [ownSlot, possessiveSlot];
    const possessive =
      label === "determiner" ||
      (word.slots.includes(possessiveSlot!) && !word.slots.includes(ownSlot!));
    const slot = possessive
      ? possessives.find((s) => s !== undefined && word.slots.includes(s))
      : word.slots.find((s) => !possessives.includes(s));
    if (slot !== undefined) return slot;
  }
  if (reading?.tag?.label !== "verb") return word.form;
  const verbs = word.bases.filter(
    (base) => base !== word.form && pack.partsOfSpeech(base).includes("verb"),
  );
  const best = pack.basesInOrder
    ? verbs[0]
    : verbs.reduce<string | undefined>(
        (found, base) =>
          found === undefined || pack.rank(base) < pack.rank(found)
            ? base
            : found,
        undefined,
      );
  return best ?? word.form;
}

/**
 * The keys a phrase may stand for, likeliest first, for words the sentence has (`at`):
 * the dictionary's pattern for them, then the words in dictionary form.
 */
function keysAt(
  pack: Pack,
  read: Read,
  at: { first: number; last: number },
): string[] {
  const keys: string[] = [];
  const match = pack.matcher.matchSelection(read.input, at.first, at.last + 1);
  if (match) keys.push(match.key);
  const words: string[] = [];
  for (let i = at.first; i <= at.last; i++)
    words.push(dictionaryWord(pack, read, i, i === at.first));
  keys.push(words.join(" "));
  return keys;
}

/**
 * A phrase that corrects the selection at `start`–`end`: it takes in other words of
 * the sentence, or puts one of them as a slot (`one's`). One that only repeats the
 * selected words corrects nothing.
 */
export const corrects = (
  fix: PhraseFix,
  start: number,
  end: number,
  rules: Pick<LanguagePack["rules"], "slots">,
): fix is Extract<PhraseFix, { ok: true }> =>
  fix.ok &&
  (fix.start !== start ||
    fix.end !== end ||
    fix.key.split(" ").some((word) => rules.slots.has(word)));

/**
 * The phrase `text` (an answer of the model, or what the user typed) for the words
 * selected at `start`–`end` of `sentence`, as the key it would be saved under:
 * 1. the words of `text` found in the sentence: the dictionary's pattern for them
 *    ("put the box away" → `put away`), else those words in dictionary form ("made up
 *    her mind" → `make up one's mind`);
 * 2. `text` as written, already in dictionary form (`make up one's mind`);
 * 3. `text` without its slot words when that is one of the dictionary's patterns ("put
 *    something away" → `put away`, a phrasal verb the dictionary writes without its
 *    object).
 * The first that, saved, would be highlighted in the sentence over a selected word wins.
 */
export function correctPhrase(
  pack: Pack,
  sentence: string,
  start: number,
  end: number,
  text: string,
): PhraseFix {
  const typed = wordsOf(pack, text);
  if (typed.length < 2) return { ok: false, why: "words" };
  const tokens = pack.tokenize(sentence);
  const input = pack.matcher.prepare(tokens);
  const read: Read = {
    input,
    readings: readWords(pack as LanguagePack, tokens, input.words, false),
    ...wordsTouched(input.words, start, end),
  };
  const keys: string[] = [];
  const at = locate(read, typed);
  if (at) keys.push(...keysAt(pack, read, at));
  keys.push(typed.join(" "));
  const bare = typed.filter((word) => !pack.rules.slots.has(word));
  if (bare.length >= 2 && bare.length < typed.length) {
    const key = bare.join(" ");
    if (patternSet(pack).has(key)) keys.push(key);
  }
  for (const key of new Set(keys)) {
    const found = place(pack, read, key);
    if (found) return { ok: true, key, ...found };
  }
  return { ok: false, why: "sentence" };
}
