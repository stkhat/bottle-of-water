import { afterEach, describe, expect, test, vi } from "vitest";
import { HoverCard, type HoverCardProps } from "./HoverCard";
import { charX, expectRightToLeft } from "../../testing/bidi";
import {
  addPageStyle,
  cleanUpMounts,
  mountInShadowRoot,
} from "../../testing/shadow-root";

const figureOut: HoverCardProps = {
  variant: "video",
  kind: "phrase",
  status: "learning",
  head: "figure out",
  ipa: "/ˈfɪɡjər ˈaʊt/",
  meanings: ["（答え・方法を）見つけ出す、理解する"],
  sub: "figure — 数字、姿、人物",
  nativeLang: "ja",
  onLearning: () => {},
  onKnown: () => {},
  onDetails: () => {},
};

afterEach(cleanUpMounts);

describe("HoverCard", () => {
  test("shows kind, status, head, IPA, translation, notes and Details", async () => {
    const screen = await mountInShadowRoot(<HoverCard {...figureOut} />);
    await expect.element(screen.getByText("Phrase")).toBeVisible();
    await expect
      .element(screen.getByText("Learning", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("figure out")).toBeVisible();
    await expect.element(screen.getByText("/ˈfɪɡjər ˈaʊt/")).toBeVisible();
    await expect
      .element(screen.getByText("（答え・方法を）見つけ出す、理解する"))
      .toHaveAttribute("lang", "ja");
    await expect
      .element(screen.getByText("figure — 数字、姿、人物"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Details" }))
      .toBeVisible();
  });

  test("marks an English definition as English", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        meanings={["To come to understand"]}
        shortLang="en"
      />,
    );
    await expect
      .element(screen.getByText("To come to understand"))
      .toHaveAttribute("lang", "en");
  });

  test("stacks several meanings, one per line, all alike", async () => {
    const lines = ["パチパチ音を立てる", "パチパチいう音", "細かいひび模様"];
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        kind="word"
        head="crackle"
        variant="article"
        meanings={lines}
      />,
    );
    const elements = lines.map((line) => screen.getByText(line).element());
    const boxes = elements.map((element) => element.getBoundingClientRect());
    for (const [i, element] of elements.entries()) {
      expect(element).toHaveAttribute("lang", "ja");
      const style = getComputedStyle(element);
      expect(style.fontSize).toBe("15px");
      expect(style.fontWeight).toBe("400");
      expect(style.color).toBe("rgb(42, 47, 69)");
      // Each one under the one before, at the same left edge.
      if (i > 0) {
        expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom);
        expect(boxes[i]!.left).toBe(boxes[0]!.left);
      }
    }
    // Nothing but the meanings: no numbers or bullets.
    expect(screen.container.textContent).toContain(lines.join(""));
  });

  test("shows the user's meanings first, each with the bookmark, like the other lines", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        kind="word"
        head="fold"
        yours={[
          { text: "（パン生地の）折り込み" },
          { text: "To bend", lang: "en" },
        ]}
        meanings={["折り目、ひだ"]}
      />,
    );
    const lines = [
      ...screen.container.querySelectorAll<HTMLElement>("[data-your-meaning]"),
    ];
    expect(lines.map((line) => line.textContent)).toEqual([
      "（パン生地の）折り込み",
      "To bend",
    ]);
    for (const line of lines) {
      const mark = line.querySelector("svg")!;
      expect(mark).toHaveAttribute("aria-label", "Your meaning");
      expect(mark.getBoundingClientRect().width).toBe(14);
      expect(getComputedStyle(mark).color).toBe("rgb(11, 127, 101)");
      expect(getComputedStyle(line).fontSize).toBe("15px");
      expect(getComputedStyle(line).color).toBe("rgb(42, 47, 69)");
    }
    await expect
      .element(screen.getByText("（パン生地の）折り込み"))
      .toHaveAttribute("lang", "ja");
    await expect
      .element(screen.getByText("To bend"))
      .toHaveAttribute("lang", "en");
    // The dictionary's line comes after them.
    const dictionary = screen.getByText("折り目、ひだ").element();
    expect(dictionary.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      lines[1]!.getBoundingClientRect().bottom,
    );
    expect(dictionary.closest("div")!.querySelector("svg")).toBeNull();
  });

  test("labels a word and an unsaved status", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard {...figureOut} kind="word" status="new" head="dough" />,
    );
    await expect
      .element(screen.getByText("Word", { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("New · not saved")).toBeVisible();
  });

  test("labels an unsaved selection as selected", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard {...figureOut} variant="article" status="new" selection />,
    );
    await expect
      .element(screen.getByText("Selected · not saved"))
      .toBeVisible();
    expect(screen.container.textContent).not.toContain("New · not saved");
    // A selection of a saved phrase shows its status.
    await screen.rerender(
      <HoverCard {...figureOut} variant="article" selection />,
    );
    await expect
      .element(screen.getByText("Learning", { exact: true }))
      .toBeVisible();
  });

  test("marks a machine translation after the translation", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        variant="article"
        meanings={["1時間待つ"]}
        machineTranslated
      />,
    );
    const short = screen.getByText("1時間待つ");
    const mark = screen.getByText("Machine translation", { exact: true });
    await expect.element(short).toHaveAttribute("lang", "ja");
    await expect.element(mark).toBeVisible();
    expect(mark.element().hasAttribute("lang")).toBe(false);
    // On the translation's line, after it.
    const a = short.element().getBoundingClientRect();
    const b = mark.element().getBoundingClientRect();
    expect(b.left).toBeGreaterThan(a.right);
    expect(
      Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
    ).toBeLessThan(2);
    expect(getComputedStyle(mark.element()).fontSize).toBe("11px");
    await screen.rerender(
      <HoverCard {...figureOut} meanings={["1時間待つ"]} />,
    );
    expect(screen.container.textContent).not.toContain("Machine translation");
  });

  test("leaves out IPA, translation and notes when missing", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        ipa={undefined}
        meanings={undefined}
        sub={undefined}
      />,
    );
    await expect.element(screen.getByText("figure out")).toBeVisible();
    expect(screen.container.textContent).not.toContain("/ˈfɪɡjər");
    expect(screen.container.textContent).not.toContain("見つけ出す");
    expect(screen.container.textContent).not.toContain("数字");
    expect(screen.container.querySelector("[data-divider]")).toBeNull();
  });

  test("presses the button of the current status", async () => {
    const screen = await mountInShadowRoot(<HoverCard {...figureOut} />);
    const learning = screen.getByRole("button", { name: "+ Learning" });
    const known = screen.getByRole("button", { name: "Known" });
    await expect.element(learning).toHaveAttribute("aria-pressed", "true");
    await expect.element(known).toHaveAttribute("aria-pressed", "false");
    await screen.rerender(<HoverCard {...figureOut} status="known" />);
    await expect.element(learning).toHaveAttribute("aria-pressed", "false");
    await expect.element(known).toHaveAttribute("aria-pressed", "true");
  });

  test("buttons call their callbacks", async () => {
    const onLearning = vi.fn();
    const onKnown = vi.fn();
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        status="new"
        onLearning={onLearning}
        onKnown={onKnown}
      />,
    );
    await screen.getByRole("button", { name: "+ Learning" }).click();
    expect(onLearning).toHaveBeenCalledOnce();
    await screen.getByRole("button", { name: "Known" }).click();
    expect(onKnown).toHaveBeenCalledOnce();
  });

  test("Details calls onDetails, over video and over articles", async () => {
    for (const variant of ["video", "article"] as const) {
      const onDetails = vi.fn();
      const screen = await mountInShadowRoot(
        <HoverCard {...figureOut} variant={variant} onDetails={onDetails} />,
      );
      await screen.getByRole("button", { name: "Details" }).click();
      expect(onDetails).toHaveBeenCalledOnce();
      cleanUpMounts();
    }
  });

  test("buttons ignore clicks a page script makes", async () => {
    const onLearning = vi.fn();
    const onKnown = vi.fn();
    const onDetails = vi.fn();
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        status="new"
        onLearning={onLearning}
        onKnown={onKnown}
        onDetails={onDetails}
      />,
    );
    for (const name of ["+ Learning", "Known", "Details"]) {
      const button = screen.getByRole("button", { name }).element();
      (button as HTMLElement).click();
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(onLearning).not.toHaveBeenCalled();
    expect(onKnown).not.toHaveBeenCalled();
    expect(onDetails).not.toHaveBeenCalled();
  });

  test("is 300px wide over video and 290px over articles", async () => {
    const screen = await mountInShadowRoot(<HoverCard {...figureOut} />);
    const card = screen.container.firstElementChild as HTMLElement;
    expect(card.getBoundingClientRect().width).toBe(300);
    await screen.rerender(<HoverCard {...figureOut} variant="article" />);
    expect(card.getBoundingClientRect().width).toBe(290);
  });

  test("page styles do not leak in", async () => {
    addPageStyle("* { color: red !important; font-size: 40px !important }");
    const screen = await mountInShadowRoot(<HoverCard {...figureOut} />);
    const head = screen.getByText("figure out").element();
    expect(getComputedStyle(head).color).toBe("rgb(20, 24, 43)");
    expect(getComputedStyle(head).fontSize).toBe("17px");
  });
});

describe("HoverCard in a language written right to left", () => {
  test("sets Arabic lines right to left, isolated, where the mock puts the lines", async () => {
    const screen = await mountInShadowRoot(
      <HoverCard
        {...figureOut}
        nativeLang="ar"
        meanings={["اكتشف، فهم (حلا أو طريقة)!", "حل (مشكلة)…"]}
        sub={`figure — ${"⁧"}رقم، شكل…${"⁩"}`}
        machineTranslated
      />,
    );
    const first = screen.getByText("اكتشف، فهم (حلا أو طريقة)!").element();
    expect(first.getAttribute("lang")).toBe("ar");
    expect(first.getAttribute("dir")).toBe("rtl");
    expectRightToLeft(first);
    expectRightToLeft(screen.getByText("حل (مشكلة)…").element());
    // The line starts at the card's left edge, as the English lines of the mock do.
    const head = screen.getByText("figure out").element();
    expect(
      Math.abs(
        first.getBoundingClientRect().left - head.getBoundingClientRect().left,
      ),
    ).toBeLessThan(1);
    // The card's word line: "figure — " then the Arabic, its ellipsis at its end.
    const sub = screen.getByText(/^figure — /).element();
    const text = sub.textContent!;
    expect(charX(sub, 0)).toBeLessThan(charX(sub, text.indexOf("…")));
    expect(charX(sub, text.indexOf("…"))).toBeLessThan(
      charX(sub, text.indexOf("ر")),
    );
  });
});
