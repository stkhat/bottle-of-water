// Senses of kaikki (English Wiktionary) entries as the data build reads them, and
// their ranking by the source's own labels (rule C2): usage notes, register labels
// (vulgar, dated, slang…), domain topics and regional labels move a sense down,
// translation-table sizes move it up. Every signal is the source's own structure;
// the only English pieces are the gloss patterns of usage notes and literal notes.
import { cleanDefinition } from "../../src/core/lexicon/definitions.ts";
import type { SenseLabel } from "../../src/core/lexicon/sense-labels.ts";
import type { KaikkiEntry, KaikkiSense, KaikkiTranslation } from "./common.ts";

/** Tags that make a sense unusable: kept by the source for history or as a mistake. */
const UNUSABLE_TAGS: ReadonlySet<string> = new Set([
  "obsolete",
  "archaic",
  "misspelling",
]);
/** Register and currency labels: the sense is real but not the one a learner meets first. */
const REGISTER: ReadonlySet<string> = new Set([
  ...["vulgar", "offensive", "derogatory", "slur", "dated", "rare"],
  ...["uncommon", "historical", "nonstandard", "dialectal", "humorous"],
  ...["euphemistic", "jargon", "literary", "poetic", "Internet", "slang"],
]);
/** Tags of inflected forms: such a form-of sense names a form, not a meaning. */
const INFLECTION: ReadonlySet<string> = new Set([
  ...["plural", "past", "participle", "present", "third-person"],
  ...["comparative", "superlative", "gerund"],
]);
/** A sense that is a usage note rather than a meaning ("Used to…", "Said of…"). */
export const USAGE_NOTE =
  /^(?:Used\b|Usually used\b|Often used\b|Chiefly used\b|Said\b)/;
/** A sense that only says the words are also meant literally ("see on, the"). */
export const LITERAL_NOTE = /^Used other than figuratively or idiomatically/;

/** One sense of an entry, as the data build reads it. */
export interface SourceSense {
  /** The entry's part of speech (kaikki's code: verb, noun, intj, prep_phrase…). */
  pos: string;
  /** The last (most specific) gloss. */
  gloss: string;
  tags: readonly string[];
  /** Domain topics (sports, nautical, computing…). */
  topics: readonly string[];
  /** Category names (phrasal verbs, idioms, non-constituents…). */
  categories: readonly string[];
  /** The term an alt-of / form-of sense names. */
  target?: string;
  /** The sense is an inflected form of its target (plural of, past of). */
  inflection: boolean;
  /** Languages its translation table has (its own, or the entry's table for its gloss). */
  tables: number;
  /** Japanese translations of this sense: [word, the table's English sense label]. */
  ja: readonly (readonly [word: string, label: string])[];
  /** Position in the source: entries in file order, senses in order. */
  order: number;
}

export const categoryNames = (
  categories: KaikkiEntry["categories"],
): string[] =>
  (categories ?? []).flatMap((category) => {
    const name = typeof category === "string" ? category : category?.name;
    return typeof name === "string" ? [name] : [];
  });

const lastGloss = (sense: KaikkiSense) => {
  const last: unknown = Array.isArray(sense.glosses)
    ? sense.glosses.at(-1)
    : undefined;
  return typeof last === "string" ? last.trim() : "";
};

const targetOf = (pointers: unknown) => {
  if (!Array.isArray(pointers)) return undefined;
  const word: unknown = (pointers[0] as { word?: unknown } | undefined)?.word;
  return typeof word === "string" && word.trim() ? word.trim() : undefined;
};

const languages = (translations: readonly KaikkiTranslation[] | undefined) =>
  new Set((translations ?? []).map((t) => t?.lang_code)).size;

function japanese(
  translations: readonly KaikkiTranslation[] | undefined,
  fallbackLabel: string,
): [string, string][] {
  const out: [string, string][] = [];
  for (const t of translations ?? []) {
    if (t?.lang_code !== "ja" || typeof t.word !== "string") continue;
    const word = t.word.trim();
    if (!word) continue;
    const label = typeof t.sense === "string" ? t.sense.trim() : "";
    out.push([word, label || fallbackLabel]);
  }
  return out;
}

/**
 * The share of a translation table's English sense label found in a gloss: tables
 * at entry level are labelled with a short paraphrase of the sense they translate.
 */
function labelMatch(label: string, gloss: string) {
  const words = label
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);
  if (words.length === 0) return 0;
  const lower = gloss.toLowerCase();
  return words.filter((word) => lower.includes(word)).length / words.length;
}

/** An entry-level table goes to the sense its label matches this well. */
const LABEL_MATCH = 0.6;

/**
 * The senses of an entry with a gloss, numbered from `order`: obsolete, archaic and
 * misspelt ones and literal notes left out. A table at entry level counts for the
 * sense its label matches, and its Japanese words go to that sense; those of a table
 * no sense's label matches are `looseJa`.
 */
export function entrySenses(
  entry: KaikkiEntry,
  order = 0,
): { senses: SourceSense[]; looseJa: [word: string, label: string][] } {
  const pos = typeof entry.pos === "string" ? entry.pos : "";
  const senses: SourceSense[] = [];
  for (const sense of entry.senses ?? []) {
    const gloss = lastGloss(sense);
    if (!gloss || LITERAL_NOTE.test(gloss)) continue;
    const tags = (sense.tags ?? []).filter((tag) => typeof tag === "string");
    if (tags.some((tag) => UNUSABLE_TAGS.has(tag))) continue;
    const target = targetOf(sense.alt_of) ?? targetOf(sense.form_of);
    senses.push({
      pos,
      gloss,
      tags,
      topics: (sense.topics ?? []).filter(
        (topic): topic is string => typeof topic === "string",
      ),
      categories: categoryNames(sense.categories),
      ...(target !== undefined && { target }),
      inflection:
        Array.isArray(sense.form_of) && tags.some((tag) => INFLECTION.has(tag)),
      tables: languages(sense.translations),
      ja: japanese(sense.translations, gloss),
      order: order + senses.length,
    });
  }
  // Entry-level tables, by sense label.
  const byLabel = new Map<string, KaikkiTranslation[]>();
  for (const t of entry.translations ?? []) {
    const label = typeof t?.sense === "string" ? t.sense.trim() : "";
    let list = byLabel.get(label);
    if (!list) byLabel.set(label, (list = []));
    list.push(t);
  }
  const looseJa: [string, string][] = [];
  for (const [label, list] of byLabel) {
    const matched = label
      ? senses.find((sense) => labelMatch(label, sense.gloss) >= LABEL_MATCH)
      : undefined;
    if (matched && matched.tables === 0) matched.tables = languages(list);
    const ja = japanese(list, label || (senses[0]?.gloss ?? ""));
    if (matched) matched.ja = [...matched.ja, ...ja];
    else looseJa.push(...ja);
  }
  return { senses, looseJa };
}

/** kaikki's parts of speech as the dictionaries' sense labels name them. */
const SENSE_LABELS: Readonly<Record<string, string>> = {
  verb: "verb",
  noun: "noun",
  name: "noun",
  adj: "adjective",
  adv: "adverb",
  intj: "interjection",
  particle: "particle",
  prep: "preposition",
  conj: "conjunction",
  det: "determiner",
  article: "article",
  pron: "pronoun",
  num: "numeral",
  prep_phrase: "prepositional phrase",
  phrase: "phrase",
};

/** A sense's label (`SenseLabel`) from its entry's part of speech in kaikki. */
export const senseLabelOf = (pos: string): SenseLabel =>
  Object.hasOwn(SENSE_LABELS, pos) ? { pos: SENSE_LABELS[pos]! } : {};

/** A sense that only names another term: an alt-of / form-of target, or a pointer gloss. */
export const isPointer = (sense: SourceSense) =>
  sense.target !== undefined || cleanDefinition(sense.gloss) === undefined;

/** Other capitalised tags than "Internet" are regions (US, UK, Australia). */
const isRegion = (tag: string) => /^[A-Z]/.test(tag) && tag !== "Internet";

/**
 * How marginal a sense's labels make it (0 for none): a usage note, a register label,
 * a pointer; for a multi-word term (`domains`) also a domain topic or a regional label.
 */
function labelPenalty(sense: SourceSense, domains: boolean) {
  let penalty = 0;
  if (USAGE_NOTE.test(sense.gloss)) penalty += 1;
  if (sense.tags.some((tag) => REGISTER.has(tag))) penalty += 1.5;
  if (domains && sense.topics.length > 0) penalty += 1.5;
  if (domains && sense.tags.some(isRegion)) penalty += 0.75;
  if (isPointer(sense)) penalty += 2;
  return penalty;
}

export interface RankedSense extends SourceSense {
  /** labelPenalty */
  labels: number;
}

/**
 * The senses of a term, best first (rule C2). For a multi-word term (`multiWord`),
 * part-of-speech blocks are ordered by their translation tables (the block the source
 * translates most first: "send out" as a verb before the noun), a bigger table lifts a
 * sense, and domain and regional labels count. A single word keeps its blocks in
 * source order and ranks by register labels, usage notes and pointers only: its first
 * sense is by convention its main one, and its topic is often that sense's field
 * (graph: mathematics). Ties keep the source order.
 */
export function rankSenses(
  senses: readonly SourceSense[],
  multiWord: boolean,
): RankedSense[] {
  const blocks = new Map<string, { tables: number; first: number }>();
  senses.forEach(({ pos, tables }, i) => {
    const block = blocks.get(pos) ?? { tables: 0, first: i };
    if (multiWord) block.tables += tables;
    blocks.set(pos, block);
  });
  const blockRank = new Map(
    [...blocks]
      .sort((a, b) => b[1].tables - a[1].tables || a[1].first - b[1].first)
      .map(([pos], i) => [pos, i]),
  );
  return senses
    .map((sense, i) => {
      const labels = labelPenalty(sense, multiWord);
      const lift = multiWord
        ? Math.min(1.5, 0.35 * Math.log2(1 + sense.tables))
        : 0;
      return {
        sense: { ...sense, labels },
        penalty: labels + 0.6 * blockRank.get(sense.pos)! - lift + 0.12 * i,
        i,
      };
    })
    .sort((a, b) => a.penalty - b.penalty || a.i - b.i)
    .map(({ sense }) => sense);
}
