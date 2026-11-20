/**
 * Contractions in the hover (U1-5): what a dictionary shows for "I'm", "that's",
 * "gonna", over the learning language's contraction table (`ContractionPack`).
 *
 * A pair's sources write a contraction out in English more often than they translate
 * it ("that is | that has", "you + are"), point to its host as if it were a form of it
 * (pl there's → "there are" → its meanings, "ar, 100 m²"), or have nothing; English
 * Wiktionary's definitions of a contraction are its host's (you're → "you"). So a
 * contraction keeps only its own lines in the native language that do more than write
 * it out; with none, its hover line is what it is short for ("I am", "he is / he has").
 * With lines of its own that do not write it out, the card names it in its note
 * ("I'm → I am"), as it names a form's base ("went → go").
 */
import type { DictionaryEntry, DictionaryProvider } from "./dictionary";
import { keyOf, pointerLine } from "./short-lines";

/** The expansions a hover line or a note names: the first two ("he's → he is / he has"). */
const NAMED = 2;

/** A contraction's expansions as the hover's line or the card's note shows them. */
export const expansionLine = (expansions: readonly string[]) =>
  expansions.slice(0, NAMED).join(" / ");

/**
 * The expansions a contraction has where its clitic stands for `clitic` (K4: "has" →
 * he's "he has"): those that end with it; all of them when none does or nothing is
 * said ("he is / he has").
 */
export function expansionsHere(
  expansions: readonly string[],
  clitic: string | undefined,
): readonly string[] {
  if (clitic === undefined) return expansions;
  const here = expansions.filter(
    (expansion) => expansion.split(" ").at(-1)?.toLowerCase() === clitic,
  );
  return here.length > 0 ? here : expansions;
}

/** A line as words: lower case, without quotes, "=", "+" and closing stops. */
const wordsOf = (line: string) =>
  line
    .replaceAll("’", "'")
    .toLowerCase()
    .replace(/[“”"„«»=+]/g, " ")
    .replace(/[.:;,!]+\s*$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/**
 * Whether a line writes `expansion` out, as whole English words ("she is" is not in
 * "he is"; "she hasの短縮形" and "contracción de 'she has'" name "she has").
 */
const names = (line: string, expansion: string) => {
  const words = (
    line
      .toLowerCase()
      .replaceAll("’", "'")
      .match(/[a-z']+/g) ?? []
  )
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
  return ` ${words.join(" ")} `.includes(` ${expansion.toLowerCase()} `);
};

/**
 * Whether a line only writes the contraction out in English: one of its expansions, or
 * up to four English words that start with its host ("that was" for that's), several
 * joined with "/" or ",".
 */
function writesOutOnly(
  line: string,
  expansions: readonly string[],
  english: (word: string) => boolean,
): boolean {
  const lower = expansions.map((expansion) => expansion.toLowerCase());
  const hosts = new Set(lower.map((expansion) => expansion.split(" ")[0]!));
  return line
    .split(/\s*[/,]\s*/)
    .filter(Boolean)
    .every((part) => {
      const words = wordsOf(part);
      if (words.length === 0 || lower.includes(words.join(" "))) return true;
      return (
        words.length <= 4 &&
        hosts.has(words[0]!) &&
        words.every((word) => /^[a-z']+$/.test(word) && english(word))
      );
    });
}

export interface ContractionOptions {
  /** A contraction's expansions, by its key ([] for a word that is none). */
  expansions: (key: string) => readonly string[];
  /** Whether a word (in lower case) is an English word: the learning language's vocabulary. */
  english: (word: string) => boolean;
}

/**
 * `dictionary` with contractions shown by what they are short for. A contraction's
 * entry keeps only its own native lines (its senses' lines, not those followed from a
 * pointer) that do not only write it out in English (`writesOutOnly`); its English
 * definitions (`glossLang`) are left out. With no line left, its line and short
 * meaning are its expansions (`expansionLine`), also when the dictionary has no entry
 * (ru, pl I'm). With lines left of which none writes an expansion out, `expansion`
 * names them for the card's note (pl don't: "nie", note "do not"; ja "I amの短縮形"
 * writes it out: no note).
 */
export function withContractions(
  dictionary: DictionaryProvider,
  { expansions, english }: ContractionOptions,
): DictionaryProvider {
  return {
    ...dictionary,
    entry(term, written, pos, clitic, spelledOut) {
      const found = dictionary.entry(term, written, pos, clitic, spelledOut);
      const head = keyOf(term);
      const all = expansions(head);
      // Named: the expansions its clitic stands for here; lines that only write it out
      // are left out by any of them.
      const list = expansionsHere(all, clitic);
      if (list.length === 0) return found;
      const native = found !== undefined && found.glossLang === undefined;
      const ownLines = new Set(
        native
          ? found.senses.flatMap((sense) => [
              dictionary.senseLine(sense),
              pointerLine(sense.text),
            ])
          : [],
      );
      let lines = (native ? found.lines : []).filter(
        (line) => ownLines.has(line) && !writesOutOnly(line, all, english),
      );
      const expansion = expansionLine(list);
      let writesOut = lines.some((line) => {
        const text = wordsOf(line).join(" ");
        return all.some((one) => text.includes(one.toLowerCase()));
      });
      // K4 over its own lines: where the sentence decides, a line naming only another
      // reading goes (es she's "contracción de she has, ella tiene" before "a"), and a
      // line naming the others too gets the note (ja "she is, she hasの短縮形").
      if (list.length < all.length) {
        const others = all.filter((one) => !list.includes(one));
        const here = (line: string) => list.some((one) => names(line, one));
        const elsewhere = (line: string) =>
          others.some((one) => names(line, one));
        const kept = lines.filter((line) => here(line) || !elsewhere(line));
        if (kept.length > 0) lines = kept;
        writesOut = lines.some((line) => here(line) && !elsewhere(line));
      }
      const entry: DictionaryEntry = {
        head: found?.head ?? head,
        kind: "word",
        ...(found?.ipa !== undefined && { ipa: found.ipa }),
        short: lines[0] ?? expansion,
        lines: lines.length > 0 ? lines : [expansion],
        senses: native ? found.senses : [],
        ...(lines.length > 0 && !writesOut && { expansion }),
      };
      return entry;
    },
  };
}
