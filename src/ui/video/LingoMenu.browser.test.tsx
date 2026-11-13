import { render, type JSX } from "preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useState } from "preact/hooks";
import { userEvent } from "vitest/browser";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import { LingoMenu, type LingoMenuProps } from "./LingoMenu";
import { PlayerButtons } from "./PlayerButtons";

const base: LingoMenuProps = {
  enabled: true,
  position: "inVideo",
  showTranslation: true,
  transcriptShown: true,
  size: 100,
  opacity: 80,
  onPosition: () => {},
  onToggleTranslation: () => {},
  onToggleTranscript: () => {},
  onPreview: () => {},
  onSize: () => {},
  onOpacity: () => {},
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
    await screen.rerender(<LingoMenu {...base} enabled={false} />);
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
    await screen.rerender(<LingoMenu {...base} position="belowVideo" />);
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
    expect(screen.container.textContent).not.toContain("Subtitle position");
    expect(screen.container.querySelector("[role=group]")).toBeNull();
    const dual = screen.getByRole("switch", { name: "Show dual subtitles" });
    await expect.element(dual).toBeVisible();
    // The last row there.
    const menu = screen.getByRole("dialog", { name: "Lingo menu" }).element();
    expect(menu.lastElementChild!.contains(dual.element())).toBe(true);
    await expect
      .element(
        screen.getByRole("switch", { name: "Show transcript in sidebar" }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("slider", { name: "Text size" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Open settings" }))
      .toBeVisible();
    await screen.rerender(<LingoMenu {...base} showPositions />);
    await expect
      .element(screen.getByRole("group", { name: "Subtitle position" }))
      .toBeVisible();
  });

  test("the rows from the top, as in mock Main", async () => {
    const screen = await mountInShadowRoot(<LingoMenu {...base} />);
    const menu = screen.getByRole("dialog", { name: "Lingo menu" }).element();
    expect(
      [...menu.children].map(
        (row) =>
          row
            .querySelector("[aria-label]:not(a)")
            ?.getAttribute("aria-label") ?? row.textContent,
      ),
    ).toEqual([
      "Open settings",
      "Show transcript in sidebar",
      "Text size",
      "Background",
      "Show dual subtitles",
      "Subtitle position",
    ]);
  });

  test("the transcript switch", async () => {
    const onToggleTranscript = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onToggleTranscript={onToggleTranscript} />,
    );
    const sw = screen.getByRole("switch", {
      name: "Show transcript in sidebar",
    });
    await expect.element(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    expect(onToggleTranscript).toHaveBeenCalledTimes(1);
    await screen.rerender(<LingoMenu {...base} transcriptShown={false} />);
    await expect.element(sw).toHaveAttribute("aria-checked", "false");
  });

  test("over a Short: no transcript switch", async () => {
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} transcriptShown={undefined} showPositions={false} />,
    );
    await expect
      .element(screen.getByRole("switch", { name: "Show dual subtitles" }))
      .toBeVisible();
    expect(screen.container.textContent).not.toContain("transcript");
  });

  test("the dual subtitles switch", async () => {
    const onToggleTranslation = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onToggleTranslation={onToggleTranslation} />,
    );
    const sw = screen.getByRole("switch", { name: "Show dual subtitles" });
    await expect.element(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    expect(onToggleTranslation).toHaveBeenCalledTimes(1);
    await screen.rerender(<LingoMenu {...base} showTranslation={false} />);
    await expect.element(sw).toHaveAttribute("aria-checked", "false");
  });

  test("opens the settings from the gear in its header, with no settings button below", async () => {
    const onOpenSettings = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu {...base} onOpenSettings={onOpenSettings} />,
    );
    const gear = screen.getByRole("button", { name: "Open settings" });
    // The gear is the last thing in the header row, after the state.
    expect(gear.element().previousElementSibling?.textContent).toBe(
      "On for this video",
    );
    expect(screen.container.textContent).not.toContain("Open all settings");
    await gear.click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test("the subtitle position is the last row: its label, then the choice under it at full width", async () => {
    const screen = await mountInShadowRoot(<LingoMenu {...base} />);
    const menu = screen.getByRole("dialog", { name: "Lingo menu" }).element();
    const group = screen.getByRole("group", { name: "Subtitle position" });
    const row = group.element().parentElement!;
    expect(menu.lastElementChild).toBe(row);
    const label = row.firstElementChild!;
    expect(label.textContent).toBe("Subtitle position");
    // The same 14px sentence-case text as "Text size".
    expect(getComputedStyle(label).fontSize).toBe("14px");
    expect(getComputedStyle(label).textTransform).toBe("none");
    const labelBox = label.getBoundingClientRect();
    const choice = group.element().getBoundingClientRect();
    expect(labelBox.bottom).toBeLessThanOrEqual(choice.top);
    const inner = row.getBoundingClientRect();
    expect(choice.left).toBe(inner.left);
    expect(choice.right).toBe(inner.right);
    // An outlined box (mock Main): 1px border, 8px corners.
    const box = getComputedStyle(group.element());
    expect(box.borderTopWidth).toBe("1px");
    expect(box.borderTopLeftRadius).toBe("8px");
    // The chosen option is filled with the accent; neither wraps.
    const inVideo = screen.getByRole("button", { name: "In video" }).element();
    expect(getComputedStyle(inVideo).backgroundColor).toBe("rgb(11, 138, 108)");
    expect(getComputedStyle(inVideo).color).toBe("rgb(255, 255, 255)");
    for (const name of ["In video", "Below video"]) {
      const button = screen.getByRole("button", { name }).element();
      expect(getComputedStyle(button).fontSize).toBe("14px");
      expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth);
      expect(button.getBoundingClientRect().height).toBe(30);
    }
  });

  test("the text size and background sliders preview while dragged and save when let go", async () => {
    const onPreview = vi.fn();
    const onSize = vi.fn();
    const onOpacity = vi.fn();
    const screen = await mountInShadowRoot(
      <LingoMenu
        {...base}
        size={120}
        opacity={40}
        onPreview={onPreview}
        onSize={onSize}
        onOpacity={onOpacity}
      />,
    );
    const size = screen.getByRole("slider", { name: "Text size" });
    const opacity = screen.getByRole("slider", { name: "Background" });
    await expect.element(size).toHaveValue("120");
    await expect.element(size).toHaveAttribute("aria-valuetext", "120%");
    await expect.element(size).toHaveAttribute("min", "50");
    await expect.element(size).toHaveAttribute("max", "200");
    await expect.element(opacity).toHaveValue("40");
    await expect.element(opacity).toHaveAttribute("max", "100");

    const input = size.element() as HTMLInputElement;
    input.value = "150";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onPreview).toHaveBeenLastCalledWith({ size: 150 });
    expect(onSize).not.toHaveBeenCalled();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onSize).toHaveBeenCalledWith(150);

    (opacity.element() as HTMLInputElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onPreview).toHaveBeenLastCalledWith({ opacity: 45 });
    expect(onOpacity).toHaveBeenCalledWith(45);
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
