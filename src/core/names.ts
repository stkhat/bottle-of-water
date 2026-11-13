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
import { own } from "./util";
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
function nameVerdict(
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
  return keptOrName(kinds, meaning());
}

/** A name keeps a capitalised meaning of its own (`nameVerdict`), or is ignored. */
const keptOrName = (kinds: string, found: CapitalMeaning | undefined) =>
  found === "word" || (found === "name" && !personName(kinds))
    ? "kept"
    : "name";

export type NameVerdict = "kept" | "name" | false;

/**
 * Rule D over a document's runs of capitalised words (`DocumentCasing.runs`): a name
 * is read whole, a given name or a surname and the capitalised words after it, and a
 * titled common noun stays a word. For a word as written on the page, with the word
 * right before it (`before`, as for `nameVerdict`):
 * - a vocabulary word the document always capitalises and rule D does not take for a
 *   name by itself (the names lexicon lacks it) is one when the document writes it
 *   right after a person's name, or after another word of one ("Harvey Specter",
 *   "Pearson Specter Litt"), and it is rare as a common word, as rule D asks of
 *   surnames (beyond rank 3,000: not Center in "Kennedy Center", News in "Fox
 *   News"); not a capitalised common word ("!"), a function word or an interjection.
 *   It keeps a capitalised meaning of its own as rule D does. Titles come before a
 *   name, so they stay words ("President Trump");
 * - a word rule D takes for a name only as a place or an organisation stays a word
 *   when the document writes it after a vocabulary word that is no name nor a
 *   function word: it is the head of a title ("Persian Gulf", "Recording Academy",
 *   "Democratic Republic").
 */
export function documentNames(
  casing: DocumentCasing,
  pack: LanguagePack,
  meaning: (key: string) => CapitalMeaning | undefined,
): (word: WordCase, before: string | undefined) => NameVerdict {
  const verdicts = new Map<string, NameVerdict>();
  /** Words a run name was found for, apart from rule D's own. */
  const fromRuns = new Set<string>();
  const runOf = (key: string) => (casing.runs && own(casing.runs, key)) ?? [];
  const asWritten = (key: string): WordCase => ({
    key,
    written: "capital",
    atStart: false,
    label: false,
    capsRun: false,
  });
  /** The word's verdict in the document, wherever it stands. */
  const verdictOf = (key: string, seen: ReadonlySet<string>): NameVerdict => {
    const known = verdicts.get(key);
    if (known !== undefined) return known;
    if (seen.has(key)) return false;
    const deeper = new Set([...seen, key]);
    const byItself = nameVerdict(asWritten(key), casing, pack, undefined, () =>
      meaning(key),
    );
    const kinds = pack.name(key) ?? "";
    let verdict = byItself;
    if (byItself === "name" && !/[gs]/.test(kinds)) {
      if (
        runOf(key).some(
          (previous) =>
            pack.lemmas(previous).length > 0 &&
            !NEVER_NAMES.has(pack.partsOfSpeech(previous)[0] ?? "") &&
            verdictOf(previous, deeper) !== "name",
        )
      )
        verdict = false;
    } else if (
      byItself === false &&
      alwaysCapitalised(casing, key) &&
      !kinds.endsWith("!") &&
      (kinds.includes("g") || pack.rank(key) > COMMON_RANK) &&
      !NEVER_NAMES.has(pack.partsOfSpeech(key)[0] ?? "") &&
      runOf(key).some(
        (previous) =>
          verdictOf(previous, deeper) === "name" &&
          (personName(pack.name(previous) ?? "") || fromRuns.has(previous)),
      )
    ) {
      verdict = keptOrName(kinds, meaning(key));
      fromRuns.add(key);
    }
    verdicts.set(key, verdict);
    return verdict;
  };
  return (word, before) => {
    if (!pack.namesByCase || casing.mode !== "mixed") return false;
    if (
      before !== undefined &&
      pack.partsOfSpeech(before).some((pos) => DETERMINERS.has(pos))
    )
      return false;
    return verdictOf(word.key, new Set());
  };
}
