import type { Span, WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { highlight } from "../../ui/styles";
import { palettes } from "../../ui/theme";
import { rangeOf, type TextBlock } from "./page-text";

const CATEGORIES: readonly WordStatus[] = ["new", "learning", "known"];

/** The names the highlights are registered under in `CSS.highlights`. */
export const HIGHLIGHT_NAMES: Readonly<Record<WordStatus, string>> = {
  new: "lingo-new",
  learning: "lingo-learning",
  known: "lingo-known",
};

/** Backgrounds where highlights cannot be underlined (the chip swatches). */
const FALLBACK_BACKGROUND: Readonly<Record<WordStatus, string>> = {
  new: highlight.page.new.background,
  learning: highlight.page.learning.background,
  known: palettes.light.surfaceGray,
};

/**
 * The text color under a highlight's background (the mock's ink): the backgrounds are
 * light, so white text on a dark page (YouTube's dark theme) would vanish on them.
 */
const INK_ON_BACKGROUND = palettes.light.ink;

/**
 * Where the underline sits below the baseline, the same for every category: flush
 * with the bottom of the text, where a background ends (a highlight's background
 * covers only the text's height, not the whole line box as in the mock).
 */
const UNDERLINE_OFFSET = "0.2em";

/**
 * The page's highlight styles: only `::highlight(lingo-*)` rules. The mock draws a
 * 2px inset bar at the bottom of each word, which `::highlight()` cannot (no
 * box-shadow), so a 2px underline stands in for it. Without underlines, every
 * category gets a background color instead. Text on a background is drawn dark.
 */
export function highlightCss(underline: boolean): string {
  return CATEGORIES.map((category) => {
    const look = highlight.page[category];
    const declarations = underline
      ? [
          look.background && `background-color: ${look.background}`,
          look.background && `color: ${INK_ON_BACKGROUND}`,
          `text-decoration: underline 2px ${look.underline}`,
          "text-decoration-skip-ink: none",
          `text-underline-offset: ${UNDERLINE_OFFSET}`,
        ]
      : [
          `background-color: ${FALLBACK_BACKGROUND[category]}`,
          `color: ${INK_ON_BACKGROUND}`,
        ];
    const body = declarations.filter(Boolean).join("; ");
    return `::highlight(${HIGHLIGHT_NAMES[category]}) { ${body}; }`;
  }).join("\n");
}

export interface Highlighter {
  /** Highlights a block's spans, replacing what it had. `ignored` spans get none. */
  set(block: TextBlock, spans: readonly Span[]): void;
  remove(block: TextBlock): void;
  /** Shows only the categories switched on (`settings.highlight`). */
  setEnabled(on: Settings["highlight"]): void;
  /** Removes every highlight and the stylesheet. */
  destroy(): void;
}

interface Placed {
  category: WordStatus;
  range: Range;
}

const isHighlighted = (category: Span["category"]): category is WordStatus =>
  category !== "ignored";

/**
 * Highlights spans with the CSS Custom Highlight API: one `Highlight` per category,
 * registered as `lingo-new`, `lingo-learning`, `lingo-known` while that category is
 * on. The styles live in one constructed stylesheet in `document.adoptedStyleSheets`;
 * nothing is added to the page's DOM.
 */
export function createHighlighter(on: Settings["highlight"]): Highlighter {
  const highlights = Object.fromEntries(
    CATEGORIES.map((c) => [c, new Highlight()]),
  ) as Record<WordStatus, Highlight>;
  const placed = new Map<TextBlock, Placed[]>();

  const sheet = new CSSStyleSheet();
  // Firefox 140 does not underline highlights; detecting that waits for Firefox support.
  sheet.replaceSync(highlightCss(true));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  function setEnabled(flags: Settings["highlight"]) {
    for (const category of CATEGORIES) {
      const name = HIGHLIGHT_NAMES[category];
      if (flags[category]) CSS.highlights.set(name, highlights[category]);
      else if (CSS.highlights.get(name) === highlights[category])
        CSS.highlights.delete(name);
    }
  }

  function remove(block: TextBlock) {
    for (const { category, range } of placed.get(block) ?? [])
      highlights[category].delete(range);
    placed.delete(block);
  }

  setEnabled(on);

  return {
    set(block, spans) {
      remove(block);
      const list: Placed[] = [];
      for (const span of spans) {
        const { category } = span;
        if (!isHighlighted(category)) continue;
        const range = rangeOf(block, span.start, span.end);
        highlights[category].add(range);
        list.push({ category, range });
      }
      placed.set(block, list);
    },
    remove,
    setEnabled,
    destroy() {
      setEnabled({ new: false, learning: false, known: false });
      for (const h of Object.values(highlights)) h.clear();
      placed.clear();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (s) => s !== sheet,
      );
    },
  };
}
