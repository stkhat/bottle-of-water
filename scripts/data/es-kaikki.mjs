// kaikki.org Spanish Wiktionary extract (CC BY-SA) and the Spanish frequency list →
// data/packs/es/{freq,vocab,lemmas,ipa,phrases}.json (phrases: { detect, more, gap })
// and data/packs/es-en/{index,dict-<n>}.json (packs that can be downloaded; then run
// npm run data:publish)
// Usage: node scripts/data/es-kaikki.mjs [path]   (default data/raw/kaikki-es.jsonl; run es-frequency.mjs first)
import { createReadStream, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  DOWNLOAD_PACKS_DIR,
  isMain,
  RAW_DIR,
  singleIpa,
  writePack,
} from "./common.mjs";
import { shardDict } from "./ejdict.mjs";
import { ES_FORMS, frequencyForms, readEsFrequency } from "./es-frequency.mjs";
import { buildFrequency } from "./frequency.mjs";
import { posLabel } from "./kaikki.mjs";
import {
  isNonConstituent,
  isUsable,
  PHRASE_COMMON_RANK,
  PHRASE_POS,
  shortOf,
} from "./phrases.mjs";

export const KAIKKI_ES_PATH = join(RAW_DIR, "kaikki-es.jsonl");
/**
 * Spanish slot words ("tomar el pelo a alguien"), as Wiktionary writes them. The matcher
 * fills each only with itself (src/core/phrases/es.ts); a pattern with a slot is not
 * detected in text.
 */
export const ES_SLOT_WORDS = new Set(["alguien", "algo"]);
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
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function firstPhonemicIpa(entry) {
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa !== "string") continue;
    const ipa = singleIpa(sound.ipa);
    if (ipa?.startsWith("/")) return ipa;
  }
  return undefined;
}

/** The single-word bases an entry's form-of senses point to (lowercased; junk such as "-er" left out). */
function formOfBases(entry) {
  const bases = [];
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
function usableSenses(entry) {
  if (entry.pos === "name") return [];
  const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
  return (entry.senses ?? [])
    .filter(isUsable)
    .map((sense) => ({ sense, def: [pos, sense.glosses.at(-1).trim()] }));
}

function definition(senses) {
  const kept = senses.slice(0, MAX_SENSES);
  return [shortOf(kept[0][1]), kept];
}

/**
 * Streams kaikki-es and builds the Spanish pack from the frequency-list `forms` (lowercase
 * single words in rank order): the vocabulary is every base with a meaning that a form
 * reaches (the form itself, or what its form-of entries point to). Entries spelt exactly
 * like the lowercase word win; entries in another casing (Brasil) are used only when
 * there are none with a meaning.
 */
export async function buildEsPacks(
  path,
  forms,
  { freqTop = FREQ_TOP, commonRank = PHRASE_COMMON_RANK } = {},
) {
  const listed = new Set(forms);
  const stats = { entries: 0, unparsable: 0 };
  // lowercase word → { senses: [pos, text][], ipa, bases: Set }
  const exact = new Map();
  const folded = new Map();
  // phrase key → { phrase: boolean, senses: [pos, text][] }
  const multiWord = new Map();
  const lines = createInterface({
    input: createReadStream(path, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.unparsable++;
      continue;
    }
    stats.entries++;
    if (entry.lang_code !== "es" || typeof entry.word !== "string") continue;
    const word = entry.word.trim();
    const lower = word.toLowerCase();
    const senses = usableSenses(entry);
    if (/\s/.test(lower)) {
      const parts = lower.split(/\s+/);
      if (!parts.every((part) => WORD.test(part)) || isNonConstituent(entry))
        continue;
      const key = parts.join(" ");
      let item = multiWord.get(key);
      if (!item) multiWord.set(key, (item = { phrase: false, senses: [] }));
      for (const { sense, def } of senses) {
        item.phrase ||=
          (sense.tags ?? []).includes("idiomatic") || PHRASE_POS.has(entry.pos);
        item.senses.push(def);
      }
      continue;
    }
    if (!WORD.test(lower)) continue;
    const buckets = word === lower ? exact : folded;
    let bucket = buckets.get(lower);
    if (!bucket)
      buckets.set(lower, (bucket = { senses: [], ipa: undefined, bases: [] }));
    for (const { def } of senses)
      if (bucket.senses.length < MAX_SENSES) bucket.senses.push(def);
    bucket.ipa ??= firstPhonemicIpa(entry);
    if (word === lower && listed.has(lower))
      bucket.bases.push(...formOfBases(entry));
  }

  const meaningOf = (word) =>
    [exact.get(word), folded.get(word)].find((b) => b?.senses.length > 0);
  const vocabSet = new Set();
  const lemmas = {};
  for (const form of forms) {
    if (meaningOf(form)) vocabSet.add(form);
    const bases = [...new Set(exact.get(form)?.bases ?? [])]
      .filter((base) => base !== form && meaningOf(base))
      .sort(byCodeUnit);
    for (const base of bases) vocabSet.add(base);
    if (bases.length > 0) lemmas[form] = bases.length === 1 ? bases[0] : bases;
  }
  const vocab = [...vocabSet].sort(byCodeUnit);
  const ipa = {};
  const defs = {};
  for (const word of vocab) {
    const wordIpa = exact.get(word)?.ipa ?? folded.get(word)?.ipa;
    if (wordIpa) ipa[word] = wordIpa;
    defs[word] = definition(meaningOf(word).senses);
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
  const ranks = new Map(freq.map((word, i) => [word, i + 1]));
  const isPatternWord = (w) =>
    ES_SLOT_WORDS.has(w) || vocabSet.has(w) || Object.hasOwn(lemmas, w);
  const rankOf = (w) =>
    ranks.get(w) ??
    (vocabSet.has(w)
      ? Infinity
      : Math.min(...[lemmas[w]].flat().map((b) => ranks.get(b) ?? Infinity)));
  const detect = [];
  const more = [];
  for (const [key, item] of multiWord) {
    if (!item.phrase) continue;
    const words = key.split(" ");
    if (!words.every(isPatternWord)) continue;
    const literals = words.filter((w) => !ES_SLOT_WORDS.has(w));
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
 * Writes the Spanish packs under `dir` (data/packs/ by default): es/ and the es-en
 * dictionary shards with their index, removing old shards. Returns the paths written,
 * relative to `dir`.
 */
export function writeEsPacks({ freq, vocab, lemmas, ipa, phrases, defs }, dir) {
  const root = dir ?? DOWNLOAD_PACKS_DIR;
  const dictDir = join(root, "es-en");
  if (existsSync(dictDir))
    for (const name of readdirSync(dictDir))
      if (/^(dict-\d+|index)\.json$/.test(name)) rmSync(join(dictDir, name));
  const { index, shards } = shardDict(defs);
  const files = {
    "es/freq.json": freq,
    "es/vocab.json": vocab,
    "es/lemmas.json": lemmas,
    "es/ipa.json": ipa,
    "es/phrases.json": phrases,
    ...Object.fromEntries(
      shards.map((shard) => [`es-en/${shard.file}`, shard.dict]),
    ),
    "es-en/index.json": index,
  };
  for (const [relPath, value] of Object.entries(files))
    writePack(relPath, value, root, { lists: relPath === "es/phrases.json" });
  return Object.keys(files);
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

if (isMain(import.meta.url)) await main();
