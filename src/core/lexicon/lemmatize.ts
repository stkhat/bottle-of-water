import type { LemmaPack, LemmaShards } from "../packs/types";
import { normalizeWord } from "../text/tokenize";
import { own } from "../util";

/** A form's bases in a lemma table, whole or in shards (Spanish: `LemmaShards`). */
function basesIn(lemmas: LemmaPack | LemmaShards, word: string) {
  if (!Array.isArray(lemmas)) return own(lemmas as LemmaPack, word);
  for (const shard of lemmas as LemmaShards) {
    const found = own(shard, word);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The capital-only words of a vocabulary (`LanguagePackData.capitals`): each key, in
 * lower case, → the ways it is written (["AI"], ["Tokyo"], ["iPhone"]).
 */
export type CapitalWords = ReadonlyMap<string, readonly string[]>;

/**
 * Whether a word as written (’ as ') is one of a capital-only key's spellings (`written`),
 * then nothing or lower case: an ending ("AIs", "Grammys") or a possessive ("AI's").
 * "ai" and "Ai" are not "AI"; "AIDS" is not "AI" + DS.
 */
const writtenAs = (form: string, written: readonly string[]) =>
  written.some(
    (spelling) =>
      form.startsWith(spelling) && !/\p{Lu}/u.test(form.slice(spelling.length)),
  );

/**
 * Base forms of a word as it appears in text: the word itself when it is in the
 * vocabulary, then its bases from the lemma pack. A capital-only word (`capitals`) is
 * one only where the text writes it as the word is written (AI, not "ai", a sloth; not
 * a sentence's "Ai"), and so is each base of a form that is one (AEDs → AED). Falls
 * back to the word without a trailing possessive 's (harmless in Spanish, whose words
 * do not end in 's), and for a word with a period inside, which the segmenter cut
 * before its last period ("U.S", "p.m", "Ph.D"), to the word with that period as the
 * vocabulary writes it: in lower case ("p.m."), or with capitals as `capitals` lists
 * it ("U.S."; not "I.D", as only "i.d.", inside diameter, is listed). [] for an unknown
 * word.
 */
export function lemmatize(
  form: string,
  lemmas: LemmaPack | LemmaShards,
  vocab: ReadonlySet<string>,
  capitals?: CapitalWords,
): string[] {
  const written = form.replaceAll("’", "'");
  const word = normalizeWord(form);
  const fits = (base: string) => {
    const spellings = capitals?.get(base);
    return spellings === undefined || writtenAs(written, spellings);
  };
  const bases = [basesIn(lemmas, word) ?? []].flat().filter(fits);
  const itself =
    vocab.has(word) || (capitals?.has(word) === true && fits(word));
  const found = itself ? [word, ...bases] : bases;
  if (found.length > 0) return [...new Set(found)];
  if (word.endsWith("'s"))
    return lemmatize(written.slice(0, -2), lemmas, vocab, capitals);
  if (/\.[^.]+$/.test(word) && vocab.has(`${word}.`)) {
    // Its case matters: "i.d." is inside diameter, "I.D." identification.
    const dotted = `${word}.`;
    if (
      written === word ||
      capitals?.get(dotted)?.includes(`${written}.`) === true
    )
      return [dotted];
  }
  return [];
}
