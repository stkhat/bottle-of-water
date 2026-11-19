import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplainInput } from "../../core/explain/prompt";
import { DEFAULT_SETTINGS } from "../../core/settings";
import type { send } from "../../messaging/client";
import type { Request } from "../../messaging/protocol";
import { answerJson, fakeExplanationProvider } from "../../testing/explain";
import type { ExplainView } from "../../ui/lookup/InThisSentence";
import { createExplainPanel, STARTING_NOTICE_MS } from "./panel";
import type { ExplainRequest } from "./runner";

const INPUT: ExplainInput = {
  learning: "en",
  native: "ja",
  written: "bank",
  base: "bank",
  kind: "word",
  sentence: "We sat on the bank.",
  marks: [{ start: 14, end: 18 }],
  senses: [{ pos: "noun", text: "土手" }],
  before: ["The river was slow."],
  after: ["Boats went by."],
};

const BANK: ExplainRequest = {
  input: INPUT,
  key: "bank",
  sourceUrl: "https://example.com/river",
};

const BOAT: ExplainRequest = {
  ...BANK,
  key: "boat",
  input: {
    ...INPUT,
    written: "Boats",
    base: "boat",
    sentence: "Boats went by.",
  },
};

/** Nothing kept: every explanation asks the model. */
const noCache = (async (request: Request) =>
  request.type === "getExplanation" ? null : undefined) as typeof send;

/** A model start the test lets through when it wants. */
function gate() {
  let open!: () => void;
  const started = new Promise<void>((resolve) => (open = resolve));
  return { started, open };
}

function setup(started?: Promise<void>) {
  const { provider, log } = fakeExplanationProvider({
    answers: [answerJson({ meaning: "土手" })],
    ...(started && { started }),
  });
  const shown: (ExplainView | null)[] = [];
  const panel = createExplainPanel({
    provider,
    send: noCache,
    settings: () => DEFAULT_SETTINGS,
    show: (view) => shown.push(view),
    savePhrase: async () => {},
  });
  const states = () => shown.map((view) => view?.state ?? null);
  return { panel, log, shown, states };
}

/** Lets promises settle without moving the fake clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the reading placeholder while the model starts", () => {
  it("says Starting on-device AI… after a second of the model starting, then Thinking… again", async () => {
    const model = gate();
    const { panel, log, states } = setup(model.started);
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await settle();
    expect(log.starting).toEqual([true]);
    await vi.advanceTimersByTimeAsync(STARTING_NOTICE_MS - 1);
    expect(states()).toEqual([null, "idle", "reading"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(states()).toEqual([null, "idle", "reading", "starting"]);
    // Still starting: nothing more.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(states()).toEqual([null, "idle", "reading", "starting"]);

    model.open();
    await settle();
    expect(log.starting).toEqual([true, false]);
    expect(states()).toEqual([
      null,
      "idle",
      "reading",
      "starting",
      "reading",
      "answer",
    ]);
  });

  it("never says it when the model starts within the second", async () => {
    const model = gate();
    const { panel, log, states } = setup(model.started);
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await vi.advanceTimersByTimeAsync(STARTING_NOTICE_MS - 1);
    model.open();
    await settle();
    expect(log.starting).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(states()).toEqual([null, "idle", "reading", "answer"]);
  });

  it("never says it once the model is up: later explanations go straight to the prompt", async () => {
    const model = gate();
    const { panel, log, states } = setup(model.started);
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await settle();
    model.open();
    await settle();
    expect(states().at(-1)).toBe("answer");

    await panel.open({ request: BOAT, noEntry: false });
    panel.explain();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log.starting).toEqual([true, false]);
    expect(states().slice(-3)).toEqual(["idle", "reading", "answer"]);
    expect(states()).not.toContain("starting");
  });

  it("leaves no stale text when the window closes or another term opens while it starts", async () => {
    const model = gate();
    const { panel, states } = setup(model.started);
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await vi.advanceTimersByTimeAsync(STARTING_NOTICE_MS);
    expect(states().at(-1)).toBe("starting");
    panel.close();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(states().at(-1)).toBeNull();

    // Closed before the second: the notice never comes.
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await vi.advanceTimersByTimeAsync(STARTING_NOTICE_MS / 2);
    await panel.open({ request: BOAT, noEntry: false });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(states().at(-1)).toBe("idle");

    // The model starting for the aborted explanation keeps nothing on screen.
    model.open();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(states().at(-1)).toBe("idle");
  });

  it("tells the next explanation when an aborted one left the model starting", async () => {
    const model = gate();
    const { panel, log, states } = setup(model.started);
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await settle();
    await panel.open({ request: BOAT, noEntry: false });
    panel.explain();
    await vi.advanceTimersByTimeAsync(STARTING_NOTICE_MS);
    expect(states().slice(-3)).toEqual(["idle", "reading", "starting"]);
    model.open();
    await settle();
    expect(log.starting).toEqual([true, true, false]);
    expect(states().slice(-2)).toEqual(["reading", "answer"]);
  });
});

describe("the phrase of selected words", () => {
  const SENTENCE = "In the end she made up her mind.";
  const selected = (text: string): ExplainRequest => {
    const start = SENTENCE.indexOf(text);
    return {
      key: text,
      sourceUrl: "https://example.com/story",
      input: {
        ...INPUT,
        written: text,
        base: text,
        kind: "phrase",
        sentence: SENTENCE,
        marks: [{ start, end: start + text.length }],
        senses: [],
        selected: true,
      },
    };
  };
  const MIND = { key: "make up one's mind", start: 15, end: 31 };
  type Check = Extract<Request, { type: "checkPhrase" }>;

  /** A panel whose background checks phrases with `check` and saves into `saved`. */
  function phraseSetup(answer: string, check: (r: Check) => unknown) {
    const { provider, log } = fakeExplanationProvider({ answers: [answer] });
    const shown: (ExplainView | null)[] = [];
    const checks: Check[] = [];
    const saved: unknown[] = [];
    const panel = createExplainPanel({
      provider,
      send: (async (request: Request) => {
        if (request.type === "getExplanation") return null;
        if (request.type === "checkPhrase") {
          checks.push(request);
          return check(request);
        }
        return undefined;
      }) as typeof send,
      settings: () => DEFAULT_SETTINGS,
      show: (view) => shown.push(view),
      savePhrase: async (phrase) => {
        saved.push(phrase);
      },
    });
    const last = () => shown.at(-1);
    return { panel, log, checks, saved, last };
  }

  it("asks for the phrase, and offers the one that checks out", async () => {
    const { panel, log, checks, last } = phraseSetup(
      answerJson({ meaning: "決心する", phrase: "make up one's mind" }),
      () => MIND,
    );
    await panel.open({ request: selected("she made up her"), noEntry: true });
    await settle();
    expect(log.prompts[0]).toContain('also answer "phrase"');
    const schema = log.schemas[0] as { properties: object };
    expect(Object.keys(schema.properties)).toEqual([
      "meaning",
      "sense",
      "phrase",
    ]);
    expect(checks).toEqual([
      expect.objectContaining({
        type: "checkPhrase",
        lang: "en",
        sentence: SENTENCE,
        start: SENTENCE.indexOf("she"),
        end: SENTENCE.indexOf(" mind"),
        text: "make up one's mind",
        proposal: true,
      }),
    ]);
    expect(last()).toMatchObject({
      state: "answer",
      phrase: { state: "proposal", key: "make up one's mind" },
    });
  });

  it("offers Edit phrase when the proposal does not check out, or there is none", async () => {
    const wrong = phraseSetup(answerJson({ phrase: "she made up" }), () => ({
      why: "same",
    }));
    await wrong.panel.open({
      request: selected("she made up her"),
      noEntry: true,
    });
    await settle();
    expect(wrong.last()).toMatchObject({ phrase: { state: "none" } });

    const none = phraseSetup(answerJson({ phrase: "" }), () => MIND);
    await none.panel.open({
      request: selected("she made up her"),
      noEntry: true,
    });
    await settle();
    expect(none.checks).toEqual([]);
    expect(none.last()).toMatchObject({ phrase: { state: "none" } });
  });

  it("asks no phrase for a term that was not selected", async () => {
    const { panel, log, last } = phraseSetup(answerJson(), () => MIND);
    await panel.open({ request: BANK, noEntry: false });
    panel.explain();
    await settle();
    expect(log.prompts[0]).not.toContain('"phrase"');
    expect(last()).toEqual({ state: "answer", answer: expect.anything() });
  });

  it("saves the proposal as it checked out", async () => {
    const { panel, saved } = phraseSetup(
      answerJson({ phrase: "make up one's mind" }),
      () => MIND,
    );
    await panel.open({ request: selected("she made up her"), noEntry: true });
    await settle();
    await panel.savePhrase();
    expect(saved).toEqual([
      { key: "make up one's mind", display: "made up her mind" },
    ]);
  });

  it("edits: starts with the proposal, cancels back, says why a typed phrase cannot be saved, saves one that can", async () => {
    const { panel, saved, last } = phraseSetup(
      answerJson({ phrase: "make up one's mind" }),
      (r) =>
        r.proposal || r.text === "made up her mind"
          ? MIND
          : { why: "sentence" },
    );
    await panel.open({ request: selected("she made up her"), noEntry: true });
    await settle();
    panel.editPhrase();
    expect(last()).toMatchObject({
      phrase: { state: "editing", text: "make up one's mind" },
    });
    panel.cancelPhrase();
    expect(last()).toMatchObject({ phrase: { state: "proposal" } });

    panel.editPhrase();
    await panel.savePhrase("kick the bucket");
    expect(last()).toMatchObject({
      phrase: {
        state: "editing",
        text: "kick the bucket",
        problem: { text: "kick the bucket", why: "sentence" },
      },
    });
    expect(saved).toEqual([]);

    await panel.savePhrase("made up her mind");
    expect(saved).toEqual([
      { key: "make up one's mind", display: "made up her mind" },
    ]);
  });

  it("edits a selection without a proposal from its own words", async () => {
    const { panel, last } = phraseSetup(answerJson({ phrase: "" }), () => MIND);
    await panel.open({ request: selected("she made up her"), noEntry: true });
    await settle();
    panel.editPhrase();
    expect(last()).toMatchObject({
      phrase: { state: "editing", text: "she made up her" },
    });
    // Cancelled without a proposal: Edit phrase again.
    panel.cancelPhrase();
    expect(last()).toMatchObject({ phrase: { state: "none" } });
  });
});
