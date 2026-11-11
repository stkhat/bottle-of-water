/**
 * Definitions to translate with the browser's translator (spec: language data, §5): an
 * English definition is cleaned before it is translated, and its cleaned text is the
 * key of the translation cache, so the background and the UI clean it the same way.
 */
import type { DictionaryEntry } from "./dictionary";

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
