// A learning language's own Wiktionary edition as a second source for the words English
// Wiktionary lacks (CORE): its English translation tables give such a word its senses,
// its inflection tables and its form-of entries ("läuft": 3. Person Singular … des
// Verbs laufen) give it, and English Wiktionary's words, the forms English Wiktionary
// does not list. The edition is first cut to those parts (`slimTables`), once.
import { createWriteStream, existsSync, renameSync } from "node:fs";
import { eachEntry, posLabel, type KaikkiEntry } from "./common.ts";

/** Tags of a table's form that make it an inflected form of its headword. */
const INFLECTION_TAGS: ReadonlySet<string> = new Set([
  ...["nominative", "genitive", "dative", "accusative", "singular", "plural"],
  ...["present", "past", "preterite", "subjunctive-i", "subjunctive-ii"],
  ...["imperative", "participle", "participle-2", "infinitive"],
  ...["comparative", "superlative"],
]);

/**
 * Tags of a table's form that make it another word or spelling, not an inflected form:
 * an abbreviation ("Westjiddisch" lists the places it is spoken in as such, "Morgen"
 * the USA), an auxiliary ("laufen": sein, haben), a variant or old spelling.
 */
const NOT_INFLECTION: ReadonlySet<string> = new Set([
  ...["abbreviation", "auxiliary", "variant", "alternative", "symbol"],
  ...["obsolete", "archaic", "misspelling"],
]);

/**
 * The single words an entry's inflection tables give as its forms, lower case, its own
 * spelling left out: a table's cell without the article the table writes before it in
 * brackets ("(das) Westjiddisch") or the imperative's "!" ("lauf!"); a cell of more
 * words (a pronoun, an auxiliary, an article: "des Westjiddischen", "gelaufen sein")
 * is none.
 */
export function tableForms(entry: KaikkiEntry, word: RegExp): string[] {
  const own = entry.word.trim().toLowerCase();
  const found = new Set<string>();
  for (const { form, tags = [] } of entry.forms ?? []) {
    if (typeof form !== "string") continue;
    if (!tags.some((tag) => INFLECTION_TAGS.has(tag))) continue;
    if (tags.some((tag) => NOT_INFLECTION.has(tag))) continue;
    const cell = form
      .replace(/^\([^)]*\)\s*/u, "")
      .replace(/!$/u, "")
      .trim()
      .toLowerCase()
      .replaceAll("’", "'");
    if (cell !== own && word.test(cell)) found.add(cell);
  }
  return [...found];
}

/** Most translations one sense shows, as English Wiktionary's glosses list a few. */
const TRANSLATIONS_PER_SENSE = 3;
/** Most senses the translations give a word (as the pack's `MAX_SENSES`). */
const MAX_SENSES = 6;

/** A translation as a hover shows it: one clean phrase (no stray bracket, no markup). */
function cleanTranslation(text: string): string | undefined {
  const clean = text.replace(/\s+/gu, " ").trim();
  const balanced = (open: string, close: string) =>
    clean.split(open).length === clean.split(close).length;
  return clean !== "" &&
    balanced("(", ")") &&
    balanced("[", "]") &&
    !/[{}<>|=]/u.test(clean)
    ? clean
    : undefined;
}

/**
 * The first sense number a table row is for ("1", "1, 2", "[2a]" → 1, 1, 2), Infinity
 * for a row that names none.
 */
const senseNumber = (index: unknown) => {
  const found = /\d+/u.exec(typeof index === "string" ? index : "");
  return found ? Number(found[0]) : Infinity;
};

/** An entry's English translation rows, the entry's and its senses'. */
const englishRows = (entry: KaikkiEntry) =>
  [
    ...(entry.translations ?? []),
    ...(entry.senses ?? []).flatMap((sense) => sense.translations ?? []),
  ].filter((row) => row.lang_code === "en" && typeof row.word === "string");

/**
 * An entry's senses from its English translation table, in the edition's order of
 * senses: a sense's translations joined (`TRANSLATIONS_PER_SENSE`; "Rucola" → "rocket,
 * garden rocket, salad rocket"), a verb's with "to" as English Wiktionary glosses verbs
 * ("aufholen" → "to catch up"); a sense whose translations repeat an earlier one's once.
 * The part of speech is the entry's (`posLabel`).
 */
export function translationSenses(
  entry: KaikkiEntry,
): [pos: string, text: string][] {
  const pos = typeof entry.pos === "string" ? posLabel(entry.pos) : "";
  const bySense = new Map<number, string[]>();
  for (const row of englishRows(entry)) {
    const text = cleanTranslation(row.word as string);
    if (text === undefined) continue;
    const number = senseNumber(row.sense_index);
    const list = bySense.get(number) ?? [];
    if (!list.includes(text)) list.push(text);
    bySense.set(number, list);
  }
  const senses: [string, string][] = [];
  const seen = new Set<string>();
  for (const [, words] of [...bySense].sort(([a], [b]) => a - b)) {
    const shown = words
      .slice(0, TRANSLATIONS_PER_SENSE)
      .map((text) =>
        pos === "verb" && !/^to\s/iu.test(text) ? `to ${text}` : text,
      )
      .join(", ");
    if (seen.has(shown)) continue;
    seen.add(shown);
    senses.push([pos, shown]);
    if (senses.length === MAX_SENSES) break;
  }
  return senses;
}

/**
 * An edition's entry cut to what the second source reads (`slimTables`): a proper
 * noun's headword and part of speech only (the build leaves names out), else its
 * form-of senses' pointers, its English translations and its inflection tables' forms
 * (`tableForms`); undefined when it has none of them.
 */
export function tablesEntry(
  entry: KaikkiEntry,
  word: RegExp,
): KaikkiEntry | undefined {
  const head: KaikkiEntry = {
    word: entry.word,
    ...(entry.lang_code !== undefined && { lang_code: entry.lang_code }),
    ...(entry.pos !== undefined && { pos: entry.pos }),
  };
  if (entry.pos === "name") return head;
  const senses = (entry.senses ?? [])
    .filter((sense) => Array.isArray(sense.form_of))
    .map(({ form_of, tags }) => ({ form_of, ...(tags && { tags }) }));
  const translations = englishRows(entry).map((row) => ({
    lang_code: "en",
    word: row.word,
    sense_index: row.sense_index,
  }));
  const forms = tableForms(entry, word).map((form) => ({
    form,
    tags: ["inflection"],
  }));
  if (senses.length + translations.length + forms.length === 0)
    return undefined;
  return {
    ...head,
    ...(senses.length > 0 && { senses }),
    ...(translations.length > 0 && { translations }),
    ...(forms.length > 0 && { forms }),
  };
}

/** The forms a slim entry (`tablesEntry`) lists: its inflection tables' single words. */
export const slimForms = (entry: KaikkiEntry) =>
  (entry.forms ?? []).flatMap(({ form }) =>
    typeof form === "string" ? [form] : [],
  );

/**
 * Writes `slim`, the `lang` entries of the edition at `edition` cut by `tablesEntry`,
 * once: the editions are several GB.
 */
export async function slimTables(
  lang: string,
  edition: string,
  slim: string,
  word: RegExp,
) {
  if (existsSync(slim)) return;
  console.log(`Cutting ${edition} to its names, form-of senses and tables`);
  const partial = `${slim}.partial`;
  const out = createWriteStream(partial);
  await eachEntry(
    edition,
    (entry) => {
      if (entry.lang_code !== lang) return;
      const cut = tablesEntry(entry, word);
      if (cut) out.write(`${JSON.stringify(cut)}\n`);
    },
    (line) => !line.includes(`"lang_code": "${lang}"`),
  );
  await new Promise<void>((resolve, reject) =>
    out.end((error?: Error | null) => (error ? reject(error) : resolve())),
  );
  renameSync(partial, slim);
}
