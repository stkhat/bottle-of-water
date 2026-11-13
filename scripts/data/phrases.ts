// Phrase patterns from EJDict and the kaikki.org English Wiktionary extract (CC BY-SA)
// → public/packs/en/phrases.json ({ detect, more, gap, pos, intransitive }) and
// public/packs/en-ja/phrases.json (Japanese meanings from Wiktionary's translation
// tables). See docs/specs/architecture.md "Phrase data".
//
// - B1: every multi-word entry with a sense of its own is a pattern, at any word rank,
//   matchable on selection; a multi-word noun or name needs a translation table or an
//   occurrence in the example corpus (most unattested compounds are technical).
// - B2: an idiomaticity score decides which patterns are highlighted (`detect`);
//   B2b: transparent compounds are not; B4: named entities are not.
// - C1: a phrase's Japanese meanings keep up to four of its senses, each with its
//   English sense as a 《hint》, best senses first (rule C2), with their parts of speech.
// Usage: node scripts/data/phrases.ts [path]   (default data/raw/kaikki-en.jsonl; run ejdict.ts and kaikki.ts first)
import { cleanDefinition } from "../../src/core/lexicon/definitions.ts";
import { encodeSenseLabels } from "../../src/core/lexicon/sense-labels.ts";
import type { DictPack, LemmaPack } from "../../src/core/packs/types.ts";
import { ENGLISH_RULES } from "../../src/core/phrases/en.ts";
import { encodePhrasePos } from "../../src/core/phrases/phrase-pos.ts";
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
} from "./common.ts";
import { readEjdictText, titleCasePhrases } from "./ejdict.ts";
import { countExamples, phraseVariants } from "./examples.ts";
import { PACKS } from "./formats.ts";
import {
  ENGLISH_PHRASES,
  glossTokens,
  idiomaticity,
  JAPANESE_GLOSSES,
  STEM,
  thresholdFor,
  transparent,
  type NativeGlosses,
  type PatternEvidence,
  type PhraseLanguage,
} from "./idiomaticity.ts";
import {
  categoryNames,
  entrySenses,
  LITERAL_NOTE,
  rankSenses,
  senseLabelOf,
  type RankedSense,
  type SourceSense,
} from "./senses.ts";

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
 * Patterns starting with one of these are not detected (only selected or saved):
 * detection matches by base form, so "be on" would match every "is on" / "was on".
 */
const AUXILIARIES = new Set(["be", "have", "do"]);
const WORD = /^[a-z][a-z']*$/;
/** A possessive makes a word of a word ("for God's sake"). */
const POSSESSIVE = "'s";
/** A gloss naming a slot: the sense takes an object ("To surrender (someone or something)"). */
const OBJECT_GLOSS = /\b(something|someone|somebody|sth|sb)\b/;
/** Senses of a word read for its gloss bag (what its own definitions say). */
const WORD_SENSES = 12;
/** The source's most frequent gloss tokens are its stopwords (no list per language). */
const GLOSS_STOPWORDS = 200;
/** …and the most frequent of all are function words, which name nothing. */
const FUNCTION_TOKENS = 50;
/** C1: senses kept per phrase, translated words kept per sense, length of a hint. */
const JA_SENSES = 4;
const JA_WORDS = 3;
const HINT_LENGTH = 60;

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
    .replace(/’/g, "'")
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
  if (LITERAL_NOTE.test(last.trim())) return false;
  if (Array.isArray(sense.form_of) || Array.isArray(sense.alt_of)) return false;
  return !(sense.tags ?? []).some((tag) =>
    ["form-of", "alt-of", "obsolete", "archaic", "misspelling"].includes(tag),
  );
}

/** The last gloss of a usable sense: the most specific one. */
export const glossOf = (sense: { glosses: [...unknown[], string] }) =>
  sense.glosses.at(-1) as string;

const inCategory = (names: readonly string[], part: string) =>
  names.some((name) => name.toLowerCase().includes(part));

/** Wiktionary's "non-constituents" are word sequences that are not units ("on the", "of a"). */
export function isNonConstituent(entry: KaikkiEntry) {
  return (
    inCategory(categoryNames(entry.categories), "non-constituents") ||
    (entry.senses ?? []).some((sense) =>
      inCategory(categoryNames(sense.categories), "non-constituents"),
    )
  );
}

/** Title Case in every word: a named entity as written ("New York", "Catholic Church"). */
const titleCase = (written: string) =>
  written.split(/ +/).every((word) => /^\p{Lu}/u.test(word));

/** What the source says of one pattern, over all its entries. */
interface Collected {
  /** How its entries with a sense write it. */
  written: Set<string>;
  /** Senses with a meaning of their own, in source order. */
  senses: SourceSense[];
  /** Usable senses per part of speech, in the order the entries come. */
  pos: Map<string, number>;
  /** Japanese words of entry-level tables no sense's label matches, with the entry's part of speech. */
  looseJa: [word: string, label: string, pos: string][];
  literalNote: boolean;
  nonConstituent: boolean;
  /** Every entry with a sense is a proper noun. */
  allName: boolean;
  gap: boolean;
  /** The verb entries' senses: some take an object, some are marked intransitive. */
  transitive: boolean;
  intransitive: boolean;
}

/** What the source's single-word entries say: their glosses, and the source's gloss vocabulary. */
interface WordGlosses {
  /** Lowercase word → its first usable glosses (not proper nouns). */
  glosses: Map<string, string[]>;
  /** Gloss token → occurrences over every single-word sense. */
  tokens: Map<string, number>;
}

/** One pass over the extract: the multi-word entries (by pattern key) and the words' glosses. */
async function readSource(
  path: string,
  isWord: (word: string) => boolean,
  needed: ReadonlySet<string>,
  language: PhraseLanguage,
) {
  const patterns = new Map<string, Collected>();
  const words: WordGlosses = { glosses: new Map(), tokens: new Map() };
  let entries = 0;
  const { unparsable } = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    const headword = entry.word.trim();
    const pos = entry.pos ?? "";
    if (!headword.includes(" ")) {
      readWord(entry, headword, pos, needed, language, words);
      return;
    }
    entries++;
    const key = patternKey(headword, isWord);
    if (!key) return;
    let item = patterns.get(key);
    if (!item)
      patterns.set(
        key,
        (item = {
          written: new Set(),
          senses: [],
          pos: new Map(),
          looseJa: [],
          literalNote: false,
          nonConstituent: false,
          allName: true,
          gap: false,
          transitive: false,
          intransitive: false,
        }),
      );
    item.nonConstituent ||= isNonConstituent(entry);
    if (
      (entry.senses ?? []).some((sense) =>
        LITERAL_NOTE.test(String(sense.glosses?.at(-1) ?? "").trim()),
      )
    )
      item.literalNote = true;
    const { senses, looseJa } = entrySenses(entry, item.senses.length);
    const own = senses.filter((sense) => sense.target === undefined);
    item.senses.push(...own);
    item.looseJa.push(
      ...looseJa.map(
        ([word, label]) => [word, label, pos] as [string, string, string],
      ),
    );
    if (own.length === 0) return;
    item.written.add(headword.replace(/’/g, "'"));
    item.pos.set(pos, (item.pos.get(pos) ?? 0) + own.length);
    if (!language.name.has(pos)) item.allName = false;
    for (const sense of own) {
      item.gap ||= inCategory(sense.categories, "phrasal verbs");
      if (pos !== "verb") continue;
      if (
        sense.tags.includes("transitive") ||
        sense.tags.includes("ditransitive") ||
        OBJECT_GLOSS.test(sense.gloss)
      )
        item.transitive = true;
      else if (sense.tags.includes("intransitive")) item.intransitive = true;
    }
  });
  return { patterns, words, entries, unparsable };
}

function readWord(
  entry: KaikkiEntry,
  word: string,
  pos: string,
  needed: ReadonlySet<string>,
  language: PhraseLanguage,
  words: WordGlosses,
) {
  for (const sense of entry.senses ?? []) {
    const gloss: unknown = sense.glosses?.at(-1);
    if (typeof gloss !== "string") continue;
    for (const [token] of gloss.toLowerCase().matchAll(/[a-z]+/g))
      words.tokens.set(token, (words.tokens.get(token) ?? 0) + 1);
  }
  if (
    word !== word.toLowerCase() ||
    !needed.has(word) ||
    language.name.has(pos)
  )
    return;
  let list = words.glosses.get(word);
  if (!list) words.glosses.set(word, (list = []));
  for (const sense of entrySenses(entry).senses) {
    if (list.length >= WORD_SENSES) break;
    if (!sense.inflection) list.push(sense.gloss);
  }
}

export interface PhraseInputs {
  /** The words Lingo knows. */
  vocab: Iterable<string>;
  lemmas: LemmaPack;
  /** EJDict, whose multi-word headwords are patterns too. */
  dict: DictPack;
  /** EJDict's multi-word headwords written only in Title Case (lowercase keys). */
  titleCase?: ReadonlySet<string>;
  /** How the pair's native glosses compare (Japanese for EJDict and the translation tables). */
  native?: NativeGlosses;
  language?: PhraseLanguage;
  /**
   * How many of the source's most frequent gloss tokens are stopwords, and how many
   * function words (the defaults fit the full English extract).
   */
  stopwords?: { gloss: number; function: number };
}

/** One pattern's evidence and verdict, for the statistics and the measurements. */
export interface PatternVerdict {
  key: string;
  evidence: PatternEvidence;
  score: number;
  threshold: number;
  named: boolean;
  transparent: boolean;
  /** The source files it under phrasal verbs. */
  phrasalVerb: boolean;
  detect: boolean;
}

export interface PhrasesResult {
  phrases: PhrasePatterns;
  /** en-ja/phrases.json: [short, senses, sense labels] */
  ja: Record<string, [string, string[], string]>;
  verdicts: PatternVerdict[];
  stats: {
    entries: number;
    unparsable: number;
    detect: number;
    more: number;
    /** Patterns the score leaves to selections (no slot, no auxiliary, not named or transparent). */
    belowThreshold: number;
    named: number;
    transparent: number;
    /** Multi-word nouns and names left out: no table, no example. */
    unattested: number;
    withPos: number;
    gap: number;
    fromEjdict: number;
    fromKaikki: number;
    ja: number;
  };
}

/**
 * C1: a translation sense's hint, its English sense label without wiki marks, leading
 * labels or a table number ("(''intransitive'') To return (1)" → "To return"), cut at
 * a word boundary.
 */
function hintOf(label: string) {
  const plain = label
    .replace(/'{2,}/g, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  const text = (cleanDefinition(plain) ?? plain).replace(/\.$/, "");
  if (text.length <= HINT_LENGTH) return text;
  const cut = text.slice(0, HINT_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${space > 20 ? cut.slice(0, space) : cut}…`;
}

/**
 * C1: a phrase's Japanese meanings from the translation tables, grouped by the English
 * sense they translate, the best ranked sense first (rule C2): up to JA_SENSES senses
 * of up to JA_WORDS words, written "《hint》word,word" (EJDict's note style), with the
 * part of speech of the sense each translates. Undefined without Japanese.
 */
export function japaneseSenses(
  ranked: readonly RankedSense[],
  loose: readonly (readonly [string, string, string])[],
): [string, string[], string] | undefined {
  const groups = new Map<
    string,
    { rank: number; words: string[]; pos: string }
  >();
  /** Each word once, in the best sense that has it. */
  const seen = new Set<string>();
  const add = (word: string, label: string, rank: number, pos: string) => {
    if (seen.has(word)) return;
    const hint = hintOf(label);
    let group = groups.get(hint);
    if (!group) groups.set(hint, (group = { rank, words: [], pos }));
    if (group.words.length >= JA_WORDS) return;
    group.words.push(word);
    seen.add(word);
  };
  const order = [...ranked.entries()].flatMap(([rank, sense]) =>
    sense.ja.map(([word, label]) => [word, label, rank, sense.pos] as const),
  );
  for (const [word, label, rank, pos] of order.sort((a, b) => a[2] - b[2]))
    add(word, label, rank, pos);
  for (const [word, label, pos] of loose) add(word, label, ranked.length, pos);
  const senses = [...groups]
    .filter(([, { words }]) => words.length > 0)
    .sort((a, b) => a[1].rank - b[1].rank)
    .slice(0, JA_SENSES);
  if (senses.length === 0) return undefined;
  return [
    senses[0]![1].words[0]!,
    senses.map(([hint, { words }]) => `《${hint}》${words.join(",")}`),
    encodeSenseLabels(senses.map(([, { pos }]) => senseLabelOf(pos))),
  ];
}

/**
 * Builds the phrase patterns: kaikki's multi-word entries (rule B1) and EJDict's
 * multi-word headwords, whose words are vocabulary words, inflected forms, possessives
 * of them, or slots. `detect` holds the patterns highlighted without being saved: no
 * slot, not starting with an auxiliary, not a named entity (B4) or a transparent
 * compound (B2b), and an idiomaticity score at its threshold or above (B2). `more` has
 * the others, for selections and saved phrases; `gap` the phrasal verbs among both.
 */
export async function importPhrases(
  path: string,
  {
    vocab,
    lemmas,
    dict,
    titleCase: ejdictTitleCase = new Set(),
    native = JAPANESE_GLOSSES,
    language = ENGLISH_PHRASES,
    stopwords = { gloss: GLOSS_STOPWORDS, function: FUNCTION_TOKENS },
  }: PhraseInputs,
): Promise<PhrasesResult> {
  const words = new Set(vocab);
  const known = (word: string) =>
    words.has(word) || Object.hasOwn(lemmas, word);
  const isWord = (word: string) =>
    known(word) ||
    (word.endsWith(POSSESSIVE) && known(word.slice(0, -POSSESSIVE.length)));
  const basesOf = (word: string) => [
    ...new Set([
      ...(words.has(word) ? [word] : []),
      ...[Object.hasOwn(lemmas, word) ? lemmas[word]! : []].flat(),
    ]),
  ];
  const needed = new Set(words);
  for (const [form, bases] of Object.entries(lemmas)) {
    needed.add(form);
    for (const base of [bases].flat()) needed.add(base);
  }
  const source = await readSource(path, isWord, needed, language);
  const { patterns } = source;

  const fromEjdict = Object.keys(dict)
    .filter((key) => key.includes(" ") && patternKey(key, isWord) === key)
    .sort(byCodeUnit);
  const inEjdict = (key: string) => Object.hasOwn(dict, key);
  const allKeys = [...new Set([...patterns.keys(), ...fromEjdict])].sort(
    byCodeUnit,
  );

  // The example corpus, over each pattern's words and their inflected forms.
  const forms = new Map<string, string[]>();
  for (const [form, bases] of Object.entries(lemmas))
    for (const base of [bases].flat()) {
      let list = forms.get(base);
      if (!list) forms.set(base, (list = []));
      list.push(form);
    }
  const corpus = await countExamples(path, phraseVariants(allKeys, forms));

  // The source's gloss stopwords: its most frequent gloss tokens.
  const byFrequency = [...source.words.tokens]
    .sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))
    .map(([token]) => token);
  const stop = new Set(byFrequency.slice(0, stopwords.gloss));
  const functionTokens = new Set(byFrequency.slice(0, stopwords.function));
  const glossesOf = (word: string) => source.words.glosses.get(word) ?? [];
  const bags = new Map<string, Set<string>>();
  /** What a word's own definitions say: its stems and its glosses' tokens. */
  const bagOf = (word: string) => {
    let bag = bags.get(word);
    if (bag) return bag;
    bag = new Set();
    for (const base of [word, ...basesOf(word)]) {
      bag.add(base.slice(0, STEM));
      for (const gloss of glossesOf(base))
        for (const token of glossTokens(gloss, stop)) bag.add(token);
    }
    bags.set(word, bag);
    return bag;
  };
  /** The units of a word's own native glosses (EJDict). */
  const nativeBagOf = (word: string) => {
    const units = new Set<string>();
    for (const base of [word, ...basesOf(word)])
      for (const sense of inEjdict(base) ? dict[base]![1] : [])
        for (const unit of native.units(sense)) units.add(unit);
    return units;
  };
  const countOf = (word: string) =>
    Math.max(
      1,
      ...[word, ...basesOf(word)].map((base) => corpus.words.get(base) ?? 0),
    );

  const verdicts: PatternVerdict[] = [];
  const ja: PhrasesResult["ja"] = {};
  let unattested = 0;
  for (const key of allKeys) {
    const item = patterns.get(key);
    const ejdict = inEjdict(key);
    if (!ejdict && (!item || item.nonConstituent || item.senses.length === 0))
      continue;
    const pos = item ? posOrder(item) : [];
    const count = corpus.phrases.get(key) ?? 0;
    const tables = item?.senses.reduce((n, sense) => n + sense.tables, 0) ?? 0;
    // B1's size cap: a multi-word noun or name with no table and no example.
    if (
      !ejdict &&
      count === 0 &&
      tables === 0 &&
      pos.every((p) => p === "noun" || language.name.has(p))
    ) {
      unattested++;
      continue;
    }
    const ranked = item ? rankSenses(item.senses, true) : [];
    const japanese =
      item && !ejdict ? japaneseSenses(ranked, item.looseJa) : undefined;
    if (japanese) ja[key] = japanese;
    const literal = key.split(" ").filter((word) => !SLOT_WORDS.has(word));
    const bag = new Set(literal.flatMap((word) => [...bagOf(word)]));
    const overlap = (sense: { gloss: string }) => {
      const tokens = glossTokens(sense.gloss, stop);
      if (tokens.size === 0) return 0.5;
      return [...tokens].filter((t) => bag.has(t)).length / tokens.size;
    };
    // B2b: the share of the content words the first definition names, by their stem
    // or by a token of their own first two senses.
    const content = literal
      .map((word) =>
        word.endsWith(POSSESSIVE) ? word.slice(0, -POSSESSIVE.length) : word,
      )
      .filter((word) => word.length >= 3 && !functionTokens.has(word));
    let parts: number | undefined;
    if (ranked.length > 0 && content.length > 0) {
      const first = glossTokens(ranked[0]!.gloss, stop);
      const named = glossTokens(ranked[0]!.gloss, functionTokens);
      parts =
        content.filter((word) =>
          [word, ...basesOf(word)].some(
            (base) =>
              named.has(base.slice(0, STEM)) ||
              glossesOf(base)
                .slice(0, 2)
                .some((gloss) =>
                  [...glossTokens(gloss, stop)].some((t) => first.has(t)),
                ),
          ),
        ).length / content.length;
    }
    // NATIVE: the phrase's Japanese against its words' own.
    const nativeGlosses = ejdict
      ? dict[key]![1].slice(0, 2)
      : (japanese?.[1]
          .flatMap((sense) => sense.replace(/^《[^》]*》/, "").split(","))
          .slice(0, 2) ?? []);
    const units = nativeGlosses.flatMap((gloss) => native.units(gloss));
    let overlapNative: number | undefined;
    if (units.length > 0) {
      const nativeBag = new Set(
        literal.flatMap((word) => [...nativeBagOf(word)]),
      );
      overlapNative =
        units.filter((u) => nativeBag.has(u)).length / units.length;
    }
    const expected = literal.reduce(
      (product, word) => (product * countOf(word)) / corpus.tokens,
      corpus.tokens,
    );
    const evidence: PatternEvidence = {
      pos,
      senses: ranked,
      overlap,
      literalNote: item?.literalNote ?? false,
      count,
      assoc: Math.log2((count + 0.5) / Math.max(expected, 1e-9)),
      ...(overlapNative !== undefined && { overlapNative }),
      loanword: nativeGlosses.length > 0 && native.loanword(nativeGlosses[0]!),
      ...(parts !== undefined && { parts }),
    };
    // B4: every entry a proper noun, or every entry written in Title Case.
    const named = item?.written.size
      ? item.allName || [...item.written].every(titleCase)
      : ejdictTitleCase.has(key);
    const score = idiomaticity(evidence, language);
    const threshold = thresholdFor(count, evidence.assoc);
    const isTransparent = transparent(evidence, language);
    verdicts.push({
      key,
      evidence,
      score,
      threshold,
      named,
      transparent: isTransparent,
      phrasalVerb: item?.gap === true,
      detect:
        !hasSlot(key) &&
        !AUXILIARIES.has(key.slice(0, key.indexOf(" "))) &&
        !named &&
        !isTransparent &&
        (score >= threshold || item?.gap === true),
    });
  }

  const detect = verdicts.filter((v) => v.detect).map((v) => v.key);
  const more = verdicts.filter((v) => !v.detect).map((v) => v.key);
  const all = verdicts.map((v) => v.key);
  const codes = (keys: readonly string[]) =>
    keys
      .map((key) => {
        const item = patterns.get(key);
        return encodePhrasePos(item ? posOrder(item) : []);
      })
      .join(" ");
  const phrases: PhrasePatterns = {
    detect,
    more,
    gap: all.filter((key) => patterns.get(key)?.gap === true),
    pos: { detect: codes(detect), more: codes(more) },
    intransitive: all.filter((key) => {
      const item = patterns.get(key);
      return item?.intransitive === true && !item.transitive;
    }),
  };
  const plain = verdicts.filter(
    (v) =>
      !v.detect &&
      !v.named &&
      !v.transparent &&
      !hasSlot(v.key) &&
      !AUXILIARIES.has(v.key.slice(0, v.key.indexOf(" "))),
  );
  return {
    phrases,
    ja,
    verdicts,
    stats: {
      entries: source.entries,
      unparsable: source.unparsable,
      detect: detect.length,
      more: more.length,
      belowThreshold: plain.length,
      named: verdicts.filter((v) => v.named).length,
      transparent: verdicts.filter((v) => v.transparent && !v.named).length,
      unattested,
      withPos: all.filter((key) => (patterns.get(key)?.pos.size ?? 0) > 0)
        .length,
      gap: phrases.gap.length,
      fromEjdict: fromEjdict.length,
      fromKaikki: all.filter((key) => patterns.has(key)).length,
      ja: Object.keys(ja).length,
    },
  };
}

/** A pattern's parts of speech, the one with the most usable senses first (ties: the entries' order). */
const posOrder = (item: Collected) =>
  [...item.pos].sort((a, b) => b[1] - a[1]).map(([pos]) => pos);

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { phrases, ja, stats } = await importPhrases(path, {
    vocab: readPack<string[]>("en/vocab.json"),
    lemmas: readPack<LemmaPack>("en/lemmas.json"),
    dict: readDictPacks<DictPack[string]>(PACKS["en-ja"].dir),
    titleCase: titleCasePhrases(readEjdictText()),
  });
  writePack("en/phrases.json", phrases, undefined, { lists: true });
  writePack("en-ja/phrases.json", ja);
  console.log(
    `phrases: ${stats.entries} multi-word entries (${stats.unparsable} unparsable); ` +
      `${stats.detect} detected and ${stats.more} more patterns ` +
      `(${stats.belowThreshold} under the score's threshold, ${stats.named} named, ` +
      `${stats.transparent} transparent; ${stats.unattested} unattested nouns left out), ` +
      `${stats.withPos} with parts of speech (${phrases.intransitive?.length} intransitive), ` +
      `${stats.gap} with a gap ` +
      `(${stats.fromEjdict} from EJDict, ${stats.fromKaikki} from kaikki); ` +
      `${stats.ja} with Japanese translations`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
