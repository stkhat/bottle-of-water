import { describe, expect, it, vi } from "vitest";
import { createBuiltInTranslator, type TranslatorGlobal } from "./translate";

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
