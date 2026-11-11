import { color } from "./styles";

export interface SwitchProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
  /** `small`: mock Main's 36×22 (default); `large`: the popup's and settings page's 44×26. */
  size?: "small" | "large";
}

const SIZES = {
  small: { width: 36, height: 22, knob: 16, shadow: "0 1px 2px" },
  large: { width: 44, height: 26, knob: 20, shadow: "0 1px 3px" },
} as const;

/** An on/off switch: a rounded track, green when on. */
export function Switch(props: SwitchProps) {
  const size = SIZES[props.size ?? "small"];
  const inset = (size.height - size.knob) / 2;
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
        width: `${size.width}px`,
        height: `${size.height}px`,
        borderRadius: `${size.height / 2}px`,
        border: 0,
        padding: 0,
        margin: 0,
        cursor: "pointer",
        background: props.checked ? color.green : color.track,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: `${inset}px`,
          left: `${props.checked ? size.width - size.knob - inset : inset}px`,
          width: `${size.knob}px`,
          height: `${size.knob}px`,
          borderRadius: `${size.knob / 2}px`,
          background: color.white,
          boxShadow: `${size.shadow} rgba(20,24,43,0.3)`,
        }}
      ></span>
    </button>
  );
}
