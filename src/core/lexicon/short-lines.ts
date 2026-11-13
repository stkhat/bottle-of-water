/**
 * Short lines: a sense as the hover card shows it, one sense per line. The data build
 * makes each entry's `short` from its first sense this way, and the dictionaries make
 * the hover card's lines from its first senses the same way (`shortLines`).
 *
 * The rules come in layers, so another language pair brings only its own parts:
 * - language-independent: the cut at the first sense separator outside brackets, the
 *   cap by display width, the hover's lines and the pointers they follow;
 * - per gloss language: what separates senses, readings, pointer syntax and the cap
 *   (Japanese here, English definitions in `shortOfDefinition` and `definitions.ts`);
 * - per dictionary source: its own markup (EJDict's 〈C〉/〈U〉 and {形}).
 *
 * The data scripts import this file under plain Node: it has no value imports.
 */

/** The hover card shows at most this many senses. */
const MAX_SHORT_LINES = 3;

// Language-independent

const OPENING = "(（〈[［「";
const CLOSING = ")）〉]］」";

/** Wide characters: Hangul jamo, CJK and kana, Hangul syllables, full-width forms. */
const WIDE =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;

/** Display width: wide characters count 2, others 1. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

/** Indices of the characters outside brackets for which `test` holds. */
function indicesOutside(
  text: string,
  test: (text: string, i: number) => boolean,
): number[] {
  const found: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (OPENING.includes(ch)) depth++;
    else if (CLOSING.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && test(text, i)) found.push(i);
  }
  return found;
}

const trimItems = (text: string) => text.replace(/^[\s,、]+|[\s,、]+$/g, "");

/**
 * The first sense of a gloss: the text up to the first separator outside brackets
 * (`isSeparator`), skipping senses that come out empty.
 */
function firstSense(
  text: string,
  isSeparator: (text: string, i: number) => boolean,
): string {
  let from = 0;
  for (const at of [...indicesOutside(text, isSeparator), text.length]) {
    const sense = trimItems(text.slice(from, at));
    if (sense !== "") return sense;
    from = at + 1;
  }
  return "";
}

const isComma = (text: string, i: number) =>
  text[i] === "," || text[i] === "、";

/** Each comma-separated item once: "色,色彩,色" → "色,色彩". */
function withoutRepeatedItems(text: string): string {
  const seen = new Set<string>();
  let out = "";
  let from = 0;
  for (const at of [...indicesOutside(text, isComma), text.length]) {
    const raw = text.slice(from, at);
    const item = raw.trim();
    if (item !== "" && !seen.has(item)) {
      seen.add(item);
      out += out === "" ? item : text[from - 1]! + raw.trimEnd();
    }
    from = at + 1;
  }
  return out;
}

/** Without groups in parentheses or square brackets, nested ones too. */
function withoutParentheses(text: string): string {
  let out = "";
  let depth = 0;
  for (const ch of text) {
    if ("(（[［".includes(ch)) depth++;
    else if (")）]］".includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return trimItems(out.replace(/\s+/g, " "));
}

/**
 * A line within `cap` display width. A longer one first loses its parenthesized
 * notes, which qualify the meaning outside them ("(…が生れつき備えている)能力,力" →
 * "能力,力"); then it is cut at the last comma outside brackets that fits, else cut
 * hard with "…" (text of narrow characters at a space in its second half).
 */
export function capLine(text: string, cap: number): string {
  if (displayWidth(text) <= cap) return text;
  const bare = withoutRepeatedItems(withoutParentheses(text));
  if (bare !== "" && bare !== text) return capLine(bare, cap);
  const commas = indicesOutside(text, isComma).filter(
    (i) => i > 0 && displayWidth(text.slice(0, i)) <= cap,
  );
  if (commas.length > 0) return text.slice(0, commas.at(-1)).trimEnd();
  let head = "";
  for (const ch of text) {
    if (displayWidth(head + ch) > cap - 1) break;
    head += ch;
  }
  const space = head.lastIndexOf(" ");
  if (displayWidth(text) === [...text].length && space > head.length / 2)
    head = head.slice(0, space);
  return `${head.trimEnd()}…`;
}

/**
 * A sense that only points to another word: the form of another word ("goの過去",
 * "Plural of …") or a cross-reference ("=color", "Synonym of …"). `target` is the
 * word's key when the pointer names one word or phrase.
 */
export interface Pointer {
  kind: "form" | "reference";
  target?: string;
}

/** A term as a key: lowercase, single spaces. */
const keyOf = (term: string) => term.trim().toLowerCase().replace(/\s+/g, " ");

/** A pointer's target when it names one term ("am not, is not" names two). */
export const pointerTarget = (term: string) =>
  term.includes(",") || term.trim() === "" ? undefined : keyOf(term);

export interface ShortLineOptions {
  /** The entry's own key: a pointer to it is not followed. */
  head?: string;
  /** Whether a line only points to another word. */
  pointer?: (line: string) => Pointer | undefined;
  /** The short lines of the entry a pointer names, when there is one. */
  follow?: (target: string) => readonly string[] | undefined;
}

/**
 * The hover card's lines, at most MAX_SHORT_LINES, each once, empty ones left out:
 * - a form pointer that is the first sense stays first, followed by its target's first
 *   meaning: the word on the page is most likely that form ("went" → "goの過去", then
 *   go's meanings; "found" → "findの過去・過去分詞", find's first meaning, then
 *   found's own "…を創設する");
 * - then the entry's own meanings in dictionary order;
 * - then the meanings of the words its pointers name ("anyway": "=anyhow" → anyhow's
 *   meanings).
 *
 * Pointers are followed one hop (a target's own pointers are not), and only from a
 * form that is the first sense or from an entry with no meaning of its own: a pointer
 * listed after the entry's own meanings marks a lesser use ("them": "=those").
 * Pointers themselves are left out while a meaning remains. Without any meaning the
 * lines are the pointers as they are. When every line is empty, `fallback` (the
 * entry's short meaning) stands for them ("were": its senses are only notes).
 */
export function shortLines(
  lines: readonly string[],
  fallback: string,
  {
    head,
    pointer = () => undefined,
    follow = () => undefined,
  }: ShortLineOptions = {},
): string[] {
  const nonEmpty = lines.filter((line) => line !== "");
  const kept = [...new Set(nonEmpty.length > 0 ? nonEmpty : [fallback])];
  const pointers = kept.map(pointer);
  const isMeaning = (line: string) =>
    line !== "" && pointer(line) === undefined;
  const first = pointers[0];
  const followAll = !pointers.includes(undefined);
  const followed = new Map<string, string[]>();
  pointers.forEach((found, i) => {
    const target = found?.target;
    if (target === undefined || target === head || followed.has(target)) return;
    if (followAll || (i === 0 && found?.kind === "form"))
      followed.set(target, (follow(target) ?? []).filter(isMeaning));
  });
  const leading =
    first?.kind === "form"
      ? [kept[0]!, ...(followed.get(first.target ?? "")?.slice(0, 1) ?? [])]
      : [];
  const shown = [
    ...new Set([
      ...leading,
      ...kept.filter((_, i) => pointers[i] === undefined),
      ...[...followed.values()].flat(),
    ]),
  ].slice(0, MAX_SHORT_LINES);
  return shown.some(isMeaning) ? shown : kept.slice(0, MAX_SHORT_LINES);
}

// Japanese glosses

/** A Japanese line's cap: 25 Japanese characters. */
const JAPANESE_CAP = 50;

const KATAKANA = /[\u30a1-\u30faー]/;
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60…〈〉]/;

/** The nearest character around `i` that is not a space, in direction `step`. */
function nearest(text: string, i: number, step: 1 | -1): string {
  let j = i + step;
  while (j >= 0 && j < text.length && /\s/.test(text[j]!)) j += step;
  return text[j] ?? "";
}

/**
 * What separates senses in a Japanese gloss: ";", "／", "・" (but not inside a
 * katakana name: ジョン・スミス), and a space between two Japanese glosses (but not
 * inside Latin text: "it is, it has").
 */
function isJapaneseSeparator(text: string, i: number): boolean {
  const ch = text[i]!;
  if (";；／".includes(ch)) return true;
  if (ch === "・")
    return !(
      KATAKANA.test(text[i - 1] ?? "") && KATAKANA.test(text[i + 1] ?? "")
    );
  return (
    /\s/.test(ch) &&
    JAPANESE.test(nearest(text, i, -1)) &&
    JAPANESE.test(nearest(text, i, 1))
  );
}

/** Kana readings after kanji: "戴冠(たいかん)式" → "戴冠式". */
const withoutReadings = (text: string) =>
  text.replace(
    /(\p{Script=Han}[々〆ヶ]?)[(（][\p{Script=Hiragana}ー]+[)）]/gu,
    "$1",
  );

/** Without 《…》 notes (nested too) and 『』 marks. */
function withoutNotes(sense: string): string {
  let out = "";
  let depth = 0;
  for (const ch of sense) {
    if (ch === "《") depth++;
    else if (ch === "》") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out.replace(/[『』]/g, "");
}

/** What a Japanese grammar pointer says of the word it names: "過去・過去分詞", "複数形". */
const JA_GRAMMAR =
  "(?:過去|現在|分詞|複数|単数|比較級|最上級|人称|直説法|仮定法|短縮|縮約|強調|強意|女性|異|形|および|[一二三の・,、\\s])+";
const JA_FORM = new RegExp(
  `^([A-Za-z][A-Za-z' .,-]*?)\\s*(?:[(（][^()（）]*[)）]\\s*)?の${JA_GRAMMAR}$`,
);
const JA_REFERENCE = /^[=＝]\s*([A-Za-z][A-Za-z0-9' .,-]*)$/;

/**
 * Japanese senses that only point to another word: an inflection ("goの過去",
 * "getの過去・過去分詞", "am not, is notの短縮形") or a cross-reference ("=color",
 * "=noon 1", whose sense number is not part of the target). "silverの化学記号" and
 * "=achoo (くしゃみの音)" say something of their own.
 */
export function japanesePointer(line: string): Pointer | undefined {
  const form = JA_FORM.exec(line);
  if (form) return withTarget("form", form[1]!);
  const reference = JA_REFERENCE.exec(line);
  if (reference)
    return withTarget("reference", reference[1]!.replace(/\s*\d+$/, ""));
  return undefined;
}

/** A grammar word that makes "Xの…" a form of X. */
const JA_FORM_WORD =
  /過去|分詞|複数|単数|三人称|比較級|最上級|直説法|仮定法|現在形|短縮/;
const JA_FORM_LEAD = new RegExp(
  `^([A-Za-z][A-Za-z']*)\\s*の(${JA_GRAMMAR})(.*)$`,
);
const JA_FORM_NOTE =
  /^[(（]\s*([A-Za-z][A-Za-z']*)\s*の([^()（）]*)[)）]\s*(.*)$/;

/**
 * The word a Japanese sense says this one is a form of, also when a meaning follows:
 * "goの過去" (go), "haveの過去形・…していた" (have, then "…していた"),
 * "(good の比較級;最上級は best)いっそうよい" (good, then "いっそうよい"), also in a
 * note ("《be の仮定法過去》"). `grammar` is what it says of the form ("過去",
 * "比較級;最上級は best").
 */
export function japaneseForm(
  sense: string,
): { target: string; grammar: string; rest: string } | undefined {
  // A sense that is only a note says it there: "《be の仮定法過去》".
  const text =
    withoutEjdictMarks(withoutNotes(sense)).trim() ||
    sense.replace(/[《》『』]/g, "").trim();
  const found = JA_FORM_NOTE.exec(text) ?? JA_FORM_LEAD.exec(text);
  if (!found || !JA_FORM_WORD.test(found[2]!)) return undefined;
  return {
    target: found[1]!.toLowerCase(),
    grammar: found[2]!,
    rest: trimItems(found[3]!.replace(/^[\s・;；]+/, "")),
  };
}

function withTarget(kind: Pointer["kind"], term: string): Pointer {
  const target = pointerTarget(term);
  return target === undefined ? { kind } : { kind, target };
}

// EJDict

/** EJDict's markup: countability 〈C〉/〈U〉 and part-of-speech marks ({形}, {名}). */
const withoutEjdictMarks = (text: string) =>
  text.replace(/〈[CU]〉/g, "").replace(/\{[^{}\s]{1,4}\}/g, "");

/**
 * An EJDict sense (or a Wiktionary translation) as a short line: without notes,
 * marks and readings, its first sense (a pointer stays whole: "findの過去・過去分詞"),
 * each item once, within 25 Japanese characters.
 */
export function cleanShort(sense: string): string {
  const text = withoutReadings(withoutEjdictMarks(withoutNotes(sense))).trim();
  if (japanesePointer(text)) return text;
  return capLine(
    withoutRepeatedItems(firstSense(text, isJapaneseSeparator)),
    JAPANESE_CAP,
  );
}

// English definitions

/** An English line's cap: 40 characters. */
const DEFINITION_CAP = 40;

/**
 * A definition (a Wiktionary gloss) as the short meaning: its first sense (cut at the
 * first ";" outside brackets), without a final period.
 */
export function shortOfDefinition(text: string): string {
  const cut = firstSense(text, (t, i) => t[i] === ";");
  return cut.endsWith(".") ? cut.slice(0, -1).trimEnd() : cut;
}

/**
 * A definition as a hover line, shown as written: its short meaning within 40
 * characters. A pointer (`pointer`) stays whole, so that it still names its target.
 */
export function definitionLine(
  text: string,
  pointer: (line: string) => Pointer | undefined = () => undefined,
): string {
  const short = shortOfDefinition(text);
  return pointer(short) ? short : capLine(short, DEFINITION_CAP);
}
