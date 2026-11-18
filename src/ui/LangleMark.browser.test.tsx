import { afterEach, describe, expect, test } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../testing/shadow-root";
import iconSvg from "./brand/icon.svg?raw";
import { LangleMark } from "./LangleMark";

afterEach(cleanUpMounts);

describe("LangleMark", () => {
  test("draws every shape of brand/icon.svg at the given size", async () => {
    const screen = await mountInShadowRoot(<LangleMark size={24} />);
    const svg = screen.container.querySelector<SVGSVGElement>("svg")!;
    await expect.element(svg).toBeVisible();
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getBoundingClientRect().width).toBe(24);
    const shapes = (iconSvg.match(/<(rect|path|stop)\b/g) ?? []).length;
    expect(svg.querySelectorAll("rect, path, stop").length).toBe(shapes);
  });

  test("gives each copy in one shadow root its own ids, and its fills name them", async () => {
    const screen = await mountInShadowRoot(
      <>
        <LangleMark size={24} />
        <LangleMark size={32} />
      </>,
    );
    const [a, b] = [...screen.container.querySelectorAll("svg")] as [
      SVGSVGElement,
      SVGSVGElement,
    ];
    const ids = (svg: SVGSVGElement) =>
      [...svg.querySelectorAll("[id]")].map((e) => e.id);
    expect(ids(a).length).toBeGreaterThan(0);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    for (const svg of [a, b])
      for (const el of svg.querySelectorAll("[fill^='url(']")) {
        const id = /url\(#(.+)\)/.exec(el.getAttribute("fill")!)![1]!;
        expect(svg.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
      }
  });
});
