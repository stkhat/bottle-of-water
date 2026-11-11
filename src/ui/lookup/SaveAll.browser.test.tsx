import { afterEach, describe, expect, test, vi } from "vitest";
import { palettes } from "../theme";
import { ThemeScope } from "../ThemeScope";
import { SaveAll, type SaveAllProps } from "./SaveAll";
import {
  addPageStyle,
  cleanUpMounts,
  mountInShadowRoot,
} from "../../testing/shadow-root";

const popup: SaveAllProps = {
  scope: "page",
  unsavedCount: 46,
  done: null,
  onAddLearning: () => {},
  onMarkKnown: () => {},
  onUndo: () => {},
};

const BASE_NOTE =
  "Words you have already saved keep their status. Words inside the common-word level are not counted.";

afterEach(cleanUpMounts);

describe("SaveAll", () => {
  test("shows the label, the unsaved count and both actions", async () => {
    const onAddLearning = vi.fn();
    const onMarkKnown = vi.fn();
    const screen = await mountInShadowRoot(
      <SaveAll
        {...popup}
        onAddLearning={onAddLearning}
        onMarkKnown={onMarkKnown}
      />,
    );
    await expect.element(screen.getByText("This page")).toBeVisible();
    await expect
      .element(screen.getByText("46 words not saved yet"))
      .toBeVisible();
    await screen.getByRole("button", { name: "Mark all as Learning" }).click();
    expect(onAddLearning).toHaveBeenCalledOnce();
    await screen.getByRole("button", { name: "Mark all as Known" }).click();
    expect(onMarkKnown).toHaveBeenCalledOnce();
  });

  test("labels the video scope", async () => {
    const screen = await mountInShadowRoot(
      <SaveAll {...popup} scope="video" />,
    );
    await expect.element(screen.getByText("This video")).toBeVisible();
  });

  test("says one word in the singular", async () => {
    const screen = await mountInShadowRoot(
      <SaveAll {...popup} unsavedCount={1} />,
    );
    await expect
      .element(screen.getByText("1 word not saved yet"))
      .toBeVisible();
  });

  test("with nothing unsaved, says so and hides the actions", async () => {
    const screen = await mountInShadowRoot(
      <SaveAll {...popup} unsavedCount={0} />,
    );
    await expect.element(screen.getByText("Every word is saved")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Mark all as Learning" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Mark all as Known" }))
      .not.toBeInTheDocument();
  });

  test("the (i) button toggles the explanation, closed at first", async () => {
    const screen = await mountInShadowRoot(<SaveAll {...popup} />);
    const info = screen.getByRole("button", {
      name: "About marking all words",
    });
    await expect.element(info).toHaveAttribute("aria-expanded", "false");
    await expect.element(screen.getByRole("note")).not.toBeInTheDocument();
    await info.click();
    await expect.element(info).toHaveAttribute("aria-expanded", "true");
    await expect.element(screen.getByRole("note")).toHaveTextContent(BASE_NOTE);
    expect(screen.getByRole("note").element().textContent).toBe(BASE_NOTE);
    await info.click();
    await expect.element(screen.getByRole("note")).not.toBeInTheDocument();
  });

  test("after saving, shows what was done and offers Undo", async () => {
    const onUndo = vi.fn();
    const screen = await mountInShadowRoot(
      <SaveAll
        {...popup}
        unsavedCount={0}
        done={{ count: 46, target: "learning" }}
        onUndo={onUndo}
      />,
    );
    await expect
      .element(screen.getByText("46 words marked as Learning"))
      .toBeVisible();
    await screen.getByRole("button", { name: "Undo" }).click();
    expect(onUndo).toHaveBeenCalledOnce();
    await screen.rerender(
      <SaveAll
        {...popup}
        unsavedCount={0}
        done={{ count: 1, target: "known" }}
      />,
    );
    await expect
      .element(screen.getByText("1 word marked as Known"))
      .toBeVisible();
  });

  test("page styles do not leak in", async () => {
    addPageStyle("* { color: red !important; font-size: 40px !important }");
    const screen = await mountInShadowRoot(<SaveAll {...popup} />);
    const line = screen.getByText("46 words not saved yet").element();
    expect(getComputedStyle(line).color).toBe("rgb(58, 64, 86)");
    expect(getComputedStyle(line).fontSize).toBe("13px");
  });

  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  const colorsOf = (el: Element) => {
    const style = getComputedStyle(el);
    return { text: style.color, background: style.backgroundColor };
  };

  test.each(["light", "dark"] as const)(
    "the buttons follow the %s theme",
    async (theme) => {
      const palette = palettes[theme];
      const screen = await mountInShadowRoot(
        <ThemeScope theme={theme}>
          <SaveAll {...popup} />
        </ThemeScope>,
      );
      const learning = screen.getByRole("button", {
        name: "Mark all as Learning",
      });
      const known = screen.getByRole("button", { name: "Mark all as Known" });
      expect(colorsOf(learning.element())).toEqual({
        text: rgb(palette.greenDark),
        background: rgb(palette.card),
      });
      expect(colorsOf(known.element())).toEqual({
        text: rgb(palette.onInk),
        background: rgb(palette.ink),
      });
    },
  );
});
