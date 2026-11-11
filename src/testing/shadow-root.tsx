import type { JSX } from "preact";
import { render } from "vitest-browser-preact";

const hosts: HTMLElement[] = [];

/** Renders into a fresh open shadow root, as the content script does. */
export function mountInShadowRoot(ui: JSX.Element) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.append(container);
  return render(ui, { container, baseElement: host });
}

/** Adds a hostile page stylesheet, removed by `cleanUpMounts`. */
export function addPageStyle(css: string) {
  const style = document.createElement("style");
  style.dataset.test = "";
  style.textContent = css;
  document.head.append(style);
}

export function cleanUpMounts() {
  hosts.splice(0).forEach((h) => h.remove());
  document.head.querySelectorAll("style[data-test]").forEach((s) => s.remove());
}
