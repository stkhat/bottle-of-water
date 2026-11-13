/**
 * Short lines: a sense as the hover card shows it. The data build makes each entry's
 * `short` from its first sense this way, and the dictionaries make the hover card's
 * lines from its first senses the same way (`shortLines`).
 */

/** The hover card shows at most this many senses. */
const MAX_SHORT_LINES = 3;

/**
 * An EJDict sense (or a Wiktionary translation) as a short line: without 《…》 notes
 * (nested too), 『』 marks and 〈C〉/〈U〉, cut at the first `;`.
 */
export function cleanShort(sense: string): string {
  let out = "";
  let depth = 0;
  for (const ch of sense) {
    if (ch === "《") depth++;
    else if (ch === "》") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  out = out.replace(/[『』]/g, "").replace(/〈[CU]〉/g, "");
  const semicolon = out.indexOf(";");
  if (semicolon >= 0) out = out.slice(0, semicolon);
  return out.trim();
}

/** A definition (a Wiktionary gloss) as a short line: cut at the first `;`, without a final period. */
export function shortOfDefinition(text: string): string {
  const semicolon = text.indexOf(";");
  const cut = (semicolon >= 0 ? text.slice(0, semicolon) : text).trim();
  return cut.endsWith(".") ? cut.slice(0, -1).trimEnd() : cut;
}

/** What a Japanese grammar pointer says of the word it names: "過去・過去分詞", "複数形". */
const JA_GRAMMAR =
  "(?:過去|現在|分詞|複数|単数|比較級|最上級|人称|直説法|仮定法|短縮|縮約|強調|強意|女性|異|形|[一二三の・,、\\s])+";

/**
 * A sense that only points to another word: the form of another word ("goの過去",
 * "Plural of …") or a cross-reference ("=color").
 */
type PointerKind = "form" | "reference";

const JA_FORM = new RegExp(`^[A-Za-z][A-Za-z' .,-]*の${JA_GRAMMAR}$`);
const JA_REFERENCE = /^[=＝]\s*[A-Za-z][A-Za-z0-9' .,-]*$/;

/**
 * Japanese senses that only point to another word: an inflection ("goの過去",
 * "getの過去・過去分詞", "am not, is notの短縮形") or a cross-reference ("=color",
 * "=noon 1"). "silverの化学記号" and "=achoo (くしゃみの音)" say something of their own.
 */
export function japanesePointer(line: string): PointerKind | undefined {
  if (JA_FORM.test(line)) return "form";
  if (JA_REFERENCE.test(line)) return "reference";
  return undefined;
}

/**
 * The hover card's lines: the senses' short lines in dictionary order, at most
 * MAX_SHORT_LINES, leaving out empty ones, repeats and, when other lines remain,
 * pointers (`pointer`). A form pointer that is the first sense stays first: the word
 * on the page is most likely that form ("found" → "findの過去・過去分詞", then
 * "…を創設する"). `fallback` (the entry's short meaning) when no line is left.
 */
export function shortLines(
  lines: readonly string[],
  fallback: string,
  pointer: (line: string) => PointerKind | undefined = () => undefined,
): string[] {
  const kept = [...new Set(lines.filter((line) => line !== ""))];
  const meanings = kept.filter((line, i) => {
    const kind = pointer(line);
    return kind === undefined || (kind === "form" && i === 0);
  });
  const shown = (
    meanings.some((line) => pointer(line) === undefined) ? meanings : kept
  ).slice(0, MAX_SHORT_LINES);
  return shown.length > 0 ? shown : [fallback];
}
