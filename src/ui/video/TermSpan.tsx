import type { ComponentChildren, CSSProperties } from "preact";
import { fromUser, onlyFromUser } from "../from-user";
import { keepOpen } from "../keep-open";

/** A term in a subtitle or a transcript card: hovering shows its card, a click opens it. */
export function TermSpan(props: {
  /** Its index in the cue's spans. */
  index: number;
  style: CSSProperties;
  onEnter: (element: HTMLElement) => void;
  onLeave: () => void;
  onClick: () => void;
  /** The click stays here (a transcript card seeks on a click). */
  stopClick?: boolean;
  children: ComponentChildren;
}) {
  return (
    <span
      data-span={props.index}
      onPointerEnter={onlyFromUser((e) =>
        props.onEnter(e.currentTarget as HTMLElement),
      )}
      onPointerLeave={() => props.onLeave()}
      onPointerDown={keepOpen}
      onClick={(e) => {
        if (props.stopClick) e.stopPropagation();
        if (fromUser(e)) props.onClick();
      }}
      style={{ cursor: "pointer", ...props.style }}
    >
      {props.children}
    </span>
  );
}
