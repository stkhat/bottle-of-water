import { Component, type CSSProperties } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
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
import {
  useTextSelection,
  type Anchor,
  type SelectedText,
} from "./text-selection";

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
  /** The words a drag in a card's original selects (see `TextSelectionProps.onSnap`). */
  onSnap?: (
    cue: number,
    from: number,
    to: number,
    anchor: Anchor,
  ) => SelectedOffsets | undefined;
  /** Words were selected in a card's original (see `TextSelectionProps.onSelect`). */
  onSelect?: (
    cue: number,
    selected: SelectedText | undefined,
  ) => SelectedOffsets | undefined;
  /** The list scrolled (a word's card would no longer be by its word). */
  onListScroll?: () => void;
  /**
   * A word's card or a selection shows: the playing card does not pull the list along
   * meanwhile.
   */
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

/** What a card does with the user's actions: stable across renders (see `Card`). */
type CardHandlers = Required<
  Pick<
    TranscriptProps,
    | "onSeek"
    | "onWordEnter"
    | "onWordLeave"
    | "onWordClick"
    | "onSelectStart"
    | "onSnap"
    | "onSelect"
  >
>;

/** The subtitle cards beside the video (mock Main's right column). */
export function Transcript(props: TranscriptProps) {
  const list = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const pauseMs = props.userScrollPauseMs ?? 4000;
  // The cards call the latest handlers through these, so new handlers on each render
  // do not render every card again.
  const latest = useRef(props);
  latest.current = props;
  const handlers = useMemo<CardHandlers>(
    () => ({
      onSeek: (index) => latest.current.onSeek(index),
      onWordEnter: (cue, span, element) =>
        latest.current.onWordEnter(cue, span, element),
      onWordLeave: () => latest.current.onWordLeave(),
      onWordClick: (cue, span) => latest.current.onWordClick(cue, span),
      onSelectStart: (cue) => latest.current.onSelectStart?.(cue),
      onSnap: (cue, from, to, anchor) =>
        latest.current.onSnap?.(cue, from, to, anchor),
      onSelect: (cue, selected) => latest.current.onSelect?.(cue, selected),
    }),
    [],
  );

  const userScrolled = () => {
    pausedUntil.current = Date.now() + pauseMs;
  };

  /** The pointer is over the list, or a press that began in it is held. */
  const over = useRef(false);
  const pressed = useRef(false);
  /** A smooth scroll to the playing card is under way. */
  const following = useRef(false);

  /**
   * Scrolls the playing card into view, unless the list holds still: while the
   * pointer is over it or presses it (2026-11-19: a card moving under the pointer took
   * the press, and the scroll ended a fresh selection), a word's card or a selection
   * shows, or the user scrolled it a moment ago.
   */
  const followPlaying = () => {
    const el = list.current;
    const { current, holdScroll } = latest.current;
    if (!el || current < 0 || holdScroll || over.current || pressed.current)
      return;
    if (Date.now() < pausedUntil.current) return;
    const card = el.querySelector<HTMLElement>(`[data-cue="${current}"]`);
    if (!card) return;
    // Within the list only: scrollIntoView would scroll the page too.
    const top = Math.max(0, card.offsetTop - el.clientHeight / 3);
    if (Math.abs(el.scrollTop - top) < 1) return;
    following.current = true;
    el.scrollTo({ top, behavior: "smooth" });
  };

  useEffect(() => {
    const el = list.current;
    const ended = () => {
      following.current = false;
    };
    el?.addEventListener("scrollend", ended);
    return () => el?.removeEventListener("scrollend", ended);
  }, []);

  // It catches up once a card or a selection goes.
  useLayoutEffect(followPlaying, [props.current, props.holdScroll]);

  /** Stops a smooth scroll to the playing card where it is. */
  function stopFollowing() {
    const el = list.current;
    if (!el || !following.current) return;
    following.current = false;
    // An instant scroll ends the smooth one; to where it is now, Firefox would take
    // it for no scroll and let the smooth one go on.
    const top = el.scrollTop;
    el.scrollTo({ top: top > 0 ? top - 1 : top + 1, behavior: "instant" });
    el.scrollTo({ top, behavior: "instant" });
  }

  /** A press stops the list where it is (a smooth scroll may be under way). */
  function onPressList(event: PointerEvent) {
    const el = list.current;
    if (!el || !event.isTrusted) return;
    pressed.current = true;
    stopFollowing();
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return;
      removeEventListener("pointerup", onUp, true);
      removeEventListener("pointercancel", onUp, true);
      pressed.current = false;
      // Let go away from the list (a drag past it), it catches up as the pointer
      // leaves it, once the drag's hold on the pointer ends.
      followPlaying();
    };
    addEventListener("pointerup", onUp, true);
    addEventListener("pointercancel", onUp, true);
  }

  return (
    <div
      ref={list}
      data-list
      onWheel={userScrolled}
      onTouchStart={userScrolled}
      onKeyDown={userScrolled}
      onPointerDownCapture={onPressList}
      onPointerEnter={() => {
        // The cards hold still under the pointer.
        over.current = true;
        stopFollowing();
      }}
      onPointerLeave={() => {
        over.current = false;
        followPlaying();
      }}
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
          spans={props.spans[i] ?? null}
          translation={props.translations[i] ?? ""}
          showTranslation={props.showTranslation}
          highlight={props.highlight}
          learningLang={props.learningLang}
          nativeLang={props.nativeLang}
          selectable={props.onSelect !== undefined}
          handlers={handlers}
        />
      ))}
    </div>
  );
}

interface CardProps {
  index: number;
  cue: Cue;
  now: boolean;
  spans: readonly Span[] | null;
  translation: string;
  showTranslation: boolean;
  highlight: Settings["highlight"];
  learningLang: string;
  nativeLang: string;
  /** Words can be selected in the card's original. */
  selectable: boolean;
  handlers: CardHandlers;
}

const sameHighlight = (a: Settings["highlight"], b: Settings["highlight"]) =>
  a.new === b.new && a.learning === b.learning && a.known === b.known;

const sameCard = (a: CardProps, b: CardProps) =>
  a.index === b.index &&
  a.cue === b.cue &&
  a.now === b.now &&
  a.spans === b.spans &&
  a.translation === b.translation &&
  a.showTranslation === b.showTranslation &&
  sameHighlight(a.highlight, b.highlight) &&
  a.learningLang === b.learningLang &&
  a.nativeLang === b.nativeLang &&
  a.selectable === b.selectable &&
  a.handlers === b.handlers;

/**
 * A card renders again only when what it shows changes: a long transcript has hundreds,
 * and the store changes on every hover, selection and line.
 */
class Card extends Component<CardProps> {
  override shouldComponentUpdate(next: CardProps) {
    return !sameCard(this.props, next);
  }

  override render() {
    return <CardBody {...this.props} />;
  }
}

function CardBody(props: CardProps) {
  const { index, cue, now, handlers, translation } = props;
  const time = formatTime(cue.startMs);
  const selection = useTextSelection<HTMLSpanElement>({
    onSelectStart: () => handlers.onSelectStart(index),
    onSnap: (from, to, anchor) => handlers.onSnap(index, from, to, anchor),
    onSelect: props.selectable
      ? (selected) => handlers.onSelect(index, selected)
      : undefined,
  });
  const words = renderTerms(cue.text, props.spans, (span, i, text) => {
    const style = termStyle(span.category, props.highlight, "ui");
    return (
      <TermSpan
        key={`${span.start}`}
        index={i}
        onEnter={(element) => handlers.onWordEnter(index, i, element)}
        onLeave={handlers.onWordLeave}
        onClick={() => {
          if (!selection.selected()) handlers.onWordClick(index, i);
        }}
        stopClick
        style={{
          ...(style && { ...style, padding: "0 2px", borderRadius: "4px" }),
        }}
      >
        {text}
      </TermSpan>
    );
  });
  // A div acting as a button, not a <button>: Firefox selects no text inside a button.
  return (
    <div
      role="button"
      tabIndex={0}
      data-cue={index}
      aria-current={now ? "true" : undefined}
      onClick={() => {
        // A drag over the text selects words: no seek.
        if (!selection.selected()) handlers.onSeek(index);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handlers.onSeek(index);
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
