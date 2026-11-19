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
    entry(term, written, pos) {
      const found = dictionary.entry(term, written, pos);
      const head = keyOf(term);
      const list = expansions(head);
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
      const lines = (native ? found.lines : []).filter(
        (line) => ownLines.has(line) && !writesOutOnly(line, list, english),
      );
      const expansion = expansionLine(list);
      const writesOut = lines.some((line) => {
        const text = wordsOf(line).join(" ");
        return list.some((one) => text.includes(one.toLowerCase()));
      });
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
