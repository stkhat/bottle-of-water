import type { CSSProperties, JSX } from "preact";
import { t } from "../../i18n/t";
import { onlyFromUser } from "../from-user";
import type { WordStatus } from "./HoverCard";
import { color } from "./styles";

type Style = CSSProperties;

const SEGMENT: Style = {
  height: "40px",
  borderRadius: "8px",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const SEGMENT_OFF: Style = {
  background: color.white,
  color: color.ink3,
  border: `1px solid ${color.lineStrong}`,
};

/**
 * Learning / Known / Remove (or "Not saved" while not saved): the dictionary window's
 * and the word list's status group. The pressed one is filled.
 */
export function StatusButtons(props: {
  status: WordStatus;
  onStatus: (status: WordStatus) => void;
  /** The border of the pressed Remove / Not saved button. */
  removeBorder: string;
  /** Learning and Known cannot be pressed (an unsaved term with nowhere to save it from). */
  saveDisabled?: boolean;
}) {
  const { status } = props;

  function segment(
    value: WordStatus,
    label: string,
    on: Style,
    disabled = false,
  ): JSX.Element {
    const pressed = status === value;
    return (
      <button
        type="button"
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onlyFromUser(() => props.onStatus(value))}
        style={{
          ...SEGMENT,
          ...(pressed ? on : SEGMENT_OFF),
          ...(disabled && { cursor: "default", opacity: 0.5 }),
        }}
      >
        {label}
      </button>
    );
  }

  const cannotSave = props.saveDisabled === true && status === "new";
  return (
    <div
      role="group"
      aria-label={t("dict.statusGroup")}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "6px",
      }}
    >
      {segment(
        "learning",
        t("dict.status.learning"),
        {
          background: color.green,
          color: color.white,
          border: `1px solid ${color.green}`,
        },
        cannotSave,
      )}
      {segment(
        "known",
        t("dict.status.known"),
        {
          background: color.ink,
          color: color.white,
          border: `1px solid ${color.ink}`,
        },
        cannotSave,
      )}
      {segment(
        "new",
        t(status !== "new" ? "dict.status.remove" : "dict.status.notSaved"),
        {
          background: color.surfaceGray,
          color: color.ink,
          border: `1px solid ${props.removeBorder}`,
        },
      )}
    </div>
  );
}
