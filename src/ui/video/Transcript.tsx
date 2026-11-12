import type { CSSProperties } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { Span, WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import type { Cue } from "../../core/subtitles/types";
import { t } from "../../i18n/t";
import { formatTime } from "../format/format";
import { PlayIcon } from "../icons";
import { HighlightChips } from "../lookup/HighlightChips";
import { color } from "../styles";
import { Switch } from "../Switch";
import { renderTerms, termStyle } from "./terms";
import { TermSpan } from "./TermSpan";
import type { SelectedOffsets } from "../selection-in-root";
import { useTextSelection, type SelectedText } from "./text-selection";

export interface TranscriptControlsProps {
  showTranslation: boolean;
  onToggleTranslation: () => void;
  highlight: Settings["highlight"];
  onToggleHighlight: (category: WordStatus) => void;
}

export interface TranscriptProps {
  cues: readonly Cue[];
  /** Spans of each cue; null until it is classified. */
  spans: readonly (readonly Span[] | null)[];
  /** The translation of each cue ("" when none). */
  translations: readonly string[];
  showTranslation: boolean;
  highlight: Settings["highlight"];
  /** The card to emphasize and keep in view; -1 for none. */
  current: number;
  /** A card was clicked (not on a word). */
  onSeek: (index: number) => void;
  /** The pointer entered a word: its card, its index in the card's spans and its element. */
  onWordEnter: (cue: number, span: number, element: HTMLElement) => void;
  onWordLeave: () => void;
  /** A word was clicked: its dictionary window opens. */
  onWordClick: (cue: number, span: number) => void;
  /** A press on a card's original began selecting words in it. */
  onSelectStart?: (cue: number) => void;
  /** Words were selected in a card's original (see `TextSelectionProps.onSelect`). */
  onSelect?: (
    cue: number,
    selected: SelectedText | undefined,
  ) => SelectedOffsets | undefined;
  /** The list scrolled (a word's card would no longer be by its word). */
  onListScroll?: () => void;
  /** A word's card shows: the playing card does not pull the list along meanwhile. */
  holdScroll?: boolean;
  learningLang: string;
  nativeLang: string;
  /** How long auto-scrolling waits after the user scrolls the list (ms). */
  userScrollPauseMs?: number;
}

type Style = CSSProperties;

const CARD: Style = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  width: "100%",
  boxSizing: "border-box",
  textAlign: "left",
  padding: "10px 12px",
  margin: 0,
  border: "1px solid transparent",
  borderRadius: "10px",
  background: color.surface,
  color: color.ink,
  font: "inherit",
  cursor: "pointer",
};

const CARD_NOW: Style = {
  ...CARD,
  border: `1px solid ${color.greenLine}`,
  background: color.greenPale,
};

/** The Transcript tab's controls: the Highlight chips and the Translation switch. */
export function TranscriptControls(props: TranscriptControlsProps) {
  return (
    <>
      <HighlightChips
        look="video"
        highlight={props.highlight}
        onToggle={props.onToggleHighlight}
      />
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          color: color.ink3,
        }}
      >
        {t("video.translation")}
        <Switch
          checked={props.showTranslation}
          label={t("transcript.translation")}
          onToggle={props.onToggleTranslation}
        />
      </span>
    </>
  );
}

/** The subtitle cards beside the video (mock Main's right column). */
export function Transcript(props: TranscriptProps) {
  const list = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const pauseMs = props.userScrollPauseMs ?? 4000;

  const userScrolled = () => {
    pausedUntil.current = Date.now() + pauseMs;
  };

  useLayoutEffect(() => {
    const el = list.current;
    if (!el || props.current < 0 || props.holdScroll) return;
    if (Date.now() < pausedUntil.current) return;
    const card = el.querySelector<HTMLElement>(`[data-cue="${props.current}"]`);
    if (!card) return;
    // Within the list only: scrollIntoView would scroll the page too.
    const top = card.offsetTop - el.clientHeight / 3;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [props.current]);

  return (
    <div
      ref={list}
      data-list
      onWheel={userScrolled}
      onTouchStart={userScrolled}
      onKeyDown={userScrolled}
      onScroll={() => props.onListScroll?.()}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {props.cues.map((cue, i) => (
        <Card
          key={i}
          index={i}
          cue={cue}
          now={i === props.current}
          {...props}
        />
      ))}
    </div>
  );
}

function Card(
  props: TranscriptProps & { index: number; cue: Cue; now: boolean },
) {
  const { index, cue, now } = props;
  const time = formatTime(cue.startMs);
  const translation = props.translations[index] ?? "";
  const selection = useTextSelection<HTMLSpanElement>({
    onSelectStart: () => props.onSelectStart?.(index),
    onSelect:
      props.onSelect && ((selected) => props.onSelect?.(index, selected)),
  });
  const words = renderTerms(
    cue.text,
    props.spans[index] ?? null,
    (span, i, text) => {
      const style = termStyle(span.category, props.highlight, "ui");
      return (
        <TermSpan
          key={`${span.start}`}
          index={i}
          onEnter={(element) => props.onWordEnter(index, i, element)}
          onLeave={props.onWordLeave}
          onClick={() => {
            if (!selection.selected()) props.onWordClick(index, i);
          }}
          stopClick
          style={{
            ...(style && { ...style, padding: "0 2px", borderRadius: "4px" }),
          }}
        >
          {text}
        </TermSpan>
      );
    },
  );
  // A div acting as a button, not a <button>: Firefox selects no text inside a button.
  return (
    <div
      role="button"
      tabIndex={0}
      data-cue={index}
      aria-current={now ? "true" : undefined}
      onClick={() => {
        // A drag over the text selects words: no seek.
        if (!selection.selected()) props.onSeek(index);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onSeek(index);
      }}
      style={now ? CARD_NOW : CARD}
    >
      {now ? (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: color.greenDark,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <PlayIcon />
          {t("video.nowPlaying", { time })}
        </span>
      ) : (
        <span
          style={{
            fontSize: "12px",
            color: color.muted,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {time}
        </span>
      )}
      <span
        ref={selection.ref}
        lang={props.learningLang}
        onPointerDown={selection.onPointerDown}
        style={{ fontSize: "14px", lineHeight: 1.5, userSelect: "text" }}
      >
        {words}
      </span>
      {props.showTranslation && translation !== "" && (
        <span
          lang={props.nativeLang}
          style={{
            fontSize: "13px",
            lineHeight: 1.5,
            color: now ? color.ink3 : color.faint,
          }}
        >
          {translation}
        </span>
      )}
    </div>
  );
}
