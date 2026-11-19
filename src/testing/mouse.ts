import { commands } from "vitest/browser";

type MouseStep =
  | { type: "move"; x: number; y: number; steps?: number }
  | { type: "down" | "up" };

declare module "vitest/browser" {
  interface BrowserCommands {
    mouse(steps: MouseStep[]): Promise<void>;
  }
}

/** A point in the test page's viewport. */
export interface Point {
  x: number;
  y: number;
}

/** A point in an element's box, `fx` of its width in (its middle by default). */
export function pointIn(element: Element, fx = 0.5): Point {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width * fx, y: box.top + box.height / 2 };
}

/** The middle of an element's box. */
export const middleOf = (element: Element): Point => pointIn(element);

/** Moves the real mouse (vitest.config.ts `mouse`) to `point`, in `steps` moves. */
export const moveTo = (point: Point, steps = 5) =>
  commands.mouse([{ type: "move", ...point, steps }]);

export const press = () => commands.mouse([{ type: "down" }]);
export const release = () => commands.mouse([{ type: "up" }]);

/**
 * A drag with the real mouse: pressed at the first point, moved through the others in
 * `steps` moves each (a frame or more apart), let go at the last.
 */
export async function drag(points: readonly Point[], steps = 5) {
  const [first, ...rest] = points;
  if (!first) return;
  await commands.mouse([
    { type: "move", ...first },
    { type: "down" },
    ...rest.map((point) => ({ type: "move" as const, ...point, steps })),
    { type: "up" },
  ]);
}
