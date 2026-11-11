import type { CSSProperties } from "preact";
import type { WordStatus } from "../core/classify";
import { palettes, tokens } from "./theme";

type Style = CSSProperties;

/** The theme's colors as variables (`./theme`). `white` stays white: text on green, the switch knob. */
export const color = { ...tokens, white: "#FFFFFF" } as const;

export const FONT =
  "'Inter Variable', 'Inter', 'Noto Sans JP', system-ui, sans-serif";
/**
 * IPA in one font with every IPA letter: Noto Sans where installed, else the system
 * UI font (SF on macOS, Segoe UI on Windows). Inter is not shipped to page content,
 * and a fallback letter by letter drew stress marks and θ from other fonts.
 */
export const IPA_FONT = "'Noto Sans', system-ui, sans-serif";
/** "On this page" sentences follow the mock article's serif. */
export const SERIF_FONT = "'Source Serif 4', Georgia, serif";

const light = palettes.light;

/**
 * Highlight colors: `page` is painted into a website's own text (never themed), `ui`
 * is in Lingo's own panels (themed), `onVideo` is brighter for subtitles over a dark
 * video (mock Main `hlStyle` / `ovStyle`).
 */
export const highlight = {
  page: {
    learning: { background: light.hlLearning, underline: light.hlLearningLine },
    new: { background: light.hlNew, underline: light.hlNewLine },
    known: { background: undefined, underline: light.knownLine },
  },
  ui: {
    learning: { background: color.hlLearning, underline: color.hlLearningLine },
    new: { background: color.hlNew, underline: color.hlNewLine },
    known: { background: undefined, underline: color.knownLine },
  },
  onVideo: {
    learning: { background: "rgba(15,159,126,0.55)", underline: "#6FE3C3" },
    new: { background: "rgba(47,111,228,0.55)", underline: "#8DB4FF" },
    known: { background: undefined, underline: "rgba(255,255,255,0.6)" },
  },
} as const;

/** The mock's highlight bar: an inset line at the bottom of the box. */
export const underline = (line: string, px = 2) => `inset 0 -${px}px 0 ${line}`;

/** A term's highlight (its background, if any, and the bar), whatever the switches say. */
export function termMark(
  status: WordStatus,
  colors: "ui" | "onVideo",
  px = 2,
): Style {
  const { background, underline: line } = highlight[colors][status];
  return {
    ...(background && { backgroundColor: background }),
    boxShadow: underline(line, px),
  };
}

/**
 * The root of every part on a web page: `all: initial` first, so page styles inherited
 * through the shadow host cannot leak in.
 */
export function root(style: Style): Style {
  return {
    all: "initial",
    boxSizing: "border-box",
    fontFamily: FONT,
    fontSize: "16px",
    lineHeight: "normal",
    fontWeight: 400,
    color: color.ink,
    textAlign: "left",
    ...style,
  } as Style;
}

/** The green "L" badge. */
export function badge(size: number, radius: number, fontSize: number): Style {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `${radius}px`,
    background: color.green,
    color: color.white,
    fontWeight: 700,
    fontSize: `${fontSize}px`,
  };
}

/** Mock `.ib`. */
export const iconButton: Style = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "none",
  width: "40px",
  height: "40px",
  border: 0,
  background: "none",
  color: color.ink,
  borderRadius: "8px",
  cursor: "pointer",
  padding: 0,
  margin: 0,
};

/** Mock `.sh`. */
export const sectionHeading: Style = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: color.muted,
  fontWeight: 600,
};

/** The transcript's pill chips (highlight toggles, word filters); `offInk` colors an unpressed one. */
export const toggleChip = (pressed: boolean, offInk: string): Style => ({
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
  ...(pressed
    ? {
        background: color.card,
        color: color.ink,
        border: `1px solid ${color.chipLine}`,
        fontWeight: 600,
      }
    : {
        background: "transparent",
        color: offInk,
        border: `1px dashed ${color.track}`,
      }),
});

/** Learning and Known buttons: the selected one is filled. */
export const statusButton = {
  learning: (selected: boolean): Style =>
    selected
      ? {
          background: color.green,
          color: color.white,
          border: `1px solid ${color.green}`,
        }
      : {
          background: color.card,
          color: color.greenDark,
          border: `1px solid ${color.greenLine}`,
        },
  known: (selected: boolean): Style =>
    selected
      ? {
          background: color.ink,
          color: color.onInk,
          border: `1px solid ${color.ink}`,
        }
      : {
          background: color.card,
          color: color.ink3,
          border: `1px solid ${color.lineStrong}`,
        },
};
