import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { keepOpen } from "../../ui/lookup/keep-open";
import type { Box } from "../article/geometry";

const TOP_LAYER = 2147483647;

/** Gap between a word and the card or bar above it (mock `.pop`). */
const GAP = 10;
/** Closest a floating card comes to the viewport's edges. */
const EDGE = 8;

interface FloatingProps {
  anchor: Box;
  /** How far left of the anchor it starts (mock Article 10px, mock Main 8px). */
  shift?: number;
  children: ComponentChildren;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onMouseDown?: (event: MouseEvent) => void;
}

/**
 * Places its content 10px above the anchor and `shift` px left of it, like the mocks'
 * word popups; below the anchor when there is no room above. Kept inside the viewport.
 */
export function Floating(props: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { anchor } = props;
  const shift = props.shift ?? GAP;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(
      EDGE,
      Math.min(anchor.left - shift, innerWidth - width - EDGE),
    );
    const above = anchor.top - GAP - height;
    const top = above >= EDGE ? above : anchor.bottom + GAP;
    if (pos?.left !== left || pos.top !== top) setPos({ left, top });
  });

  return (
    <div
      ref={ref}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
      onMouseDown={props.onMouseDown}
      // A press on a card keeps the dictionary window open.
      onPointerDown={keepOpen}
      style={{
        position: "fixed",
        zIndex: TOP_LAYER,
        left: `${pos?.left ?? 0}px`,
        top: `${pos?.top ?? 0}px`,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {props.children}
    </div>
  );
}
