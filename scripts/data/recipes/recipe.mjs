// Build recipes: a pair dictionary merged from human-made sources in order, where the
// first source that has a term supplies all of it (one source tag per term). See
// docs/specs/2026-11-11-language-data-scaling-design.md §3.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { posLabel } from "../kaikki.mjs";
import {
  isNonConstituent,
  isUsable,
  patternKey,
  shortOf,
} from "../phrases.mjs";

/** Senses kept per term. */
export const MAX_SENSES = 4;
/** Translated words kept per translation-table sense. */
export const MAX_WORDS = 3;

/**
 * The key a headword is filed under, or undefined when it is not one Lingo looks up: a
 * single word must be a vocabulary word written in lowercase (names and inflected forms
 * are left out); several words must form one of the phrase patterns.
 */
export function termKeyOf({ vocab, lemmas, phrases }) {
  const isWord = (word) => vocab.has(word) || Object.hasOwn(lemmas, word);
  return (headword) => {
    const word = headword.trim();
    if (!/\s/.test(word)) return vocab.has(word) ? word : undefined;
    const key = patternKey(word, isWord);
    return key && phrases.has(key) ? key : undefined;
  };
}

/** Streams a kaikki JSONL file, calling `onEntry` with each entry; counts what it read. */
async function eachEntry(path, onEntry) {
  const stats = { entries: 0, unparsable: 0 };
  const lines = createInterface({
    input: createReadStream(path, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.unparsable++;
      continue;
    }
    stats.entries++;
    if (entry && typeof entry.word === "string") onEntry(entry);
  }
  return stats;
}

function addSense(item, sense) {
  if (item.senses.length >= MAX_SENSES) return;
  if (item.senses.some(([, text]) => text === sense[1])) return;
  item.senses.push(sense);
}

function termOf(terms, key) {
  let item = terms.get(key);
  if (!item) terms.set(key, (item = { short: "", senses: [] }));
  return item;
}

/** Drops terms that ended up without senses and sets each one's short meaning. */
function finish(terms, shortOfFirst) {
  for (const [key, item] of terms) {
    if (item.senses.length === 0) terms.delete(key);
    else item.short = shortOfFirst(item.senses[0][1]);
  }
  return terms;
}

/**
 * A native-language Wiktionary edition (kaikki's extract of it): its entries for words
 * of the learning language `lang` ("en"), whose glosses are in the native language.
 * Each term gets up to MAX_SENSES distinct usable senses, in file order; single-word
 * proper-noun entries and non-constituents are left out. Read over English Wiktionary itself, it
 * gives the English definitions (en-defs). `trimPeriod` drops the period that ends a
 * gloss made of one sentence (Wikcionario's "Luz." → "Luz").
 */
export async function readEdition(
  path,
  termKey,
  { lang = "en", trimPeriod = false } = {},
) {
  const terms = new Map();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== lang) return;
    // A proper-noun entry (a name) gives no meaning of a word ("Light"), but a phrase
    // pattern may be one ("Midas touch").
    if (entry.pos === "name" && !/\s/.test(entry.word.trim())) return;
    if (isNonConstituent(entry)) return;
    const key = termKey(entry.word);
    if (!key) return;
    const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
    for (const sense of entry.senses ?? []) {
      if (!isUsable(sense)) continue;
      const gloss = sense.glosses.at(-1).trim();
      const text =
        trimPeriod && /^[^.]+\.$/.test(gloss) ? gloss.slice(0, -1) : gloss;
      addSense(termOf(terms, key), [pos, text]);
    }
  });
  return { terms: finish(terms, shortOf), stats };
}

const senseLabel = (text) =>
  typeof text === "string" && text.trim() ? text.trim() : undefined;

/**
 * English Wiktionary's translation tables (kaikki's English extract) into the native
 * language (`langCodes`, such as ["pt"] or ["cmn"]): per English sense, its words in
 * that language, at most MAX_WORDS, with the English sense label as the hint (the
 * table's own label, else the sense's gloss). `word` rewrites a translated word, or
 * drops it by returning undefined.
 */
export async function readTranslationTables(
  path,
  { langCodes, termKey, word: rewrite = (w) => w, lang = "en" },
) {
  const codes = new Set(langCodes);
  const terms = new Map();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== lang) return;
    const key = termKey(entry.word);
    if (!key) return;
    const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
    // hint → words, in the order the senses first appear
    const groups = new Map();
    const add = (translations, fallbackHint) => {
      for (const translation of translations ?? []) {
        if (!codes.has(translation?.lang_code)) continue;
        if (typeof translation.word !== "string") continue;
        const written = rewrite(translation.word.trim());
        if (!written) continue;
        const hint = senseLabel(translation.sense) ?? fallbackHint;
        if (!hint) continue;
        let words = groups.get(hint);
        if (!words) groups.set(hint, (words = []));
        if (words.length < MAX_WORDS && !words.includes(written))
          words.push(written);
      }
    };
    add(entry.translations, undefined);
    for (const sense of entry.senses ?? []) {
      const gloss = Array.isArray(sense.glosses)
        ? sense.glosses.at(-1)
        : undefined;
      add(
        sense.translations,
        typeof gloss === "string" ? shortOf(gloss.trim()) : undefined,
      );
    }
    for (const [hint, words] of groups)
      addSense(termOf(terms, key), [pos, words.join(", "), hint]);
  });
  // The short meaning is the first sense's first word.
  return { terms: finish(terms, (text) => text.split(", ")[0]), stats };
}

/**
 * Merges the sources (`[{ tag, terms }]`, in order of preference): each term comes
 * whole from the first source that has it, as [short, senses, source index].
 */
export function mergeSources(sources) {
  const dict = {};
  const counts = {};
  sources.forEach(({ tag, terms }, index) => {
    counts[tag] = 0;
    for (const [key, { short, senses }] of terms) {
      if (Object.hasOwn(dict, key)) continue;
      dict[key] = [short, senses, index];
      counts[tag]++;
    }
  });
  return { dict, sources: sources.map(({ tag }) => tag), counts };
}
