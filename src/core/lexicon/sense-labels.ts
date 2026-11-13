/**
 * Parts of speech of a dictionary's senses, as the data build labels them for a source
 * without labels of its own (EJDict), written compactly in the pair pack
 * (`en-ja/pos.json`): one code per sense, separated by spaces.
 *
 * A code is a letter for the part of speech (`-` for none), then "~" when the label is
 * a guess that also fits an adverb (a Japanese noun gloss such as 今), or "?" when the
 * sense took it from its neighbours (gap filling), then "*" when the source marks the
 * sense as a core translation (EJDict's 『』). "n~ v a* a" is a noun guess, a verb, a
 * core adjective and an adjective.
 *
 * The data scripts import this file under plain Node: it has no imports.
 */

/** How a label was found: from the sense itself (none), a guess, or its neighbours. */
export type LabelSource = "weak" | "gap";

export interface SenseLabel {
  pos?: string;
  posBy?: LabelSource;
  core?: true;
}

const LETTERS: Readonly<Record<string, string>> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  r: "adverb",
  p: "preposition",
  c: "conjunction",
  d: "determiner",
  o: "pronoun",
  i: "interjection",
  m: "numeral",
  t: "article",
  l: "particle",
  P: "prepositional phrase",
  h: "phrase",
};
const LETTER_OF: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LETTERS).map(([letter, pos]) => [pos, letter]),
);

/** The parts of speech a code can hold. */
export const LABELLED_POS: ReadonlySet<string> = new Set(
  Object.values(LETTERS),
);

export function encodeSenseLabels(labels: readonly SenseLabel[]): string {
  return labels
    .map(({ pos, posBy, core }) => {
      const letter =
        pos !== undefined && Object.hasOwn(LETTER_OF, pos)
          ? LETTER_OF[pos]!
          : "-";
      const how =
        letter === "-"
          ? ""
          : posBy === "weak"
            ? "~"
            : posBy === "gap"
              ? "?"
              : "";
      return `${letter}${how}${core ? "*" : ""}`;
    })
    .join(" ");
}

export function decodeSenseLabels(code: string): SenseLabel[] {
  return code.split(" ").map((item) => {
    const letter = item[0] ?? "-";
    const pos = Object.hasOwn(LETTERS, letter) ? LETTERS[letter] : undefined;
    const posBy: LabelSource | undefined = item.includes("~")
      ? "weak"
      : item.includes("?")
        ? "gap"
        : undefined;
    return {
      ...(pos !== undefined && { pos }),
      ...(pos !== undefined && posBy !== undefined && { posBy }),
      ...(item.endsWith("*") && { core: true as const }),
    };
  });
}
