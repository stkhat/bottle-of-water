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
