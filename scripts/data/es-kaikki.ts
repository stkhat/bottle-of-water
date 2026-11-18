// kaikki.org Spanish Wiktionary extract (CC BY-SA), the Spanish frequency list and the
// UD Spanish treebanks' lemmas → data/packs/es/{freq,vocab,lemmas,ipa,pos,phrases}.json
// and data/packs/es-en/{index,dict-<n>}.json (then run npm run data:publish)
// Usage: node scripts/data/es-kaikki.ts [path]   (default data/raw/kaikki-es.jsonl; run es-frequency.ts first)
import { join } from "node:path";
import { singleIpa } from "../../src/core/lexicon/ipa.ts";
import { shortOfDefinition } from "../../src/core/lexicon/short-lines.ts";
import type { DefsPack } from "../../src/core/packs/types.ts";
import { SPANISH_RULES } from "../../src/core/phrases/es.ts";
import {
  byCodeUnit,
  PACKS_DIR,
  eachEntry,
  posLabel,
  RAW_DIR,
  writeShards,
  writePack,
  type KaikkiEntry,
  type KaikkiSense,
} from "./common.ts";
import { ES_FORMS, frequencyForms, readEsFrequency } from "./es-frequency.ts";
import { treebankLemmas, type LemmaCounts } from "./es-tagger.ts";
import { buildFrequency } from "./frequency.ts";
import { glossOf, isNonConstituent, isUsable } from "./phrases.ts";

const KAIKKI_ES_PATH = join(RAW_DIR, "kaikki-es.jsonl");
/** kaikki parts of speech whose entries are phrases. */
const PHRASE_POS: ReadonlySet<string> = new Set(["phrase", "prep_phrase"]);
/**
 * A phrase or prepositional-phrase entry counts only when a literal word is rarer than
 * this rank ("de la" does not). English decides by its idiomaticity score instead
 * (`idiomaticity.ts`); Spanish keeps the rank rule until its example corpus is larger.
 */
const PHRASE_COMMON_RANK = 1000;

/** The rank of a word as its most common base when it is not a vocabulary word. */
function rankOfWord(
  ranks: ReadonlyMap<string, number>,
  vocab: ReadonlySet<string>,
  lemmas: Readonly<Record<string, string | readonly string[]>>,
) {
  return (word: string) =>
    ranks.get(word) ??
    (vocab.has(word)
      ? Infinity
      : Math.min(
          ...[Object.hasOwn(lemmas, word) ? lemmas[word]! : []]
            .flat()
            .map((b) => ranks.get(b) ?? Infinity),
        ));
}
/** Wiktionary's slot words ("tomar el pelo a alguien"). */
const SLOT_WORDS: ReadonlySet<string> = new Set(SPANISH_RULES.slots.keys());
const WORD = /^\p{L}+$/u;
const FREQ_TOP = 30000;
const MAX_SENSES = 6;
// Form-of senses that do not make the form an inflection of the word they point to.
const IGNORED_FORM_TAGS = new Set([
  "obsolete",
  "archaic",
  "misspelling",
  "nonstandard",
  "pronunciation-spelling",
]);

type Sense = [pos: string, text: string];

function firstPhonemicIpa(entry: KaikkiEntry) {
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa !== "string") continue;
    const ipa = singleIpa(sound.ipa);
    if (ipa?.startsWith("/")) return ipa;
  }
  return undefined;
}

/** The single-word bases an entry's form-of senses point to (lowercased; junk such as "-er" left out). */
function formOfBases(entry: KaikkiEntry) {
  const bases: string[] = [];
  for (const sense of entry.senses ?? []) {
    if (!Array.isArray(sense.form_of)) continue;
    if ((sense.tags ?? []).some((tag) => IGNORED_FORM_TAGS.has(tag))) continue;
    for (const { word } of sense.form_of) {
      if (typeof word !== "string") continue;
      const base = word.trim().toLowerCase();
      if (WORD.test(base)) bases.push(base);
    }
  }
  return bases;
}

/** Form-of senses that give no meaning, as `isUsable` leaves such senses out. */
const UNUSABLE_TAGS: ReadonlySet<string> = new Set([
  "obsolete",
  "archaic",
  "misspelling",
]);
const OPENING = "([{“‘";
const CLOSING = ")]}”’";

/**
 * The meaning a form-of gloss gives after its pointer, put first: "dative of ellos and
 * ellas; to them, for them" → "to them, for them; dative of ellos and ellas"; "female
 * equivalent of chico: girl" → "girl; female equivalent of chico". The pointer ends at
 * the first ";" or ":" outside brackets and quotes after its "of" (the quoted gloss in
 * "of colar (“to sift; to dupe”)" is its target's). Undefined for a gloss that only
 * points ("plural of casa").
 */
export function pointerMeaning(gloss: string): string | undefined {
  const of = /\bof\s/.exec(gloss);
  if (!of) return undefined;
  let depth = 0;
  for (let i = of.index; i < gloss.length; i++) {
    const c = gloss[i]!;
    if (OPENING.includes(c)) depth++;
    else if (CLOSING.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === ";" || c === ":")) {
      const pointer = gloss.slice(0, i).trim();
      const meaning = gloss.slice(i + 1).trim();
      return meaning ? `${meaning}; ${pointer}` : undefined;
    }
  }
  return undefined;
}

/**
 * A sense's meaning: its gloss, or for a form-of sense the meaning its gloss gives
 * after the pointer ("me": "accusative of yo: me"; the clitic pronouns, possessives and
 * demonstratives have no other); undefined for a sense with none.
 */
function senseText(sense: KaikkiSense): string | undefined {
  if (isUsable(sense)) return glossOf(sense).trim();
  if (!Array.isArray(sense.form_of) || Array.isArray(sense.alt_of)) return;
  if ((sense.tags ?? []).some((tag) => UNUSABLE_TAGS.has(tag))) return;
  const gloss: unknown = sense.glosses?.at(-1);
  return typeof gloss === "string" ? pointerMeaning(gloss.trim()) : undefined;
}

// Proper-noun entries (Brasil, Carlos, Acapulco) give no meanings, so a word with only
// those is not a vocabulary word; a word with other entries keeps their senses.
function usableSenses(entry: KaikkiEntry) {
  if (entry.pos === "name") return [];
  const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
  return (entry.senses ?? []).flatMap((sense) => {
    const text = senseText(sense);
    return text ? [{ sense, def: [pos, text] as Sense }] : [];
  });
}

const NO_LEMMAS: LemmaCounts = {
  byForm: new Map(),
  byLemma: new Map(),
  byTag: new Map(),
};

/** The universal tags of each dictionary part of speech, as src/core/tagging/es.ts maps them. */
const TAGS_OF: Readonly<Record<string, readonly string[]>> = {
  noun: ["NOUN", "PROPN"],
  verb: ["VERB", "AUX"],
  adjective: ["ADJ"],
  adverb: ["ADV"],
  preposition: ["ADP"],
  contraction: ["ADP"],
  conjunction: ["CCONJ", "SCONJ"],
  determiner: ["DET"],
  article: ["DET"],
  pronoun: ["PRON"],
  numeral: ["NUM"],
  interjection: ["INTJ"],
};

/**
 * A word's parts of speech (its entries', in the source's order), the one the
 * treebanks tag it with most often first: "de" is a preposition before the letter's
 * noun, "la" an article before the note. Ties keep the source's order.
 */
export function byTreebankTags(
  word: string,
  labels: readonly string[],
  { byTag }: LemmaCounts,
): string[] {
  const count = (label: string) =>
    (Object.hasOwn(TAGS_OF, label) ? TAGS_OF[label]! : []).reduce(
      (sum, tag) => sum + (byTag.get(`${word} ${tag}`) ?? 0),
      0,
    );
  return [...labels].sort((a, b) => count(b) - count(a));
}

/**
 * How many of a form's treebank lemmas the bases' own frequencies weigh as: a form the
 * treebanks lemmatize only once or twice ("Vengo" as vengar) does not outweigh a base
 * they use far more often (venir).
 */
const PRIOR_WEIGHT = 5;

/**
 * A form's bases in the order the treebanks give it them, likeliest first: how often
 * they lemmatize the form as each base, plus PRIOR_WEIGHT shared among the bases by
 * how often the treebanks use each at all; ties as given. A form two verbs share goes
 * to the likelier one ("creo": creer before crear, "siento": sentir before sentar),
 * which rule A1 then reads it as (`LanguagePack.basesInOrder`), and the frequency list
 * ranks that one by the form (`buildFrequency`).
 */
export function byTreebank(
  form: string,
  bases: readonly string[],
  { byForm, byLemma }: LemmaCounts,
): string[] {
  const used = (base: string) => byLemma.get(base) ?? 0;
  const total = bases.reduce((sum, base) => sum + used(base), 0);
  const score = (base: string) =>
    (byForm.get(`${form} ${base}`) ?? 0) +
    (total > 0 ? (PRIOR_WEIGHT * used(base)) / total : 0);
  return [...bases].sort((a, b) => score(b) - score(a));
}

function definition(senses: Sense[]): DefsPack[string] {
  const kept = senses.slice(0, MAX_SENSES);
  return [shortOfDefinition(kept[0]![1]), kept];
}

export type EsPacks = Awaited<ReturnType<typeof buildEsPacks>>;

/**
 * Builds the Spanish pack from the frequency-list `forms` (lowercase single words in
 * rank order): the vocabulary is every base with a meaning that a form reaches (the
 * form itself, or what its form-of entries point to). Entries spelt exactly like the
 * lowercase word win; entries in another casing (Brasil) are used only when there are
 * none with a meaning.
 */
export async function buildEsPacks(
  path: string,
  forms: string[],
  {
    freqTop = FREQ_TOP,
    commonRank = PHRASE_COMMON_RANK,
    treebank = NO_LEMMAS,
  }: {
    freqTop?: number;
    commonRank?: number;
    /** The treebanks' lemma counts (`treebankLemmas`), which order a form's bases. */
    treebank?: LemmaCounts;
  } = {},
) {
  const listed = new Set(forms);
  interface Bucket {
    senses: Sense[];
    ipa: string | undefined;
    bases: string[];
    /** The parts of speech of its entries with a meaning, in the source's order. */
    pos: Set<string>;
  }
  const exact = new Map<string, Bucket>();
  const folded = new Map<string, Bucket>();
  const multiWord = new Map<string, { phrase: boolean; senses: Sense[] }>();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "es") return;
    const word = entry.word.trim();
    const lower = word.toLowerCase();
    const senses = usableSenses(entry);
    if (/\s/.test(lower)) {
      const parts = lower.split(/\s+/);
      if (!parts.every((part) => WORD.test(part)) || isNonConstituent(entry))
        return;
      const key = parts.join(" ");
      let item = multiWord.get(key);
      if (!item) multiWord.set(key, (item = { phrase: false, senses: [] }));
      for (const { sense, def } of senses) {
        item.phrase ||=
          (sense.tags ?? []).includes("idiomatic") ||
          PHRASE_POS.has(entry.pos!);
        item.senses.push(def);
      }
      return;
    }
    if (!WORD.test(lower)) return;
    const buckets = word === lower ? exact : folded;
    let bucket = buckets.get(lower);
    if (!bucket)
      buckets.set(
        lower,
        (bucket = { senses: [], ipa: undefined, bases: [], pos: new Set() }),
      );
    for (const { def } of senses) {
      if (bucket.senses.length < MAX_SENSES) bucket.senses.push(def);
      if (def[0]) bucket.pos.add(def[0]);
    }
    bucket.ipa ??= firstPhonemicIpa(entry);
    if (word === lower && listed.has(lower))
      bucket.bases.push(...formOfBases(entry));
  });

  const meaningOf = (word: string) =>
    [exact.get(word), folded.get(word)].find(
      (b): b is Bucket => (b?.senses.length ?? 0) > 0,
    );
  const vocabSet = new Set<string>();
  const lemmas: Record<string, string | string[]> = {};
  let reordered = 0;
  for (const form of forms) {
    if (meaningOf(form)) vocabSet.add(form);
    const found = [...new Set(exact.get(form)?.bases ?? [])]
      .filter((base) => base !== form && meaningOf(base))
      .sort(byCodeUnit);
    const bases = byTreebank(form, found, treebank);
    if (bases[0] !== found[0]) reordered++;
    for (const base of bases) vocabSet.add(base);
    if (bases.length > 0) lemmas[form] = bases.length === 1 ? bases[0]! : bases;
  }
  const vocab = [...vocabSet].sort(byCodeUnit);
  const ipa: Record<string, string> = {};
  const defs: Record<string, DefsPack[string]> = {};
  const pos: Record<string, string[]> = {};
  for (const word of vocab) {
    const wordIpa = exact.get(word)?.ipa ?? folded.get(word)?.ipa;
    if (wordIpa) ipa[word] = wordIpa;
    const bucket = meaningOf(word)!;
    defs[word] = definition(bucket.senses);
    if (bucket.pos.size > 0)
      pos[word] = byTreebankTags(word, [...bucket.pos], treebank);
  }
  // A form that is a vocabulary word ranks only itself: "para", "pero" and "como" would
  // otherwise put parar, perar and comer among the most common words.
  const freq = buildFrequency(
    forms.map((form, i) => ({ rank: i + 1, words: [form] })),
    Object.fromEntries(
      Object.entries(lemmas).filter(([form]) => !vocabSet.has(form)),
    ),
    vocab,
    freqTop,
  );

  // Phrase patterns: each word is a slot, a vocabulary word or a listed form. The rank
  // threshold looks at the literal words only, and ranks a form outside the vocabulary
  // as its most common base.
  const isPatternWord = (w: string) =>
    SLOT_WORDS.has(w) || vocabSet.has(w) || Object.hasOwn(lemmas, w);
  const rankOf = rankOfWord(
    new Map(freq.map((word, i) => [word, i + 1])),
    vocabSet,
    lemmas,
  );
  const detect: string[] = [];
  const more: string[] = [];
  for (const [key, item] of multiWord) {
    if (!item.phrase) continue;
    const words = key.split(" ");
    if (!words.every(isPatternWord)) continue;
    const literals = words.filter((w) => !SLOT_WORDS.has(w));
    if (literals.length === 0) continue;
    if (Math.max(...literals.map(rankOf)) <= commonRank) continue;
    (literals.length < words.length ? more : detect).push(key);
    defs[key] = definition(item.senses);
  }
  const phrases = {
    detect: detect.sort(byCodeUnit),
    more: more.sort(byCodeUnit),
    gap: [],
  };

  return {
    freq,
    vocab,
    lemmas,
    ipa,
    pos,
    phrases,
    defs,
    stats: {
      ...stats,
      forms: forms.length,
      vocab: vocab.length,
      lemmas: Object.keys(lemmas).length,
      ipa: Object.keys(ipa).length,
      pos: Object.keys(pos).length,
      reordered,
      detect: detect.length,
      more: more.length,
      terms: Object.keys(defs).length,
    },
  };
}

/**
 * Writes es/ and the es-en dictionary shards with their index under `dir`, removing old
 * shards. Returns the paths written, relative to `dir`.
 */
export function writeEsPacks(
  { freq, vocab, lemmas, ipa, pos, phrases, defs }: EsPacks,
  dir = PACKS_DIR,
) {
  const index = writeShards("es-en", defs, dir);
  writePack("es/freq.json", freq, dir);
  writePack("es/vocab.json", vocab, dir);
  writePack("es/lemmas.json", lemmas, dir);
  writePack("es/ipa.json", ipa, dir);
  writePack("es/pos.json", pos, dir);
  writePack("es/phrases.json", phrases, dir, { lists: true });
  return [
    ...["freq", "vocab", "lemmas", "ipa", "pos", "phrases"].map(
      (f) => `es/${f}.json`,
    ),
    ...index.shards.map(({ file }) => `es-en/${file}`),
    "es-en/index.json",
  ];
}

async function main() {
  const forms = frequencyForms(await readEsFrequency(ES_FORMS));
  const packs = await buildEsPacks(process.argv[2] ?? KAIKKI_ES_PATH, forms, {
    treebank: await treebankLemmas(),
  });
  const written = writeEsPacks(packs);
  const { stats } = packs;
  console.log(
    `kaikki-es: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.forms} frequency-list forms (first ${ES_FORMS} entries) → ` +
      `${stats.vocab} vocabulary words, ${stats.lemmas} lemma forms ` +
      `(${stats.reordered} with their bases reordered by the treebanks), ` +
      `${stats.ipa} IPA, ${stats.pos} words with parts of speech, ` +
      `${stats.detect} detected and ${stats.more} more phrase patterns, ` +
      `${stats.terms} dictionary terms in ` +
      `${written.filter((p) => p.startsWith("es-en/dict-")).length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
