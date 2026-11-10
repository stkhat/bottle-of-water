import { afterEach, describe, expect, test, vi } from "vitest";
import { EndCard, type EndCardProps } from "./EndCard";
import { addPageStyle, cleanUpMounts, mountInShadowRoot } from "./testing";

const video: EndCardProps = {
  kind: "video",
  saveAll: {
    unsavedCount: 2,
    done: null,
    onAddLearning: () => {},
    onMarkKnown: () => {},
    onUndo: () => {},
  },
  onClose: () => {},
};

afterEach(cleanUpMounts);

describe("EndCard", () => {
  test("a finished video offers to save the rest of it", async () => {
    const onAddLearning = vi.fn();
    const screen = await mountInShadowRoot(
      <EndCard {...video} saveAll={{ ...video.saveAll, onAddLearning }} />,
    );
    await expect
      .element(
        screen.getByRole("region", { name: "Save the rest of this page" }),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Video finished")).toBeVisible();
    await expect.element(screen.getByText("This video")).toBeVisible();
    await expect
      .element(screen.getByText("2 words not saved yet"))
      .toBeVisible();
    await screen.getByRole("button", { name: "Add all to Learning" }).click();
    expect(onAddLearning).toHaveBeenCalledOnce();
  });

  test("the end of an article", async () => {
    const screen = await mountInShadowRoot(
      <EndCard {...video} kind="article" />,
    );
    await expect.element(screen.getByText("You reached the end")).toBeVisible();
    await expect.element(screen.getByText("This article")).toBeVisible();
  });

  test("its explanation mentions turning the card off", async () => {
    const screen = await mountInShadowRoot(<EndCard {...video} />);
    await screen
      .getByRole("button", { name: "About adding all words" })
      .click();
    await expect
      .element(screen.getByRole("note"))
      .toHaveTextContent(
        "Words you have already saved keep their status. Words inside the common-word level are not counted. You can turn this card off in Settings.",
      );
  });

  test("× closes it", async () => {
    const onClose = vi.fn();
    const screen = await mountInShadowRoot(
      <EndCard {...video} onClose={onClose} />,
    );
    await screen.getByRole("button", { name: "Close" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("is 320px wide over video and 340px on articles", async () => {
    const screen = await mountInShadowRoot(<EndCard {...video} />);
    const card = screen.getByRole("region").element();
    expect(card.getBoundingClientRect().width).toBe(320);
    await screen.rerender(<EndCard {...video} kind="article" />);
    expect(
      screen.getByRole("region").element().getBoundingClientRect().width,
    ).toBe(340);
  });

  test("page styles do not leak in", async () => {
    addPageStyle("* { color: red !important; font-size: 40px !important }");
    const screen = await mountInShadowRoot(<EndCard {...video} />);
    const title = screen.getByText("Video finished").element();
    expect(getComputedStyle(title).color).toBe("rgb(20, 24, 43)");
    expect(getComputedStyle(title).fontSize).toBe("15px");
  });
});
