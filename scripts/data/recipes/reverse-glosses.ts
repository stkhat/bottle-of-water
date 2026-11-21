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
  capitalTermOf,
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
 * Labels of an offensive sense (kaikki's tags): never a line, as a learner would take
 * it for the plain word (frustration: ส้นตีน, a vulgar curse).
 */
const OFFENSIVE_TAGS: ReadonlySet<string> = new Set([
  "derogatory",
  "offensive",
  "vulgar",
  "slur",
  "ethnic",
]);

/**
 * Labels of a sense away from everyday speech or the word's plain meaning (kaikki's
 * tags): formal, literary and dated words, figurative and idiomatic uses, euphemistic
 * ones, rare and uncommon senses, a form used only inside compounds. A native word with
 * such a sense and a plain one is read in its plain, main sense: สวัสดี is hello (its
 * "wellness" is formal), ทาย to guess (its "given" formal, in compounds), ร้อน hot
 * (its "disturbed" figurative), साबित proven (its "alright" uncommon). Not slang, colloquial or humorous speech: the videos
 * learners watch speak so, and such a sense says the English word as they hear it
 * (แบบ, แอบ for the hedge "kind of"; ปัง for "awesome"). A word whose every sense is
 * marked has no other sense to be read in and keeps them all (ตราบ, a formal word: "as
 * long as").
 */
const REGISTER_TAGS: ReadonlySet<string> = new Set([
  "childish",
  "sarcastic",
  "euphemistic",
  "figuratively",
  "idiomatic",
  "formal",
  "humble",
  "poetic",
  "literary",
  "dated",
  "rare",
  "uncommon",
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
 * the term lacks ("Dog" names dog). A longer item ("a small dog") names none. A
 * capitalised spelling that is another word than the lowercase one (`capitalised`: May,
 * the month, beside may) names no lowercase term: `readReverseGlosses` gives it to the
 * capitalised headword (`capitalTermOf`).
 */
export function namedTerm(
  raw: string,
  termKey: TermKey,
  verb: boolean,
  capitalised: (written: string) => boolean = () => false,
): string | undefined {
  let item = raw
    .trim()
    .replace(/[.!]+$/u, "")
    .trim();
  if (verb) item = item.replace(/^to\s+/u, "");
  if (!item || !/^[A-Za-z][A-Za-z' -]*$/u.test(item)) return undefined;
  const lower = item.toLowerCase();
  const asLower = lower === item || !capitalised(item);
  for (const written of asLower ? [item, lower] : [item]) {
    const key = termKey(written);
    if (key !== undefined && key === written) return key;
  }
  return undefined;
}

/**
 * A gloss's items that continue a first item in "to be" ("to be entered, put down": be
 * put down). One that starts with a verb (`verbOnly`: no adjective too) is that verb's
 * passive and names no term (चढ़ना is no "put down"); an adjective or a phrase of
 * another kind is the state itself ("to be bound, related": related; "to be in
 * accord"). An item with its own "to" starts anew.
 */
function passiveItems(items: readonly string[]): boolean[] {
  let passive = false;
  return items.map((item, i) => {
    const text = item.trim();
    if (i === 0 || /^to\s/u.test(text)) {
      passive = /^to\s+be\s/u.test(text);
      return false;
    }
    return passive;
  });
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
 * Where a gloss names a term in a native word's entries: as the first item of the
 * word's first meaning (its main sense, over all its entries), of its entry's first one
 * (another part of speech's main sense), of a later sense, or as a later item.
 */
const MAIN = { word: 0, entry: 1, later: 2, item: 3 } as const;

/**
 * How much rarer a word that names a term in a lesser place reads as that term (its
 * frequency rank is multiplied by it): a word's main sense is most of its uses, another
 * part of speech's fewer, a later sense fewer still (visible: लक्ष्य, mainly "aim", whose
 * adjective's third sense is "visible", after दृश्य, whose adjective means "visible";
 * as: जैसा, "like", still before the rare बतौर, "in the capacity of").
 */
const LESSER: Readonly<Record<number, number>> = { 0: 1, 1: 2, 2: 4 };

/**
 * Reverse glosses: per English term, the native words whose English Wiktionary entry
 * has a sense glossed with the term (`path`: kaikki's extract of the language's entries,
 * kaikki-<native>.jsonl). Read: the sense's last gloss without its bracketed parts,
 * split at commas and semicolons; an item counts when it is a term exactly
 * (`namedTerm`). Left out: entries that are no words (`NOT_WORDS`), headwords with no
 * letter of the native script (`letter`), senses that are forms or no meaning to show
 * (`NO_MEANING_TAGS`), senses in a register or an extended use of a native word that
 * has a plain sense (`REGISTER_TAGS`: it reads as its main sense), offensive senses
 * (`OFFENSIVE_TAGS`), and native words
 * whose part of speech does not `fit` the term's.
 * An item that continues a "to be" with a verb (`passiveItems`) names nothing. A term's
 * native words are ordered by whether the term is its gloss's first item, then by
 * `rank` (the native word's frequency rank, where the language has a usable list),
 * multiplied by how far the term is from the word's main sense (`LESSER`), then by
 * file order; one sense per native word and part of speech, at most
 * MAX_SENSES.
 *
 * Returns too the headwords whose every sense is an alternative spelling of one other
 * word (`alternatives`: إنكليزي, "alternative spelling of إِنْجْلِيزِيّ").
 */
export async function readReverseGlosses(
  path: string,
  {
    native,
    termKey,
    letter,
    fits = () => true,
    rank = () => 0,
    capitalised,
    verbOnly = () => false,
  }: {
    native: string;
    termKey: TermKey;
    letter?: RegExp;
    fits?: (key: string, pos: string) => boolean;
    rank?: (word: string) => number;
    /** A capitalised spelling is another English word than its lowercase (`namedTerm`). */
    capitalised?: (written: string) => boolean;
    /** An English word that is a verb and no adjective (`passiveItems`). */
    verbOnly?: (word: string) => boolean;
  },
) {
  interface Link {
    sense: PairSense;
    /** Where the native word's gloss names the term (`MAIN`). */
    level: number;
    rank: number;
    order: number;
    /** The sense is in a register or an extended use (`REGISTER_TAGS`). */
    marked: boolean;
  }
  const found = new Map<string, Link[]>();
  const capitalFound = new Map<string, Link[]>();
  // The native words with a plain sense (no register) to show, over all their entries.
  const plain = new Set<string>();
  // The native words with an offensive sense (`withoutOffensiveWords`).
  const offensive = new Set<string>();
  // The native words whose first meaning has been read (their main sense).
  const read = new Set<string>();
  // Alternative spellings: headword → the words its senses are alternatives of.
  const alternativeOf = new Map<string, Set<string>>();
  const ownSenses = new Set<string>();
  let order = 0;
  let senses = 0;
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== native) return;
    const title = withoutStressMarks(entry.word.trim());
    for (const sense of entry.senses ?? []) {
      const target = Array.isArray(sense.alt_of)
        ? (sense.alt_of[0] as { word?: unknown } | undefined)?.word
        : undefined;
      if ((sense.tags ?? []).includes("alt-of") && typeof target === "string") {
        let targets = alternativeOf.get(title);
        if (!targets) alternativeOf.set(title, (targets = new Set()));
        targets.add(target.trim());
      } else if (!sense.form_of && sense.glosses?.length) ownSenses.add(title);
    }
    if (NOT_WORDS.has(entry.pos ?? "")) return;
    const head = title;
    if (!head || (letter && !letter.test(head))) return;
    const pos = posLabel(entry.pos ?? "");
    let entryFirst = true;
    for (const sense of entry.senses ?? []) {
      const gloss = meaningGloss(sense);
      if (gloss === undefined) continue;
      senses++;
      const sense0 = entryFirst
        ? read.has(head)
          ? MAIN.entry
          : MAIN.word
        : MAIN.later;
      entryFirst = false;
      read.add(head);
      if ((sense.tags ?? []).some((tag) => OFFENSIVE_TAGS.has(tag))) {
        offensive.add(head);
        continue;
      }
      const marked = (sense.tags ?? []).some((tag) => REGISTER_TAGS.has(tag));
      if (!marked) plain.add(head);
      const seen = new Set<string>();
      const items = unbracketed(gloss).split(/[,;]/u);
      const passive = passiveItems(items);
      items.forEach((item, i) => {
        const lower = namedTerm(item, termKey, pos === "verb", capitalised);
        // A capitalised word of its own (May) is its capitalised headword's meaning.
        const written = item.trim().replace(/[.!]+$/u, "");
        const upper =
          lower === undefined && capitalised?.(written)
            ? capitalTermOf(written, termKey)
            : undefined;
        const key = lower ?? upper;
        if (key === undefined || seen.has(key)) return;
        if (lower !== undefined && !fits(key, pos)) return;
        if (passive[i] && verbOnly(key.split(" ")[0]!)) return;
        seen.add(key);
        const into = upper === undefined ? found : capitalFound;
        let links = into.get(key);
        if (!links) into.set(key, (links = []));
        const same = links.find(({ sense: [p, w] }) => w === head && p === pos);
        // A native word glossed with the term in a plain sense too is unmarked.
        if (same) {
          same.marked &&= marked;
          return;
        }
        links.push({
          sense: [pos, head],
          level: i === 0 ? sense0 : MAIN.item,
          rank: rank(head),
          order: order++,
          marked,
        });
      });
    }
  });
  let marked = 0;
  const termsOf = (links: Map<string, Link[]>) => {
    const terms = new Map<string, SourceTerm>();
    for (const [key, all] of links) {
      const kept = all.filter(
        ({ marked, sense: [, head] }) => !marked || !plain.has(head),
      );
      marked += all.length - kept.length;
      if (kept.length === 0) continue;
      const item: SourceTerm = { short: "", senses: [] };
      terms.set(key, item);
      for (const { sense } of [...kept].sort(
        (a, b) =>
          Number(a.level === MAIN.item) - Number(b.level === MAIN.item) ||
          a.rank * (LESSER[a.level] ?? 1) - b.rank * (LESSER[b.level] ?? 1) ||
          a.order - b.order,
      ))
        addSense(item, sense, MAX_SENSES);
    }
    return finish(terms, (text) => text);
  };
  const terms = termsOf(found);
  const capital = termsOf(capitalFound);
  const alternatives = new Map<string, string>();
  for (const [head, targets] of alternativeOf)
    if (targets.size === 1 && !ownSenses.has(head))
      alternatives.set(head, [...targets][0]!);
  return {
    terms,
    capital,
    offensive,
    alternatives,
    stats: { ...stats, senses, marked },
  };
}

/** A translation table's English sense marked as away from plain speech ("slang: …"). */
const MARKED_HINT =
  /^\(?(?:slang|vulgar|offensive|derogatory|euphemistic|colloquial|informal)\b/iu;

/**
 * `terms` (a translation table's) without the native words the native language's own
 * entries call offensive (`offensive`, from `readReverseGlosses`) in a sense whose
 * English sense is marked (`MARKED_HINT`), where the term keeps another sense: such a
 * line shows the vulgar word beside the plain ones (do: करना, क्या, then चोदना for
 * "slang: have sex with"). A term whose every sense is so keeps them (bullshit). Returns
 * how many words were left out.
 */
export function withoutOffensiveWords(
  terms: Map<string, SourceTerm>,
  offensive: ReadonlySet<string>,
): number {
  let left = 0;
  for (const item of terms.values()) {
    const senses = item.senses.map((sense): PairSense | undefined => {
      const [pos, text, hint] = sense;
      if (!hint || !MARKED_HINT.test(hint)) return sense;
      const words = text.split(", ");
      const kept = words.filter((word) => !offensive.has(word));
      if (kept.length === words.length) return sense;
      return kept.length === 0
        ? undefined
        : ([pos, kept.join(", "), ...sense.slice(2)] as PairSense);
    });
    const plain = senses.filter((sense) => sense !== undefined);
    if (plain.length === 0) continue;
    left += senses.reduce(
      (n, sense, i) =>
        n +
        item.senses[i]![1].split(", ").length -
        (sense ? sense[1].split(", ").length : 0),
      0,
    );
    item.senses = plain;
  }
  return left;
}
