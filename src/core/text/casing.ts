/**
 * How one document (a video's caption track, an article's main content) writes letter
 * case: what rule D reads names from, and what tells a capitalised word on the page
 * (Japan, US) from the same word in lower case (japan, us). Language-independent; the
 * language pack says whether its language reads names from case at all.
 */
import { own } from "../util";
import { sentenceSegments } from "./sentences";
import { normalizeWord, type Token } from "./tokenize";

/**
 * "upper": most words are ALL CAPS (some captions); "lower": almost no word inside a
 * sentence is capitalised (speech recognition); "mixed": ordinary writing, the only
 * mode whose capitals say anything.
 */
type CaseMode = "upper" | "lower" | "mixed";

/** How a word is written: all lower case, capitalised, or ALL CAPS. */
type Written = "lower" | "capital" | "upper";

/** One word of a block of text, as the casing rules see it. */
export interface WordCase {
  /** The word as keys compare it, without a possessive 's ("Mark's" → "mark"). */
  key: string;
  /** Undefined for a word with digits, without letters, or of one letter ("I"). */
  written?: Written;
  /**
   * Its capital says nothing: it starts a sentence or a dialogue turn ("- Aww"),
   * follows a colon, a quote or a bracketed label ("[JOHN] Hi"), or the block reads
   * like a title ("Japan Unveils New Plan").
   */
  atStart: boolean;
  /** Inside brackets ([sighs], (Laughter)): not speech, no evidence. */
  label: boolean;
  /** ALL CAPS next to another ALL-CAPS word: shouting or a heading, not an acronym. */
  capsRun: boolean;
}

/**
 * The document's casing as the background classifies with it (`analyze`). In mixed
 * mode `words` has each word capitalised inside a sentence at least once, with how
 * often it is [capitalised inside a sentence, written in lower case]; it is empty in
 * the other modes. JSON-serializable.
 */
export interface DocumentCasing {
  mode: CaseMode;
  words: Readonly<
    Record<string, readonly [capitalised: number, lower: number]>
  >;
  /**
   * The document writes almost no commas (at least 50 words, fewer than one comma per 50): speech
   * recognition, where punctuation says nothing of where a phrase ends.
   */
  unpunctuated?: true;
  /**
   * In mixed mode, each word the document writes capitalised right after another
   * capitalised word, with only a space between them ("Specter" in "Harvey Specter"):
   * those words, sorted. Names read whole runs from it (`runName`).
   */
  runs?: Readonly<Record<string, readonly string[]>>;
}

const MODES: ReadonlySet<unknown> = new Set(["upper", "lower", "mixed"]);

/** A casing as a message carries it, or undefined when it is not one. */
export function readCasing(value: unknown): DocumentCasing | undefined {
  const { mode, words, unpunctuated, runs } = (value ?? {}) as Record<
    string,
    unknown
  >;
  if (!MODES.has(mode) || typeof words !== "object" || words === null)
    return undefined;
  if (unpunctuated !== undefined && unpunctuated !== true) return undefined;
  if (
    runs !== undefined &&
    (typeof runs !== "object" ||
      runs === null ||
      !Object.values(runs).every(
        (partners) =>
          Array.isArray(partners) &&
          partners.every((key) => typeof key === "string"),
      ))
  )
    return undefined;
  const counts = Object.values(words);
  if (
    !counts.every(
      (n) =>
        Array.isArray(n) &&
        n.length === 2 &&
        n.every((x) => typeof x === "number"),
    )
  )
    return undefined;
  return value as DocumentCasing;
}

/** What one block says about its document's casing; `documentCasing` adds blocks up. */
export interface BlockCasing {
  /** Words with letters (`written` set). */
  letters: number;
  upper: number;
  /** Words not at a start, and those of them written with a capital. */
  inner: number;
  capitalInner: number;
  /** Words capitalised inside a sentence (labels, ALL CAPS and plural acronyms aside). */
  capitalised: ReadonlyMap<string, number>;
  /** Words written in lower case (labels aside). */
  lower: ReadonlyMap<string, number>;
  /** Every word of the block, however written. */
  keys: ReadonlySet<string>;
  /** Word tokens, and commas. */
  words: number;
  commas: number;
  /** Each word capitalised right after a capitalised word: those words. */
  runs: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Share of ALL-CAPS words over which a document is "upper". */
const UPPER_SHARE = 0.6;
/** Share of capitalised words inside sentences under which a document is "lower". */
const LOWER_SHARE = 0.003;
/** Words per comma above which a document of at least that many words is `unpunctuated`. */
const WORDS_PER_COMMA = 50;
/** How much more often a word must be capitalised than not for a sentence start to count. */
const MOSTLY = 5;

/**
 * Breaks between two words that make the second one a start: sentence punctuation, a
 * colon, an opening quote, a closing bracket, a dash with a space beside it.
 */
const START_BREAK = /[.!?…:;)\]]|["“”]$|\s[-–—]|[-–—]\s/;

function writtenOf(text: string): Written | undefined {
  if (/\p{N}/u.test(text) || [...text.replace(/['’]/g, "")].length < 2)
    return undefined;
  if (/^\p{Ll}/u.test(text)) return "lower";
  if (!/^\p{Lu}/u.test(text)) return undefined;
  return text === text.toUpperCase() ? "upper" : "capital";
}

/**
 * A heading in Title Case: most of the block's longer words are capitalised, and it
 * does not end like a sentence ("Japan Unveils New Plan", not "Yesterday Mark met
 * Helen.").
 */
function titleLike(text: string, words: readonly Token[]) {
  const long = words.filter((w) => w.text.length >= 4);
  return (
    !/[.!?…]["”')\]]*\s*$/.test(text) &&
    long.length >= 3 &&
    long.filter((w) => /^\p{Lu}/u.test(w.text)).length / long.length >= 0.6
  );
}

/** Each word token of a block (in order) as the casing rules see it. */
export function wordCases(tokens: readonly Token[], lang: string): WordCase[] {
  const text = tokens.map((token) => token.text).join("");
  const words = tokens.filter((token) => token.isWord);
  // The first word of each sentence the segmenter finds.
  const firsts = new Set<number>();
  let next = 0;
  for (const { start } of sentenceSegments(text, lang)) {
    while (next < words.length && words[next]!.start < start) next++;
    firsts.add(next);
  }
  const title = titleLike(text, words);
  const upper = words.map((token) => writtenOf(token.text) === "upper");
  let depth = 0;
  return words.map((token, i) => {
    const between = text.slice(i === 0 ? 0 : words[i - 1]!.end, token.start);
    for (const ch of between)
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    const written = writtenOf(token.text);
    return {
      key: normalizeWord(token.text).replace(/'s$/, ""),
      ...(written !== undefined && { written }),
      atStart: title || firsts.has(i) || START_BREAK.test(between),
      label: depth > 0,
      capsRun: upper[i]! && (upper[i - 1] === true || upper[i + 1] === true),
    };
  });
}

const bump = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1);

/** A plural acronym ("AEDs"), whose capitals say nothing about a name. */
const pluralAcronym = (word: WordCase, text: string) =>
  /^\p{Lu}{2,}s$/u.test(text) && word.written === "capital";

/**
 * A capitalised word (not ALL CAPS, not inside brackets) as a run counts it: a name
 * written in Title Case ("Harvey", "Specter").
 */
const inRun = (word: WordCase, text: string) =>
  word.written === "capital" && !word.label && !pluralAcronym(word, text);

/**
 * The block's runs of capitalised words with only spaces between them, as each word's
 * predecessors: the words written right before it in a run, not at a start.
 */
function capitalRuns(tokens: readonly Token[], cases: readonly WordCase[]) {
  const runs = new Map<string, Set<string>>();
  /** The previous word, when it is capitalised and only spaces have come since. */
  let previous: string | undefined;
  let i = 0;
  for (const token of tokens) {
    if (!token.isWord) {
      if (!/^\s+$/.test(token.text)) previous = undefined;
      continue;
    }
    const word = cases[i++]!;
    const capital = inRun(word, token.text);
    if (capital && previous !== undefined && previous !== word.key) {
      let before = runs.get(word.key);
      if (!before) runs.set(word.key, (before = new Set()));
      before.add(previous);
    }
    // A capital at a start says nothing ("Yesterday Mark", "However Congress").
    previous = capital && !word.atStart ? word.key : undefined;
  }
  return runs;
}

/** What a block's words say about the document's casing. */
export function blockCasing(
  tokens: readonly Token[],
  lang: string,
): BlockCasing {
  const words = tokens.filter((token) => token.isWord);
  const cases = wordCases(tokens, lang);
  const text = tokens.map((token) => token.text).join("");
  const counts = {
    letters: 0,
    upper: 0,
    inner: 0,
    capitalInner: 0,
    capitalised: new Map<string, number>(),
    lower: new Map<string, number>(),
    keys: new Set(cases.map((word) => word.key)),
    words: words.length,
    commas: tokens.reduce(
      (n, token) =>
        token.isWord ? n : n + (token.text.match(/[,，、]/g)?.length ?? 0),
      0,
    ),
    runs: titleLike(text, words)
      ? new Map<string, Set<string>>()
      : capitalRuns(tokens, cases),
  };
  cases.forEach((word, i) => {
    if (word.written === undefined) return;
    counts.letters++;
    if (word.written === "upper") counts.upper++;
    if (!word.atStart) {
      counts.inner++;
      if (word.written !== "lower") counts.capitalInner++;
    }
    if (word.label) return;
    if (word.written === "lower") bump(counts.lower, word.key);
    else if (
      word.written === "capital" &&
      !word.atStart &&
      !pluralAcronym(word, words[i]!.text)
    )
      bump(counts.capitalised, word.key);
  });
  return counts;
}

/** The casing of a document made of `blocks`. */
export function documentCasing(blocks: Iterable<BlockCasing>): DocumentCasing {
  let letters = 0;
  let upper = 0;
  let inner = 0;
  let capitalInner = 0;
  let words = 0;
  let commas = 0;
  const capitalised = new Map<string, number>();
  const lower = new Map<string, number>();
  const runs = new Map<string, Set<string>>();
  for (const block of blocks) {
    for (const [key, partners] of block.runs) {
      let all = runs.get(key);
      if (!all) runs.set(key, (all = new Set()));
      for (const partner of partners) all.add(partner);
    }
    words += block.words;
    commas += block.commas;
    letters += block.letters;
    upper += block.upper;
    inner += block.inner;
    capitalInner += block.capitalInner;
    for (const [key, n] of block.capitalised)
      capitalised.set(key, (capitalised.get(key) ?? 0) + n);
    for (const [key, n] of block.lower)
      lower.set(key, (lower.get(key) ?? 0) + n);
  }
  const mode: CaseMode =
    upper > UPPER_SHARE * letters
      ? "upper"
      : capitalInner < LOWER_SHARE * inner || inner === 0
        ? "lower"
        : "mixed";
  const punctuation =
    words >= WORDS_PER_COMMA && commas * WORDS_PER_COMMA < words
      ? { unpunctuated: true as const }
      : {};
  if (mode !== "mixed") return { mode, words: {}, ...punctuation };
  return {
    mode,
    words: Object.fromEntries(
      [...capitalised].map(([key, n]) => [key, [n, lower.get(key) ?? 0]]),
    ),
    ...punctuation,
    ...(runs.size > 0 && {
      runs: Object.fromEntries(
        [...runs].map(([key, partners]) => [key, [...partners].sort()]),
      ),
    }),
  };
}

/**
 * The word is capitalised inside a sentence somewhere in the document and never
 * written in lower case there: rule D's evidence for a name.
 */
export function alwaysCapitalised(casing: DocumentCasing, key: string) {
  const counts = casing.mode === "mixed" ? own(casing.words, key) : undefined;
  return counts !== undefined && counts[0] > 0 && counts[1] === 0;
}

/**
 * The document writes the word capitalised far more often than in lower case, so a
 * capital at a sentence start is the word's own ("Japan is…").
 */
function mostlyCapitalised(casing: DocumentCasing, key: string) {
  const counts = casing.mode === "mixed" ? own(casing.words, key) : undefined;
  return counts !== undefined && counts[0] >= MOSTLY * counts[1];
}

/**
 * The word on the page is capitalised in a way that counts, so its capitalised
 * headword's senses come first (Japan → 日本, US → 合衆国): a mixed-case document,
 * not inside a label, and an acronym (ALL CAPS among words that are not), or a
 * capital inside a sentence or one the document writes that way.
 */
export function capitalHere(casing: DocumentCasing, word: WordCase) {
  if (casing.mode !== "mixed" || word.label) return false;
  if (word.written === "upper") return !word.capsRun;
  return (
    word.written === "capital" &&
    (!word.atStart || mostlyCapitalised(casing, word.key))
  );
}

/** Whether the word counts as capitalised (`capitalHere`) or as a name (`alwaysCapitalised`). */
const verdicts = (casing: DocumentCasing, key: string) =>
  `${alwaysCapitalised(casing, key)}${mostlyCapitalised(casing, key)}`;

/**
 * The words whose verdicts differ between two casings of a document, or "all" when
 * its mode changed: the blocks with them need classifying again.
 */
export function casingChanges(
  before: DocumentCasing,
  after: DocumentCasing,
): "all" | Set<string> {
  if (before.mode !== after.mode) return "all";
  const changed = new Set<string>();
  for (const key of new Set([
    ...Object.keys(before.words),
    ...Object.keys(after.words),
  ]))
    if (verdicts(before, key) !== verdicts(after, key)) changed.add(key);
  // Names read whole runs: a word whose predecessors changed, or one of whose
  // predecessors changed (down the run), may change with them.
  const runOf = (casing: DocumentCasing, key: string) =>
    (casing.runs && own(casing.runs, key)) ?? [];
  const keys = new Set([
    ...Object.keys(before.runs ?? {}),
    ...Object.keys(after.runs ?? {}),
  ]);
  for (const key of keys)
    if (runOf(before, key).join(" ") !== runOf(after, key).join(" "))
      changed.add(key);
  for (let grew = true; grew;) {
    grew = false;
    for (const key of keys)
      if (
        !changed.has(key) &&
        runOf(after, key).some((previous) => changed.has(previous))
      ) {
        changed.add(key);
        grew = true;
      }
  }
  return changed;
}
