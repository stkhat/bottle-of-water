import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import { userEvent } from "vitest/browser";
import {
  WordsFilterChips,
  WordsList,
  WordsSortSelect,
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
    places: ["0:56", "1:20"],
    pressed: -1,
  },
  {
    id: "word\ndough",
    head: "dough",
    category: "new",
    count: 3,
    short: "パン生地",
    shortLang: "ja",
    places: ["1:09", "2:31", "3:05", "4:02", "5:47", "6:30", "8:15"],
    pressed: 1,
  },
  {
    id: "word\nchannel",
    head: "channel",
    category: "known",
    count: 1,
    short: "To come to understand; a very long definition that goes on",
    shortLang: "en",
    places: ["0:52"],
    pressed: -1,
  },
];

const base: WordsListProps<WordRow> = {
  rows: ROWS,
  learningLang: "en",
  onJump: () => {},
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

describe("WordsSortSelect", () => {
  test("a Sort label and select: In order, A–Z, Most seen", async () => {
    const onSort = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsSortSelect sort="order" onSort={onSort} />,
    );
    const select = screen.getByRole("combobox", { name: "Sort" });
    await expect.element(select).toHaveValue("order");
    expect(
      [...(select.element() as HTMLSelectElement).options].map((o) => [
        o.value,
        o.textContent,
      ]),
    ).toEqual([
      ["order", "In order"],
      ["az", "A–Z"],
      ["count", "Most seen"],
    ]);
    const style = getComputedStyle(select.element());
    expect(style.height).toBe("32px");
    expect(style.fontSize).toBe("13px");
    expect(style.borderTopColor).toBe("rgb(213, 216, 224)");
    expect(style.borderTopLeftRadius).toBe("8px");
    const label = getComputedStyle(screen.getByText("Sort").element());
    expect(label.fontSize).toBe("13px");
    expect(label.color).toBe("rgb(90, 96, 117)");
    await userEvent.selectOptions(select, "count");
    expect(onSort).toHaveBeenCalledWith("count");
  });

  test("shows the sort it is given", async () => {
    const screen = await mountInShadowRoot(
      <WordsSortSelect sort="az" onSort={() => {}} />,
    );
    await expect
      .element(screen.getByRole("combobox", { name: "Sort" }))
      .toHaveValue("az");
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
      ...screen.container.querySelectorAll<HTMLElement>("[data-word-row]"),
    ].map((row) => row.querySelector("[lang=en]")!.textContent);
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

  test("a row is a button named for its jump; it holds no other button", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    await expect
      .element(screen.getByRole("button", { name: "dough, jump to 1:09" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "channel, jump to 0:52" }))
      .toBeVisible();
    for (const row of screen.container.querySelectorAll("[data-word-row]"))
      expect(row.querySelector("button button")).toBeNull();
  });

  test("the row of the last jump is green; the others are not", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const row = (head: string) =>
      getComputedStyle(
        rowNamed(screen, head).element().closest("[data-word-row]")!,
      );
    expect(row("dough").backgroundColor).toBe("rgb(230, 246, 240)");
    expect(row("dough").borderTopColor).toBe("rgb(143, 211, 188)");
    expect(row("dough").borderTopLeftRadius).toBe("10px");
    expect(row("channel").backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(row("channel").borderTopColor).toBe("rgba(0, 0, 0, 0)");
  });

  test("a row grays on hover unless it is the last jump's", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const row = (head: string) =>
      rowNamed(screen, head).element().closest("[data-word-row]")!;
    await userEvent.hover(rowNamed(screen, "channel"));
    expect(getComputedStyle(row("channel")).backgroundColor).toBe(
      "rgb(238, 240, 243)",
    );
    await userEvent.hover(rowNamed(screen, "dough"));
    expect(getComputedStyle(row("dough")).backgroundColor).toBe(
      "rgb(230, 246, 240)",
    );
  });

  test("a term in two or more places gets a chip per place, named by its time", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const figure = screen.getByRole("group", { name: "Times of figure out" });
    expect(
      [...figure.element().querySelectorAll("button")].map((b) => [
        b.textContent,
        b.getAttribute("aria-label"),
      ]),
    ).toEqual([
      ["0:56", "Jump to 0:56"],
      ["1:20", "Jump to 1:20"],
    ]);
    // One place: no chips.
    expect(
      screen.getByRole("group", { name: "Times of channel" }).query(),
    ).toBeNull();
  });

  test("chips look as in the mock, the last jump's filled green", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} />);
    const off = getComputedStyle(
      screen.getByRole("button", { name: "Jump to 1:09" }).element(),
    );
    expect(off.height).toBe("26px");
    expect(off.borderTopLeftRadius).toBe("6px");
    expect(off.fontSize).toBe("12px");
    expect(off.fontWeight).toBe("600");
    expect(off.fontVariantNumeric).toBe("tabular-nums");
    expect(off.backgroundColor).toBe("rgb(241, 242, 245)");
    expect(off.color).toBe("rgb(11, 127, 101)");
    const pressed = screen.getByRole("button", { name: "Jump to 2:31" });
    await expect.element(pressed).toHaveAttribute("aria-pressed", "true");
    const on = getComputedStyle(pressed.element());
    expect(on.backgroundColor).toBe("rgb(11, 138, 108)");
    expect(on.color).toBe("rgb(255, 255, 255)");
    await expect
      .element(screen.getByRole("button", { name: "Jump to 1:09" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  test("shows the first 5 chips and +N, which shows the rest of that row", async () => {
    const many = { ...ROWS[1]!, pressed: -1 };
    const screen = await mountInShadowRoot(
      <WordsList {...base} rows={[many]} />,
    );
    const chips = () =>
      [
        ...screen
          .getByRole("group", { name: "Times of dough" })
          .element()
          .querySelectorAll("button"),
      ].map((b) => b.textContent);
    expect(chips()).toEqual(["1:09", "2:31", "3:05", "4:02", "5:47", "+2"]);
    const more = screen.getByRole("button", { name: "Show 2 more times" });
    const style = getComputedStyle(more.element());
    expect(style.borderTopStyle).toBe("dashed");
    expect(style.borderTopColor).toBe("rgb(201, 205, 214)");
    expect(style.height).toBe("26px");
    await more.click();
    expect(chips()).toEqual([
      "1:09",
      "2:31",
      "3:05",
      "4:02",
      "5:47",
      "6:30",
      "8:15",
    ]);
  });

  test("+N for one more says time", async () => {
    const six = { ...ROWS[1]!, places: ROWS[1]!.places.slice(0, 6) };
    const screen = await mountInShadowRoot(
      <WordsList {...base} rows={[six]} />,
    );
    await expect
      .element(screen.getByRole("button", { name: "Show 1 more time" }))
      .toHaveTextContent("+1");
  });

  test("a pressed chip past the first 5 shows them all", async () => {
    const late = { ...ROWS[1]!, pressed: 6 };
    const screen = await mountInShadowRoot(
      <WordsList {...base} rows={[late]} />,
    );
    await expect
      .element(screen.getByRole("button", { name: "Jump to 8:15" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^Show \d+ more/ }).query(),
    ).toBeNull();
  });

  test("a row jumps to its first place, a chip to its own", async () => {
    const onJump = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsList {...base} onJump={onJump} />,
    );
    await rowNamed(screen, "figure out").click();
    expect(onJump).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: "figure out" }),
      0,
    );
    await screen.getByRole("button", { name: "Jump to 3:05" }).click();
    expect(onJump).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: "dough" }),
      2,
    );
  });

  test("rows and chips work from the keyboard", async () => {
    const onJump = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsList {...base} onJump={onJump} />,
    );
    (rowNamed(screen, "figure out").element() as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");
    expect(onJump).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: "figure out" }),
      0,
    );
    const focused = () =>
      (screen.container.getRootNode() as ShadowRoot).activeElement;
    await userEvent.tab();
    expect(focused()).toBe(
      screen.getByRole("button", { name: "Jump to 0:56" }).element(),
    );
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(onJump).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: "figure out" }),
      1,
    );
  });

  test("a click a page script makes jumps nowhere", async () => {
    const onJump = vi.fn();
    const screen = await mountInShadowRoot(
      <WordsList {...base} onJump={onJump} />,
    );
    for (const name of ["figure out, jump to 0:56", "Jump to 1:20"]) {
      const button = screen
        .getByRole("button", { name })
        .element() as HTMLElement;
      button.click();
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(onJump).not.toHaveBeenCalled();
  });

  test("tells which rows come into view, as the list scrolls", async () => {
    const rows: WordRow[] = Array.from({ length: 40 }, (_, i) => ({
      id: `word\nw${i}`,
      head: `w${i}`,
      category: "new",
      count: 1,
      short: "A definition",
      shortLang: "en",
      places: ["0:01"],
      pressed: -1,
    }));
    const shown: string[] = [];
    const screen = await mountInShadowRoot(
      <div style={{ height: "200px", display: "flex" }}>
        <WordsList
          {...base}
          rows={rows}
          onShown={(seen) => shown.push(...seen.map((row) => row.head))}
        />
      </div>,
    );
    await expect.poll(() => shown.length).toBeGreaterThan(0);
    expect(shown).toContain("w0");
    expect(shown).not.toContain("w39");
    const scroller = rowNamed(screen, "w0").element().parentElement!
      .parentElement!;
    scroller.scrollTop = scroller.scrollHeight;
    await expect.poll(() => shown).toContain("w39");
  });

  test("says so when there are no words", async () => {
    const screen = await mountInShadowRoot(<WordsList {...base} rows={[]} />);
    const empty = screen.getByText("No words here yet.");
    await expect.element(empty).toBeVisible();
    expect(getComputedStyle(empty.element()).fontSize).toBe("13px");
    expect(screen.container.querySelectorAll("button")).toHaveLength(0);
  });
});
