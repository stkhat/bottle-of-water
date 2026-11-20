// What the learning-language pair recipes (learning-pairs.ts) read of a Wiktionary
// edition (kaikki's extract), cut once into kaikki-<edition>-edition-learning.jsonl: its
// entries for words of the learning languages (French, German), and its own language's
// entries with their translation rows into the offered languages and the forms they list
// (for the edition's own words: `readEdition`), without examples, sounds or etymologies.
// Usage: node scripts/data/recipes/learning-slim.ts <edition>…   (e.g. fr de ja)
import { createWriteStream, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { NATIVE_LANGUAGES } from "../../../src/core/natives.ts";
import { RAW_DIR, eachEntry, type KaikkiEntry } from "../common.ts";

/** The learning languages whose pairs into natives other than English recipes build. */
export const LEARNING_PAIR_LANGS = ["fr", "de"] as const;

/** The kaikki extract of an edition, and its slim cut. */
const editionPath = (edition: string, rawDir = RAW_DIR) =>
  join(rawDir, `kaikki-${edition}-edition.jsonl`);
export const learningSlimPath = (edition: string, rawDir = RAW_DIR) =>
  join(rawDir, `kaikki-${edition}-edition-learning.jsonl`);

/** Translation rows kept: into the offered languages (kaikki codes Mandarin cmn too). */
const ROW_CODES: ReadonlySet<string> = new Set([
  ...Object.keys(NATIVE_LANGUAGES),
  "en",
  "cmn",
]);

/** A category name as kaikki gives it (a string, or an object with a name). */
const categoryName = (category: unknown) =>
  typeof category === "string"
    ? category
    : typeof (category as { name?: unknown } | null)?.name === "string"
      ? (category as { name: string }).name
      : "";

/** Only the categories the readers look at: non-constituents. */
const keptCategories = (categories: unknown): unknown[] =>
  Array.isArray(categories)
    ? categories.filter((category) =>
        /non-constituents/i.test(categoryName(category)),
      )
    : [];

/**
 * Translation rows into the offered languages; with `counted`, the other rows too,
 * as their language and sense only: how many languages a sense's table translates
 * orders a word's senses (`readTranslationTables`).
 */
const rowsOf = (rows: unknown, counted = false): unknown[] =>
  Array.isArray(rows)
    ? rows.flatMap((row: unknown) => {
        const {
          lang_code: code,
          sense,
          sense_index: index,
        } = (row ?? {}) as {
          lang_code?: unknown;
          sense?: unknown;
          sense_index?: unknown;
        };
        if (typeof code !== "string") return [];
        if (ROW_CODES.has(code)) return [row];
        return counted
          ? [
              {
                lang_code: code,
                ...(sense !== undefined && { sense }),
                ...(index !== undefined && { sense_index: index }),
              },
            ]
          : [];
      })
    : [];

/**
 * An entry as the learning-pair recipes read it: its senses (glosses, tags, form-of and
 * alt-of), translation rows into the offered languages and forms; undefined for an
 * entry neither of a learning language nor of the edition's own.
 */
export function learningSlimEntry(
  entry: KaikkiEntry,
  edition: string,
): Record<string, unknown> | undefined {
  const code = entry.lang_code ?? "";
  const learning = (LEARNING_PAIR_LANGS as readonly string[]).includes(code);
  if (!learning && code !== edition) return undefined;
  // A learning language's own entries in its own edition: the tables the recipes read.
  const counted = learning && code === edition;
  const senses = (entry.senses ?? []).map((kaikkiSense) => {
    const sense = kaikkiSense as typeof kaikkiSense & { raw_tags?: unknown };
    const translations = rowsOf(sense.translations, counted);
    const categories = keptCategories(sense.categories);
    return {
      ...(sense.glosses !== undefined && { glosses: sense.glosses }),
      ...(sense.tags !== undefined && { tags: sense.tags }),
      ...(sense.raw_tags !== undefined && { raw_tags: sense.raw_tags }),
      ...(sense.form_of !== undefined && { form_of: sense.form_of }),
      ...(sense.alt_of !== undefined && { alt_of: sense.alt_of }),
      ...(categories.length > 0 && { categories }),
      ...(translations.length > 0 && { translations }),
    };
  });
  const translations = rowsOf(entry.translations, counted);
  const categories = keptCategories(entry.categories);
  const forms = (entry.forms ?? []).flatMap((form) =>
    typeof form?.form === "string"
      ? [{ form: form.form, ...(form.tags && { tags: form.tags }) }]
      : [],
  );
  const { lang, tags } = entry as KaikkiEntry & {
    lang?: unknown;
    tags?: unknown;
  };
  return {
    word: entry.word,
    lang_code: entry.lang_code,
    ...(lang !== undefined && { lang }),
    pos: entry.pos,
    ...(tags !== undefined && { tags }),
    ...(categories.length > 0 && { categories }),
    senses,
    ...(translations.length > 0 && { translations }),
    ...(forms.length > 0 && { forms }),
  };
}

/** Writes an edition's slim cut, unless it is there; gives its path. */
async function slimForLearningPairs(edition: string, rawDir = RAW_DIR) {
  const slim = learningSlimPath(edition, rawDir);
  if (existsSync(slim)) return slim;
  const partial = `${slim}.partial`;
  const out = createWriteStream(partial);
  let kept = 0;
  await eachEntry(editionPath(edition, rawDir), (entry) => {
    const found = learningSlimEntry(entry, edition);
    if (!found) return;
    kept++;
    out.write(`${JSON.stringify(found)}\n`);
  });
  await new Promise<void>((done, fail) =>
    out.end((error?: Error | null) => (error ? fail(error) : done())),
  );
  renameSync(partial, slim);
  console.log(`${edition}: ${kept} entries → ${slim}`);
  return slim;
}

if (import.meta.main)
  for (const edition of process.argv.slice(2))
    await slimForLearningPairs(edition);
