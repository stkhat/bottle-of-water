import type { Settings } from "../../core/settings";
import { languageName } from "../../i18n/languages";
import { t } from "../../i18n/t";
import {
  HighlightChips,
  type HighlightCategory,
} from "../../ui/lookup/HighlightChips";

export interface PageCardProps {
  /** Which categories are highlighted (`settings.highlight`). */
  highlight: Settings["highlight"];
  /** The language the user is learning (`settings.learningLang`), the page's language. */
  learningLang: string;
  /** The user's native language (`settings.nativeLang`). */
  nativeLang: string;
  onToggle: (category: HighlightCategory) => void;
}

// `all: initial` must come first so page styles inherited through the shadow host cannot leak in.
const ROOT_STYLE =
  "all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 340px; box-sizing: border-box; padding: 14px 16px; background: #FFFFFF; border: 1px solid #E3E5EA; border-radius: 14px; box-shadow: 0 16px 40px rgba(20,20,30,0.12); display: flex; flex-direction: column; gap: 12px; font-family: 'Inter', 'Noto Sans JP', system-ui, sans-serif; font-size: 14px; line-height: normal; color: #14182B;";

/** The top-right card: Lingo's state on the page and the highlight toggles. */
export function PageCard({
  highlight: on,
  learningLang,
  nativeLang,
  onToggle,
}: PageCardProps) {
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
          {t("card.pageStatus", {
            language: languageName(learningLang),
            from: learningLang.toUpperCase(),
            to: nativeLang.toUpperCase(),
          })}
        </span>
      </div>
      <HighlightChips look="article" highlight={on} onToggle={onToggle} />
    </div>
  );
}
