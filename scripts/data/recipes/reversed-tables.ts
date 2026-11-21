// Reversed tables: a native edition's own words whose translation tables list a word of
// the learning language mean that word (Wiktionnaire's "chien" lists Hund, so Hund means
// chien; the Thai edition's "สุนัข" lists dog, so dog means สุนัข). A source of the
// learning pairs into other natives (L3, learning-pairs.ts) and of the English recipes
// of natives whose edition has such tables (round 4's S2, native.ts;
// docs/specs/architecture.md "Native meanings and the quality gate").
import { eachEntry, posLabel, type KaikkiTranslation } from "../common.ts";
import {
  addSense,
  capitalTermOf,
  finish,
  withoutStressMarks,
  type PairSense,
  type SourceTerm,
  type TermKey,
} from "./recipe.ts";
import { NOT_WORDS } from "./reverse-glosses.ts";

/** Senses kept per term and source, as the English recipes keep. */
const MAX_SENSES = 4;

/** The part of speech the learning packs give a verb's reflexive senses (de-en's label). */
export const REFLEXIVE_POS = "reflexive";

/** What reversed tables read of the language the rows are in. */
export interface TableWords {
  /** The rows' language code ("de", "en"). */
  lang: string;
  termKey: TermKey;
  /**
   * Words a row may write before the word, dropped: articles before a noun ("der
   * Hund"), English's "to" before a verb.
   */
  articles: ReadonlySet<string>;
  /** Reflexive pronouns a row writes before a pronominal verb ("sich befinden"). */
  reflexive: readonly string[];
}

/**
 * A word a translation table writes, as a word: notes in brackets dropped ("plier (
 * tente )" → plier, "(ganz) sicher" → sicher), none when a bracket is left open
 * ("démonter ( camp", "Drang)"), spaces closed up. A row may list several words
 * between commas; they are written "a, b", without the space a dropped note or the
 * source leaves before a comma and the items a dropped note empties ("relayer
 * (quelqu'un), prendre le relais" → "relayer, prendre le relais"; "casse-pattes , (
 * casse-patte ), tord-boyaux" → "casse-pattes, tord-boyaux"; "cliqueter , ( cliquer ),"
 * → "cliqueter"): a short cut at the comma ended in a space.
 */
export function tableWord(written: string): string | undefined {
  let text = written;
  for (let before = ""; before !== text;) {
    before = text;
    text = text.replace(/\s*\([^()]*\)\s*/gu, " ");
  }
  text = text
    .replace(/\s+/gu, " ")
    .split(/\s*,(?=\s|,|$)\s*/u)
    .filter((item) => item.trim() !== "")
    .join(", ")
    .trim();
  if (!text || /[()]/u.test(text)) return undefined;
  return text;
}

/**
 * Where a word a table writes is filed: its term (lower case), or its capitalised
 * headword's (`capital`, "Hund"); a pronominal verb written with its reflexive pronoun
 * ("sich befinden") is the verb, `reflexive`; a noun written with its article ("der
 * Hund", "the dog") the noun, a verb with English's "to" the verb.
 */
export function learningKeyOf(
  written: string,
  words: Pick<TableWords, "termKey" | "articles" | "reflexive">,
): { key: string; capital: boolean; reflexive: boolean } | undefined {
  const word = tableWord(written);
  if (!word) return undefined;
  const { termKey, articles } = words;
  const direct = termKey(word);
  if (direct) return { key: direct, capital: false, reflexive: false };
  const capital = capitalTermOf(word, termKey);
  if (capital)
    return { key: capital.toLowerCase(), capital: true, reflexive: false };
  const [first = "", ...rest] = word.split(" ");
  if (rest.length === 0) return undefined;
  const after = rest.join(" ");
  const reflexive = words.reflexive.includes(first.toLowerCase());
  if (!reflexive && !articles.has(first.toLowerCase())) return undefined;
  const found = learningKeyOf(after, words);
  if (!found || found.reflexive) return undefined;
  return { ...found, reflexive };
}

/**
 * Reversed tables: the native edition's own words whose translation tables list a
 * word of `words.lang` give that word their headword as a meaning (fr chien lists
 * Hund: Hund → chien), one sense per native word, of its part of speech (a pronominal
 * verb's row, "sich befinden", the verb's reflexive sense). A word's senses are ordered
 * as the tables order their own: by how many languages the native word's sense is
 * translated into (a common word's table is wide), file order among equals; at most
 * MAX_SENSES. Native entries that are no words (names, letters, affixes: `NOT_WORDS`)
 * are left out, as are the pages `leftOut` names and the links to them, and native
 * words whose part of speech does not `fit` the term's.
 */
export async function readReversedTables(
  path: string,
  words: TableWords,
  {
    native,
    nativeForm = (word) => word,
    letter,
    leftOut = new Set(),
    fits = () => true,
  }: {
    native: string;
    nativeForm?: (word: string) => string;
    letter?: RegExp;
    /** Native pages left out (`undocumentedPages`). */
    leftOut?: ReadonlySet<string>;
    /** Whether a native word of a part of speech may mean a term (`fitsEnglishPos`). */
    fits?: (key: string, pos: string) => boolean;
  },
) {
  interface Link {
    sense: PairSense;
    coverage: number;
    order: number;
  }
  const found = new Map<string, Link[]>();
  const capitalFound = new Map<string, Link[]>();
  let order = 0;
  const stats = await eachEntry(path, (entry) => {
    if (
      entry.lang_code !== native ||
      NOT_WORDS.has(entry.pos ?? "") ||
      leftOut.has(entry.word.trim())
    )
      return;
    const head = nativeForm(withoutStressMarks(entry.word.trim()));
    if (!head || (letter && !letter.test(head))) return;
    const pos = posLabel(entry.pos ?? "");
    const rows: [KaikkiTranslation, string][] = [];
    for (const row of entry.translations ?? [])
      rows.push([row, typeof row.sense === "string" ? row.sense : ""]);
    (entry.senses ?? []).forEach((sense, i) => {
      for (const row of sense.translations ?? [])
        rows.push([row, typeof row.sense === "string" ? row.sense : `#${i}`]);
    });
    const languages = new Map<string, Set<unknown>>();
    for (const [row, label] of rows) {
      let set = languages.get(label);
      if (!set) languages.set(label, (set = new Set()));
      set.add(row.lang_code);
    }
    const seen = new Set<string>();
    for (const [row, label] of rows) {
      if (row.lang_code !== words.lang || typeof row.word !== "string")
        continue;
      for (const part of row.word.split(/[,;]/u)) {
        const at = learningKeyOf(part.trim(), words);
        if (!at || (!at.capital && !fits(at.key, pos))) continue;
        // A link to a page `leftOut` names is left out too: a bot may have filled
        // its tables from the pages it imported (PiedBot's "Mise à jour des
        // traductions", 2006).
        const page = at.capital
          ? at.key.charAt(0).toUpperCase() + at.key.slice(1)
          : at.key;
        if (leftOut.has(page)) continue;
        const id = `${at.capital}\n${at.key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const into = at.capital ? capitalFound : found;
        let links = into.get(at.key);
        if (!links) into.set(at.key, (links = []));
        links.push({
          sense: [at.reflexive ? REFLEXIVE_POS : pos, head],
          coverage: languages.get(label)?.size ?? 0,
          order: order++,
        });
      }
    }
  });
  const termsOf = (links: Map<string, Link[]>) => {
    const terms = new Map<string, SourceTerm>();
    for (const [key, list] of links) {
      const item: SourceTerm = { short: "", senses: [] };
      terms.set(key, item);
      for (const { sense } of [...list].sort(
        (a, b) => b.coverage - a.coverage || a.order - b.order,
      ))
        addSense(item, sense, MAX_SENSES);
    }
    return finish(terms, (text) => text);
  };
  return { terms: termsOf(found), capital: termsOf(capitalFound), stats };
}
