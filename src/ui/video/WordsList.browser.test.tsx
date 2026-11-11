import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import {
  WordsFilterChips,
  WordsList,
  type WordRow,
  type WordsListProps,
} from "./WordsList";

const ROWS: WordRow[] = [
  {
    id: "word\nfigure out",
    head: "figure out",
    category: "learning",
    count: 2,
    short: "（答え・方法を）見つけ出す、理解する",
    shortLang: "ja",
    selected: false,
  },
  {
    id: "word\ndough",
    head: "dough",
    category: "new",
    count: 3,
    short: "パン生地",
    shortLang: "ja",
    selected: true,
  },
  {
    id: "word\nchannel",
    head: "channel",
    category: "known",
    count: 1,
    short: "To come to understand; a very long definition that goes on",
    shortLang: "en",
    selected: false,
  },
];

const base: WordsListProps = {
  rows: ROWS,
  learningLang: "en",
  onOpen: () => {},
};

afterEach(cleanUpMounts);

const rowNamed = (
  screen: Awaited<ReturnType<typeof mountInShadowRoot>>,
  head: string,
) => screen.getByRole("button", { name: new RegExp(`^${head}`) });

describe("WordsFilterChips", () => {
  const counts = { all: 9, new: 3, learning: 3, known: 3 };

  test("shows All, New, Learning and Known with their counts, the filter pressed", async () => {
    const screen = await mountInShadowRoot(
      <WordsFilterChips filter="new" counts={counts} onFilter={() => {}} />,
    );
    const group = screen.getByRole("group", { name: "Show words" });
    const chips = [...group.element().querySelectorAll("button")];
    expect(chips.map((c) => c.textContent)).toEqual([
      "All 9",
      "New 3",
      "Learning 3",
      "Known 3",
    ]);
    expect(chips.map((c) => c.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
  });

  test("the pressed chip is white with a solid border; the others dashed", async () => {
    const screen = await mountInShadowRoot(
      <WordsFilterChips filter="all" counts={counts} onFilter={() => {}} />,
    );
    const on = getComputedStyle(
      screen.getByRole("button", { name: "All 9" }).element(),
    );
    expect(on.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(on.borderTopStyle).toBe("solid");
    expect(on.borderTopColor).toBe("rgb(140, 146, 163)");
    expect(on.fontWeight).toBe("600");
    const off = getComputedStyle(
      screen.getByRole("button", { name: "Known 3" }).element(),
    );
    expect(off.borderTopStyle).toBe("dashed");
    expect(off.borderTopColor).toBe("rgb(201, 205, 214)");
    const count = screen
      .getByRole("button", { name: "Known 3" })
      .element()
      .querySelector("span")!;
    expect(count.textContent).toBe("3");
    expect(getComputedStyle(count).color).toBe("rgb(90, 96, 117)");
  });

  test("a chip picks its filter", async () => {
    const onFilter = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsFilterChips filter="all" counts={counts} onFilter={onFilter} />,
    );
    await screen.getByRole("button", { name: "Learning 3" }).click();
    expect(onFilter).toHaveBeenCalledWith("learning");
  });
});

describe("WordsList", () => {
  test("each row shows the head, the count and the short meaning in its language", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const dough = rowNamed(screen, "dough").element();
    expect(dough.textContent).toBe("dough3×パン生地");
    expect(dough.querySelector("[lang=en]")!.textContent).toBe("dough");
    expect(dough.querySelector("[lang=ja]")!.textContent).toBe("パン生地");
    const channel = rowNamed(screen, "channel").element();
    // An English definition keeps its own lang.
    expect(
      [...channel.querySelectorAll("[lang=en]")].map((e) => e.textContent),
    ).toEqual(["channel", ROWS[2]!.short]);
  });

  test("rows keep their order", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const heads = [
      ...screen.container.querySelectorAll<HTMLButtonElement>("button"),
    ].map((b) => b.textContent!.split(/\d/)[0]);
    expect(heads).toEqual(["figure out", "dough", "channel"]);
  });

  test("the head has its category's highlight", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const head = (row: string) =>
      getComputedStyle(
        rowNamed(screen, row).element().querySelector("[lang=en]")!,
      );
    expect(head("figure out").backgroundColor).toBe("rgb(211, 241, 229)");
    expect(head("figure out").boxShadow).toContain("rgb(15, 159, 126)");
    expect(head("dough").boxShadow).toContain("rgb(47, 111, 228)");
    expect(head("channel").boxShadow).toContain("rgb(163, 168, 183)");
    expect(head("dough").fontSize).toBe("15px");
    expect(head("dough").fontWeight).toBe("600");
  });

  test("the short meaning is one line with an ellipsis", async () => {
    const screen = await mountInShadowRoot(
      <div style={{ width: "200px" }}>
        <WordsList {...base} />
      </div>,
    );
    const short = getComputedStyle(
      rowNamed(screen, "channel").element().querySelectorAll("[lang=en]")[1]!,
    );
    expect(short.whiteSpace).toBe("nowrap");
    expect(short.textOverflow).toBe("ellipsis");
    expect(short.overflow).toBe("hidden");
  });

  test("the row of the open dictionary window is pressed and green", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const dough = rowNamed(screen, "dough");
    await expect.element(dough).toHaveAttribute("aria-pressed", "true");
    const style = getComputedStyle(dough.element());
    expect(style.backgroundColor).toBe("rgb(230, 246, 240)");
    expect(style.borderTopColor).toBe("rgb(143, 211, 188)");
    await expect
      .element(rowNamed(screen, "channel"))
      .toHaveAttribute("aria-pressed", "false");
    expect(
      getComputedStyle(rowNamed(screen, "channel").element()).backgroundColor,
    ).toBe("rgba(0, 0, 0, 0)");
  });

  test("clicking a row opens it", async () => {
    const onOpen = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsList {...base} onOpen={onOpen} />,
    );
    await rowNamed(screen, "figure out").click();
    expect(onOpen).toHaveBeenCalledWith("word\nfigure out");
  });

  test("a click a page script makes opens nothing", async () => {
    const onOpen = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsList {...base} onOpen={onOpen} />,
    );
    const row = rowNamed(screen, "figure out").element() as HTMLElement;
    row.click();
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("says so when there are no words", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} rows={[]} />);
    const empty = screen.getByText("No words here yet.");
    await expect.element(empty).toBeVisible();
    expect(getComputedStyle(empty.element()).fontSize).toBe("13px");
    expect(screen.container.querySelectorAll("button")).toHaveLength(0);
  });
});
