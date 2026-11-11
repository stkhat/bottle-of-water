import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  DictionaryWindow,
  type DictionaryWindowProps,
} from "./DictionaryWindow";
import { addPageStyle, cleanUpMounts, mountInShadowRoot } from "./testing";

const figureOut: DictionaryWindowProps = {
  variant: "window",
  frame: { left: 20, top: 30, height: 340 },
  entry: {
    head: "figure out",
    kind: "phrase",
    ipa: "/ˈfɪɡjər ˈaʊt/",
    sub: "figure — 数字、姿、人物",
    short: "（答え・方法を）見つけ出す、理解する",
    senses: [
      {
        pos: "phrasal verb",
        text: "（答え・方法を）見つけ出す；理解する；解決する",
      },
    ],
  },
  nativeLang: "ja",
  learningLang: "en",
  status: "learning",
  onStatus: () => {},
  onSpeak: () => {},
  dictionaries: [
    {
      label: "Cambridge",
      href: "https://dictionary.cambridge.org/dictionary/english/figure-out",
    },
    {
      label: "Wiktionary",
      href: "https://en.wiktionary.org/wiki/figure%20out",
    },
  ],
  here: {
    source: "video",
    items: [
      {
        time: "0:56",
        text: "So today we're going to figure out how to make bread from scratch.",
      },
      { time: "1:20", text: "Once you figure out the timing, it's easy." },
    ],
  },
  elsewhere: [
    {
      video: false,
      title: "Why patient bakers end up with better bread",
      meta: "theweekendtable.example · Nov 6",
      text: "…once you figure out a schedule that fits your week…",
    },
    {
      video: true,
      title: "10 phrasal verbs you hear every day",
      meta: "YouTube · at 3:41",
      text: "…you just have to figure it out yourself.",
    },
  ],
  onClose: () => {},
};

const panel: DictionaryWindowProps = {
  ...figureOut,
  variant: "panel",
  frame: { top: 236, right: 24, bottom: 24 },
  here: {
    source: "page",
    items: [{ text: "…once you figure out a schedule that fits your week…" }],
  },
};

afterEach(cleanUpMounts);

describe("DictionaryWindow", () => {
  test("shows the entry: head, kind, IPA, notes and translation", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    await expect
      .element(screen.getByRole("heading", { name: "figure out", level: 2 }))
      .toBeVisible();
    await expect.element(screen.getByText("Phrase")).toBeVisible();
    await expect.element(screen.getByText("/ˈfɪɡjər ˈaʊt/")).toBeVisible();
    await expect
      .element(screen.getByText("figure — 数字、姿、人物"))
      .toBeVisible();
    await expect
      .element(screen.getByText("（答え・方法を）見つけ出す、理解する"))
      .toHaveAttribute("lang", "ja");
  });

  test("marks a machine-translated translation", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...panel}
        entry={{
          head: "wait an hour",
          kind: "phrase",
          short: "1時間待つ",
          senses: [],
          machineTranslated: true,
        }}
      />,
    );
    await expect
      .element(screen.getByText("1時間待つ"))
      .toHaveAttribute("lang", "ja");
    await expect
      .element(screen.getByText("Machine translation", { exact: true }))
      .toBeVisible();
    await screen.rerender(<DictionaryWindow {...panel} />);
    expect(screen.container.textContent).not.toContain("Machine translation");
  });

  test("marks an English definition and its senses as English", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        entry={{
          ...figureOut.entry,
          short: "To come to understand",
          senses: [
            { pos: "verb", text: "To come to understand; to discover." },
          ],
          glossLang: "en",
        }}
      />,
    );
    await expect
      .element(screen.getByText("To come to understand", { exact: true }))
      .toHaveAttribute("lang", "en");
    await expect
      .element(screen.getByText("To come to understand; to discover."))
      .toHaveAttribute("lang", "en");
  });

  test("marks the sentences as the learning language", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    for (const text of [
      "Once you figure out the timing, it's easy.",
      "…you just have to figure it out yourself.",
    ])
      await expect
        .element(screen.getByText(text, { exact: true }))
        .toHaveAttribute("lang", "en");

    const spanish = await mountInShadowRoot(
      <DictionaryWindow {...panel} learningLang="es" />,
    );
    // The page's sentence is both on this page and seen elsewhere.
    const sentence = spanish.getByText(
      "…once you figure out a schedule that fits your week…",
      { exact: true },
    );
    await expect.element(sentence.first()).toHaveAttribute("lang", "es");
    await expect.element(sentence.last()).toHaveAttribute("lang", "es");
    await expect
      .element(
        spanish.getByText("…you just have to figure it out yourself.", {
          exact: true,
        }),
      )
      .toHaveAttribute("lang", "es");
  });

  test("the window has a header with a move handle; the panel does not", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    await expect
      .element(screen.getByRole("complementary", { name: "Dictionary window" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Move window" }))
      .toBeVisible();
    await screen.rerender(<DictionaryWindow {...panel} />);
    await expect
      .element(screen.getByRole("complementary", { name: "Dictionary" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Move window" }))
      .not.toBeInTheDocument();
  });

  test("leaves out IPA, notes and translation when missing", async () => {
    const entry = { head: "dough", kind: "word" as const, senses: [] };
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} entry={entry} />,
    );
    await expect
      .element(screen.getByText("Word", { exact: true }))
      .toBeVisible();
    const text = screen.container.textContent;
    expect(text).not.toContain("/ˈfɪɡjər");
    expect(text).not.toContain("数字");
    expect(text).not.toContain("見つけ出す");
  });

  test("status buttons show the current status and report clicks", async () => {
    const onStatus = vi.fn();
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} onStatus={onStatus} />,
    );
    const group = screen.getByRole("group", { name: "Word status" });
    const learning = group.getByRole("button", { name: "Learning" });
    const known = group.getByRole("button", { name: "Known" });
    const remove = group.getByRole("button", { name: "Remove" });
    await expect.element(learning).toHaveAttribute("aria-pressed", "true");
    await expect.element(known).toHaveAttribute("aria-pressed", "false");
    await expect.element(remove).toHaveAttribute("aria-pressed", "false");
    await known.click();
    expect(onStatus).toHaveBeenLastCalledWith("known");
    await remove.click();
    expect(onStatus).toHaveBeenLastCalledWith("new");
    await learning.click();
    expect(onStatus).toHaveBeenLastCalledWith("learning");
  });

  test("an unsaved entry shows Not saved, pressed", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} status="new" elsewhere={[]} />,
    );
    const group = screen.getByRole("group", { name: "Word status" });
    await expect
      .element(group.getByRole("button", { name: "Not saved" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(group.getByRole("button", { name: "Remove" }))
      .not.toBeInTheDocument();
  });

  test("the speaker button plays the pronunciation", async () => {
    const onSpeak = vi.fn();
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} onSpeak={onSpeak} />,
    );
    await screen.getByRole("button", { name: "Play pronunciation" }).click();
    expect(onSpeak).toHaveBeenCalledOnce();
  });

  test("lists meanings, with a part of speech only when known", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        entry={{
          ...figureOut.entry,
          senses: [{ pos: "noun", text: "パン生地；練り粉" }, { text: "お金" }],
        }}
      />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Meanings" }))
      .toBeVisible();
    await expect.element(screen.getByText("noun")).toBeVisible();
    await expect
      .element(screen.getByText("パン生地；練り粉"))
      .toHaveAttribute("lang", "ja");
    await expect.element(screen.getByText("お金")).toBeVisible();
    expect(screen.container.querySelectorAll("[data-pos]")).toHaveLength(1);
  });

  test("dictionary links open in a new tab", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    const cambridge = screen.getByRole("link", { name: "Cambridge" });
    await expect
      .element(cambridge)
      .toHaveAttribute(
        "href",
        "https://dictionary.cambridge.org/dictionary/english/figure-out",
      );
    await expect.element(cambridge).toHaveAttribute("target", "_blank");
    await expect.element(cambridge).toHaveAttribute("rel", "noopener");
    await expect
      .element(screen.getByRole("link", { name: "Wiktionary" }))
      .toHaveAttribute("href", "https://en.wiktionary.org/wiki/figure%20out");
  });

  test("sections without content are left out", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        entry={{ ...figureOut.entry, senses: [] }}
        dictionaries={[]}
        here={{ source: "video", items: [] }}
      />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Seen elsewhere · 2" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Meanings" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Dictionaries" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: /In this video/ }))
      .not.toBeInTheDocument();
  });

  test("In this video lists times; clicking one seeks there", async () => {
    const onClick = vi.fn();
    const items = [
      { time: "0:56", text: "So today we're going to figure out…", onClick },
    ];
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} here={{ source: "video", items }} />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "In this video · 1" }))
      .toBeVisible();
    await screen.getByRole("button", { name: /0:56/ }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("In this video marks the term in each line with its category's highlight", async () => {
    const items = [
      {
        time: "0:56",
        text: "Once you figure it out, it's easy.",
        // A phrase with a gap: each part is marked.
        marks: [
          { start: 9, end: 15, category: "learning" as const },
          { start: 19, end: 22, category: "learning" as const },
        ],
        onClick: () => {},
      },
    ];
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} here={{ source: "video", items }} />,
    );
    const row = screen.getByRole("button", { name: /0:56/ });
    await expect.element(row).toBeVisible();
    expect(row.element().textContent).toBe(
      "0:56Once you figure it out, it's easy.",
    );
    const marks = [...row.element().querySelectorAll("[data-mark]")];
    expect(marks.map((m) => m.textContent)).toEqual(["figure", "out"]);
    for (const mark of marks) {
      const style = getComputedStyle(mark);
      expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(style.boxShadow).toContain("inset");
    }
  });

  test("On this page lists the sentences", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...panel} />);
    await expect
      .element(screen.getByRole("heading", { name: "On this page · 1" }))
      .toBeVisible();
    await expect
      .element(
        screen
          .getByText("…once you figure out a schedule that fits your week…")
          .first(),
      )
      .toBeVisible();
  });

  test("Seen elsewhere lists other sources with their kind", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    await expect
      .element(screen.getByRole("heading", { name: "Seen elsewhere · 2" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("10 phrasal verbs you hear every day"))
      .toBeVisible();
    await expect.element(screen.getByText("YouTube · at 3:41")).toBeVisible();
    await expect
      .element(screen.getByRole("img", { name: "Video" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("img", { name: "Web page" }))
      .toBeVisible();
  });

  test("a source with an address links to it", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        elsewhere={[
          {
            ...figureOut.elsewhere[0]!,
            href: "https://theweekendtable.example/bread",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", {
      name: /Why patient bakers end up with better bread/,
    });
    await expect
      .element(link)
      .toHaveAttribute("href", "https://theweekendtable.example/bread");
    await expect.element(link).toHaveAttribute("target", "_blank");
  });

  test("an unsaved entry explains that saving starts recording", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} status="new" elsewhere={[]} />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Seen elsewhere · 0" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Not saved yet. Save it as Learning or Known and Lingo will remember where you see it next.",
        ),
      )
      .toBeVisible();
  });

  test("an unsaved entry with kept sentences lists them without the note", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} status="new" />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Seen elsewhere · 2" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("10 phrasal verbs you hear every day"))
      .toBeVisible();
    expect(screen.getByText(/^Not saved yet/).query()).toBeNull();
  });

  test("a saved entry seen nowhere else shows no note", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} elsewhere={[]} />,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Seen elsewhere · 0" }))
      .toBeVisible();
    expect(screen.getByText(/^Not saved yet/).query()).toBeNull();
  });

  test("× and Escape close it", async () => {
    const onClose = vi.fn();
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...figureOut} onClose={onClose} />,
    );
    await screen.getByRole("button", { name: "Close dictionary" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    (
      screen
        .getByRole("button", { name: "Play pronunciation" })
        .element() as HTMLElement
    ).focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("the window is placed at its frame; the panel along the right edge", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    const win = screen.getByRole("complementary").element();
    let rect = win.getBoundingClientRect();
    expect([rect.left, rect.top, rect.width, rect.height]).toEqual([
      20, 30, 360, 340,
    ]);
    await screen.rerender(
      <DictionaryWindow
        {...panel}
        frame={{ top: 40, right: 24, bottom: 24 }}
      />,
    );
    rect = screen.getByRole("complementary").element().getBoundingClientRect();
    expect(rect.width).toBe(340);
    expect(rect.top).toBe(40);
    expect(rect.right).toBe(document.documentElement.clientWidth - 24);
    expect(rect.bottom).toBe(document.documentElement.clientHeight - 24);
  });

  test("in fullscreen the window's shadow is darker, over the video", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    const shadow = () =>
      getComputedStyle(screen.getByRole("complementary").element()).boxShadow;
    expect(shadow()).toBe("rgba(20, 24, 43, 0.22) 0px 18px 48px 0px");
    await screen.rerender(<DictionaryWindow {...figureOut} fullscreen />);
    expect(shadow()).toBe("rgba(0, 0, 0, 0.45) 0px 18px 48px 0px");
  });

  test("dragging the handle moves the window and keeps it in the viewport", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    const win = screen.getByRole("complementary").element();
    const handle = screen
      .getByRole("button", { name: "Move window" })
      .element();
    const drag = (dx: number, dy: number) => {
      const r = handle.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const opts = {
        bubbles: true,
        composed: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
      };
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { ...opts, clientX: x, clientY: y }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          ...opts,
          clientX: x + dx,
          clientY: y + dy,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          ...opts,
          clientX: x + dx,
          clientY: y + dy,
        }),
      );
    };

    drag(15, 25);
    await expect.poll(() => win.getBoundingClientRect().left).toBe(35);
    expect(win.getBoundingClientRect().top).toBe(55);

    drag(5000, 5000);
    await expect
      .poll(() => win.getBoundingClientRect().right)
      .toBe(document.documentElement.clientWidth);
    expect(win.getBoundingClientRect().bottom).toBe(
      document.documentElement.clientHeight,
    );

    drag(-9000, -9000);
    await expect.poll(() => win.getBoundingClientRect().left).toBe(0);
    expect(win.getBoundingClientRect().top).toBe(0);
  });

  test("page styles do not leak in", async () => {
    addPageStyle("* { color: red !important; font-size: 40px !important }");
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    const head = screen.getByRole("heading", { level: 2 }).element();
    expect(getComputedStyle(head).color).toBe("rgb(20, 24, 43)");
    expect(getComputedStyle(head).fontSize).toBe("26px");
  });
});
