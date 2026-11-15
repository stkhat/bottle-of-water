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
