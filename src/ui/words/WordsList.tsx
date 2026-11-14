import type { CSSProperties } from "preact";
import { useState } from "preact/hooks";
import type { WordStatus } from "../../core/classify";
import { t, type MessageKey } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { useRowsInView } from "../rows-in-view";
import { color, toggleChip } from "../styles";
import { termStyle } from "../video/terms";

type Style = CSSProperties;

/** The filter chips: every row, or one status. */
export type WordsFilter = "all" | WordStatus;

/** The sort: first appearance, A–Z, or most seen first. */
export type WordsSort = "order" | "az" | "count";

export interface WordRow {
  /** Unique in the list. */
  id: string;
  head: string;
  category: WordStatus;
  /** How many times the page or the video shows it. */
  count: number;
  /** The dictionary's short meaning, when it has one. */
  short?: string;
  shortLang: string;
  /**
   * Where it shows, in order, as its chips read (a video's card start times, a page's
   * place numbers): a chip each when 2 or more.
   */
  places: readonly string[];
  /** The place of the last jump, when it was to this row (its chip shows pressed); else -1. */
  pressed: number;
}

export interface WordsFilterChipsProps {
  filter: WordsFilter;
  counts: Record<WordsFilter, number>;
  onFilter: (filter: WordsFilter) => void;
}

const FILTERS: readonly { id: WordsFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "new", label: "card.chip.new" },
  { id: "learning", label: "status.learning" },
  { id: "known", label: "status.known" },
];

/** "All 9 · New 3 · …": one chip pressed at a time. */
export function WordsFilterChips(props: WordsFilterChipsProps) {
  return (
    <div
      role="group"
      aria-label={t("words.filter")}
      style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
    >
      {FILTERS.map(({ id, label }) => {
        const pressed = props.filter === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            onClick={() => props.onFilter(id)}
            style={toggleChip(pressed, color.ink3)}
          >
            {t(label)}{" "}
            <span
              style={{ fontVariantNumeric: "tabular-nums", color: color.muted }}
            >
              {props.counts[id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface WordsSortProps {
  sort: WordsSort;
  onSort: (sort: WordsSort) => void;
}

const SORTS: readonly { id: WordsSort; label: MessageKey }[] = [
  { id: "order", label: "words.sort.order" },
  { id: "az", label: "words.sort.az" },
  { id: "count", label: "words.sort.count" },
];

/** "Sort" and its select, under the filter chips. */
export function WordsSortSelect(props: WordsSortProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <label
        for="lingo-words-sort"
        style={{ fontSize: "13px", color: color.muted }}
      >
        {t("words.sort")}
      </label>
      <select
        id="lingo-words-sort"
        value={props.sort}
        onChange={(event) =>
          props.onSort(event.currentTarget.value as WordsSort)
        }
        style={{
          height: "32px",
          padding: "0 8px",
          margin: 0,
          border: `1px solid ${color.lineStrong}`,
          borderRadius: "8px",
          background: color.card,
          color: color.ink,
          font: "inherit",
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        {SORTS.map(({ id, label }) => (
          <option key={id} value={id}>
            {t(label)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * What the places are: a video's cards (chips show their times) or a page's
 * occurrences (chips show their numbers).
 */
type WordsVariant = "video" | "page";

export interface WordsListProps<R extends WordRow> {
  /** The rows the filter shows, in the sort's order. */
  rows: readonly R[];
  /** Default "video". */
  variant?: WordsVariant;
  learningLang: string;
  /** A row (its first place) or one of its chips was clicked: jump to that place. */
  onJump: (row: R, place: number) => void;
  /** Rows came into view (their meanings may need translating). */
  onShown?: (rows: R[]) => void;
}

/** Every category highlighted: the list is about the words, not the page's highlights. */
const ALL_ON = { new: true, learning: true, known: true };

const ROW: Style = {
  display: "flex",
  flexDirection: "column",
  padding: "9px 10px",
  borderRadius: "10px",
};
const ROW_OFF: Style = {
  ...ROW,
  background: "transparent",
  border: "1px solid transparent",
};
const ROW_ON: Style = {
  ...ROW,
  background: color.greenPale,
  border: `1px solid ${color.greenLine}`,
};
/** The row's button: the head, the count and the meaning (mock `.rb`). */
const ROW_BUTTON: Style = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  width: "100%",
  boxSizing: "border-box",
  textAlign: "left",
  padding: 0,
  margin: 0,
  border: 0,
  background: "none",
  font: "inherit",
  color: color.ink,
  cursor: "pointer",
};
const CHIP: Style = {
  height: "26px",
  margin: 0,
  borderRadius: "6px",
  font: "inherit",
  fontSize: "12px",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
};
const CHIP_OFF: Style = {
  ...CHIP,
  padding: "0 8px",
  background: color.surfaceGray,
  color: color.greenText,
  border: "1px solid transparent",
};
const CHIP_ON: Style = {
  ...CHIP,
  padding: "0 8px",
  background: color.green,
  color: color.white,
  border: `1px solid ${color.green}`,
};
const MORE: Style = {
  ...CHIP,
  padding: "0 8px",
  fontWeight: "inherit",
  background: "transparent",
  color: color.ink3,
  border: `1px dashed ${color.track}`,
};

/** What differs between a video's list and a page's (mocks VideoWords, ArticleWords). */
const VARIANTS: Record<
  WordsVariant,
  {
    /** The chips a row shows before its "+N" (the ones that fit one line). */
    chipsShown: number;
    chip: Style;
    rowLabel(head: string, first: string): string;
    chipLabel(head: string, place: number, places: readonly string[]): string;
    groupLabel(head: string): string;
    moreLabel(count: number): string;
  }
> = {
  video: {
    chipsShown: 5,
    chip: {},
    rowLabel: (head, time) => t("video.words.jumpRow", { head, time }),
    chipLabel: (_head, place, places) =>
      t("video.words.jump", { time: places[place]! }),
    groupLabel: (head) => t("video.words.places", { head }),
    moreLabel: (count) =>
      count === 1
        ? t("video.words.more.one")
        : t("video.words.more", { count }),
  },
  page: {
    chipsShown: 7,
    // Numbers are narrow: a minimum width keeps 1–9 square-ish.
    chip: { minWidth: "28px", padding: "0 6px" },
    rowLabel: (head) => t("page.words.jumpRow", { head }),
    chipLabel: (head, place, places) =>
      t("page.words.jump", { head, n: place + 1, count: places.length }),
    groupLabel: (head) => t("page.words.places", { head }),
    moreLabel: (count) =>
      count === 1 ? t("page.words.more.one") : t("page.words.more", { count }),
  },
};

/** Inline styles cannot hover; the shadow root keeps this rule to the list. */
const HOVER = `[data-word-row][data-selected="false"]:hover{background:${color.soft} !important}`;

/** The words of a video or page: head with its highlight, count, short meaning and places. */
export function WordsList<R extends WordRow>(props: WordsListProps<R>) {
  const byId = new Map(props.rows.map((row) => [row.id, row]));
  const scroller = useRowsInView<HTMLDivElement>(
    props.onShown &&
      ((ids) =>
        props.onShown?.(
          ids.map((id) => byId.get(id)).filter((row) => row !== undefined),
        )),
  );
  /** The rows whose "+N" was pressed. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  return (
    <div
      ref={scroller}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <style>{HOVER}</style>
      {props.rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "12px",
            fontSize: "13px",
            color: color.muted,
          }}
        >
          {t("words.empty")}
        </p>
      ) : (
        props.rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            opened={opened.has(row.id)}
            onMore={() => setOpened(new Set(opened).add(row.id))}
            {...props}
          />
        ))
      )}
    </div>
  );
}

function Row<R extends WordRow>(
  props: WordsListProps<R> & { row: R; opened: boolean; onMore: () => void },
) {
  const { row } = props;
  const selected = row.pressed >= 0;
  const first = row.places[0];
  return (
    <div
      data-word-row
      data-row-id={row.id}
      data-selected={selected}
      style={selected ? ROW_ON : ROW_OFF}
    >
      <button
        type="button"
        aria-label={
          first === undefined
            ? undefined
            : VARIANTS[props.variant ?? "video"].rowLabel(row.head, first)
        }
        onClick={onlyFromUser(() => props.onJump(row, 0))}
        style={ROW_BUTTON}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
            width: "100%",
          }}
        >
          <span
            lang={props.learningLang}
            style={{
              ...termStyle(row.category, ALL_ON, "ui"),
              fontSize: "15px",
              fontWeight: 600,
              padding: "0 3px",
              borderRadius: "4px",
            }}
          >
            {row.head}
          </span>
          <span style={{ flex: 1 }}></span>
          <span
            style={{
              fontSize: "12px",
              color: color.muted,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {t("words.times", { count: row.count })}
          </span>
        </span>
        {row.short && (
          <span
            lang={row.shortLang}
            style={{
              fontSize: "13px",
              lineHeight: 1.45,
              color: color.ink3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {row.short}
          </span>
        )}
      </button>
      {row.places.length > 1 && <Places {...props} />}
    </div>
  );
}

/** A chip per place, the first ones and "+N" until that is pressed. */
function Places<R extends WordRow>(
  props: WordsListProps<R> & { row: R; opened: boolean; onMore: () => void },
) {
  const { row } = props;
  const look = VARIANTS[props.variant ?? "video"];
  // A pressed chip past the first ones shows them all.
  const all = props.opened || row.pressed >= look.chipsShown;
  const shown = all ? row.places : row.places.slice(0, look.chipsShown);
  const rest = row.places.length - shown.length;
  return (
    <div
      role="group"
      aria-label={look.groupLabel(row.head)}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginTop: "4px",
      }}
    >
      {shown.map((text, place) => {
        const pressed = row.pressed === place;
        return (
          <button
            key={place}
            type="button"
            aria-label={look.chipLabel(row.head, place, row.places)}
            aria-pressed={pressed}
            onClick={onlyFromUser(() => props.onJump(row, place))}
            style={{ ...(pressed ? CHIP_ON : CHIP_OFF), ...look.chip }}
          >
            {text}
          </button>
        );
      })}
      {rest > 0 && (
        <button
          type="button"
          aria-label={look.moreLabel(rest)}
          onClick={onlyFromUser(props.onMore)}
          style={MORE}
        >
          {t("words.moreText", { count: rest })}
        </button>
      )}
    </div>
  );
}
