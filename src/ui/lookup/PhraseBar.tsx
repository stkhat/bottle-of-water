import type { CSSProperties } from "preact";
import { t } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import { color, root } from "./styles";

export interface PhraseBarProps {
  /** The selected words, snapped to word boundaries. */
  text: string;
  onLearning: () => void;
  onKnown: () => void;
}

const BUTTON: CSSProperties = {
  height: "32px",
  padding: "0 12px",
  margin: 0,
  borderRadius: "7px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

/** The dark bar over a multi-word selection (mock Article). The caller positions it. */
export function PhraseBar(props: PhraseBarProps) {
  return (
    <div
      style={root({
        display: "flex",
        width: "max-content",
        alignItems: "center",
        gap: "8px",
        padding: "8px 8px 8px 14px",
        background: color.inverse,
        color: color.onInverse,
        borderRadius: "10px",
        boxShadow: "0 14px 36px rgba(20,20,30,0.25)",
        whiteSpace: "nowrap",
        fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
        fontSize: "13px",
        lineHeight: 1.3,
      })}
    >
      <span>{t("phrase.save", { text: props.text })}</span>
      <button
        type="button"
        onClick={onlyFromUser(() => props.onLearning())}
        style={{
          ...BUTTON,
          border: `1px solid ${color.greenBright}`,
          background: color.green,
          color: color.white,
        }}
      >
        {t("phrase.learning")}
      </button>
      <button
        type="button"
        onClick={onlyFromUser(() => props.onKnown())}
        style={{
          ...BUTTON,
          border: `1px solid ${color.inverseLine}`,
          background: "transparent",
          color: color.onInverse,
        }}
      >
        {t("phrase.known")}
      </button>
    </div>
  );
}
