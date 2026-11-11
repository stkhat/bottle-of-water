import type { Settings } from "../core/settings";

/**
 * Lingo's UI colors, light (the mock) and dark (spec: "Theme"). Over-video subtitles
 * and the highlights painted into a website's own text are not themed.
 */
export const palettes = {
  light: {
    surface: "#F6F7F9",
    surfaceGray: "#F1F2F5",
    card: "#FFFFFF",
    raised: "#FFFFFF",
    soft: "#EEF0F3",
    line: "#E3E5EA",
    lineStrong: "#D5D8E0",
    ink: "#14182B",
    ink2: "#2A2F45",
    ink3: "#3A4056",
    muted: "#5A6075",
    faint: "#4E5468",
    onInk: "#FFFFFF",
    green: "#0B8A6C",
    greenBright: "#0F9F7E",
    greenText: "#0B7F65",
    greenDark: "#075C49",
    greenLine: "#8FD3BC",
    greenPale: "#E6F6F0",
    track: "#C9CDD6",
    chipLine: "#8C92A3",
    knownLine: "#A3A8B7",
    danger: "#B42318",
    inverse: "#14182B",
    onInverse: "#F1F2F5",
    inverseLine: "#52525B",
    tab: "#E8EAEE",
    hlLearning: "#D3F1E5",
    hlLearningLine: "#0F9F7E",
    hlNew: "#EAF0FD",
    hlNewLine: "#2F6FE4",
  },
  dark: {
    surface: "#12151F",
    surfaceGray: "#232838",
    card: "#1A1E2A",
    raised: "#3A4053",
    soft: "#262B3B",
    line: "#2E3344",
    lineStrong: "#3D4357",
    ink: "#E8EAF0",
    ink2: "#CDD1DC",
    ink3: "#B4B9C7",
    muted: "#9AA0B0",
    faint: "#B0B5C3",
    onInk: "#14182B",
    green: "#0B8A6C",
    greenBright: "#0F9F7E",
    greenText: "#3CC9A3",
    greenDark: "#6FE3C3",
    greenLine: "#2A7A63",
    greenPale: "#133A30",
    track: "#4A5066",
    chipLine: "#7A8094",
    knownLine: "#6B7186",
    danger: "#F97066",
    inverse: "#2A3042",
    onInverse: "#F1F2F5",
    inverseLine: "#4A5066",
    tab: "#232838",
    hlLearning: "rgba(15,159,126,0.32)",
    hlLearningLine: "#3CC9A3",
    hlNew: "rgba(47,111,228,0.32)",
    hlNewLine: "#7FA6F5",
  },
} as const;

export type ColorToken = keyof (typeof palettes)["light"];
export type Theme = Settings["theme"];

const varName = (token: string) =>
  `--lingo-${token.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * Each token as `var(--lingo-…, <light value>)`: the light palette applies wherever no
 * theme scope sets the variables (tests, and before settings load).
 */
export const tokens = Object.fromEntries(
  Object.entries(palettes.light).map(([token, light]) => [
    token,
    `var(${varName(token)}, ${light})`,
  ]),
) as { readonly [K in ColorToken]: string };

const declarations = (palette: Record<ColorToken, string>) =>
  Object.entries(palette)
    .map(([token, value]) => `${varName(token)}:${value}`)
    .join(";");

/** Sets the dark variables under `data-lingo-theme="dark"`, or "system" in a dark browser. */
export const THEME_CSS = [
  `[data-lingo-theme]{color-scheme:light}`,
  `[data-lingo-theme="dark"]{color-scheme:dark;${declarations(palettes.dark)}}`,
  `@media (prefers-color-scheme: dark){[data-lingo-theme="system"]{color-scheme:dark;${declarations(palettes.dark)}}}`,
].join("\n");
