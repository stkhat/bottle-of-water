import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import { PlayerButtons, type PlayerButtonsProps } from "./PlayerButtons";

const base: PlayerButtonsProps = {
  enabled: true,
  menuOpen: false,
  onToggle: () => {},
  onMenu: () => {},
};

afterEach(cleanUpMounts);

describe("PlayerButtons", () => {
  /** The on/off button's mark, its text (none) and its filter. */
  function mark(button: Element) {
    const svg = button.querySelector("[data-langle-mark] svg")!;
    return { text: button.textContent, filter: getComputedStyle(svg).filter };
  }

  test("on: Langle's mark in color, with no outline", async () => {
    const screen = await mountInShadowRoot(<PlayerButtons {...base} />);
    const button = screen.getByRole("button", { name: "Langle on or off" });
    await expect.element(button).toHaveAttribute("aria-pressed", "true");
    await expect
      .element(button)
      .toHaveAttribute("title", "Langle is on — click to turn off");
    expect(mark(button.element())).toEqual({ text: "", filter: "none" });
    expect(getComputedStyle(button.element()).borderTopStyle).toBe("none");
  });

  test("off: the mark in gray inside a dashed outline", async () => {
    const screen = await mountInShadowRoot(
      <PlayerButtons {...base} enabled={false} />,
    );
    const button = screen.getByRole("button", { name: "Langle on or off" });
    await expect.element(button).toHaveAttribute("aria-pressed", "false");
    await expect
      .element(button)
      .toHaveAttribute("title", "Langle is off — click to turn on");
    expect(mark(button.element()).filter).toContain("grayscale(1)");
    expect(getComputedStyle(button.element()).borderTopStyle).toBe("dashed");
  });

  test("both buttons sit in one translucent white outline", async () => {
    const screen = await mountInShadowRoot(<PlayerButtons {...base} />);
    const group = screen.getByRole("group", { name: "Langle" });
    const style = getComputedStyle(group.element());
    expect(style.borderTopColor).toBe("rgba(255, 255, 255, 0.55)");
    expect(style.backgroundColor).toBe("rgba(255, 255, 255, 0.12)");
    expect(style.borderTopStyle).toBe("solid");
    expect(
      group
        .element()
        .contains(
          screen.getByRole("button", { name: "Langle menu" }).element(),
        ),
    ).toBe(true);
  });

  test("the buttons ask to toggle Langle and the menu", async () => {
    const onToggle = vi.fn();
    const onMenu = vi.fn();
    const screen = await mountInShadowRoot(
      <PlayerButtons {...base} onToggle={onToggle} onMenu={onMenu} />,
    );
    await screen.getByRole("button", { name: "Langle on or off" }).click();
    await screen.getByRole("button", { name: "Langle menu" }).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  test("the menu button tells whether the menu is open", async () => {
    const screen = await mountInShadowRoot(<PlayerButtons {...base} />);
    const menu = screen.getByRole("button", { name: "Langle menu" });
    await expect.element(menu).toHaveAttribute("aria-expanded", "false");
    await screen.rerender(<PlayerButtons {...base} menuOpen />);
    await expect.element(menu).toHaveAttribute("aria-expanded", "true");
  });
});
