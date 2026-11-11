import type { CSSProperties } from "preact";
import { color } from "./styles";

type Style = CSSProperties;

/** Mock `segBtn`'s track: the options sit on it side by side. */
export const segmentGroup: Style = {
  gap: "2px",
  padding: "3px",
  borderRadius: "10px",
  background: color.surfaceGray,
};

/** Mock `segBtn`: the selected option is raised. */
export const segment = (selected: boolean): Style => ({
  margin: 0,
  border: 0,
  borderRadius: "8px",
  font: "inherit",
  fontSize: "13px",
  cursor: "pointer",
  ...(selected
    ? {
        background: color.raised,
        color: color.ink,
        fontWeight: 600,
        boxShadow: "0 1px 3px rgba(20,24,43,0.18)",
      }
    : { background: "transparent", color: color.ink3 }),
});

/** A segmented control: one option pressed at a time. */
export function Segmented<T extends string>(props: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
  /** The track's own look, over equal grid columns. */
  style?: Style;
  /** Each option's size, over `segment`. */
  button: (selected: boolean) => Style;
}) {
  return (
    <div
      role="group"
      aria-label={props.label}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))`,
        ...segmentGroup,
        ...props.style,
      }}
    >
      {props.options.map(({ id, label }) => {
        const selected = props.value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => props.onPick(id)}
            style={{ ...segment(selected), ...props.button(selected) }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
