// "In this sentence" in the article's dictionary panel, over the real background and
// the fake on-device AI (src/testing/explain.ts).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import {
  answerJson,
  fakeExplanationProvider,
  HANG,
} from "../../testing/explain";
import {
  cleanUp,
  clickOn,
  dictionary,
  selectText,
  setup,
} from "../../testing/article";

const ARTICLE = `
  <p>They knead the dough and bake loaves.</p>
  <p>It can feel tedious at first. Once you figure out a schedule, it is tedious no more.</p>
  <p>So you can trace each rise and fall back to its cause.</p>`;

/** The meaning of "tedious" in the en-ja pack (one sense). */
const TEDIOUS = "退屈な；うんざりする；面倒な";

beforeAll(async () => {
  await page.viewport(1100, 800);
});
afterEach(cleanUp);

const section = () =>
  dictionary().getByRole("region", { name: "In this sentence" });
const explainButton = () =>
  section().getByRole("button", { name: "Explain in context" });

/** An answer the test lets through when it wants. */
function gate() {
  let open!: (json: string) => void;
  const answer = new Promise<string>((resolve) => (open = resolve));
  return { answer: () => answer, open };
}

describe("In this sentence", () => {
  it("explains a word on request: the button, the reading, then the meaning alone", async () => {
    const held = gate();
    const { provider, log } = fakeExplanationProvider({
      answers: [held.answer],
    });
    const { root, background } = await setup(ARTICLE, {
      explainProvider: provider,
    });
    await clickOn(root, "tedious", 1);
    await expect.element(explainButton()).toBeVisible();
    // A word with an entry waits for the button.
    expect(log.prompts).toEqual([]);

    await explainButton().click();
    const reading = section().getByRole("status", {
      name: "Explaining in context",
    });
    await expect.element(reading).toBeVisible();
    // Two lines before it on the page, one after.
    await expect
      .element(reading.getByText("Reading 3 lines around it…"))
      .toBeVisible();
    expect(log.prompts[0]).toContain(
      "Once you figure out a schedule, it is [[tedious]] no more.",
    );
    expect(log.prompts[0]).toContain(`1. [adjective] ${TEDIOUS}`);

    held.open(answerJson({ meaning: "うんざりする", sense: 1 }));
    await expect.element(section().getByText("うんざりする")).toBeVisible();
    await expect
      .element(section().getByText("On-device AI · 3 lines"))
      .toBeVisible();
    await expect
      .element(section().getByRole("button", { name: "Use this meaning" }))
      .toHaveAttribute("aria-pressed", "false");
    // No explanation for an ordinary use; the dictionary's meaning fits.
    expect(
      section()
        .getByText("None of the dictionary's meanings fit here.")
        .query(),
    ).toBeNull();
    const fits = dictionary().getByText("Fits here", { exact: true });
    await expect.element(fits).toBeVisible();
    expect(fits.element().closest("[data-sense-row]")!.textContent).toContain(
      TEDIOUS,
    );
    await expect.poll(() => background.sent("putExplanation").length).toBe(1);
  });

  it("shows the explanation only for an unusual use, and says when no dictionary meaning fits", async () => {
    const { provider } = fakeExplanationProvider({
      answers: [
        answerJson({
          meaning: "うんざりするほど長い",
          unusual: true,
          explanation: "ここでは比喩的な使い方です。",
          sense: null,
        }),
      ],
    });
    const { root } = await setup(ARTICLE, { explainProvider: provider });
    await clickOn(root, "tedious", 1);
    await explainButton().click();
    await expect
      .element(section().getByText("ここでは比喩的な使い方です。"))
      .toHaveAttribute("lang", "ja");
    await expect
      .element(
        section().getByText("None of the dictionary's meanings fit here."),
      )
      .toBeVisible();
    expect(dictionary().getByText("Fits here").query()).toBeNull();
  });

  it("uses the meaning for this sentence: the word is saved as Learning and the card reads Used here", async () => {
    const { provider } = fakeExplanationProvider({
      answers: [
        answerJson({
          meaning: "うんざりする",
          unusual: true,
          explanation: "比喩的です。",
          sense: 1,
        }),
      ],
    });
    const { root, background } = await setup(ARTICLE, {
      explainProvider: provider,
    });
    await clickOn(root, "tedious", 1);
    await explainButton().click();
    await section().getByRole("button", { name: "Use this meaning" }).click();

    const used = section().getByRole("button", { name: "Used here" });
    await expect.element(used).toHaveAttribute("aria-pressed", "true");
    await expect
      .element(dictionary().getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(background.sent("chooseMeaning")).toEqual([
      {
        type: "chooseMeaning",
        term: expect.objectContaining({
          key: "tedious",
          sentence: "Once you figure out a schedule, it is tedious no more.",
        }),
        meaning: {
          from: "ai",
          text: "うんざりする",
          explanation: "比喩的です。",
        },
      },
    ]);
    // The AI's meaning is in its card, not again among the Meanings.
    expect(dictionary().getByText("AI", { exact: true }).query()).toBeNull();

    await used.click();
    await expect
      .element(section().getByRole("button", { name: "Use this meaning" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(background.sent("chooseMeaning").at(-1)).toMatchObject({
      meaning: null,
    });
  });

  it("shows a kept answer at once when the window opens again on the sentence", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [answerJson({ meaning: "うんざりする" })],
    });
    const { root, background } = await setup(ARTICLE, {
      explainProvider: provider,
    });
    await clickOn(root, "tedious", 1);
    await explainButton().click();
    await expect.element(section().getByText("うんざりする")).toBeVisible();
    await expect.poll(() => background.sent("putExplanation").length).toBe(1);

    // The other sentence with the word is another place: the button again.
    await clickOn(root, "tedious");
    await expect.element(explainButton()).toBeVisible();
    await clickOn(root, "tedious", 1);
    await expect.element(section().getByText("うんざりする")).toBeVisible();
    expect(log.prompts).toHaveLength(1);
  });

  it("downloads the model in the click, with its progress, then explains", async () => {
    let progress: ((loaded: number) => void) | undefined;
    let finish: (() => void) | undefined;
    const { provider } = fakeExplanationProvider({
      availability: "downloadable",
      answers: [answerJson({ meaning: "うんざりする" })],
    });
    provider.download = (_pair, onProgress) => {
      progress = onProgress;
      onProgress(0);
      return new Promise<void>((resolve) => (finish = resolve));
    };
    const { root } = await setup(ARTICLE, { explainProvider: provider });
    await clickOn(root, "tedious", 1);
    await expect
      .element(
        section().getByText(
          "Chrome's on-device AI is downloaded once before its first use.",
        ),
      )
      .toBeVisible();
    await section()
      .getByRole("button", { name: "Download and explain" })
      .click();
    const status = section().getByRole("status");
    await expect
      .element(status)
      .toHaveTextContent("Downloading on-device AI0%");
    progress!(0.63);
    await expect
      .element(status)
      .toHaveTextContent("Downloading on-device AI63%");
    finish!();
    await expect.element(section().getByText("うんざりする")).toBeVisible();
  });

  it("says when it could not explain, and tries again", async () => {
    const { provider } = fakeExplanationProvider({
      answers: [new Error("model failed"), answerJson({ meaning: "退屈な" })],
    });
    const { root } = await setup(ARTICLE, { explainProvider: provider });
    await clickOn(root, "tedious", 1);
    await explainButton().click();
    await expect
      .element(section().getByText("Couldn't explain this."))
      .toBeVisible();
    await section().getByRole("button", { name: "Try again" }).click();
    await expect.element(section().getByText("退屈な")).toBeVisible();
  });

  it("stops explaining a word when another is opened, and when the panel closes", async () => {
    const { provider, log } = fakeExplanationProvider({ answers: [HANG] });
    const { root } = await setup(ARTICLE, { explainProvider: provider });
    await clickOn(root, "tedious", 1);
    await explainButton().click();
    await expect.element(section().getByRole("status")).toBeVisible();
    await clickOn(root, "schedule");
    await expect.poll(() => log.aborted).toBe(1);
    await expect.element(explainButton()).toBeVisible();

    await explainButton().click();
    await expect.poll(() => log.prompts.length).toBe(2);
    await dictionary()
      .getByRole("button", { name: "Close dictionary" })
      .click();
    await expect.poll(() => log.aborted).toBe(2);
  });

  it("explains a selection the dictionary does not have as soon as the panel opens", async () => {
    const { provider, log } = fakeExplanationProvider({
      answers: [answerJson({ meaning: "浮き沈み", sense: 3 })],
    });
    const { root } = await setup(ARTICLE, { explainProvider: provider });
    selectText(root, "rise", 0, "fall", 4);
    await page.getByRole("button", { name: "Details" }).click();
    await expect.element(section().getByText("浮き沈み")).toBeVisible();
    expect(log.prompts[0]).toContain("[[rise and fall]]");
    // Without dictionary meanings: no list in the prompt, nothing said about them.
    expect(log.prompts[0]).not.toContain("1. [");
    expect(
      section()
        .getByText("None of the dictionary's meanings fit here.")
        .query(),
    ).toBeNull();
  });

  it("waits for the button on a selection the dictionary does not have when Settings says so", async () => {
    const { provider, log } = fakeExplanationProvider();
    const { root } = await setup(ARTICLE, {
      explainProvider: provider,
      settings: { explainUnknown: false },
    });
    selectText(root, "rise", 0, "fall", 4);
    await page.getByRole("button", { name: "Details" }).click();
    await expect.element(explainButton()).toBeVisible();
    expect(log.prompts).toEqual([]);
  });

  it("shows nothing where the model cannot run for the pair, nor without one", async () => {
    const { provider } = fakeExplanationProvider({
      availability: "unavailable",
    });
    const unavailable = await setup(ARTICLE, { explainProvider: provider });
    await clickOn(unavailable.root, "tedious", 1);
    await expect.element(dictionary().getByText(TEDIOUS)).toBeVisible();
    await new Promise((r) => setTimeout(r, 100));
    expect(section().query()).toBeNull();
    await cleanUp();

    const without = await setup(ARTICLE);
    await clickOn(without.root, "tedious", 1);
    await expect.element(dictionary().getByText(TEDIOUS)).toBeVisible();
    await new Promise((r) => setTimeout(r, 100));
    expect(section().query()).toBeNull();
  });
});
