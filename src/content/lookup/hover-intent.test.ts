import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverIntent } from "./hover-intent";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const log: string[] = [];
  /** No card shows while true (words are selected). */
  const blocked = { now: false };
  const intent = createHoverIntent<string>({
    show: (word) => log.push(`show ${word}`),
    hide: () => log.push("hide"),
    blocked: () => blocked.now,
  });
  return { log, intent, blocked };
}

describe("createHoverIntent", () => {
  it("shows a word's card after the pointer rests on it", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(249);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["show bread"]);
  });

  it("shows nothing when the pointer only passes over a word", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(100);
    intent.leave();
    vi.advanceTimersByTime(1000);
    expect(log).toEqual([]);
  });

  it("hides the card a moment after the pointer leaves the word", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    intent.leave();
    vi.advanceTimersByTime(199);
    expect(log).toEqual(["show bread"]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["show bread", "hide"]);
  });

  it("keeps the card while the pointer is on it, and hides it after it leaves", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    intent.leave();
    vi.advanceTimersByTime(100);
    intent.keep();
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["show bread"]);
    intent.release();
    vi.advanceTimersByTime(200);
    expect(log).toEqual(["show bread", "hide"]);
  });

  it("moves to the next word without hiding in between", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    intent.leave();
    intent.enter("dough");
    vi.advanceTimersByTime(250);
    expect(log).toEqual(["show bread", "show dough"]);
  });

  it("tries a word whose card could not show again when the pointer comes back", () => {
    const { log, intent, blocked } = setup();
    blocked.now = true;
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    expect(log).toEqual([]);
    blocked.now = false;
    // The pointer moves on the same word.
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    expect(log).toEqual(["show bread"]);
  });

  it("hides the card up when the next word's card cannot show", () => {
    const { log, intent, blocked } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    blocked.now = true;
    intent.enter("dough");
    vi.advanceTimersByTime(250);
    expect(log).toEqual(["show bread", "hide"]);
  });

  it("coming back to the shown word keeps its card", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    intent.leave();
    vi.advanceTimersByTime(100);
    intent.enter("bread");
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["show bread"]);
  });

  it("hides at once when cancelled", () => {
    const { log, intent } = setup();
    intent.enter("bread");
    vi.advanceTimersByTime(250);
    intent.cancel();
    expect(log).toEqual(["show bread", "hide"]);
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["show bread", "hide"]);
  });
});
