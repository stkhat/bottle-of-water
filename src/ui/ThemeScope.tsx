import type { ComponentChildren } from "preact";
import { THEME_CSS, type Theme } from "./theme";

/**
 * Applies the theme to everything inside: the theme's variables on a wrapper that
 * takes no box of its own. `all: initial` on a part's root leaves variables alone.
 */
export function ThemeScope(props: {
  theme: Theme;
  children: ComponentChildren;
}) {
  return (
    <>
      <style>{THEME_CSS}</style>
      <div data-lingo-theme={props.theme} style={{ display: "contents" }}>
        {props.children}
      </div>
    </>
  );
}
