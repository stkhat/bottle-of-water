import { guardShadowRoot } from "../ui/from-user";

/**
 * The mode of the shadow roots that hold Lingo's UI on web pages. Production builds
 * close them, so page scripts cannot reach the UI (`host.shadowRoot` is null) and read
 * what it shows, such as sentences kept from other sites. The check build
 * (`wxt build --mode check`), development and tests keep them open so the E2E tests,
 * the browser tests and the developer can reach the UI.
 */
export function shadowRootMode(
  mode: string = import.meta.env.MODE,
): ShadowRootMode {
  return mode === "production" ? "closed" : "open";
}

/** Events that must not reach the site (its player's play/pause on click, its shortcuts). */
const PRIVATE_EVENTS = [
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "contextmenu",
  "keydown",
  "keyup",
  "keypress",
] as const;

/**
 * A `name` element styled `style`, with a guarded shadow root for Lingo's UI: presses
 * and keys inside do not reach the site. The root is returned because a closed one
 * (production) is not reachable as `host.shadowRoot`.
 */
export function createShadowHost(name: string, style: string) {
  const host = document.createElement(name);
  host.style.cssText = style;
  for (const type of PRIVATE_EVENTS)
    host.addEventListener(type, (event) => event.stopPropagation());
  const root = host.attachShadow({ mode: shadowRootMode() });
  guardShadowRoot(root);
  return { host, root };
}
