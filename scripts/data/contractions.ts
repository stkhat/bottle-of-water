// English contractions and what they are short for, from the kaikki.org English
// Wiktionary extract (CC BY-SA) → data/packs/en/contractions.json: contraction → its
// expansions, in the source's order and case ("i'm" → ["I am"], "he's" → ["he is",
// "he has"]). The dictionaries show a contraction by them where the native language
// has no meaning of its own (`withContractions`, U1-5).
//
// The contractions: vocabulary words, and words whose host is one ("it's"), written as
// a contraction (`CONTRACTION`, `VERB_TO`: the tagger's clitics), and vocabulary words
// whose first sense is a contraction ("gimme", read by its contraction senses alone).
// An 's word the source also gives a possessive sense is none ("someone's"): the
// clitic is also the possessive. Their expansions, from the first of:
// 1. the word's senses: an alt-of host with the rest in `extra` ("you" + "+ are"), a
//    gloss "Contraction of X", "Pronunciation spelling of X", "Short for X", or a
//    gloss whose first item is itself the expansion ("Do not (negative auxiliary).");
//    a spelling of another contraction takes that one's ("wan't": "Wasn't.");
// 2. its etymology: "Contraction of let us.";
// 3. the clitic's grammar, the host and what the clitic stands for (gonna → going to),
//    for a contraction with a sense in standard use; not for 's, which is also the
//    possessive.
// An expansion is English vocabulary words, ends with what the clitic stands for
// (`STANDS_FOR`: won't is not "doesn't want to", that's is not "of which"), and is more
// than one word unless that word is all the clitic stands for (can't → cannot). Senses
// kept for history or as mistakes are left out; nonstandard and dialectal ones count
// only when nothing else gives an expansion (ain't). Up to three each.
// Usage: node scripts/data/contractions.ts [path]   (default data/raw/kaikki-en.jsonl;
// run kaikki.ts first, which writes the vocabulary)
import { CONTRACTION, VERB_TO } from "../../src/core/tagging/en-clitics.ts";
import type { ContractionPack, VocabPack } from "../../src/core/packs/types.ts";
import {
  eachEntry,
  KAIKKI_PATH,
  readPack,
  writePack,
  type KaikkiEntry,
  type KaikkiSense,
} from "./common.ts";

/** Expansions kept per contraction. */
const MAX_EXPANSIONS = 3;

/** Senses kept by the source for history or as mistakes. */
const SKIP: ReadonlySet<string> = new Set([
  "obsolete",
  "archaic",
  "rare",
  "proscribed",
  "misspelling",
]);
/** Senses outside standard use: read only when no other sense gives an expansion. */
const LATER: ReadonlySet<string> = new Set([
  "nonstandard",
  "dialectal",
  "eye-dialect",
  "pronunciation-spelling",
]);

/** What each clitic stands for: an expansion ends with one of these words. */
const STANDS_FOR: Readonly<Record<string, readonly string[]>> = {
  "n't": ["not", "cannot"],
  "'m": ["am"],
  "'re": ["are"],
  "'ve": ["have"],
  "'ll": ["will", "shall"],
  "'d": ["had", "would", "should", "did"],
  "'s": ["is", "has", "does", "was", "us"],
  na: ["to", "a"],
  ta: ["to", "a"],
};

/** The clitic grammar's expansions: the host, then what the clitic most often stands for. */
const GRAMMAR: Readonly<Record<string, readonly string[]>> = {
  "n't": ["not"],
  "'m": ["am"],
  "'re": ["are"],
  "'ve": ["have"],
  "'ll": ["will"],
  "'d": ["had", "would"],
};
/** The verb a spoken verb + "to" is written with: gonna → going to. */
const VERB_TO_HOST: Readonly<Record<string, string>> = {
  gon: "going",
  wan: "want",
  got: "got",
};

/**
 * A gloss that names what the word is short for, or another spelling of it:
 * "Contraction of come on", "Represents a contracted pronunciation of want to",
 * "Eye dialect spelling of want to", "Alternative form of ain't".
 */
const POINTER =
  /^(?:represents\s+)?(?:an?\s+)?(?:[a-z-]+\s+){0,3}?(?:contraction|contracted pronunciation|spelling|form|abbreviation|short)\s+(?:of|for)\s+(.+)$/i;
/** An etymology that names it: "Contraction of let us." */
const ETYMOLOGY =
  /(?:^|\.\s+)(?:a\s+)?contraction of ([a-z' +]+?)(?:[.,;(]|$)/i;
const WORD = /^[a-z]+(?:'[a-z]+)?$/i;
/** A sense that says the word is a possessive ("Belonging to one.", "Possessive case of someone."). */
const POSSESSIVE = /\b(?:belong(?:ing|s)? to|possessive)\b/i;

/** A word as a key: lower case, ’ written as '. */
const keyOf = (word: string) => word.trim().replaceAll("’", "'").toLowerCase();

/** The clitic's host and the clitic, when the word is written as a contraction. */
function cliticOf(word: string): { host: string; clitic: string } | undefined {
  const spoken = VERB_TO.exec(word);
  if (spoken)
    return {
      host: VERB_TO_HOST[spoken[1]!.toLowerCase()]!,
      clitic: spoken[2]!.toLowerCase(),
    };
  const split = CONTRACTION.exec(word);
  return split && /\p{L}/u.test(split[1]!)
    ? { host: split[1]!, clitic: split[2]!.toLowerCase() }
    : undefined;
}

/**
 * A source's phrase as words: what a pointer names ("contraction of was not" → "was
 * not"), without notes in brackets, quotes, "+" and closing stops.
 */
function phraseOf(text: string): string {
  const phrase = text
    .replaceAll("’", "'")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[“”"‘]/g, " ")
    .replaceAll("+", " ")
    .trim()
    .replace(/[.;:,!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const named = POINTER.exec(phrase);
  return named ? phraseOf(named[1]!) : phrase;
}

/** A sense that is a contraction: tagged so, or of an entry that is one. */
const isContraction = (entry: KaikkiEntry, sense: KaikkiSense) =>
  entry.pos === "contraction" || (sense.tags ?? []).includes("contraction");

const tagged = (sense: KaikkiSense, tags: ReadonlySet<string>) =>
  (sense.tags ?? []).some((tag) => tags.has(tag));

const glossesOf = (sense: KaikkiSense) =>
  (sense.glosses ?? []).filter((gloss) => typeof gloss === "string");

/** The phrases a sense names as what the word is short for, unchecked. */
function sensePhrases(sense: KaikkiSense): string[] {
  const found: string[] = [];
  const pointers = [sense.alt_of, sense.form_of].flatMap((list) =>
    Array.isArray(list) ? (list as { word?: unknown; extra?: unknown }[]) : [],
  );
  for (const { word, extra } of pointers) {
    if (typeof word !== "string") continue;
    if (typeof extra === "string" && extra.startsWith("+"))
      // "I + would or I + should": each alternative, the host before a bare rest.
      extra
        .slice(1)
        .split(/\s+or\s+/)
        .forEach((part, i) => {
          const rest = phraseOf(part);
          found.push(
            i > 0 && rest.includes(" ") ? rest : phraseOf(`${word} ${rest}`),
          );
        });
    else found.push(phraseOf(word));
  }
  for (const gloss of glossesOf(sense)) {
    // The first sense of the gloss, before its notes after ":" ("Has not: negative
    // form of the auxiliary has").
    const first = gloss.split(";")[0]!.split(":")[0]!.trim();
    const named = POINTER.exec(first);
    const items = named ? named[1]!.split(/\s+or\s+|,\s*/) : first.split(",");
    found.push(...items.map(phraseOf));
  }
  return found;
}

type Source = "senses" | "etymology" | "grammar";

export interface ContractionStats {
  entries: number;
  unparsable: number;
  contractions: number;
  bySource: Record<Source, number>;
}

/**
 * The contraction table (see the file's comment) from the extract at `path`, for the
 * vocabulary `vocab`.
 */
export async function buildContractions(
  path: string,
  { vocab }: { vocab: VocabPack },
): Promise<{ table: Record<string, string[]>; stats: ContractionStats }> {
  const words = new Set(vocab);
  const english = (word: string) => words.has(word.toLowerCase());
  /** A word of the vocabulary, or one written as a contraction of one. */
  const wanted = (key: string) => {
    if (words.has(key)) return true;
    const clitic = cliticOf(key);
    return clitic !== undefined && words.has(clitic.host.toLowerCase());
  };
  const entries = new Map<string, KaikkiEntry[]>();
  const counts = await eachEntry(path, (entry) => {
    if (entry.lang_code !== "en") return;
    const key = keyOf(entry.word);
    if (!/^\p{L}/u.test(key) || !wanted(key)) return;
    let list = entries.get(key);
    if (!list) entries.set(key, (list = []));
    list.push(entry);
  });

  /** A contraction's senses that count; undefined for a word that is none. */
  const sensesOf = (key: string, list: readonly KaikkiEntry[]) => {
    const senses = list.flatMap((entry) =>
      (entry.senses ?? [])
        .filter((sense) => !tagged(sense, SKIP))
        .map((sense) => ({ entry, sense })),
    );
    const clitic = cliticOf(key);
    if (!clitic) {
      // A word not written as one is a contraction when its first sense is one
      // (gimme; not am, whose "Contraction of I + am" comes after its own senses),
      // and only its contraction senses say what for.
      const first = senses[0];
      return first && isContraction(first.entry, first.sense)
        ? senses.filter(({ entry, sense }) => isContraction(entry, sense))
        : undefined;
    }
    const possessive = senses.some(
      ({ entry, sense }) =>
        !isContraction(entry, sense) &&
        (tagged(sense, new Set(["possessive"])) ||
          glossesOf(sense).some((gloss) => POSSESSIVE.test(gloss))),
    );
    return clitic.clitic === "'s" && possessive ? undefined : senses;
  };

  /**
   * A contraction's expansions and where they come from; a phrase that is another
   * contraction takes that one's expansions from `resolve`.
   */
  const expansionsOf = (
    key: string,
    list: readonly KaikkiEntry[],
    resolve: (word: string) => readonly string[] | undefined,
  ): { found: string[]; source: Source } | undefined => {
    const senses = sensesOf(key, list);
    if (!senses) return undefined;
    const clitic = cliticOf(key);
    const ends = clitic && STANDS_FOR[clitic.clitic];
    const fits = (phrase: string) =>
      !ends || ends.includes(phrase.split(" ").at(-1)!.toLowerCase());
    /**
     * A phrase as an expansion: English words, ending with what the clitic stands for;
     * one word only when it is that (cannot). Its first letter in lower case unless
     * the headword starts with a capital or it is the pronoun I (I'm → "I am", gotcha
     * → "I caught you"; that's → "that is", not "That is").
     */
    const expansion = (phrase: string, headword: string): string[] => {
      const parts = phrase.split(" ");
      if (keyOf(phrase) === key) return [];
      if (parts.length === 1 && !ends?.includes(keyOf(phrase)))
        return (resolve(keyOf(phrase)) ?? []).filter(fits);
      if (parts.length > 4 || !parts.every((w) => WORD.test(w) && english(w)))
        return [];
      if (!fits(phrase)) return [];
      return /^\p{Lu}/u.test(headword) || parts[0] === "I"
        ? [phrase]
        : [phrase.charAt(0).toLowerCase() + phrase.slice(1)];
    };
    const outside = (sense: KaikkiSense) => tagged(sense, LATER);
    const fromSenses = (later: boolean) =>
      senses
        .filter(({ sense }) => outside(sense) === later)
        .flatMap(({ entry, sense }) =>
          sensePhrases(sense).flatMap((phrase) =>
            expansion(phrase, entry.word),
          ),
        );
    let found = fromSenses(false);
    if (found.length === 0) found = fromSenses(true);
    if (found.length > 0) return { found, source: "senses" };
    found = list.flatMap((entry) => {
      const named = ETYMOLOGY.exec(
        typeof entry.etymology_text === "string" ? entry.etymology_text : "",
      );
      return named ? expansion(phraseOf(named[1]!), entry.word) : [];
    });
    if (found.length > 0) return { found, source: "etymology" };
    // The grammar, for a contraction in standard use (not in't, a dialect spelling;
    // not coffee'd, an archaic past).
    const standard = senses.some(
      ({ entry, sense }) =>
        !outside(sense) && (isContraction(entry, sense) || VERB_TO.test(key)),
    );
    if (!clitic || !standard) return undefined;
    // The host as the headword writes it.
    const host = cliticOf(
      keyOf(list[0]!.word) === key ? list[0]!.word : key,
    )!.host;
    found = (
      VERB_TO.test(key)
        ? [`${host} to`]
        : (GRAMMAR[clitic.clitic] ?? []).map((word) => `${host} ${word}`)
    ).flatMap((phrase) => expansion(phrase, list[0]!.word));
    return found.length > 0 ? { found, source: "grammar" } : undefined;
  };

  /** Up to MAX_EXPANSIONS, each once whatever its case. */
  const kept = (found: readonly string[]) => {
    const unique: string[] = [];
    for (const phrase of found)
      if (!unique.some((other) => keyOf(other) === keyOf(phrase)))
        unique.push(phrase);
    return unique.slice(0, MAX_EXPANSIONS);
  };
  const table: Record<string, string[]> = {};
  const bySource: Record<Source, number> = {
    senses: 0,
    etymology: 0,
    grammar: 0,
  };
  // Each contraction once, the spellings of others after theirs ("ha'n't" → han't →
  // haven't), a loop left unresolved.
  const done = new Set<string>();
  const open = new Set<string>();
  const resolved = (key: string): readonly string[] | undefined => {
    const list = entries.get(key);
    if (!done.has(key) && list && !open.has(key)) {
      open.add(key);
      const result = expansionsOf(key, list, resolved);
      open.delete(key);
      done.add(key);
      if (result) {
        table[key] = kept(result.found);
        bySource[result.source]++;
      }
    }
    return Object.hasOwn(table, key) ? table[key] : undefined;
  };
  for (const key of entries.keys()) resolved(key);
  return {
    table,
    stats: {
      ...counts,
      contractions: Object.keys(table).length,
      bySource,
    },
  };
}

async function main() {
  const path = process.argv[2] ?? KAIKKI_PATH;
  const { table, stats } = await buildContractions(path, {
    vocab: readPack<VocabPack>("en/vocab.json"),
  });
  writePack("en/contractions.json", table satisfies ContractionPack);
  console.log(
    `contractions: ${stats.entries} entries (${stats.unparsable} unparsable); ` +
      `${stats.contractions} contractions, by source ${JSON.stringify(stats.bySource)}`,
  );
  if (stats.unparsable > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
