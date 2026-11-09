import { color } from "./styles";

export interface SwitchProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
}

/** Mock Main's switch: a 36×22 track, green when on. */
export function Switch(props: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={props.onToggle}
      style={{
        position: "relative",
        flex: "none",
        width: "36px",
        height: "22px",
        borderRadius: "11px",
        border: 0,
        padding: 0,
        margin: 0,
        cursor: "pointer",
        background: props.checked ? color.green : "#C9CDD6",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: props.checked ? "17px" : "3px",
          width: "16px",
          height: "16px",
          borderRadius: "8px",
          background: color.white,
          boxShadow: "0 1px 2px rgba(20,24,43,0.3)",
        }}
      ></span>
    </button>
  );
}
