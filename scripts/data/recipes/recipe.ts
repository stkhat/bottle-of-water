// Build recipes: a pair dictionary merged from human-made sources in order, where the
// first source that has a term supplies all of it (one source tag per term). See
// docs/specs/architecture.md "Native meanings and the quality gate".
import {
  capitalKey,
  describes,
  editionLine,
  keyOf,
  shortOfDefinition,
} from "../../../src/core/lexicon/short-lines.ts";
import type { LemmaPack } from "../../../src/core/packs/types.ts";
import {
  eachEntry,
  posLabel,
  type KaikkiSense,
  type KaikkiTranslation,
} from "../common.ts";
import { isNonConstituent, isUsable, patternKey } from "../phrases.ts";

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
export type TermKey = (headword: string) => string | undefined;

/**
 * The key a headword is filed under, or undefined when it is not one Langle looks up: a
 * single word must be a vocabulary word written in lowercase (names and inflected forms
 * are left out); several words must form one of the phrase patterns.
 */
export function termKeyOf({
  vocab,
  lemmas,
  phrases,
}: {
  vocab: ReadonlySet<string>;
  lemmas: LemmaPack;
  phrases: ReadonlySet<string>;
}): TermKey {
  const isWord = (word: string) =>
    vocab.has(word) || Object.hasOwn(lemmas, word);
  return (headword) => {
    const word = headword.trim();
    if (!/\s/.test(word)) return vocab.has(word) ? word : undefined;
    const key = patternKey(word, isWord);
    return key && phrases.has(key) ? key : undefined;
  };
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
  const word = headword.trim();
  if (/\s/.test(word) || !(proper || /^\p{Lu}/u.test(word))) return undefined;
  const lower = word.toLowerCase();
  if (termKey(lower) !== lower) return undefined;
  const acronym = /\p{Lu}.*\p{Lu}/u.test(word) && !/\p{Ll}/u.test(word);
  return capitalKey(lower, acronym);
}

export function addSense(item: SourceTerm, sense: PairSense) {
  if (item.senses.length >= MAX_SENSES) return;
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

/** A heading ("==葡萄牙语==", "====翻译====") or a list item ("* 汉语：…") of a wiki page. */
const PAGE_MARKUP = /={2,}|\n\s*[*#]/;

/**
 * A gloss without the page structure the extraction let into it: cut where a heading
 * or a list item starts ("消色差透镜\n* 正体: …" → "消色差透镜").
 */
export function withoutPageMarkup(gloss: string) {
  const at = gloss.search(PAGE_MARKUP);
  return (at < 0 ? gloss : gloss.slice(0, at)).trim();
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
    const template = (
      gloss.slice(0, found.index) +
      SLOT +
      gloss.slice(found.index + found[0].length)
    )
      .replace(NOTES, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s.:;。：；]+$/, "")
      .trim()
      .toLowerCase();
    return /\p{L}/u.test(template.replace(SLOT, "")) && template.includes(SLOT)
      ? [template]
      : [];
  });
}

/** A sense the source marks as a form or a variant of another word (kaikki's tags or fields). */
const isMarkedForm = (sense: KaikkiSense) =>
  Array.isArray(sense.form_of) ||
  Array.isArray(sense.alt_of) ||
  (sense.tags ?? []).some((tag) => tag === "form-of" || tag === "alt-of");

/** Senses no source meaning comes from: obsolete, archaic, misspelt. */
const UNUSED_TAGS = ["obsolete", "archaic", "misspelling"];

/** The English terms a gloss writes, other than the entry's own headword, in order. */
const termsWritten = (
  gloss: string,
  head: string,
  isTerm: (word: string) => boolean,
) =>
  (gloss.match(ENGLISH_WORD) ?? [])
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
  return named.some((word) => /^[a-z][a-z' -]*$/.test(word))
    ? undefined
    : written.at(-1);
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
 * `nativeLetterOf`), where a term has such meanings: beside them, an edition's gloss or
 * a translation table's word with no letter of the script is no meaning (en-zh be: "or
 * implied", a parse artifact, beside 是; ru would: "We sat on the bench, опоздает ли
 * автобус" keeps its Russian part). A word that is the headword itself stays (zh "DNA",
 * a loanword written alike), and so do pointers. A term with no meaning in the script
 * keeps what it has (ru, zh "that's": "that is", "that has", the English it stands
 * for). Gives how many glosses and words were left out.
 */
function keepNativeScript(
  terms: Map<string, SourceTerm>,
  letter: RegExp | undefined,
): number {
  if (letter === undefined) return 0;
  let left = 0;
  for (const [key, item] of terms) {
    const native = (text: string) =>
      letter.test(text) || keyOf(text) === key.toLowerCase();
    if (
      !item.senses.some((sense) => !isPointerSense(sense) && native(sense[1]))
    )
      continue;
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
  }: {
    trimPeriod?: boolean;
    native?: string;
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
  const stats = await eachEntry(path, (entry) => {
    if (native !== undefined && entry.lang_code === native) {
      const written = entry.word.trim();
      nativeWords.add(written.toLowerCase());
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
    if (entry.lang_code !== "en") return;
    const head = entry.word.trim().toLowerCase();
    for (const sense of entry.senses ?? []) {
      const opening = /\p{L}/u.exec(cleanGloss(sense)?.gloss ?? "")?.[0];
      if (opening !== undefined)
        glossOpenings[/\p{Lu}/u.test(opening) ? "upper" : "lower"]++;
      const found = isMarkedForm(sense) ? cleanGloss(sense) : undefined;
      if (!found) continue;
      const target = markedTarget(
        sense,
        found.gloss,
        termsWritten(found.gloss, head, isTerm),
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
  const templates = new Set(
    [...learned]
      .filter(
        ([, targets]) =>
          targets.size >= MIN_TEMPLATE_TARGETS &&
          [...targets].some((target) => !nativeWords.has(target)),
      )
      .map(([template]) => template),
  );
  /** The term a gloss points to in one of the edition's templates. */
  const pointerOf = (gloss: string, head: string, sense: KaikkiSense) => {
    const written = termsWritten(gloss, head, isTerm);
    const marked = isMarkedForm(sense)
      ? markedTarget(sense, gloss, written)
      : undefined;
    return [...(marked ? [marked] : []), ...written].find((word) =>
      pointerTemplates(gloss, word).some((template) => templates.has(template)),
    );
  };
  let pointers = 0;
  let cased = 0;
  let foreign = 0;
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
  const termsOf = (entries: readonly Read[], capital: boolean) => {
    const terms = new Map<string, SourceTerm>();
    for (const { key, head, pos, senses } of entries)
      for (const sense of senses) {
        if ((sense.tags ?? []).some((tag) => UNUSED_TAGS.includes(tag)))
          continue;
        const found = cleanGloss(sense);
        if (!found) continue;
        const { written, gloss } = found;
        // Page markup with only the headword before it ("adoring\n====翻译====…") is no
        // gloss; a gloss that is the headword itself is (a loanword: "pizza").
        if (!gloss || (gloss !== written && gloss.toLowerCase() === head))
          continue;
        const trimmed =
          trimPeriod && /^[^.。]+[.。]$/.test(gloss)
            ? gloss.slice(0, -1)
            : gloss;
        const text =
          !cases || capital
            ? trimmed
            : inNativeCase(trimmed, entriesOf, { head, capitalNouns });
        if (text !== trimmed) cased++;
        const target = pointerOf(gloss, head, sense);
        if (target !== undefined) {
          pointers++;
          addSense(termOf(terms, key), [pos, text, null, target]);
        } else if (isUsable(sense)) addSense(termOf(terms, key), [pos, text]);
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
      cased,
      foreign,
      sentenceCase,
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

const senseLabel = (text: unknown) =>
  typeof text === "string" && text.trim() ? text.trim() : undefined;

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
 */
export async function readTranslationTables(
  path: string,
  {
    langCodes,
    langs,
    termKey,
    word: rewrite = (w) => w,
    letter,
  }: {
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
  const terms = new Map<string, SourceTerm>();
  const capital = new Map<string, SourceTerm>();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    // A capitalised headword ("Japan", "Thursday") is kept apart (`capitalTermOf`).
    const capitalKey = capitalTermOf(entry.word, termKey);
    const key = capitalKey ?? termKey(entry.word);
    if (!key) return;
    const into = capitalKey !== undefined ? capital : terms;
    const pos = posOf(entry.pos);
    // hint → words, in the order the senses first appear
    const groups = new Map<string, string[]>();
    const add = (
      translations: KaikkiTranslation[] | undefined,
      fallbackHint: string | undefined,
    ) => {
      for (const translation of translations ?? []) {
        if (!codes.has(translation?.lang_code as string)) continue;
        if (names && !names.has(translation.lang)) continue;
        if (typeof translation.word !== "string") continue;
        const written = rewrite(withoutStressMarks(translation.word.trim()));
        if (!written) continue;
        const hint = senseLabel(translation.sense) ?? fallbackHint;
        if (!hint) continue;
        let words = groups.get(hint);
        if (!words) groups.set(hint, (words = []));
        if (words.length < MAX_WORDS && !words.includes(written))
          words.push(written);
      }
    };
    add(entry.translations, undefined);
    for (const sense of entry.senses ?? []) {
      const gloss: unknown = Array.isArray(sense.glosses)
        ? sense.glosses.at(-1)
        : undefined;
      add(
        sense.translations,
        typeof gloss === "string" ? shortOfDefinition(gloss.trim()) : undefined,
      );
    }
    for (const [hint, words] of groups)
      addSense(termOf(into, key), [pos, words.join(", "), hint]);
  });
  // The short meaning is the first sense's first word.
  const firstWord = (text: string) => text.split(", ")[0]!;
  const foreign =
    keepNativeScript(terms, letter) + keepNativeScript(capital, letter);
  return {
    terms: finish(terms, firstWord),
    capital: finish(capital, firstWord),
    stats: { ...stats, foreign },
  };
}

/** What a capitalised headword's meaning is (`DictionaryProvider.capitalMeaning`). */
export type CapitalMeaning = "word" | "name";

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
 * The capitalised headwords of a recipe pair (merged by `mergeSources`, by their
 * `capitalKey`: Japan, TV), each with what its meaning is:
 * - a sense whose main item is shared by CLASS_HEADWORDS or more headwords is a class
 *   gloss and is left out (Louis, Michael, Churchill: "Nombre de pila de varón");
 * - the first sense that is no pointer gives the meaning: none when its main item is
 *   the headword itself (Texas → Texas, German Japan → Japan); else "name" or "word"
 *   by the native edition's entry for it (`nativeKind`), else by its shape
 *   (`shapeKind`);
 * - a "word" meaning of a person's name first (`personFirst`: the names lexicon's main
 *   kind a given name or a surname) is a use of the name, not what it means (Einstein
 *   → genio, Frank → franco): none. Wiktionary's glosses do not mark a sense about one
 *   bearer of a name as EJDict's do, so the names lexicon tells instead.
 */
export function capitalDictionary(
  dict: Readonly<Record<string, [string, PairSense[], number]>>,
  {
    nativeKind,
    personFirst,
  }: {
    nativeKind: (item: string) => CapitalMeaning | undefined;
    personFirst: (term: string) => boolean;
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
  const counts = { classSenses: 0, word: 0, name: 0, none: 0 };
  for (const [key, [short, senses, source]] of Object.entries(dict)) {
    const kept = senses.filter((sense) => !isClass(sense));
    counts.classSenses += senses.length - kept.length;
    if (kept.length === 0) continue;
    const first = kept[0]!;
    const shortOf =
      kept.length === senses.length
        ? short
        : first[2] != null
          ? first[1].split(", ")[0]!
          : shortOfDefinition(first[1]);
    const meaningSense = kept.find((sense) => !isPointerSense(sense));
    const item = meaningSense && mainItem(meaningSense);
    let meaning: CapitalMeaning | undefined =
      item && bare(item) !== bare(key)
        ? (nativeKind(item) ?? shapeKind(item))
        : undefined;
    if (meaning === "word" && personFirst(key.toLowerCase()))
      meaning = undefined;
    counts[meaning ?? "none"]++;
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
 * A translation-table word in the last of the scripts it is written in: Chinese rows
 * give the traditional form, then the simplified one ("麵包 /面包" → "面包"; a word
 * the same in both is written once).
 */
export const lastScriptForm = (word: string) => word.split(" /").at(-1)!.trim();

/**
 * A source's terms with their native text rewritten by `convert` (traditional
 * Chinese characters → simplified ones), the English hints as they are: each word of a
 * sense once, each sense once.
 */
export function convertTerms(
  terms: Map<string, SourceTerm>,
  convert: (text: string) => string,
) {
  for (const item of terms.values()) {
    const senses: PairSense[] = [];
    for (const [pos, text, hint, target] of item.senses) {
      const converted = [...new Set(convert(text).split(", "))].join(", ");
      if (senses.some(([, other]) => other === converted)) continue;
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

/**
 * Merges the sources (in order of preference): each term comes whole from the first
 * source that has it, as [short, senses, source index]. A term that only points
 * (every sense of it a pointer: pt "used", "passado … do verbo use") comes whole from
 * the first later source that has a meaning for it (the tables' "usado,
 * acostumado"), and stays with its pointers when none has. Likewise a term of a closed
 * class that a source only describes (`describedOnly`: pl "the") comes whole from the
 * first later source that translates it in one of those parts of speech (a sense of
 * that part of speech that does not describe), and stays described when none does
 * (pl "a": the tables have only the letter's name).
 */
export function mergeSources(
  sources: { tag: string; terms: Map<string, SourceTerm> }[],
) {
  const dict: Record<string, [string, PairSense[], number]> = {};
  const counts: Record<string, number> = {};
  const described: string[] = [];
  const means = (senses: readonly PairSense[]) =>
    senses.some((sense) => !isPointerSense(sense));
  /** Whether `later` replaces `taken`, a term a former source gave. */
  const yields = (taken: readonly PairSense[], later: readonly PairSense[]) => {
    if (!means(taken)) return means(later);
    const described = describedOnly(taken);
    return (
      described !== undefined &&
      later.some(
        (sense) =>
          !isPointerSense(sense) &&
          described.has(sense[0]) &&
          !describing(sense),
      )
    );
  };
  sources.forEach(({ tag, terms }, index) => {
    counts[tag] = 0;
    for (const [key, { short, senses }] of terms) {
      if (Object.hasOwn(dict, key)) {
        const [, taken, from] = dict[key]!;
        if (!yields(taken, senses)) continue;
        counts[sources[from]!.tag]!--;
        if (means(taken)) described.push(key);
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
  };
}
