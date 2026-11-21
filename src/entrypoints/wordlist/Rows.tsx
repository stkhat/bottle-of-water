import type { CSSProperties } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t } from "../../i18n/t";
import type { TermSummary } from "../../messaging/protocol";
import { shortDate } from "../../ui/format/format";
import { BookmarkIcon } from "../../ui/icons";
import { useShownRows } from "../../ui/rows-in-view";
import { color } from "../../ui/styles";
import { langAttrs } from "../../ui/text-direction";

type Style = CSSProperties;

export const COLUMNS = "220px minmax(0, 1fr) 110px 70px 110px";
/** A row's height plus the gap under it (px). */
const ROW_STRIDE = 50;
/** Above this many rows, only the rows in view are rendered. */
const WINDOW_ABOVE = 500;
/** Rows rendered beyond the view on each side while windowing. */
const OVERSCAN = 6;

function StatusBadge(props: { status: TermSummary["status"] }) {
  const learning = props.status === "learning";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: "24px",
        padding: "0 9px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: learning ? color.hlLearning : color.surfaceGray,
        color: learning ? color.greenDark : color.ink2,
      }}
    >
      {t(learning ? "status.learning" : "status.known")}
    </span>
  );
}

/**
 * The Meaning column: the meanings the user chose (marked, joined by " · ") instead of
 * the short meaning.
 */
function rowMeaning(term: TermSummary, nativeLang: string) {
  const mine = term.meanings ?? [];
  if (mine.length === 0)
    return { text: term.short ?? "", lang: term.glossLang ?? nativeLang };
  const langs = new Set(mine.map((m) => m.lineLang ?? nativeLang));
  return {
    text: mine.map((m) => m.line).join(" · "),
    lang: langs.size === 1 ? [...langs][0]! : nativeLang,
    mine: true,
  };
}

const phraseTag: Style = {
  fontSize: "11px",
  fontWeight: 600,
  color: color.greenDark,
  background: color.greenPale,
  borderRadius: "999px",
  padding: "2px 7px",
};

function Row(props: {
  term: TermSummary;
  selected: boolean;
  nativeLang: string;
  now: number;
  onPick: () => void;
  style?: Style;
}) {
  const { term, selected } = props;
  const meaning = rowMeaning(term, props.nativeLang);
  return (
    <button
      type="button"
      class={selected ? undefined : "rowb"}
      data-row-id={term.id}
      aria-pressed={selected}
      onClick={props.onPick}
      style={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        alignItems: "center",
        width: "100%",
        height: "48px",
        flex: "none",
        boxSizing: "border-box",
        textAlign: "left",
        borderRadius: "8px",
        font: "inherit",
        color: color.ink,
        cursor: "pointer",
        padding: 0,
        margin: 0,
        ...(selected
          ? {
              background: color.greenPale,
              border: `1px solid ${color.greenLine}`,
            }
          : { background: "transparent", border: "1px solid transparent" }),
        ...props.style,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          minWidth: 0,
        }}
      >
        <span
          data-head
          style={{
            fontSize: "15px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {term.key}
        </span>
        {term.kind === "phrase" && (
          <span style={phraseTag}>{t("kind.phrase")}</span>
        )}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "0 12px",
          minWidth: 0,
          fontSize: "14px",
          color: color.ink2,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {meaning.mine && (
          <BookmarkIcon label={t("wordlist.yourMeanings")} size={13} />
        )}
        <span
          {...langAttrs(meaning.lang)}
          style={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {meaning.text}
        </span>
      </span>
      <span style={{ padding: "0 12px" }}>
        <StatusBadge status={term.status} />
      </span>
      <span
        style={{
          padding: "0 12px",
          fontSize: "14px",
          color: color.ink3,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {term.seen}
      </span>
      <span style={{ padding: "0 12px", fontSize: "13px", color: color.muted }}>
        {shortDate(term.lastSeen, props.now)}
      </span>
    </button>
  );
}

/** The rows, all of them, or only those in view above `WINDOW_ABOVE`. */
export function Rows(props: {
  rows: TermSummary[];
  selectedId: string | null;
  nativeLang: string;
  now: number;
  empty: string | null;
  onPick: (term: TermSummary) => void;
  /** Rows came into view (their meanings may need translating). */
  onShown: (terms: TermSummary[]) => void;
}) {
  const scroller = useShownRows<HTMLDivElement, TermSummary>(
    props.rows,
    props.onShown,
  );
  const [view, setView] = useState({ top: 0, height: 0 });
  const windowed = props.rows.length > WINDOW_ABOVE;

  useEffect(() => {
    const element = scroller.current;
    if (!element || !windowed) return;
    const measure = () =>
      setView({ top: element.scrollTop, height: element.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [windowed]);

  const row = (term: TermSummary, style?: Style) => (
    <Row
      key={term.id}
      term={term}
      selected={term.id === props.selectedId}
      nativeLang={props.nativeLang}
      now={props.now}
      onPick={() => props.onPick(term)}
      {...(style && { style })}
    />
  );

  let content;
  if (windowed) {
    const first = Math.max(0, Math.floor(view.top / ROW_STRIDE) - OVERSCAN);
    const last = Math.min(
      props.rows.length,
      Math.ceil((view.top + view.height) / ROW_STRIDE) + OVERSCAN,
    );
    content = (
      <div
        style={{
          position: "relative",
          flex: "none",
          height: `${props.rows.length * ROW_STRIDE - 2}px`,
        }}
      >
        {props.rows.slice(first, last).map((term, i) =>
          row(term, {
            position: "absolute",
            left: 0,
            top: `${(first + i) * ROW_STRIDE}px`,
          }),
        )}
      </div>
    );
  } else content = props.rows.map((term) => row(term));

  return (
    <div
      ref={scroller}
      data-rows
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      {content}
      {props.empty && (
        <p
          style={{
            margin: 0,
            padding: "24px 12px",
            fontSize: "14px",
            color: color.muted,
          }}
        >
          {props.empty}
        </p>
      )}
    </div>
  );
}
