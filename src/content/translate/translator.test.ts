import { describe, expect, it, vi } from "vitest";
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  downloadModelsOnFirstActivation,
  downloadTranslationModels,
  type ModelDownload,
  type TranslatorGlobal,
} from "./translator";

function fakeGlobal(
  availability: string,
  options: { active?: boolean; translate?: (text: string) => string } = {},
) {
  const create = vi.fn(async () => ({
    translate: async (text: string) =>
      (options.translate ?? ((s) => `ja(${s})`))(text),
  }));
  const g: TranslatorGlobal = {
    Translator: {
      availability: vi.fn(async () => availability),
      create,
    },
    navigator: { userActivation: { isActive: options.active ?? false } },
  };
  return { g, create };
}

describe("createBuiltInTranslator", () => {
  it("translates with the built-in translator, created once on first use", async () => {
    const { g, create } = fakeGlobal("available");
    const translator = createBuiltInTranslator("en", "ja", g);
    expect(create).not.toHaveBeenCalled();
    expect(await translator.translate("figure out")).toBe("ja(figure out)");
    expect(await translator.translate("from scratch")).toBe("ja(from scratch)");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "ja",
    });
    expect(g.Translator!.availability).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "ja",
    });
  });

  it("gives nothing without a translator or when the pair is unavailable", async () => {
    expect(
      await createBuiltInTranslator("en", "ja", {}).translate("figure out"),
    ).toBeUndefined();
    const { g, create } = fakeGlobal("unavailable");
    expect(
      await createBuiltInTranslator("en", "ja", g).translate("figure out"),
    ).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("downloads the model only inside a user activation", async () => {
    const { g, create } = fakeGlobal("downloadable");
    const translator = createBuiltInTranslator("en", "ja", g);
    expect(await translator.translate("figure out")).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    g.navigator!.userActivation!.isActive = true;
    expect(await translator.translate("figure out")).toBe("ja(figure out)");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not download the model when opened without downloads, even inside a user activation", async () => {
    const { g, create } = fakeGlobal("downloadable", { active: true });
    const translator = createBuiltInTranslator("en", "ja", g);
    expect(await translator.open!({ download: false })).toBe(false);
    expect(create).not.toHaveBeenCalled();
    // Opened by a click (the dictionary window), it is ready for every request.
    expect(await translator.open!()).toBe(true);
    expect(await translator.open!({ download: false })).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("opens without downloads when the model is there", async () => {
    const { g, create } = fakeGlobal("available");
    const translator = createBuiltInTranslator("en", "ja", g);
    expect(await translator.open!({ download: false })).toBe(true);
    expect(await translator.translate("figure out")).toBe("ja(figure out)");
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      await createBuiltInTranslator("en", "ja", {}).open!({ download: false }),
    ).toBe(false);
  });

  it("gives nothing when translating fails", async () => {
    const { g } = fakeGlobal("available", {
      translate: () => {
        throw new Error("boom");
      },
    });
    expect(
      await createBuiltInTranslator("en", "ja", g).translate("figure out"),
    ).toBeUndefined();
  });
});

describe("createBuiltInTranslator().open", () => {
  it("is ready once the translator is created, which happens once", async () => {
    const { g, create } = fakeGlobal("available");
    const translator = createBuiltInTranslator("en", "ja", g);
    expect(await translator.open!()).toBe(true);
    expect(await translator.translate("figure out")).toBe("ja(figure out)");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("is not ready without the API, for an unavailable pair, or without a user activation for a download", async () => {
    expect(await createBuiltInTranslator("en", "ja", {}).open!()).toBe(false);
    expect(
      await createBuiltInTranslator("en", "ja", fakeGlobal("unavailable").g)
        .open!(),
    ).toBe(false);
    const { g, create } = fakeGlobal("downloadable");
    const translator = createBuiltInTranslator("en", "ja", g);
    expect(await translator.open!()).toBe(false);
    expect(create).not.toHaveBeenCalled();
    g.navigator!.userActivation!.isActive = true;
    expect(await translator.open!()).toBe(true);
  });

  it("waits while the model downloads", async () => {
    let finish!: () => void;
    const g: TranslatorGlobal = {
      Translator: {
        availability: async () => "downloadable",
        create: () =>
          new Promise((resolve) => {
            finish = () =>
              resolve({ translate: async (text) => `ja(${text})` });
          }),
      },
      navigator: { userActivation: { isActive: true } },
    };
    const translator = createBuiltInTranslator("en", "ja", g);
    let opened: boolean | undefined;
    void translator.open!().then((ready) => (opened = ready));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(opened).toBeUndefined();
    finish();
    await expect.poll(() => opened).toBe(true);
  });
});

describe("builtInTranslatorAvailable", () => {
  it("is true when the pair is available or can be downloaded", async () => {
    for (const availability of ["available", "downloadable", "downloading"])
      expect(
        await builtInTranslatorAvailable(
          "en",
          "ja",
          fakeGlobal(availability).g,
        ),
      ).toBe(true);
  });

  it("is false without the API, for an unavailable pair, or when it fails", async () => {
    expect(await builtInTranslatorAvailable("en", "ja", {})).toBe(false);
    expect(
      await builtInTranslatorAvailable("en", "ja", fakeGlobal("unavailable").g),
    ).toBe(false);
    const { g } = fakeGlobal("available");
    g.Translator!.availability = vi.fn(async () => {
      throw new Error("no");
    });
    expect(await builtInTranslatorAvailable("en", "ja", g)).toBe(false);
  });
});

describe("downloadTranslationModels", () => {
  function recording(availability: (from: string, to: string) => string) {
    const created: string[] = [];
    const g: TranslatorGlobal = {
      Translator: {
        availability: async ({ sourceLanguage, targetLanguage }) =>
          availability(sourceLanguage, targetLanguage),
        create: async ({ sourceLanguage, targetLanguage }) => {
          created.push(`${sourceLanguage}>${targetLanguage}`);
          return { translate: async (text: string) => text };
        },
      },
    };
    return { g, created };
  }

  it("starts the download of the definitions' model and the subtitles' model", async () => {
    const { g, created } = recording(() => "downloadable");
    await downloadTranslationModels("es", "ja", g);
    expect(created).toEqual(["en>ja", "es>ja"]);
  });

  it("starts one download when the learning language is English", async () => {
    const { g, created } = recording(() => "downloadable");
    await downloadTranslationModels("en", "ja", g);
    expect(created).toEqual(["en>ja"]);
  });

  it("downloads nothing into English, nor what is there or cannot be had", async () => {
    const { g, created } = recording((from) =>
      from === "es" ? "available" : "unavailable",
    );
    await downloadTranslationModels("es", "en", g);
    await downloadTranslationModels("es", "ja", g);
    await downloadTranslationModels("en", "ja", g);
    expect(created).toEqual([]);
  });

  it("does nothing without the API, and ignores its errors", async () => {
    await downloadTranslationModels("en", "ja", {});
    const g: TranslatorGlobal = {
      Translator: {
        availability: async () => "downloadable",
        create: async () => {
          throw new Error("NotAllowedError");
        },
      },
    };
    await expect(downloadTranslationModels("en", "ja", g)).resolves.toBe(
      undefined,
    );
  });
});

/** A Translator whose `create()` reports the download through its monitor when told. */
function downloading(availability: { value: string }, active = true) {
  const monitors: EventTarget[] = [];
  const created: string[] = [];
  const g: TranslatorGlobal = {
    Translator: {
      availability: async () => availability.value,
      create: async (options) => {
        created.push(`${options.sourceLanguage}>${options.targetLanguage}`);
        const monitor = new EventTarget();
        options.monitor?.(monitor);
        monitors.push(monitor);
        return { translate: async (text: string) => `ja(${text})` };
      },
    },
    navigator: { userActivation: { isActive: active } },
  };
  const progress = (loaded: number) => {
    for (const monitor of monitors)
      monitor.dispatchEvent(
        Object.assign(new Event("downloadprogress"), { loaded }),
      );
  };
  return { g, created, progress };
}

describe("createBuiltInTranslator().watchDownload", () => {
  it("tells that the model is still to come, then how much of it has downloaded", async () => {
    const availability = { value: "downloadable" };
    const { g, progress } = downloading(availability);
    const translator = createBuiltInTranslator("en", "ja", g);
    const seen: (ModelDownload | undefined)[] = [];
    const unwatch = translator.watchDownload!((download) =>
      seen.push(download),
    );
    await expect.poll(() => seen).toEqual([{}]);
    await translator.open!();
    progress(0.25);
    progress(1);
    expect(seen).toEqual([{}, { share: 0.25 }, { share: 1 }]);
    unwatch();
    progress(1);
    expect(seen).toHaveLength(3);
  });

  it("hears a download another part of the page started (the first click)", async () => {
    const availability = { value: "downloadable" };
    const { g, progress } = downloading(availability);
    await downloadTranslationModels("en", "ja", g);
    availability.value = "downloading";
    progress(0.5);
    const seen: (ModelDownload | undefined)[] = [];
    createBuiltInTranslator("en", "ja", g).watchDownload!((download) =>
      seen.push(download),
    );
    await expect.poll(() => seen).toEqual([{ share: 0.5 }]);
  });

  it("tells nothing is coming when the model is there or cannot be had, or without the API", async () => {
    for (const value of ["available", "unavailable"]) {
      const { g } = downloading({ value });
      const seen: (ModelDownload | undefined)[] = [];
      createBuiltInTranslator("en", "ja", g).watchDownload!((download) =>
        seen.push(download),
      );
      await expect.poll(() => seen).toEqual([undefined]);
    }
    const seen: unknown[] = [];
    createBuiltInTranslator("en", "ja", {}).watchDownload!((download) =>
      seen.push(download),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toEqual([]);
  });
});

describe("downloadModelsOnFirstActivation", () => {
  const languages = () => ({ learning: "en", native: "ja" });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  it("starts the downloads at the first click, once, and never on hover", async () => {
    const { g, created } = downloading({ value: "downloadable" });
    const page = new EventTarget();
    downloadModelsOnFirstActivation(page, languages, {}, g);
    for (const type of ["pointerover", "pointermove", "mouseover"])
      page.dispatchEvent(new Event(type));
    await settle();
    expect(created).toEqual([]);
    page.dispatchEvent(new Event("pointerdown"));
    await expect.poll(() => created).toEqual(["en>ja"]);
    page.dispatchEvent(new Event("pointerdown"));
    page.dispatchEvent(new Event("keydown"));
    await settle();
    expect(created).toEqual(["en>ja"]);
  });

  it("waits for the input that gives the activation (a tap's pointerup)", async () => {
    const { g, created } = downloading({ value: "downloadable" }, false);
    const page = new EventTarget();
    downloadModelsOnFirstActivation(page, languages, {}, g);
    page.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(created).toEqual([]);
    g.navigator!.userActivation!.isActive = true;
    page.dispatchEvent(new Event("pointerup"));
    await expect.poll(() => created).toEqual(["en>ja"]);
  });

  it("arms a page once, and again after the disarm", async () => {
    const { g, created } = downloading({ value: "downloadable" });
    const page = new EventTarget();
    const disarm = downloadModelsOnFirstActivation(page, languages, {}, g);
    downloadModelsOnFirstActivation(page, languages, {}, g);
    disarm();
    page.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(created).toEqual([]);
    downloadModelsOnFirstActivation(page, languages, {}, g);
    page.dispatchEvent(new Event("pointerdown"));
    await expect.poll(() => created).toEqual(["en>ja"]);
  });

  it("starts at once in a page a click just opened (the toolbar popup)", async () => {
    const { g, created } = downloading({ value: "downloadable" });
    downloadModelsOnFirstActivation(
      new EventTarget(),
      languages,
      { now: true },
      g,
    );
    await expect.poll(() => created).toEqual(["en>ja"]);
    const idle = downloading({ value: "downloadable" }, false);
    downloadModelsOnFirstActivation(
      new EventTarget(),
      languages,
      { now: true },
      idle.g,
    );
    await settle();
    expect(idle.created).toEqual([]);
  });

  it("downloads nothing that is there already, and nothing without the API", async () => {
    const { g, created } = downloading({ value: "available" });
    const page = new EventTarget();
    downloadModelsOnFirstActivation(page, languages, {}, g);
    page.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(created).toEqual([]);
    const bare = new EventTarget();
    const listen = vi.spyOn(bare, "addEventListener");
    downloadModelsOnFirstActivation(bare, languages, {}, {});
    expect(listen).not.toHaveBeenCalled();
  });
});
