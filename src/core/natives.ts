// The native languages: everything the extension does differently per native language,
// in one entry each (architecture.md "Adding a native language"). The data scripts
// (scripts/data/) import this file under plain Node: keep its imports type-only.
import type { MessageKey } from "../i18n/t";

export interface NativeLanguage {
  /** Its name as menus offer it ("Japanese (日本語)"). */
  readonly option: MessageKey;
  /** Its name in a sentence ("Japanese"). */
  readonly name: MessageKey;
  /**
   * Written with spaces between words and sentences (Latin, Cyrillic, Korean …): two
   * translated subtitle lines are joined with a space. Japanese, Chinese and Thai are not.
   */
  readonly spaces: boolean;
  /**
   * A dense script (Chinese characters, kana, hangul: a character is wide and says about
   * as much as a word), so a meaning line is capped at fewer characters.
   */
  readonly dense: boolean;
  /**
   * The Unicode scripts its words are written in (`\p{Script=…}`). In a language not
   * written in Latin letters, a meaning with no letter of its own script is no meaning
   * (en-zh "be" → "or implied", a translation table's parse artifact).
   */
  readonly scripts: readonly string[];
  /**
   * The meaning-in-context prompt's two example answers written in the language: "bank"
   * by a river (one of several dictionary meanings) and "spilled the beans" (an idiom
   * without an entry). Null: English's.
   */
  readonly examples: {
    readonly bank: string;
    readonly beans: string;
    /** "make up one's mind" (the phrase of a selection, `selectedNote`). */
    readonly mind: string;
  } | null;
  /**
   * English → this language is a pair pack (`en-<code>`) built by the language's recipe
   * (`scripts/data/recipes/native.ts`), read in this data format. Japanese (EJDict, its
   * own pack) and English (the English definitions) are built otherwise. 2: pointer
   * senses. 3: capitalised headwords in capital.json. 4: the short meaning stored only
   * where it is not its senses' (`shortOfPairSenses`, 2026-11-21).
   */
  readonly englishPair?: { readonly format: number };
  /**
   * The browser's translator translates English into it, so a word without a
   * human-made meaning shows its English definition translated: Chrome's Translator API
   * lists the language (developer.chrome.com/docs/ai/translator-api, "Supported
   * languages", 2025-05-20). Data about the feature, for the quality gate's token rule
   * (`scripts/data/gate.ts`); the extension detects the translator itself. Absent:
   * not listed (fa, ur), or English.
   */
  readonly translator?: true;
  /**
   * A word in the spelling that stands for its variants: two spellings a reader takes
   * for one word fold to the same one (Hindi: with or without the nukta, ख़बर and
   * खबर; a candrabindu or an anusvara, चाँद and चांद). Absent: none.
   */
  readonly spelling?: (word: string) => string;
  /**
   * Its meanings as Langle writes them, from the sources' text (the pair pack's build):
   * Arabic without tatweel and without the short-vowel marks the sources write on some
   * words and not others. Absent: as the sources write them.
   */
  readonly written?: (text: string) => string;
  /**
   * Written right to left (Arabic; Persian and Urdu too): its text is set right to left
   * and isolated from the English around it (`dir`, bidi isolation), so its punctuation
   * and the Latin labels inside it stay in place.
   */
  readonly rtl?: true;
}

/**
 * Devanagari as Hindi writes it in variants (`NativeLanguage.spelling`): without the
 * nukta (U+093C, ज़ → ज; precomposed क़ … य़ decompose to it) and with an anusvara for a
 * candrabindu (U+0901 → U+0902).
 */
export const devanagariSpelling = (word: string) =>
  word
    .normalize("NFD")
    .replace(/\u093c/gu, "")
    .replace(/\u0901/gu, "\u0902")
    .normalize("NFC");

/**
 * Arabic's harakat and other marks a reader may leave out (U+064B–U+065F: tanwin, the
 * short vowels, shadda, sukun …; U+0670, the dagger alef), and the tatweel (U+0640), a
 * stretch of the line between letters.
 */
const ARABIC_MARKS = /[\u064b-\u065f\u0670\u0640]/gu;

/**
 * Arabic as Langle writes it (`NativeLanguage.written`): without harakat and tatweel
 * (كَلْب → كلب; precomposed letters with a hamza or madda stay, أ, آ).
 */
export const arabicWritten = (text: string) =>
  text.normalize("NFC").replace(ARABIC_MARKS, "");

/**
 * Arabic in the spelling that stands for its variants (`NativeLanguage.spelling`): as
 * written (`arabicWritten`), with an alef that carries a hamza or a madda, or a wasla,
 * as a bare alef (أ إ آ ٱ → ا): writers leave the hamza off.
 */
export const arabicSpelling = (word: string) =>
  arabicWritten(word).replace(/[\u0622\u0623\u0625\u0671]/gu, "\u0627");

/**
 * The native languages, the default first. A pair is offered only once its dictionary
 * passes the quality gate (the lock's `pairs`).
 */
export const NATIVE_LANGUAGES = {
  ja: {
    option: "language.ja",
    name: "languageName.ja",
    spaces: false,
    dense: true,
    scripts: ["Han", "Hiragana", "Katakana"],
    translator: true,
    examples: { bank: "川岸、土手", beans: "秘密をばらす", mind: "決心する" },
  },
  es: {
    option: "language.es",
    name: "languageName.es",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: {
      bank: "orilla (de un río)",
      beans: "revelar el secreto",
      mind: "decidirse",
    },
    englishPair: { format: 4 },
  },
  pt: {
    option: "language.pt",
    name: "languageName.pt",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: {
      bank: "margem (de um rio)",
      beans: "revelar o segredo",
      mind: "decidir-se",
    },
    englishPair: { format: 4 },
  },
  // Chrome's Prompt API has no Russian (it answers in en, ja, es, de, fr): meaning in
  // context is unavailable, so no examples of its own.
  ru: {
    option: "language.ru",
    name: "languageName.ru",
    spaces: true,
    dense: false,
    scripts: ["Cyrillic"],
    translator: true,
    examples: null,
    englishPair: { format: 4 },
  },
  fr: {
    option: "language.fr",
    name: "languageName.fr",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: {
      bank: "rive (d'une rivière)",
      beans: "révéler le secret",
      mind: "se décider",
    },
    englishPair: { format: 4 },
  },
  de: {
    option: "language.de",
    name: "languageName.de",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: {
      bank: "Ufer (eines Flusses)",
      beans: "das Geheimnis verraten",
      mind: "sich entscheiden",
    },
    englishPair: { format: 4 },
  },
  // Simplified Chinese (the pack converts traditional characters at build time). Like
  // Japanese: no spaces, a dense script. Chrome's Prompt API has no Chinese, Italian
  // or Polish: meaning in context is unavailable, so no examples of their own.
  zh: {
    option: "language.zh",
    name: "languageName.zh",
    spaces: false,
    dense: true,
    scripts: ["Han"],
    translator: true,
    examples: null,
    englishPair: { format: 4 },
  },
  it: {
    option: "language.it",
    name: "languageName.it",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: null,
    englishPair: { format: 4 },
  },
  pl: {
    option: "language.pl",
    name: "languageName.pl",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: null,
    englishPair: { format: 4 },
  },
  // Thai writes no spaces between words (a space ends a phrase or a sentence), so two
  // subtitle lines join without one. Its letters are about as wide as Latin ones and a
  // word takes several (with vowel and tone marks above and below), so not dense.
  // Chrome's Prompt API decides by itself whether it answers in Thai (`availability`);
  // the examples are there for when it does.
  th: {
    option: "language.th",
    name: "languageName.th",
    spaces: false,
    dense: false,
    scripts: ["Thai"],
    translator: true,
    examples: {
      bank: "ตลิ่ง (ริมแม่น้ำ)",
      beans: "เปิดเผยความลับ",
      mind: "ตัดสินใจ",
    },
    englishPair: { format: 4 },
  },
  // Hindi, in Devanagari, writes spaces between words, so two subtitle lines join with
  // one. A word takes several letters (conjuncts, vowel signs above and below), about as
  // wide as Latin ones, so not dense. Chrome's Prompt API decides by itself whether it
  // answers in Hindi (`availability`); the examples are there for when it does.
  hi: {
    option: "language.hi",
    name: "languageName.hi",
    spaces: true,
    dense: false,
    scripts: ["Devanagari"],
    translator: true,
    examples: {
      bank: "किनारा (नदी का)",
      beans: "राज़ खोल देना",
      mind: "फ़ैसला करना",
    },
    englishPair: { format: 4 },
    spelling: devanagariSpelling,
  },
  // Arabic (Modern Standard Arabic, as the sources write it) writes spaces between
  // words, right to left. Its letters join but are about as wide as Latin ones, so not
  // dense. Chrome's Prompt API decides by itself whether it answers in Arabic
  // (`availability`); the examples are there for when it does.
  ar: {
    option: "language.ar",
    name: "languageName.ar",
    spaces: true,
    dense: false,
    scripts: ["Arabic"],
    translator: true,
    examples: {
      bank: "ضفة (النهر)",
      beans: "أفشى السر",
      mind: "قرر",
    },
    englishPair: { format: 4 },
    spelling: arabicSpelling,
    written: arabicWritten,
    rtl: true,
  },
  // Indonesian writes Latin letters with spaces between words, so two subtitle lines
  // join with one. Chrome's Prompt API decides by itself whether it answers in
  // Indonesian (`availability`); the examples are there for when it does.
  id: {
    option: "language.id",
    name: "languageName.id",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: {
      bank: "tepi (sungai)",
      beans: "membocorkan rahasia",
      mind: "memutuskan",
    },
    englishPair: { format: 4 },
  },
  // Turkish writes Latin letters with spaces between words, so two subtitle lines join
  // with one. Its dotted and dotless i (İ i, I ı) lower case as Turkish does
  // (`lowerFirst` in the data scripts). Chrome's Prompt API decides by itself whether it answers in
  // Turkish (`availability`); the examples are there for when it does.
  tr: {
    option: "language.tr",
    name: "languageName.tr",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    translator: true,
    examples: {
      bank: "kıyı (nehir)",
      beans: "ağzından kaçırmak",
      mind: "karar vermek",
    },
    englishPair: { format: 4 },
  },
  // Korean writes hangul with spaces between words, so two subtitle lines join with
  // one; a hangul syllable is a wide character, so its lines take the dense cap. Its
  // words are written in hangul alone (hanja only in brackets beside them), so a
  // meaning without hangul is none.
  ko: {
    option: "language.ko",
    name: "languageName.ko",
    spaces: true,
    dense: true,
    scripts: ["Hangul"],
    translator: true,
    examples: {
      bank: "강둑, 강기슭",
      beans: "비밀을 누설하다",
      mind: "결심하다",
    },
    englishPair: { format: 4 },
  },
  en: {
    option: "languageName.en",
    name: "languageName.en",
    spaces: true,
    dense: false,
    scripts: ["Latin"],
    examples: {
      bank: "riverbank",
      beans: "revealed the secret",
      mind: "decide",
    },
  },
} as const satisfies Readonly<Record<string, NativeLanguage>>;

type Natives = typeof NATIVE_LANGUAGES;

/** The native languages whose English pair pack a recipe builds ("es", "pt"). */
export type RecipeNative = {
  [N in keyof Natives]: Natives[N] extends { englishPair: object } ? N : never;
}[keyof Natives];

/** The pair packs the recipes build ("en-es"). */
export type RecipePairPack = `en-${RecipeNative}`;

/** A native language's entry; undefined for a language that is not one. */
export const nativeLanguage = (code: string): NativeLanguage | undefined =>
  Object.hasOwn(NATIVE_LANGUAGES, code)
    ? NATIVE_LANGUAGES[code as keyof Natives]
    : undefined;

/** `lang` (a code, "ar" or "ar-EG") is written right to left (`NativeLanguage.rtl`). */
export const writtenRightToLeft = (lang: string) =>
  nativeLanguage(lang.split("-")[0]!)?.rtl === true;

/**
 * `text` in `lang` set inside a line of English (the card's "figure — …"): a language
 * written right to left (`NativeLanguage.rtl`) between a right-to-left isolate (U+2067)
 * and its end (U+2069), so its punctuation and an ellipsis stay at its own end. Text
 * in other languages as it is.
 */
export const bidiIsolated = (text: string, lang: string) =>
  writtenRightToLeft(lang) ? `\u2067${text}\u2069` : text;

/** The native languages whose English pair pack a recipe builds, in registry order. */
export const recipeNatives = () =>
  (Object.keys(NATIVE_LANGUAGES) as (keyof Natives)[]).filter(
    (code): code is RecipeNative =>
      (NATIVE_LANGUAGES[code] as NativeLanguage).englishPair !== undefined,
  );
