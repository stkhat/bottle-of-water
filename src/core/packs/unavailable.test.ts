import { describe, expect, it } from "vitest";
import { allOf, PacksUnavailableError } from "./unavailable";

describe("PacksUnavailableError", () => {
  it("names the packs", () => {
    const error = new PacksUnavailableError(["es", "es-en"]);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PacksUnavailableError");
    expect(error.message).toBe("Language data not available: es, es-en");
    expect(error.packs).toEqual(["es", "es-en"]);
  });
});

describe("allOf", () => {
  const missing = (...packs: string[]) =>
    Promise.reject(new PacksUnavailableError(packs));

  it("gives every value, in order", async () => {
    expect(await allOf([Promise.resolve(1), Promise.resolve("two")])).toEqual([
      1,
      "two",
    ]);
  });

  it("names every missing pack once", async () => {
    await expect(
      allOf([missing("es"), Promise.resolve(1), missing("es", "es-en")]),
    ).rejects.toMatchObject({ packs: ["es", "es-en"] });
  });

  it("throws any other failure first", async () => {
    await expect(
      allOf([missing("es"), Promise.reject(new Error("disk full"))]),
    ).rejects.toThrow("disk full");
  });
});
