import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-preact";
import { PageCard } from "./PageCard";

const hosts: HTMLElement[] = [];

async function mountInShadowRoot() {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.append(container);
  return render(<PageCard />, { container, baseElement: host });
}

afterEach(() => {
  hosts.splice(0).forEach((h) => h.remove());
  document.head.querySelectorAll("style[data-test]").forEach((s) => s.remove());
});

describe("PageCard in a shadow root", () => {
  test("renders three chips with only Learning pressed", async () => {
    const screen = await mountInShadowRoot();
    const neu = screen.getByRole("button", { name: "New" });
    const learning = screen.getByRole("button", { name: "Learning" });
    const known = screen.getByRole("button", { name: "Known" });
    await expect.element(neu).toHaveAttribute("aria-pressed", "false");
    await expect.element(learning).toHaveAttribute("aria-pressed", "true");
    await expect.element(known).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking toggles chips", async () => {
    const screen = await mountInShadowRoot();
    const neu = screen.getByRole("button", { name: "New" });
    const learning = screen.getByRole("button", { name: "Learning" });
    await neu.click();
    await expect.element(neu).toHaveAttribute("aria-pressed", "true");
    await learning.click();
    await expect.element(learning).toHaveAttribute("aria-pressed", "false");
  });

  test("shows the app name and page status", async () => {
    const screen = await mountInShadowRoot();
    await expect.element(screen.getByText("Lingo")).toBeVisible();
    await expect
      .element(screen.getByText("English page · EN → JA"))
      .toBeVisible();
  });

  test("page styles do not leak into the shadow root", async () => {
    const style = document.createElement("style");
    style.dataset.test = "";
    style.textContent =
      "* { color: red !important; font-size: 40px !important }";
    document.head.append(style);
    const screen = await mountInShadowRoot();
    const title = screen.getByText("Lingo").element();
    const computed = getComputedStyle(title);
    expect(computed.color).not.toBe("rgb(255, 0, 0)");
    expect(computed.fontSize).toBe("15px");
  });
});
