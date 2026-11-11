import type { ComponentChildren, CSSProperties } from "preact";
import { color } from "./styles";

/** A settings row's title over its description; a `<label>` when it names a control (`for`). */
export function RowLabel(props: {
  title: ComponentChildren;
  desc: ComponentChildren;
  for?: string;
  /** A sub-row's smaller title. */
  small?: boolean;
  style?: CSSProperties;
  /** Below the description. */
  children?: ComponentChildren;
}) {
  const Tag = props.for ? "label" : "span";
  return (
    <Tag
      for={props.for}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        flex: 1,
        minWidth: 0,
        ...props.style,
      }}
    >
      <span
        style={{ fontSize: props.small ? "14px" : "15px", fontWeight: 600 }}
      >
        {props.title}
      </span>
      <span style={{ fontSize: "13px", lineHeight: 1.45, color: color.muted }}>
        {props.desc}
      </span>
      {props.children}
    </Tag>
  );
}
