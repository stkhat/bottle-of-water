import { describe, expect, it, vi } from "vitest";
import { createTranslationQueue } from "./queue";
import type { TranslationProvider } from "./translator";

const EN_JA = { from: "en", to: "ja" };

/**
 * A translator that holds every translation until it is released, recording the
 * texts in the order they were started.
 */
function heldTranslator() {
  const started: string[] = [];
  const held: (() => void)[] = [];
  const provider: TranslationProvider = {
    translate(text) {
      started.push(text);
      return new Promise((resolve) => held.push(() => resolve(`ja(${text})`)));
    },
  };
  return {
    provider,
    started,
    /** Lets the oldest held translation finish. */
    async releaseOne() {
      held.shift()?.();
      await flush();
    },
    async releaseAll() {
      while (held.length > 0) await this.releaseOne();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createTranslationQueue", () => {
  it("translates one text at a time", async () => {
    const t = heldTranslator();
    const queue = createTranslationQueue(() => t.provider);
    const a = queue.translate("A cat.", "hover", EN_JA);
    const b = queue.translate("A dog.", "hover", EN_JA);
    await flush();
    expect(t.started).toEqual(["A cat."]);
    await t.releaseOne();
    expect(await a).toBe("ja(A cat.)");
    expect(t.started).toEqual(["A cat.", "A dog."]);
    await t.releaseOne();
    expect(await b).toBe("ja(A dog.)");
  });

  it("takes the subtitle line first, then the window, then the hover card, in order within each", async () => {
    const t = heldTranslator();
    const queue = createTranslationQueue(() => t.provider);
    const first = queue.translate("first", "hover", EN_JA);
    await flush();
    const all = [
      first,
      queue.translate("hover 1", "hover", EN_JA),
      queue.translate("window 1", "window", EN_JA),
      queue.translate("hover 2", "hover", EN_JA),
      queue.translate("subtitle 1", "subtitle", EN_JA),
      queue.translate("window 2", "window", EN_JA),
      queue.translate("subtitle 2", "subtitle", EN_JA),
    ];
    await flush();
    await t.releaseAll();
    await Promise.all(all);
    expect(t.started).toEqual([
      "first",
      "subtitle 1",
      "subtitle 2",
      "window 1",
      "window 2",
      "hover 1",
      "hover 2",
    ]);
  });

  it("shares one translation between requests for the same text", async () => {
    const t = heldTranslator();
    const queue = createTranslationQueue(() => t.provider);
    const a = queue.translate("To reveal a secret.", "hover", EN_JA);
    const b = queue.translate("To reveal a secret.", "window", EN_JA);
    await flush();
    await t.releaseAll();
    expect(await a).toBe("ja(To reveal a secret.)");
    expect(await b).toBe("ja(To reveal a secret.)");
    // Once translated, the text is not translated again.
    expect(await queue.translate("To reveal a secret.", "hover", EN_JA)).toBe(
      "ja(To reveal a secret.)",
    );
    expect(t.started).toEqual(["To reveal a secret."]);
  });

  it("moves a waiting text up when it is asked for at a higher priority", async () => {
    const t = heldTranslator();
    const queue = createTranslationQueue(() => t.provider);
    const first = queue.translate("first", "hover", EN_JA);
    await flush();
    const all = [
      first,
      queue.translate("window", "window", EN_JA),
      queue.translate("shared", "hover", EN_JA),
      queue.translate("shared", "subtitle", EN_JA),
    ];
    await flush();
    await t.releaseAll();
    await Promise.all(all);
    expect(t.started).toEqual(["first", "shared", "window"]);
  });

  it("translates each language pair with its own translator, created once", async () => {
    const create = vi.fn((from: string, to: string): TranslationProvider => ({
      translate: async (text) => `${from}>${to}(${text})`,
    }));
    const queue = createTranslationQueue(create);
    expect(
      await queue.translate("casa", "hover", { from: "es", to: "ja" }),
    ).toBe("es>ja(casa)");
    expect(await queue.translate("casa", "hover", EN_JA)).toBe("en>ja(casa)");
    expect(
      await queue.translate("perro", "hover", { from: "es", to: "ja" }),
    ).toBe("es>ja(perro)");
    expect(create.mock.calls).toEqual([
      ["es", "ja"],
      ["en", "ja"],
    ]);
  });

  it("asks again for a text that got no translation, and goes on after a failure", async () => {
    let calls = 0;
    const queue = createTranslationQueue(() => ({
      async translate(text) {
        calls++;
        if (text === "boom") throw new Error("boom");
        return calls === 1 ? undefined : `ja(${text})`;
      },
    }));
    expect(await queue.translate("A cat.", "hover", EN_JA)).toBeUndefined();
    expect(await queue.translate("boom", "hover", EN_JA)).toBeUndefined();
    expect(await queue.translate("A cat.", "hover", EN_JA)).toBe("ja(A cat.)");
    expect(calls).toBe(3);
  });

  it("lets other pairs translate while a pair's translator is still opening", async () => {
    let openEnJa!: (ready: boolean) => void;
    // One download for the pair, however often it is asked to open.
    const download = new Promise<boolean>((resolve) => (openEnJa = resolve));
    const started: string[] = [];
    const translate = async (text: string) => {
      started.push(text);
      return `t(${text})`;
    };
    const queue = createTranslationQueue((from) =>
      from === "en"
        ? {
            // The model downloads (or never comes, in Playwright's Chromium).
            open: () => download,
            translate,
          }
        : { open: async () => true, translate },
    );
    const ES_JA = { from: "es", to: "ja" };
    const definitions = [
      queue.translate("hover 1", "hover", EN_JA),
      queue.translate("window 1", "window", EN_JA),
      queue.translate("hover 2", "hover", EN_JA),
    ];
    expect(await queue.translate("Hola.", "subtitle", ES_JA)).toBe("t(Hola.)");
    expect(await queue.translate("Adiós.", "subtitle", ES_JA)).toBe(
      "t(Adiós.)",
    );
    expect(started).toEqual(["Hola.", "Adiós."]);

    // Ready: what waited goes through the queue in priority order.
    openEnJa(true);
    expect(await Promise.all(definitions)).toEqual([
      "t(hover 1)",
      "t(window 1)",
      "t(hover 2)",
    ]);
    expect(started).toEqual([
      "Hola.",
      "Adiós.",
      "window 1",
      "hover 1",
      "hover 2",
    ]);
  });

  it("gives nothing for a pair whose translator cannot open, and asks again later", async () => {
    let ready = false;
    const translate = vi.fn(async (text: string) => `ja(${text})`);
    const queue = createTranslationQueue(() => ({
      open: async () => ready,
      translate,
    }));
    expect(await queue.translate("A cat.", "hover", EN_JA)).toBeUndefined();
    expect(translate).not.toHaveBeenCalled();
    ready = true;
    expect(await queue.translate("A cat.", "window", EN_JA)).toBe("ja(A cat.)");
  });
});
