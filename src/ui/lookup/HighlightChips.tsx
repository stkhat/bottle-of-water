import type { CSSProperties } from "preact";
import type { Settings } from "../../core/settings";
import { t, type MessageKey } from "../../i18n/t";
import { color, sectionHeading } from "./styles";

export type HighlightCategory = keyof Settings["highlight"];

export interface HighlightChipsProps {
  /**
   * Mock Main's transcript header (`video`) or the toolbar popup (`popup`: the same
   * chips under an uppercase heading).
   */
  look: "video" | "popup";
  /** Which categories are highlighted (`settings.highlight`). */
  highlight: Settings["highlight"];
  onToggle: (category: HighlightCategory) => void;
}

const CHIPS: readonly {
  id: HighlightCategory;
  label: MessageKey;
  swatch: CSSProperties;
}[] = [
  {
    id: "new",
    label: "card.chip.new",
    swatch: { boxShadow: "inset 0 -3px 0 #2F6FE4", background: "#EAF0FD" },
  },
  {
    id: "learning",
    label: "card.chip.learning",
    swatch: { background: "#D3F1E5", boxShadow: "inset 0 -3px 0 #0F9F7E" },
  },
  {
    id: "known",
    label: "card.chip.known",
    swatch: { boxShadow: "inset 0 -3px 0 #A3A8B7", background: "#F1F2F5" },
  },
];

const LOOK = {
  on: {
    background: color.white,
    color: color.ink,
    border: "1px solid #8C92A3",
    fontWeight: 600,
  },
  off: {
    background: "transparent",
    color: color.muted,
    border: "1px dashed #C9CDD6",
  },
};

/** "Highlight" and a toggle chip per category. */
export function HighlightChips(props: HighlightChipsProps) {
  const look = LOOK;
  const chips = CHIPS.map((c) => {
    const pressed = props.highlight[c.id];
    return (
      <button
        key={c.id}
        type="button"
        aria-pressed={pressed}
        onClick={() => props.onToggle(c.id)}
        style={{
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
          ...(pressed ? look.on : look.off),
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "16px",
            height: "12px",
            borderRadius: "3px",
            ...c.swatch,
          }}
        ></span>
        {t(c.label)}
      </button>
    );
  });

  if (props.look === "popup")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={sectionHeading}>{t("card.highlight")}</span>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {chips}
        </div>
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{ fontSize: "12px", color: color.muted, marginRight: "2px" }}
      >
        {t("card.highlight")}
      </span>
      {chips}
    </div>
  );
}
