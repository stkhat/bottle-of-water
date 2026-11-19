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

/** The word's main part of speech makes it a function word or an interjection (`NEVER_NAMES`). */
const neverName = (pack: LanguagePack, word: string) =>
  NEVER_NAMES.has(pack.partsOfSpeech(word)[0] ?? "");

/** Parts of speech of a word that marks the next one as a common noun ("the Enlightenment"). */
const DETERMINERS: ReadonlySet<string> = new Set(["article", "determiner"]);

/**
 * The word opens a noun phrase: it is an article or a determiner, and not mainly a
 * preposition (French "de" is also the partitive article, but before a name it is
 * "of", "from": "la chambre de Clémentine", "le tunnel de Monaco").
 */
const determiner = (pack: LanguagePack, word: string) => {
  const parts = pack.partsOfSpeech(word);
  if (parts[0] !== "preposition" && parts.some((pos) => DETERMINERS.has(pos)))
    return true;
  if (!pack.nounsCapitalised) return false;
  // German: a determiner's inflected form ("keine", "deinen"), a numeral ("zehn
  // Mark"), and a preposition joined to the article ("im Ernst", "zum Wolf").
  const base = pack.lemmas(word)[0];
  return (
    (base !== undefined &&
      pack
        .partsOfSpeech(base)
        .some((pos) => DETERMINERS.has(pos) || pos === "numeral")) ||
    pack.rules.contractions?.has(word) === true
  );
};

/**
 * A word ranked within this many as a common word is, when capitalised inside a name,
 * mostly a titled common noun (World Cup, Central Park, Space Center), unless the
 * lexicon has it as a given name (Mike, Frank).
 */
const COMMON_RANK = 3000;

/**
 * The lexicon's kinds make the word a name: a given name, or a surname, a place or an
 * organisation that is rare as a common word (Trump, Badger, Thatcher), or that the
 * language's own sentences write capitalised mostly ("c": Chile, Japón, where a
 * case-folded frequency list ranks the common word "chile" by the country). Names of
 * other kinds (the World, the Senate, Scrooge) never are.
 */
function nameKinds(kinds: string, rank: number) {
  if (kinds.includes("g")) return true;
  return /[spo]/.test(kinds) && (rank > COMMON_RANK || kinds.includes("c"));
}

/**
 * In a language that capitalises every noun (`LanguagePack.nounsCapitalised`: German),
 * a capital says nothing of a name by itself, and nouns are as often surnames and
 * places as they are rare (Klima, Hanf, Gouda, Burg): a word is a name by itself only
 * as a given name (Dietrich, Jasmin, Marie), and only as written, not as another
 * word's inflected form the lexicon also lists as a name (Wolken, Mengen, Bergen:
 * plurals of Wolke, Menge, Berg).
 */
const nounsNameKinds = (pack: LanguagePack, key: string, kinds: string) => {
  const base = pack.lemmas(key)[0];
  return kinds.includes("g") && (base === undefined || base === key);
};

/** A person's name first: a given name or a surname, and not mainly a place or an organisation. */
const personName = (kinds: string) =>
  /[gs]/.test(kinds) && !/^[po]/.test(kinds);

/**
 * Whether a vocabulary word is a name in its document by itself, and what then becomes
 * of it. `meaning` is what the dictionary's capitalised headword means
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
  meaning: () => CapitalMeaning | undefined,
): "kept" | "name" | false {
  if (!pack.namesByCase || !alwaysCapitalised(casing, word.key)) return false;
  const kinds = pack.name(word.key);
  if (
    kinds === undefined ||
    kinds.endsWith("!") ||
    !(pack.nounsCapitalised
      ? nounsNameKinds(pack, word.key, kinds)
      : nameKinds(kinds, pack.rank(word.key)))
  )
    return false;
  if (neverName(pack, word.key)) return false;
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
 * right before it when only spaces come between them (`before`; after a determiner, a
 * word with a meaning is a titled common noun, "the Enlightenment", not a name):
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
 *
 * In a language that capitalises common words only in names and titles
 * (`LanguagePack.capitalsForNames`: Spanish and French, not English, whose Democrats and Christians are
 * common words), a word the names lexicon lacks and the language knows only as an
 * inflected form of another word (no vocabulary word itself) is a name, as one the
 * lexicon has as a place would be, when the document always capitalises it and the
 * form's reading is
 * unlikely: every base is rare as a common word (beyond rank 3,000) and no noun
 * ("Bruna", not bruno's feminine; "Afores", not aforar: a noun's plural in a title is
 * that noun, "Parque de Atracciones"), or the document writes it right after a
 * capitalised word the language does not know at all, a foreign name or title
 * ("Stephen Hales", not halar; "My Salad", not salar). Not a form of a function word,
 * and not in a document without punctuation, whose speech recognition capitalises
 * turn starts ("Imagínate", "Mola"). A form that is a common word's ("Estados",
 * "Fuerzas Armadas") stays a word.
 */
export function documentNames(
  casing: DocumentCasing,
  pack: LanguagePack,
  meaning: (key: string) => CapitalMeaning | undefined,
): (word: WordCase, before: string | undefined) => NameVerdict {
  const verdicts = new Map<string, NameVerdict>();
  /** Words a run name was found for, apart from rule D's own. */
  const fromRuns = new Set<string>();
  /**
   * Where every noun is capitalised (`LanguagePack.nounsCapitalised`), a word after a
   * person's name is a name of theirs only when the lexicon has it as a person's name
   * (Kohl, Wolf, Beck), or when it is no noun at all, which a capital then marks as a
   * name (Klopp, not klopfen's form; Styles): German puts nouns after a name too
   * ("bei Hans Illustrierte", "lieber Reinhold Briefe zu schreiben").
   */
  const nounReading = (key: string) =>
    [key, ...pack.lemmas(key)].some((word) =>
      pack.partsOfSpeech(word).includes("noun"),
    );
  const surnameAfterName = (key: string, kinds: string) =>
    /[gs]/.test(kinds) || !nounReading(key);
  /**
   * There, a noun is a surname only right after the name it follows (`before`: "Robert
   * Kohl", "Julian Wolf"), not wherever the document writes it ("Kaiser Franz Joseph",
   * though "Franz Josef Kaiser" was crowned): a capital does not tell the noun from the
   * name elsewhere. A word with no noun reading (Klopp), or one rare as a common
   * word (Einstein, Kohl; rule D's rank), is a name throughout.
   */
  const runHere = (key: string, before: string | undefined) =>
    !pack.nounsCapitalised ||
    !fromRuns.has(key) ||
    !nounReading(key) ||
    pack.rank(key) > COMMON_RANK ||
    (before !== undefined &&
      verdictOf(before, new Set()) === "name" &&
      (personName(pack.name(before) ?? "") || fromRuns.has(before)));
  const runOf = (key: string) => (casing.runs && own(casing.runs, key)) ?? [];
  const asWritten = (key: string): WordCase => ({
    key,
    written: "capital",
    atStart: false,
    label: false,
    capsRun: false,
  });
  /** Rule D for a capitalised inflected form the names lexicon lacks (`documentNames`). */
  const formName = (key: string) => {
    if (
      !pack.capitalsForNames ||
      casing.unpunctuated === true ||
      pack.name(key) !== undefined ||
      !alwaysCapitalised(casing, key)
    )
      return false;
    const bases = pack.lemmas(key);
    if (bases.length === 0 || bases.includes(key)) return false;
    if (bases.some((base) => neverName(pack, base))) return false;
    return (
      bases.every(
        (base) =>
          pack.rank(base) > COMMON_RANK &&
          pack.partsOfSpeech(base)[0] !== "noun",
      ) || runOf(key).some((previous) => pack.lemmas(previous).length === 0)
    );
  };
  /** The word's verdict in the document, wherever it stands. */
  const verdictOf = (key: string, seen: ReadonlySet<string>): NameVerdict => {
    const known = verdicts.get(key);
    if (known !== undefined) return known;
    if (seen.has(key)) return false;
    const deeper = new Set([...seen, key]);
    const byItself =
      nameVerdict(asWritten(key), casing, pack, () => meaning(key)) ||
      (formName(key) && keptOrName("", meaning(key)));
    const kinds = pack.name(key) ?? "";
    let verdict = byItself;
    if (byItself === "name" && !/[gs]/.test(kinds)) {
      if (
        runOf(key).some(
          (previous) =>
            pack.lemmas(previous).length > 0 &&
            !neverName(pack, previous) &&
            verdictOf(previous, deeper) !== "name",
        )
      )
        verdict = false;
    } else if (
      byItself === false &&
      alwaysCapitalised(casing, key) &&
      !kinds.endsWith("!") &&
      (pack.nounsCapitalised
        ? surnameAfterName(key, kinds)
        : kinds.includes("g") || pack.rank(key) > COMMON_RANK) &&
      !neverName(pack, key) &&
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
  /**
   * After a determiner, in a language that capitalises only names
   * (`capitalsForNames`): a word the document always capitalises that the language
   * knows only as a verb's form (no vocabulary word of another part of speech, and
   * every base mainly a verb) is a name, since a determiner opens a noun phrase ("los
   * Andes", not andar; "la Lucía", not lucir; "la Ultimate", not ultimar). A participle
   * used as a noun has a base that is no verb ("los Desaparecidos": desaparecido), so
   * it stays a word.
   */
  /**
   * A word of a speaker label (`WordCase.speaker`: "[Paulina] ¿Cómo?") is a name when
   * the names lexicon has it as a person's name first, a given name or a surname rare
   * as a common word (rule D's kinds), though the brackets say nothing of how the
   * document writes it (not paulino's "Pauline"); a sound label's or a title's words
   * are none ("[Música]", "[Music]", "[Speaker]", "[Home Secretary]").
   */
  const speakerName = (key: string): NameVerdict => {
    const kinds = pack.name(key) ?? "";
    if (
      !personName(kinds) ||
      !nameKinds(kinds, pack.rank(key)) ||
      kinds.endsWith("!") ||
      neverName(pack, key)
    )
      return false;
    return keptOrName(kinds, meaning(key));
  };
  const verbAfterDeterminer = (key: string): NameVerdict => {
    const kinds = pack.name(key) ?? "";
    if (
      !pack.capitalsForNames ||
      casing.unpunctuated === true ||
      kinds.endsWith("!") ||
      !alwaysCapitalised(casing, key) ||
      neverName(pack, key) ||
      pack.partsOfSpeech(key).some((pos) => pos !== "verb")
    )
      return false;
    const bases = pack.lemmas(key).filter((base) => base !== key);
    if (
      bases.length === 0 ||
      bases.some((base) => pack.partsOfSpeech(base)[0] !== "verb")
    )
      return false;
    return keptOrName(kinds, meaning(key));
  };
  /**
   * After a determiner, a place's name that the language's own sentences write
   * capitalised mostly (the names lexicon's "p" and "c") is still a name, where the
   * document always capitalises it: place names take an article in many languages
   * ("la France", "le Japon", "du Mali", "les Alpes"; Spanish "la India", "los
   * Andes"; English "the Alps", "the Netherlands"), while a titled common noun is no
   * place ("the Enlightenment", "la République").
   */
  const placeAfterDeterminer = (key: string): NameVerdict => {
    const kinds = pack.name(key) ?? "";
    if (
      pack.nounsCapitalised ||
      !kinds.includes("p") ||
      !kinds.includes("c") ||
      kinds.endsWith("!") ||
      !alwaysCapitalised(casing, key) ||
      neverName(pack, key)
    )
      return false;
    return keptOrName(kinds, meaning(key));
  };
  return (word, before) => {
    if (!pack.namesByCase || casing.mode !== "mixed") return false;
    const speaker = word.speaker === true && speakerName(word.key);
    if (speaker) return speaker;
    if (before !== undefined && determiner(pack, before))
      return placeAfterDeterminer(word.key) || verbAfterDeterminer(word.key);
    const verdict = verdictOf(word.key, new Set());
    return runHere(word.key, before) ? verdict : false;
  };
}
