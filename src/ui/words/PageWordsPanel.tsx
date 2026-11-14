import { t } from "../../i18n/t";
import { CloseIcon } from "../icons";
import { badge, color, iconButton, root } from "../styles";
import {
  WordsFilterChips,
  WordsList,
  WordsSortSelect,
  type WordRow,
  type WordsFilter,
  type WordsSort,
} from "./WordsList";

/** Mock ArticleWords: the panel's width and its inset from the viewport's edges. */
export const WORDS_PANEL_WIDTH = 360;
export const WORDS_PANEL_INSET = 16;

export interface PageWordsPanelProps<R extends WordRow> {
  /** The rows the filter shows, in the sort's order. */
  rows: readonly R[];
  filter: WordsFilter;
  counts: Record<WordsFilter, number>;
  onFilter: (filter: WordsFilter) => void;
  sort: WordsSort;
  onSort: (sort: WordsSort) => void;
  /** A row or one of its chips: go to that place of the term. */
  onJump: (row: R, place: number) => void;
  /** Rows came into view (their meanings may need translating). */
  onShown?: (rows: R[]) => void;
  learningLang: string;
  onClose: () => void;
}

/**
 * "Words on this page" (mock ArticleWords): fixed at the page's right, the words of
 * the whole article with the video Words tab's filter chips, sort, rows and chips.
 */
export function PageWordsPanel<R extends WordRow>(
  props: PageWordsPanelProps<R>,
) {
  return (
    <aside
      aria-label={t("page.words.panel")}
      style={root({
        position: "fixed",
        zIndex: 2147483647,
        top: `${WORDS_PANEL_INSET}px`,
        right: `${WORDS_PANEL_INSET}px`,
        bottom: `${WORDS_PANEL_INSET}px`,
        width: `${WORDS_PANEL_WIDTH}px`,
        display: "flex",
        flexDirection: "column",
        background: color.card,
        border: `1px solid ${color.line}`,
        borderRadius: "12px",
        boxShadow: "0 16px 40px rgba(20,20,30,0.12)",
        overflow: "hidden",
        fontSize: "14px",
      })}
    >
      <div
        style={{
          padding: "12px 10px 12px 16px",
          borderBottom: `1px solid ${color.line}`,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={badge(24, 7, 12)}>L</span>
          <h2
            style={{
              margin: 0,
              flex: 1,
              fontSize: "15px",
              fontWeight: 600,
              color: color.ink,
            }}
          >
            {t("page.words.title")}
          </h2>
          <button
            type="button"
            aria-label={t("page.words.close")}
            title={t("page.words.close")}
            onClick={props.onClose}
            style={{
              ...iconButton,
              width: "36px",
              height: "36px",
              color: color.ink3,
            }}
          >
            <CloseIcon size={18} stroke={1.8} />
          </button>
        </div>
        <WordsFilterChips
          filter={props.filter}
          counts={props.counts}
          onFilter={props.onFilter}
        />
        <WordsSortSelect sort={props.sort} onSort={props.onSort} />
      </div>
      <WordsList
        variant="page"
        rows={props.rows}
        learningLang={props.learningLang}
        onJump={props.onJump}
        {...(props.onShown && { onShown: props.onShown })}
      />
    </aside>
  );
}
