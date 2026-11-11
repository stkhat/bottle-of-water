import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { color, root } from "./lookup/styles";
import { palettes, THEME_CSS } from "./theme";
import { ThemeScope } from "./ThemeScope";

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

let host: HTMLElement | undefined;
afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = undefined;
});

function card(theme?: "light" | "dark") {
  host = document.createElement("div");
  document.body.append(host);
  const part = (
    <div data-part style={root({ background: color.card })}>
      word
    </div>
  );
  render(theme ? <ThemeScope theme={theme}>{part}</ThemeScope> : part, host);
  const el = host.querySelector<HTMLElement>("[data-part]")!;
  return getComputedStyle(el);
}

describe("ThemeScope", () => {
  it("is light outside any scope", () => {
    const style = card();
    expect(style.backgroundColor).toBe(rgb(palettes.light.card));
    expect(style.color).toBe(rgb(palettes.light.ink));
  });

  it("is light with the light theme", () => {
    const style = card("light");
    expect(style.backgroundColor).toBe(rgb(palettes.light.card));
  });

  it("turns a part dark with the dark theme, through `all: initial`", () => {
    const style = card("dark");
    expect(style.backgroundColor).toBe(rgb(palettes.dark.card));
    expect(style.color).toBe(rgb(palettes.dark.ink));
  });

  it("follows the browser's dark mode under System", () => {
    expect(THEME_CSS).toContain(
      '@media (prefers-color-scheme: dark){[data-lingo-theme="system"]',
    );
  });
});
