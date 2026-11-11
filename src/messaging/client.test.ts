// sendMessage's typings include a callback overload that returns void, so a mock that
// returns a promise trips no-misused-promises.
/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { send } from "./client";
import type { Counts } from "../messaging/protocol";
import { PacksUnavailableError } from "../core/packs/unavailable";
import type { AnalyzeResult, Reply } from "./protocol";

beforeEach(() => fakeBrowser.reset());
afterEach(() => vi.restoreAllMocks());

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

  it("throws a packsUnavailable reply as PacksUnavailableError with its packs", async () => {
    answer(() => ({
      ok: false,
      error: "Language data not available: es, es-en",
      code: "packsUnavailable",
      packs: ["es", "es-en"],
    }));
    const lookup = send({
      type: "lookup",
      lang: "es",
      key: "comer",
    });
    await expect(lookup).rejects.toThrow(PacksUnavailableError);
    await expect(lookup).rejects.toMatchObject({
      packs: ["es", "es-en"],
      message: "Language data not available: es, es-en",
    });
  });

  it("asks again for the state of the language data, a retry and a removal when the service worker stopped", async () => {
    answer(() => ({ ok: true, value: null }));
    const real = browser.runtime.sendMessage.bind(browser.runtime);
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation(((
      message: unknown,
    ) => {
      calls++;
      return calls % 2 === 1
        ? Promise.reject(new Error(CLOSED))
        : real(message);
    }) as typeof browser.runtime.sendMessage);
    await send({ type: "packStatus" });
    await send({ type: "retryPacks" });
    await send({ type: "removePack", pack: "es" });
    expect(calls).toBe(6);
  });

  it("fails when nothing answers", async () => {
    browser.runtime.onMessage.addListener(() => undefined);
    await expect(send({ type: "syncStatus" })).rejects.toThrow(
      "No reply from the background",
    );
  });

  it("tries again when the service worker was not there to receive the request", async () => {
    answer(() => ({ ok: true, value: null }));
    const real = browser.runtime.sendMessage.bind(browser.runtime);
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation(((
      message: unknown,
    ) => {
      calls++;
      return calls === 1
        ? Promise.reject(
            new Error(
              "Could not establish connection. Receiving end does not exist.",
            ),
          )
        : real(message);
    }) as typeof browser.runtime.sendMessage);
    await expect(send({ type: "warmDictionary", lang: "en" })).resolves.toBe(
      null,
    );
    expect(calls).toBe(2);
  });

  it("gives up when the service worker stays unreachable", async () => {
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation((() => {
      calls++;
      return Promise.reject(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      );
    }) as typeof browser.runtime.sendMessage);
    await expect(send({ type: "syncStatus" })).rejects.toThrow(
      "Receiving end does not exist",
    );
    expect(calls).toBe(3);
  });

  const CLOSED =
    "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";

  it("asks again when the service worker stopped before answering", async () => {
    answer(() => ({ ok: true, value: { learning: 0, known: 0, phrases: 0 } }));
    const real = browser.runtime.sendMessage.bind(browser.runtime);
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation(((
      message: unknown,
    ) => {
      calls++;
      return calls === 1 ? Promise.reject(new Error(CLOSED)) : real(message);
    }) as typeof browser.runtime.sendMessage);
    await expect(send({ type: "counts", lang: "en" })).resolves.toEqual({
      learning: 0,
      known: 0,
      phrases: 0,
    });
    expect(calls).toBe(2);
  });

  it("asks again when the service worker went away without an answer", async () => {
    answer(() => ({ ok: true, value: null }));
    const real = browser.runtime.sendMessage.bind(browser.runtime);
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation(((
      message: unknown,
    ) => {
      calls++;
      // What Chromium sometimes resolves with when the worker stops mid-request.
      return calls === 1 ? Promise.resolve(undefined) : real(message);
    }) as typeof browser.runtime.sendMessage);
    await expect(send({ type: "warmDictionary", lang: "en" })).resolves.toBe(
      null,
    );
    expect(calls).toBe(2);
  });

  it("does not repeat a change that may have been made when the service worker stopped before answering", async () => {
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation((() => {
      calls++;
      return Promise.reject(new Error(CLOSED));
    }) as typeof browser.runtime.sendMessage);
    await expect(send({ type: "undoSaveAll", batchId: "b1" })).rejects.toThrow(
      CLOSED,
    );
    expect(calls).toBe(1);
  });

  it("does not try again after other failures", async () => {
    let calls = 0;
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation((() => {
      calls++;
      return Promise.reject(new Error("Extension context invalidated."));
    }) as typeof browser.runtime.sendMessage);
    await expect(send({ type: "syncStatus" })).rejects.toThrow(
      "Extension context invalidated.",
    );
    expect(calls).toBe(1);
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
