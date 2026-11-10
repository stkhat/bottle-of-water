import { describe, expect, it } from "vitest";
import type { send } from "../messaging/client";
import { sendWhileConnected, type ScriptContext } from "./orphan";

/** A content script's context; `extensionGone` is what a reload of the extension does. */
function context() {
  const state = { gone: false, invalidated: 0 };
  const ctx: ScriptContext = {
    get isInvalid() {
      if (state.gone && state.invalidated === 0) state.invalidated++;
      return state.gone;
    },
    block: () => new Promise(() => {}),
  };
  return { ctx, state, extensionGone: () => (state.gone = true) };
}

const settled = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => "resolved",
      () => "rejected",
    ),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
  ]);

const invalidated = () =>
  Promise.reject(new Error("Extension context invalidated."));

describe("sendWhileConnected", () => {
  it("sends and answers while the extension is there", async () => {
    const { ctx } = context();
    const through = sendWhileConnected(ctx, (async () => ({
      learning: 1,
      known: 0,
      phrases: 0,
    })) as unknown as typeof send);
    await expect(through({ type: "counts", lang: "en" })).resolves.toEqual({
      learning: 1,
      known: 0,
      phrases: 0,
    });
  });

  it("passes on the background's errors while the extension is there", async () => {
    const { ctx } = context();
    const through = sendWhileConnected(ctx, (() =>
      Promise.reject(new Error("No saved term"))) as typeof send);
    await expect(through({ type: "counts", lang: "en" })).rejects.toThrow(
      "No saved term",
    );
  });

  it("never settles once the extension is gone, and invalidates the context", async () => {
    const { ctx, state, extensionGone } = context();
    const through = sendWhileConnected(ctx, (() => {
      extensionGone();
      return invalidated();
    }) as typeof send);
    expect(await settled(through({ type: "counts", lang: "en" }))).toBe(
      "pending",
    );
    expect(state.invalidated).toBe(1);
  });

  it("sends nothing after the extension is gone", async () => {
    const { ctx, extensionGone } = context();
    let sent = 0;
    const through = sendWhileConnected(ctx, (() => {
      sent++;
      return invalidated();
    }) as typeof send);
    extensionGone();
    expect(await settled(through({ type: "counts", lang: "en" }))).toBe(
      "pending",
    );
    expect(sent).toBe(0);
  });
});
