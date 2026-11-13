// The example corpus of a kaikki extract (rule B2): every usage example and quotation
// of every entry, with the entry's own headword cut out where kaikki marks it in bold,
// so an entry does not count itself. It gives an offline frequency for every word and
// phrase of the language, in the language's own sentences (English: about 21 million
// tokens). Language-independent: tokens are runs of letters with inner apostrophes.
import { eachEntry, type KaikkiEntry } from "./common.ts";

const TOKEN = /\p{L}+(?:'\p{L}+)*/gu;

/** The written forms a phrase's text may take: each word as written or as an inflected form. */
export type PhraseVariants = ReadonlyMap<string, string>;

export interface ExampleCounts {
  /** Tokens counted. */
  tokens: number;
  /** Lowercase word → occurrences. */
  words: ReadonlyMap<string, number>;
  /** Phrase key → occurrences of any of its variants. */
  phrases: ReadonlyMap<string, number>;
}

interface Example {
  text?: unknown;
  bold_text_offsets?: unknown;
  /** A quotation's reference, starting with its year ("1611, The Holy Bible…"). */
  ref?: unknown;
}

/** The year a quotation's reference starts with; undefined for a usage example. */
function exampleYear(example: Example): number | undefined {
  const year =
    typeof example.ref === "string"
      ? /^\s*(\d{3,4})\b/.exec(example.ref)
      : null;
  return year ? Number(year[1]) : undefined;
}

/** An example's text in pieces, cut where kaikki marks the entry's headword in bold. */
export function examplePieces(example: Example): string[] {
  const text = typeof example.text === "string" ? example.text : "";
  if (!text) return [];
  const cuts = (
    Array.isArray(example.bold_text_offsets) ? example.bold_text_offsets : []
  )
    .filter(
      (cut): cut is [number, number] =>
        Array.isArray(cut) &&
        typeof cut[0] === "number" &&
        typeof cut[1] === "number",
    )
    .sort((a, b) => a[0] - b[0]);
  const pieces: string[] = [];
  let at = 0;
  for (const [start, end] of cuts) {
    if (start < at) continue;
    pieces.push(text.slice(at, start));
    at = end;
  }
  pieces.push(text.slice(at));
  return pieces.map((piece) => piece.replace(/’/g, "'"));
}

/**
 * Each phrase key's variants: its words as written or as one of their inflected forms
 * (`forms`, base → forms), at most `perWord` forms a word and `perKey` variants a key.
 * A variant found under several keys counts for the first.
 */
export function phraseVariants(
  keys: Iterable<string>,
  forms: ReadonlyMap<string, readonly string[]>,
  { perWord = 8, perKey = 64 } = {},
): Map<string, string> {
  const variants = new Map<string, string>();
  for (const key of keys) {
    let written = [""];
    for (const word of key.split(" ")) {
      const options = [word, ...(forms.get(word) ?? [])].slice(0, perWord);
      written = written
        .flatMap((prefix) =>
          options.map((option) => (prefix ? `${prefix} ${option}` : option)),
        )
        .slice(0, perKey);
    }
    for (const variant of written)
      if (!variants.has(variant)) variants.set(variant, key);
  }
  return variants;
}

/**
 * The pieces of every usage example and quotation of an entry (`examplePieces`);
 * with `since`, without the quotations from before that year.
 */
export function* entryExamplePieces(
  entry: KaikkiEntry,
  since?: number,
): Generator<string> {
  for (const sense of entry.senses ?? [])
    for (const example of (sense as { examples?: Example[] }).examples ?? []) {
      const year = since === undefined ? undefined : exampleYear(example);
      if (year === undefined || year >= since!) yield* examplePieces(example);
    }
}

/** The words of a piece of an example, as written. */
export const pieceWords = (piece: string): string[] => piece.match(TOKEN) ?? [];

/**
 * Counts the words and the phrases (`variants`) of the examples of the `lang` entries
 * in a kaikki extract. N-grams do not bridge a cut-out headword.
 */
export async function countExamples(
  path: string,
  variants: PhraseVariants,
  lang = "en",
): Promise<ExampleCounts> {
  let longest = 2;
  for (const variant of variants.keys())
    longest = Math.max(longest, variant.split(" ").length);
  const words = new Map<string, number>();
  const phrases = new Map<string, number>();
  let tokens = 0;
  const count = (piece: string) => {
    const found = pieceWords(piece).map((t) => t.toLowerCase());
    tokens += found.length;
    for (let i = 0; i < found.length; i++) {
      let gram = found[i]!;
      words.set(gram, (words.get(gram) ?? 0) + 1);
      for (let n = 2; n <= longest && i + n <= found.length; n++) {
        gram += ` ${found[i + n - 1]!}`;
        const key = variants.get(gram);
        if (key !== undefined) phrases.set(key, (phrases.get(key) ?? 0) + 1);
      }
    }
  };
  await eachEntry(path, (entry: KaikkiEntry) => {
    if (entry.lang_code !== lang) return;
    for (const piece of entryExamplePieces(entry)) count(piece);
  });
  return { tokens, words, phrases };
}
