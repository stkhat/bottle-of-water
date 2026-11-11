// Phrase patterns (idioms, phrasal verbs, prepositional phrases) from EJDict and the
// kaikki.org English Wiktionary extract (CC BY-SA) → public/packs/en/phrases.json
// ({ detect, more, gap }), public/packs/en-ja/phrases.json (Japanese translations) and
// public/packs/en-defs/{index,dict-<n>}.json (English definitions)
// Usage: node scripts/data/phrases.mjs [path]   (default data/raw/kaikki-en.jsonl; run ejdict.mjs, kaikki.mjs and frequency.mjs first)
import { createReadStream, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { isMain, PACKS_DIR, readPack, writePack } from "./common.mjs";
import { readDictPacks, shardDict } from "./ejdict.mjs";
import { KAIKKI_PATH, posLabel } from "./kaikki.mjs";

/**
 * Slot words: they stand for any person or thing ("make up one's mind"). The matcher
 * fills them (src/core/phrases/en.ts); a pattern with a slot is not detected in text.
 */
export const SLOT_WORDS = new Set([
  "one's",
  "someone's",
  "someone",
  "something",
  "oneself",
]);
/** Wiktionary's other spellings of slots, written as the slot in pattern keys. */
export const SLOT_SPELLINGS = new Map([
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
export const AUXILIARIES = new Set(["be", "have", "do"]);
const WORD = /^[a-z][a-z']*$/;
const UNUSABLE_TAGS = new Set([
  "form-of",
  "alt-of",
  "obsolete",
  "archaic",
  "misspelling",
]);
/** kaikki parts of speech whose entries are phrases. */
export const PHRASE_POS = new Set(["phrase", "prep_phrase"]);
// Glosses that only point at the words' literal meanings ("see on, the").
const LITERAL_GLOSS = /^Used other than figuratively or idiomatically/;
/** An idiomatic sense counts only when a literal word of the phrase is rarer than this rank ("in it" does not). */
export const IDIOM_COMMON_RANK = 100;
/** A phrase or prepositional-phrase entry counts only when a literal word is rarer than this rank ("on the" does not). */
export const PHRASE_COMMON_RANK = 1000;
/**
 * Adverb particles: a pair of common words is detected only when it ends in one ("give
 * up", "find out"), not in a preposition ("come to", "live in") or another word ("very
 * well"): such pairs are mostly meant literally ("come to Tokyo").
 */
export const ADVERB_PARTICLES = new Set([
  ...["up", "out", "off", "down", "back", "away", "over", "around", "round"],
  ...["about", "along", "apart", "aside", "ahead", "behind", "by", "through"],
  ...["together", "after", "across", "forward"],
]);
const MAX_SENSES = 4;
// The top-level headword, which kaikki writes right before the language.
const HEADWORD =
  /"word": ("(?:[^"\\]|\\.)*"), "lang": "English", "lang_code": "en"/;
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The pattern key of a headword (words lowercased, slot spellings normalized, joined by
 * single spaces), or undefined when it is not a pattern Lingo can match: each word must
 * be a slot word or a word `isWord` accepts (made of letters and apostrophes), and at
 * least one must not be a slot.
 */
export function patternKey(headword, isWord) {
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

/** Whether a pattern key has a slot word. */
export function hasSlot(key) {
  return key.split(" ").some((word) => SLOT_WORDS.has(word));
}

/** A sense with a gloss of its own: not a form-of / alt-of pointer, not obsolete, archaic or a misspelling, not a literal-meaning note. */
export function isUsable(sense) {
  const glosses = sense.glosses;
  if (!Array.isArray(glosses) || glosses.length === 0) return false;
  if (typeof glosses.at(-1) !== "string" || !glosses.at(-1).trim())
    return false;
  if (LITERAL_GLOSS.test(glosses.at(-1).trim())) return false;
  if (Array.isArray(sense.form_of) || Array.isArray(sense.alt_of)) return false;
  return !(sense.tags ?? []).some((tag) => UNUSABLE_TAGS.has(tag));
}

function inCategory(categories, part) {
  return (categories ?? []).some((category) => {
    const name = typeof category === "string" ? category : category?.name;
    return typeof name === "string" && name.toLowerCase().includes(part);
  });
}

/** Wiktionary's "non-constituents" are word sequences that are not units ("on the", "of a"). */
export function isNonConstituent(entry) {
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
export function isCommonPair(key, rarestRank) {
  const words = key.split(" ");
  return (
    words.length === 2 &&
    rarestRank <= PHRASE_COMMON_RANK &&
    !ADVERB_PARTICLES.has(words[1])
  );
}

/**
 * Whether a usable sense makes its entry a phrase: a phrasal verb always; an idiomatic
 * sense when a literal word is outside the top IDIOM_COMMON_RANK; a phrase or
 * prepositional phrase when a literal word is outside the top PHRASE_COMMON_RANK.
 */
function isPhraseSense(entry, sense, rarestRank) {
  if (inCategory(sense.categories, "phrasal verbs")) return true;
  if (
    (sense.tags ?? []).includes("idiomatic") &&
    rarestRank > IDIOM_COMMON_RANK
  )
    return true;
  return PHRASE_POS.has(entry.pos) && rarestRank > PHRASE_COMMON_RANK;
}

function japaneseOf(translations, out) {
  for (const translation of translations ?? []) {
    if (translation?.lang_code !== "ja") continue;
    const word =
      typeof translation.word === "string" ? translation.word.trim() : "";
    if (word && !out.includes(word)) out.push(word);
  }
}

/** The first sense cut at the first `;`, without a final period. */
export function shortOf(text) {
  const semicolon = text.indexOf(";");
  const cut = (semicolon >= 0 ? text.slice(0, semicolon) : text).trim();
  return cut.endsWith(".") ? cut.slice(0, -1).trimEnd() : cut;
}

/**
 * Streams the kaikki JSONL and builds the phrase patterns: EJDict multi-word headwords
 * plus kaikki idioms, phrasal verbs and phrases, whose words are vocabulary words,
 * inflected forms (`lemmas`) or slots. `detect` holds the patterns without a slot that
 * pass the detection filters, `more` the other ones (with a slot, kaikki ones starting
 * with be / have / do, and kaikki pairs of common words not ending in an adverb particle:
 * `isCommonPair`), `gap` the phrasal verbs among both. Japanese translations and
 * English definitions cover every kaikki pattern EJDict lacks.
 *
 * The rank thresholds look at the literal words only (a slot stands for any word), and
 * rank a word outside the vocabulary (an inflected form, "beans") as its most common base
 * form; a vocabulary word keeps its own rank (Infinity when freq.json lacks it), as before.
 */
export async function importPhrases(path, vocab, dict, freq, lemmas) {
  const words = new Set(vocab);
  const isWord = (word) => words.has(word) || Object.hasOwn(lemmas, word);
  const ranks = new Map(freq.map((word, i) => [word, i + 1]));
  const rankOf = (word) =>
    ranks.get(word) ??
    (words.has(word)
      ? Infinity
      : Math.min(
          ...[lemmas[word] ?? []].flat().map((b) => ranks.get(b) ?? Infinity),
        ));
  const rarestRankOf = (key) =>
    Math.max(
      ...key
        .split(" ")
        .filter((word) => !SLOT_WORDS.has(word))
        .map(rankOf),
    );
  const stats = { entries: 0, unparsable: 0 };
  // key → { phrase, gap, senses: [pos, text][], senseJa, topJa: string[] }, entries merged in file order
  const found = new Map();
  const lines = createInterface({
    input: createReadStream(path, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const headword = HEADWORD.exec(line);
    if (headword && !headword[1].includes(" ")) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.unparsable++;
      continue;
    }
    if (entry.lang_code !== "en" || typeof entry.word !== "string") continue;
    if (!entry.word.trim().includes(" ")) continue;
    stats.entries++;
    const key = patternKey(entry.word, isWord);
    if (!key || isNonConstituent(entry)) continue;
    let item = found.get(key);
    if (!item)
      found.set(
        key,
        (item = {
          phrase: false,
          gap: false,
          senses: [],
          senseJa: [],
          topJa: [],
          rarestRank: rarestRankOf(key),
        }),
      );
    japaneseOf(entry.translations, item.topJa);
    const { rarestRank } = item;
    const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
    for (const sense of entry.senses ?? []) {
      if (!isUsable(sense)) continue;
      item.phrase ||= isPhraseSense(entry, sense, rarestRank);
      item.gap ||= inCategory(sense.categories, "phrasal verbs");
      item.senses.push([pos, sense.glosses.at(-1).trim()]);
      japaneseOf(sense.translations, item.senseJa);
    }
  }

  const startsWithAuxiliary = (key) =>
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
  const commonPair = (key) => isCommonPair(key, found.get(key).rarestRank);
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
    gap: fromKaikki.filter((key) => found.get(key).gap),
  };
  const ja = {};
  const defs = {};
  for (const key of fromKaikki) {
    if (Object.hasOwn(dict, key)) continue;
    const item = found.get(key);
    const translations = [...new Set([...item.senseJa, ...item.topJa])];
    if (translations.length > 0) {
      ja[key] = [translations[0], translations];
      continue;
    }
    const senses = item.senses.slice(0, MAX_SENSES);
    defs[key] = [shortOf(senses[0][1]), senses];
  }
  return {
    phrases,
    defs,
    ja,
    stats: {
      ...stats,
      detect: phrases.detect.length,
      more: phrases.more.length,
      trivial: trivial.length,
      gap: phrases.gap.length,
      fromEjdict: fromEjdict.length,
      fromKaikki: fromKaikki.length,
      ja: Object.keys(ja).length,
      defs: Object.keys(defs).length,
    },
  };
}

/** Writes the phrase patterns, the Japanese translations and the English definition shards; removes old shards. */
export function writePhrasePacks({ phrases, defs, ja }) {
  const dir = join(PACKS_DIR, "en-defs");
  if (existsSync(dir))
    for (const name of readdirSync(dir))
      if (/^(dict-\d+|index)\.json$/.test(name)) rmSync(join(dir, name));
  const { index, shards } = shardDict(defs);
  for (const shard of shards) writePack(`en-defs/${shard.file}`, shard.dict);
  writePack("en-defs/index.json", index);
  writePack("en/phrases.json", phrases, PACKS_DIR, { lists: true });
  writePack("en-ja/phrases.json", ja);
  return { index };
}

async function main() {
  const dict = readDictPacks();
  const vocab = readPack("en/vocab.json");
  const freq = readPack("en/freq.json");
  const lemmas = readPack("en/lemmas.json");
  const path = process.argv[2] ?? KAIKKI_PATH;
  const result = await importPhrases(path, vocab, dict, freq, lemmas);
  const { index } = writePhrasePacks(result);
  const { stats } = result;
  console.log(
    `phrases: ${stats.entries} multi-word entries (${stats.unparsable} unparsable); ` +
      `${stats.detect} detected and ${stats.more} more patterns (${stats.trivial} common-word pairs), ` +
      `${stats.gap} with a gap ` +
      `(${stats.fromEjdict} from EJDict, ${stats.fromKaikki} from kaikki); ` +
      `${stats.ja} with Japanese translations, ${stats.defs} with English definitions ` +
      `in ${index.shards.length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main();
