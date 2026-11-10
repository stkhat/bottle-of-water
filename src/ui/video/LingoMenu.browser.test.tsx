import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanUpMounts, mountInShadowRoot } from "../lookup/testing";
import { LingoMenu, type LingoMenuProps } from "./LingoMenu";

const base: LingoMenuProps = {
  enabled: true,
  position: "inVideo",
  showTranslation: true,
  onPosition: () => {},
  onToggleTranslation: () => {},
  onOpenSettings: () => {},
  onClose: () => {},
};

afterEach(cleanUpMounts);

describe("LingoMenu", () => {
  test("shows the state for this video", async () => {
    const screen = await mountInShadowRoot(<LingoMenu {...base} />);
    const menu = screen.getByRole("dialog", { name: "Lingo menu" });
    await expect.element(menu).toBeVisible();
    await expect.element(screen.getByText("On for this video")).toBeVisible();
    screen.rerender(<LingoMenu {...base} enabled={false} />);
    await expect.element(screen.getByText("Off for this video")).toBeVisible();
  });

  test("the subtitle position is a two-way choice", async () => {
    const onPosition = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onPosition={onPosition} />,
    );
    const group = screen.getByRole("group", { name: "Subtitle position" });
    await expect.element(group).toBeVisible();
    const inVideo = screen.getByRole("button", { name: "In video" });
    const below = screen.getByRole("button", { name: "Below video" });
    await expect.element(inVideo).toHaveAttribute("aria-pressed", "true");
    await expect.element(below).toHaveAttribute("aria-pressed", "false");
    await below.click();
    expect(onPosition).toHaveBeenCalledWith("belowVideo");
    screen.rerender(<LingoMenu {...base} position="belowVideo" />);
    await expect.element(below).toHaveAttribute("aria-pressed", "true");
    await expect.element(inVideo).toHaveAttribute("aria-pressed", "false");
  });

  test("the translation switch", async () => {
    const onToggleTranslation = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onToggleTranslation={onToggleTranslation} />,
    );
    const sw = screen.getByRole("switch", {
      name: "Show translation under the subtitle",
    });
    await expect.element(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    expect(onToggleTranslation).toHaveBeenCalledTimes(1);
    screen.rerender(<LingoMenu {...base} showTranslation={false} />);
    await expect.element(sw).toHaveAttribute("aria-checked", "false");
  });

  test("opens all settings", async () => {
    const onOpenSettings = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onOpenSettings={onOpenSettings} />,
    );
    await screen.getByRole("button", { name: "Open all settings" }).click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test("closes with Escape and on a click outside it", async () => {
    const onClose = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onClose={onClose} />,
    );
    await screen.getByRole("button", { name: "In video" }).click();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("a click on the menu button is not a click outside", async () => {
    const onClose = vi.fn();
    await mountInShadowRoot(<LingoMenu {...base} onClose={onClose} />);
    const toggle = document.createElement("button");
    toggle.dataset.lingoMenu = "";
    document.body.append(toggle);
    toggle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    toggle.remove();
    expect(onClose).not.toHaveBeenCalled();
  });
});
