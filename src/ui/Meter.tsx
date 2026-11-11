import { color } from "./styles";

/** A green share of a gray track (space used, download progress). */
export function Meter(props: {
  /** Percent filled. */
  share: number;
  height?: number;
  width?: string;
}) {
  const height = props.height ?? 6;
  const bar = {
    display: "block",
    height: `${height}px`,
    borderRadius: `${height / 2}px`,
  };
  return (
    <span
      aria-hidden="true"
      style={{ ...bar, width: props.width, background: color.line }}
    >
      <span
        style={{
          ...bar,
          width: `${props.share}%`,
          background: color.greenBright,
        }}
      ></span>
    </span>
  );
}
