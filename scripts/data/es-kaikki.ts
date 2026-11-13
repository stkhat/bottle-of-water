// kaikki.org Spanish Wiktionary extract (CC BY-SA) and the Spanish frequency list →
// data/packs/es/{freq,vocab,lemmas,ipa,phrases}.json and data/packs/es-en/
// {index,dict-<n>}.json (then run npm run data:publish)
// Usage: node scripts/data/es-kaikki.ts [path]   (default data/raw/kaikki-es.jsonl; run es-frequency.ts first)
import { join } from "node:path";
import { singleIpa } from "../../src/core/lexicon/ipa.ts";
import { shortOfDefinition } from "../../src/core/lexicon/short-lines.ts";
import type { DefsPack } from "../../src/core/packs/types.ts";
import { SPANISH_RULES } from "../../src/core/phrases/es.ts";
import {
  byCodeUnit,
  DOWNLOAD_PACKS_DIR,
  eachEntry,
  posLabel,
  RAW_DIR,
  writeShards,
  writePack,
  type KaikkiEntry,
} from "./common.ts";
import { ES_FORMS, frequencyForms, readEsFrequency } from "./es-frequency.ts";
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

// Proper-noun entries (Brasil, Carlos, Acapulco) give no meanings, so a word with only
// those is not a vocabulary word; a word with other entries keeps their senses.
function usableSenses(entry: KaikkiEntry) {
  if (entry.pos === "name") return [];
  const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
  return (entry.senses ?? []).filter(isUsable).map((sense) => ({
    sense,
    def: [pos, glossOf(sense).trim()] as Sense,
  }));
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
  { freqTop = FREQ_TOP, commonRank = PHRASE_COMMON_RANK } = {},
) {
  const listed = new Set(forms);
  interface Bucket {
    senses: Sense[];
    ipa: string | undefined;
    bases: string[];
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
      buckets.set(lower, (bucket = { senses: [], ipa: undefined, bases: [] }));
    for (const { def } of senses)
      if (bucket.senses.length < MAX_SENSES) bucket.senses.push(def);
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
  for (const form of forms) {
    if (meaningOf(form)) vocabSet.add(form);
    const bases = [...new Set(exact.get(form)?.bases ?? [])]
      .filter((base) => base !== form && meaningOf(base))
      .sort(byCodeUnit);
    for (const base of bases) vocabSet.add(base);
    if (bases.length > 0) lemmas[form] = bases.length === 1 ? bases[0]! : bases;
  }
  const vocab = [...vocabSet].sort(byCodeUnit);
  const ipa: Record<string, string> = {};
  const defs: Record<string, DefsPack[string]> = {};
  for (const word of vocab) {
    const wordIpa = exact.get(word)?.ipa ?? folded.get(word)?.ipa;
    if (wordIpa) ipa[word] = wordIpa;
    defs[word] = definition(meaningOf(word)!.senses);
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
    phrases,
    defs,
    stats: {
      ...stats,
      forms: forms.length,
      vocab: vocab.length,
      lemmas: Object.keys(lemmas).length,
      ipa: Object.keys(ipa).length,
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
  { freq, vocab, lemmas, ipa, phrases, defs }: EsPacks,
  dir = DOWNLOAD_PACKS_DIR,
) {
  const index = writeShards("es-en", defs, dir);
  writePack("es/freq.json", freq, dir);
  writePack("es/vocab.json", vocab, dir);
  writePack("es/lemmas.json", lemmas, dir);
  writePack("es/ipa.json", ipa, dir);
  writePack("es/phrases.json", phrases, dir, { lists: true });
  return [
    ...["freq", "vocab", "lemmas", "ipa", "phrases"].map((f) => `es/${f}.json`),
    ...index.shards.map(({ file }) => `es-en/${file}`),
    "es-en/index.json",
  ];
}

async function main() {
  const forms = frequencyForms(await readEsFrequency(ES_FORMS));
  const packs = await buildEsPacks(process.argv[2] ?? KAIKKI_ES_PATH, forms);
  const written = writeEsPacks(packs);
  const { stats } = packs;
  console.log(
    `kaikki-es: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.forms} frequency-list forms (first ${ES_FORMS} entries) → ` +
      `${stats.vocab} vocabulary words, ${stats.lemmas} lemma forms, ${stats.ipa} IPA, ` +
      `${stats.detect} detected and ${stats.more} more phrase patterns, ` +
      `${stats.terms} dictionary terms in ` +
      `${written.filter((p) => p.startsWith("es-en/dict-")).length} shards`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
