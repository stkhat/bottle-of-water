import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { send } from "./client";
import type { Counts } from "../background/term-store";
import type { AnalyzeResult, Reply } from "./protocol";

beforeEach(() => fakeBrowser.reset());

/** A background that answers every message with `reply`, the way the real one does. */
function answer(reply: (message: unknown) => Reply) {
  const received: unknown[] = [];
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    received.push(message);
    sendResponse(reply(message));
    return true;
  });
  return received;
}

describe("send", () => {
  it("sends the request and resolves with the value of the reply", async () => {
    const received = answer(() => ({
      ok: true,
      value: { learning: 2, known: 5, phrases: 1 },
    }));
    const counts = await send({ type: "counts", lang: "en" });
    expect(counts).toEqual({ learning: 2, known: 5, phrases: 1 });
    expect(received).toEqual([{ type: "counts", lang: "en" }]);
  });

  it("rethrows an error reply as an Error with its message", async () => {
    answer(() => ({ ok: false, error: "No saved term en:dough" }));
    await expect(
      send({ type: "setStatus", id: "en:dough", status: "known" }),
    ).rejects.toThrow(new Error("No saved term en:dough"));
  });

  it("fails when nothing answers", async () => {
    browser.runtime.onMessage.addListener(() => undefined);
    await expect(send({ type: "syncStatus" })).rejects.toThrow(
      "No reply from the background",
    );
  });

  it("types the response by the request type", () => {
    answer(() => ({ ok: true, value: null }));
    expectTypeOf(
      send({ type: "counts", lang: "en" }),
    ).resolves.toEqualTypeOf<Counts>();
    expectTypeOf(
      send({ type: "analyze", lang: "en", blocks: [] }),
    ).resolves.toEqualTypeOf<AnalyzeResult>();
    // @ts-expect-error: counts needs a language
    void send({ type: "counts" }).catch(() => undefined);
  });
});
