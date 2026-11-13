// English definitions of English words and phrases from the kaikki.org English
// Wiktionary extract (CC BY-SA) → public/packs/en-defs/{index,dict-<n>}.json: the
// fallback of every English dictionary (shown in English, or translated at display
// time by the browser's translator).
//
// Rule C2: a term's senses are ranked by the source's own labels (`rankSenses`: usage
// notes, register labels and, for phrases, domain and regional labels go down;
// translation tables lift a phrase's senses), and a sense that only names another term
// ("Synonym of X", "Clipping of X", an alternative spelling) takes that term's best
// definition. Inflections ("Plural of X") are left out: the extension follows them.
// A term every English pair dictionary has is left out: no lookup reaches it.
// Usage: node scripts/data/en-defs.ts [path]   (default data/raw/kaikki-en.jsonl; run
// ejdict.ts, kaikki.ts, phrases.ts and the pair recipes, recipes/native.ts, first)
import { definitionPointer } from "../../src/core/lexicon/definitions.ts";
import { shortOfDefinition } from "../../src/core/lexicon/short-lines.ts";
import type { DefsPack, LemmaPack } from "../../src/core/packs/types.ts";
import type { PhrasePatterns } from "../../src/core/phrases/pattern.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DICTIONARY_PACKS } from "../../src/core/packs/formats.ts";
import {
  eachEntry,
  KAIKKI_PATH,
  PACKS_DIR,
  posLabel,
  readDictPacks,
  readPack,
  writeShards,
  type KaikkiEntry,
} from "./common.ts";
import { PACKS } from "./formats.ts";
import { isNonConstituent, patternKey } from "./phrases.ts";
import {
  entrySenses,
  isPointer,
  rankSenses,
  type SourceSense,
} from "./senses.ts";

/** Senses kept per term (the dictionary window shows up to four). */
const MAX_SENSES = 4;

/**
 * The term a pointer sense names: its alt-of / form-of target, else the one its gloss
 * names as the extension reads it ("Synonym of look for." → "look for").
 */
const targetOf = (sense: SourceSense) =>
  sense.target ?? definitionPointer(sense.gloss)?.target;

/**
 * The English definitions of the vocabulary words and of every phrase pattern
 * (detected or not): up to four distinct senses each, best first (rule C2), as [pos,
 * text], with the first one's text up to its first `;` as the short meaning. A pointer
 * sense takes the best definition of the term it names, when the source has one.
 * A term every English pair dictionary has (`everyPair`) is left out: en-defs is their
 * fallback, so no hover or dictionary window would reach its definitions.
 */
export async function buildEnDefs(
  path: string,
  {
    vocab,
    lemmas,
    phrases,
    everyPair = () => false,
  }: {
    vocab: string[];
    lemmas: LemmaPack;
    phrases: PhrasePatterns;
    everyPair?: (key: string) => boolean;
  },
) {
  const words = new Set(vocab);
  const patterns = new Set([...phrases.detect, ...phrases.more]);
  const known = (word: string) =>
    words.has(word) || Object.hasOwn(lemmas, word);
  const isWord = (word: string) =>
    known(word) || (word.endsWith("'s") && known(word.slice(0, -2)));
  const termKey = (headword: string) => {
    const word = headword.trim();
    const key = !/\s/.test(word)
      ? words.has(word)
        ? word
        : undefined
      : patternKey(word, isWord);
    if (key === undefined || everyPair(key)) return undefined;
    return key.includes(" ") && !patterns.has(key) ? undefined : key;
  };
  /** A term's senses: a proper noun is no meaning of a word ("Light"), but a phrase may be one. */
  const sensesOf = (entry: KaikkiEntry, multiWord: boolean) =>
    entry.pos === "name" && !multiWord
      ? []
      : entrySenses(entry).senses.filter((sense) => !sense.inflection);

  const terms = new Map<string, SourceSense[]>();
  const targets = new Set<string>();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en" || isNonConstituent(entry)) return;
    const key = termKey(entry.word);
    if (!key) return;
    let list = terms.get(key);
    for (const sense of sensesOf(entry, key.includes(" "))) {
      if (!list) terms.set(key, (list = []));
      list.push({ ...sense, order: list.length });
      if (isPointer(sense)) {
        const target = targetOf(sense);
        if (target) targets.add(target);
      }
    }
  });
  // The terms pointers name, by their exact spelling: their own senses.
  const named = new Map<string, SourceSense[]>();
  await eachEntry(path, (entry) => {
    const word = entry.word.trim();
    if (entry.lang_code !== "en" || !targets.has(word)) return;
    let list = named.get(word);
    for (const sense of entrySenses(entry).senses) {
      if (isPointer(sense)) continue;
      if (!list) named.set(word, (list = []));
      list.push({ ...sense, order: list.length });
    }
  });
  const bestOf = (term: string) => {
    const list = named.get(term);
    return list && rankSenses(list, term.includes(" "))[0];
  };

  const defs: Record<string, DefsPack[string]> = {};
  let resolved = 0;
  for (const [key, list] of terms) {
    const senses = list.map((sense) => {
      if (!isPointer(sense)) return sense;
      const target = targetOf(sense);
      const best =
        target && target.toLowerCase() !== key ? bestOf(target) : undefined;
      if (!best) return sense;
      resolved++;
      // The target's definition, with the pointer's own labels.
      return { ...sense, target: undefined, gloss: best.gloss };
    });
    const out: [string, string][] = [];
    for (const sense of rankSenses(senses, key.includes(" "))) {
      if (out.some(([, text]) => text === sense.gloss)) continue;
      out.push([posLabel(sense.pos), sense.gloss]);
      if (out.length >= MAX_SENSES) break;
    }
    if (out.length > 0) defs[key] = [shortOfDefinition(out[0]![1]), out];
  }
  const phraseCount = Object.keys(defs).filter((key) =>
    key.includes(" "),
  ).length;
  const left = [...words, ...patterns].filter(everyPair).length;
  return {
    defs,
    stats: {
      ...stats,
      words: Object.keys(defs).length - phraseCount,
      phrases: phraseCount,
      resolved,
      /** Terms every pair dictionary has. */
      left,
    },
  };
}

/**
 * The terms each English pair dictionary has meanings of in its own pack (en-ja: EJDict
 * and the translation tables' phrases; en-es, en-pt: their recipes' sources).
 */
function pairTerms(): ReadonlySet<string>[] {
  return Object.entries(DICTIONARY_PACKS)
    .filter(([pair]) => pair.startsWith("en-"))
    .map(([pair]) => {
      const { dir } = PACKS[pair as keyof typeof PACKS];
      const terms = new Set(Object.keys(readDictPacks(dir)));
      if (existsSync(join(dir, "phrases.json")))
        for (const key of Object.keys(readPack<object>("phrases.json", dir)))
          terms.add(key);
      return terms;
    });
}

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const pairs = pairTerms();
  const { defs, stats } = await buildEnDefs(path, {
    vocab: readPack("en/vocab.json"),
    lemmas: readPack("en/lemmas.json"),
    phrases: readPack("en/phrases.json"),
    everyPair: (key) => pairs.every((terms) => terms.has(key)),
  });
  const index = writeShards("en-defs", defs, PACKS_DIR);
  console.log(
    `en-defs: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.words} words and ${stats.phrases} phrases in ${index.shards.length} shards; ` +
      `${stats.resolved} pointer senses take their target's definition; ` +
      `${stats.left} terms every pair dictionary has left out`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
