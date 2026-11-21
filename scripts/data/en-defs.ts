// English definitions of English words and phrases from the kaikki.org English
// Wiktionary extract (CC BY-SA) → data/packs/en-defs/{index,dict-<n>}.json: the
// fallback of every English dictionary (shown in English, or translated at display
// time by the browser's translator).
//
// Rule C2: a term's senses are ranked by the source's own labels (`rankSenses`: usage
// notes and descriptions of the expression, register labels and, for phrases, domain
// and regional labels go down; translation tables lift a phrase's senses), and a sense that only names another term
// ("Synonym of X", "Clipping of X", an alternative spelling) takes that term's best
// definition, except a contraction's sense that names only its host ("Contraction of
// you + are."), which keeps its own; a contraction's own senses come first (U1-5).
// Inflections ("Plural of X") are left out: the extension follows them.
// A term every English pair dictionary has is left out: no lookup reaches it (a recipe
// pair's capitalised headword counts for a capital-only word's lowercase lookup: tokyo;
// not for a word of its own in lower case, which shows its English definitions: may).
// Usage: node scripts/data/en-defs.ts [path]   (default data/raw/kaikki-en.jsonl; run
// ejdict.ts, kaikki.ts, phrases.ts and the pair recipes, recipes/native.ts, first)
import { definitionPointer } from "../../src/core/lexicon/definitions.ts";
import { capitalKey } from "../../src/core/lexicon/short-lines.ts";
import { CONTRACTION, VERB_TO } from "../../src/core/tagging/en-clitics.ts";
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
import { lesserLowercase, tableCoverage } from "./recipes/recipe.ts";
import {
  entityDefinition,
  joinedAcronyms,
  joinedEntities,
  type Acronyms,
  type Entities,
} from "./wikidata.ts";
import {
  entrySenses,
  isPointer,
  rankCapitalSenses,
  rankSenses,
  type SourceSense,
} from "./senses.ts";

/** Definitions are ranked as they are shown (`RankOptions.shown`). */
const SHOWN = { shown: true } as const;

/** Senses kept per term (the dictionary window shows up to four). */
const MAX_SENSES = 4;

/**
 * The term a pointer sense names: its alt-of / form-of target, else the one its gloss
 * names as the extension reads it ("Synonym of look for." → "look for").
 */
const targetOf = (sense: SourceSense) =>
  sense.target ?? definitionPointer(sense.gloss)?.target;

/**
 * A contraction sense that names only its host ("Contraction of you + are.", alt-of
 * "you" with "+ are") keeps its own gloss: the host's definition is not what it means
 * (you're is not "The people spoken, or written to, as an object").
 */
const ownGloss = (sense: SourceSense) => sense.contraction && sense.partial;

/**
 * A term written as a contraction (`CONTRACTION`, `VERB_TO`), whose contraction senses
 * are its main ones. Not a word with a contraction sense among others (am: "Contraction
 * of I + am", dialectal), whose first senses here may be gone (am's inflections).
 */
const writtenAsContraction = (key: string) =>
  CONTRACTION.test(key) || VERB_TO.test(key);

/**
 * The English definitions of the vocabulary words and of every phrase pattern
 * (detected or not): up to four distinct senses each, best first (rule C2), as [pos,
 * text], with the first one's text up to its first `;` as the short meaning. A pointer
 * sense takes the best definition of the term it names, when the source has one.
 * A term every English pair dictionary has (`everyPair`) is left out: en-defs is their
 * fallback, so no hover or dictionary window would reach its definitions. A pair's
 * capitalised headword answers the lookup of a word written in lower case (`everyPair`'s
 * `capital`) only where that is the capitalised word: a capital-only word ("tokyo"), a
 * lowercase headword used far less than the capitalised one (`lesserLowercase`:
 * english), or one whose main sense is the capitalised word's letter-case form
 * (internet, dna). Elsewhere a word in lower case that a pair has no lowercase entry for
 * shows its English definitions (`lowercaseDefined` in the dictionary: "may" is no May).
 */
export async function buildEnDefs(
  path: string,
  {
    vocab,
    lemmas,
    phrases,
    capitals = [],
    entities = {},
    acronyms = {},
    everyPair = () => false,
  }: {
    vocab: string[];
    lemmas: LemmaPack;
    phrases: PhrasePatterns;
    /**
     * The capital-only words, as written (en/capitals.json): their definitions are the
     * entries written so, proper nouns' too, under the lower-case key ("ai": AI's, not
     * the sloth's).
     */
    capitals?: readonly string[];
    /**
     * The words that joined from Wikidata (`joinedEntities`): defined by their items'
     * descriptions first (Nvidia: "American multinational technology company.").
     */
    entities?: Entities;
    /** The acronyms known only by what they stand for (`joinedAcronyms`). */
    acronyms?: Acronyms;
    everyPair?: (key: string, capital: boolean) => boolean;
  },
) {
  const words = new Set(vocab);
  const capitalOnly = new Set(
    capitals.filter((written) => !words.has(written.toLowerCase())),
  );
  /**
   * The abbreviations with a period inside written with capitals (H.R., M.O.), whose
   * key the vocabulary has from EJDict ("h.r."), by their spellings: with the periods,
   * and without (HR, MO), which text mostly writes now.
   */
  const dotted = new Map<string, { key: string; bare: boolean }>();
  for (const written of capitals) {
    const key = written.toLowerCase();
    if (!written.includes(".") || !words.has(key)) continue;
    dotted.set(written, { key, bare: false });
    const bare = written.replaceAll(".", "");
    if (!capitalOnly.has(bare)) dotted.set(bare, { key, bare: true });
  }
  const capitalKeys = new Set(
    [...capitalOnly].map((written) => written.toLowerCase()),
  );
  /** The senses of a dotted abbreviation's spelling without periods (HR's for "h.r."). */
  const bareSenses = new WeakSet<SourceSense>();
  const patterns = new Set([...phrases.detect, ...phrases.more]);
  // A pattern's words may be capital-only words' keys: a name's (New Zealand).
  const known = (word: string) =>
    words.has(word) || Object.hasOwn(lemmas, word) || capitalKeys.has(word);
  const isWord = (word: string) =>
    known(word) || (word.endsWith("'s") && known(word.slice(0, -2)));
  const termKey = (headword: string) => {
    const word = headword.trim();
    const key = !/\s/.test(word)
      ? words.has(word)
        ? word
        : capitalOnly.has(word.replaceAll("’", "'"))
          ? word.toLowerCase()
          : dotted.get(word)?.key
      : patternKey(word, isWord);
    if (key === undefined) return undefined;
    return key.includes(" ") && !patterns.has(key) ? undefined : key;
  };
  /**
   * A term's senses: a proper noun is no meaning of a word ("Light"), but a phrase or a
   * capital-only word may be one (Tokyo).
   */
  const sensesOf = (entry: KaikkiEntry, multiWord: boolean) => {
    const written = entry.word.trim().replaceAll("’", "'");
    return entry.pos === "name" &&
      !multiWord &&
      !capitalOnly.has(written) &&
      !dotted.has(written)
      ? []
      : entrySenses(entry).senses.filter((sense) => !sense.inflection);
  };

  const terms = new Map<string, SourceSense[]>();
  const targets = new Set<string>();
  /** Each headword as written → its most translated sense's languages (`tableCoverage`). */
  const coverage = new Map<string, number>();
  /**
   * Lowercase headwords whose first sense is a letter-case form of the word capitalised
   * → that word (internet → Internet).
   */
  const caseForms = new Map<string, string>();
  /** Capitalised one-word headwords whose lowercase is an English word → their senses. */
  const capitalSenses = new Map<string, SourceSense[]>();
  const firstSeen = new Set<string>();
  const stats = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    const word = entry.word.trim();
    coverage.set(word, Math.max(coverage.get(word) ?? 0, tableCoverage(entry)));
    if (word === word.toLowerCase() && !firstSeen.has(word)) {
      firstSeen.add(word);
      const target = entrySenses(entry).senses[0]?.target;
      if (
        target !== undefined &&
        target !== word &&
        target.toLowerCase() === word
      )
        caseForms.set(word, target);
    } else if (
      !/\s/.test(word) &&
      word !== word.toLowerCase() &&
      words.has(word.toLowerCase())
    ) {
      let list = capitalSenses.get(word);
      for (const sense of entrySenses(entry).senses) {
        if (sense.inflection) continue;
        if (!list) capitalSenses.set(word, (list = []));
        list.push({ ...sense, order: list.length });
      }
    }
    if (isNonConstituent(entry)) return;
    const key = termKey(entry.word);
    if (!key) return;
    let list = terms.get(key);
    const bare = dotted.get(entry.word.trim())?.bare === true;
    for (const sense of sensesOf(entry, key.includes(" "))) {
      if (!list) terms.set(key, (list = []));
      const read = { ...sense, order: list.length };
      if (bare) bareSenses.add(read);
      list.push(read);
      if (isPointer(sense) && !ownGloss(sense)) {
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
    return list && rankSenses(list, term.includes(" "), SHOWN)[0];
  };

  /**
   * The capitalised headword that answers a lowercase word's lookup, when its own entry
   * is a lesser one: a letter-case form of it (internet → Internet), or translated into
   * a fifteenth as many languages (french → French; `lesserLowercase`). Not may, swat,
   * eve: words of their own beside May, Swat, Eve. Not a phrase, which is looked up as
   * written.
   */
  const answeredBy = (key: string) =>
    capitalKeys.has(key) || key.includes(" ")
      ? undefined
      : (caseForms.get(key) ??
        (lesserLowercase(key, coverage, lemmas)
          ? capitalKey(key, false)
          : undefined));
  /** Whether a pair's capitalised headword answers the key's lookup in lower case. */
  const capitalAnswers = (key: string) =>
    capitalKeys.has(key) || answeredBy(key) !== undefined;
  const left = (key: string) => everyPair(key, capitalAnswers(key));
  const defs: Record<string, DefsPack[string]> = {};
  let resolved = 0;
  let capitalised = 0;
  for (const [key, own] of terms) {
    if (left(key)) continue;
    // A lowercase word a capitalised headword answers means that headword's senses,
    // marked "capital": a pair's capitalised entry answers before them
    // (`lowercaseDefined`), and they show where no pair has one.
    const capital = answeredBy(key);
    const list = (capital !== undefined && capitalSenses.get(capital)) || own;
    if (capital !== undefined) capitalised++;
    const senses = list.map((sense) => {
      if (!isPointer(sense) || ownGloss(sense))
        return sense.abbreviates === undefined
          ? sense
          : { ...sense, gloss: `${sense.abbreviates}: ${sense.gloss}` };
      const target = targetOf(sense);
      // A letter-case form names another entry too ("aka" → "AKA").
      const best = target && target !== key ? bestOf(target) : undefined;
      if (!best) return sense;
      resolved++;
      // The target's definition, with the pointer's own labels; an abbreviation keeps
      // what it stands for ("graphics processing unit: A specialized electronic
      // circuit…"), which its card names and a document may spell out.
      return {
        ...sense,
        target: undefined,
        gloss:
          sense.abbreviates === undefined
            ? best.gloss
            : `${sense.abbreviates}: ${best.gloss}`,
      };
    });
    // A dotted abbreviation's own senses, then those of its spelling without periods
    // (H.R.: House of Representatives, then HR's human resources). Not first: the
    // spelling without periods is another distribution of meanings (PM: Prime
    // Minister, post mortem; "p.m." is post meridiem).
    const ranked =
      capitalKeys.has(key) || list !== own
        ? rankCapitalSenses(senses, SHOWN)
        : [
            ...rankSenses(
              senses.filter((_, i) => !bareSenses.has(list[i]!)),
              key.includes(" "),
              SHOWN,
            ),
            ...rankCapitalSenses(
              senses.filter((_, i) => bareSenses.has(list[i]!)),
              SHOWN,
            ),
          ];
    // A contraction's own senses first: that's → "That is.", not the dialectal
    // determiner "whose, of which".
    const best = (
      writtenAsContraction(key)
        ? [
            ...ranked.filter((s) => s.contraction),
            ...ranked.filter((s) => !s.contraction),
          ]
        : ranked
    ).filter(
      (sense, i, all) => all.findIndex((s) => s.gloss === sense.gloss) === i,
    );
    // Each part of speech's best sense is kept (smash: the verb's, after four nouns),
    // as the card shows the one the word's tag reads (rule A2); then the best others.
    // Not a part of speech the source marks as marginal: its best sense has a label
    // (chewy's noun, a pointer to chewie, "chewing gum") or none of its senses is translated
    // (handy's noun, "the hand"), where a tagger's slip would show it.
    const translated = new Set(
      best.filter((s) => s.tables > 0).map((s) => posLabel(s.pos)),
    );
    const kept = new Set(
      best
        .filter(
          (sense, i) =>
            best.findIndex((s) => posLabel(s.pos) === posLabel(sense.pos)) ===
              i &&
            (i < MAX_SENSES ||
              (sense.labels === 0 && translated.has(posLabel(sense.pos)))),
        )
        .slice(0, MAX_SENSES),
    );
    for (const sense of best) if (kept.size < MAX_SENSES) kept.add(sense);
    const out: [string, string, "capital"?][] = [];
    for (const sense of best) {
      // A capital-only word keeps every abbreviation sense, one line each: text means
      // one of them, and its document may spell it out (ANC: active noise
      // cancellation, the third of five).
      if (
        !kept.has(sense) &&
        !(capitalKeys.has(key) && sense.abbreviates !== undefined)
      )
        continue;
      out.push(
        capital === undefined
          ? [posLabel(sense.pos), sense.gloss]
          : [posLabel(sense.pos), sense.gloss, "capital"],
      );
    }
    if (out.length > 0) defs[key] = out;
  }
  // A word that joined from Wikidata means its item first; an entry so written follows
  // (BTS: the band, then "behind the scenes").
  let fromEntities = 0;
  for (const [written, entity] of Object.entries(entities)) {
    const key = written.toLowerCase();
    if (!capitalOnly.has(written) || everyPair(key, true)) continue;
    const text = entityDefinition(written, entity);
    if (text === undefined) continue;
    const own = (defs[key] ?? []).filter(([, other]) => other !== text);
    defs[key] = [["proper noun", text], ...own.slice(0, MAX_SENSES - 1)];
    fromEntities++;
  }
  // An acronym known only by what it stands for (NYPD): each thing it may stand for,
  // headed by its name, which the card chooses by (`namesExpansion`).
  let fromAcronyms = 0;
  for (const [written, items] of Object.entries(acronyms)) {
    const key = written.toLowerCase();
    if (Object.hasOwn(defs, key)) continue;
    const senses = items.flatMap((item) => {
      const text = entityDefinition(written, item);
      return text === undefined ? [] : [["proper noun", text] as const];
    });
    if (senses.length === 0) continue;
    defs[key] = senses;
    fromAcronyms++;
  }
  const phraseCount = Object.keys(defs).filter((key) =>
    key.includes(" "),
  ).length;
  const leftOut = [...words, ...patterns].filter(left).length;
  return {
    defs,
    stats: {
      ...stats,
      words: Object.keys(defs).length - phraseCount,
      phrases: phraseCount,
      resolved,
      /** Lowercase words a capitalised headword answers, defined by its senses. */
      capitalised,
      /** Capital-only words defined by Wikidata. */
      fromEntities,
      /** Acronyms known only by what they stand for. */
      fromAcronyms,
      /** Terms every pair dictionary has. */
      left: leftOut,
    },
  };
}

/**
 * The terms each English pair dictionary has meanings of in its own pack (en-ja: EJDict
 * and the translation tables' phrases; en-es, en-pt: their recipes' sources), and,
 * apart, the lowercase keys of its capitalised headwords (a recipe pair's capital.json
 * shard), which answer the lookup of a capital-only word written in lower case.
 */
function pairTerms(): {
  terms: ReadonlySet<string>;
  capital: ReadonlySet<string>;
}[] {
  return Object.entries(DICTIONARY_PACKS)
    .filter(([pair]) => pair.startsWith("en-"))
    .map(([pair]) => {
      const { dir } = PACKS[pair as keyof typeof PACKS];
      const terms = new Set<string>();
      const capital = new Set<string>();
      for (const key of Object.keys(readDictPacks(dir)))
        if (key === key.toLowerCase()) terms.add(key);
        else capital.add(key.toLowerCase());
      if (existsSync(join(dir, "phrases.json")))
        for (const key of Object.keys(readPack<object>("phrases.json", dir)))
          terms.add(key);
      return { terms, capital };
    });
}

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const pairs = pairTerms();
  const { defs, stats } = await buildEnDefs(path, {
    vocab: readPack("en/vocab.json"),
    lemmas: readPack("en/lemmas.json"),
    phrases: readPack("en/phrases.json"),
    capitals: readPack("en/capitals.json"),
    entities: joinedEntities(),
    acronyms: joinedAcronyms(),
    everyPair: (key, capitalised) =>
      pairs.every(
        ({ terms, capital }) =>
          terms.has(key) || (capitalised && capital.has(key)),
      ),
  });
  const index = writeShards("en-defs", defs, PACKS_DIR);
  console.log(
    `en-defs: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.words} words and ${stats.phrases} phrases in ${index.shards.length} shards; ` +
      `${stats.resolved} pointer senses take their target's definition; ` +
      `${stats.fromEntities} capital-only words defined by Wikidata, ` +
      `${stats.fromAcronyms} acronyms known by what they stand for; ` +
      `${stats.left} terms every pair dictionary has left out`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
