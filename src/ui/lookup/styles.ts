import type { CSSProperties } from "preact";

type Style = CSSProperties;

/** The palette shared by the lookup UI (mock: Main, Article, Toolbar). */
export const color = {
  ink: "#14182B",
  ink2: "#2A2F45",
  ink3: "#3A4056",
  muted: "#5A6075",
  line: "#E3E5EA",
  lineStrong: "#D5D8E0",
  surface: "#F6F7F9",
  surfaceGray: "#F1F2F5",
  white: "#FFFFFF",
  green: "#0B8A6C",
  greenText: "#0B7F65",
  greenDark: "#075C49",
  greenLine: "#8FD3BC",
  greenPale: "#E6F6F0",
} as const;

export const FONT =
  "'Inter Variable', 'Inter', 'Noto Sans JP', system-ui, sans-serif";
export const IPA_FONT = "'Noto Sans', 'Inter', sans-serif";
/** "On this page" sentences follow the mock article's serif. */
export const SERIF_FONT = "'Source Serif 4', Georgia, serif";

/**
 * Highlight colors per category: `page` over page text, `onVideo` brighter for
 * subtitles drawn over a dark video (mock Main `hlStyle` / `ovStyle`).
 */
export const highlight = {
  page: {
    learning: { background: "#D3F1E5", underline: "#0F9F7E" },
    new: { background: undefined, underline: "#2F6FE4" },
    known: { background: undefined, underline: "#A3A8B7" },
  },
  onVideo: {
    learning: { background: "rgba(15,159,126,0.55)", underline: "#6FE3C3" },
    new: { background: undefined, underline: "#8DB4FF" },
    known: { background: undefined, underline: "rgba(255,255,255,0.6)" },
  },
} as const;

/**
 * The root of every lookup part. `all: initial` comes first so page styles inherited
 * through the shadow host cannot leak in; then the base font and color.
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

/** Mock `.ib`: a 40px square icon button. */
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

/** Mock `.sh`: an uppercase section heading. */
export const sectionHeading: Style = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: color.muted,
  fontWeight: 600,
};

/** "+ Learning" / "Known": the selected state is filled. */
export const statusButton = {
  learning: (selected: boolean): Style =>
    selected
      ? {
          background: color.green,
          color: color.white,
          border: `1px solid ${color.green}`,
        }
      : {
          background: color.white,
          color: color.greenDark,
          border: `1px solid ${color.greenLine}`,
        },
  known: (selected: boolean): Style =>
    selected
      ? {
          background: color.ink,
          color: color.white,
          border: `1px solid ${color.ink}`,
        }
      : {
          background: color.white,
          color: color.ink3,
          border: `1px solid ${color.lineStrong}`,
        },
};
