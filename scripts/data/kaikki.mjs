// kaikki.org English Wiktionary extract (CC BY-SA) → public/packs/en/{lemmas,ipa,pos}.json
// Usage: node scripts/data/kaikki.mjs [path]   (default data/raw/kaikki-en.jsonl; run ejdict.mjs first)
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { isMain, RAW_DIR, readPack, writePack } from "./common.mjs";
import { vocabularyOf } from "./ejdict.mjs";

export const KAIKKI_PATH = join(RAW_DIR, "kaikki-en.jsonl");

const INFLECTION_TAGS = new Set([
  "plural",
  "past",
  "participle",
  "present",
  "third-person",
  "comparative",
  "superlative",
]);
const IGNORED_TAGS = new Set([
  "alternative",
  "obsolete",
  "archaic",
  "dialectal",
  "misspelling",
  "pronunciation-spelling",
  "nonstandard",
]);
// Entries whose forms are not inflections of a real word: letters and symbols.
const NO_FORMS_POS = new Set(["character", "symbol"]);
const US_TAGS = new Set(["General-American", "US"]);
const POS_LABELS = {
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  pron: "pronoun",
  conj: "conjunction",
  intj: "interjection",
  det: "determiner",
  num: "numeral",
  name: "proper noun",
  abbrev: "abbreviation",
  postp: "postposition",
};

/** kaikki part-of-speech code → readable label (adj → adjective, prep_phrase → prepositional phrase). */
export function posLabel(pos) {
  if (pos === "prep_phrase") return "prepositional phrase";
  return POS_LABELS[pos] ?? pos.replaceAll("_", " ");
}

function newBucket() {
  return {
    pos: [],
    phonemicIpa: undefined,
    anyIpa: undefined,
    bases: new Map(),
  };
}

// An entry that is only a misspelling (or obsolete, dialectal…) of another word
// does not give its forms to its headword ("we'll": misspelling of well → better).
function hasOwnForms(entry) {
  if (NO_FORMS_POS.has(entry.pos)) return false;
  const senses = entry.senses ?? [];
  return !(
    senses.length > 0 &&
    senses.every((sense) =>
      (sense.tags ?? []).some(
        (tag) => tag !== "alternative" && IGNORED_TAGS.has(tag),
      ),
    )
  );
}

// No accent tag: the pronunciation shared by all accents, US included. A stressed or
// strong form counts too ("my", "would"); a weak form or a dialect note does not.
function isSharedPronunciation(tags, note) {
  if (!tags.every((tag) => tag === "stressed")) return false;
  return !note || /strong form|General American/.test(note);
}

function addEntry(bucket, base, entry) {
  if (typeof entry.pos === "string") {
    const label = posLabel(entry.pos);
    if (!bucket.pos.includes(label)) bucket.pos.push(label);
  }
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa !== "string") continue;
    const tags = sound.tags ?? [];
    const phonemic = sound.ipa.startsWith("/");
    if (tags.some((tag) => US_TAGS.has(tag))) {
      bucket.anyIpa ??= sound.ipa;
      if (phonemic) bucket.phonemicIpa ??= sound.ipa;
    } else if (phonemic && isSharedPronunciation(tags, sound.note)) {
      bucket.untaggedIpa ??= sound.ipa;
    }
  }
  if (!hasOwnForms(entry)) return;
  for (const { form, tags = [] } of entry.forms ?? []) {
    if (typeof form !== "string") continue;
    if (!tags.some((tag) => INFLECTION_TAGS.has(tag))) continue;
    if (tags.some((tag) => IGNORED_TAGS.has(tag))) continue;
    const lower = form.trim().toLowerCase();
    if (!lower || lower === base || /\s/.test(lower)) continue;
    bucket.bases.set(lower, base);
  }
}

/**
 * Streams the kaikki JSONL and collects, for each vocabulary word, its inflected forms,
 * US IPA and parts of speech. Entries spelt exactly like the vocabulary word win; entries
 * in another casing (Monday for "monday") are used only when there are none.
 */
export async function importKaikki(path, vocab) {
  const words = new Set(vocab);
  const exact = new Map();
  const folded = new Map();
  const stats = { entries: 0, unparsable: 0 };
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
    if (entry.lang_code !== "en" || typeof entry.word !== "string") continue;
    const base = entry.word.toLowerCase();
    if (!words.has(base)) continue;
    const buckets = entry.word === base ? exact : folded;
    let bucket = buckets.get(base);
    if (!bucket) buckets.set(base, (bucket = newBucket()));
    addEntry(bucket, base, entry);
  }

  const lemmaSets = new Map();
  const ipa = {};
  const pos = {};
  for (const word of words) {
    const bucket = exact.get(word) ?? folded.get(word);
    if (!bucket) continue;
    if (bucket.pos.length > 0) pos[word] = bucket.pos;
    const usIpa = bucket.phonemicIpa ?? bucket.anyIpa ?? bucket.untaggedIpa;
    if (usIpa) ipa[word] = usIpa;
    for (const form of bucket.bases.keys()) {
      if (!lemmaSets.has(form)) lemmaSets.set(form, new Set());
      lemmaSets.get(form).add(word);
    }
  }
  const lemmas = {};
  for (const [form, bases] of lemmaSets) {
    const sorted = [...bases].sort();
    lemmas[form] = sorted.length === 1 ? sorted[0] : sorted;
  }
  return { lemmas, ipa, pos, stats };
}

async function main() {
  const vocab = vocabularyOf(readPack("en-ja/dict.json"));
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { lemmas, ipa, pos, stats } = await importKaikki(path, vocab);
  writePack("en/lemmas.json", lemmas);
  writePack("en/ipa.json", ipa);
  writePack("en/pos.json", pos);
  console.log(
    `kaikki: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${Object.keys(lemmas).length} lemma forms, ${Object.keys(ipa).length} IPA, ` +
      `${Object.keys(pos).length} words with parts of speech`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main();
