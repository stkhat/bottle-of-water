import { useLayoutEffect, useRef } from "preact/hooks";
import { fromUser } from "./from-user";

export interface PressAwayOptions {
  /** Where the capturing listeners go. Default: the window. */
  target?: EventTarget;
  /**
   * Decides a press while it happens: true keeps, false is away at once, undefined
   * leaves it to `keep` once the press has reached every part.
   */
  now?: (event: PointerEvent) => boolean | undefined;
}

/**
 * While `active`, the user's Escape or press elsewhere calls `onAway`. A press is
 * decided once it has reached every part, which mark theirs (a task later): `keep`
 * says whether it keeps. A page script's events count for nothing (`fromUser`).
 * Listening, capturing, from the render that makes it active, not after a paint: an
 * Escape or a press right after still counts. Decisions still pending when it stops
 * are dropped.
 */
export function usePressAway(
  active: boolean,
  onAway: () => void,
  keep: (event: PointerEvent) => boolean,
  options: PressAwayOptions = {},
) {
  const latest = useRef({ onAway, keep, now: options.now });
  latest.current = { onAway, keep, now: options.now };
  const target = options.target ?? window;

  useLayoutEffect(() => {
    if (!active) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const away = () => {
      const { onAway } = latest.current;
      onAway();
    };
    const onPress = (event: Event) => {
      const press = event as PointerEvent;
      if (!fromUser(press)) return;
      const { now } = latest.current;
      const decided = now?.(press);
      if (decided === true) return;
      if (decided === false) {
        away();
        return;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        const { keep } = latest.current;
        if (!keep(press)) away();
      });
      timers.add(timer);
    };
    const onKeyDown = (event: Event) => {
      if (fromUser(event) && (event as KeyboardEvent).key === "Escape") away();
    };
    target.addEventListener("pointerdown", onPress, true);
    target.addEventListener("keydown", onKeyDown, true);
    return () => {
      target.removeEventListener("pointerdown", onPress, true);
      target.removeEventListener("keydown", onKeyDown, true);
      timers.forEach(clearTimeout);
    };
  }, [active]);
}
