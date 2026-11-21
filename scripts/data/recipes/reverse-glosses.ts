// Reverse glosses (round 4's S1, docs/notes/translation-data-expansion.md "Round 4"):
// English Wiktionary's entries of a native language's words, glossed in English, read
// backwards. A Thai entry "สุนัข: dog" gives "dog" the meaning สุนัข. The gloss must name
// the English term exactly (one of its items between commas), so a description never
// does ("a small domesticated carnivore" names no term). A recipe's last source: it
// fills the words no table, edition or wordnet has (docs/specs/architecture.md "Native
// meanings and the quality gate").
import type { PosPack } from "../../../src/core/packs/types.ts";
import { eachEntry, posLabel, type KaikkiSense } from "../common.ts";
import {
  addSense,
  finish,
  withoutStressMarks,
  type PairSense,
  type SourceTerm,
  type TermKey,
} from "./recipe.ts";

/** Senses kept per term, as the other sources keep. */
const MAX_SENSES = 4;

/**
 * kaikki's parts of speech of entries that are no words of the language to translate
 * with: names, romanizations, letters and symbols, affixes and punctuation.
 */
export const NOT_WORDS: ReadonlySet<string> = new Set([
  "name",
  "romanization",
  "character",
  "symbol",
  "suffix",
  "prefix",
  "infix",
  "affix",
  "circumfix",
  "interfix",
  "punct",
  "soft-redirect",
]);

/**
 * Tags of a sense that is no meaning to show: a form or a spelling of another word, an
 * obsolete or archaic use, a misspelling, an abbreviation.
 */
const NO_MEANING_TAGS: ReadonlySet<string> = new Set([
  "form-of",
  "alt-of",
  "obsolete",
  "archaic",
  "misspelling",
  "abbreviation",
  "initialism",
]);

/**
 * Labels of a sense away from everyday speech or the word's plain meaning (kaikki's
 * tags): formal, literary and dated words, figurative and idiomatic uses, offensive
 * and euphemistic ones, a form used only inside compounds. A native word with such a
 * sense and another sense is read in its other, main sense: สวัสดี is hello (its
 * "wellness" is formal), ทาย to guess (its "given" formal, in compounds), ร้อน hot
 * (its "disturbed" figurative). Not slang, colloquial or humorous speech: the videos
 * learners watch speak so, and such a sense says the English word as they hear it
 * (แบบ, แอบ for the hedge "kind of"; ปัง for "awesome").
 */
const REGISTER_TAGS: ReadonlySet<string> = new Set([
  "childish",
  "sarcastic",
  "derogatory",
  "offensive",
  "vulgar",
  "slur",
  "ethnic",
  "euphemistic",
  "figuratively",
  "idiomatic",
  "formal",
  "humble",
  "poetic",
  "literary",
  "dated",
  "rare",
  "nonstandard",
  "proscribed",
  "dialectal",
  "in-compounds",
  "morpheme",
]);

/** The class of a part of speech: noun, verb, or adjective-or-adverb. */
const CLASS: Readonly<Record<string, string>> = {
  noun: "n",
  "proper noun": "n",
  verb: "v",
  adjective: "a",
  adverb: "a",
};

/**
 * Whether a native word of part of speech `nativePos` may be the meaning of the English
 * term `key` (round 4's main senses): its class (noun, verb, adjective-or-adverb) is
 * one of the English word's (en/pos.json), so a reverse gloss of another part of speech
 * does not stand for it ("ความรัก", the noun love, is no meaning of "lovely"'s
 * adjective). Other parts of speech, and terms with none, fit any.
 */
export function fitsEnglishPos(pos: PosPack) {
  return (key: string, nativePos: string) => {
    const wanted = CLASS[nativePos];
    if (wanted === undefined) return true;
    const classes = new Set(
      (pos[key] ?? []).map((english) => CLASS[english] ?? "other"),
    );
    return classes.size === 0 || classes.has(wanted);
  };
}

/** Text without its bracketed parts (nested ones too), or none with a bracket left open. */
export function unbracketed(text: string): string {
  let out = text;
  for (let before = ""; before !== out;) {
    before = out;
    out = out.replace(/\s*[([][^()[\]]*[)\]]\s*/gu, " ");
  }
  return /[()[\]]/u.test(out)
    ? ""
    : out
        .replace(/\s+/gu, " ")
        .replace(/ (?=[,;])/gu, "")
        .trim();
}

/**
 * The term a gloss's item names, exactly: the item itself, without a closing period or
 * exclamation mark (and a verb's leading "to"), written as the term or with a capital
 * the term lacks ("Dog" names dog). A longer item ("a small dog") names none.
 */
export function namedTerm(
  raw: string,
  termKey: TermKey,
  verb: boolean,
): string | undefined {
  let item = raw
    .trim()
    .replace(/[.!]+$/u, "")
    .trim();
  if (verb) item = item.replace(/^to\s+/u, "");
  if (!item || !/^[A-Za-z][A-Za-z' -]*$/u.test(item)) return undefined;
  for (const written of [item, item.toLowerCase()]) {
    const key = termKey(written);
    if (key !== undefined && key === written) return key;
  }
  return undefined;
}

/** A sense's gloss to read, or none for a sense that is a form or no meaning to show. */
function meaningGloss(sense: KaikkiSense): string | undefined {
  if (sense.form_of || sense.alt_of) return undefined;
  if ((sense.tags ?? []).some((tag) => NO_MEANING_TAGS.has(tag)))
    return undefined;
  const gloss = sense.glosses?.at(-1);
  return typeof gloss === "string" ? gloss : undefined;
}

/**
 * Reverse glosses: per English term, the native words whose English Wiktionary entry
 * has a sense glossed with the term (`path`: kaikki's extract of the language's entries,
 * kaikki-<native>.jsonl). Read: the sense's last gloss without its bracketed parts,
 * split at commas and semicolons; an item counts when it is a term exactly
 * (`namedTerm`). Left out: entries that are no words (`NOT_WORDS`), headwords with no
 * letter of the native script (`letter`), senses that are forms or no meaning to show
 * (`NO_MEANING_TAGS`), senses in a register or an extended use of a native word that
 * has other senses (`REGISTER_TAGS`: it reads as its main sense), and native words
 * whose part of speech does not `fit` the term's.
 * A term's native words are ordered by whether the term is its gloss's first item, then
 * by `rank` (the native word's frequency rank, where the language has a usable list),
 * then by file order; one sense per native word and part of speech, at most MAX_SENSES.
 */
export async function readReverseGlosses(
  path: string,
  {
    native,
    termKey,
    letter,
    fits = () => true,
    rank = () => 0,
  }: {
    native: string;
    termKey: TermKey;
    letter?: RegExp;
    fits?: (key: string, pos: string) => boolean;
    rank?: (word: string) => number;
  },
) {
  interface Link {
    sense: PairSense;
    first: boolean;
    rank: number;
    order: number;
    /** The sense is in a register or an extended use (`REGISTER_TAGS`). */
    marked: boolean;
  }
  const found = new Map<string, Link[]>();
  // Each native word's senses with a meaning to show, over all its entries.
  const meanings = new Map<string, number>();
  let order = 0;
  let senses = 0;
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== native || NOT_WORDS.has(entry.pos ?? "")) return;
    const head = withoutStressMarks(entry.word.trim());
    if (!head || (letter && !letter.test(head))) return;
    const pos = posLabel(entry.pos ?? "");
    for (const sense of entry.senses ?? []) {
      const gloss = meaningGloss(sense);
      if (gloss === undefined) continue;
      senses++;
      meanings.set(head, (meanings.get(head) ?? 0) + 1);
      const marked = (sense.tags ?? []).some((tag) => REGISTER_TAGS.has(tag));
      const seen = new Set<string>();
      unbracketed(gloss)
        .split(/[,;]/u)
        .forEach((item, i) => {
          const key = namedTerm(item, termKey, pos === "verb");
          if (key === undefined || seen.has(key) || !fits(key, pos)) return;
          seen.add(key);
          let links = found.get(key);
          if (!links) found.set(key, (links = []));
          const same = links.find(
            ({ sense: [p, w] }) => w === head && p === pos,
          );
          // A native word glossed with the term in a plain sense too is unmarked.
          if (same) {
            same.marked &&= marked;
            return;
          }
          links.push({
            sense: [pos, head],
            first: i === 0,
            rank: rank(head),
            order: order++,
            marked,
          });
        });
    }
  });
  const terms = new Map<string, SourceTerm>();
  let marked = 0;
  for (const [key, all] of found) {
    const links = all.filter(
      ({ marked, sense: [, head] }) => !marked || meanings.get(head) === 1,
    );
    marked += all.length - links.length;
    if (links.length === 0) continue;
    const item: SourceTerm = { short: "", senses: [] };
    terms.set(key, item);
    for (const { sense } of [...links].sort(
      (a, b) =>
        Number(b.first) - Number(a.first) ||
        a.rank - b.rank ||
        a.order - b.order,
    ))
      addSense(item, sense, MAX_SENSES);
  }
  return {
    terms: finish(terms, (text) => text),
    stats: { ...stats, senses, marked },
  };
}
