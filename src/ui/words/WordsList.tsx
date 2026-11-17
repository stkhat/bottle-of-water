import { Component, type CSSProperties } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import type { WordStatus } from "../../core/classify";
import { t, type MessageKey } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { BookmarkIcon } from "../icons";
import { keepOpen } from "../keep-open";
import { useShownRows } from "../rows-in-view";
import { color, toggleChip } from "../styles";
import { termStyle } from "../video/terms";

type Style = CSSProperties;

/** The filter chips: every row, or one status. */
export type WordsFilter = "all" | WordStatus;

/** The sort: first appearance, A–Z, or most seen first. */
export type WordsSort = "order" | "az" | "count";

/**
 * A line of a row with meanings chosen in its places (mock WordsListsMeanings `.gl`):
 * a meaning and the chips of the places it was chosen in, or the places with none.
 */
export interface PlaceGroup {
  /** The meaning chosen in these places; missing: the places with none chosen. */
  meaning?: { text: string; lang: string };
  /** Indices in the row's `places`. */
  places: readonly number[];
}

export interface WordRow {
  /** Unique in the list. */
  id: string;
  head: string;
  category: WordStatus;
  /** How many times the page or the video shows it. */
  count: number;
  /**
   * The dictionary's short meaning, when it has one; with `mine`, the user's meanings
   * joined by " · " (chosen only elsewhere).
   */
  short?: string;
  shortLang: string;
  /** `short` is the user's meanings: shown with the bookmark mark. */
  mine?: true;
  /**
   * Meanings were chosen in some of its places: a line each, then the places with
   * none, under `short` (the head line then shows no meaning).
   */
  groups?: readonly PlaceGroup[];
  /**
   * Where it shows, in order, as its chips read (the start times of a video's subtitle
   * lines, a page's place numbers): a chip each.
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
        for="langle-words-sort"
        style={{ fontSize: "13px", color: color.muted }}
      >
        {t("words.sort")}
      </label>
      <select
        id="langle-words-sort"
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
  /** One of a row's chips was clicked: jump to that place. */
  onJump: (row: R, place: number) => void;
  /** The pointer entered a row's head (`element`): its hover card shows. */
  onWordEnter: (row: R, element: HTMLElement) => void;
  onWordLeave: () => void;
  /** A row was clicked: its term's dictionary opens. */
  onOpen: (row: R) => void;
  /** The list scrolled (a hover card over a head would stay where the head was). */
  onScroll?: () => void;
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
/** The row's button: the head, the meaning and the count on one line (mock `.rb`). */
const ROW_BUTTON: Style = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
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
    chipLabel(head: string, place: number, places: readonly string[]): string;
    groupLabel(head: string): string;
    moreLabel(count: number): string;
  }
> = {
  video: {
    chipsShown: 5,
    chip: {},
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
    chipLabel: (head, place, places) =>
      t("page.words.jump", { head, n: place + 1, count: places.length }),
    groupLabel: (head) => t("page.words.places", { head }),
    moreLabel: (count) =>
      count === 1 ? t("page.words.more.one") : t("page.words.more", { count }),
  },
};

/** Inline styles cannot hover; the shadow root keeps this rule to the list. */
const HOVER = `[data-word-row][data-selected="false"]:hover{background:${color.soft} !important}`;

/** What a row does with the user's presses: stable across renders (see `Row`). */
interface RowHandlers<R extends WordRow> {
  onJump: (row: R, place: number) => void;
  onWordEnter: (row: R, element: HTMLElement) => void;
  onWordLeave: () => void;
  onOpen: (row: R) => void;
  /** The row's "+N" was pressed. */
  onMore: (id: string) => void;
}

interface RowProps<R extends WordRow> {
  row: R;
  opened: boolean;
  variant: WordsVariant | undefined;
  learningLang: string;
  handlers: RowHandlers<R>;
}

/** The words of a video or page: head with its highlight, count, short meaning and places. */
export function WordsList<R extends WordRow>(props: WordsListProps<R>) {
  const scroller = useShownRows<HTMLDivElement, R>(props.rows, props.onShown);
  /** The rows whose "+N" was pressed. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  // The rows call the latest handlers through these, so new handlers on each render
  // do not render every row again.
  const latest = useRef({ props, opened });
  latest.current = { props, opened };
  const handlers = useMemo<RowHandlers<R>>(
    () => ({
      onJump: (row, place) => latest.current.props.onJump(row, place),
      onWordEnter: (row, element) =>
        latest.current.props.onWordEnter(row, element),
      onWordLeave: () => latest.current.props.onWordLeave(),
      onOpen: (row) => latest.current.props.onOpen(row),
      onMore: (id) => setOpened(new Set(latest.current.opened).add(id)),
    }),
    [],
  );
  return (
    <div
      ref={scroller}
      onScroll={() => props.onScroll?.()}
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
            variant={props.variant}
            learningLang={props.learningLang}
            handlers={handlers}
          />
        ))
      )}
    </div>
  );
}

/** A row; rendered again only when its props change (its handlers stay the same). */
class Row<R extends WordRow> extends Component<RowProps<R>> {
  override shouldComponentUpdate(next: RowProps<R>) {
    const now = this.props;
    return !(
      now.row === next.row &&
      now.opened === next.opened &&
      now.variant === next.variant &&
      now.learningLang === next.learningLang &&
      now.handlers === next.handlers
    );
  }

  override render() {
    return <RowBody {...this.props} />;
  }
}

function RowBody<R extends WordRow>(props: RowProps<R>) {
  const { row, handlers } = props;
  const selected = row.pressed >= 0;
  return (
    <div
      data-word-row
      data-row-id={row.id}
      data-selected={selected}
      style={selected ? ROW_ON : ROW_OFF}
    >
      <button
        type="button"
        aria-label={t("words.openRow", { head: row.head })}
        onClick={onlyFromUser(() => handlers.onOpen(row))}
        // A press on another row opens it in the same window.
        onPointerDown={keepOpen}
        style={ROW_BUTTON}
      >
        <span
          lang={props.learningLang}
          onPointerEnter={onlyFromUser((event) =>
            handlers.onWordEnter(row, event.currentTarget as HTMLElement),
          )}
          onPointerLeave={() => handlers.onWordLeave()}
          style={{
            ...termStyle(row.category, ALL_ON, "ui"),
            flexShrink: 0,
            maxWidth: "70%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "15px",
            fontWeight: 600,
            padding: "0 3px",
            borderRadius: "4px",
          }}
        >
          {row.head}
        </span>
        {/* The meaning takes the rest of the line, cut with an ellipsis. */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "13px",
            lineHeight: 1.45,
            color: color.ink3,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {!row.groups && row.mine && (
            <BookmarkIcon label={t("dict.yourMeaning")} size={12} />
          )}
          <span
            lang={!row.groups && row.short ? row.shortLang : undefined}
            style={ELLIPSIS}
          >
            {row.groups ? "" : row.short}
          </span>
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: "12px",
            color: color.muted,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {t("words.times", { count: row.count })}
        </span>
      </button>
      {row.groups
        ? row.groups.map((group, i) => (
            <GroupLine key={i} {...props} group={group} />
          ))
        : row.places.length > 0 && (
            <Chips
              {...props}
              places={row.places.map((_, place) => place)}
              label={VARIANTS[props.variant ?? "video"].groupLabel(row.head)}
              style={{ marginTop: "4px" }}
            />
          )}
    </div>
  );
}

const ELLIPSIS: Style = { overflow: "hidden", textOverflow: "ellipsis" };

/**
 * A meaning chosen in some of the row's places, with their chips; or the places with
 * none, under the dictionary's short meaning in grey (mock WordsListsMeanings `.gl`).
 */
function GroupLine<R extends WordRow>(
  props: RowProps<R> & { group: PlaceGroup },
) {
  const { row, group } = props;
  const { meaning } = group;
  const text = meaning?.text ?? row.short ?? "";
  const label = meaning
    ? t("words.placesMine", { meaning: text })
    : text
      ? t("words.placesNone", { meaning: text })
      : t("words.placesNoneBare");
  return (
    <div
      data-place-group
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "6px",
        minWidth: 0,
      }}
    >
      {/* The meaning keeps a third of the line; more chips wrap at the right. */}
      <span
        style={{
          flex: 1,
          minWidth: "33%",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "13px",
          lineHeight: 1.45,
          whiteSpace: "nowrap",
          overflow: "hidden",
          color: meaning ? color.ink : color.muted,
        }}
      >
        {meaning && <BookmarkIcon label={t("dict.yourMeaning")} size={12} />}
        <span lang={meaning ? meaning.lang : row.shortLang} style={ELLIPSIS}>
          {text}
        </span>
      </span>
      <Chips
        {...props}
        places={group.places}
        label={label}
        style={{ flex: "0 1 auto", justifyContent: "flex-end" }}
      />
    </div>
  );
}

/** A chip per place of `places`, the first ones and "+N" until that is pressed. */
function Chips<R extends WordRow>(
  props: RowProps<R> & {
    /** Indices in the row's places. */
    places: readonly number[];
    label: string;
    style: Style;
  },
) {
  const { row, handlers } = props;
  const look = VARIANTS[props.variant ?? "video"];
  // A pressed chip past the first ones shows them all.
  const all =
    props.opened || props.places.indexOf(row.pressed) >= look.chipsShown;
  const shown = all ? props.places : props.places.slice(0, look.chipsShown);
  const rest = props.places.length - shown.length;
  return (
    <div
      role="group"
      aria-label={props.label}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        ...props.style,
      }}
    >
      {shown.map((place) => {
        const pressed = row.pressed === place;
        return (
          <button
            key={place}
            type="button"
            aria-label={look.chipLabel(row.head, place, row.places)}
            aria-pressed={pressed}
            onClick={onlyFromUser(() => handlers.onJump(row, place))}
            style={{ ...(pressed ? CHIP_ON : CHIP_OFF), ...look.chip }}
          >
            {row.places[place]}
          </button>
        );
      })}
      {rest > 0 && (
        <button
          type="button"
          aria-label={look.moreLabel(rest)}
          onClick={onlyFromUser(() => handlers.onMore(row.id))}
          style={MORE}
        >
          {t("words.moreText", { count: rest })}
        </button>
      )}
    </div>
  );
}
