import type { CSSProperties } from "preact";
import { useRef } from "preact/hooks";
import { t, type MessageKey } from "../../i18n/t";
import { badge, color, root } from "../lookup/styles";
import {
  Transcript,
  TranscriptControls,
  type TranscriptControlsProps,
  type TranscriptProps,
} from "./Transcript";
import {
  WordsFilterChips,
  WordsList,
  type WordRow,
  type WordsFilter,
} from "./WordsList";

/** The tabs of the right column. */
export type PanelTab = "transcript" | "words";

export interface VideoPanelProps
  extends TranscriptProps, TranscriptControlsProps {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  /** The Words tab's rows the filter shows. */
  words: readonly WordRow[];
  wordsFilter: WordsFilter;
  /** How many rows each filter chip shows. */
  wordsCounts: Record<WordsFilter, number>;
  onWordsFilter: (filter: WordsFilter) => void;
  /** A row was clicked: its id. */
  onOpenWord: (id: string) => void;
  /** The height of the whole panel, in px. */
  height: number;
}

type Style = CSSProperties;

const TABS: readonly { id: PanelTab; label: MessageKey }[] = [
  { id: "transcript", label: "video.transcript" },
  { id: "words", label: "video.words" },
];

const tabId = (tab: PanelTab) => `lingo-tab-${tab}`;
const panelId = (tab: PanelTab) => `lingo-tabpanel-${tab}`;

const TAB: Style = {
  height: "32px",
  minWidth: 0,
  padding: 0,
  margin: 0,
  borderRadius: "8px",
  border: 0,
  font: "inherit",
  fontSize: "13px",
  cursor: "pointer",
};
const TAB_ON: Style = {
  ...TAB,
  background: color.raised,
  color: color.ink,
  fontWeight: 600,
  boxShadow: "0 1px 3px rgba(20,24,43,0.18)",
};
const TAB_OFF: Style = {
  ...TAB,
  background: "transparent",
  color: color.ink3,
};

/** The right column beside the video: the Transcript and Words tabs. */
export function VideoPanel(props: VideoPanelProps) {
  return (
    <aside
      aria-label={t("video.panel")}
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
      </div>
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
function TabBody(props: VideoPanelProps) {
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
          <WordsFilterChips
            filter={props.wordsFilter}
            counts={props.wordsCounts}
            onFilter={props.onWordsFilter}
          />
        ) : (
          <TranscriptControls {...props} />
        )}
      </div>
      {props.tab === "words" ? (
        <WordsList
          rows={props.words}
          learningLang={props.learningLang}
          onOpen={props.onOpenWord}
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
        gap: "2px",
        padding: "3px",
        borderRadius: "10px",
        background: color.surfaceGray,
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
            style={selected ? TAB_ON : TAB_OFF}
          >
            {t(label)}
          </button>
        );
      })}
    </div>
  );
}
