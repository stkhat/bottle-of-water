import { t } from "../../i18n/t";
import { SaveAll, type SaveAllProps } from "./SaveAll";
import { badge, color, root } from "./styles";

export interface EndCardProps {
  /** At the end of a video (mock Main) or an article (mock Article). */
  kind: "video" | "article";
  saveAll: Omit<SaveAllProps, "scope" | "cardNote">;
  onClose: () => void;
}

const BOX = {
  video: { width: "320px", boxShadow: "0 18px 48px rgba(20,24,43,0.22)" },
  article: { width: "340px", boxShadow: "0 16px 40px rgba(20,24,43,0.18)" },
} as const;

/** The card offering to save the rest when a video ends or an article is read. The caller positions it. */
export function EndCard(props: EndCardProps) {
  return (
    <section
      aria-label={t("endCard.region")}
      style={root({
        ...BOX[props.kind],
        padding: "14px 16px",
        background: color.white,
        border: `1px solid ${color.line}`,
        borderRadius: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      })}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={badge(26, 7, 13)}>L</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: "15px" }}>
          {t(props.kind === "video" ? "endCard.video" : "endCard.article")}
        </span>
        <button
          type="button"
          aria-label={t("endCard.close")}
          onClick={props.onClose}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            border: 0,
            borderRadius: "16px",
            background: "transparent",
            color: color.ink3,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </div>
      <SaveAll {...props.saveAll} scope={props.kind} cardNote />
    </section>
  );
}
