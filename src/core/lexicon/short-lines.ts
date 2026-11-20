/**
 * Short lines: a sense as the hover card shows it, one sense per line. An entry's
 * `short` comes from its first sense this way (stored by the data build in en-ja, made
 * at lookup for the definitions packs, `shortOfSenses`, and for the pair packs,
 * `shortOfPairSenses`, which store one only where the build made another), and the
 * dictionaries make the hover card's lines from its first senses the same way
 * (`shortLines`).
 *
 * The rules come in layers, so another language pair brings only its own parts:
 * - language-independent: the cut at the first sense separator outside brackets, the
 *   cap by display width, the hover's lines and the pointers they follow;
 * - per gloss language: what separates senses, readings, pointer syntax and the cap
 *   (Japanese here, English definitions in `shortOfDefinition` and `definitions.ts`,
 *   the recipe pairs' edition glosses in `editionLine`);
 * - per dictionary source: its own markup (EJDict's 〈C〉/〈U〉 and {形}).
 *
 * The data scripts import this file under plain Node: it has no value imports.
 */

/** The hover card shows at most this many senses. */
export const MAX_SHORT_LINES = 3;

/**
 * A native-language line's cap, in display width: 25 wide characters or 50 Latin or
 * Cyrillic ones. In the mock's hover card (260 px of 15 px Inter) both take at most two
 * rows: a row holds 17 wide characters, and the editions' and the translator's Latin
 * lines of up to 60 characters (Cyrillic, wider, 58) fit two rows
 * (docs/notes/native-quality.md "Suggested order", step 4).
 */
const NATIVE_CAP = 50;

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
  text[i] === "," || text[i] === "、" || text[i] === "，";

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
  // Display width adds up character by character.
  let width = 0;
  for (const ch of text) {
    width += displayWidth(ch);
    if (width > cap - 1) break;
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
export const keyOf = (term: string) =>
  term.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Where a recipe pair keeps a word's capitalised headwords, under keys no lowercase
 * term uses: its key with the first letter capitalised (Japan, January, I'm), or, for
 * an acronym, in capitals (TV, WHO).
 */
export const capitalKey = (key: string, acronym = false) =>
  acronym ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);

/** A word's letters, to tell its spellings alike: "OK" and "O.K." are "ok". */
const lettersOf = (term: string) =>
  term
    .normalize("NFD")
    .replace(/[^\p{L}]/gu, "")
    .toLowerCase();

/**
 * A pointer's target when it names one term: one word or phrase, or several spellings
 * of it, the first ("OK,O.K."). Several words name none ("am not, is not").
 */
const pointerTarget = (term: string) => {
  const items = term.split(",").map((item) => item.trim());
  if (items.some((item) => item === "")) return undefined;
  const letters = lettersOf(items[0]!);
  return letters !== "" && items.every((item) => lettersOf(item) === letters)
    ? keyOf(items[0]!)
    : undefined;
};

export interface ShortLineOptions {
  /** The entry's own key: a pointer to it is not followed. */
  head?: string;
  /** Whether a line only points to another word. */
  pointer?: (line: string) => Pointer | undefined;
  /** The short lines of the entry a pointer names, when there is one. */
  follow?: (target: string) => readonly string[] | undefined;
  /** A pointer line that is left out while a meaning shows. */
  quiet?: (line: string) => boolean;
  /** A first form shown after its target's first meaning, not before it. */
  second?: (line: string) => boolean;
  /**
   * A meaning of another part of speech than the word's tag (rule A2): where a
   * pointer is followed, it comes after the meanings of the tagged one, the targets'
   * included.
   */
  aside?: (line: string) => boolean;
}

/**
 * What a line says, to tell repeats: without spaces and the punctuation of a sentence
 * ("davvero" and "davvero?", "Gracias" and "¡Gracias!", "的" and "...的" say the same).
 * Case counts (German "Morgen", morning, and "morgen", tomorrow; Russian "Бог", God,
 * and "бог", a god), and so do brackets: "(…を)研究する" says more than "…を研究する".
 */
const sayingOf = (line: string) =>
  line.replace(/[\s.,;:!?¡¿…"“”«»。、，；：！？]+/gu, "") || line;

/** Each line once: the first of those that say the same (`sayingOf`). */
function onceEach(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const saying = sayingOf(line);
    if (seen.has(saying)) return false;
    seen.add(saying);
    return true;
  });
}

/**
 * The shown lines that say more than the lines before them: a line each of whose comma
 * items, notes in brackets left out, an earlier line already gives is left out
 * (fr devoir "must, to have to, should / must / should" → the first line; de für "for
 * (intended for) / for / for, because of" → the first and the last). No later sense
 * takes its place: the card is shorter (R3, judged blind against keeping the line and
 * against counting notes, in es, fr, de and en with Japanese and Spanish lines).
 */
function sayingMore(lines: readonly string[]): string[] {
  const given = new Set<string>();
  return lines.filter((line) => {
    const items: string[] = [];
    let from = 0;
    for (const at of [...indicesOutside(line, isComma), line.length]) {
      const item = sayingOf(withoutParentheses(line.slice(from, at)));
      if (item !== "") items.push(item);
      from = at + 1;
    }
    const repeats = items.length > 0 && items.every((item) => given.has(item));
    for (const item of items) given.add(item);
    return !repeats;
  });
}

/**
 * The hover card's lines, at most MAX_SHORT_LINES, each once (`onceEach`: a line that
 * says what one before it says, with other punctuation, is left out), empty ones left
 * out, and so is a shown line whose items earlier lines give (`sayingMore`):
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
 * Pointers themselves are left out while a meaning remains, and so is a first form
 * that is `quiet` (a pair's pointer wider than its cap); a first form that comes
 * `second` follows its target's first meaning (a pair's verb form in a spaced script:
 * sold → vender, "pasado simple del verbo sell"). Where a pointer is followed,
 * meanings `aside` (of another part of speech than the tag) come after the others,
 * the targets' included: es "better"
 * read as an adjective → "comparativo irregular de good", good's adjectives, then
 * the verb "mejorar". Without any meaning the
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
    quiet = () => false,
    second = () => false,
    aside = () => false,
  }: ShortLineOptions = {},
): string[] {
  const nonEmpty = lines.filter((line) => line !== "");
  const kept = onceEach(nonEmpty.length > 0 ? nonEmpty : [fallback]);
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
  const meaningFirst = followed.get(first?.target ?? "")?.slice(0, 1) ?? [];
  const leading =
    first?.kind !== "form"
      ? []
      : second(kept[0]!)
        ? [...meaningFirst, kept[0]!]
        : [kept[0]!, ...meaningFirst];
  const own = kept.filter((_, i) => pointers[i] === undefined);
  const targets = [...followed.values()].flat();
  const meanings =
    targets.length === 0
      ? own
      : [
          ...[...own, ...targets].filter((line) => !aside(line)),
          ...[...own, ...targets].filter(aside),
        ];
  const all = onceEach([...leading, ...meanings]);
  const heard = all.filter((line) => !quiet(line));
  const shown = sayingMore(
    (heard.some(isMeaning) ? heard : all).slice(0, MAX_SHORT_LINES),
  );
  return shown.some(isMeaning) ? shown : kept.slice(0, MAX_SHORT_LINES);
}

// Japanese glosses

const KATAKANA = /[\u30a1-\u30faー]/;
/** A character of Japanese text: kana, kanji, full-width forms, and …〈〉. */
const JAPANESE_TEXT =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff60…〈〉]/;

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
    JAPANESE_TEXT.test(nearest(text, i, -1)) &&
    JAPANESE_TEXT.test(nearest(text, i, 1))
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

/**
 * Endings of a Japanese clause that depends on what follows it (…して, …したり,
 * …するために, …を): a line cut after one leaves out its main verb, which comes last.
 */
const JA_DEPENDENT =
  /(?:て|(?<!ま)で|たり|ために|ように|ながら|ので|から|けど|けれど|ば|ずに|ないで|ても|には|では|とは|ため|つつ|を|の|と|や|へ|より|など|が|は|も)$/;

/** Japanese particles that attach to what comes before them. */
const JA_PARTICLE = "をにがのとはへでや";

/**
 * A translated line without its notes in brackets, which qualify the meaning, and the
 * particle a note leaves after a dependent ending ("…場所で (誰か) と一緒に来る" → "…場所で一緒に来る",
 * "(文書などの集まり) を調べて" → "調べて").
 */
function withoutJapaneseNotes(text: string): string {
  let out = "";
  let depth = 0;
  let dropped = false;
  for (const ch of text) {
    if ("(（[［".includes(ch)) depth++;
    else if (")）]］".includes(ch)) {
      depth = Math.max(0, depth - 1);
      dropped = depth === 0;
    } else if (depth === 0) {
      if (dropped && /\s/.test(ch)) continue;
      const bare = out.trimEnd();
      if (
        dropped &&
        JA_PARTICLE.includes(ch) &&
        (bare === "" || /[、,]$/.test(bare) || JA_DEPENDENT.test(bare))
      ) {
        dropped = false;
        continue;
      }
      dropped = false;
      out += ch;
    }
  }
  return trimItems(withoutWideSpaces(out));
}

/** Spaces next to a Japanese character. */
const SPACES_BY_JAPANESE = new RegExp(
  `(?<=${JAPANESE_TEXT.source})\\s+|\\s+(?=${JAPANESE_TEXT.source})`,
  "g",
);

/** Without spaces next to a Japanese character ("次の 単語" → "次の単語"). */
const withoutWideSpaces = (text: string) =>
  text.replace(/\s+/g, " ").replace(SPACES_BY_JAPANESE, "");

/** A clause after a comma without its leading conjunction: "または許す" → "許す". */
const withoutConjunction = (text: string) =>
  text.replace(/^(?:または|あるいは|もしくは|そして|および|かつ)\s*/, "");

/**
 * The longest tail of a clause that fits, cut after a particle before a word ("…部屋
 * またはその他のスペースに入る" → "その他のスペースに入る"): it keeps the main verb,
 * which comes last, where cutting the head would lose it.
 */
function afterParticle(
  text: string,
  fits: (cut: string) => boolean,
): string | undefined {
  for (let i = 1; i < text.length - 1; i++)
    if (
      JA_PARTICLE.includes(text[i]!) &&
      !/[\p{scx=Hiragana}\s]/u.test(text[i + 1]!) &&
      fits(text.slice(i + 1))
    )
      return text.slice(i + 1);
  return undefined;
}

/**
 * A Japanese translation within the cap, keeping as much of it as fits
 * (`translatedLine`): its first sentence, without notes in brackets; then the longer
 * of its longest head that ends a clause of its own ("通過する、またはある場所を横切る")
 * and its longest tail, which keeps the main verb that comes last ("…して、何かを手に
 * 入れようとする"); else its longest tail after a particle; else cut hard.
 */
function japaneseTranslation(line: string): string {
  if (displayWidth(line) <= NATIVE_CAP) return line;
  const sentence = line.split("。")[0]!;
  const text =
    withoutRepeatedItems(withoutJapaneseNotes(sentence)) || sentence.trim();
  if (displayWidth(text) <= NATIVE_CAP) return text;
  const fits = (cut: string) => cut !== "" && displayWidth(cut) <= NATIVE_CAP;
  const commas = indicesOutside(text, isComma);
  const head = commas
    .map((i) => text.slice(0, i).trimEnd())
    .filter((cut) => fits(cut) && !JA_DEPENDENT.test(cut))
    .at(-1);
  const tail = commas
    .map((i) => withoutConjunction(trimItems(text.slice(i + 1))))
    .find(fits);
  if (head === undefined || tail === undefined)
    return (
      head ?? tail ?? afterParticle(text, fits) ?? capLine(text, NATIVE_CAP)
    );
  return displayWidth(tail) >= displayWidth(head) ? tail : head;
}

/** A translated sentence as a short meaning: without its final period (。 or .). */
export const withoutFinalStop = (text: string) =>
  text.trim().replace(/[。．.]+$/, "");

/**
 * A meaning the browser's translator gave (an English definition translated into
 * `lang`) as a hover line, like the dictionaries' lines: without a final period, each
 * comma item once ("組み立て、構築、構築" → "組み立て、構築"), within the native cap
 * (NATIVE_CAP: 25 wide characters, 50 Latin or Cyrillic ones). A Japanese line keeps
 * its main verb, which comes last: a long line loses its notes in brackets, then is cut
 * after a clause that does not depend on what follows, else keeps its last clauses.
 * Another language's line is its first sentence (up to "。" or `firstSentence`), cut
 * at its end (`capLine`). The dictionary window shows the whole translation.
 */
export function translatedLine(text: string, lang: string): string {
  const line = withoutRepeatedItems(withoutFinalStop(text));
  if (lang === "ja") return japaneseTranslation(line);
  return capLine(firstSentence(line.split("。")[0]!), NATIVE_CAP);
}

// Native glosses in other languages (a recipe pair's edition)

/**
 * The text up to its first sentence end in a spaced script: a period followed by a
 * capital or an arrow ("Más. Comparativo de much" → "Más"; "Enfant . Note d'usage : …"
 * → "Enfant"; "Coche. → voir check mark" → "Coche"). Not after an abbreviation: a
 * single letter or a word in capitals ("J. C.", "EE. UU."), a number ("3. Person"), or
 * one the data build learned from the edition, which a no-break space follows
 * ("Gegenstand bzw.\u00a0Ergänzung").
 */
export function firstSentence(text: string): string {
  const end = indicesOutside(text, (t, i) => {
    if (t[i] !== "." || !/^[^\S\u00a0]+[\p{Lu}→]/u.test(t.slice(i + 1)))
      return false;
    return /\s$/.test(t.slice(0, i)) || !endsAbbreviation(t.slice(0, i));
  }).find((i) => i > 0);
  return end === undefined ? text : text.slice(0, end).trim();
}

/**
 * Whether text ends with an abbreviation's word: a single letter, capitals, a number.
 * A closing bracket or quote does not ("maison (famille). Note d'usage : …").
 */
function endsAbbreviation(text: string): boolean {
  if (/[)）\]］"”»’]$/u.test(text)) return false;
  const word = /[\p{L}\p{N}]+$/u.exec(text)?.[0] ?? "";
  return [...word].length < 2 || !/\p{Ll}/u.test(word);
}

/** Without closing marks, a period too unless it ends an abbreviation ("EE. UU."). */
const withoutClosingMarks = (text: string): string => {
  const bare = text.replace(/[\s:;,。：；]+$/u, "");
  return bare.endsWith(".") && !endsAbbreviation(bare.replace(/[.\s]+$/, ""))
    ? withoutClosingMarks(bare.replace(/[.\s]+$/, ""))
    : bare;
};

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Most words a translation has: 1 to 3 words are 90–97% of the translation tables'
 * first words in every recipe pair (fr 90%); a gloss of more describes.
 */
const TRANSLATION_WORDS = 3;

/** Whether a gloss part is a list of translations: each comma item of at most `words` words. */
const translationItems = (part: string, words = TRANSLATION_WORDS) =>
  part
    .split(",")
    .map((item) => item.trim())
    .every((item) => item !== "" && wordsOf(item) <= words);

/**
 * Whether an edition's line describes its word rather than translating it: its first
 * comma item outside brackets has more than TRANSLATION_WORDS words ("el, la, los, las"
 * translates).
 */
export const describes = (line: string) =>
  wordsOf(withoutParentheses(line).split(/[,，]/)[0]!) > TRANSLATION_WORDS;

/**
 * What a qualifier introduces: "De un recurso o sustancia, generalmente alimento:
 * consumir, usar" → "consumir, usar"; "często przed gerund: mój, swój" → "mój, swój";
 * de "„you are, 2. Person Singular:“ du bist" → "du bist". A qualifier is the text
 * before the first colon outside brackets that a space follows (a closing quote may
 * come between), of two words or more, and no shorter than the first item after it: a
 * translation followed by its explanation stays ("Mil millones: un 1 seguido por 9
 * ceros", "Foro: una plaza…"). A line written "X → Y" is Y ("United States → Stany
 * Zjednoczone").
 */
function afterQualifier(text: string): string {
  const colon = indicesOutside(text, (t, i) => t[i] === ":")[0];
  // A qualifier opens the gloss: a colon in a later sense is that sense's own ("bloqueo;
  // Situación … por ejemplo: hilos o procesos…" is "bloqueo").
  const senseEnd =
    indicesOutside(text, (t, i) => t[i] === ";" || t[i] === "；")[0] ??
    text.length;
  if (colon !== undefined && colon < senseEnd) {
    const before = text.slice(0, colon).replace(/["“”„«»]/g, " ");
    const after = text
      .slice(colon + 1)
      .replace(/^["“”»’]*\s+/, "")
      .trim();
    const first = after.split(",")[0]!;
    if (
      after !== "" &&
      /^["“”»’]*\s/.test(text.slice(colon + 1)) &&
      wordsOf(before) >= 2 &&
      wordsOf(first) <= wordsOf(before)
    )
      return after;
  }
  const arrow = indicesOutside(text, (t, i) => t[i] === "→").at(-1);
  const pointed = arrow === undefined ? "" : text.slice(arrow + 1).trim();
  return pointed !== "" ? pointed : text;
}

/**
 * The translations a description is followed by: "Pronombre de segunda persona
 * singular y plural; tú, vos, usted" → "tú, vos, usted"; pt "caso nominativo da
 * segunda pessoa do singular, tu, você" → "tu, você". The first sense (up to ";") is
 * its first comma item when that describes (`describes`), and the translations are the
 * sense after it when each of its items is a translation, or its two or more other
 * items when each is one word (an item of more words after a description qualifies it:
 * "…, especialmente en grupo"). Undefined when the gloss has no such translations.
 */
function translationsAfter(text: string): string | undefined {
  const [first = "", ...rest] = sensesOf(text);
  const items = first.split(",").map((item) => item.trim());
  if (!describes(items[0]!)) return undefined;
  const others = items.slice(1).join(", ");
  if (items.length >= 3 && translationItems(others, 1)) return others;
  const next = rest.find((sense) => sense !== "");
  return next !== undefined && translationItems(next) ? next : undefined;
}

/** A gloss's senses: its parts between semicolons outside brackets. */
function sensesOf(text: string): string[] {
  const cuts = indicesOutside(text, (t, i) => t[i] === ";" || t[i] === "；");
  let from = 0;
  return [...cuts, text.length].map((at) => {
    const sense = trimItems(text.slice(from, at));
    from = at + 1;
    return sense;
  });
}

/** A label in brackets that opens a gloss. */
const OPENING_LABEL =
  /^\s*[(（[［]([^()（）[\]［］]*)[)）\]］]\s*(?=[^\s:：])/u;

/**
 * A gloss without the labels in brackets that open it: each of several words ("(w
 * religiach monoteistycznych) Bóg" → "Bóg") or an abbreviation ("(истор.) Британия",
 * "(the Plough) (астрон.) Большая Медведица"), as the data build brackets an edition's
 * opening label abbreviations. One word in brackets is part of the meaning ("(Ne) …
 * pas") or, in a script without spaces, a note judges kept ("（现多）点燃").
 */
function withoutOpeningLabels(text: string): string {
  let rest = text;
  for (;;) {
    const found = OPENING_LABEL.exec(rest);
    const inside = found?.[1]?.trim() ?? "";
    if (
      !found ||
      !(/\S\s+\S/u.test(inside) || /^\p{L}[\p{L}\p{M}-]*\.$/u.test(inside))
    )
      return rest;
    rest = rest.slice(found[0].length);
  }
}

/**
 * A recipe pair's edition gloss (in the native language, any script) as a hover line
 * (NATIVE, every language but Japanese, whose dictionary is EJDict):
 * - without the source's sense subscripts after a word ("Pedir₁", "Ley₁₋₉"; not O₂),
 *   an ellipsis that opens it, which stands for the word in use ("…służący do
 *   tworzenia pytań"), and a label of several words in brackets that opens it ("(w
 *   religiach monoteistycznych) Bóg" → "Bóg"); one word in brackets is part of the
 *   meaning ("(Ne) … pas") or, in a script without spaces, a note judges kept
 *   ("（现多）点燃");
 * - its first sentence (`firstSentence`), which leaves out usage notes ("Tout à
 *   l'heure. Note d'usage : …");
 * - what a qualifier introduces (`afterQualifier`);
 * - the translations a description is followed by (`translationsAfter`), else its first
 *   sense (up to ";");
 * - without closing marks ("dizer:" → "dizer"; a period, unless it ends an
 *   abbreviation: "EE. UU."), each comma item once, within the native cap (`capLine`,
 *   NATIVE_CAP).
 */
export function editionLine(text: string): string {
  const clean = withoutOpeningLabels(
    text
      .replace(/(?<=[\p{Ll}.])[₀-₉₋]+/gu, "")
      .replace(/^\s*(?:…|\.{3})+\s*/u, ""),
  );
  const meaning = afterQualifier(firstSentence(clean));
  const sense =
    translationsAfter(meaning) ??
    sensesOf(meaning).find((part) => part !== "") ??
    "";
  return capLine(withoutRepeatedItems(withoutClosingMarks(sense)), NATIVE_CAP);
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
    NATIVE_CAP,
  );
}

// English definitions

/** An English line's cap: 40 characters. */
const DEFINITION_CAP = 40;

/**
 * A note in square brackets that opens a gloss says how the word is used, not what it
 * means: a construction ("[with dative] in", "[with nach (+ dative) ‘like
 * someone/something’]"), an auxiliary ("[auxiliary sein] to wander"), a region
 * ("[Swiss] national team"). A gloss that is only such a note heads subsenses the
 * source keeps apart, and says nothing on its own.
 */
const OPENING_NOTE = /^\s*\[[^\]]*\]\s*/u;

/**
 * A definition (a Wiktionary gloss) as the short meaning: its first sense (cut at the
 * first semicolon outside brackets, ";" or the full-width "；" of Chinese glosses),
 * without an opening note in square brackets (`OPENING_NOTE`) or a final period ("."
 * or "。"). Empty for a gloss that is only such a note.
 */
export function shortOfDefinition(text: string): string {
  const cut = firstSense(
    text.replace(OPENING_NOTE, ""),
    (t, i) => t[i] === ";" || t[i] === "；",
  );
  return /[.。]$/.test(cut) ? cut.slice(0, -1).trimEnd() : cut;
}

/**
 * A definitions entry's short meaning (`DefsPack`: en-defs, es-en, fr-en, de-en): its
 * first sense's (`shortOfDefinition`). The packs do not store it (format 2).
 */
export const shortOfSenses = (
  senses: readonly (readonly [pos: string, text: string, ...rest: unknown[]])[],
): string => shortOfDefinition(senses[0]?.[1] ?? "");

/**
 * A pair entry's short meaning (`PairPack`, `LearningPairPack`: the recipe pairs and
 * de-fr), made from its first sense: a sense with an English hint (a translation
 * table's or a wordnet's) is a list of translations, and the short is its first one
 * ("corteza, costra" → "corteza"); any other sense (an edition's gloss, a pointer) is
 * read as a definition (`shortOfDefinition`: "Pieza de pan." → "Pieza de pan"). The
 * packs store a short only where the data build made another (format 4): a Wikidata
 * description is the whole description ("ciudad y sede del condado de Summit, estado
 * de Ohio, Estados Unidos"), a reversed table's word the whole word ("P.G.").
 */
export const shortOfPairSenses = (
  senses: readonly (readonly [
    pos: string,
    text: string,
    hint?: string | null,
    ...rest: unknown[],
  ])[],
): string => {
  const first = senses[0];
  if (first === undefined) return "";
  const [, text, hint] = first;
  return hint != null ? text.split(", ")[0]! : shortOfDefinition(text);
};

/** Whether position `at` of `text` is inside parentheses or square brackets. */
function insideBrackets(text: string, at: number): boolean {
  let depth = 0;
  for (const ch of text.slice(0, at)) {
    if ("(（[［".includes(ch)) depth++;
    else if (")）]］".includes(ch)) depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/** Where a definition says how its word is translated: "…, typically translating into English as …". */
const TRANSLATED_AS =
  /\b(?:translat(?:ed|es|ing)|rendered)\s+(?:into\s+English\s+)?as\s+(.+)$/iu;

/**
 * The translations a definition that describes its word names (`describes`): fr pas,
 * "The most common adverb of negation in French, typically translating into English as
 * not, don't, doesn't, etc." → "not, don't, doesn't"; de geben, "Used to indicate that
 * something exists (…). Usually translated as there is/are or there exist(s)" → "there
 * is/are, there exist(s)". Outside brackets only, and only when each item, split at
 * commas and "or", is a translation (`translationItems`): "may be translated as
 * "including" or such as in some situations" names none. Undefined otherwise.
 */
function translatedAs(text: string): string | undefined {
  if (!describes(text)) return undefined;
  const found = TRANSLATED_AS.exec(text);
  const named = found?.[1];
  if (named === undefined || insideBrackets(text, found!.index))
    return undefined;
  const items = named
    .split(/,|\s+or\s+/u)
    .map((item) => item.trim().replace(/^["“'‘]+|["”'’.]+$/gu, ""))
    .filter((item) => item !== "" && !/^etc\.?$/iu.test(item));
  return items.length > 0 && translationItems(items.join(", "))
    ? items.join(", ")
    : undefined;
}

/**
 * A definition as a hover line, shown as written: its short meaning within 40
 * characters, or the translations a description of the word names (`translatedAs`).
 * A pointer (`pointer`) stays whole, so that it still names its target.
 */
export function definitionLine(
  text: string,
  pointer: (line: string) => Pointer | undefined = () => undefined,
): string {
  const short = shortOfDefinition(text);
  if (pointer(short)) return short;
  return capLine(translatedAs(short) ?? short, DEFINITION_CAP);
}

// Pair dictionaries' pointer senses

/**
 * A pair dictionary's pointer sense (an edition's form of another word) as a hover
 * line: its first sense without notes in brackets, an opening arrow and closing
 * punctuation ("Pasado simple del verbo (to) tell." → "Pasado simple del verbo tell";
 * "→ voir advisor" → "voir advisor"), whole, since a cut would lose the word it names.
 */
export const pointerLine = (text: string) =>
  withoutParentheses(shortOfDefinition(text))
    .replace(/^→\s*/u, "")
    .replace(/[\s.:;。：；]+$/u, "");

/**
 * Whether a pair dictionary's pointer line is short enough to show beside meanings. One
 * that comes `second`, after its base's first meaning (a verb inflection), takes the
 * native cap: judged better shown than left out (pl, es, fr "said": mówić, "forma czasu
 * przeszłego prostego czasownika to say"). One that comes first (a plural, a degree)
 * keeps 40, as it holds back the meaning: at 50, judges preferred the base's meaning
 * alone (ru teeth: "форма множественного числа существительного tooth", зуб). U1-4.
 */
export const fitsPairCap = (line: string, second = false) =>
  displayWidth(line) <= (second ? NATIVE_CAP : DEFINITION_CAP);

/** The parts of speech whose forms are degrees: comparatives and superlatives. */
const DEGREES: readonly string[] = ["adjective", "adverb"];

/**
 * The base an edition's unmarked degree names (es better: "Comparativo irregular de
 * good"; editions mark verb forms and plurals, which the data build keeps as pointers,
 * but often not comparatives and superlatives): a pair sense with no target and no hint
 * (an edition's, not a table's) of an adjective or adverb that writes, after other
 * words, one of its headword's base forms (`bases`, the learning language's lemmas:
 * better → good, well) whose main part of speech (`learningPos`) is the sense's own, in
 * its line (`editionLine`). A gloss that starts with the base is a native word spelt the
 * same (fr contented: "Content, satisfait"); one whose line is the meaning a qualifier
 * introduces is that meaning (es later: "Comparativo de late: más tarde" → "más
 * tarde"). The pair dictionary reads such a sense as a pointer, and the data build as
 * no meaning of its own.
 */
export function degreeOf(
  [pos, gloss, hint, target]: readonly [
    pos: string,
    text: string,
    hint?: string | null,
    target?: string,
  ],
  head: string,
  bases: readonly string[],
  learningPos: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  if (target !== undefined || hint != null || !DEGREES.includes(pos))
    return undefined;
  const text = editionLine(gloss);
  return bases.find((base) => {
    if (
      base === head ||
      !Object.hasOwn(learningPos, base) ||
      learningPos[base]![0] !== pos
    )
      return false;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const at = text.search(
      new RegExp(`(?<![\\p{L}\\p{N}'-])${escaped}(?![\\p{L}\\p{N}'-])`, "iu"),
    );
    return at > 0 && /\p{L}/u.test(text.slice(0, at));
  });
}
