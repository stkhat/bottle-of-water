import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  DictionaryWindow,
  type DictionaryWindowProps,
} from "./DictionaryWindow";
import type { ExplainView } from "./InThisSentence";
import {
  addPageStyle,
  cleanUpMounts,
  mountInShadowRoot,
} from "../../testing/shadow-root";

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

  test("says on the Meanings heading how the translator's model download goes", async () => {
    const english = {
      ...figureOut.entry,
      short: "To come to understand",
      shortLang: "en",
      senses: [{ pos: "verb", text: "To come to understand; to discover." }],
      glossLang: "en",
    };
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        entry={{ ...english, downloading: {} }}
      />,
    );
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Downloading translator…");
    await screen.rerender(
      <DictionaryWindow
        {...figureOut}
        entry={{ ...english, downloading: { share: 0.453 } }}
      />,
    );
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Downloading translator · 45%");
    expect(screen.container.textContent).not.toContain("Machine translation");
    // Translated: the mark takes its place.
    await screen.rerender(
      <DictionaryWindow
        {...figureOut}
        entry={{
          ...english,
          senses: [{ ...english.senses[0]!, translated: "理解する" }],
        }}
      />,
    );
    await expect
      .element(screen.getByText("Machine translation", { exact: true }))
      .toBeVisible();
    expect(screen.container.textContent).not.toContain("Downloading");
  });

  test("marks an English definition and its senses as English", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        entry={{
          ...figureOut.entry,
          short: "To come to understand",
          shortLang: "en",
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
    expect(screen.container.textContent).not.toContain("Machine translation");
  });

  test("shows a translation-table sense's English hint above its native words", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        nativeLang="es"
        entry={{
          head: "upset",
          kind: "word",
          short: "molestar",
          senses: [
            {
              pos: "verb",
              text: "molestar, inquietar",
              hint: "to disturb emotionally",
            },
          ],
        }}
      />,
    );
    const hint = screen.getByText("to disturb emotionally", { exact: true });
    const words = screen.getByText("molestar, inquietar", { exact: true });
    await expect.element(hint).toHaveAttribute("lang", "en");
    await expect.element(words).toHaveAttribute("lang", "es");
    const h = hint.element().getBoundingClientRect();
    const w = words.element().getBoundingClientRect();
    const pos = screen.getByText("verb", { exact: true }).element();
    expect(h.top).toBeGreaterThanOrEqual(
      pos.getBoundingClientRect().bottom - 1,
    );
    expect(w.top).toBeGreaterThanOrEqual(h.bottom - 1);
    // Mock TranslatedSenses: the hint in the muted 13px of an English line.
    expect(getComputedStyle(hint.element()).fontSize).toBe("13px");
    expect(getComputedStyle(words.element()).fontSize).toBe("15px");
    expect(getComputedStyle(hint.element()).color).not.toBe(
      getComputedStyle(words.element()).color,
    );
    expect(screen.container.textContent).not.toContain("Machine translation");
  });

  test("shows translated senses with their English below, marked on the Meanings heading", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...figureOut}
        entry={{
          head: "spill the beans",
          kind: "phrase",
          short: "秘密を漏らす",
          senses: [
            {
              pos: "verb",
              text: "To reveal secret information, especially unintentionally.",
              translated: "秘密を（うっかり）漏らす",
            },
            { pos: "verb", text: "To confess.", translated: "白状する" },
            { pos: "verb", text: "Misspelling of spill the bean." },
          ],
          glossLang: "en",
        }}
      />,
    );
    // The translated short line has no mark of its own: the Meanings heading has it.
    const short = screen.getByText("秘密を漏らす", { exact: true });
    await expect.element(short).toHaveAttribute("lang", "ja");
    const mark = screen.getByText("Machine translation", { exact: true });
    await expect.element(mark).toBeVisible();
    const heading = screen.getByRole("heading", { name: "Meanings" });
    const h = heading.element().getBoundingClientRect();
    const m = mark.element().getBoundingClientRect();
    expect(
      Math.abs((h.top + h.bottom) / 2 - (m.top + m.bottom) / 2),
    ).toBeLessThan(2);
    // On the right of the heading's row, as far right as the senses go.
    const sense = screen
      .getByText("白状する", { exact: true })
      .element()
      .parentElement!.getBoundingClientRect();
    expect(m.left).toBeGreaterThan(h.right);
    expect(Math.abs(m.right - sense.right)).toBeLessThan(1);

    // Each translation in the native language, its English below in smaller, muted text.
    for (const [translation, english] of [
      [
        "秘密を（うっかり）漏らす",
        "To reveal secret information, especially unintentionally.",
      ],
      ["白状する", "To confess."],
    ] as const) {
      const native = screen.getByText(translation, { exact: true });
      const source = screen.getByText(english, { exact: true });
      await expect.element(native).toHaveAttribute("lang", "ja");
      await expect.element(source).toHaveAttribute("lang", "en");
      const n = native.element().getBoundingClientRect();
      const e = source.element().getBoundingClientRect();
      expect(e.top).toBeGreaterThanOrEqual(n.bottom - 1);
      expect(getComputedStyle(native.element()).fontSize).toBe("15px");
      expect(getComputedStyle(source.element()).fontSize).toBe("13px");
      expect(getComputedStyle(source.element()).color).not.toBe(
        getComputedStyle(native.element()).color,
      );
    }
    // A sense left untranslated (a pointer) shows its English as before.
    const pointer = screen.getByText("Misspelling of spill the bean.", {
      exact: true,
    });
    await expect.element(pointer).toHaveAttribute("lang", "en");
    expect(getComputedStyle(pointer.element()).fontSize).toBe("15px");
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
          // The last label was only taken from the senses around it.
          senses: [
            { pos: "noun", text: "パン生地；練り粉" },
            { text: "お金" },
            { pos: "noun", posBy: "gap", text: "生パン" },
          ],
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
    await expect.element(screen.getByText("生パン")).toBeVisible();
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
          "Not saved yet. Save it as Learning or Known and Langle will remember where you see it next.",
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

describe("DictionaryWindow: your meanings", () => {
  const fold: DictionaryWindowProps = {
    ...figureOut,
    entry: {
      head: "fold",
      kind: "word",
      short: "…を折り畳む、折り重ねる",
      senses: [
        // Chosen from the on-device AI in two other sentences.
        { text: "（パン生地の）折り込み", ai: true, native: true, chosen: 2 },
        { pos: "noun", text: "折り目、ひだ" },
        { pos: "verb", text: "…を折り畳む、折り重ねる", chosen: 1 },
        { pos: "verb", text: "（料理で）…をさっくり混ぜる" },
      ],
    },
    onUse: () => {},
  };

  const useButtons = (
    screen: Awaited<ReturnType<typeof mountInShadowRoot>>,
  ) => [...screen.container.querySelectorAll<HTMLButtonElement>("[data-use]")];
  const opacity = (element: Element) => getComputedStyle(element).opacity;

  test("each row shows Use here while the pointer is on it", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...fold} />);
    const buttons = useButtons(screen);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Use here",
      "Use here",
      "Use here",
      "Use here",
    ]);
    expect(buttons.map(opacity)).toEqual(["0", "0", "0", "0"]);
    const text = screen.getByText("折り目、ひだ", { exact: true });
    const row = text.element().closest("[data-sense-row]")!;
    const rowHeight = row.getBoundingClientRect().height;
    await userEvent.hover(text);
    await expect.poll(() => buttons.map(opacity)).toEqual(["0", "1", "0", "0"]);
    const button = screen.getByRole("button", {
      name: "Use here: 折り目、ひだ",
    });
    await expect.element(button).toHaveAttribute("aria-pressed", "false");
    // As tall as the meaning's line box, beside it: the row keeps its height.
    const b = button.element().getBoundingClientRect();
    const line = text.element().getBoundingClientRect();
    expect(b.height).toBeCloseTo(15 * 1.55, 0);
    expect(Math.abs(b.top - line.top)).toBeLessThan(1);
    expect(row.getBoundingClientRect().height).toBe(rowHeight);
    const style = getComputedStyle(button.element());
    expect(style.fontSize).toBe("12px");
    expect(style.borderColor).toBe("rgb(143, 211, 188)");
    expect(style.color).toBe("rgb(7, 92, 73)");
    expect(style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  test("Use here shows when it has focus from the keyboard", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...fold} />);
    const button = screen.getByRole("button", {
      name: "Use here: 折り目、ひだ",
    });
    (button.element() as HTMLButtonElement).focus({ focusVisible: true });
    await expect.poll(() => opacity(button.element())).toBe("1");
  });

  test("pressing it reports the row; the chosen row shows Used here, filled, all the time", async () => {
    const onUse = vi.fn();
    const screen = await mountInShadowRoot(
      <DictionaryWindow {...fold} onUse={onUse} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Use here: 折り目、ひだ" }),
    );
    expect(onUse).toHaveBeenCalledWith(1);

    const senses = fold.entry.senses.map((sense, i) =>
      i === 1 ? { ...sense, chosen: 1, usedHere: true } : sense,
    );
    await screen.rerender(
      <DictionaryWindow
        {...fold}
        entry={{ ...fold.entry, senses }}
        onUse={onUse}
      />,
    );
    const used = screen.getByRole("button", {
      name: "Used here: 折り目、ひだ",
    });
    await expect.element(used).toHaveAttribute("aria-pressed", "true");
    await expect.element(used).toHaveTextContent("Used here");
    await userEvent.unhover(used);
    (used.element() as HTMLButtonElement).blur();
    expect(opacity(used.element())).toBe("1");
    const style = getComputedStyle(used.element());
    expect(style.backgroundColor).toBe("rgb(11, 138, 108)");
    expect(style.color).toBe("rgb(255, 255, 255)");
    // Pressed again: the same row, which undoes it.
    await userEvent.click(used);
    expect(onUse).toHaveBeenLastCalledWith(1);
  });

  test("a meaning from the AI has the AI tag and no part of speech", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...fold}
        entry={{
          ...fold.entry,
          senses: [{ ...fold.entry.senses[0]!, pos: "noun" }],
        }}
      />,
    );
    await expect.element(screen.getByText("AI", { exact: true })).toBeVisible();
    expect(screen.container.querySelectorAll("[data-pos]")).toHaveLength(0);
    await expect
      .element(screen.getByText("（パン生地の）折り込み", { exact: true }))
      .toHaveAttribute("lang", "ja");
  });

  test("a chosen meaning has the bookmark and its count of sentences", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...fold} />);
    await expect
      .element(screen.getByText("2 sentences", { exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("1 sentence", { exact: true }))
      .toBeVisible();
    const marks = screen.getByRole("img", { name: "Your meaning" }).all();
    expect(marks).toHaveLength(2);
    // Before the text, on its line, green.
    const mark = marks[1]!.element().getBoundingClientRect();
    const text = screen
      .getByText("…を折り畳む、折り重ねる", { exact: true })
      .all()
      .at(-1)!
      .element()
      .getBoundingClientRect();
    expect(mark.right).toBeLessThanOrEqual(text.left);
    expect(
      Math.abs((mark.top + mark.bottom) / 2 - (text.top + text.bottom) / 2),
    ).toBeLessThan(3);
    expect(getComputedStyle(marks[1]!.element()).color).toBe(
      "rgb(11, 127, 101)",
    );
    // An unchosen meaning has neither.
    expect(screen.container.textContent).not.toContain("0 sentences");
  });

  test("a translated definition chosen here shows as Used here, with the pack's text below", async () => {
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...fold}
        entry={{
          head: "spill the beans",
          kind: "phrase",
          senses: [
            {
              pos: "verb",
              text: "To confess.",
              translated: "白状する",
              chosen: 1,
              usedHere: true,
            },
          ],
          glossLang: "en",
        }}
      />,
    );
    await expect
      .element(screen.getByRole("button", { name: "Used here: 白状する" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByText("To confess.", { exact: true }))
      .toHaveAttribute("lang", "en");
  });

  test("without onUse, rows have no button", async () => {
    const props = { ...fold, onUse: undefined };
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    expect(useButtons(screen)).toEqual([]);
  });
});

describe("DictionaryWindow: in this sentence", () => {
  const actions = () => ({
    onExplain: vi.fn(),
    onDownload: vi.fn(),
    onRetry: vi.fn(),
    onUse: vi.fn(),
  });
  const withExplain = (
    view: ExplainView,
    more: Partial<NonNullable<DictionaryWindowProps["explain"]>> = {},
  ) => {
    const calls = actions();
    const props: DictionaryWindowProps = {
      ...figureOut,
      explain: {
        view,
        browserName: "Chrome",
        hasSenses: true,
        usedHere: false,
        ...calls,
        ...more,
      },
    };
    return { props, calls };
  };
  const style = (element: Element) => getComputedStyle(element);
  const ANSWER = { meaning: "（パン生地の）折り込み", sense: 1 };

  test("comes after the status buttons, before Meanings, as the button", async () => {
    const { props, calls } = withExplain({ state: "idle" });
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    const section = screen.getByRole("region", { name: "In this sentence" });
    await expect
      .element(section.getByRole("heading", { name: "In this sentence" }))
      .toBeVisible();
    const text = screen.container.textContent;
    expect(text.indexOf("Not saved")).toBeLessThan(
      text.indexOf("In this sentence"),
    );
    expect(text.indexOf("In this sentence")).toBeLessThan(
      text.indexOf("Meanings"),
    );
    const button = section.getByRole("button", { name: "Explain in context" });
    // Mock ContextMeaning `.explain`: pale green with a green outline, 40px tall.
    expect(style(button.element())).toMatchObject({
      height: "40px",
      backgroundColor: "rgb(230, 246, 240)",
      borderTopColor: "rgb(143, 211, 188)",
      color: "rgb(7, 92, 73)",
      fontWeight: "600",
    });
    expect(button.element().querySelector("svg")).not.toBeNull();
    await button.click();
    expect(calls.onExplain).toHaveBeenCalledOnce();
  });

  test("shows the reading placeholder: Thinking…, or Starting on-device AI… in the same place", async () => {
    const { props } = withExplain({ state: "reading" });
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    const status = screen.getByRole("status", {
      name: "Explaining in context",
    });
    const thinking = status.getByText("Thinking…", { exact: true });
    await expect.element(thinking).toBeVisible();
    expect(status.element().querySelectorAll("[data-pulse]")).toHaveLength(3);
    // Mock ContextMeaning `.aimeta`: 12px, muted gray, under the pulsing lines.
    expect(style(thinking.element())).toMatchObject({
      fontSize: "12px",
      color: "rgb(90, 96, 117)",
    });
    const box = (element: Element) => {
      const { left, top, height } = element.getBoundingClientRect();
      return { left, top, height };
    };
    const before = box(thinking.element());
    await screen.rerender(
      <DictionaryWindow {...withExplain({ state: "starting" }).props} />,
    );
    const starting = screen
      .getByRole("status", { name: "Explaining in context" })
      .getByText("Starting on-device AI…", { exact: true });
    await expect.element(starting).toBeVisible();
    expect(screen.getByText("Thinking…").query()).toBeNull();
    expect(screen.container.querySelectorAll("[data-pulse]")).toHaveLength(3);
    expect(style(starting.element())).toMatchObject({
      fontSize: "12px",
      color: "rgb(90, 96, 117)",
    });
    expect(box(starting.element())).toEqual(before);
  });

  test("shows the answer: the meaning, Use this meaning and where it came from", async () => {
    const { props, calls } = withExplain({ state: "answer", answer: ANSWER });
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    const meaning = screen.getByText(ANSWER.meaning);
    await expect.element(meaning).toHaveAttribute("lang", "ja");
    expect(style(meaning.element())).toMatchObject({
      fontSize: "16px",
      fontWeight: "600",
    });
    // The meaning alone, no explanation under it.
    expect(meaning.element().nextElementSibling?.tagName).not.toBe("P");
    await expect
      .element(screen.getByText("On-device AI", { exact: true }))
      .toBeVisible();
    // Mock `.aic`: the card on the window's gray surface.
    const card = meaning.element().parentElement!;
    expect(style(card)).toMatchObject({
      backgroundColor: "rgb(246, 247, 249)",
      borderTopLeftRadius: "10px",
      paddingTop: "14px",
    });
    const use = screen.getByRole("button", { name: "Use this meaning" });
    expect(style(use.element()).height).toBe("34px");
    await use.click();
    expect(calls.onUse).toHaveBeenCalledOnce();
    expect(
      screen.getByText("None of the dictionary's meanings fit here.").query(),
    ).toBeNull();
  });

  test("keeps Use this meaning and where it came from on one line each in the article panel", async () => {
    // The real check (M4): in the 340 px panel both broke onto two lines.
    const props: DictionaryWindowProps = {
      ...panel,
      explain: withExplain({ state: "answer", answer: ANSWER }).props.explain,
    };
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    const lineCount = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
        .size;
    };
    const use = screen.getByRole("button", { name: "Use this meaning" });
    const meta = screen.getByText("On-device AI", { exact: true });
    await expect.element(meta).toBeVisible();
    expect(lineCount(use.element())).toBe(1);
    expect(lineCount(meta.element())).toBe(1);
    // Still at the card's right, as in the mock.
    const card = use.element().closest("div")!.parentElement!;
    const cardRight =
      card.getBoundingClientRect().right -
      parseFloat(getComputedStyle(card).paddingRight) -
      parseFloat(getComputedStyle(card).borderRightWidth);
    expect(meta.element().getBoundingClientRect().right).toBeCloseTo(
      cardRight,
      0,
    );
  });

  test("says when no dictionary meaning fits, and reads Used here when chosen", async () => {
    const { props } = withExplain(
      {
        state: "answer",
        answer: { ...ANSWER, sense: null },
      },
      { usedHere: true },
    );
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    await expect.element(screen.getByText(ANSWER.meaning)).toBeVisible();
    await expect
      .element(screen.getByText("None of the dictionary's meanings fit here."))
      .toBeVisible();
    await expect
      .element(screen.getByText("On-device AI", { exact: true }))
      .toBeVisible();
    const used = screen.getByRole("button", { name: "Used here" });
    await expect.element(used).toHaveAttribute("aria-pressed", "true");
    expect(style(used.element()).backgroundColor).toBe("rgb(11, 138, 108)");
  });

  test("says nothing about the dictionary's meanings for a term without an entry", async () => {
    const { props } = withExplain(
      { state: "answer", answer: { ...ANSWER, sense: null } },
      { hasSenses: false },
    );
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    await expect.element(screen.getByText(ANSWER.meaning)).toBeVisible();
    expect(
      screen.getByText("None of the dictionary's meanings fit here.").query(),
    ).toBeNull();
  });

  test("offers the download with the browser's name, then shows its progress", async () => {
    const { props, calls } = withExplain({ state: "download" });
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    await expect
      .element(
        screen.getByText(
          "Chrome's on-device AI is downloaded once before its first use.",
        ),
      )
      .toBeVisible();
    await screen.getByRole("button", { name: "Download and explain" }).click();
    expect(calls.onDownload).toHaveBeenCalledOnce();

    await screen.rerender(
      <DictionaryWindow
        {...withExplain({ state: "downloading", loaded: 0.456 }).props}
      />,
    );
    const status = screen.getByRole("status");
    await expect
      .element(status)
      .toHaveTextContent("Downloading on-device AI45%");
  });

  test("says when it could not explain, with Try again", async () => {
    const { props, calls } = withExplain({ state: "error" });
    const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
    await expect
      .element(screen.getByText("Couldn't explain this."))
      .toBeVisible();
    await screen.getByRole("button", { name: "Try again" }).click();
    expect(calls.onRetry).toHaveBeenCalledOnce();
  });

  describe("the phrase of selected words (mock CorrectPhrase)", () => {
    const phraseActions = () => ({
      onEditPhrase: vi.fn(),
      onCancelPhrase: vi.fn(),
      onSavePhrase: vi.fn(),
    });
    const withPhrase = (
      phrase: NonNullable<Extract<ExplainView, { state: "answer" }>["phrase"]>,
    ) => {
      const calls = phraseActions();
      const { props } = withExplain(
        {
          state: "answer",
          answer: { meaning: "決心する", sense: null },
          phrase,
        },
        { hasSenses: false, ...calls },
      );
      return { props, calls };
    };

    test("offers the proposal under the answer, with the pencil and Save phrase", async () => {
      const { props, calls } = withPhrase({
        state: "proposal",
        key: "make up one's mind",
      });
      const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
      const key = screen.getByText("make up one's mind", { exact: true });
      await expect.element(key).toBeVisible();
      expect(style(key.element())).toMatchObject({
        fontSize: "15px",
        fontWeight: "600",
      });
      // After Use this meaning and the line, inside the card.
      const text = screen.container.textContent;
      expect(text.indexOf("On-device AI")).toBeLessThan(
        text.indexOf("make up one's mind"),
      );
      const save = screen.getByRole("button", { name: "Save phrase" });
      // Mock `.btn`: as Use this meaning, 34px, green outline.
      expect(style(save.element())).toMatchObject({
        height: "34px",
        borderTopColor: "rgb(143, 211, 188)",
        color: "rgb(7, 92, 73)",
      });
      const edit = screen.getByRole("button", { name: "Edit phrase" });
      expect(style(edit.element())).toMatchObject({
        width: "34px",
        height: "34px",
      });
      // One row: the phrase, the pencil and the button.
      const top = (l: { element(): Element }) =>
        Math.round(l.element().getBoundingClientRect().top);
      expect(top(edit)).toBe(top(save));
      await save.click();
      expect(calls.onSavePhrase).toHaveBeenCalledWith();
      await edit.click();
      expect(calls.onEditPhrase).toHaveBeenCalledOnce();
    });

    test("offers Edit phrase alone without a proposal", async () => {
      const { props, calls } = withPhrase({ state: "none" });
      const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
      const edit = screen.getByRole("button", { name: "Edit phrase" });
      await expect.element(edit).toHaveTextContent("Edit phrase");
      expect(
        screen.getByRole("button", { name: "Save phrase" }).query(),
      ).toBeNull();
      await edit.click();
      expect(calls.onEditPhrase).toHaveBeenCalledOnce();
    });

    test("edits: the field starts with the text and saves what is typed; Cancel leaves it", async () => {
      const { props, calls } = withPhrase({
        state: "editing",
        text: "kicked the",
      });
      const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
      const field = screen.getByRole("textbox", { name: "Phrase" });
      await expect.element(field).toHaveValue("kicked the");
      // Focused in the shadow root, its text selected.
      const input = field.element() as HTMLInputElement;
      expect((input.getRootNode() as ShadowRoot).activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 10]);
      await userEvent.fill(field, "kicked the bucket");
      await screen.getByRole("button", { name: "Save phrase" }).click();
      expect(calls.onSavePhrase).toHaveBeenCalledWith("kicked the bucket");
      await userEvent.keyboard("{Enter}");
      expect(calls.onSavePhrase).toHaveBeenCalledTimes(2);
      await screen.getByRole("button", { name: "Cancel" }).click();
      expect(calls.onCancelPhrase).toHaveBeenCalledOnce();
    });

    test("says why the phrase typed cannot be saved, until it is changed", async () => {
      const { props } = withPhrase({
        state: "editing",
        text: "put the bag away",
        problem: { text: "put the bag away", why: "sentence" },
      });
      const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
      const alert = screen.getByRole("alert");
      await expect.element(alert).toHaveTextContent("Not in this sentence.");
      expect(style(alert.element())).toMatchObject({
        fontSize: "12px",
        color: "rgb(180, 35, 24)",
      });
      const field = screen.getByRole("textbox", { name: "Phrase" });
      await expect.element(field).toHaveAttribute("aria-invalid", "true");
      await userEvent.type(field, "s");
      expect(screen.getByRole("alert").query()).toBeNull();
      await expect.element(field).toHaveAttribute("aria-invalid", "false");
    });

    test("says a phrase needs two words", async () => {
      const { props } = withPhrase({
        state: "editing",
        text: "mind",
        problem: { text: "mind", why: "words" },
      });
      const screen = await mountInShadowRoot(<DictionaryWindow {...props} />);
      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Two words or more.");
    });
  });

  test("tags the meaning the answer names Fits here", async () => {
    const { props } = withExplain({ state: "answer", answer: ANSWER });
    const screen = await mountInShadowRoot(
      <DictionaryWindow
        {...props}
        entry={{
          ...props.entry,
          senses: [
            { pos: "noun", text: "折り目、ひだ" },
            { pos: "verb", text: "…を折り畳む", fits: true },
          ],
        }}
      />,
    );
    const fits = screen.getByText("Fits here", { exact: true });
    await expect.element(fits).toBeVisible();
    expect(fits.element().closest("[data-sense-row]")!.textContent).toContain(
      "…を折り畳む",
    );
    expect(style(fits.element())).toMatchObject({
      height: "20px",
      borderTopColor: "rgb(143, 211, 188)",
      backgroundColor: "rgb(255, 255, 255)",
    });
  });

  test("is not there without the on-device AI", async () => {
    const screen = await mountInShadowRoot(<DictionaryWindow {...figureOut} />);
    await expect.element(screen.getByText("Meanings")).toBeVisible();
    expect(screen.getByText("In this sentence").query()).toBeNull();
  });
});
