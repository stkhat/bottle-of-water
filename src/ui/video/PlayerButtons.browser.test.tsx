import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../lookup/testing";
import { PlayerButtons, type PlayerButtonsProps } from "./PlayerButtons";

const base: PlayerButtonsProps = {
  enabled: true,
  menuOpen: false,
  onToggle: () => {},
  onMenu: () => {},
};

afterEach(cleanUpMounts);

describe("PlayerButtons", () => {
  test("the L button shows Lingo is on", async () => {
    const screen = await mountInShadowRoot(<PlayerButtons {...base} />);
    const l = screen.getByRole("button", { name: "Lingo on or off" });
    await expect.element(l).toHaveAttribute("aria-pressed", "true");
    await expect
      .element(l)
      .toHaveAttribute("title", "Lingo is on — click to turn off");
    const style = getComputedStyle(l.element());
    expect(style.backgroundColor).toBe("rgb(11, 138, 108)");
    expect(style.textDecorationLine).toBe("none");
  });

  test("off: a dashed outline and a line through the L", async () => {
    const screen = await mountInShadowRoot(
      <PlayerButtons {...base} enabled={false} />,
    );
    const l = screen.getByRole("button", { name: "Lingo on or off" });
    await expect.element(l).toHaveAttribute("aria-pressed", "false");
    await expect
      .element(l)
      .toHaveAttribute("title", "Lingo is off — click to turn on");
    const style = getComputedStyle(l.element());
    expect(style.borderTopStyle).toBe("dashed");
    expect(style.textDecorationLine).toBe("line-through");
  });

  test("both buttons sit in one green outline", async () => {
    const screen = await mountInShadowRoot(<PlayerButtons {...base} />);
    const group = screen.getByRole("group", { name: "Lingo" });
    const style = getComputedStyle(group.element());
    expect(style.borderTopColor).toBe("rgb(63, 199, 159)");
    expect(style.borderTopStyle).toBe("solid");
    expect(
      group
        .element()
        .contains(screen.getByRole("button", { name: "Lingo menu" }).element()),
    ).toBe(true);
  });

  test("the buttons ask to toggle Lingo and the menu", async () => {
    const onToggle = vi.fn();
    const onMenu = vi.fn();
    const screen = await mountInShadowRoot(
      <PlayerButtons {...base} onToggle={onToggle} onMenu={onMenu} />,
    );
    await screen.getByRole("button", { name: "Lingo on or off" }).click();
    await screen.getByRole("button", { name: "Lingo menu" }).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  test("the menu button tells whether the menu is open", async () => {
    const screen = await mountInShadowRoot(<PlayerButtons {...base} />);
    const menu = screen.getByRole("button", { name: "Lingo menu" });
    await expect.element(menu).toHaveAttribute("aria-expanded", "false");
    await screen.rerender(<PlayerButtons {...base} menuOpen />);
    await expect.element(menu).toHaveAttribute("aria-expanded", "true");
  });
});
