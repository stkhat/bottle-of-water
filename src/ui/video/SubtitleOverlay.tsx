import type { CSSProperties } from "preact";
import type { Span } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { t } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { color, root } from "../lookup/styles";
import { renderTerms, termStyle } from "./terms";

export interface SubtitleOverlayProps {
  /**
   * Over the video (mock Main: dark boxes), in a large light box under it, or over the
   * video in fullscreen (mock Fullscreen: larger dark boxes).
   */
  variant: "inVideo" | "belowVideo" | "fullscreen";
  /** The playing cue's text. */
  text: string;
  /** The cue's spans; null until it is classified. */
  spans: readonly Span[] | null;
  highlight: Settings["highlight"];
  /** The translation shown at this time ("" when there is none). */
  translation: string;
  /** The subtitle translation switch. */
  showTranslation: boolean;
  /** Text size in percent of the variant's own (`Settings.subtitleSize`). */
  size: number;
  /**
   * How dark the boxes over the video are, in percent (`Settings.subtitleOpacity`).
   * The light box below the video keeps its look.
   */
  opacity: number;
  learningLang: string;
  nativeLang: string;
  /** The index (in `spans`) of the term whose dictionary window is open. */
  selected: number | null;
  onWordEnter: (index: number, element: HTMLElement) => void;
  onWordLeave: () => void;
  onWordClick: (index: number) => void;
}

type Style = CSSProperties;

const LOOK = {
  inVideo: {
    box: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
      textAlign: "center",
      // Clicks around the lines reach the video.
      pointerEvents: "none",
    },
    line: {
      pointerEvents: "auto",
      margin: 0,
      padding: "4px 14px",
      borderRadius: "8px",
      background: "rgba(8,10,16,0.8)",
      color: color.white,
      fontSize: "24px",
      lineHeight: 1.55,
      fontWeight: 500,
    },
    translation: {
      pointerEvents: "auto",
      margin: 0,
      padding: "3px 12px",
      borderRadius: "8px",
      background: "rgba(8,10,16,0.72)",
      color: "#E9EBF0",
      fontSize: "17px",
      lineHeight: 1.5,
    },
    colors: "onVideo",
    outline: "#6FE3C3",
  },
  fullscreen: {
    box: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      textAlign: "center",
      pointerEvents: "none",
    },
    line: {
      pointerEvents: "auto",
      margin: 0,
      padding: "6px 18px",
      borderRadius: "10px",
      background: "rgba(8,10,16,0.8)",
      color: color.white,
      fontSize: "34px",
      lineHeight: 1.5,
      fontWeight: 500,
    },
    translation: {
      pointerEvents: "auto",
      margin: 0,
      padding: "4px 14px",
      borderRadius: "10px",
      background: "rgba(8,10,16,0.72)",
      color: "#E9EBF0",
      fontSize: "24px",
      lineHeight: 1.5,
    },
    colors: "onVideo",
    outline: "#6FE3C3",
  },
  belowVideo: {
    box: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: "100%",
      padding: "18px 24px",
      background: color.surface,
      border: `1px solid ${color.line}`,
      borderRadius: "12px",
      textAlign: "center",
    },
    line: {
      margin: 0,
      fontSize: "26px",
      lineHeight: 1.55,
      fontWeight: 500,
    },
    translation: {
      margin: 0,
      fontSize: "18px",
      lineHeight: 1.6,
      color: color.faint,
    },
    colors: "ui",
    outline: color.green,
  },
} as const satisfies Record<
  SubtitleOverlayProps["variant"],
  {
    box: Style;
    line: Style;
    translation: Style;
    colors: "ui" | "onVideo";
    outline: string;
  }
>;

/** The translation's box is a little lighter than the line's (mock: 0.72 against 0.8). */
const TRANSLATION_SHADE = 0.9;

/** The dark box over the video at `alpha` (0–1). */
const backdrop = (alpha: number) =>
  `rgba(8,10,16,${Math.round(alpha * 1000) / 1000})`;

/** A variant's style with its text scaled and, over the video, its box shaded. */
function adjust(style: Style, scale: number, alpha: number | undefined): Style {
  return {
    ...style,
    fontSize: `${Number.parseFloat(String(style.fontSize)) * scale}px`,
    ...(alpha !== undefined && { background: backdrop(alpha) }),
  };
}

/** Mock `.w`: a highlighted term's box. */
const TERM: Style = {
  padding: "0 3px",
  margin: "0 -1px",
  borderRadius: "5px",
};

/** The playing subtitle with hoverable, clickable terms (mock Main). The caller positions it. */
export function SubtitleOverlay(props: SubtitleOverlayProps) {
  const look = LOOK[props.variant];
  const scale = props.size / 100;
  const alpha = look.colors === "onVideo" ? props.opacity / 100 : undefined;
  const words = renderTerms(props.text, props.spans, (span, index, text) => {
    const style = termStyle(span.category, props.highlight, look.colors);
    const selected = props.selected === index;
    return (
      <span
        key={`${span.start}`}
        data-span={index}
        onPointerEnter={onlyFromUser((e) =>
          props.onWordEnter(index, e.currentTarget as HTMLElement),
        )}
        onPointerLeave={() => props.onWordLeave()}
        onClick={onlyFromUser(() => props.onWordClick(index))}
        style={{
          // As in the mock: a phrase is not broken across lines.
          display: "inline-block",
          cursor: "pointer",
          ...((style || selected) && TERM),
          ...style,
          ...(selected && {
            outline: `2px solid ${look.outline}`,
            outlineOffset: "2px",
          }),
        }}
      >
        {text}
      </span>
    );
  });

  return (
    <div
      role="region"
      aria-label={t("video.subtitle")}
      style={root(look.box as Style)}
    >
      <p lang={props.learningLang} style={adjust(look.line, scale, alpha)}>
        {words}
      </p>
      {props.showTranslation && props.translation !== "" && (
        <p
          lang={props.nativeLang}
          style={adjust(
            look.translation,
            scale,
            alpha === undefined ? undefined : alpha * TRANSLATION_SHADE,
          )}
        >
          {props.translation}
        </p>
      )}
    </div>
  );
}
