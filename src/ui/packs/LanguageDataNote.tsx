import type { CSSProperties } from "preact";
import type { DataNote } from "../../core/packs/state";
import { t } from "../../i18n/t";
import { color } from "../lookup/styles";

type Style = CSSProperties;

/** Mock LanguageData `.note`. */
const NOTE: Style = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: color.surface,
  color: color.ink,
  fontSize: "13px",
  lineHeight: 1.4,
};

/** Mock LanguageData `.rb`: the small Retry button. */
const RETRY: Style = {
  flex: "none",
  height: "32px",
  margin: 0,
  padding: "0 12px",
  borderRadius: "7px",
  border: `1px solid ${color.lineStrong}`,
  background: color.card,
  color: color.ink,
  font: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

/**
 * The line the popup and the video column show while the chosen pair's language data
 * is not on the device (mock LanguageData): "Downloading Spanish data · 45%" over a
 * bar, or "Couldn't download Spanish data" with Retry.
 */
export function LanguageDataNote(props: {
  note: DataNote;
  /** The learning language's name ("Spanish"). */
  language: string;
  onRetry: () => void;
}) {
  const { note, language } = props;
  if (note.state === "failed")
    return (
      <div role="status" style={NOTE}>
        <span style={{ flex: 1, minWidth: 0 }}>
          {t("data.failed", { language })}
        </span>
        <button type="button" onClick={props.onRetry} style={RETRY}>
          {t("action.retry")}
        </button>
      </div>
    );
  return (
    <div
      role="status"
      style={{
        ...NOTE,
        flexDirection: "column",
        alignItems: "stretch",
        gap: "8px",
      }}
    >
      <span>{t("data.downloading", { language, percent: note.percent })}</span>
      <span
        aria-hidden="true"
        style={{
          display: "block",
          width: "100%",
          height: "6px",
          borderRadius: "3px",
          background: color.line,
        }}
      >
        <span
          style={{
            display: "block",
            width: `${note.percent}%`,
            height: "100%",
            borderRadius: "3px",
            background: color.greenBright,
          }}
        ></span>
      </span>
    </div>
  );
}
