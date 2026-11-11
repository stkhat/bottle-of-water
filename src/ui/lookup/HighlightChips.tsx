import type { WordStatus } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { t, type MessageKey } from "../../i18n/t";
import { color, sectionHeading, termMark, toggleChip } from "../styles";

export interface HighlightChipsProps {
  /**
   * Mock Main's transcript header (`video`) or the toolbar popup (`popup`: the same
   * chips under an uppercase heading).
   */
  look: "video" | "popup";
  highlight: Settings["highlight"];
  onToggle: (category: WordStatus) => void;
}

const CHIPS: readonly { id: WordStatus; label: MessageKey }[] = [
  { id: "new", label: "card.chip.new" },
  { id: "learning", label: "status.learning" },
  { id: "known", label: "status.known" },
];

/** A chip's swatch: the highlight with a 3px bar; Known's on gray. */
const swatch = (id: WordStatus) => ({
  ...termMark(id, "ui", 3),
  ...(id === "known" && { background: color.surfaceGray }),
});

/** "Highlight" and a toggle chip per category. */
export function HighlightChips(props: HighlightChipsProps) {
  const chips = CHIPS.map((c) => {
    const pressed = props.highlight[c.id];
    return (
      <button
        key={c.id}
        type="button"
        aria-pressed={pressed}
        onClick={() => props.onToggle(c.id)}
        style={toggleChip(pressed, color.muted)}
      >
        <span
          style={{
            display: "inline-block",
            width: "16px",
            height: "12px",
            borderRadius: "3px",
            ...swatch(c.id),
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
