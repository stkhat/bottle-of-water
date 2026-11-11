import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answerPageRequests,
  createRelay,
  MESSAGE_TYPE,
  recordErrors,
  type CheckError,
  type PageReply,
  type RecorderScope,
} from "./error-log";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

/** A scope with its own console (so the test runner's console stays quiet). */
function scopeOnWindow() {
  const printed: unknown[][] = [];
  const scope: RecorderScope = {
    console: {
      error: (...args: unknown[]) => void printed.push(args),
      warn: (...args: unknown[]) => void printed.push(args),
    },
    addEventListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      window.removeEventListener(type, listener),
  };
  return { scope, printed };
}

function record(isOurs?: (stack?: string, file?: string) => boolean) {
  const { scope, printed } = scopeOnWindow();
  const entries: CheckError[] = [];
  stops.push(
    recordErrors({
      scope,
      context: "content script youtube",
      sink: (entry) => entries.push(entry),
      url: () => "https://www.youtube.com/watch?v=x",
      now: () => new Date("2026-11-12T10:00:00Z"),
      isOurs,
    }),
  );
  return { scope, printed, entries };
}

describe("recordErrors", () => {
  it("records console errors and warnings and still prints them", () => {
    const { scope, printed, entries } = record();
    scope.console.error("Lingo:", new TypeError("bad"));
    scope.console.warn("careful", { n: 1 });
    expect(printed).toHaveLength(2);
    expect(entries).toEqual([
      expect.objectContaining({
        level: "error",
        message: "Lingo: TypeError: bad",
        stack: expect.stringContaining("bad"),
        context: "content script youtube",
        url: "https://www.youtube.com/watch?v=x",
        time: "2026-11-12T10:00:00.000Z",
      }),
      expect.objectContaining({ level: "warning", message: 'careful {"n":1}' }),
    ]);
  });

  it("records uncaught errors and unhandled rejections", async () => {
    const { entries } = record();
    // Errors thrown here would fail the test run, so the events are dispatched.
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("thrown"), message: "x" }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("rejected"),
      }),
    );
    expect(entries.map((e) => e.message)).toEqual([
      "Uncaught Error: thrown",
      "Uncaught (in promise) Error: rejected",
    ]);
  });

  it("leaves out the page's own uncaught errors when told what is ours", () => {
    const { entries } = record((stack) => Boolean(stack?.includes("ours")));
    const page = new Error("the page's");
    page.stack =
      "Error: the page's\n    at https://www.youtube.com/s/player.js:1:1";
    window.dispatchEvent(new ErrorEvent("error", { error: page }));
    const ours = new Error("ours");
    window.dispatchEvent(new ErrorEvent("error", { error: ours }));
    expect(entries.map((e) => e.message)).toEqual(["Uncaught Error: ours"]);
  });

  it("does not record what its sink logs", () => {
    const { scope } = scopeOnWindow();
    const sink = vi.fn(() => scope.console.error("from the sink"));
    stops.push(recordErrors({ scope, context: "c", sink }));
    scope.console.error("one");
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("gives the console back when uninstalled", () => {
    const { scope } = scopeOnWindow();
    const before = scope.console.error;
    recordErrors({ scope, context: "c", sink: () => {} })();
    expect(scope.console.error).toBe(before);
  });
});

/** What a web page does (docs/development.md "Checking in your own Chrome"). */
function askFromPage(action: "read" | "clear"): Promise<PageReply> {
  return new Promise((resolve) => {
    const id = String(Math.random());
    const onMessage = (e: MessageEvent) => {
      const data = e.data as PageReply;
      if (data?.type !== MESSAGE_TYPE || !data.reply || data.id !== id) return;
      window.removeEventListener("message", onMessage);
      resolve(data);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ type: MESSAGE_TYPE, action, id }, "*");
  });
}

const entry = (message: string): CheckError => ({
  level: "error",
  message,
  context: "content script youtube",
  url: location.href,
  time: "2026-11-12T10:00:00.000Z",
});

describe("answerPageRequests", () => {
  it("answers a page's read with the log and what is still pending, and clears both", async () => {
    let log: CheckError[] = [entry("in the log")];
    const relay = createRelay({
      send: async (entries) => void log.push(...entries),
    });
    stops.push(
      answerPageRequests({
        window,
        context: "content script youtube",
        relay,
        ask: async (action) => {
          if (action === "clear") log = [];
          return log;
        },
      }),
    );
    relay.push(entry("just recorded"));
    const read = await askFromPage("read");
    expect(read).toMatchObject({
      context: "content script youtube",
      connected: true,
    });
    expect(read.entries.map((e) => e.message)).toEqual([
      "in the log",
      "just recorded",
    ]);

    expect((await askFromPage("clear")).connected).toBe(true);
    expect((await askFromPage("read")).entries).toEqual([]);
  });

  it("still answers with its pending entries once the extension is gone", async () => {
    const relay = createRelay({
      send: () => Promise.reject(new Error("gone")),
    });
    stops.push(
      answerPageRequests({
        window,
        context: "content script article",
        relay,
        ask: () => Promise.reject(new Error("Extension context invalidated.")),
      }),
    );
    relay.push(entry("teardown"));
    const read = await askFromPage("read");
    expect(read.connected).toBe(false);
    expect(read.entries.map((e) => e.message)).toEqual(["teardown"]);
  });

  it("ignores its own replies and other messages", async () => {
    const ask = vi.fn(async () => []);
    stops.push(
      answerPageRequests({
        window,
        context: "c",
        relay: createRelay({ send: async () => {} }),
        ask,
      }),
    );
    window.postMessage(
      { type: "something else", action: "read", id: "1" },
      "*",
    );
    await askFromPage("read");
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
