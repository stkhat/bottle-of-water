import type { CSSProperties } from "preact";
import { t, type MessageKey } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { color } from "../lookup/styles";
import { termStyle } from "./terms";

type Style = CSSProperties;

/** A word's status in the Words tab. */
export type WordCategory = "new" | "learning" | "known";
/** The filter chips: every row, or one category. */
export type WordsFilter = "all" | WordCategory;

/** A row of the Words tab. */
export interface WordRow {
  /** Tells the row to `onOpen`. */
  id: string;
  head: string;
  category: WordCategory;
  /** How many times the video shows it. */
  count: number;
  /** The dictionary's short meaning, when it has one. */
  short?: string;
  /** The language of `short`. */
  shortLang: string;
  /** Its dictionary window is open. */
  selected: boolean;
}

export interface WordsFilterChipsProps {
  filter: WordsFilter;
  counts: Record<WordsFilter, number>;
  onFilter: (filter: WordsFilter) => void;
}

const FILTERS: readonly { id: WordsFilter; label: MessageKey }[] = [
  { id: "all", label: "video.words.all" },
  { id: "new", label: "card.chip.new" },
  { id: "learning", label: "card.chip.learning" },
  { id: "known", label: "card.chip.known" },
];

const CHIP: Style = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  height: "32px",
  padding: "0 10px",
  margin: 0,
  borderRadius: "999px",
  font: "inherit",
  fontSize: "13px",
  cursor: "pointer",
};
const CHIP_ON: Style = {
  ...CHIP,
  background: color.white,
  color: color.ink,
  border: "1px solid #8C92A3",
  fontWeight: 600,
};
const CHIP_OFF: Style = {
  ...CHIP,
  background: "transparent",
  color: color.ink3,
  border: "1px dashed #C9CDD6",
};

/** "All 9 · New 3 · …": one chip pressed at a time. */
export function WordsFilterChips(props: WordsFilterChipsProps) {
  return (
    <div
      role="group"
      aria-label={t("video.words.filter")}
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
            style={pressed ? CHIP_ON : CHIP_OFF}
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

export interface WordsListProps {
  /** The rows the filter shows, in order. */
  rows: readonly WordRow[];
  learningLang: string;
  onOpen: (id: string) => void;
}

/** Every category highlighted: the list is about the words, not the page's highlights. */
const ALL_ON = { new: true, learning: true, known: true };

const ROW: Style = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
  width: "100%",
  boxSizing: "border-box",
  textAlign: "left",
  padding: "9px 10px",
  margin: 0,
  borderRadius: "10px",
  font: "inherit",
  color: color.ink,
  cursor: "pointer",
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

/** Inline styles cannot hover; the shadow root keeps this rule to the list. */
const HOVER = `[data-word-row][aria-pressed="false"]:hover{background:#EEF0F3 !important}`;

/** The words of the video: head with its highlight, count and short meaning. */
export function WordsList(props: WordsListProps) {
  return (
    <div
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
          {t("video.words.empty")}
        </p>
      ) : (
        props.rows.map((row) => <Row key={row.id} row={row} {...props} />)
      )}
    </div>
  );
}

function Row(props: WordsListProps & { row: WordRow }) {
  const { row } = props;
  return (
    <button
      type="button"
      data-word-row
      aria-pressed={row.selected}
      onClick={onlyFromUser(() => props.onOpen(row.id))}
      style={row.selected ? ROW_ON : ROW_OFF}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
        }}
      >
        <span
          lang={props.learningLang}
          style={{
            ...termStyle(row.category, ALL_ON, "page"),
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
          {t("video.words.times", { count: row.count })}
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
          }}
        >
          {row.short}
        </span>
      )}
    </button>
  );
}
