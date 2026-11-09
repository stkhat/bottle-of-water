import { useRef, useState } from "preact/hooks";

export interface Point {
  left: number;
  top: number;
}

/**
 * Drags a `position: fixed` element by a handle. Attach `ref` to the element and
 * `onPointerDown` to the handle; the element stays inside the viewport. The start
 * position is read once; remount (e.g. with a `key`) to place it anew.
 */
export function useDrag<T extends HTMLElement>(initial: Point) {
  const [pos, setPos] = useState<Point>(initial);
  const posRef = useRef(pos);
  posRef.current = pos;
  const ref = useRef<T>(null);

  function onPointerDown(e: PointerEvent) {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const start = { x: e.clientX, y: e.clientY, ...posRef.current };
    const view = handle.ownerDocument.defaultView ?? window;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already released pointers cannot be captured; window listeners still work.
    }

    const move = (ev: PointerEvent) => {
      const root = el.ownerDocument.documentElement;
      const maxLeft = Math.max(0, root.clientWidth - el.offsetWidth);
      const maxTop = Math.max(0, root.clientHeight - el.offsetHeight);
      setPos({
        left: Math.min(maxLeft, Math.max(0, start.left + ev.clientX - start.x)),
        top: Math.min(maxTop, Math.max(0, start.top + ev.clientY - start.y)),
      });
    };
    const end = () => {
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", end);
    };
    const up = (ev: PointerEvent) => {
      move(ev);
      end();
    };
    view.addEventListener("pointermove", move);
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", end);
  }

  return { pos, ref, onPointerDown };
}
