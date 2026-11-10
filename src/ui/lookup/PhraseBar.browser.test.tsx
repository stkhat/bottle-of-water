import { afterEach, describe, expect, test, vi } from "vitest";
import { PhraseBar } from "./PhraseBar";
import { addPageStyle, cleanUpMounts, mountInShadowRoot } from "./testing";

afterEach(cleanUpMounts);

describe("PhraseBar", () => {
  test("offers to save the selection as a phrase", async () => {
    const screen = await mountInShadowRoot(
      <PhraseBar
        text="rise and fall"
        onLearning={() => {}}
        onKnown={() => {}}
      />,
    );
    await expect
      .element(screen.getByText("Save “rise and fall” as a phrase"))
      .toBeVisible();
  });

  test("buttons call their callbacks", async () => {
    const onLearning = vi.fn();
    const onKnown = vi.fn();
    const screen = await mountInShadowRoot(
      <PhraseBar
        text="rise and fall"
        onLearning={onLearning}
        onKnown={onKnown}
      />,
    );
    await screen.getByRole("button", { name: "+ Learning" }).click();
    expect(onLearning).toHaveBeenCalledOnce();
    await screen.getByRole("button", { name: "Known" }).click();
    expect(onKnown).toHaveBeenCalledOnce();
  });

  test("buttons ignore clicks a page script makes", async () => {
    const onLearning = vi.fn();
    const onKnown = vi.fn();
    const screen = await mountInShadowRoot(
      <PhraseBar
        text="rise and fall"
        onLearning={onLearning}
        onKnown={onKnown}
      />,
    );
    for (const name of ["+ Learning", "Known"]) {
      const button = screen.getByRole("button", { name }).element();
      (button as HTMLElement).click();
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(onLearning).not.toHaveBeenCalled();
    expect(onKnown).not.toHaveBeenCalled();
  });

  test("page styles do not leak in", async () => {
    addPageStyle("* { color: red !important; font-size: 40px !important }");
    const screen = await mountInShadowRoot(
      <PhraseBar
        text="rise and fall"
        onLearning={() => {}}
        onKnown={() => {}}
      />,
    );
    const label = screen
      .getByText("Save “rise and fall” as a phrase")
      .element();
    expect(getComputedStyle(label).color).toBe("rgb(241, 242, 245)");
    expect(getComputedStyle(label).fontSize).toBe("13px");
  });
});
