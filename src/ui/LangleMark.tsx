import { h, type VNode } from "preact";
import { useMemo } from "preact/hooks";
import iconSvg from "./brand/icon.svg?raw";
import { OFF_FILTER } from "./brand/off-filter";

interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
}

/**
 * `brand/icon.svg`'s elements, read once. The file holds only elements and quoted
 * attributes (and comments), so a tag scanner is enough; building nodes keeps the
 * mark off `innerHTML`, which pages enforcing Trusted Types (YouTube) refuse.
 */
function parse(svg: string): SvgNode {
  const root: SvgNode = { tag: "", attrs: {}, children: [] };
  const stack = [root];
  const tags = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g;
  for (const [, close, tag = "", rest = "", selfClose] of svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .matchAll(tags)) {
    if (close) {
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, name = "", value = ""] of rest.matchAll(
      /([\w:-]+)="([^"]*)"/g,
    ))
      attrs[name] = value;
    const node: SvgNode = { tag, attrs, children: [] };
    stack.at(-1)!.children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children[0]!;
}

const ICON = parse(iconSvg);

let instances = 0;

/** `node` as Preact elements, its ids (and the `url(#…)`s naming them) ending in `suffix`. */
function render(node: SvgNode, suffix: string, key?: number): VNode {
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs))
    props[name] =
      name === "id"
        ? value + suffix
        : value.replace(/url\(#([\w-]+)\)/g, `url(#$1${suffix})`);
  return h(
    node.tag,
    props,
    node.children.map((child, i) => render(child, suffix, i)),
  );
}

/**
 * Langle's mark (the toolbar icon, `brand/icon.svg`) at `size` px, beside the name in
 * headers and on the player bar's on/off button; `gray` draws it as the toolbar's off
 * icon is. Inline rather than an `<img>`, so a page's CSP cannot block it; each copy
 * renames the SVG's gradient and clip ids, which would otherwise clash between copies
 * in one shadow root.
 */
export function LangleMark(props: { size: number; gray?: boolean }) {
  const svg = useMemo(() => render(ICON, `-langle-mark-${++instances}`), []);
  return (
    <span data-langle-mark="" style={{ display: "inline-flex", flex: "none" }}>
      {h("svg", {
        ...svg.props,
        width: props.size,
        height: props.size,
        "aria-hidden": "true",
        style: { display: "block", filter: props.gray ? OFF_FILTER : "none" },
      })}
    </span>
  );
}
