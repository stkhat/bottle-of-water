import { render, type JSX } from "preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useState } from "preact/hooks";
import { userEvent } from "vitest/browser";
import { cleanUpMounts, mountInShadowRoot } from "../lookup/testing";
import { LingoMenu, type LingoMenuProps } from "./LingoMenu";
import { PlayerButtons } from "./PlayerButtons";

const base: LingoMenuProps = {
  enabled: true,
  position: "inVideo",
  showTranslation: true,
  onPosition: () => {},
  onToggleTranslation: () => {},
  onOpenSettings: () => {},
  onClose: () => {},
};

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanUpMounts();
  cleanups.splice(0).forEach((c) => c());
});

/** A button on the page, outside the menu, for the user to press. */
function outside(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Outside";
  document.body.append(button);
  cleanups.push(() => button.remove());
  return button;
}

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

  test("in fullscreen: no subtitle position (mock Fullscreen)", async () => {
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} showPositions={false} />,
    );
    await expect
      .element(screen.getByRole("dialog", { name: "Lingo menu" }))
      .toBeVisible();
    expect(screen.container.textContent).not.toContain("Subtitles");
    expect(screen.container.querySelector("[role=group]")).toBeNull();
    await expect
      .element(
        screen.getByRole("switch", {
          name: "Show translation under the subtitle",
        }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Open all settings" }))
      .toBeVisible();
    screen.rerender(<LingoMenu {...base} showPositions />);
    await expect
      .element(screen.getByRole("group", { name: "Subtitle position" }))
      .toBeVisible();
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
    await userEvent.click(outside());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("ignores an Escape and a press outside that a page script dispatches", async () => {
    const onClose = vi.fn();
    await mountInShadowRoot(<LingoMenu {...base} onClose={onClose} />);
    const page = outside();
    page.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
      }),
    );
    page.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(page);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes with Escape or a click outside right after it opens", async () => {
    const onClose = vi.fn();
    /** The ^ button and the menu it opens, as in the player bar. */
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-lingo-menu onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <LingoMenu
              {...base}
              onClose={() => {
                onClose();
                setOpen(false);
              }}
            />
          )}
        </>
      );
    }
    const screen = await mountInShadowRoot(<Opener />);
    const opener = screen
      .getByRole("button", { name: "Open" })
      .element() as HTMLElement;
    const menu = () => screen.container.querySelector("[role=dialog]");
    /** Opens the menu and waits only for its render, not for a paint. */
    const open = async () => {
      opener.focus();
      opener.click();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(menu()).not.toBeNull();
    };

    // Escape with the focus still on the ^ button.
    await open();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await open();
    await userEvent.click(outside());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("a click on the menu button is not a click outside", async () => {
    const onClose = vi.fn();
    await mountInShadowRoot(<LingoMenu {...base} onClose={onClose} />);
    const toggle = outside();
    toggle.dataset.lingoMenu = "";
    await userEvent.click(toggle);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("in closed shadow roots, as in production, presses on the menu and its buttons are inside", async () => {
    const onClose = vi.fn();
    const onPosition = vi.fn();
    /** Renders into a closed shadow root of a Lingo host, as the content script does. */
    function closed(name: string, ui: JSX.Element) {
      const host = document.createElement(name);
      host.style.display = "block";
      document.body.append(host);
      cleanups.push(() => {
        render(null, shadow);
        host.remove();
      });
      const shadow = host.attachShadow({ mode: "closed" });
      render(ui, shadow);
      return shadow;
    }
    /** The user's click on `element` in a closed root: at its place on the host. */
    const press = (element: Element) => {
      const host = (element.getRootNode() as ShadowRoot).host;
      const box = element.getBoundingClientRect();
      const at = host.getBoundingClientRect();
      return userEvent.click(host, {
        position: {
          x: box.left - at.left + box.width / 2,
          y: box.top - at.top + box.height / 2,
        },
      });
    };
    const menu = closed(
      "lingo-test-player",
      <LingoMenu {...base} onClose={onClose} onPosition={onPosition} />,
    );
    const buttons = closed(
      "lingo-test-buttons",
      <PlayerButtons enabled menuOpen onToggle={() => {}} onMenu={() => {}} />,
    );

    await press(menu.querySelector("[aria-pressed=false]")!);
    await press(menu.querySelector("[role=dialog]")!);
    for (const button of buttons.querySelectorAll("button"))
      await press(button);
    await new Promise((r) => setTimeout(r, 50));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(outside());
    await expect.poll(() => onClose.mock.calls.length).toBe(1);
  });
});
