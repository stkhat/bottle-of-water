// Open Multilingual Wordnet (OMW 1.4) as a recipe source: a native language's wordnet
// gives the English terms its lemmas through WordNet's synsets, which the English
// wordnet (omw-en, WordNet 3.0) links to the pack's term keys. Both are WN-LMF XML
// files (data/raw/omw/omw-1.4/omw-<lang>/omw-<lang>.xml). See docs/specs/architecture.md
// "Native meanings and the quality gate".
import { readFileSync } from "node:fs";
import { shortOfDefinition } from "../../../src/core/lexicon/short-lines.ts";
import { addSense, finish, type SourceTerm, type TermKey } from "./recipe.ts";

/** Native lemmas kept per synset, like the translation tables' words per sense. */
const MAX_WORDS = 3;

interface WordnetSense {
  id: string;
  synset: string;
  /** How often the sense was tagged in WordNet's corpus (English only). */
  count: number;
}
interface WordnetEntry {
  lemma: string;
  pos: string;
  /** In the wordnet's order, which for WordNet is most frequent first. */
  senses: WordnetSense[];
}
interface WordnetSynset {
  /** Its senses' ids, in the wordnet's order. */
  members: string[];
  definition?: string;
}
export interface Wordnet {
  entries: WordnetEntry[];
  synsets: Map<string, WordnetSynset>;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
};
const decode = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, name: string) =>
    name.startsWith("#x") || name.startsWith("#X")
      ? String.fromCodePoint(parseInt(name.slice(2), 16))
      : name.startsWith("#")
        ? String.fromCodePoint(Number(name.slice(1)))
        : (ENTITIES[name] ?? whole),
  );

const attributes = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, name, value]) => [
      name!,
      decode(value!),
    ]),
  );

/**
 * A WN-LMF wordnet: its lexical entries (lemma, part of speech, senses in order) and
 * its synsets (members, the first definition). Everything else is skipped.
 */
export function parseWordnet(xml: string): Wordnet {
  const entries: WordnetEntry[] = [];
  const synsets = new Map<string, WordnetSynset>();
  let entry: WordnetEntry | undefined;
  let sense: WordnetSense | undefined;
  let synset: WordnetSynset | undefined;
  const tags =
    /<(\/?)(LexicalEntry|Lemma|Sense|Count|Synset|Definition)\b([^>]*?)(\/?)>/g;
  for (const match of xml.matchAll(tags)) {
    const [, closing, name, attrs = "", selfClosing] = match;
    // The element's text, up to the next tag.
    const after = () => {
      const start = match.index + match[0].length;
      return decode(xml.slice(start, xml.indexOf("<", start)));
    };
    if (closing) {
      if (name === "LexicalEntry" && entry) entries.push(entry);
      if (name === "LexicalEntry") entry = undefined;
      if (name === "Sense") sense = undefined;
      if (name === "Synset") synset = undefined;
      continue;
    }
    const a = attributes(attrs);
    switch (name) {
      case "LexicalEntry":
        entry = { lemma: "", pos: "", senses: [] };
        break;
      case "Lemma":
        if (entry) {
          entry.lemma = a.writtenForm ?? "";
          entry.pos = a.partOfSpeech ?? "";
        }
        break;
      case "Sense":
        if (!entry || !a.id || !a.synset) break;
        entry.senses.push({ id: a.id, synset: a.synset, count: 0 });
        sense = selfClosing ? undefined : entry.senses.at(-1);
        break;
      case "Count":
        if (sense) sense.count += Number(after().trim()) || 0;
        break;
      case "Synset":
        if (!a.id) break;
        synsets.set(a.id, {
          members: (a.members ?? "").split(/\s+/).filter(Boolean),
        });
        synset = selfClosing ? undefined : synsets.get(a.id);
        break;
      case "Definition":
        if (synset && synset.definition === undefined)
          synset.definition = after().trim();
        break;
    }
  }
  return { entries, synsets };
}

/** A wordnet file, read whole (omw-en, the largest, is 111 MB). */
export const readWordnet = (path: string) =>
  parseWordnet(readFileSync(path, "utf8"));

/**
 * The language-independent part of a synset's id ("omw-it-09213565-n" →
 * "09213565-a"): WordNet 3.0's offset and part of speech, satellite adjectives ("s")
 * counted as adjectives as the other wordnets write them.
 */
export function synsetKey(id: string) {
  const match = /-(\d{8})-([nvasr])$/.exec(id);
  if (!match) return undefined;
  return `${match[1]}-${match[2] === "s" ? "a" : match[2]}`;
}

const POS_LABELS: Readonly<Record<string, string>> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
};

/**
 * A wordnet's written form as a lemma to show, or undefined when it is none: a "+"
 * join is closed up ("呼吸+する" → "呼吸する"), notes in brackets and underscores
 * are dropped; what is left must be a word or words (letters, with digits, inner
 * apostrophes, hyphens, periods) with at least one letter, not a list, a description
 * with commas, a marker ("GAP!"), an acronym (capitals and no other letters: "V",
 * "A.F.") or a symbol (one letter of a cased script: "s" for a second; a single
 * Chinese character is a word).
 */
export function lemmaOf(written: string): string | undefined {
  const text = written
    .replace(/\s*\+\s*/g, "")
    .replace(/\([^()]*\)|\[[^[\]]*\]|（[^（）]*）|【[^【】]*】/g, " ")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "");
  if (!/\p{L}/u.test(text)) return undefined;
  if (/[^\p{L}\p{M}\p{N}\s'’.·-]/u.test(text)) return undefined;
  // An acronym: capitals and no other letters ("B电池", a battery, is a word).
  if (/\p{Lu}/u.test(text) && !/[\p{Ll}\p{Lo}]/u.test(text)) return undefined;
  if (/^[\p{Lu}\p{Ll}]\.?$/u.test(text)) return undefined;
  return text;
}

/**
 * Each synset's lemmas (by `synsetKey`), most used first: a lemma that names more
 * synsets in the wordnet comes first (common words have many senses; rare, archaic or
 * descriptive lemmas few), then the wordnet's own order. At most MAX_WORDS each.
 */
export function synsetLemmas(native: Wordnet) {
  const lemmaOfSense = new Map<string, string>();
  const synsetsOf = new Map<string, Set<string>>();
  for (const entry of native.entries) {
    const lemma = lemmaOf(entry.lemma);
    if (!lemma) continue;
    let set = synsetsOf.get(lemma);
    if (!set) synsetsOf.set(lemma, (set = new Set()));
    for (const sense of entry.senses) {
      lemmaOfSense.set(sense.id, lemma);
      set.add(sense.synset);
    }
  }
  const lemmas = new Map<string, string[]>();
  for (const [id, synset] of native.synsets) {
    const key = synsetKey(id);
    if (!key) continue;
    const members = [
      ...new Set(
        synset.members.flatMap((member) => lemmaOfSense.get(member) ?? []),
      ),
    ];
    const order = new Map(members.map((lemma, i) => [lemma, i]));
    const ranked = members
      .sort(
        (a, b) =>
          synsetsOf.get(b)!.size - synsetsOf.get(a)!.size ||
          order.get(a)! - order.get(b)!,
      )
      .slice(0, MAX_WORDS);
    if (ranked.length > 0) lemmas.set(key, ranked);
  }
  return lemmas;
}

interface TermSense {
  synset: string;
  pos: string;
  /** Its place among the term's senses of that part of speech (0: the main one). */
  rank: number;
}

/**
 * Each term key's senses in the English wordnet, main senses first: each part of
 * speech's first sense, then each one's second, and so on (WordNet orders a lemma's
 * senses by frequency), the parts of speech the most frequent first (by WordNet's
 * tagged counts, then as they come).
 */
export function englishSenses(english: Wordnet, termKey: TermKey) {
  const byKey = new Map<
    string,
    { senses: TermSense[]; counts: Map<string, number> }
  >();
  for (const entry of english.entries) {
    const key = termKey(entry.lemma.replaceAll("_", " "));
    if (!key) continue;
    let item = byKey.get(key);
    if (!item) byKey.set(key, (item = { senses: [], counts: new Map() }));
    const pos = POS_LABELS[entry.pos] ?? entry.pos;
    entry.senses.forEach((sense, rank) => {
      item.senses.push({ synset: sense.synset, pos, rank });
      item.counts.set(pos, (item.counts.get(pos) ?? 0) + sense.count);
    });
  }
  const senses = new Map<string, TermSense[]>();
  for (const [key, { senses: list, counts }] of byKey) {
    const posOrder = [...counts.keys()].sort(
      (a, b) => counts.get(b)! - counts.get(a)!,
    );
    senses.set(
      key,
      list.sort(
        (a, b) =>
          a.rank - b.rank || posOrder.indexOf(a.pos) - posOrder.indexOf(b.pos),
      ),
    );
  }
  return senses;
}

/**
 * A native wordnet's meanings of the English terms: per sense of the term (main senses
 * first, `englishSenses`) whose synset has native lemmas, its lemmas (`synsetLemmas`)
 * with the sense's part of speech and the synset's English definition as the hint, at
 * most MAX_SENSES senses like the translation tables. A term whose main senses (each
 * part of speech's first) all lack native lemmas is left out: its meaning would be a
 * lesser sense ("realise" → "fare", to earn).
 */
export function readWordnetMeanings({
  english,
  native,
  termKey,
  fits = () => true,
}: {
  english: Wordnet;
  native: Wordnet;
  termKey: TermKey;
  /** Whether a synset's part of speech is one the English word has (`fitsEnglishPos`). */
  fits?: (key: string, pos: string) => boolean;
}) {
  const lemmas = synsetLemmas(native);
  const terms = new Map<string, SourceTerm>();
  for (const [key, senses] of englishSenses(english, termKey)) {
    const item: SourceTerm = { short: "", senses: [] };
    for (const { synset, pos, rank } of senses) {
      // A synset of a part of speech the word is not used as is another word's sense
      // (yeah's only synset is the adverb yea, "not only so, but": id tapi).
      if (!fits(key, pos)) continue;
      const synsetKeyOf = synsetKey(synset);
      const words = synsetKeyOf ? lemmas.get(synsetKeyOf) : undefined;
      // The main senses come first: none with lemmas leaves the term out.
      if (rank > 0 && item.senses.length === 0) break;
      if (!words) continue;
      const definition = english.synsets.get(synset)?.definition;
      const text = words.join(", ");
      addSense(
        item,
        definition ? [pos, text, shortOfDefinition(definition)] : [pos, text],
      );
    }
    terms.set(key, item);
  }
  return finish(terms, (text) => text.split(", ")[0]!);
}
