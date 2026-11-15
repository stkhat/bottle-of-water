import { describe, expect, it, vi } from "vitest";
import { ANSWER_SCHEMA } from "../../core/explain/answer";
import {
  chromePromptApi,
  createChromePromptApi,
  majorVersion,
  type LanguageModelApi,
} from "./chrome-prompt-api";

const EN_JA = { learning: "en", native: "ja" };

/** A session of the fake model: current member names, or Chrome's older ones. */
function fakeSession(
  log: FakeLog,
  options: { old?: boolean; system?: string; hang?: boolean },
) {
  const window = 9216;
  const used = options.system ? Math.ceil(options.system.length / 4) : 0;
  const measure = async (text: string) => Math.ceil(text.length / 4);
  const session = {
    ...(options.old
      ? { inputQuota: window, inputUsage: used, measureInputUsage: measure }
      : {
          contextWindow: window,
          contextUsage: used,
          measureContextUsage: measure,
        }),
    destroyed: false,
    async prompt(
      text: string,
      o: { responseConstraint?: object; signal?: AbortSignal } = {},
    ) {
      log.prompts.push({ text, schema: o.responseConstraint });
      if (options.hang)
        return new Promise<string>((_, reject) =>
          o.signal?.addEventListener("abort", () =>
            reject(o.signal!.reason as Error),
          ),
        );
      return '{"meaning":"土手"}';
    },
    async clone() {
      log.clones++;
      const copy = fakeSession(log, options);
      log.sessions.push(copy);
      return copy;
    },
    destroy() {
      session.destroyed = true;
    },
  };
  return session;
}

interface FakeLog {
  availability: unknown[];
  creates: object[];
  sessions: ReturnType<typeof fakeSession>[];
  prompts: { text: string; schema?: object }[];
  clones: number;
}

/** A fake `LanguageModel` global. */
function fakeModel(
  options: {
    availability?: (o: unknown) => string;
    old?: boolean;
    hang?: boolean;
    progress?: { loaded: number; total?: number }[];
    createFails?: boolean;
    /** `create()` resolves once this does (the model loading). */
    loaded?: Promise<void>;
  } = {},
) {
  const log: FakeLog = {
    availability: [],
    creates: [],
    sessions: [],
    prompts: [],
    clones: 0,
  };
  const api: LanguageModelApi = {
    async availability(o) {
      log.availability.push(o);
      return options.availability?.(o) ?? "available";
    },
    async create(o = {} as never) {
      log.creates.push(o);
      if (options.createFails) throw new DOMException("No", "NotAllowedError");
      await options.loaded;
      if (o.monitor) {
        const target = new EventTarget();
        o.monitor(target);
        for (const p of options.progress ?? [])
          target.dispatchEvent(Object.assign(new Event("downloadprogress"), p));
      }
      const session = fakeSession(log, {
        ...options,
        ...(o.initialPrompts && { system: o.initialPrompts[0]!.content }),
      });
      log.sessions.push(session);
      return session as never;
    },
  };
  return { api, log };
}

describe("chromePromptApi", () => {
  it("exists only where LanguageModel does", () => {
    expect(chromePromptApi({})).toBeUndefined();
    const provider = chromePromptApi({ LanguageModel: fakeModel().api });
    expect(provider?.name).toBe("chrome-prompt-api");
  });

  it("keys its answers by the browser engine's major version", () => {
    expect(createChromePromptApi(fakeModel().api, "157").version).toBe("157");
    expect(
      majorVersion([
        { brand: "Not=A?Brand", version: "24" },
        { brand: "Chromium", version: "157" },
        { brand: "Google Chrome", version: "157" },
      ]),
    ).toBe("157");
    expect(majorVersion([{ brand: "Chromium", version: "140.0.1.2" }])).toBe(
      "140",
    );
    expect(majorVersion(undefined)).toBe("0");
  });
});

describe("availability", () => {
  it.each([
    ["available", "ready"],
    ["readily", "ready"],
    ["downloadable", "downloadable"],
    ["after-download", "downloadable"],
    ["downloading", "downloading"],
    ["unavailable", "unavailable"],
    ["no", "unavailable"],
    ["something new", "unavailable"],
  ])("reads %s as %s", async (value, expected) => {
    const { api } = fakeModel({ availability: () => value });
    const provider = createChromePromptApi(api, "157");
    expect(await provider.availability(EN_JA)).toBe(expected);
  });

  it("asks for the pair's languages: English instructions and the learning language in, the native language out", async () => {
    const { api, log } = fakeModel({
      availability: (o) =>
        JSON.stringify(o).includes('"pt"') ? "unavailable" : "available",
    });
    const provider = createChromePromptApi(api, "157");
    expect(await provider.availability({ learning: "es", native: "en" })).toBe(
      "ready",
    );
    expect(log.availability[0]).toEqual({
      expectedInputs: [{ type: "text", languages: ["en", "es"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
    expect(await provider.availability({ learning: "en", native: "pt" })).toBe(
      "unavailable",
    );
    expect(log.availability[1]).toEqual({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["pt"] }],
    });
  });
});

describe("download", () => {
  it("reports progress as a share and frees the session it made", async () => {
    const { api, log } = fakeModel({
      progress: [{ loaded: 0 }, { loaded: 0.5 }, { loaded: 1 }],
    });
    const progress: number[] = [];
    await createChromePromptApi(api, "157").download(EN_JA, (p) =>
      progress.push(p),
    );
    expect(progress).toEqual([0, 0.5, 1]);
    expect(log.creates[0]).toMatchObject({
      expectedOutputs: [{ type: "text", languages: ["ja"] }],
    });
    expect(log.sessions[0]!.destroyed).toBe(true);
  });

  it("reads bytes of a total, as older versions report them", async () => {
    const { api } = fakeModel({
      progress: [
        { loaded: 0, total: 4000 },
        { loaded: 1000, total: 4000 },
      ],
    });
    const progress: number[] = [];
    await createChromePromptApi(api, "157").download(EN_JA, (p) =>
      progress.push(p),
    );
    expect(progress).toEqual([0, 0.25]);
  });

  it("fails as the model fails (no user activation)", async () => {
    const { api } = fakeModel({ createFails: true });
    await expect(
      createChromePromptApi(api, "157").download(EN_JA, () => {}),
    ).rejects.toThrow("No");
  });
});

describe("session", () => {
  const signal = () => new AbortController().signal;

  it("clones one base session holding the instructions for every prompt", async () => {
    const { api, log } = fakeModel();
    const provider = createChromePromptApi(api, "157");
    const first = await provider.session(EN_JA, "Be brief.", signal());
    const second = await provider.session(EN_JA, "Be brief.", signal());
    expect(log.creates).toHaveLength(1);
    expect(log.creates[0]).toMatchObject({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["ja"] }],
      initialPrompts: [{ role: "system", content: "Be brief." }],
    });
    expect(log.clones).toBe(2);

    expect(await first.prompt("Term: bank", ANSWER_SCHEMA, signal())).toBe(
      '{"meaning":"土手"}',
    );
    expect(log.prompts).toEqual([
      { text: "Term: bank", schema: ANSWER_SCHEMA },
    ]);
    first.destroy();
    expect(log.sessions[1]!.destroyed).toBe(true);
    expect(log.sessions[0]!.destroyed).toBe(false);
    second.destroy();
  });

  it("makes a new base for other instructions and destroys the old one", async () => {
    const { api, log } = fakeModel();
    const provider = createChromePromptApi(api, "157");
    await provider.session(EN_JA, "One.", signal());
    await provider.session({ learning: "es", native: "en" }, "Two.", signal());
    expect(log.creates).toHaveLength(2);
    await vi.waitFor(() => expect(log.sessions[0]!.destroyed).toBe(true));
  });

  it.each([
    ["current", false],
    ["older", true],
  ])("counts tokens and the budget with the %s names", async (_names, old) => {
    const { api } = fakeModel({ old });
    const provider = createChromePromptApi(api, "157");
    const session = await provider.session(EN_JA, "x".repeat(400), signal());
    // The window less what the instructions take.
    expect(session.budget).toBe(9216 - 100);
    expect(await session.measure("y".repeat(40))).toBe(10);
  });

  it("stops a prompt when its signal aborts", async () => {
    const { api } = fakeModel({ hang: true });
    const provider = createChromePromptApi(api, "157");
    const controller = new AbortController();
    const session = await provider.session(EN_JA, "Be brief.", signal());
    const answer = session.prompt(
      "Term: bank",
      ANSWER_SCHEMA,
      controller.signal,
    );
    controller.abort(new DOMException("Aborted", "AbortError"));
    await expect(answer).rejects.toThrow("Aborted");
  });

  it("stops waiting for the base when aborted, and keeps it for the next prompt", async () => {
    const { api, log } = fakeModel();
    const provider = createChromePromptApi(api, "157");
    const controller = new AbortController();
    controller.abort(new DOMException("Aborted", "AbortError"));
    await expect(
      provider.session(EN_JA, "Be brief.", controller.signal),
    ).rejects.toThrow("Aborted");
    await provider.session(EN_JA, "Be brief.", signal());
    expect(log.creates).toHaveLength(1);
  });

  it("tells while the base session is being created, and not once it is", async () => {
    let load!: () => void;
    const { api, log } = fakeModel({
      loaded: new Promise<void>((resolve) => (load = resolve)),
    });
    const provider = createChromePromptApi(api, "157");
    const told: boolean[] = [];
    const first = provider.session(EN_JA, "Be brief.", signal(), (s) =>
      told.push(s),
    );
    expect(told).toEqual([true]);
    await Promise.resolve();
    expect(told).toEqual([true]);
    load();
    await first;
    expect(told).toEqual([true, false]);
    expect(log.clones).toBe(1);

    // A clone of the base the model has made: nothing to tell.
    const later: boolean[] = [];
    await provider.session(EN_JA, "Be brief.", signal(), (s) => later.push(s));
    expect(later).toEqual([]);
  });

  it("stops telling when aborted, and tells the next prompt that waits for the same base", async () => {
    let load!: () => void;
    const { api, log } = fakeModel({
      loaded: new Promise<void>((resolve) => (load = resolve)),
    });
    const provider = createChromePromptApi(api, "157");
    const controller = new AbortController();
    const told: boolean[] = [];
    const aborted = provider.session(
      EN_JA,
      "Be brief.",
      controller.signal,
      (s) => told.push(s),
    );
    controller.abort(new DOMException("Aborted", "AbortError"));
    await expect(aborted).rejects.toThrow("Aborted");

    const next: boolean[] = [];
    const waiting = provider.session(EN_JA, "Be brief.", signal(), (s) =>
      next.push(s),
    );
    load();
    await waiting;
    expect(told).toEqual([true]);
    expect(next).toEqual([true, false]);
    expect(log.creates).toHaveLength(1);
  });

  it("makes the base again after it failed", async () => {
    let fail = true;
    const { api, log } = fakeModel();
    const create = api.create.bind(api);
    api.create = async (o) => {
      if (fail) {
        fail = false;
        throw new Error("model gone");
      }
      return create(o);
    };
    const provider = createChromePromptApi(api, "157");
    await expect(
      provider.session(EN_JA, "Be brief.", signal()),
    ).rejects.toThrow("model gone");
    await provider.session(EN_JA, "Be brief.", signal());
    expect(log.clones).toBe(1);
  });
});
