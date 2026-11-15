import type { Span, TermKind, WordStatus } from "../../core/classify";
import { collapseSpaces } from "../../core/text/sentences";
import { own } from "../../core/util";
import type { MeaningLine, TermBrief } from "../../messaging/protocol";
import { visibleSpans } from "../../ui/video/terms";
import type {
  PlaceGroup,
  WordsFilter,
  WordsSort,
} from "../../ui/words/WordsList";

/** A piece of text a list reads its terms from: a transcript card, an article's block. */
export interface WordsUnit<U> {
  unit: U;
  text: string;
  /** Its classified spans; null while not classified. */
  spans: readonly Span[] | null;
}

/**
 * Where a term shows: its unit, its offsets there (a phrase with a gap as a whole) and
 * the index of its span in the unit's spans (a phrase's first part).
 */
export interface Occurrence<U> {
  unit: U;
  start: number;
  end: number;
  span: number;
}

/** A word or phrase of a page, as a Words list shows it. */
export interface ListWord<U> {
  key: string;
  kind: TermKind;
  /** A word's key; a phrase as written where it first appears. */
  head: string;
  category: WordStatus;
  /** Every place it shows, in reading order (as many as it occurs). */
  places: Occurrence<U>[];
}

/** A list row's id: unique per term (a phrase may share a word's key). */
export const wordId = (word: { kind: TermKind; key: string }) =>
  `${word.kind}\n${word.key}`;

/**
 * The words and phrases of the classified units, grouped by key and kind, in order of
 * first appearance, each with its places in reading order. Leaves out what the text
 * does not highlight (`visibleSpans`) and words known only by the frequency level: a
 * known span counts only once its summary says it is saved as known. A phrase with a
 * gap counts once, by its first part.
 */
export function listWords<U>(
  units: Iterable<WordsUnit<U>>,
  summaries: Readonly<Record<string, TermBrief>>,
): ListWord<U>[] {
  const rows = new Map<string, ListWord<U>>();
  for (const { unit, text, spans } of units) {
    if (!spans) continue;
    for (const [span, index] of visibleSpans(spans)) {
      const { key, kind, category } = span;
      if (category === "ignored" || (span.part && span.part.index > 0))
        continue;
      if (category === "known" && own(summaries, key)?.status !== "known")
        continue;
      // A phrase with a gap as a whole.
      const { start, end } = span.part ?? span;
      const place = { unit, start, end, span: index };
      const id = wordId(span);
      const row = rows.get(id);
      if (row) {
        row.places.push(place);
        continue;
      }
      rows.set(id, {
        key,
        kind,
        head: kind === "phrase" ? collapseSpaces(text.slice(start, end)) : key,
        category,
        places: [place],
      });
    }
  }
  return [...rows.values()];
}

/** How many rows each filter chip shows. */
export function filterCounts(
  rows: readonly { category: WordStatus }[],
): Record<WordsFilter, number> {
  const counts = { all: rows.length, new: 0, learning: 0, known: 0 };
  for (const row of rows) counts[row.category]++;
  return counts;
}

/** The rows a filter chip shows. */
export function filterRows<R extends { category: WordStatus }>(
  rows: readonly R[],
  filter: WordsFilter,
): R[] {
  return filter === "all"
    ? [...rows]
    : rows.filter((row) => row.category === filter);
}

/**
 * The rows in a sort's order: as they are (first appearance), A–Z by head in the
 * learning language, or most occurrences first. Ties keep their order.
 */
export function sortRows<R extends { head: string; count: number }>(
  rows: readonly R[],
  sort: WordsSort,
  lang: string,
): R[] {
  const sorted = [...rows];
  if (sort === "az") {
    const collator = new Intl.Collator(lang);
    sorted.sort((a, b) => collator.compare(a.head, b.head));
  } else if (sort === "count") sorted.sort((a, b) => b.count - a.count);
  return sorted;
}

/**
 * The places of a row grouped by the meaning the user chose there (ui.md "Words in this
 * video / Words on this page"): a group per meaning, in order of first appearance, then
 * the places with none. `sentenceOf(i)` is place `i`'s sentence, as choosing a meaning
 * there records it. Undefined when no place has a meaning of `meanings`. A meaning's
 * line is in the native language unless it says otherwise.
 */
function placeGroups(
  count: number,
  sentenceOf: (place: number) => string,
  chosen: readonly { sentence: string; key: string }[],
  meanings: readonly MeaningLine[],
  nativeLang: string,
): PlaceGroup[] | undefined {
  const keyAt = new Map(chosen.map((c) => [c.sentence, c.key]));
  const lines = new Map(meanings.map((m) => [m.key, m]));
  const groups = new Map<string, { meaning: MeaningLine; places: number[] }>();
  const none: number[] = [];
  for (let place = 0; place < count; place++) {
    const key = keyAt.get(sentenceOf(place));
    const meaning = key === undefined ? undefined : lines.get(key);
    if (!meaning) {
      none.push(place);
      continue;
    }
    const group = groups.get(meaning.key);
    if (group) group.places.push(place);
    else groups.set(meaning.key, { meaning, places: [place] });
  }
  if (groups.size === 0) return undefined;
  return [
    ...[...groups.values()].map(({ meaning, places }): PlaceGroup => ({
      meaning: { text: meaning.line, lang: meaning.lineLang ?? nativeLang },
      places,
    })),
    ...(none.length > 0 ? [{ places: none }] : []),
  ];
}

/**
 * A row's meaning: the dictionary's short meaning (with groups, the line of the places
 * with no meaning chosen), or the user's meanings joined by " · " (`mine`) when they
 * were chosen only elsewhere.
 */
function rowMeaning(
  brief: TermBrief | undefined,
  groups: readonly PlaceGroup[] | undefined,
  nativeLang: string,
) {
  const mine = brief?.meanings ?? [];
  if (groups || mine.length === 0)
    return {
      short: brief?.short,
      shortLang: brief?.glossLang ?? nativeLang,
    };
  const langs = new Set(mine.map((m) => m.lineLang ?? nativeLang));
  return {
    short: mine.map((m) => m.line).join(" · "),
    shortLang: langs.size === 1 ? [...langs][0]! : nativeLang,
    mine: true as const,
  };
}

/**
 * A Words list's rows: the words the filter shows, in the sort's order, each with its
 * short meaning from the summaries and what `more` adds (its places). A term with
 * meanings chosen in this list's places has its places grouped by them
 * (`placeGroups`; `sentence(word, i)`: the sentence of the word's place `i`).
 */
export function toWordRows<
  W extends {
    key: string;
    kind: TermKind;
    head: string;
    category: WordStatus;
    count: number;
    places: readonly unknown[];
  },
  X,
>(
  words: readonly W[],
  o: {
    filter: WordsFilter;
    sort: WordsSort;
    summaries: Readonly<Record<string, TermBrief>>;
    learningLang: string;
    nativeLang: string;
    sentence(word: W, place: number): string;
  },
  more: (word: W, id: string) => X,
) {
  return sortRows(filterRows(words, o.filter), o.sort, o.learningLang).map(
    (word) => {
      const id = wordId(word);
      const brief = own(o.summaries, word.key);
      const groups =
        brief?.chosen && brief.meanings
          ? placeGroups(
              word.places.length,
              (place) => o.sentence(word, place),
              brief.chosen,
              brief.meanings,
              o.nativeLang,
            )
          : undefined;
      return {
        id,
        key: word.key,
        head: word.head,
        category: word.category,
        count: word.count,
        ...rowMeaning(brief, groups, o.nativeLang),
        ...(groups && { groups }),
        ...more(word, id),
      };
    },
  );
}
