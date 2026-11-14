import { useRef } from "preact/hooks";
import type { DataNote } from "../../core/packs/state";
import { languageName } from "../../i18n/languages";
import { t, type MessageKey } from "../../i18n/t";
import { LanguageDataNote } from "../packs/LanguageDataNote";
import { segment, segmentGroup } from "../Segmented";
import { CloseIcon } from "../icons";
import { badge, color, iconButton, root } from "../styles";
import {
  Transcript,
  TranscriptControls,
  type TranscriptControlsProps,
  type TranscriptProps,
} from "./Transcript";
import {
  WordsFilterChips,
  WordsList,
  WordsSortSelect,
  type WordRow,
  type WordsFilter,
  type WordsSort,
} from "../words/WordsList";

export type PanelTab = "transcript" | "words";

export interface VideoPanelProps<R extends WordRow>
  extends TranscriptProps, TranscriptControlsProps {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  /** The Words tab's rows the filter shows, in the sort's order. */
  words: readonly R[];
  wordsFilter: WordsFilter;
  /** How many rows each filter chip shows. */
  wordsCounts: Record<WordsFilter, number>;
  onWordsFilter: (filter: WordsFilter) => void;
  wordsSort: WordsSort;
  onWordsSort: (sort: WordsSort) => void;
  /** A row or one of its chips: jump to that place of the term. */
  onJumpWord: (row: R, place: number) => void;
  /** Rows of the Words tab came into view. */
  onWordsShown?: (rows: R[]) => void;
  height: number;
  /**
   * The chosen pair's language data while some of it is not on the device: a line at
   * the top of the column (mock LanguageData). None by default.
   */
  dataNote?: DataNote | null;
  onRetryData?: () => void;
  /** The × at the right of the tabs: closes the whole column. None without it. */
  onClose?: () => void;
}

const TABS: readonly { id: PanelTab; label: MessageKey }[] = [
  { id: "transcript", label: "video.transcript" },
  { id: "words", label: "kind.words" },
];

const tabId = (tab: PanelTab) => `lingo-tab-${tab}`;
const panelId = (tab: PanelTab) => `lingo-tabpanel-${tab}`;

/** The right column beside the video: the Transcript and Words tabs. */
export function VideoPanel<R extends WordRow>(props: VideoPanelProps<R>) {
  return (
    <aside
      aria-label={t("app.name")}
      style={root({
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: `${props.height}px`,
        background: color.card,
        border: `1px solid ${color.line}`,
        borderRadius: "12px",
        overflow: "hidden",
        fontSize: "14px",
      })}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "16px 16px 0",
        }}
      >
        <span style={badge(24, 7, 12)}>L</span>
        <Tabs tab={props.tab} onTab={props.onTab} />
        {props.onClose && (
          <button
            type="button"
            aria-label={t("video.closeTranscript")}
            title={t("video.closeTranscript")}
            onClick={props.onClose}
            style={{
              ...iconButton,
              width: "36px",
              height: "36px",
              // Mock Main: the 36px button sits in the 16px padding.
              marginRight: "-6px",
              color: color.ink3,
            }}
          >
            <CloseIcon size={18} stroke={1.8} />
          </button>
        )}
      </div>
      {props.dataNote && (
        <div style={{ padding: "12px 12px 0" }}>
          <LanguageDataNote
            note={props.dataNote}
            language={languageName(props.learningLang)}
            onRetry={() => props.onRetryData?.()}
          />
        </div>
      )}
      {TABS.map(({ id }) => (
        <div
          key={id}
          id={panelId(id)}
          role="tabpanel"
          aria-labelledby={tabId(id)}
          hidden={props.tab !== id}
          style={{
            display: props.tab === id ? "flex" : "none",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          {props.tab === id && <TabBody {...props} />}
        </div>
      ))}
    </aside>
  );
}

/** A tab's controls under the tabs, and its list. */
function TabBody<R extends WordRow>(props: VideoPanelProps<R>) {
  return (
    <>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${color.line}`,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {props.tab === "words" ? (
          <>
            <WordsFilterChips
              filter={props.wordsFilter}
              counts={props.wordsCounts}
              onFilter={props.onWordsFilter}
            />
            <WordsSortSelect
              sort={props.wordsSort}
              onSort={props.onWordsSort}
            />
          </>
        ) : (
          <TranscriptControls {...props} />
        )}
      </div>
      {props.tab === "words" ? (
        <WordsList
          rows={props.words}
          learningLang={props.learningLang}
          onJump={props.onJumpWord}
          {...(props.onWordsShown && { onShown: props.onWordsShown })}
        />
      ) : (
        <Transcript {...props} />
      )}
    </>
  );
}

/** The segmented control; the arrow keys move between the tabs (roving tabindex). */
function Tabs(props: { tab: PanelTab; onTab: (tab: PanelTab) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, by: number) => {
    const next = (from + by + TABS.length) % TABS.length;
    props.onTab(TABS[next]!.id);
    buttons.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={t("video.tabs")}
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
        ...segmentGroup,
      }}
    >
      {TABS.map(({ id, label }, i) => {
        const selected = props.tab === id;
        return (
          <button
            key={id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(id)}
            aria-selected={selected}
            aria-controls={panelId(id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => props.onTab(id)}
            onKeyDown={(event) => {
              const by =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (by === 0) return;
              event.preventDefault();
              move(i, by);
            }}
            style={{
              ...segment(selected),
              height: "32px",
              minWidth: 0,
              padding: 0,
            }}
          >
            {t(label)}
          </button>
        );
      })}
    </div>
  );
}
