import type { Settings } from "../../core/settings";
import { t, type MessageKey } from "../../i18n/t";

type Category = keyof Settings["highlight"];

export interface PageCardProps {
  /** Which categories are highlighted (`settings.highlight`). */
  highlight: Settings["highlight"];
  onToggle: (category: Category) => void;
}

const CHIPS: readonly {
  id: Category;
  label: MessageKey;
  swatch: Record<string, string>;
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

// `all: initial` must come first so page styles inherited through the shadow host cannot leak in.
const ROOT_STYLE =
  "all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 340px; box-sizing: border-box; padding: 14px 16px; background: #FFFFFF; border: 1px solid #E3E5EA; border-radius: 14px; box-shadow: 0 16px 40px rgba(20,20,30,0.12); display: flex; flex-direction: column; gap: 12px; font-family: 'Inter', 'Noto Sans JP', system-ui, sans-serif; font-size: 14px; line-height: normal; color: #14182B;";

/** The top-right card: Lingo's state on the page and the highlight toggles. */
export function PageCard({ highlight: on, onToggle }: PageCardProps) {
  return (
    <div style={ROOT_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "26px",
            height: "26px",
            borderRadius: "7px",
            background: "#0B8A6C",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: "13px",
          }}
        >
          L
        </span>
        <span style={{ fontWeight: 600, fontSize: "15px" }}>
          {t("app.name")}
        </span>
        <span style={{ fontSize: "13px", color: "#5A6075" }}>
          {t("card.pageStatus")}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{ fontSize: "12px", color: "#5A6075", marginRight: "2px" }}
        >
          {t("card.highlight")}
        </span>
        {CHIPS.map((c) => {
          const pressed = on[c.id];
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(c.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "32px",
                padding: "0 10px",
                borderRadius: "999px",
                font: "inherit",
                fontSize: "13px",
                cursor: "pointer",
                ...(pressed
                  ? {
                      background: "#F1F2F5",
                      color: "#14182B",
                      border: "1px solid #A3A8B7",
                    }
                  : {
                      background: "transparent",
                      color: "#5A6075",
                      border: "1px dashed #D5D8E0",
                    }),
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
        })}
      </div>
    </div>
  );
}
