import type { Category, Span } from "../../core/classify";

/** Distinct keys of the unsaved new words in the lists, in their order. */
export function newKeys(
  lists: Iterable<readonly Span[] | null | undefined>,
): string[] {
  const keys = new Set<string>();
  for (const list of lists)
    for (const span of list ?? [])
      if (span.category === "new") keys.add(span.key);
  return [...keys];
}

/**
 * The list with a new category for the spans `change` returns one for (copies; the
 * other spans stay the same objects); undefined when no span changes.
 */
export function recategorized(
  list: readonly Span[],
  change: (span: Span) => Category | undefined,
): Span[] | undefined {
  let next: Span[] | undefined;
  list.forEach((span, i) => {
    const category = change(span);
    if (category === undefined || category === span.category) return;
    next ??= [...list];
    next[i] = { ...span, category };
  });
  return next;
}
