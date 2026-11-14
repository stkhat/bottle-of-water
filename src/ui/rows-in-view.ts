import { useEffect, useRef } from "preact/hooks";

/**
 * Calls `onInView` with the ids of the rows that come into view in a scrolling list,
 * each time some do: rows are the elements with a `data-row-id` inside the element
 * the returned ref is set on (the scroller). Rows added later are watched too.
 */
export function useRowsInView<E extends HTMLElement>(
  onInView: ((ids: string[]) => void) | undefined,
) {
  const scroller = useRef<E>(null);
  const callback = useRef(onInView);
  callback.current = onInView;
  const observer = useRef<IntersectionObserver>(undefined);
  const watched = useRef(new Set<Element>());

  useEffect(
    () => () => {
      observer.current?.disconnect();
      observer.current = undefined;
      watched.current.clear();
    },
    [],
  );

  useEffect(() => {
    const root = scroller.current;
    if (!root || !callback.current) return;
    observer.current ??= new IntersectionObserver(
      (entries) => {
        const ids = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => (entry.target as HTMLElement).dataset.rowId)
          .filter((id) => id !== undefined);
        if (ids.length > 0) callback.current?.(ids);
      },
      { root },
    );
    const seen = watched.current;
    for (const element of seen)
      if (!root.contains(element)) {
        observer.current.unobserve(element);
        seen.delete(element);
      }
    for (const element of root.querySelectorAll("[data-row-id]"))
      if (!seen.has(element)) {
        observer.current.observe(element);
        seen.add(element);
      }
  });

  return scroller;
}
