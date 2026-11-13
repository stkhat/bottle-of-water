/**
 * Definitions to translate with the browser's translator (architecture.md: "Definitions translated at display time"): an
 * English definition is cleaned before it is translated, and its cleaned text is the
 * key of the translation cache, so the background and the UI clean it the same way.
 */
/*
 * The data scripts import this file under plain Node: it has no value imports.
 */
import type { DictionaryEntry } from "./dictionary";
import type { Pointer } from "./short-lines";

/** The dictionary window translates up to this many senses (the hover card: the short meaning). */
export const MAX_TRANSLATED_SENSES = 4;

/** A leading group in parentheses and the text after it. */
const LEADING_GROUP = /^\(([^()]*)\)\s*/;

/**
 * A context that says what the sense applies to: "(of rain)", "(chiefly of time)",
 * "(+ de)". It is part of the meaning, so it stays and is translated with the rest.
 */
const CONTEXT =
  /^(?:\+|(?:(?:especially|chiefly|mainly|mostly|usually|typically|often|sometimes|generally)\s+)?(?:of|for|with|in|by)\b)/i;

/** How other labels start: "(chiefly British)", "(figuratively)". */
const LABEL_START =
  /^(?:especially|chiefly|mainly|mostly|usually|typically|often|sometimes|generally|figuratively|used|not in)\b/i;

/** Labels that stand alone or in a list: "(idiomatic, informal)", "(UK, Canada)". */
const LABEL_WORDS: ReadonlySet<string> = new Set([
  ...["idiomatic", "informal", "formal", "slang", "colloquial", "humorous"],
  ...["dated", "archaic", "obsolete", "rare", "vulgar", "derogatory"],
  ...["offensive", "pejorative", "euphemistic", "literary", "poetic"],
  ...["figurative", "literal", "literally", "nonstandard", "regional"],
  ...["dialectal", "transitive", "intransitive", "ambitransitive"],
  ...["ditransitive", "reflexive", "pronominal", "countable", "uncountable"],
  ...["comparable", "not comparable", "plural", "singular", "by extension"],
  ...["originally", "rhetorical question", "sports", "football", "nautical"],
  ...["military", "business", "industrial", "computing", "law", "medicine"],
  ...["uk", "us", "usa", "au", "nz", "canada", "australia", "ireland"],
  ...["scotland", "india", "british", "american", "commonwealth"],
  ...["latin america", "spain", "mexico"],
]);

/**
 * Whether a leading group is a label rather than part of the definition. A context
 * ("(of rain)") is never one. A label is followed by a capital letter ("(sports) To
 * force…"), starts like a label ("(chiefly British)") or is a list of known labels;
 * "(not) in the slightest" and "(Someone or something) is gone" are kept, since
 * dropping them would change the meaning.
 */
function isLabel(group: string, rest: string): boolean {
  const label = group.trim();
  if (CONTEXT.test(label)) return false;
  if (/^\p{Lu}/u.test(rest)) return true;
  if (LABEL_START.test(label)) return true;
  return label
    .split(/\s*,\s*|\s+and\s+/)
    .every((part) => LABEL_WORDS.has(part.toLowerCase()));
}

function withoutLabels(text: string): string {
  let rest = text.trim();
  for (;;) {
    const match = LEADING_GROUP.exec(rest);
    if (!match) return rest;
    const after = rest.slice(match[0].length);
    if (!isLabel(match[1]!, after)) return rest;
    rest = after;
  }
}

const words = (list: readonly string[]) => list.join("|");

/** Words of inflected forms: "third-person singular simple present indicative of". */
const GRAMMAR = words([
  ...["singular", "plural", "simple", "present", "past", "future"],
  ...["participle", "indicative", "subjunctive", "imperative", "conditional"],
  ...["preterite", "imperfect", "perfect", "pluperfect", "infinitive"],
  ...["gerund", "first-person", "second-person", "third-person", "tuteo"],
  ...["voseo", "comparative", "superlative", "feminine", "masculine"],
  ...["neuter"],
]);
/** Words that may come between them: "comparative degree of", "past tense of". */
const GRAMMAR_MORE = `${GRAMMAR}|and|or|form|tense|degree`;

/** What a variant or a spelling is called: "eye dialect spelling of", "UK standard spelling of". */
const QUALIFIER = words([
  ...["alternative", "alternate", "archaic", "obsolete", "dated", "rare"],
  ...["nonstandard", "non-standard", "informal", "colloquial", "dialectal"],
  ...["dialect", "eye", "pronunciation", "apheretic", "aphetic", "syncopic"],
  ...["syncopated", "unadapted", "disused", "accented", "unaccented"],
  ...["censored", "humorous", "minced", "elaborated", "emphatic", "intensive"],
  ...["more", "partial", "declined", "euphemistic", "usual", "common"],
  ...["standard", "higher", "lower", "register", "short", "shortened"],
  ...["uk", "us", "british", "american", "canadian", "australian", "irish"],
  ...["scottish", "commonwealth", "english", "ireland", "and", "or"],
]);
/** Pointers that need no qualifier: "Synonym of …", "Misspelling of …". */
const POINTER_NOUN = words([
  ...["spelling", "misspelling", "variant", "synonym", "abbreviation"],
  ...["initialism", "acronym", "clipping", "ellipsis", "contraction"],
  ...["euphemism", "eggcorn", "romanization", "diminutive", "augmentative"],
  ...["pejorative"],
]);

/**
 * Senses that only point to another term. Translated, the term they name would come
 * out word by word ("Synonym of spill the beans"), so they are shown as written.
 * "A form of torture…" and "A variant of the game of darts…" are definitions: with an
 * article, a pointer needs a qualifier ("An intensive form of …").
 */
const POINTERS: readonly RegExp[] = [
  new RegExp(`^(?:${GRAMMAR})\\s+(?:(?:${GRAMMAR_MORE})\\s+)*of\\b`, "i"),
  new RegExp(
    `^(?:(?:${QUALIFIER})\\s+)*(?:${POINTER_NOUN})\\s+(?:of|for)\\b`,
    "i",
  ),
  new RegExp(`^(?:(?:${QUALIFIER})\\s+)+form\\s+of\\b`, "i"),
  new RegExp(
    `^an?\\s+(?:(?:${QUALIFIER})\\s+)+(?:${POINTER_NOUN}|form)\\s+(?:of|for)\\b`,
    "i",
  ),
  /^short\s+for\b/i,
  /^(?:only|chiefly|mostly|usually)\s+(?:used|found)\s+in\b/i,
];

/**
 * An English sense that only points to another term, with that term when it names
 * one alone ("Synonym of look for" → reference to "look for"; "Plural of mouse." →
 * form of "mouse"). An inflection is a form; synonyms, variants and the rest are
 * references. A pointer that glosses its term names one of its senses ("Synonym of
 * deal with (“to behave in a certain way towards”)"): it has no target, since the
 * term's own first senses may be others. A pointer followed by a definition of its own
 * ("Synonym of X: to annoy") is not one.
 */
export function definitionPointer(text: string): Pointer | undefined {
  const cleaned = withoutLabels(text);
  for (const [i, pointer] of POINTERS.entries()) {
    const match = pointer.exec(cleaned);
    if (!match) continue;
    const rest = cleaned.slice(match[0].length).replace(/\.\s*$/, "");
    if (rest.includes(":")) return undefined;
    const kind = i === 0 ? "form" : "reference";
    // One term, as a key (short-lines' pointerTarget).
    const term = rest.trim().toLowerCase().replace(/\s+/g, " ");
    const target = /[(“",;]/.test(rest) || term === "" ? undefined : term;
    return target === undefined ? { kind } : { kind, target };
  }
  return undefined;
}

/** A definition that says how an expression is used: "Used to…", "Said when…". */
const USED =
  /^(?:(?:usually|often|chiefly|mostly|also|sometimes)\s+)?(?:used|said|uttered)\b/i;
/**
 * …or describes it as a figure of speech rather than meaning it: "An apophasis used by
 * a speaker to introduce…", "A rhetorical question…". An interjection's "An expression
 * of surprise" is its meaning, and "the speaker" alone is part of many ("there": away
 * from the speaker).
 */
const DESCRIBES = /\b(?:figure of speech|apophasis|rhetorical)\b/i;

/**
 * Parts of speech (as the dictionaries label senses) whose definitions name a thing or
 * a quality: a noun's "A question word…" or "An umbrella term…" is its meaning. The
 * data build's kaikki codes for them are `ENGLISH_PHRASES.nominal`.
 */
export const NOMINAL_POS: ReadonlySet<string> = new Set([
  "noun",
  "proper noun",
  "adjective",
]);

/** A word of a gloss's head noun phrase. */
const WORD = "[\\p{L}'’-]+";
/**
 * Words that cannot be part of a head noun phrase (articles, forms of be and have,
 * pronouns, "to", "as"): "Not being used", "As said before", "What you said", "To
 * plant a hedge" start a meaning, not a name for the expression.
 */
const NOT_HEAD = `(?!(?:${words([
  ...["a", "an", "the", "to", "be", "being", "been", "is", "are", "was"],
  ...["were", "has", "have", "had", "i", "you", "he", "she", "it", "we"],
  ...["they", "as"],
])})\\b)`;
/** A modifier or the noun of a head noun phrase: "mild", "honorific phrase". */
const HEAD_WORD = `${NOT_HEAD}${WORD}\\s+`;
/** A modifier of a class noun: "mild", "informal"; not "of" ("An exclamation of greeting"). */
const MODIFIER = `(?!of\\b)${HEAD_WORD}`;

/**
 * What may follow "used", "said" or "uttered" when it ends a head noun phrase (a reduced
 * relative clause: "A phrase used at parting"): a preposition or conjunction, an
 * adverb in -ly, punctuation or the end. "The act of performing said technique" uses
 * "said" as an adjective.
 */
const COMPLEMENT = `(?=\\s+(?:${words([
  ...["to", "when", "as", "by", "in", "at", "for", "before", "after", "upon"],
  ...["on", "while", "during", "between", "with", "of", "near", "from", "if"],
  ...["among", "around", "about", "towards", "toward", "against", "where"],
  ...["within", "without", "instead", "until", "once", "whenever", "mostly"],
])}|\\p{L}+ly)\\b|\\s*[.,;:(]|\\s*$)`;

/**
 * Head nouns that name a class of expressions by what it does in speech, not what it
 * means: the source's own categories of English terms by discourse function (English
 * intensifiers, filled pauses, hedges, greetings, farewells) and the words its glosses
 * use for the same classes (filler, discourse marker).
 */
const FUNCTION_CLASS = words([
  ...["intensifier", "filler", "filled pause", "hedge", "discourse marker"],
  ...["greeting", "farewell"],
]).replaceAll(" ", "\\s+");

/**
 * Definitions that name what the expression is or does instead of meaning it (NATIVE:
 * English glosses). Applied to a sense that is not nominal only.
 */
const NAMES_FUNCTION: readonly RegExp[] = [
  // A reduced relative after a head noun phrase: "A phrase used at parting", "A greeting
  // said at noon", "Expletive used for emphasis", "A title of respect used when…".
  new RegExp(
    `^(?:(?:an?|the)\\s+)?(?:${HEAD_WORD}){1,3}?(?:\\p{L}+ly\\s+)?(?:used|said|uttered)${COMPLEMENT}`,
    "iu",
  ),
  // A function class or a signal as the head, after an article or a modifier: "A mild
  // intensifier", "A delaying filler", "An informal greeting", "An indication of
  // uncertainty", "Space filler or pause". A bare "Farewell." is the interjection
  // itself, and "An exclamation of greeting" says what it expresses, as "An expression
  // of surprise" does.
  new RegExp(
    `^(?:(?:an?)\\s+(?:${MODIFIER}){0,2}?|(?:${MODIFIER}){1,2}?)(?:(?:${FUNCTION_CLASS})s?\\b|indications?\\s+(?:of|that)\\b)`,
    "iu",
  ),
  // A role: "Serves as an intensifier…", "Functions as a hedge".
  /^(?:serves|functions)\s+as\b/i,
];

/**
 * A usage note: a definition that describes how the expression is used instead of
 * saying what it means ("Used to express surprise", "An apophasis used by a speaker to
 * introduce…"). Translated, it reads as an explanation, not a meaning. A note that
 * the words are also meant literally ("Used other than figuratively…") is one too.
 * For a sense of a part of speech (`pos`, as the dictionaries label it) that is not
 * nominal, so is a definition that only names the expression's function ("A mild
 * intensifier", "A delaying filler", "An indication of uncertainty", "A phrase used at
 * parting"); a noun's or an adjective's ("A question word…") is its meaning. An
 * interjection's "An expression of surprise" is its meaning too.
 */
export function isUsageNote(text: string, pos?: string): boolean {
  const cleaned = withoutLabels(text);
  if (USED.test(cleaned) || DESCRIBES.test(cleaned)) return true;
  return (
    pos !== undefined &&
    !NOMINAL_POS.has(pos) &&
    // A pointer ("Only used in lie doggo") is shown as written.
    !POINTERS.some((pointer) => pointer.test(cleaned)) &&
    NAMES_FUNCTION.some((pattern) => pattern.test(cleaned))
  );
}

/**
 * Whether an entry's short meaning is a usage note (`isUsageNote`). A phrase's is read
 * with the part of speech of the sense it was cut from (the first sense that starts
 * with it, else the first: the short meaning is the first sense up to its first ";"),
 * so a name for its function counts ("A mild intensifier"). A word's does not: its
 * literal translation would be the word itself ("gonna"), and its first sense is by
 * convention its main one.
 */
export function isUsageNoteShort({
  kind,
  short,
  senses,
}: {
  kind: "word" | "phrase";
  short: string;
  senses: readonly { pos?: string; text: string }[];
}): boolean {
  if (kind !== "phrase") return isUsageNote(short);
  const head = withoutLabels(short);
  const sense =
    senses.find((sense) => withoutLabels(sense.text).startsWith(head)) ??
    senses[0];
  return isUsageNote(short, sense?.pos);
}

/**
 * The English definition as it is translated: trimmed, without leading labels
 * ("(idiomatic, informal) To reveal a secret." → "To reveal a secret."). A pointer
 * sense ("Alternative form of …", "Synonym of …", "Plural of …") gives undefined, unless
 * a colon follows with a definition of its own ("Synonym of get someone's back up: to
 * annoy someone." → "to annoy someone."). Nothing left gives undefined too.
 */
export function cleanDefinition(text: string): string | undefined {
  const cleaned = withoutLabels(text);
  for (const pointer of POINTERS) {
    const match = pointer.exec(cleaned);
    if (!match) continue;
    const colon = cleaned.indexOf(":", match[0].length);
    return colon === -1 ? undefined : cleanDefinition(cleaned.slice(colon + 1));
  }
  // Nothing but a context ("(of a person)") is not a definition.
  const only = /^\(([^()]*)\)$/.exec(cleaned)?.[1];
  return cleaned === "" || (only !== undefined && CONTEXT.test(only.trim()))
    ? undefined
    : cleaned;
}

/**
 * The cleaned texts of an entry that are translated: its short meaning and its first
 * senses (`MAX_TRANSLATED_SENSES`), each once, pointers left out.
 */
export function definitionTexts(
  entry: Pick<DictionaryEntry, "short" | "senses">,
): string[] {
  const texts = [
    entry.short,
    ...entry.senses.slice(0, MAX_TRANSLATED_SENSES).map((sense) => sense.text),
  ].map(cleanDefinition);
  return [...new Set(texts.filter((text) => text !== undefined))];
}
