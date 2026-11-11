import { describe, expect, it, vi } from "vitest";
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  downloadTranslationModels,
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
