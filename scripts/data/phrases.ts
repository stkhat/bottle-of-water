// Phrase patterns (idioms, phrasal verbs, prepositional phrases) from EJDict and the
// kaikki.org English Wiktionary extract (CC BY-SA) → public/packs/en/phrases.json
// ({ detect, more, gap }) and public/packs/en-ja/phrases.json (Japanese translations).
// Usage: node scripts/data/phrases.ts [path]   (default data/raw/kaikki-en.jsonl; run ejdict.ts, kaikki.ts and frequency.ts first)
import type { DictPack, LemmaPack } from "../../src/core/packs/types.ts";
import { ENGLISH_RULES } from "../../src/core/phrases/en.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import {
  byCodeUnit,
  eachEntry,
  KAIKKI_PATH,
  readDictPacks,
  readPack,
  writePack,
  type KaikkiEntry,
  type KaikkiSense,
  type KaikkiTranslation,
} from "./common.ts";
import { PACKS } from "./formats.ts";

/** Wiktionary's words that stand for any person or thing ("make up one's mind"). */
const SLOT_WORDS: ReadonlySet<string> = new Set(ENGLISH_RULES.slots.keys());
/** Wiktionary's other spellings of slots, written as the slot in pattern keys. */
const SLOT_SPELLINGS = new Map([
  ["somebody", "someone"],
  ["sb", "someone"],
  ["sth", "something"],
  ["somebody's", "someone's"],
  ["sb's", "someone's"],
]);
/**
 * kaikki patterns starting with one of these are not detected (only selected or saved):
 * detection matches by base form, so "be on" would match every "is on" / "was on".
 */
const AUXILIARIES = new Set(["be", "have", "do"]);
const WORD = /^[a-z][a-z']*$/;
const UNUSABLE_TAGS = new Set([
  "form-of",
  "alt-of",
  "obsolete",
  "archaic",
  "misspelling",
]);
/** kaikki parts of speech whose entries are phrases. */
export const PHRASE_POS: ReadonlySet<string> = new Set([
  "phrase",
  "prep_phrase",
]);
// Glosses that only point at the words' literal meanings ("see on, the").
const LITERAL_GLOSS = /^Used other than figuratively or idiomatically/;
/** An idiomatic sense counts only when a literal word of the phrase is rarer than this rank ("in it" does not). */
const IDIOM_COMMON_RANK = 100;
/** A phrase or prepositional-phrase entry counts only when a literal word is rarer than this rank ("on the" does not). */
export const PHRASE_COMMON_RANK = 1000;
/**
 * A pair of common words is detected only when it ends in an adverb particle ("give
 * up", "find out"), not in a preposition ("come to", "live in") or another word ("very
 * well"): such pairs are mostly meant literally ("come to Tokyo").
 */
const ADVERB_PARTICLES = new Set([
  ...["up", "out", "off", "down", "back", "away", "over", "around", "round"],
  ...["about", "along", "apart", "aside", "ahead", "behind", "by", "through"],
  ...["together", "after", "across", "forward"],
]);
// The top-level headword, which kaikki writes right before the language.
const HEADWORD =
  /"word": ("(?:[^"\\]|\\.)*"), "lang": "English", "lang_code": "en"/;

/**
 * The pattern key of a headword (words lowercased, slot spellings normalized, joined by
 * single spaces), or undefined when it is not a pattern Lingo can match: each word must
 * be a slot word or a word `isWord` accepts (made of letters and apostrophes), and at
 * least one must not be a slot.
 */
export function patternKey(
  headword: string,
  isWord: (word: string) => boolean,
) {
  const parts = headword
    .trim()
    .toLowerCase()
    .split(/ +/)
    .map((part) => SLOT_SPELLINGS.get(part) ?? part);
  if (parts.length < 2) return undefined;
  let literal = false;
  for (const part of parts) {
    if (SLOT_WORDS.has(part)) continue;
    if (!WORD.test(part) || !isWord(part)) return undefined;
    literal = true;
  }
  return literal ? parts.join(" ") : undefined;
}

const hasSlot = (key: string) =>
  key.split(" ").some((word) => SLOT_WORDS.has(word));

/** A sense with a gloss of its own: not a form-of / alt-of pointer, not obsolete, archaic or a misspelling, not a literal-meaning note. */
export function isUsable(
  sense: KaikkiSense,
): sense is KaikkiSense & { glosses: [...unknown[], string] } {
  const glosses = sense.glosses;
  if (!Array.isArray(glosses) || glosses.length === 0) return false;
  const last: unknown = glosses.at(-1);
  if (typeof last !== "string" || !last.trim()) return false;
  if (LITERAL_GLOSS.test(last.trim())) return false;
  if (Array.isArray(sense.form_of) || Array.isArray(sense.alt_of)) return false;
  return !(sense.tags ?? []).some((tag) => UNUSABLE_TAGS.has(tag));
}

/** The last gloss of a usable sense: the most specific one. */
export const glossOf = (sense: { glosses: [...unknown[], string] }) =>
  sense.glosses.at(-1) as string;

function inCategory(categories: KaikkiEntry["categories"], part: string) {
  return (categories ?? []).some((category) => {
    const name = typeof category === "string" ? category : category?.name;
    return typeof name === "string" && name.toLowerCase().includes(part);
  });
}

/** Wiktionary's "non-constituents" are word sequences that are not units ("on the", "of a"). */
export function isNonConstituent(entry: KaikkiEntry) {
  return (
    inCategory(entry.categories, "non-constituents") ||
    (entry.senses ?? []).some((sense) =>
      inCategory(sense.categories, "non-constituents"),
    )
  );
}

/**
 * Whether a kaikki pattern is a pair of common words (each within PHRASE_COMMON_RANK)
 * that text mostly uses literally, so it is not detected: one that does not end in an
 * adverb particle ("very well", "come to"; not "give up").
 */
function isCommonPair(key: string, rarestRank: number) {
  const words = key.split(" ");
  return (
    words.length === 2 &&
    rarestRank <= PHRASE_COMMON_RANK &&
    !ADVERB_PARTICLES.has(words[1]!)
  );
}

/**
 * Whether a usable sense makes its entry a phrase: a phrasal verb always; an idiomatic
 * sense when a literal word is outside the top IDIOM_COMMON_RANK; a phrase or
 * prepositional phrase when a literal word is outside the top PHRASE_COMMON_RANK.
 */
function isPhraseSense(
  entry: KaikkiEntry,
  sense: KaikkiSense,
  rarestRank: number,
) {
  if (inCategory(sense.categories, "phrasal verbs")) return true;
  if (
    (sense.tags ?? []).includes("idiomatic") &&
    rarestRank > IDIOM_COMMON_RANK
  )
    return true;
  return PHRASE_POS.has(entry.pos!) && rarestRank > PHRASE_COMMON_RANK;
}

function japaneseOf(
  translations: KaikkiTranslation[] | undefined,
  out: string[],
) {
  for (const translation of translations ?? []) {
    if (translation?.lang_code !== "ja") continue;
    const word =
      typeof translation.word === "string" ? translation.word.trim() : "";
    if (word && !out.includes(word)) out.push(word);
  }
}

/** The first sense cut at the first `;`, without a final period. */
export function shortOf(text: string) {
  const semicolon = text.indexOf(";");
  const cut = (semicolon >= 0 ? text.slice(0, semicolon) : text).trim();
  return cut.endsWith(".") ? cut.slice(0, -1).trimEnd() : cut;
}

/** The rank of a word as its most common base when it is not a vocabulary word. */
export function rankOfWord(
  ranks: ReadonlyMap<string, number>,
  vocab: ReadonlySet<string>,
  lemmas: LemmaPack,
) {
  return (word: string) =>
    ranks.get(word) ??
    (vocab.has(word)
      ? Infinity
      : Math.min(
          ...[Object.hasOwn(lemmas, word) ? lemmas[word]! : []]
            .flat()
            .map((b) => ranks.get(b) ?? Infinity),
        ));
}

export interface PhrasesResult {
  phrases: PhrasePatterns;
  ja: DictPack;
  stats: {
    entries: number;
    unparsable: number;
    detect: number;
    more: number;
    /** kaikki patterns left undetected only because they are common-word pairs (isCommonPair). */
    trivial: number;
    gap: number;
    fromEjdict: number;
    fromKaikki: number;
    ja: number;
  };
}

/**
 * Builds the phrase patterns: EJDict multi-word headwords plus kaikki idioms, phrasal
 * verbs and phrases, whose words are vocabulary words, inflected forms (`lemmas`) or
 * slots. `detect` holds the patterns without a slot that pass the detection filters,
 * `more` the other ones (with a slot, kaikki ones starting with be / have / do, and
 * kaikki pairs of common words not ending in an adverb particle: `isCommonPair`), `gap`
 * the phrasal verbs among both. Japanese translations cover the kaikki patterns EJDict
 * lacks.
 *
 * The rank thresholds look at the literal words only (a slot stands for any word), and
 * rank a word outside the vocabulary (an inflected form, "beans") as its most common base
 * form; a vocabulary word keeps its own rank (Infinity when freq.json lacks it).
 */
export async function importPhrases(
  path: string,
  vocab: Iterable<string>,
  dict: DictPack,
  freq: readonly string[],
  lemmas: LemmaPack,
): Promise<PhrasesResult> {
  const words = new Set(vocab);
  const isWord = (word: string) =>
    words.has(word) || Object.hasOwn(lemmas, word);
  const rankOf = rankOfWord(
    new Map(freq.map((word, i) => [word, i + 1])),
    words,
    lemmas,
  );
  const rarestRankOf = (key: string) =>
    Math.max(
      ...key
        .split(" ")
        .filter((word) => !SLOT_WORDS.has(word))
        .map(rankOf),
    );
  interface Found {
    phrase: boolean;
    gap: boolean;
    senseJa: string[];
    topJa: string[];
    rarestRank: number;
  }
  // entries merged in file order
  const found = new Map<string, Found>();
  let entries = 0;
  const { unparsable } = await eachEntry(
    path,
    (entry) => {
      if (entry.lang_code !== "en" || !entry.word.trim().includes(" ")) return;
      entries++;
      const key = patternKey(entry.word, isWord);
      if (!key || isNonConstituent(entry)) return;
      let item = found.get(key);
      if (!item)
        found.set(
          key,
          (item = {
            phrase: false,
            gap: false,
            senseJa: [],
            topJa: [],
            rarestRank: rarestRankOf(key),
          }),
        );
      japaneseOf(entry.translations, item.topJa);
      for (const sense of entry.senses ?? []) {
        if (!isUsable(sense)) continue;
        item.phrase ||= isPhraseSense(entry, sense, item.rarestRank);
        item.gap ||= inCategory(sense.categories, "phrasal verbs");
        japaneseOf(sense.translations, item.senseJa);
      }
    },
    // Most lines are single words: skip them before parsing.
    (line) => HEADWORD.exec(line)?.[1]?.includes(" ") === false,
  );

  const startsWithAuxiliary = (key: string) =>
    AUXILIARIES.has(key.slice(0, key.indexOf(" ")));
  // EJDict headwords that a slot spelling would rename are left out: their key would
  // miss the dictionary.
  const fromEjdict = Object.keys(dict)
    .filter((key) => key.includes(" ") && patternKey(key, isWord) === key)
    .sort(byCodeUnit);
  const fromKaikki = [...found]
    .filter(([, item]) => item.phrase)
    .map(([key]) => key)
    .sort(byCodeUnit);
  const commonPair = (key: string) =>
    isCommonPair(key, found.get(key)!.rarestRank);
  const ejdictDetect = new Set(fromEjdict.filter((key) => !hasSlot(key)));
  const kaikkiCandidates = fromKaikki.filter(
    (key) => !hasSlot(key) && !startsWithAuxiliary(key),
  );
  // Left out only by isCommonPair (an EJDict headword is detected anyway).
  const trivial = kaikkiCandidates.filter(
    (key) => commonPair(key) && !ejdictDetect.has(key),
  );
  const detect = new Set([
    ...ejdictDetect,
    ...kaikkiCandidates.filter((key) => !commonPair(key)),
  ]);
  const all = new Set([...fromEjdict, ...fromKaikki]);
  const phrases = {
    detect: [...detect].sort(byCodeUnit),
    more: [...all].filter((key) => !detect.has(key)).sort(byCodeUnit),
    gap: fromKaikki.filter((key) => found.get(key)!.gap),
  };
  const ja: Record<string, [string, string[]]> = {};
  for (const key of fromKaikki) {
    if (Object.hasOwn(dict, key)) continue;
    const item = found.get(key)!;
    const translations = [...new Set([...item.senseJa, ...item.topJa])];
    if (translations.length > 0) ja[key] = [translations[0]!, translations];
  }
  return {
    phrases,
    ja,
    stats: {
      entries,
      unparsable,
      detect: phrases.detect.length,
      more: phrases.more.length,
      trivial: trivial.length,
      gap: phrases.gap.length,
      fromEjdict: fromEjdict.length,
      fromKaikki: fromKaikki.length,
      ja: Object.keys(ja).length,
    },
  };
}

async function main() {
  const dict = readDictPacks<DictPack[string]>(PACKS["en-ja"].dir);
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { phrases, ja, stats } = await importPhrases(
    path,
    readPack<string[]>("en/vocab.json"),
    dict,
    readPack<string[]>("en/freq.json"),
    readPack<LemmaPack>("en/lemmas.json"),
  );
  writePack("en/phrases.json", phrases, undefined, { lists: true });
  writePack("en-ja/phrases.json", ja);
  console.log(
    `phrases: ${stats.entries} multi-word entries (${stats.unparsable} unparsable); ` +
      `${stats.detect} detected and ${stats.more} more patterns (${stats.trivial} common-word pairs), ` +
      `${stats.gap} with a gap ` +
      `(${stats.fromEjdict} from EJDict, ${stats.fromKaikki} from kaikki); ` +
      `${stats.ja} with Japanese translations`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
