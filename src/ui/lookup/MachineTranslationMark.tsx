import { t } from "../../i18n/t";
import { color } from "../styles";

/**
 * The "Machine translation" pill after a translation the browser's translator made
 * (mock PhraseMeaning `.mt`); with `text`, the same pill says how the translator's
 * model download goes (mock TranslatedSenses), as a `status`.
 */
export function MachineTranslationMark(props: {
  text?: string;
  status?: boolean;
}) {
  return (
    <span
      role={props.status ? "status" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: "20px",
        padding: "0 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        lineHeight: 1,
        background: color.surfaceGray,
        color: color.ink3,
        whiteSpace: "nowrap",
      }}
    >
      {props.text ?? t("lookup.machineTranslation")}
    </span>
  );
}
