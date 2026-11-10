const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  lrm: "\u200e",
  rlm: "\u200f",
};

/** Decodes the XML/HTML character references subtitle formats use. Unknown ones stay as they are. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (whole, ref: string) => {
      if (ref[0] === "#") {
        const code =
          ref[1] === "x" || ref[1] === "X"
            ? parseInt(ref.slice(2), 16)
            : parseInt(ref.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
    },
  );
}

const INVISIBLE = /[\u200b-\u200f\u2060\ufeff]/g;

/**
 * Cleans cue text: drops zero-width and direction marks, turns no-break spaces into spaces,
 * trims every line and drops empty lines. Lines are joined with "\n".
 */
export function normalizeCueText(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}
