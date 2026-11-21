// Build recipes: a pair dictionary merged from human-made sources in order, where the
// first source that has a term supplies all of it (one source tag per term). See
// docs/specs/architecture.md "Native meanings and the quality gate".
import {
  capitalKey,
  describes,
  editionLine,
  firstSentence,
  keyOf,
  shortOfDefinition,
  shortOfPairSenses,
} from "../../../src/core/lexicon/short-lines.ts";
import type { LemmaPack, PairEntry } from "../../../src/core/packs/types.ts";
import {
  eachEntry,
  GIVEN_NAME,
  posLabel,
  SURNAME,
  type KaikkiEntry,
  type KaikkiSense,
  type KaikkiTranslation,
} from "../common.ts";
import {
  isNonConstituent,
  isUsable,
  patternKey,
  type PhraseBuildLanguage,
} from "../phrases.ts";

const MAX_SENSES = 4;
/** Translated words kept per translation-table sense. */
const MAX_WORDS = 3;

/**
 * Part of speech, text, and for translation-table and wordnet senses the English sense
 * (`hint`). A pointer sense, an edition's form of another word ("Pasado simple del
 * verbo (to) tell" on told), has no hint (null) and names its `target`, the term it
 * points to.
 */
export type PairSense = [
  pos: string,
  text: string,
  hint?: string | null,
  target?: string,
];

/** A pointer sense: one that names the term it is a form of. */
const isPointerSense = (sense: PairSense) => sense[3] !== undefined;
export interface SourceTerm {
  short: string;
  senses: PairSense[];
}
export type TermKey = ((headword: string) => string | undefined) & {
  /**
   * Whether a key is a capital-only word's (rule E, en/capitals.json: "tokyo"): a term
   * only as its capitalised headword (`capitalTermOf`: Tokyo), never in lower case.
   */
  readonly capitalOnly?: (key: string) => boolean;
};

/**
 * The key a headword is filed under, or undefined when it is not one Langle looks up: a
 * single word must be a vocabulary word written in lowercase (names and inflected forms
 * are left out); several words must form one of the phrase patterns. A typographic
 * apostrophe is the vocabulary's straight one (Wiktionnaire's "I’m", "don’t").
 */
export function termKeyOf({
  vocab,
  lemmas,
  phrases,
  build,
  capitals = [],
}: {
  vocab: ReadonlySet<string>;
  lemmas: LemmaPack;
  phrases: ReadonlySet<string>;
  /** The learning language's phrase settings (`patternKey`); English's by default. */
  build?: PhraseBuildLanguage;
  /** The capital-only words, as written (en/capitals.json). */
  capitals?: readonly string[];
}): TermKey {
  const capitalKeys = new Set(
    capitals
      .map((written) => written.toLowerCase())
      .filter((key) => !vocab.has(key)),
  );
  // A phrase's words may be capital-only words: a name's (New Zealand).
  const isWord = (word: string) =>
    vocab.has(word) || Object.hasOwn(lemmas, word) || capitalKeys.has(word);
  const termKey = (headword: string) => {
    // Some editions title English words with a typographic apostrophe (fr "I’m").
    const word = headword.trim().replaceAll("’", "'");
    if (!/\s/.test(word)) return vocab.has(word) ? word : undefined;
    const key = patternKey(word, isWord, build);
    return key && phrases.has(key) ? key : undefined;
  };
  return Object.assign(termKey, {
    capitalOnly: (key: string) => capitalKeys.has(key),
  });
}

/**
 * The key a capitalised single-word headword is kept apart under, when its lowercase
 * form is a term (a vocabulary word): `capitalKey`, in capitals for an acronym (two
 * letters or more, none lower case: "TV", "WHO") and with a capital first letter
 * otherwise ("Japan", "I'm"). Undefined for any other headword. Proper-noun entries
 * count whatever their case.
 */
export function capitalTermOf(
  headword: string,
  termKey: TermKey,
  { proper = false }: { proper?: boolean } = {},
): string | undefined {
  const word = headword.trim().replaceAll("’", "'");
  if (/\s/.test(word) || !(proper || /^\p{Lu}/u.test(word))) return undefined;
  const lower = word.toLowerCase();
  if (termKey(lower) !== lower && termKey.capitalOnly?.(lower) !== true)
    return undefined;
  const acronym = /\p{Lu}.*\p{Lu}/u.test(word) && !/\p{Ll}/u.test(word);
  return capitalKey(lower, acronym);
}

export function addSense(
  item: SourceTerm,
  sense: PairSense,
  max: number = MAX_SENSES,
) {
  if (item.senses.length >= max) return;
  if (item.senses.some(([, text]) => text === sense[1])) return;
  item.senses.push(sense);
}

function termOf(terms: Map<string, SourceTerm>, key: string) {
  let item = terms.get(key);
  if (!item) terms.set(key, (item = { short: "", senses: [] }));
  return item;
}

/** Drops terms that ended up without senses and sets each one's short meaning. */
export function finish(
  terms: Map<string, SourceTerm>,
  shortOfFirst: (text: string) => string,
) {
  for (const [key, item] of terms) {
    if (item.senses.length === 0) terms.delete(key);
    else item.short = shortOfFirst(item.senses[0]![1]);
  }
  return terms;
}

/**
 * A merged term as a pair pack stores it (`PairEntry`, format 4): its senses, its
 * source, `extra` (what a capitalised headword means, a learning pair's capitalised
 * senses), and its short meaning only where it is not the one the dictionary makes
 * from its senses (`shortOfPairSenses`): a Wikidata description is whole, the table's
 * first word would cut it ("ciudad y sede del condado de Summit, estado de Ohio,
 * Estados Unidos").
 */
export function packedEntry<Extra>(
  short: string,
  senses: PairSense[],
  source: number,
  extra?: Extra,
): PairEntry<Extra> {
  if (short !== shortOfPairSenses(senses))
    return [senses, source, extra ?? null, short];
  return extra === undefined ? [senses, source] : [senses, source, extra];
}

const posOf = (pos: unknown) => (typeof pos === "string" ? posLabel(pos) : "");

/** A stress mark: a combining acute or grave accent. */
const STRESS_MARK = /[\u0300\u0301]/u;

/** Cyrillic vowels, whose acute or grave accent marks stress (primary or secondary). */
const CYRILLIC_VOWEL = /[аеиоуыэюяіїєѣ]/iu;

/**
 * Native text as its readers write it: without the stress marks Wiktionary puts over
 * Cyrillic vowels for learners ("деньги" with an acute over its е, "идолопоклоннический"
 * with a grave over its и). A consonant's accent that makes a letter of its own
 * (Macedonian ѓ, ќ) stays.
 */
export function withoutStressMarks(text: string): string {
  const parts = text.normalize("NFD");
  if (!STRESS_MARK.test(parts)) return text;
  return parts
    .replace(
      /(\p{Script=Cyrillic})([\u0300\u0301])/gu,
      (marked, letter: string) =>
        !CYRILLIC_VOWEL.test(letter) && marked.normalize("NFC").length === 1
          ? marked
          : letter,
    )
    .normalize("NFC");
}

/**
 * A heading ("==葡萄牙语==", "====翻译===="), a list item ("* 汉语：…") or a new paragraph
 * (a blank line: ru "…\n\nЭто болванка статьи…", "this is a stub article") of a wiki page.
 */
const PAGE_MARKUP = /={2,}|\n\s*[*#]|\n\s*\n/;

/**
 * A link to a template the extraction left unexpanded (":แม่แบบ:สกรรม", ":Template:可數"):
 * a colon, the namespace, a colon and the template's name, at the start of the gloss or
 * after a space or an opening bracket.
 */
const TEMPLATE_LINK = /(^|[\s(（]):[^\s:()（）]+:([^\s()（）]+)/gu;

/**
 * A gloss without the page structure the extraction let into it: cut where a heading,
 * a list item or another paragraph starts ("消色差透镜\n* 正体: …" → "消色差透镜"); an
 * unexpanded template link is its name in brackets, a label the line leaves out
 * (":แม่แบบ:สกรรม สละ, ละทิ้ง" → "(สกรรม) สละ, ละทิ้ง"; "ตาย :แม่แบบ:rfquote-sense" →
 * "ตาย (rfquote-sense)").
 */
export function withoutPageMarkup(gloss: string) {
  const at = gloss.search(PAGE_MARKUP);
  return (at < 0 ? gloss : gloss.slice(0, at))
    .replace(TEMPLATE_LINK, (_, before: string, name: string) =>
      /[(（]/u.test(before) ? `${before}${name}` : `${before}(${name})`,
    )
    .trim();
}

/** A pointer template needs this many distinct targets to count as the edition's syntax. */
const MIN_TEMPLATE_TARGETS = 3;

/** Where a template has its target. */
const SLOT = "{x}";

/** An English word as a gloss writes it (the learning language is English). */
const ENGLISH_WORD = /[A-Za-z][A-Za-z'-]*/g;

/** Notes in brackets, which say nothing of a pointer's syntax ("(he, she, it)"). */
const NOTES = /\([^()]*\)|（[^（）]*）|\[[^[\]]*\]/g;

/**
 * A gloss as pointer templates: `target` replaced by a slot where the gloss writes it
 * (one template per place: pt "passado simples do verbo do" writes "do" twice), also
 * quoted or after English's infinitive marker ("(to) tell", "to have"); notes in
 * brackets dropped; lower case, without closing punctuation ("Pasado simple del verbo
 * (to) tell." → "pasado simple del verbo {x}"). None when the gloss does not write the
 * target, or writes nothing else.
 */
export function pointerTemplates(gloss: string, target: string): string[] {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const written = new RegExp(
    `(?<![\\w-])["“«]?(?:\\(to\\)\\s*|to\\s+)?["“«]?${escaped}["”»]?(?![\\w-])`,
    "gi",
  );
  return [...gloss.matchAll(written)].flatMap((found) => {
    const template = asTemplate(
      gloss.slice(0, found.index) +
        SLOT +
        gloss.slice(found.index + found[0].length),
    );
    return /\p{L}/u.test(template.replace(SLOT, "")) && template.includes(SLOT)
      ? [template]
      : [];
  });
}

/** Text with a slot as a template: without notes in brackets and closing punctuation, in lower case. */
const asTemplate = (text: string) =>
  text
    .replace(NOTES, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.:;。：；]+$/, "")
    .trim()
    .toLowerCase();

/**
 * An English word a gloss writes whole: not English letters inside a native word
 * ("Ruanda", "bastón").
 */
const WHOLE_ENGLISH_WORD =
  /(?<![\p{L}\p{M}'’-])[A-Za-z][A-Za-z'-]*(?![\p{L}\p{M}'’-])/gu;

/**
 * LEARNING: the language a reader files terms of, as glosses in other languages write
 * its words: its kaikki code; a word (`word`, for the terms a gloss names; English's is
 * not whole, as before L3), a whole word (`whole`), a gloss's last word (`last`), one
 * word alone (`bare`), and a phrase in lower case (`phrase`, a form-of target kaikki
 * names that is no term: "absolute zero").
 */
export interface LearningText {
  code: string;
  word: RegExp;
  whole: RegExp;
  last: RegExp;
  bare: RegExp;
  phrase: RegExp;
}

/** English, the learning language of the English → native recipes. */
const ENGLISH_TEXT: LearningText = {
  code: "en",
  word: ENGLISH_WORD,
  whole: WHOLE_ENGLISH_WORD,
  last: /[A-Za-z][A-Za-z'’-]*$/,
  bare: /^[A-Za-z][A-Za-z'-]*$/,
  phrase: /^[a-z][a-z' -]*$/,
};

/**
 * A learning language written in Latin letters other than English (`upper`, `lower`:
 * its letters as regular-expression ranges), whose words a gloss writes whole.
 */
export function learningText(
  code: string,
  upper: string,
  lower: string,
): LearningText {
  const letter = `${upper}${lower}`;
  const whole = new RegExp(
    `(?<![\\p{L}\\p{M}'’-])[${letter}][${letter}'-]*(?![\\p{L}\\p{M}'’-])`,
    "gu",
  );
  return {
    code,
    word: whole,
    whole,
    last: new RegExp(`(?<![\\p{L}\\p{M}])[${letter}][${letter}'’-]*$`, "u"),
    bare: new RegExp(`^[${letter}][${letter}'-]*$`, "u"),
    phrase: new RegExp(`^[${lower}][${lower}' -]*$`, "u"),
  };
}

/** A template's words besides its slot, in lower case. */
const frameWords = (template: string) =>
  (template.replace(SLOT, " ").match(/[\p{L}\p{M}'’-]+/gu) ?? []).map((word) =>
    word.toLowerCase(),
  );

/**
 * A template its slot ends, a word of its own: "pasado simple de {x}", "→ voir {x}";
 * not "{x}ón" (English letters inside a native word) or "{x} metal".
 */
const endsWithSlot = (template: string) =>
  template.endsWith(SLOT) &&
  !/[\p{L}\p{M}]$/u.test(template.slice(0, -SLOT.length));

/**
 * Whether a template is written in an edition's own words: each of its words is a word
 * of the edition's language (`native`) or no English term (`term`), and one is the
 * edition's and no English term ("grafía alternativa de {x}", "вариант {x}", "→ voir
 * {x}"; not "american {x} association", an English name with a slot).
 */
export function nativeFrame(
  template: string,
  native: (word: string) => boolean,
  term: (word: string) => boolean,
) {
  const words = frameWords(template);
  return (
    words.length > 0 &&
    words.every((word) => native(word) || !term(word)) &&
    words.some((word) => native(word) && !term(word))
  );
}

/**
 * Whether a template is said in an edition's pointer syntax: its slot ends it, two
 * words or more of it are words of the edition's learned templates (`vocabulary`), and
 * at most one other, a word of the edition's own (`native`) that qualifies them. es
 * "pasado simple de {x}" (wore: a template with one target, in the words of "pasado
 * simple del verbo {x}" and "participio pasado de {x}"); fr "prétérit du verbe
 * auxiliaire {x}" (might), pt "pretérito perfeito do verbo {x}", it "variante
 * statunitense di {x}" (labor). Not "pronome riflessivo di {x}" (two other words) or
 * "persona de {x}".
 */
export function grammarFrame(
  template: string,
  vocabulary: ReadonlySet<string>,
  native: (word: string) => boolean = () => false,
) {
  // One clause: no sentence end or list in it ("prismatique. variante de {x}").
  if (!endsWithSlot(template) || /[.,;:!?。，；：]/u.test(template))
    return false;
  const words = frameWords(template);
  const other = words.filter((word) => !vocabulary.has(word));
  return (
    words.length - other.length >= 2 &&
    (other.length === 0 || (other.length === 1 && native(other[0]!)))
  );
}

/**
 * A gloss without the reference that closes it after an arrow ("doge → voir duke" →
 * "doge"; "Rouge cardinal. → voir cardinal red" → "Rouge cardinal"): a reference is the
 * edition's pointer syntax (`isFrame`, a template) with English words in its slot, and
 * says nothing the learner reads. The gloss as it is when it closes otherwise ("United
 * States → Stany Zjednoczone") or has nothing before the arrow.
 */
export function beforeReference(
  gloss: string,
  isFrame: (template: string) => boolean,
  bare: RegExp = ENGLISH_TEXT.bare,
): string {
  const arrow = gloss.lastIndexOf("→");
  if (arrow <= 0) return gloss;
  const before = gloss
    .slice(0, arrow)
    .replace(/[\s.;:,]+$/u, "")
    .trim();
  if (!/\p{L}/u.test(before)) return gloss;
  const words = gloss
    .slice(arrow)
    .replace(/[\s.;:。]+$/u, "")
    .split(/\s+/);
  for (let at = words.length - 1; at > 0; at--) {
    if (!bare.test(words[at]!)) break;
    if (isFrame(asTemplate([...words.slice(0, at), SLOT].join(" "))))
      return before;
  }
  return gloss;
}

/**
 * NATIVE: a gloss whose first sentence is about the English word (it writes English:
 * "Superlatif de soon", "Variante de prismatic", pl "I don't know") and whose next
 * sentence translates it ("Le plus tôt.", "Prismatique.", "Nie wiem") with the
 * translation first ("Le plus tôt. Superlatif de soon."), as the hover's line is a
 * gloss's first sentence (`editionLine`). The next sentence translates when it writes
 * no English and its line does not describe (`describes`), as for the translations a
 * description and a ";" are followed by (es we're: "Nosotros somos o nosotros
 * estamos" describes, and stays second). `english`: whether a text writes English.
 * `marked`: the edition marks the sense as a form, so its first sentence is about the
 * English word whatever its last word (fr I’m: "Variante de I am. Je suis.", where
 * "am" is also a word of the edition).
 */
export function meaningFirst(
  gloss: string,
  english: (text: string) => boolean,
  marked = false,
  lastWord: RegExp = ENGLISH_TEXT.last,
): string {
  const text = gloss.trim();
  const first = firstSentence(text);
  if (first === text) return gloss;
  const rest = text
    .slice(first.length)
    .replace(/^[\s.]+/u, "")
    .replace(/^→\s*/u, "")
    .trim();
  // A sentence about the English word names it last ("… de soon"; "I don't know"),
  // not in passing ("… équivalent à 8 fluid ounces, … ml").
  const last = lastWord.exec(
    first.replace(NOTES, " ").replace(/[\s.,;:!?"“”«»]+$/u, ""),
  )?.[0];
  if (rest === "" || !last || !(marked || english(last)) || english(rest))
    return gloss;
  const line = editionLine(rest);
  if (line === "" || describes(line)) return gloss;
  return `${/[.!?。]$/u.test(rest) ? rest : `${rest}.`} ${first}.`;
}

/**
 * Usage labels that open a gloss, in brackets ("истор. Британия" → "(истор.)
 * Британия"; "(the Plough) астрон. Большая Медведица" → "(the Plough) (астрон.) …"), so
 * the line leaves them out as it does labels in brackets (`editionLine`), and does not
 * end at them as at a sentence. `isLabel`: the edition's label abbreviations
 * (`labelAbbreviations`).
 */
export function withLabelsInBrackets(
  gloss: string,
  isLabel: (token: string) => boolean,
  isAbbreviation: (token: string) => boolean = () => false,
): string {
  const opening = /^\s*(?:[(（][^()（）]*[)）]\s*)?/u.exec(gloss)![0];
  let rest = gloss.slice(opening.length);
  // An abbreviation the edition put in brackets ("(мн.) ч. слова песни") takes the ones
  // after it too.
  const bracketed = /\((?:\p{Ll}[\p{L}\p{M}-]*\.[,\s]*)+\)\s*$/u.test(opening);
  /** The labels, each its tokens with what follows each ("амер., канадск., разг."). */
  const labels: string[] = [];
  const next = (text: string) =>
    /^(\p{Ll}[\p{L}\p{M}-]*\.)(,?)\s+(?=\S)/u.exec(text);
  /**
   * A token that goes on the label before it: after a comma, a label; else one letter
   * with a period or an abbreviation the edition writes ("мн. ч.", plural).
   */
  const goesOn = (token: string, comma: boolean) =>
    comma
      ? isLabel(token) || isAbbreviation(token)
      : [...token].length === 2 || isAbbreviation(token);
  let comma = false;
  for (;;) {
    const found = next(rest);
    if (!found) break;
    const [whole, token, after] = found as unknown as [string, string, string];
    const on = (labels.length > 0 || bracketed) && goesOn(token, comma);
    if (!isLabel(token) && !on) break;
    // A comma after it binds it to a label that follows: else it is no label's.
    const following = after === "," ? next(rest.slice(whole.length)) : null;
    if (after === "," && !(following && goesOn(following[1]!, true))) break;
    const text = `${token}${after}`;
    if (on && labels.length > 0) labels[labels.length - 1] += ` ${text}`;
    else if (on) {
      // Into the bracket the edition wrote: "(мн. ч.)".
      const at = opening.lastIndexOf(")");
      return withLabelsInBrackets(
        `${opening.slice(0, at)} ${text}${opening.slice(at)}${rest.slice(whole.length)}`,
        isLabel,
        isAbbreviation,
      );
    } else labels.push(text);
    comma = after === ",";
    rest = rest.slice(whole.length);
  }
  return labels.length === 0
    ? gloss
    : `${opening}${labels.map((label) => `(${label})`).join(" ")} ${rest}`;
}

/**
 * A gloss with a no-break space after each of the edition's abbreviations that a
 * space follows ("unnötiger Gegenstand bzw.\u00a0Ergänzung", pl "np.\u00a0Mięsień"), so
 * the line does not end at one as at a sentence (`firstSentence` ends sentences at
 * ordinary spaces only). `isAbbreviation`: the edition's abbreviations
 * (`abbreviations` in `readEdition`).
 */
export const withAbbreviations = (
  gloss: string,
  isAbbreviation: (token: string) => boolean,
): string =>
  gloss.replace(ABBREVIATION, (whole, token: string) =>
    isAbbreviation(token) ? `${token}\u00a0` : whole,
  );

/** A lower-case word with a period, a space after it: "bzw. ", "np. ". */
const ABBREVIATION =
  /(?<![\p{L}\p{M}'’-])(\p{Ll}[\p{L}\p{M}-]*\.)[ \t]+(?=\S)/gu;

/**
 * A gloss's identity as a placeholder: without notes in brackets and closing marks, in
 * lower case ("Définition manquante ou à compléter. (Ajouter)" and "…(Ajouter)." alike).
 */
export const placeholderKey = (gloss: string) =>
  gloss
    .replace(NOTES, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.:;,!?…]+$/u, "")
    .trim()
    .toLowerCase();

/** A label abbreviation opening a gloss, after a note in brackets: "истор.", "разг.". */
const OPENING_ABBREVIATION =
  /^\s*(?:[(（][^()（）]*[)）]\s*)?(\p{Ll}[\p{L}\p{M}-]*\.)\s+(\S+)/u;

/** A label opens the glosses of this many headwords. */
const LABEL_HEADWORDS = 10;

/** Whether a gloss writes `word` whole and in lower case. */
const writtenLower = (gloss: string, word: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{M}'’-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}'’-])`,
    "u",
  ).test(gloss);

/** A gloss up to its first comma or semicolon outside brackets. */
function firstItem(gloss: string): string {
  let depth = 0;
  for (let i = 0; i < gloss.length; i++) {
    const ch = gloss[i]!;
    if ("(（[".includes(ch)) depth++;
    else if (")）]".includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && ",;，；".includes(ch))
      return gloss.slice(0, i).trim();
  }
  return gloss;
}

/** A sense the source marks as a form or a variant of another word (kaikki's tags or fields). */
const isMarkedForm = (sense: KaikkiSense) =>
  Array.isArray(sense.form_of) ||
  Array.isArray(sense.alt_of) ||
  (sense.tags ?? []).some((tag) => tag === "form-of" || tag === "alt-of");

/** Senses no source meaning comes from: obsolete, archaic, misspelt. */
const UNUSED_TAGS = ["obsolete", "archaic", "misspelling"];

/**
 * English Wiktionary's labels of a sense outside standard current use (kaikki's tags):
 * a translation table's sense with one comes after the unmarked ones.
 */
const MARKED_TAGS = [
  "dated",
  "rare",
  "vulgar",
  "slang",
  "offensive",
  "derogatory",
  "dialectal",
  "nonstandard",
  "euphemistic",
];

/** A translation table's own label that opens with such a label ("slang: have sex with"). */
const MARKED_LABEL = new RegExp(
  `^\\(?(?:${[...MARKED_TAGS, ...UNUSED_TAGS].join("|")})\\b`,
  "i",
);

/** The English terms a gloss writes, other than the entry's own headword, in order. */
const termsWritten = (
  gloss: string,
  head: string,
  isTerm: (word: string) => boolean,
  word: RegExp = ENGLISH_WORD,
) =>
  (gloss.match(word) ?? [])
    .map((word) => word.toLowerCase())
    .filter((word) => word !== head && isTerm(word));

/**
 * The term a marked form names: the word kaikki records (form_of, alt_of; "to have" →
 * have) when the gloss writes it. When kaikki records only English words that are no
 * term (a phrase: "absolute zero"), none; when it records none, or only words of
 * another language (pt "passado simples e particípio do verbo tell", whose form_of is
 * "particípio"), the last term the gloss writes.
 */
function markedTarget(
  sense: KaikkiSense,
  gloss: string,
  written: readonly string[],
  phrase: RegExp = ENGLISH_TEXT.phrase,
): string | undefined {
  const named = [sense.form_of, sense.alt_of].flatMap((list: unknown) =>
    Array.isArray(list)
      ? list.flatMap((item: { word?: unknown } | undefined) =>
          typeof item?.word === "string"
            ? [
                item.word
                  .trim()
                  .toLowerCase()
                  .replace(/^to\s+/, ""),
              ]
            : [],
        )
      : [],
  );
  const found = named.find(
    (word) =>
      written.includes(word) && pointerTemplates(gloss, word).length > 0,
  );
  if (found) return found;
  return named.some((word) => phrase.test(word)) ? undefined : written.at(-1);
}

/**
 * A letter of a native language's own script (`NativeLanguage.scripts`), for one not
 * written in Latin letters, the learning language's (English); undefined for one that
 * is, where English words cannot be told from native ones.
 */
export const nativeLetterOf = (scripts: readonly string[]) =>
  scripts.includes("Latin")
    ? undefined
    : new RegExp(
        scripts.map((script) => `\\p{Script=${script}}`).join("|"),
        "u",
      );

/**
 * A source's terms with only their meanings in the native script (`letter`, from
 * `nativeLetterOf`): an edition's gloss or a translation table's word with no letter
 * of the script is no meaning (en-zh be: "or implied", a parse artifact, beside 是; ru
 * would: "We sat on the bench, опоздает ли автобус" keeps its Russian part; en-th
 * isn't: "Something or someone that is defined by the lack…", an English definition;
 * ru gone: "gun"). A word that is the headword itself stays (zh "DNA", a loanword
 * written alike), and so do pointers; text with no letters at all stays only in a term
 * with no word in the script (zh period: "。" goes beside 句号; th LOL keeps ถถถ, not
 * "๕๕๕"). A term left with nothing is no term of the source; a contraction then shows what it
 * is short for (ru, zh "that's": "that is", `expansionLine`). Gives how many glosses
 * and words were left out.
 */
function keepNativeScript(
  terms: Map<string, SourceTerm>,
  letter: RegExp | undefined,
): number {
  if (letter === undefined) return 0;
  let left = 0;
  for (const [key, item] of terms) {
    const lettered = item.senses.some(
      (sense) => !isPointerSense(sense) && letter.test(sense[1]),
    );
    const native = (text: string) =>
      letter.test(text) ||
      (!lettered && !/\p{L}/u.test(text)) ||
      keyOf(text) === key.toLowerCase();
    item.senses = item.senses.flatMap((sense): PairSense[] => {
      if (isPointerSense(sense)) return [sense];
      if (!native(sense[1])) {
        left++;
        return [];
      }
      if (sense[2] == null) return [sense];
      const words = sense[1].split(", ");
      const kept = words.filter(native);
      left += words.length - kept.length;
      return [[sense[0], kept.join(", "), sense[2]]];
    });
  }
  return left;
}

/**
 * A word opening a gloss (after a label in brackets that opens it) or what a colon
 * introduces, capitalised: "Ser", "(con ciertos sustantivos) Denota…", "Dicho de:
 * Profundo".
 */
const OPENING_WORD =
  /(^\s*(?:[(（[][^()（）[\]]*[)）\]]\s*)?|:\s+)(\p{Lu}[\p{L}\p{M}'’-]*)/gu;

/**
 * NATIVE: an edition's gloss in the case the edition writes its own words in
 * (Wikcionario and Wiktionnaire capitalise every gloss: "Ser", "Y", "Adquirir"). The
 * word that opens it, or that a colon introduces, goes to lower case when the edition
 * has it in lower case as a common word (es ser, y), and, in an edition that
 * capitalises its common nouns (`capitalNouns`, German), not also as written ("Sein", a
 * noun, and "Haus" stay; elsewhere a capitalised entry is a letter, a symbol or an
 * abbreviation: es "A", fr "Ce"). Not an acronym ("EE. UU.") or the first word of a
 * name of several ("Reino Unido", "Gran Bretagna"). For a capitalised headword
 * (`capital`), also not a word the edition has as written as a proper noun (es
 * "Holanda", the country; "holanda" is a cloth) or that is the headword itself
 * ("China" of China).
 */
export function inNativeCase(
  gloss: string,
  entries: NativeEntries,
  {
    head,
    capital = false,
    capitalNouns = false,
  }: { head: string; capital?: boolean; capitalNouns?: boolean },
): string {
  return gloss.replace(
    OPENING_WORD,
    (found, before: string, word: string, at: number) => {
      const next = gloss.slice(at + found.length);
      if (/^\p{Lu}{2}/u.test(word) || /^\s+\p{Lu}/u.test(next)) return found;
      const lower = word.charAt(0).toLowerCase() + word.slice(1);
      const asWritten = entries(word);
      const keep =
        !entries(lower).common ||
        (capitalNouns && asWritten.common) ||
        (capital && (asWritten.name || bare(word) === bare(head)));
      return keep ? found : before + lower;
    },
  );
}

/** An edition's gloss as the recipes read it: without page markup and stress marks. */
const cleanGloss = (sense: KaikkiSense) => {
  const last: unknown = Array.isArray(sense.glosses)
    ? sense.glosses.at(-1)
    : undefined;
  if (typeof last !== "string") return undefined;
  const written = last.trim();
  return { written, gloss: withoutStressMarks(withoutPageMarkup(written)) };
};

/**
 * A native-language Wiktionary edition (kaikki's extract of it): its entries for English
 * words, whose glosses are in the native language. Each term
 * gets up to MAX_SENSES distinct usable senses, in file order; single-word proper-noun
 * entries and non-constituents are left out. Read over English Wiktionary itself, it
 * gives the English definitions (en-defs). `trimPeriod` drops the period that ends a
 * gloss made of one sentence (Wikcionario's "Luz." → "Luz", "微笑。" → "微笑"). Glosses
 * lose the page markup the extraction let in (`withoutPageMarkup`) and their stress
 * marks (`withoutStressMarks`); one that was only the headword and such markup is left
 * out.
 *
 * Pointer senses: the edition's own syntax for "form of X" is learned from the senses
 * it marks as forms or variants (`isMarkedForm`): each one's gloss with its target
 * replaced (`pointerTemplates`) is a template, kept when it has at least
 * MIN_TEMPLATE_TARGETS distinct targets, not all of them words of the edition's own
 * language (`native`, its kaikki code; some are: es "be" is the letter B and "lie" a
 * form of liar): es "pasado simple del verbo {x}", pt "passado simples do verbo {x}", ru
 * "форма третьего лица единственного числа глагола {x}", zh "{x} 的簡單過去時和過去時分詞";
 * not pl "po than lub as: {x}", where Wikisłownik's form_of links the Polish word of
 * "me", "him", "us" (ja, on, my). A sense whose gloss is a template with one of the
 * English terms it writes in the slot is a pointer to that term, marked or not (es
 * writes "Pasado simple del verbo (to) see" without marking it); a marked sense that
 * is no template is left out, as before (pl "he is → on jest" names "jest").
 */
export async function readEdition(
  path: string,
  termKey: TermKey,
  {
    trimPeriod = false,
    native,
    nativeForm = (word) => word,
    letter,
    learning = ENGLISH_TEXT,
    sensePos = (_sense, pos) => pos,
    capitalWords = false,
    leftOut = new Set(),
  }: {
    /**
     * Pages whose entries are not read (`undocumentedPages`: an undocumented bot
     * import's).
     */
    leftOut?: ReadonlySet<string>;
    /**
     * A capitalised headword is a word, not a name (L3: German nouns): its glosses are
     * read as a lower-case term's (placeholders, case, MAX_SENSES), though still kept
     * apart in `capital`.
     */
    capitalWords?: boolean;
    trimPeriod?: boolean;
    /**
     * A sense's part of speech, from its entry's (L3: a German verb's sense tagged
     * pronominal is its reflexive one).
     */
    sensePos?: (sense: KaikkiSense, pos: string) => string;
    native?: string;
    /** The language of the terms read (L3: French, German); English by default. */
    learning?: LearningText;
    /**
     * The edition's own headwords as the pack writes its text (simplified Chinese:
     * the zh edition files 倫敦 and 倫敦's simplified form alike), for `nativeKind`.
     */
    nativeForm?: (word: string) => string;
    /** A letter of the native script (`nativeLetterOf`): a gloss with none is no meaning. */
    letter?: RegExp;
  } = {},
) {
  const isTerm = (word: string) => termKey(word) === word;
  /** template → its distinct targets */
  const learned = new Map<string, Set<string>>();
  /** The edition's own language's headwords, in lower case. */
  const nativeWords = new Set<string>();
  /** Its common words it writes in lower case (not fr "May", a place, for "may"). */
  const nativeLower = new Set<string>();
  /** The edition's own language's headwords as written: proper nouns, and the rest. */
  const nativeNames = new Set<string>();
  const nativeCommon = new Set<string>();
  /** The forms its common words' entries list, in lower case. */
  const nativeForms = new Set<string>();
  /** How the edition's glosses of English words open: with a capital or not. */
  const glossOpenings = { upper: 0, lower: 0 };
  let nouns = 0;
  let capitalisedNouns = 0;
  interface Read {
    key: string;
    head: string;
    pos: string;
    senses: KaikkiSense[];
  }
  const read: Read[] = [];
  const capitalRead: Read[] = [];
  /** Every English sense's gloss, for what is learned once the native words are known. */
  const glosses: { head: string; gloss: string; marked: boolean }[] = [];
  const stats = await eachEntry(path, (entry) => {
    if (native !== undefined && entry.lang_code === native) {
      const written = entry.word.trim();
      nativeWords.add(written.toLowerCase());
      if (entry.pos !== "name" && written === written.toLowerCase())
        nativeLower.add(written);
      (entry.pos === "name" ? nativeNames : nativeCommon).add(
        nativeForm(written),
      );
      if (entry.pos === "noun") {
        nouns++;
        if (/^\p{Lu}/u.test(written)) capitalisedNouns++;
      }
      // The forms a common word's entry lists, as the edition writes them in lower
      // case (es instantánea of instantáneo), for the gloss case (`inNativeCase`).
      if (entry.pos !== "name")
        for (const { form } of entry.forms ?? [])
          if (
            typeof form === "string" &&
            /^\p{Ll}[\p{L}\p{M}'’-]*$/u.test(form)
          )
            nativeForms.add(form);
    }
    if (entry.lang_code !== learning.code || leftOut.has(entry.word.trim()))
      return;
    const head = entry.word.trim().toLowerCase();
    for (const sense of entry.senses ?? []) {
      const clean = cleanGloss(sense);
      const opening = /\p{L}/u.exec(clean?.gloss ?? "")?.[0];
      if (opening !== undefined)
        glossOpenings[/\p{Lu}/u.test(opening) ? "upper" : "lower"]++;
      if (clean?.gloss)
        glosses.push({ head, gloss: clean.gloss, marked: isMarkedForm(sense) });
      const found = isMarkedForm(sense) ? clean : undefined;
      if (!found) continue;
      const target = markedTarget(
        sense,
        found.gloss,
        termsWritten(found.gloss, head, isTerm, learning.word),
        learning.phrase,
      );
      if (!target) continue;
      for (const template of pointerTemplates(found.gloss, target)) {
        let targets = learned.get(template);
        if (!targets) learned.set(template, (targets = new Set()));
        targets.add(target);
      }
    }
    if (isNonConstituent(entry)) return;
    // A capitalised headword or a proper noun ("Japan", "January", "Light") is kept
    // apart under its `capitalKey`; a phrase pattern may be a name ("Midas touch").
    const capital = capitalTermOf(entry.word, termKey, {
      proper: entry.pos === "name",
    });
    const key = capital ?? termKey(entry.word);
    if (
      !key ||
      (capital === undefined && entry.pos === "name" && !/\s/.test(head))
    )
      return;
    (capital !== undefined ? capitalRead : read).push({
      key,
      head,
      pos: posOf(entry.pos),
      senses: entry.senses ?? [],
    });
  });
  // A target is no word of the edition when the edition has no common word written so;
  // a template's own words are the edition's when it has them in any case (de
  // "Hilfsverbs", a noun; fr "may" as a target is English, though "May" is a place).
  const isNative = (word: string) => nativeLower.has(word);
  const isNativeWord = (word: string) => nativeWords.has(word.toLowerCase());
  /** English terms a text writes whole that are no words of the edition's language. */
  const englishOf = (text: string) =>
    (text.replace(NOTES, " ").match(learning.whole) ?? [])
      .map((word) => word.toLowerCase())
      .filter((word) => isTerm(word) && !isNative(word));
  // What the unmarked glosses show, once the edition's own words are known: the pointer
  // syntax they write without marking it, the placeholders they repeat, the labels
  // they open with.
  /** template → its distinct targets, from unmarked senses */
  const unmarked = new Map<string, Set<string>>();
  /** placeholder key → the headwords whose glosses it is */
  const repeated = new Map<string, Set<string>>();
  /** label abbreviation → the headwords it opens a gloss of, and what follows it */
  const openers = new Map<
    string,
    { heads: Set<string>; uses: number; english: number }
  >();
  /** a lower-case word with a period that a space follows, anywhere → its headwords */
  const periods = new Map<string, Set<string>>();
  for (const { head, gloss, marked } of glosses) {
    const words = new Set(head.split(/\s+/));
    if (!marked)
      for (const target of new Set(englishOf(gloss))) {
        if (words.has(target) || !writtenLower(gloss, target)) continue;
        for (const template of pointerTemplates(gloss, target)) {
          if (!endsWithSlot(template)) continue;
          let targets = unmarked.get(template);
          if (!targets) unmarked.set(template, (targets = new Set()));
          targets.add(target);
        }
      }
    const key = placeholderKey(gloss);
    let heads = repeated.get(key);
    if (!heads) repeated.set(key, (heads = new Set()));
    heads.add(head);
    for (const [, token] of gloss.matchAll(ABBREVIATION)) {
      let heads = periods.get(token!);
      if (!heads) periods.set(token!, (heads = new Set()));
      heads.add(head);
    }
    const opener = OPENING_ABBREVIATION.exec(gloss);
    if (opener) {
      const [, token, next] = opener;
      let seen = openers.get(token!);
      if (!seen)
        openers.set(token!, (seen = { heads: new Set(), uses: 0, english: 0 }));
      seen.heads.add(head);
      seen.uses++;
      if (englishOf(next!).length > 0) seen.english++;
    }
  }
  // A marked template needs MIN_TEMPLATE_TARGETS targets, not all of them words of the
  // edition's language; an unmarked one, that many that are none.
  const accepted = (from: Map<string, Set<string>>, unmarkedOnes = false) =>
    [...from]
      .filter(([, targets]) => {
        const english = [...targets].filter((target) => !isNative(target));
        return unmarkedOnes
          ? english.length >= MIN_TEMPLATE_TARGETS
          : targets.size >= MIN_TEMPLATE_TARGETS && english.length > 0;
      })
      .map(([template]) => template);
  // Templates the edition writes without marking them as forms count when they are
  // said in its own words and end with their target ("grafía alternativa de {x}" of
  // armor, "вариант {x}" of been, "→ voir {x}", "prétérit du verbe auxiliaire {x}").
  const unmarkedTemplates = accepted(unmarked, true).filter((template) =>
    nativeFrame(template, isNativeWord, isTerm),
  );
  const markedTemplates = new Set(accepted(learned));
  const templates = new Set([...markedTemplates, ...unmarkedTemplates]);
  /** The words the edition's pointer syntax is said in. */
  const vocabulary = new Set([...templates].flatMap(frameWords));
  const isFrame = (template: string) =>
    templates.has(template) ||
    grammarFrame(
      template,
      vocabulary,
      (word) => isNativeWord(word) && !isTerm(word),
    );
  /**
   * A gloss written alike under CLASS_HEADWORDS headwords or more that describes
   * (`describes`: more words than a translation has, in its main item or as a whole:
   * it "Definizione mancante; se vuoi, aggiungila tu") and whose main item is no word
   * of the edition is a placeholder, not a meaning ("Définition manquante ou à compléter"):
   * one description does not define ten words. Synonyms share a translation ("pénis",
   * "aller aux toilettes").
   */
  const placeholders = new Set(
    [...repeated]
      .filter(([key, heads]) => {
        const main = key.split(/[,;]/)[0]!.trim();
        return (
          heads.size >= CLASS_HEADWORDS &&
          (describes(main) || describes(key)) &&
          !isNativeWord(main)
        );
      })
      .map(([key]) => key),
  );
  /**
   * The edition's label abbreviations: a lower-case word with a period that opens the
   * glosses of LABEL_HEADWORDS headwords or more, that is no word of the edition
   * without its period, that native text follows (not a reference word that names
   * English ones: pl "zob. Middle East"), and that opens no template but as a label of
   * another (ru "сокр. от {x}", "abbreviation of"; "разг. то же, что {x}" is "то же, что
   * {x}" labelled).
   */
  const labels = new Set(
    [...openers]
      .filter(
        ([token, { heads, uses, english }]) =>
          heads.size >= LABEL_HEADWORDS &&
          !isNativeWord(token.slice(0, -1)) &&
          english * 2 < uses &&
          ![...templates].some(
            (template) =>
              template.startsWith(`${token.toLowerCase()} `) &&
              !templates.has(template.slice(token.length + 1)),
          ),
      )
      .map(([token]) => token),
  );

  /**
   * The edition's abbreviations: a lower-case word with a period that a space follows in
   * the glosses of LABEL_HEADWORDS headwords or more, that is no word of the edition
   * without its period nor an English term (a sentence that ends with one: "… de have.
   * Usado …"): de "bzw.", "z.", pl "np.", "tzw.", ru "мн.", "т.", and the labels. A line
   * does not end at one (`withAbbreviations`), and one after a label is part of it
   * ("мн. ч.").
   */
  const abbreviations = new Set([
    ...labels,
    ...[...periods]
      .filter(([token, heads]) => {
        const word = token.slice(0, -1);
        return (
          heads.size >= LABEL_HEADWORDS && !isNativeWord(word) && !isTerm(word)
        );
      })
      .map(([token]) => token),
  ]);
  const isAbbreviation = (token: string) => abbreviations.has(token);
  /**
   * The term a gloss points to in one of the edition's templates (`isFrame`): the whole
   * gloss, else its first item, which the rest qualifies (pt might: "pretérito perfeito
   * do verbo may, indicando possibilidade").
   */
  const pointerOf = (
    gloss: string,
    head: string,
    sense: KaikkiSense,
    pos: string,
  ) => {
    const written = termsWritten(gloss, head, isTerm, learning.word);
    const marked = isMarkedForm(sense)
      ? markedTarget(sense, gloss, written, learning.phrase)
      : undefined;
    // A word of the edition's own language as the target ("plural", Spanish too; fr
    // "may", a rare noun) only where the whole gloss is the pointer.
    // A contraction's senses only in the marked templates, as before U1-7: how
    // contractions show is the runtime's (`contractions.ts`).
    const contraction = pos === "contraction";
    // Beyond the marked templates, a target the gloss writes in lower case: a
    // capitalised one is a name's (es Joe: "hipocorístico de Joseph").
    const pointing = (text: string, whole: boolean) =>
      [...(marked ? [marked] : []), ...written].find((word) =>
        pointerTemplates(text, word).some((template) =>
          whole && markedTemplates.has(template)
            ? true
            : !contraction &&
              writtenLower(text, word) &&
              (isNative(word) ? whole : true) &&
              isFrame(template),
        ),
      );
    const item = firstItem(gloss);
    return (
      pointing(gloss, true) ??
      (item !== gloss && !contraction ? pointing(item, false) : undefined)
    );
  };
  let pointers = 0;
  let cased = 0;
  let foreign = 0;
  let placeheld = 0;
  let reshaped = 0;
  // The edition writes most of its common nouns capitalised (German).
  const capitalNouns = capitalisedNouns > nouns / 2;
  // The edition opens most of its glosses with a capital, as a sentence (es, fr): only
  // its capitals are put in its own case. Where a gloss opens with a capital otherwise
  // (pl "Meksykanin", ru "Чин"), the capital says something.
  // In an edition that capitalises its nouns (German), a capital that opens a gloss
  // may be the noun's, so nothing is put in case there.
  const sentenceCase = glossOpenings.upper > glossOpenings.lower;
  const cases = native !== undefined && sentenceCase && !capitalNouns;
  // A common word, for the case: a headword or a form a headword's entry lists.
  const entriesOf: NativeEntries = (word) => ({
    name: nativeNames.has(nativeForm(word)),
    common: nativeCommon.has(nativeForm(word)) || nativeForms.has(word),
  });
  // Capitalised headwords' glosses keep the edition's case here: what each one means is
  // read from them as written (`capitalDictionary`), and `capitalCase` puts them in the
  // edition's case after that.
  const termsOf = (entries: readonly Read[], capitalised: boolean) => {
    const capital = capitalised && !capitalWords;
    const terms = new Map<string, SourceTerm>();
    for (const { key, head, pos, senses } of entries)
      for (const sense of senses) {
        if ((sense.tags ?? []).some((tag) => UNUSED_TAGS.includes(tag)))
          continue;
        const found = cleanGloss(sense);
        if (!found) continue;
        // LEARNING other than English (L3): a gloss that only introduces the senses
        // under it ("verbe de mouvement :") is none, and a label the extraction left
        // unbracketed before a sentence-case gloss ("transitif Ouvrir") is put in
        // brackets ("(transitif) Ouvrir"), as the line leaves labels out.
        if (learning !== ENGLISH_TEXT) {
          if (/:\s*$/u.test(found.gloss)) continue;
          if (cases) found.gloss = withOpeningLabel(found.gloss);
        }
        const { written } = found;
        // Page markup with only the headword before it ("adoring\n====翻译====…") is no
        // gloss; a gloss that is the headword itself is (a loanword: "pizza"). Nor is
        // one with no letter ("[[]]"), or a placeholder of a lowercase term (capitalised
        // headwords leave out repeated glosses as classes: `capitalDictionary`).
        if (
          !/\p{L}/u.test(found.gloss) ||
          (found.gloss !== written && found.gloss.toLowerCase() === head)
        )
          continue;
        // Nor is one that points to the headword itself, another spelling of it
        // (pt "you’re": "grafia alternativa de you're", filed under you're).
        if (pointerTemplates(found.gloss, key).some(isFrame)) continue;
        const shaped = withAbbreviations(
          beforeReference(
            withLabelsInBrackets(
              found.gloss,
              (token) => labels.has(token),
              isAbbreviation,
            ),
            isFrame,
            learning.bare,
          ),
          isAbbreviation,
        );
        if (
          !capital &&
          (placeholders.has(placeholderKey(found.gloss)) ||
            placeholders.has(placeholderKey(shaped)))
        ) {
          placeheld++;
          continue;
        }
        const gloss = meaningFirst(
          shaped,
          (text) => englishOf(text).length > 0,
          isMarkedForm(sense),
          learning.last,
        );
        if (gloss !== found.gloss) reshaped++;
        const trimmed =
          trimPeriod && /^[^.。]+[.。]$/.test(gloss)
            ? gloss.slice(0, -1)
            : gloss;
        const text =
          !cases || capital
            ? trimmed
            : inNativeCase(trimmed, entriesOf, { head, capitalNouns });
        if (text !== trimmed) cased++;
        // A gloss reshaped to translate first ("Je suis. Variante de I am.") is that
        // translation, not a pointer to the word it names.
        const target =
          gloss !== shaped ? undefined : pointerOf(gloss, head, sense, pos);
        // A capitalised headword keeps every sense here: its classes and persons are
        // left out, and its senses capped, once the sources are merged
        // (`capitalDictionary`).
        const max = capital ? Infinity : MAX_SENSES;
        if (target !== undefined) {
          pointers++;
          addSense(termOf(terms, key), [pos, text, null, target], max);
        } else if (isUsable(sense) || gloss !== shaped)
          // So is a marked form's: fr I’m → je suis (`meaningFirst`).
          addSense(termOf(terms, key), [sensePos(sense, pos), text], max);
      }
    foreign += keepNativeScript(terms, letter);
    return finish(terms, shortOfDefinition);
  };
  const terms = termsOf(read, false);
  const capital = termsOf(capitalRead, true);
  return {
    terms,
    capital,
    stats: {
      ...stats,
      pointers,
      templates: templates.size,
      unmarkedTemplates: unmarkedTemplates.length,
      cased,
      foreign,
      sentenceCase,
      /** Lowercase terms' glosses left out as placeholders. */
      placeheld,
      /** Glosses with labels put in brackets, a closing reference cut, or the translation first. */
      reshaped,
      labels: [...labels],
      abbreviations: [...abbreviations].filter((token) => !labels.has(token)),
      placeholders: [...placeholders],
    },
    templates,
    /** A capitalised headword's gloss in the edition's case (`inNativeCase`). */
    capitalCase: (text: string, head: string) =>
      !cases
        ? text
        : inNativeCase(text, entriesOf, { head, capital: true, capitalNouns }),
    nativeKind: (item: string) =>
      nativeKindOf(
        item,
        (word) => ({
          name: nativeNames.has(word),
          common: nativeCommon.has(word),
        }),
        { capitalNouns },
      ),
  };
}

/**
 * NATIVE (L3): a lower-case word opening a gloss right before a capitalised one, in an
 * edition that writes its glosses as sentences, is a label (Wiktionnaire's "transitif
 * Ouvrir", "réfléchi Attendre"): put in brackets.
 */
export const withOpeningLabel = (gloss: string) =>
  gloss.replace(/^(\p{Ll}+) (?=\p{Lu}\p{Ll})/u, "($1) ");

/** What the native edition has a word as: a proper noun, a common word, or both. */
type NativeEntries = (word: string) => { name: boolean; common: boolean };

/**
 * NATIVE: what a capitalised headword's gloss is, by the native edition's own entries:
 * - a gloss in lower case is a word (enero, britânico);
 * - a capitalised gloss the edition has in lower case as a common word is that word
 *   (Wikcionario and Wiktionnaire capitalise every gloss: "Enero", "Mayo", "Janvier");
 * - else one the edition has as written only as a proper noun is the name (Japón,
 *   Londres, Frankreich, 日本);
 * - else one it has as a common word is a word where the edition capitalises its common
 *   nouns (German: Januar, Donnerstag), and the name where it does not, as a capital
 *   then marks a name the edition files as a noun (Russian: Япония, Эйнштейн);
 * - else undefined.
 * A script without case has only the edition's proper nouns and common words (日本,
 * 一月).
 */
export function nativeKindOf(
  item: string,
  entries: NativeEntries,
  { capitalNouns = false }: { capitalNouns?: boolean } = {},
): "name" | "word" | undefined {
  const first = item.charAt(0);
  const { name, common } = entries(item);
  if (!/\p{Lu}/u.test(first)) {
    if (/[\p{Ll}\p{N}]/u.test(first)) return "word";
    return common ? "word" : name ? "name" : undefined;
  }
  if (entries(first.toLowerCase() + item.slice(1)).common) return "word";
  if (common) return capitalNouns ? "word" : "name";
  return name ? "name" : undefined;
}

/** A capitalised headword's tables translate into at least this many languages… */
const CAPITAL_COVERAGE = 50;
/** …and this many times the languages its lowercase headword's do. */
const LESSER_RATIO = 15;

/**
 * LEARNING: a lowercase headword English uses far less than the same word capitalised:
 * English Wiktionary's tables translate the capitalised one's main sense into
 * CAPITAL_COVERAGE languages or more, LESSER_RATIO times as many as any sense of the
 * lowercase one (French 180 against french, to cut in strips, 4; English 227 against
 * the billiards spin 8; Japan 217 against the lacquer 8). Not an inflected form, whose
 * tables are its base's ("numbers", not Numbers), nor a word with a use of its own
 * (china 17 against China 224; turkey, may, polish). A capitalised word at a
 * sentence start then reads as the capitalised one, as written mid-sentence.
 */
export function lesserLowercase(
  key: string,
  coverage: ReadonlyMap<string, number>,
  lemmas: LemmaPack,
): boolean {
  const bases = [lemmas[key] ?? []].flat();
  if (bases.some((base) => base !== key)) return false;
  const capital = coverage.get(capitalKey(key, false)) ?? 0;
  return (
    capital >= CAPITAL_COVERAGE &&
    (coverage.get(key) ?? 0) * LESSER_RATIO <= capital
  );
}

const senseLabel = (text: unknown) =>
  typeof text === "string" && text.trim() ? text.trim() : undefined;

/**
 * How many languages an entry's most translated sense's table translates it into: its
 * rows grouped by their sense label, else by the sense's gloss (`entryHint` for rows
 * outside a sense, which English Wiktionary does not leave untitled). The measure
 * `lesserLowercase` compares a capitalised headword and its lowercase one by.
 */
export function tableCoverage(entry: KaikkiEntry, entryHint?: string): number {
  const groups = new Map<string, Set<string>>();
  const add = (
    translations: KaikkiTranslation[] | undefined,
    fallback: string | undefined,
  ) => {
    for (const translation of translations ?? []) {
      const hint = senseLabel(translation?.sense) ?? fallback;
      if (!hint || typeof translation.lang_code !== "string") continue;
      let langs = groups.get(hint);
      if (!langs) groups.set(hint, (langs = new Set()));
      langs.add(translation.lang_code);
    }
  };
  add(entry.translations, entryHint);
  for (const sense of entry.senses ?? []) {
    const gloss: unknown = Array.isArray(sense.glosses)
      ? sense.glosses.at(-1)
      : undefined;
    add(
      sense.translations,
      typeof gloss === "string" ? shortOfDefinition(gloss.trim()) : undefined,
    );
  }
  return Math.max(0, ...[...groups.values()].map((langs) => langs.size));
}

/**
 * A gender, number or aspect label a row's text may keep inline (`rowWords`). Not the
 * dual's "du", a word in French and German.
 */
const ROW_LABEL = /^(?:m|f|n|c|sg|pl|impf|pf)$/u;

/**
 * The words of a translation row's text. A row may hold two words the table's template
 * did not split: joined by "or" ("بريستول or برستول", "دُكْتُور m or دُكْتُورَة",
 * "погнать or загнать") or after an inline label of gender, number or aspect ("amie f
 * copine", "هُجُوم m هَجْمَة", "odrzucać impf odrzucić"). Labels are dropped. The parts
 * a label alone parts are two words when they are alike in length, as two words of one
 * slot are; else the label sits inside one word, after its noun ("unter Eid m
 * aussagen", "point m de débat"), and the parts are that word. In a native script
 * (`letter`), a part with none of its letters is an English note and is dropped
 * ("стражник m old use"). Latin letters inside a word stay (zh "圈a", the @ sign).
 */
export function rowWords(text: string, letter?: RegExp): string[] {
  const words: string[] = [];
  let parts: string[][] = [];
  let current: string[] = [];
  const endPart = () => {
    if (current.length > 0) parts.push(current);
    current = [];
  };
  const endWord = () => {
    endPart();
    // A part with no letter of the native script beside one with is an English note
    // after a label ("стражник m old use", "суперобложка f for a book").
    const native = letter && parts.filter((part) => letter.test(part.join("")));
    if (native && native.length > 0) parts = native;
    const alike = parts.every((part) => part.length === parts[0]!.length);
    if (alike) words.push(...parts.map((part) => part.join(" ")));
    else if (parts.length > 0) words.push(parts.flat().join(" "));
    parts = [];
  };
  const tokens = text.trim().split(/\s+/u);
  // "or" joins two words where it cannot be one: in a native script, or beside a label
  // (French writes "or", gold).
  const joins = letter !== undefined || tokens.some((t) => ROW_LABEL.test(t));
  tokens.forEach((token, i) => {
    const between =
      token === "or" &&
      joins &&
      (current.length > 0 || parts.length > 0 || words.length > 0) &&
      i + 1 < tokens.length &&
      (!ROW_LABEL.test(tokens[i + 1]!) || ROW_LABEL.test(tokens[i - 1]!));
    if (between) endWord();
    else if (ROW_LABEL.test(token)) endPart();
    else current.push(token);
  });
  endWord();
  return words;
}

/**
 * Whether a translation table's note gives an example of the headword and its
 * translation ("We would sit by the hole on the frozen lake… - Winters saßen wir…"):
 * English that writes the headword, then " - ".
 */
export function isExampleNote(note: unknown, headword: string): boolean {
  if (typeof note !== "string") return false;
  const dash = note.indexOf(" - ");
  if (dash < 0) return false;
  const escaped = headword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}'’-])${escaped}(?![\\p{L}'’-])`, "iu").test(
    note.slice(0, dash),
  );
}

/**
 * English Wiktionary's translation tables (kaikki's English extract) into the native
 * language (`langCodes`, such as ["pt"] or ["cmn"]): per English sense, its words in
 * that language, at most MAX_WORDS, with the English sense label as the hint (the
 * table's own label, else the sense's gloss). `langs`: only the rows of these
 * languages (kaikki's names), for a language whose tables nest varieties under it
 * ("Chinese Mandarin", not "Chinese" rows tagged Hokkien or Dungan). A word loses its
 * stress marks (`withoutStressMarks`: the Russian tables mark stress); `word` then
 * rewrites it, or drops it by returning undefined. With a native script (`letter`),
 * words with no letter of it are left out beside words that have one
 * (`keepNativeScript`).
 *
 * A term's senses come in the order of how many languages their English sense's table
 * translates (its coverage; file order among equals), not the page's, and are capped
 * after that: Wiktionary's editors translate the senses that matter first, so "be"
 * leads with "to occupy a place" (150 languages) and "to exist" (123), not the passive
 * auxiliary's table its page lists first (61: de werden), and "English" with the
 * language (227), not a size of type (7: de Mittel) or a surname's transliteration (3:
 * ru Инглиш). A sense outside standard current use (`MARKED_TAGS`, or obsolete,
 * archaic, misspelt; or a table labelled so: ru do, "slang: have sex with") comes after
 * the others, and a capitalised headword's is left out beside them (it English:
 * inglese, not "silvio", the dated size of type). Unlike an edition's, such senses are
 * not left out of a lowercase term: kaikki's tags on English senses are noisy ("folk",
 * "a people", and "broil", "to cook by direct heat", come tagged archaic and obsolete),
 * and "thy" has no other. Capitalised headwords keep every other sense
 * (`capitalDictionary` caps them). Also gives the words English writes in lower
 * case (`lowercase`: lowercase headwords of English Wiktionary, Translingual ones
 * too; "english", "kg", not "january").
 */
export async function readTranslationTables(
  path: string,
  {
    langCodes,
    langs,
    termKey,
    word: rewrite = (w) => w,
    letter,
    learning = ENGLISH_TEXT.code,
  }: {
    /** The language whose entries' tables are read (L3: French, German); English by default. */
    learning?: string;
    langCodes: string[];
    langs?: string[];
    termKey: TermKey;
    word?: (word: string) => string | undefined;
    /** A letter of the native script (`nativeLetterOf`). */
    letter?: RegExp;
  },
) {
  const codes = new Set(langCodes);
  const names = langs && new Set<unknown>(langs);
  /** Each term's senses, with how many languages translate each, in file order. */
  type Ranked = Map<
    string,
    {
      sense: PairSense;
      coverage: number;
      marked: boolean;
      /** The language says the sense without a word: its row is only a note. */
      wordless?: boolean;
    }[]
  >;
  const found: Ranked = new Map();
  const capitalFound: Ranked = new Map();
  const lowercase = new Set<string>();
  /** English headwords written with a capital (May, beside may) */
  const capitalised = new Set<string>();
  /** term key ("french", "French") → the most languages one sense's table translates */
  const coverage = new Map<string, number>();
  /** term key → the tags of its English form-of senses ("past", "participle", "plural") */
  const formTags = new Map<string, Set<string>>();
  /** capitalised headword → its table words in every language, by case (`writtenAsWord`) */
  const rowCase = new Map<string, RowCase>();
  const stats = await eachEntry(path, (entry) => {
    // English text writes Translingual symbols too ("kg").
    if (entry.lang_code === learning || entry.lang_code === "mul") {
      const headword = entry.word.trim();
      if (headword === headword.toLowerCase()) lowercase.add(headword);
      else capitalised.add(headword);
    }
    if (entry.lang_code !== learning) return;
    // A capitalised headword ("Japan", "Thursday") is kept apart (`capitalTermOf`).
    const capitalKey = capitalTermOf(entry.word, termKey);
    const key = capitalKey ?? termKey(entry.word);
    if (!key) return;
    const into = capitalKey !== undefined ? capitalFound : found;
    const pos = posOf(entry.pos);
    for (const sense of entry.senses ?? [])
      if ((sense.tags ?? []).includes("form-of")) {
        let tags = formTags.get(key);
        if (!tags) formTags.set(key, (tags = new Set()));
        for (const tag of sense.tags ?? []) tags.add(tag);
      }
    // hint → words, and every language its table translates, in the order the senses
    // first appear
    const groups = new Map<
      string,
      {
        words: string[];
        langs: Set<string>;
        marked: boolean;
        example: boolean;
        noted: boolean;
      }
    >();
    const add = (
      translations: KaikkiTranslation[] | undefined,
      fallbackHint: string | undefined,
      marked = false,
    ) => {
      for (const translation of translations ?? []) {
        const hint = senseLabel(translation?.sense) ?? fallbackHint;
        if (!hint) continue;
        let group = groups.get(hint);
        if (!group)
          groups.set(
            hint,
            (group = {
              words: [],
              langs: new Set(),
              marked,
              example: false,
              noted: false,
            }),
          );
        if (typeof translation.lang_code === "string")
          group.langs.add(translation.lang_code);
        if (capitalKey !== undefined && typeof translation.word === "string") {
          let counts = rowCase.get(capitalKey);
          if (!counts)
            rowCase.set(capitalKey, (counts = { lower: 0, upper: 0 }));
          const first = translation.word.trim();
          if (/^\p{Ll}/u.test(first)) counts.lower++;
          else if (/^\p{Lu}/u.test(first)) counts.upper++;
        }
        if (!codes.has(translation.lang_code as string)) continue;
        if (names && !names.has(translation.lang)) continue;
        // A row of a variety kaikki nests under the language ("Egyptian-Arabic",
        // "Alemannic-German" under Arabic and German) is not the standard language its
        // readers read and write.
        if (
          (translation.tags ?? []).some((tag) =>
            String(tag).endsWith(`-${String(translation.lang)}`),
          )
        )
          continue;
        if (isExampleNote(translation.note, entry.word)) group.example = true;
        if (typeof translation.word !== "string") {
          // "not used in Mandarin", "Use the future perfective…": a row with a note
          // and no word.
          if (typeof translation.note === "string" && translation.note.trim())
            group.noted = true;
          continue;
        }
        for (const part of rowWords(translation.word, letter)) {
          const written = rewrite(withoutStressMarks(part));
          // A template the extraction left unexpanded ("{{t+|1=it|2=francese}}") is no word.
          if (!written || /\{\{|\}\}/.test(written)) continue;
          const { words } = group;
          if (words.length < MAX_WORDS && !words.includes(written))
            words.push(written);
        }
      }
    };
    // A learning language's own edition may leave a table untitled (Wiktionnaire's
    // rencontrer → encontrar): its rows are the entry's first sense's. English
    // Wiktionary titles every table.
    const firstGloss: unknown =
      learning === ENGLISH_TEXT.code
        ? undefined
        : entry.senses
            ?.find((sense) => Array.isArray(sense.glosses))
            ?.glosses?.at(-1);
    add(
      entry.translations,
      typeof firstGloss === "string"
        ? shortOfDefinition(firstGloss.trim())
        : undefined,
    );
    for (const sense of entry.senses ?? []) {
      const gloss: unknown = Array.isArray(sense.glosses)
        ? sense.glosses.at(-1)
        : undefined;
      add(
        sense.translations,
        typeof gloss === "string" ? shortOfDefinition(gloss.trim()) : undefined,
        (sense.tags ?? []).some(
          (tag) => MARKED_TAGS.includes(tag) || UNUSED_TAGS.includes(tag),
        ),
      );
    }
    for (const [hint, { words, langs, marked, example, noted }] of groups) {
      // A row that gives an example ("We would sit by the hole… - Winters saßen
      // wir…") has the example's pieces as its words ("In the winters", "er sei sofort
      // wieder da."), not translations.
      if (example || (words.length === 0 && !noted)) continue;
      let ranked = into.get(key);
      if (!ranked) into.set(key, (ranked = []));
      ranked.push({
        sense: [pos, words.join(", "), hint],
        coverage: langs.size,
        marked: marked || MARKED_LABEL.test(hint),
        ...(words.length === 0 && { wordless: true }),
      });
    }
    coverage.set(
      key,
      Math.max(
        coverage.get(key) ?? 0,
        tableCoverage(
          entry,
          typeof firstGloss === "string"
            ? shortOfDefinition(firstGloss.trim())
            : undefined,
        ),
      ),
    );
  });
  let wordless = 0;
  const termsOf = (ranked: Ranked, max: number, capital: boolean) => {
    const terms = new Map<string, SourceTerm>();
    for (const [key, list] of ranked) {
      const item = termOf(terms, key);
      // A capitalised headword's marked senses are left out beside unmarked ones (it
      // English: "silvio", a dated size of type, beside "inglese").
      const kept =
        capital && list.some(({ marked }) => !marked)
          ? list.filter(({ marked }) => !marked)
          : list;
      // A stable sort: equals keep the file's order.
      const sorted = kept.sort(
        (a, b) =>
          Number(a.marked) - Number(b.marked) || b.coverage - a.coverage,
      );
      // The language says the term's most translated sense without a word ("the":
      // "not used in Mandarin"): its other senses ("the … the …" → 越……越……) are no
      // meaning of the term, which is left to the next source.
      if (sorted[0]?.wordless) {
        wordless++;
        terms.delete(key);
        continue;
      }
      const ordered = withSharedFirst(
        sorted.filter((one) => !one.wordless).map(({ sense }) => sense),
      );
      for (const sense of ordered) addSense(item, sense, Infinity);
    }
    const foreign = keepNativeScript(terms, letter);
    for (const item of terms.values()) item.senses = item.senses.slice(0, max);
    return { terms, foreign };
  };
  const lower = termsOf(found, MAX_SENSES, false);
  const capital = termsOf(capitalFound, Infinity, true);
  // The short meaning is the first sense's first word.
  const firstWord = (text: string) => text.split(", ")[0]!;
  return {
    terms: finish(lower.terms, firstWord),
    capital: finish(capital.terms, firstWord),
    lowercase,
    capitalised,
    coverage,
    formTags,
    rowCase,
    stats: { ...stats, foreign: lower.foreign + capital.foreign, wordless },
  };
}

/**
 * LEARNING (English): the parts of speech a form of each kind is used as on its own,
 * by the tags of English Wiktionary's form-of senses: a past participle as an adjective
 * ("used", "tired"), a present participle or gerund as an adjective or a noun
 * ("pleasing", "meeting"), a plural as a noun, a comparative or superlative as an
 * adjective or adverb; a simple past or a third person as nothing but itself ("dug" is
 * no noun "teat": that is another word).
 */
export function usesOfForm(tags: ReadonlySet<string>): string[] {
  const uses = new Set<string>();
  if (tags.has("participle") && tags.has("past")) uses.add("adjective");
  if (tags.has("gerund") || (tags.has("participle") && tags.has("present"))) {
    uses.add("adjective");
    uses.add("noun");
  }
  if (tags.has("plural")) uses.add("noun");
  if (tags.has("comparative") || tags.has("superlative")) {
    uses.add("adjective");
    uses.add("adverb");
  }
  return [...uses];
}

/** A form's own table sense is a use of it when translated at least 1/FORM_RATIO as widely as its base. */
const FORM_RATIO = 5;

/**
 * Whether a later source's term `later` is another word than the form a term that
 * only points (`taken`) is: it has no meaning in a part of speech the form can be (its
 * pointers', or what English uses a form of its kind as: `usesOfForm` over the tags of
 * English Wiktionary's form-of senses, `formTags`), and the translation tables translate
 * it into fewer than 1/FORM_RATIO of the languages its base's most translated sense
 * reaches (`coverage`): dug, a past, is no noun, and "teat" (7 languages) is not what it
 * means beside dig. A noun that is a word of its own is as widely translated as its
 * base: stranger (55 against strange's 109), the accused (44 against accuse's 63).
 * Without English's tags nothing is said (a spelling: armor → armadura).
 */
export function isOtherWord(
  key: string,
  taken: readonly PairSense[],
  later: readonly PairSense[],
  {
    formTags,
    coverage,
  }: {
    formTags: ReadonlyMap<string, ReadonlySet<string>>;
    coverage: ReadonlyMap<string, number>;
  },
): boolean {
  const tags = formTags.get(key);
  if (tags === undefined) return false;
  const can = new Set([...taken.map(([pos]) => pos), ...usesOfForm(tags)]);
  if (later.some((sense) => !isPointerSense(sense) && can.has(sense[0])))
    return false;
  const base = Math.max(
    0,
    ...taken.map((sense) => coverage.get(sense[3] ?? "") ?? 0),
  );
  return (coverage.get(key) ?? 0) * FORM_RATIO < base;
}

/** A word translating this many of a term's table senses is its general translation. */
const SHARED_SENSES = 3;

/**
 * A translation-table term's senses with its general translation first: the word its
 * senses share most, when SHARED_SENSES or more of them have it and more than have the
 * first sense's first word. The most translated sense that has it comes first, with it
 * as its first word. zh be: 是 (six senses) before 在, "to occupy a place", the most
 * translated sense (four); de it: es (four) before er, the first of the row "er, sie,
 * es" of "subject — inanimate thing", which lists the genders.
 */
export function withSharedFirst(senses: readonly PairSense[]): PairSense[] {
  const wordsOf = (sense: PairSense) => sense[1].split(", ");
  const count = new Map<string, number>();
  for (const sense of senses)
    for (const word of new Set(wordsOf(sense)))
      count.set(word, (count.get(word) ?? 0) + 1);
  let shared: string | undefined;
  for (const [word, n] of count)
    if (n > (shared === undefined ? 0 : count.get(shared)!)) shared = word;
  const first = senses[0] && wordsOf(senses[0])[0]!;
  if (
    shared === undefined ||
    first === undefined ||
    count.get(shared)! < SHARED_SENSES ||
    count.get(shared)! <= count.get(first)!
  )
    return [...senses];
  const at = senses.findIndex((sense) => wordsOf(sense).includes(shared));
  const [pos, , hint] = senses[at]!;
  const lead: PairSense = [
    pos,
    [shared, ...wordsOf(senses[at]!).filter((word) => word !== shared)].join(
      ", ",
    ),
    hint,
  ];
  return [lead, ...senses.filter((_, i) => i !== at)];
}

/** What a capitalised headword's meaning is (`DictionaryProvider.capitalMeaning`). */
export type CapitalMeaning = "word" | "name";

/** How many of a capitalised headword's table words, in every language, open in lower and in upper case. */
export interface RowCase {
  lower: number;
  upper: number;
}

/** Table words a headword needs in languages with case for them to say what it is. */
const ROW_CASE_MIN = 3;

/**
 * Whether the languages with case write a capitalised headword as a common word in its
 * translation tables: most of its table words open in lower case (January: enero,
 * janvier, январь; not Germany: Alemania, Allemagne), of ROW_CASE_MIN or more.
 */
export function writtenAsWord(counts: RowCase | undefined): boolean {
  return (
    counts !== undefined &&
    counts.lower + counts.upper >= ROW_CASE_MIN &&
    counts.lower > counts.upper
  );
}

/** A capitalised headword's entry: a merged term and what it means, when it means something. */
type CapitalEntry =
  | [short: string, senses: PairSense[], source: number]
  | [
      short: string,
      senses: PairSense[],
      source: number,
      meaning: CapitalMeaning,
    ];

/**
 * A gloss shared by this many capitalised headwords names a class (Apellido ×130,
 * "Nombre de pila de varón" ×80, prenome masculino), not what one of them means. At 3
 * it also caught synonym headwords (francés, árabe, navidad).
 */
export const CLASS_HEADWORDS = 10;

/**
 * A sense's main item: a table sense's first word, else its gloss without notes in
 * brackets up to a separator, without the source's sense numbers (Wikcionario's
 * "Franco₁").
 */
const mainItem = ([, text, hint]: PairSense) =>
  (hint != null
    ? text.split(", ")[0]!
    : text.replace(NOTES, " ").split(/[,;，；]/)[0]!
  )
    .replace(/[₀-₉]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。:：]+$/, "")
    .trim();

/** A word without case or accents, to compare a gloss with its headword. */
const bare = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * By its shape, when the native edition does not say: in a script with case, a gloss
 * whose words are capitalised, short function words between them allowed ("Reino
 * Unido", "Estados Unidos de América"), is the name, any other a word ("yo soy", "Mois
 * de mai"). A script without case shows nothing of the kind (源自朝鲜语的姓氏, "a
 * surname from Korean", is no name of Oh): none.
 */
function shapeKind(item: string): CapitalMeaning | undefined {
  if (!/[\p{Lu}\p{Ll}]/u.test(item)) return undefined;
  const words = item.split(/\s+/);
  const capitalised = (word: string) => /^\p{Lu}/u.test(word);
  return capitalised(words[0]!) &&
    capitalised(words.at(-1)!) &&
    words.every((word) => capitalised(word) || word.length <= 3)
    ? "name"
    : "word";
}

/**
 * In a script without case, where the native edition does not say: a sense of a common
 * word's part of speech is a word (English, an adjective: 英国人的, "English
 * person's"), and a proper noun's is the name written in the native script (th Texas:
 * เท็กซัส, as the Thai edition, a small one, has no entry for it to say so) when the
 * headword is no common word too (`lowercase`): a capitalised common word is as often
 * some other bearer of the name, and the edition's proper noun one of them (zh Oh:
 * "源自朝鲜语的姓氏", a surname, for the interjection; City: 伦敦城). A person's name
 * stays a name the reader ignores (`keptOrName`).
 */
const commonKind = (
  [pos]: PairSense,
  common: boolean,
): CapitalMeaning | undefined =>
  pos === "" || (pos === "proper noun" && common)
    ? undefined
    : pos === "proper noun"
      ? "name"
      : "word";

/**
 * A translation table's sense whose English sense is about a person's name ("An
 * English surname…", "transliterations of the surname", "A male given name"): its
 * words are the name, not what the headword means.
 */
const aboutAPerson = ([, , hint]: PairSense) =>
  hint != null &&
  (GIVEN_NAME.test(hint.toLowerCase()) || SURNAME.test(hint.toLowerCase()));

/**
 * An edition's senses with the first of each part of speech first, in the order the
 * parts first come, then the rest as they were (fr English: "anglais" the adjective,
 * "Anglais, le peuple anglais", "Anglais, langue anglaise", before the adjective's
 * three other senses). A capitalised word's hover is not ordered by its tag (rule A2
 * leaves capitals alone), so its lines show what each part of speech means; an
 * interjection's turn comes last. A translation table's senses (with a hint) stay in
 * their order, the order of how many languages translate them.
 */
function inPosTurns(senses: readonly PairSense[]): PairSense[] {
  if (senses[0]?.[2] != null) return [...senses];
  // An exclamation's senses after the others: a capitalised word said as one ("God!",
  // "Jesus!") is the word used so; pt God: "Deus" before "interjeição que mostra
  // frustração".
  const ordered = [
    ...senses.filter(([pos]) => pos !== "interjection"),
    ...senses.filter(([pos]) => pos === "interjection"),
  ];
  const seen = new Set<string>();
  const firsts = ordered.filter((sense) => {
    if (seen.has(sense[0])) return false;
    seen.add(sense[0]);
    return true;
  });
  return [...firsts, ...ordered.filter((sense) => !firsts.includes(sense))];
}

/**
 * The capitalised headwords of a recipe pair (merged by `mergeSources`, by their
 * `capitalKey`: Japan, TV), each with its senses and what its meaning is:
 * - a sense whose main item is shared by CLASS_HEADWORDS or more headwords is a class
 *   gloss and is left out (Louis, Michael, Churchill: "Nombre de pila de varón");
 * - a sense about a person's name (`aboutAPerson`) is left out when the headword has
 *   a meaning besides: a person's name is no line of a language's or a nationality's
 *   word (ru English: not Инглиш, the surname's transliteration);
 * - an edition's senses come in turns by part of speech (`inPosTurns`), then all are
 *   capped at MAX_SENSES (the sources keep every sense of a capitalised headword);
 * - the first sense that is no pointer gives the meaning: none when its main item is
 *   the headword itself (Texas → Texas, German Japan → Japan); else "name" or "word"
 *   by the native edition's entry for it (`nativeKind`), else a word where the
 *   languages with case write the headword as one (`rowsSayWord`: Indonesian writes
 *   months capitalised, Januari, as English does, and its edition has no entry to say
 *   what they are), else by its shape (`shapeKind`); in a script without case, where
 *   a capital says nothing, a word
 *   where the languages with case write the headword as one (`rowsSayWord`: the Thai
 *   edition files month names as proper nouns, มกราคม, as Thai grammar does, but
 *   enero, janvier say a common word), else by the edition, else by its part of
 *   speech (`commonKind`);
 * - a "word" meaning of a person's name first (`personFirst`: the names lexicon's main
 *   kind a given name or a surname) is a use of the name, not what it means (Einstein
 *   → genio, Frank → franco): none. Wiktionary's glosses do not mark a sense about one
 *   bearer of a name as EJDict's do, so the names lexicon tells instead;
 * - a headword with no meaning that has an English definition to show instead
 *   (`defined`: a capital-only word's, rule E: Instagram → "Instagram", Sony → "Sony")
 *   is left out, so the word shows that definition, translated at display time.
 */
export function capitalDictionary(
  dict: Readonly<Record<string, [string, PairSense[], number]>>,
  {
    nativeKind,
    rowsSayWord = () => false,
    personFirst,
    defined = () => false,
    lowercase = () => false,
  }: {
    nativeKind: (item: string) => CapitalMeaning | undefined;
    /** The languages with case write the headword as a common word (`writtenAsWord`). */
    rowsSayWord?: (key: string) => boolean;
    personFirst: (term: string) => boolean;
    defined?: (term: string) => boolean;
    /** The term is a common word too: the pair has a lowercase entry for it as its own base. */
    lowercase?: (term: string) => boolean;
  },
) {
  // A gloss that is only a note ("(английская фамилия)") is compared whole.
  const classItem = (sense: PairSense) =>
    bare(mainItem(sense) || sense[1].trim());
  const headwordsOf = new Map<string, Set<string>>();
  for (const [key, [, senses]] of Object.entries(dict))
    for (const sense of senses) {
      if (isPointerSense(sense)) continue;
      const item = classItem(sense);
      let keys = headwordsOf.get(item);
      if (!keys) headwordsOf.set(item, (keys = new Set()));
      keys.add(key);
    }
  const isClass = (sense: PairSense) =>
    !isPointerSense(sense) &&
    (headwordsOf.get(classItem(sense))?.size ?? 0) >= CLASS_HEADWORDS;
  const capital: Record<string, CapitalEntry> = {};
  const counts = { classSenses: 0, personSenses: 0, word: 0, name: 0, none: 0 };
  for (const [key, [short, senses, source]] of Object.entries(dict)) {
    const unclassed = senses.filter((sense) => !isClass(sense));
    counts.classSenses += senses.length - unclassed.length;
    const impersonal = unclassed.filter((sense) => !aboutAPerson(sense));
    const chosen = impersonal.some((sense) => !isPointerSense(sense))
      ? impersonal
      : unclassed;
    counts.personSenses += unclassed.length - chosen.length;
    const kept = inPosTurns(chosen).slice(0, MAX_SENSES);
    if (kept.length === 0) continue;
    const first = kept[0]!;
    const shortOf = first === senses[0] ? short : shortOfPairSenses(kept);
    const meaningSense = kept.find((sense) => !isPointerSense(sense));
    const item = meaningSense && mainItem(meaningSense);
    let meaning: CapitalMeaning | undefined =
      item && bare(item) !== bare(key)
        ? /[\p{Lu}\p{Ll}]/u.test(item)
          ? (nativeKind(item) ??
            (rowsSayWord(key) ? "word" : undefined) ??
            shapeKind(item) ??
            commonKind(meaningSense!, lowercase(key.toLowerCase())))
          : rowsSayWord(key)
            ? "word"
            : (nativeKind(item) ??
              commonKind(meaningSense!, lowercase(key.toLowerCase())))
        : undefined;
    if (meaning === "word" && personFirst(key.toLowerCase()))
      meaning = undefined;
    counts[meaning ?? "none"]++;
    if (meaning === undefined && defined(key.toLowerCase())) continue;
    capital[key] =
      meaning === undefined
        ? [shortOf, kept, source]
        : [shortOf, kept, source, meaning];
  }
  const classes = [...headwordsOf]
    .filter(([, keys]) => keys.size >= CLASS_HEADWORDS)
    .map(([item, keys]) => [item, keys.size] as const)
    .sort((a, b) => b[1] - a[1]);
  return { capital, counts, classes };
}

/**
 * The capitalised headwords that came from source `source` (an edition), once what
 * each means is decided (`capitalDictionary`), with their glosses in the edition's case
 * (`capitalCase`: January → "enero"; Birmingham's "Ciudad de Inglaterra" stays the
 * name it was read as). Gives how many glosses changed.
 */
export function inCapitalCase(
  capital: Record<string, CapitalEntry>,
  source: number,
  capitalCase: (text: string, head: string) => string,
): number {
  let cased = 0;
  for (const [key, entry] of Object.entries(capital)) {
    if (entry[2] !== source) continue;
    const first = entry[1][0]![1];
    entry[1] = entry[1].map((sense): PairSense => {
      const text = capitalCase(sense[1], key);
      if (text === sense[1]) return sense;
      cased++;
      const copy: PairSense = [...sense];
      copy[1] = text;
      return copy;
    });
    if (entry[1][0]![1] !== first)
      entry[0] = shortOfDefinition(entry[1][0]![1]);
  }
  return cased;
}

/**
 * NATIVE + PAIR: the capitalised headwords that came from source `source` (an edition)
 * with the word that opens a gloss in the case the translation tables write it for the
 * same headword: Wikcionario's "Marzo", "Julio", "Domingo" and Wiktionnaire's "Mars",
 * "Janvier" go to lower case where the tables write "marzo", "mars", "janvier" (es
 * and fr write months and weekdays in lower case; "Mars" is the planet). A word the
 * tables also write as written stays ("Dios", "China", German "Januar"). Gives how
 * many glosses changed.
 */
export function inTablesCase(
  capital: Record<string, CapitalEntry>,
  source: number,
  tables: ReadonlyMap<string, SourceTerm>,
): number {
  let cased = 0;
  for (const [key, entry] of Object.entries(capital)) {
    if (entry[2] !== source) continue;
    const term = tables.get(key);
    if (!term) continue;
    const written = new Set(
      term.senses.flatMap(([, text]) =>
        text.split(", ").map((word) => word.trim()),
      ),
    );
    const first = entry[1][0]![1];
    entry[1] = entry[1].map((sense): PairSense => {
      const text = sense[1].replace(
        /^(\s*(?:[(（[][^()（）[\]]*[)）\]]\s*)?)(\p{Lu}[\p{L}\p{M}'’-]*)/u,
        (found, before: string, word: string) => {
          const lower = word.charAt(0).toLowerCase() + word.slice(1);
          return written.has(lower) && !written.has(word)
            ? before + lower
            : found;
        },
      );
      if (text === sense[1]) return sense;
      cased++;
      const copy: PairSense = [...sense];
      copy[1] = text;
      return copy;
    });
    if (entry[1][0]![1] !== first)
      entry[0] = shortOfDefinition(entry[1][0]![1]);
  }
  return cased;
}

/**
 * PAIR + NATIVE: an edition's verb senses that say they are an auxiliary's, in the
 * native word the translation tables give for English "auxiliary" (es "haber (como
 * verbo auxiliar)", fr "avoir. Auxiliaire utilisé pour former l’aspect accompli"), are
 * labelled "auxiliary", so an auxiliary's lookup shows them first (rule A2: "has been"
 * → haber, not tener). `words`: the tables' words for "auxiliary". Gives how many
 * senses changed.
 */
export function withAuxiliarySenses(
  dict: Record<string, [string, PairSense[], number]>,
  source: number,
  words: readonly string[],
): number {
  const native = words.filter((word) => [...word].length >= 4);
  if (native.length === 0) return 0;
  const auxiliary = new RegExp(
    `(?<![\\p{L}\\p{M}])(?:${native.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{M}])`,
    "iu",
  );
  let labelled = 0;
  for (const entry of Object.values(dict)) {
    if (entry[2] !== source) continue;
    entry[1] = entry[1].map((sense): PairSense => {
      if (sense[0] !== "verb" || isPointerSense(sense) || sense[2] != null)
        return sense;
      if (!auxiliary.test(sense[1])) return sense;
      labelled++;
      const copy: PairSense = [...sense];
      copy[0] = "auxiliary";
      return copy;
    });
  }
  return labelled;
}

/**
 * A translation-table word in the last of the scripts it is written in: Chinese rows
 * give the traditional form, then the simplified one ("麵包 /面包" → "面包"; a word
 * the same in both is written once).
 */
export const lastScriptForm = (word: string) => word.split(" /").at(-1)!.trim();

/**
 * A source's terms with their native text rewritten by `convert` (traditional
 * Chinese characters → simplified ones, a spelling → its main one), the English hints
 * as they are: each word of a sense once, each sense of a part of speech once.
 */
export function convertTerms(
  terms: Map<string, SourceTerm>,
  convert: (text: string) => string,
) {
  for (const item of terms.values()) {
    const senses: PairSense[] = [];
    for (const [pos, text, hint, target] of item.senses) {
      const converted = [...new Set(convert(text).split(", "))].join(", ");
      // Spellings that convert alike may make two senses one; another part of
      // speech's stays (one: the numeral and the noun एक).
      if (senses.some(([p, other]) => p === pos && other === converted))
        continue;
      senses.push(
        target !== undefined
          ? [pos, converted, null, target]
          : hint == null
            ? [pos, converted]
            : [pos, converted, hint],
      );
    }
    item.senses = senses;
    item.short = convert(item.short);
  }
  return terms;
}

/** A sense that describes its word rather than translating it: an edition's gloss whose line describes (`describes`). */
const describing = ([, text, hint]: PairSense) =>
  hint == null && describes(editionLine(text));

/**
 * The closed classes (kaikki's labels): the grammar words a language translates rather
 * than defines, where an edition may describe their use instead.
 */
const CLOSED_CLASSES: readonly string[] = [
  "pronoun",
  "determiner",
  "article",
  "preposition",
  "postposition",
  "conjunction",
  "particle",
];

/**
 * The parts of speech a term only describes: every sense of it that is no pointer is
 * of a closed class (CLOSED_CLASSES) and describes its word (pl the: "stosowany przed
 * wyrazem znanym z kontekstu", "used before a word known from the context"); undefined
 * for a term with a translation or a sense of another class, whose description is its
 * meaning ("Persona que dirige un avión", an interjection's "Expresión de dolor").
 */
function describedOnly(senses: readonly PairSense[]) {
  const meanings = senses.filter((sense) => !isPointerSense(sense));
  if (meanings.length === 0) return undefined;
  if (
    meanings.some(
      (sense) => !CLOSED_CLASSES.includes(sense[0]) || !describing(sense),
    )
  )
    return undefined;
  return new Set(meanings.map(([pos]) => pos));
}

/** The open classes, which every source labels alike (unlike numerals, articles…). */
const OPEN_CLASSES: readonly string[] = ["noun", "verb", "adjective", "adverb"];

/** A gloss's items (what its commas and semicolons separate), in lower case, without notes. */
const itemsOf = (text: string) =>
  text
    .replace(NOTES, " ")
    .toLowerCase()
    .replaceAll("’", "'")
    .split(/[,;，；]/)
    .map((item) => item.replace(/[\s.:。：]+$/u, "").trim())
    .filter((item) => item !== "");

/**
 * Whether `senses` already give one of `sense`'s words as an item: the same
 * translation under another label (es yesterday: the edition's adverb "ayer", the
 * tables' noun "ayer"; seven: an adjective and a numeral). A description that uses the
 * word ("ktoś lepszy w czymś", someone better at something) does not.
 */
function translatesAlike(senses: readonly PairSense[], sense: PairSense) {
  const given = new Set(senses.flatMap(([, text]) => itemsOf(text)));
  return itemsOf(sense[1]).some((item) => given.has(item));
}

/**
 * Merges the sources (in order of preference): each term comes whole from the first
 * source that has it, as [short, senses, source index]. A term that only points
 * (every sense of it a pointer: pt "used", "passado … do verbo use") comes whole from
 * the first later source that has a meaning for it (the tables' "usado,
 * acostumado"), and stays with its pointers when none has, or when that source's term
 * is another word (`otherWord`, `isOtherWord`: dug, the tables' noun "teat", is no form
 * of dig). Likewise a term of a closed class that a source only describes (`describedOnly`: pl "the") comes whole from the
 * first later source that translates it in one of those parts of speech (a sense of
 * that part of speech that does not describe), and stays described when none does
 * (pl "a": the tables have only the letter's name).
 *
 * And a term with no meaning in its main part of speech (`mainPos`: that of its most
 * translated sense, the translation tables' first; an open class) comes whole from the
 * first later source that has one, unless the term already writes that meaning's
 * translation under another label (`translatesAlike`): fr and pl "better", whose
 * editions have only the verb and the noun, from the tables' "meilleur", "lepszy" (A1
 * sent the adjective to "good": "bon", "sage"); es "better", whose edition's
 * adjective is only "comparativo irregular de good" (a `degree`), from the tables'
 * "mejor"; es "spring", whose edition has only the verb (saltar), from the tables'
 * "primavera". A pointer or a degree names another word's meaning; it has none of its
 * own. A contraction comes from the first later source that translates what it is
 * short for (`expansionsOf`), when the former does not.
 */
export function mergeSources(
  sources: { tag: string; terms: Map<string, SourceTerm> }[],
  {
    mainPos = () => undefined,
    degree = () => false,
    otherWord = () => false,
    expansionsOf = () => [],
  }: {
    mainPos?: (key: string) => string | undefined;
    /** A sense that is an unmarked degree of another word (`degreeOf`). */
    degree?: (key: string, sense: PairSense) => boolean;
    /**
     * Whether a later source's term is another word than the form a term that only
     * points is (`isOtherWord`): the term keeps its pointers.
     */
    otherWord?: (
      key: string,
      taken: readonly PairSense[],
      later: readonly PairSense[],
    ) => boolean;
    /** What a contraction is short for (en/contractions.json): "do not" for don't. */
    expansionsOf?: (key: string) => readonly string[];
  } = {},
) {
  const dict: Record<string, [string, PairSense[], number]> = {};
  const counts: Record<string, number> = {};
  const described: string[] = [];
  const lacking: string[] = [];
  const pointing: string[] = [];
  const expanded: string[] = [];
  const means = (senses: readonly PairSense[]) =>
    senses.some((sense) => !isPointerSense(sense));
  /** Whether `senses` mean something as a `pos` (no pointer, no degree). */
  const meansAs = (key: string, senses: readonly PairSense[], pos: string) =>
    senses.some(
      (sense) =>
        sense[0] === pos && !isPointerSense(sense) && !degree(key, sense),
    );
  /** Whether `later` replaces `taken`, a term a former source gave. */
  const yields = (
    key: string,
    taken: readonly PairSense[],
    later: readonly PairSense[],
  ): "points" | "describes" | "lacks" | "expands" | false => {
    if (!means(taken)) {
      if (!means(later)) return false;
      if (otherWord(key, taken, later)) {
        pointing.push(key);
        return false;
      }
      return "points";
    }
    // A contraction a translation table translates as what it is short for (its
    // English sense "do not": fr don't → "ne… pas") comes from it, not from a source
    // that does not (Wiktionnaire's don’t: "Signifie l’impératif négatif").
    const expansions = expansionsOf(key);
    const translatesExpansion = (senses: readonly PairSense[]) =>
      senses.some(
        (sense) =>
          !isPointerSense(sense) &&
          sense[2] != null &&
          expansions.includes(sense[2].toLowerCase()),
      );
    if (
      expansions.length > 0 &&
      !translatesExpansion(taken) &&
      translatesExpansion(later)
    )
      return "expands";
    const described = describedOnly(taken);
    if (
      described !== undefined &&
      later.some(
        (sense) =>
          !isPointerSense(sense) &&
          described.has(sense[0]) &&
          !describing(sense),
      )
    )
      return "describes";
    const main = mainPos(key);
    return (
      main !== undefined &&
      OPEN_CLASSES.includes(main) &&
      !meansAs(key, taken, main) &&
      meansAs(key, later, main) &&
      !translatesAlike(
        taken,
        later.find(
          (sense) =>
            sense[0] === main && !isPointerSense(sense) && !degree(key, sense),
        )!,
      ) &&
      "lacks"
    );
  };
  sources.forEach(({ tag, terms }, index) => {
    counts[tag] = 0;
    for (const [key, { short, senses }] of terms) {
      if (Object.hasOwn(dict, key)) {
        const [, taken, from] = dict[key]!;
        const why = yields(key, taken, senses);
        if (!why) continue;
        counts[sources[from]!.tag]!--;
        if (why === "describes") described.push(key);
        if (why === "lacks") lacking.push(key);
        if (why === "expands") expanded.push(key);
      }
      dict[key] = [short, senses, index];
      counts[tag]++;
    }
  });
  return {
    dict,
    sources: sources.map(({ tag }) => tag),
    counts,
    /** The terms a later source took from one that only described them. */
    described,
    /** The terms a later source took from one with no meaning in their main part of speech. */
    lacking,
    /** The terms that only point and kept their pointers, the later source's being another word. */
    pointing,
    /** The contractions a later source took for translating what they are short for. */
    expanded,
  };
}
