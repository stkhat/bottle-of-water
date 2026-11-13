/**
 * Rule D: names by document casing. A word the document always capitalises (inside
 * sentences, and never in lower case) is a name there when the language's names
 * lexicon has it as a name and not as a capitalised common word. In a caseless
 * document (ALL-CAPS captions, lower-case speech recognition) nothing is a name.
 * Language-independent: the language pack gives the lexicon, the parts of speech and
 * whether its language reads names from case at all.
 */
import type { CapitalMeaning } from "./lexicon/dictionary";
import type { LanguagePack } from "./lexicon/language-pack";
import {
  alwaysCapitalised,
  type DocumentCasing,
  type WordCase,
} from "./text/casing";

/**
 * A word whose main part of speech is one of these is a function word or an
 * interjection, never a name (The, Yes, Oh). Its main part of speech is the first the
 * language pack lists.
 */
const NEVER_NAMES: ReadonlySet<string> = new Set([
  "article",
  "determiner",
  "pronoun",
  "preposition",
  "postposition",
  "conjunction",
  "particle",
  "contraction",
  "interjection",
]);

/** Parts of speech of a word that marks the next one as a common noun ("the Enlightenment"). */
const DETERMINERS: ReadonlySet<string> = new Set(["article", "determiner"]);

/**
 * A word ranked within this many as a common word is, when capitalised inside a name,
 * mostly a titled common noun (World Cup, Central Park, Space Center), unless the
 * lexicon has it as a given name (Mike, Frank).
 */
const COMMON_RANK = 3000;

/**
 * The lexicon's kinds make the word a name: a given name, or a surname, a place or an
 * organisation that is rare as a common word (Trump, Badger, Thatcher). Names of other
 * kinds (the World, the Senate, Scrooge) never are.
 */
function nameKinds(kinds: string, rank: number) {
  if (kinds.includes("g")) return true;
  return /[spo]/.test(kinds) && rank > COMMON_RANK;
}

/** A person's name first: a given name or a surname, and not mainly a place or an organisation. */
const personName = (kinds: string) =>
  /[gs]/.test(kinds) && !/^[po]/.test(kinds);

/**
 * Whether a vocabulary word is a name in its document, and what then becomes of it.
 * `before` is the word right before it when only spaces come between them: after a
 * determiner, a word with a meaning is a titled common noun ("the Enlightenment"), not
 * a name. `meaning` is what the dictionary's capitalised headword means
 * (`DictionaryProvider.capitalMeaning`).
 *
 * - "kept": a name with a meaning of its own stays a word and shows it: a gloss that
 *   says what it is (June → 6月), or the name written in the native language for a
 *   word that is not a person's name first (Germany → ドイツ, Miami → マイアミ; not
 *   Philip → ピリポ, Helen → ヘレン).
 * - "name": any other name (Mark, Helen) is ignored: no highlight, no hover.
 * - false: not a name.
 */
export function nameVerdict(
  word: WordCase,
  casing: DocumentCasing,
  pack: LanguagePack,
  before: string | undefined,
  meaning: () => CapitalMeaning | undefined,
): "kept" | "name" | false {
  if (!pack.namesByCase || !alwaysCapitalised(casing, word.key)) return false;
  const kinds = pack.name(word.key);
  if (
    kinds === undefined ||
    kinds.endsWith("!") ||
    !nameKinds(kinds, pack.rank(word.key))
  )
    return false;
  const main = pack.partsOfSpeech(word.key)[0];
  if (main !== undefined && NEVER_NAMES.has(main)) return false;
  if (
    before !== undefined &&
    pack.partsOfSpeech(before).some((pos) => DETERMINERS.has(pos))
  )
    return false;
  const found = meaning();
  return found === "word" || (found === "name" && !personName(kinds))
    ? "kept"
    : "name";
}
