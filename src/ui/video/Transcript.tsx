import type { CSSProperties } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { Span } from "../../core/classify";
import type { Settings } from "../../core/settings";
import type { Cue } from "../../core/subtitles/types";
import { t } from "../../i18n/t";
import { formatTime } from "../lookup/elsewhere";
import {
  HighlightChips,
  type HighlightCategory,
} from "../lookup/HighlightChips";
import { color } from "../lookup/styles";
import { Switch } from "../lookup/Switch";
import { renderTerms, termStyle } from "./terms";

export interface TranscriptControlsProps {
  /** The transcript translation switch. */
  showTranslation: boolean;
  onToggleTranslation: () => void;
  highlight: Settings["highlight"];
  onToggleHighlight: (category: HighlightCategory) => void;
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
  /** A card was clicked. */
  onSeek: (index: number) => void;
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

const PLAY_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M7 5l12 7-12 7z"></path>
  </svg>
);

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
          label={t("video.transcriptTranslation")}
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
    if (!el || props.current < 0 || Date.now() < pausedUntil.current) return;
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
  const words = renderTerms(
    cue.text,
    props.spans[index] ?? null,
    (span, _i, text) => {
      const style = termStyle(span.category, props.highlight, "page");
      return (
        <span
          key={`${span.start}`}
          style={style && { ...style, padding: "0 2px", borderRadius: "4px" }}
        >
          {text}
        </span>
      );
    },
  );
  return (
    <button
      type="button"
      data-cue={index}
      aria-current={now ? "true" : undefined}
      onClick={() => props.onSeek(index)}
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
          {PLAY_ICON}
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
        lang={props.learningLang}
        style={{ fontSize: "14px", lineHeight: 1.5 }}
      >
        {words}
      </span>
      {props.showTranslation && translation !== "" && (
        <span
          lang={props.nativeLang}
          style={{
            fontSize: "13px",
            lineHeight: 1.5,
            color: now ? color.ink3 : "#4E5468",
          }}
        >
          {translation}
        </span>
      )}
    </button>
  );
}
