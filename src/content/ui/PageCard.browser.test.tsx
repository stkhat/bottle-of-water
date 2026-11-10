import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-preact";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { PageCard, type PageCardProps } from "./PageCard";

const hosts: HTMLElement[] = [];

async function mountInShadowRoot(props: Partial<PageCardProps> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.append(container);
  return render(
    <PageCard
      highlight={DEFAULT_SETTINGS.highlight}
      onToggle={() => {}}
      {...props}
    />,
    { container, baseElement: host },
  );
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

  test("shows the categories it is given", async () => {
    const screen = await mountInShadowRoot({
      highlight: { new: true, learning: false, known: true },
    });
    await expect
      .element(screen.getByRole("button", { name: "New" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "false");
    await expect
      .element(screen.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("clicking a chip asks to toggle its category", async () => {
    const onToggle = vi.fn();
    const screen = await mountInShadowRoot({ onToggle });
    await screen.getByRole("button", { name: "New" }).click();
    await screen.getByRole("button", { name: "Learning" }).click();
    expect(onToggle.mock.calls).toEqual([["new"], ["learning"]]);
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
